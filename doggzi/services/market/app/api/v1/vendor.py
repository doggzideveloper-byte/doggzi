"""Vendor panel API. The store is always resolved on the server from the signed-in console user (role VENDOR +
a vendor_members row); nothing in the request can choose a different store. Another store's orders and
listings are simply not found (404)."""
import csv
import hashlib
import hmac
import io
import re
import uuid
from datetime import date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ...core import cache, notify
from ...core.config import get_settings
from ...core.console import ConsoleUser, require_roles
from ...core.time import utcnow
from ...db import get_db
from ...models import Listing, Order, Product, ProductRequest, SubOrder, Vendor, VendorMember
from .logic import aware

router = APIRouter(prefix="/vendor", tags=["vendor panel"])
IST = ZoneInfo("Asia/Kolkata")
CATEGORIES = ("treats", "toys", "grooming", "walking", "health")
ACTIVE = ("accepted", "packed", "out_for_delivery")
CODE_TRIES = 5


# ---------- who am I ----------
class Me:
    def __init__(self, user: ConsoleUser, member: VendorMember, vendor: Vendor):
        self.user, self.member, self.vendor = user, member, vendor


def me(u: ConsoleUser = Depends(require_roles("VENDOR")), db: Session = Depends(get_db)) -> Me:
    m = db.scalar(select(VendorMember).where(VendorMember.user_id == u.id))
    v = db.get(Vendor, m.vendor_id) if m else None
    if not m or not v or not v.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No store is linked to this login. Ask Doggzi OPS to set it up.")
    return Me(u, m, v)


def _bust() -> None:
    cache.delete_prefix("market:")  # catalog / browse caches show stock, prices and holiday mode


def mask(phone: str | None) -> str:
    d = "".join(c for c in (phone or "") if c.isdigit())[-10:]
    return f"{d[:2]}xxxxxx{d[-2:]}" if len(d) == 10 else "xxxxxxxxxx"


# ---------- delivery codes (optional; HMAC-derived so the customer's order page can show it later) ----------
def _key() -> bytes:
    s = get_settings()
    return (s.code_secret or s.auth_jwt_secret or "dev").encode()


def delivery_code(sub_order_id: uuid.UUID) -> str:
    n = int.from_bytes(hmac.new(_key(), f"delivery:{sub_order_id}".encode(), hashlib.sha256).digest()[:4], "big")
    return f"{n % 10000:04d}"


# ---------- sub-orders ----------
class ItemOut(BaseModel):
    sku: str
    name: str
    qty: int
    price_paise: int


class SubOrderOut(BaseModel):
    id: uuid.UUID
    ref: str
    status: str
    placed_at: datetime
    accept_by: datetime | None
    items: list[ItemOut]
    pet: dict | None
    area: str
    address: dict | None
    customer_phone: str
    phone_visible: bool
    subtotal_paise: int
    delivery_fee_paise: int
    pack_checks: list[bool]
    reject_reason: str | None
    code_locked: bool
    demo_code: str | None = None


def _area(o: Order) -> str:
    a = o.address_json or {}
    return ", ".join(x for x in [a.get("line2"), a.get("city")] if x) or a.get("pincode", "")


def _out(so: SubOrder) -> SubOrderOut:
    o = so.order
    visible = so.status in ACTIVE
    return SubOrderOut(
        id=so.id, ref="SO-" + str(so.id)[:4].upper(), status=so.status, placed_at=aware(so.created_at), accept_by=aware(so.sla_due_at) if so.sla_due_at else None,
        items=[ItemOut(sku=i.listing.sku, name=i.listing.product.name, qty=i.qty, price_paise=i.price_paise_at_order) for i in so.items],
        pet=o.pet_snapshot, area=_area(o), address=o.address_json if visible else None,
        customer_phone=(o.customer_phone or "") if visible else mask(o.customer_phone), phone_visible=visible,
        subtotal_paise=so.subtotal_paise, delivery_fee_paise=so.delivery_fee_paise, pack_checks=list(so.pack_checks or [False] * len(so.items)),
        reject_reason=so.reject_reason, code_locked=so.delivery_code_attempts >= CODE_TRIES,
        demo_code=delivery_code(so.id) if get_settings().seed_demo and so.status == "out_for_delivery" else None,
    )


def sweep_missed(db: Session, vendor_id: uuid.UUID | None = None) -> None:
    """New sub-orders not accepted in time go to OPS (status missed)."""
    q = select(SubOrder).where(SubOrder.status == "placed", SubOrder.sla_due_at <= utcnow())
    if vendor_id:
        q = q.where(SubOrder.vendor_id == vendor_id)
    rows = db.scalars(q).all()
    for so in rows:
        so.status = "missed"
    if rows:
        db.commit()


@router.get("/sub-orders", response_model=list[SubOrderOut], summary="My store's open sub-orders (New / Packing / Ready / Out), or by status")
def sub_orders(status_: str | None = Query(default=None, alias="status"), m: Me = Depends(me), db: Session = Depends(get_db)) -> list[SubOrderOut]:
    sweep_missed(db, m.vendor.id)
    q = select(SubOrder).where(SubOrder.vendor_id == m.vendor.id)
    q = q.where(SubOrder.status == status_) if status_ else q.where(SubOrder.status.in_(("placed",) + ACTIVE))
    return [_out(so) for so in db.scalars(q.order_by(SubOrder.created_at)).all()]


def _mine(db: Session, m: Me, sid: uuid.UUID) -> SubOrder:
    so = db.scalar(select(SubOrder).where(SubOrder.id == sid, SubOrder.vendor_id == m.vendor.id).with_for_update(of=SubOrder))
    if not so:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return so


def _need(so: SubOrder, *states: str) -> None:
    if so.status == "missed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Too late to accept: this order went to Doggzi OPS")
    if so.status not in states:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This order is '{so.status}', not ready for that step")


class RejectIn(BaseModel):
    reason: Literal["Out of stock", "Shop closed", "Too far"]


class PackIn(BaseModel):
    checks: list[bool] = Field(max_length=50)


class DeliveredIn(BaseModel):
    code: str | None = Field(default=None, pattern=r"^\d{4}$")


@router.post("/sub-orders/{sid}/accept", response_model=SubOrderOut)
def accept(sid: uuid.UUID, m: Me = Depends(me), db: Session = Depends(get_db)) -> SubOrderOut:
    sweep_missed(db, m.vendor.id)
    so = _mine(db, m, sid)
    _need(so, "placed")
    so.status, so.accepted_at, so.pack_checks = "accepted", utcnow(), [False] * len(so.items)
    db.commit()
    notify.send("whatsapp", so.order.customer_phone, "order_accepted", {"store": m.vendor.name})
    return _out(so)


@router.post("/sub-orders/{sid}/reject", response_model=SubOrderOut, summary="Reject with a reason; goes to OPS to reassign or refund")
def reject(sid: uuid.UUID, body: RejectIn, m: Me = Depends(me), db: Session = Depends(get_db)) -> SubOrderOut:
    so = _mine(db, m, sid)
    _need(so, "placed")
    so.status, so.reject_reason = "rejected", body.reason
    # Stock comes back to the shelf.
    for it in so.items:
        it.listing.stock_qty += it.qty
    db.commit()
    _bust()
    return _out(so)


@router.post("/sub-orders/{sid}/checks", response_model=SubOrderOut, summary="Packing checklist")
def checks(sid: uuid.UUID, body: PackIn, m: Me = Depends(me), db: Session = Depends(get_db)) -> SubOrderOut:
    so = _mine(db, m, sid)
    _need(so, "accepted")
    if len(body.checks) != len(so.items):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Checklist length doesn't match the order")
    so.pack_checks = body.checks
    db.commit()
    return _out(so)


@router.post("/sub-orders/{sid}/packed", response_model=SubOrderOut)
def packed(sid: uuid.UUID, m: Me = Depends(me), db: Session = Depends(get_db)) -> SubOrderOut:
    so = _mine(db, m, sid)
    _need(so, "accepted")
    if not so.pack_checks or not all(so.pack_checks):
        raise HTTPException(status.HTTP_409_CONFLICT, "Tick every item first")
    so.status, so.packed_at = "packed", utcnow()
    db.commit()
    return _out(so)


@router.post("/sub-orders/{sid}/out", response_model=SubOrderOut, summary="Out for delivery")
def out(sid: uuid.UUID, m: Me = Depends(me), db: Session = Depends(get_db)) -> SubOrderOut:
    so = _mine(db, m, sid)
    _need(so, "packed")
    so.status, so.out_at = "out_for_delivery", utcnow()
    db.commit()
    notify.send("whatsapp", so.order.customer_phone, "order_out_for_delivery", {"store": m.vendor.name})
    return _out(so)


@router.post("/sub-orders/{sid}/delivered", response_model=SubOrderOut, summary="Delivered (optional 4-digit code from the customer, 5 tries); payout released")
def delivered(sid: uuid.UUID, body: DeliveredIn, m: Me = Depends(me), db: Session = Depends(get_db)) -> SubOrderOut:
    so = _mine(db, m, sid)
    _need(so, "out_for_delivery")
    if body.code:
        if so.delivery_code_attempts >= CODE_TRIES:
            raise HTTPException(status.HTTP_423_LOCKED, "Code locked after 5 tries. Ask Doggzi OPS.")
        if not hmac.compare_digest(body.code, delivery_code(so.id)):
            so.delivery_code_attempts += 1
            db.commit()
            left = CODE_TRIES - so.delivery_code_attempts
            if left <= 0:
                raise HTTPException(status.HTTP_423_LOCKED, "Code locked after 5 tries. Ask Doggzi OPS.")
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Wrong code. {left} {'try' if left == 1 else 'tries'} left.")
    so.status, so.delivered_at, so.payout_status = "delivered", utcnow(), "released"
    db.commit()
    notify.send("whatsapp", so.order.customer_phone, "order_delivered", {"store": m.vendor.name})
    return _out(so)


# ---------- listings ----------
class ListingOut(BaseModel):
    id: uuid.UUID
    sku: str
    product_id: uuid.UUID
    name: str
    brand: str
    category: str
    pet_types: list[str]
    price_paise: int
    mrp_paise: int | None
    stock_qty: int
    is_active: bool
    photo_status: str
    photo_url: str | None


class ListingIn(BaseModel):
    product_id: uuid.UUID
    price_paise: int = Field(gt=0, le=10_000_000)
    mrp_paise: int | None = Field(default=None, gt=0, le=10_000_000)
    stock_qty: int = Field(default=0, ge=0, le=9999)

    @model_validator(mode="after")
    def _mrp(self):
        if self.mrp_paise is not None and self.mrp_paise < self.price_paise:
            raise ValueError("MRP can't be lower than your price")
        return self


class ListingPatch(BaseModel):
    price_paise: int | None = Field(default=None, gt=0, le=10_000_000)
    mrp_paise: int | None = Field(default=None, ge=0, le=10_000_000, description="0 clears the MRP")
    stock_qty: int | None = Field(default=None, ge=0, le=9999)
    is_active: bool | None = None


def _l(x: Listing) -> ListingOut:
    p = x.product
    return ListingOut(id=x.id, sku=x.sku, product_id=p.id, name=p.name, brand=p.brand, category=p.category, pet_types=list(p.pet_types or []), price_paise=x.price_paise,
                      mrp_paise=x.mrp_paise, stock_qty=x.stock_qty, is_active=x.is_active, photo_status=x.photo_status, photo_url=x.photo_url)


def _my_listing(db: Session, m: Me, lid: uuid.UUID) -> Listing:
    x = db.scalar(select(Listing).where(Listing.id == lid, Listing.vendor_id == m.vendor.id))
    if not x:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return x


@router.get("/listings", response_model=list[ListingOut], summary="All my store's listings")
def listings(m: Me = Depends(me), db: Session = Depends(get_db)) -> list[ListingOut]:
    rows = db.scalars(select(Listing).join(Listing.product).where(Listing.vendor_id == m.vendor.id).order_by(Product.popularity_rank, Listing.sku)).all()
    return [_l(x) for x in rows]


def _next_sku(db: Session, v: Vendor) -> str:
    prefix = "DZ-MKT" if v.is_doggzi else re.sub(r"[^A-Z0-9]", "", v.slug.upper())[:6] or "VND"
    n = len(db.scalars(select(Listing.id).where(Listing.vendor_id == v.id)).all()) + 1
    while db.scalar(select(Listing.id).where(Listing.vendor_id == v.id, Listing.sku == f"{prefix}-{n:03d}")):
        n += 1
    return f"{prefix}-{n:03d}"


@router.post("/listings", response_model=ListingOut, status_code=status.HTTP_201_CREATED, summary="List a Doggzi catalog product in my store")
def add_listing(body: ListingIn, m: Me = Depends(me), db: Session = Depends(get_db)) -> ListingOut:
    p = db.get(Product, body.product_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found in the Doggzi catalog")
    if db.scalar(select(Listing.id).where(Listing.vendor_id == m.vendor.id, Listing.product_id == p.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "You already sell this product")
    x = Listing(vendor_id=m.vendor.id, product_id=p.id, sku=_next_sku(db, m.vendor), price_paise=body.price_paise, mrp_paise=body.mrp_paise, stock_qty=body.stock_qty)
    db.add(x)
    db.commit()
    db.refresh(x)
    _bust()
    return _l(x)


@router.patch("/listings/{lid}", response_model=ListingOut, summary="Price, MRP, stock, active")
def patch_listing(lid: uuid.UUID, body: ListingPatch, m: Me = Depends(me), db: Session = Depends(get_db)) -> ListingOut:
    x = _my_listing(db, m, lid)
    price = body.price_paise if body.price_paise is not None else x.price_paise
    mrp = (body.mrp_paise or None) if body.mrp_paise is not None else x.mrp_paise
    if mrp is not None and mrp < price:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "MRP can't be lower than your price")
    x.price_paise, x.mrp_paise = price, mrp
    if body.stock_qty is not None:
        x.stock_qty = body.stock_qty
    if body.is_active is not None:
        x.is_active = body.is_active
    db.commit()
    _bust()
    return _l(x)


@router.post("/listings/{lid}/photos", response_model=ListingOut, summary="Own photo (square); goes to Doggzi for approval. Stored as metadata for now.")
async def listing_photo(lid: uuid.UUID, file: UploadFile = File(...), m: Me = Depends(me), db: Session = Depends(get_db)) -> ListingOut:
    x = _my_listing(db, m, lid)
    data = await file.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024 or not (file.content_type or "").startswith("image/"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Upload a photo under 8 MB")
    x.photo_status, x.photo_meta = "pending", {"name": file.filename, "size": len(data), "at": utcnow().isoformat()}
    db.commit()
    return _l(x)


class CatalogHit(BaseModel):
    product_id: uuid.UUID
    name: str
    brand: str
    category: str
    already_listed: bool


@router.get("/catalog", response_model=list[CatalogHit], summary="Search the Doggzi catalog before adding a product (avoids duplicates)")
def search_catalog(q: str = Query(min_length=2, max_length=60), m: Me = Depends(me), db: Session = Depends(get_db)) -> list[CatalogHit]:
    like = f"%{q.strip()}%"
    rows = db.scalars(select(Product).where(or_(Product.name.ilike(like), Product.brand.ilike(like))).order_by(Product.popularity_rank).limit(12)).all()
    mine = set(db.scalars(select(Listing.product_id).where(Listing.vendor_id == m.vendor.id)))
    return [CatalogHit(product_id=p.id, name=p.name, brand=p.brand, category=p.category, already_listed=p.id in mine) for p in rows]


class RequestIn(BaseModel):
    name: str = Field(min_length=3, max_length=200)
    brand: str | None = Field(default=None, max_length=80)
    category: str | None = None
    price_paise: int | None = Field(default=None, gt=0, le=10_000_000)

    @field_validator("category")
    @classmethod
    def _cat(cls, v):
        if v is not None and v not in CATEGORIES:
            raise ValueError("Unknown category")
        return v


@router.post("/product-requests", status_code=status.HTTP_201_CREATED, summary="Ask Doggzi to add a product to the catalog")
def request_product(body: RequestIn, m: Me = Depends(me), db: Session = Depends(get_db)) -> dict:
    r = ProductRequest(vendor_id=m.vendor.id, **body.model_dump())
    db.add(r)
    db.commit()
    return {"id": str(r.id), "status": r.status}


# ---------- CSV (same columns as marketplace_catalog_seed.csv, plus the store's own columns) ----------
CSV_COLS = ["row", "sku", "name", "brand_as_listed", "brand_suggested", "category", "pet_type", "price_inr", "price_paise", "status", "flags", "mrp_inr", "stock", "active"]


def _pet_type(p: Product) -> str:
    t = set(p.pet_types or [])
    return "both" if t >= {"dog", "cat"} else (next(iter(t)) if t else "dog")


@router.get("/listings/export.csv", summary="My listings as CSV (also the import template)")
def export_csv(m: Me = Depends(me), db: Session = Depends(get_db)) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_COLS)
    rows = db.scalars(select(Listing).join(Listing.product).where(Listing.vendor_id == m.vendor.id).order_by(Listing.sku)).all()
    for i, x in enumerate(rows, 1):
        p = x.product
        w.writerow([i, x.sku, p.name, p.brand_as_listed or p.brand, p.brand, p.category, _pet_type(p), f"{x.price_paise / 100:.2f}", x.price_paise,
                    "In-stock" if x.stock_qty > 0 else "Out-of-stock", ";".join(p.source_flags or []), f"{x.mrp_paise / 100:.2f}" if x.mrp_paise else "", x.stock_qty, "yes" if x.is_active else "no"])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{m.vendor.slug}-listings.csv"'})


class ImportOut(BaseModel):
    updated: int
    requested: int
    errors: list[str]


def _paise(row: dict, inr_key: str, paise_key: str | None = None) -> int | None:
    v = (row.get(paise_key) or "").strip() if paise_key else ""
    if v:
        return int(float(v))
    v = (row.get(inr_key) or "").replace("₹", "").replace(",", "").strip()
    return round(float(v) * 100) if v else None


@router.post("/listings/import", response_model=ImportOut, summary="Bulk update from CSV: known SKUs update price/MRP/stock/active; unknown rows become product requests")
async def import_csv(file: UploadFile = File(...), m: Me = Depends(me), db: Session = Depends(get_db)) -> ImportOut:
    raw = await file.read(2 * 1024 * 1024 + 1)
    if len(raw) > 2 * 1024 * 1024:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "CSV is larger than 2 MB")
    try:
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
        rows = list(reader)
    except (UnicodeDecodeError, csv.Error) as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That file isn't a readable CSV") from e
    if not reader.fieldnames or "sku" not in reader.fieldnames:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The CSV needs a 'sku' column. Use Export CSV template.")
    if len(rows) > 2000:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "At most 2,000 rows per import")
    mine = {x.sku: x for x in db.scalars(select(Listing).where(Listing.vendor_id == m.vendor.id))}  # only this store's listings can change
    updated = requested = 0
    errors: list[str] = []
    for n, row in enumerate(rows, 2):
        sku = (row.get("sku") or "").strip()
        try:
            price = _paise(row, "price_inr", "price_paise")
            mrp = _paise(row, "mrp_inr")
            stock = (row.get("stock") or "").strip()
            stock_n = int(stock) if stock else None
        except ValueError:
            errors.append(f"Row {n}: a price or stock value isn't a number")
            continue
        if price is not None and (price <= 0 or price > 10_000_000):
            errors.append(f"Row {n}: price out of range")
            continue
        if stock_n is not None and not 0 <= stock_n <= 9999:
            errors.append(f"Row {n}: stock must be 0-9999")
            continue
        x = mine.get(sku)
        if x is None:
            name = (row.get("name") or "").strip()
            if not name:
                errors.append(f"Row {n}: unknown SKU '{sku}' and no name to request")
                continue
            cat = (row.get("category") or "").strip().lower()
            db.add(ProductRequest(vendor_id=m.vendor.id, name=name[:200], brand=(row.get("brand_suggested") or row.get("brand_as_listed") or "").strip()[:80] or None,
                                  category=cat if cat in CATEGORIES else None, price_paise=price))
            requested += 1
            continue
        new_price = price if price is not None else x.price_paise
        new_mrp = mrp if mrp is not None else x.mrp_paise
        if new_mrp is not None and new_mrp < new_price:
            errors.append(f"Row {n} ({sku}): MRP is lower than the price")
            continue
        x.price_paise, x.mrp_paise = new_price, new_mrp
        if stock_n is not None:
            x.stock_qty = stock_n
        act = (row.get("active") or "").strip().lower()
        if act in ("yes", "no", "true", "false", "1", "0"):
            x.is_active = act in ("yes", "true", "1")
        updated += 1
    db.commit()
    _bust()
    return ImportOut(updated=updated, requested=requested, errors=errors[:50])


# ---------- payouts ----------
class PayoutRow(BaseModel):
    id: uuid.UUID
    ref: str
    date: datetime
    order_value_paise: int
    commission_paise: int
    delivery_fee_paise: int
    net_paise: int
    status: str


class PayoutsOut(BaseModel):
    on_hold_paise: int
    released_paise: int
    settled_paise: int
    commission_pct: float
    rows: list[PayoutRow]


def _payout_rows(db: Session, vendor_id: uuid.UUID, since: datetime | None = None, until: datetime | None = None) -> list[PayoutRow]:
    q = select(SubOrder).where(SubOrder.vendor_id == vendor_id, SubOrder.status.in_(ACTIVE + ("delivered",)))
    out = []
    for so in db.scalars(q.order_by(SubOrder.created_at.desc())).all():
        d = aware(so.created_at)
        if (since and d < since) or (until and d >= until):
            continue
        out.append(PayoutRow(id=so.id, ref="SO-" + str(so.id)[:4].upper(), date=d, order_value_paise=so.subtotal_paise, commission_paise=so.commission_paise,
                             delivery_fee_paise=so.delivery_fee_paise, net_paise=so.subtotal_paise - so.commission_paise + so.delivery_fee_paise, status=so.payout_status))
    return out


@router.get("/payouts", response_model=PayoutsOut, summary="Per sub-order: value, commission, delivery fee, net; on hold until delivered")
def payouts(m: Me = Depends(me), db: Session = Depends(get_db)) -> PayoutsOut:
    rows = _payout_rows(db, m.vendor.id)
    tot = lambda st: sum(r.net_paise for r in rows if r.status == st)  # noqa: E731
    return PayoutsOut(on_hold_paise=tot("on_hold"), released_paise=tot("released"), settled_paise=tot("settled"), commission_pct=m.vendor.commission_bps / 100, rows=rows[:200])


@router.get("/payouts/statement.csv", summary="Monthly statement (IST month, YYYY-MM)")
def statement(month: str = Query(pattern=r"^\d{4}-\d{2}$"), m: Me = Depends(me), db: Session = Depends(get_db)) -> Response:
    y, mo = map(int, month.split("-"))
    if not 1 <= mo <= 12:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Month must be 01-12")
    start = datetime.combine(date(y, mo, 1), time(0), IST)
    end = datetime.combine(date(y + (mo == 12), mo % 12 + 1, 1), time(0), IST)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["sub_order", "date_ist", "order_value_inr", "commission_inr", "delivery_fee_inr", "net_payout_inr", "status"])
    rows = _payout_rows(db, m.vendor.id, start, end)
    for r in rows:
        w.writerow([r.ref, r.date.astimezone(IST).strftime("%Y-%m-%d %H:%M"), f"{r.order_value_paise / 100:.2f}", f"{r.commission_paise / 100:.2f}",
                    f"{r.delivery_fee_paise / 100:.2f}", f"{r.net_paise / 100:.2f}", r.status])
    w.writerow(["TOTAL", "", f"{sum(r.order_value_paise for r in rows) / 100:.2f}", f"{sum(r.commission_paise for r in rows) / 100:.2f}",
                f"{sum(r.delivery_fee_paise for r in rows) / 100:.2f}", f"{sum(r.net_paise for r in rows) / 100:.2f}", ""])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{m.vendor.slug}-statement-{month}.csv"'})


# ---------- store profile + staff ----------
class StaffOut(BaseModel):
    name: str | None
    phone: str
    role: str
    is_me: bool


class StoreOut(BaseModel):
    id: uuid.UUID
    name: str
    story: str | None
    since_year: int | None
    hours_text: str | None
    holiday_mode: bool
    delivery_fee_paise: int
    serviceable_pincodes: list[str]
    photos: list[dict]
    low_stock_threshold: int
    commission_pct: float
    accept_minutes: int
    my_role: str
    staff: list[StaffOut]
    help_whatsapp: str | None
    demo: bool


class StorePatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    story: str | None = Field(default=None, max_length=90)
    since_year: int | None = Field(default=None, ge=1950, le=2100)
    hours_text: str | None = Field(default=None, max_length=80)
    holiday_mode: bool | None = None
    delivery_fee_paise: int | None = Field(default=None, ge=0, le=100_000)
    serviceable_pincodes: list[str] | None = Field(default=None, max_length=200)
    low_stock_threshold: int | None = Field(default=None, ge=0, le=99)

    @field_validator("serviceable_pincodes")
    @classmethod
    def _pins(cls, v):
        if v is not None and not all(re.fullmatch(r"\d{6}", p) for p in v):
            raise ValueError("Pincodes are 6 digits")
        return v


def _store(db: Session, m: Me) -> StoreOut:
    v = m.vendor
    staff = db.scalars(select(VendorMember).where(VendorMember.vendor_id == v.id).order_by(VendorMember.role.desc(), VendorMember.created_at)).all()
    s = get_settings()
    return StoreOut(
        id=v.id, name=v.name, story=v.story, since_year=v.since_year, hours_text=v.hours_text, holiday_mode=v.holiday_mode, delivery_fee_paise=v.delivery_fee_paise,
        serviceable_pincodes=list(v.serviceable_pincodes or []), photos=list(v.photos or []), low_stock_threshold=v.low_stock_threshold, commission_pct=v.commission_bps / 100,
        accept_minutes=s.accept_sla_minutes, my_role=m.member.role, help_whatsapp=s.ops_whatsapp or None, demo=s.seed_demo,
        staff=[StaffOut(name=x.name, phone=x.phone if x.user_id == m.user.id or m.member.role == "owner" else mask(x.phone), role=x.role.capitalize(), is_me=x.user_id == m.user.id) for x in staff],
    )


@router.get("/store", response_model=StoreOut)
def get_store(m: Me = Depends(me), db: Session = Depends(get_db)) -> StoreOut:
    return _store(db, m)


@router.patch("/store", response_model=StoreOut, summary="Profile, hours, holiday mode (hides all listings), delivery fee and pincodes")
def patch_store(body: StorePatch, m: Me = Depends(me), db: Session = Depends(get_db)) -> StoreOut:
    v = m.vendor
    data = body.model_dump(exclude_unset=True)
    owner_only = {"name", "delivery_fee_paise", "serviceable_pincodes"}
    if owner_only & set(data) and m.member.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the store owner can change the name, delivery fee or pincodes")
    for k, val in data.items():
        setattr(v, k, val)
    db.commit()
    _bust()
    return _store(db, m)


@router.post("/store/photos/{index}", response_model=StoreOut, summary="Shop photo (for 'Meet the stores'); metadata only for now")
async def store_photo(index: int, file: UploadFile = File(...), m: Me = Depends(me), db: Session = Depends(get_db)) -> StoreOut:
    if not 0 <= index < 3:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Up to 3 shop photos")
    data = await file.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024 or not (file.content_type or "").startswith("image/"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Upload a photo under 8 MB")
    photos = list(m.vendor.photos or []) + [None] * 3
    photos = photos[:3]
    photos[index] = {"name": file.filename, "size": len(data), "status": "pending"}
    m.vendor.photos = photos
    db.commit()
    return _store(db, m)


class InviteIn(BaseModel):
    phone: str
    name: str | None = Field(default=None, max_length=80)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        d = re.sub(r"\D", "", v or "")[-10:]
        if not re.fullmatch(r"[6-9]\d{9}", d):
            raise ValueError("Enter a 10-digit mobile number")
        return "+91" + d


def grant_vendor_login(phone: str, name: str | None) -> uuid.UUID:
    """Ask auth (internal API) to give this phone the VENDOR console role; returns the user id."""
    s = get_settings()
    try:
        r = httpx.post(f"{s.auth_url}/api/auth/v1/internal/memberships", json={"phone": phone, "role": "VENDOR", "name": name},
                       headers={"X-Internal-Token": s.internal_token}, timeout=5)
    except httpx.HTTPError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Couldn't create the login just now. Try again.") from e
    if r.status_code != 200:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Couldn't create the login just now. Try again.")
    return uuid.UUID(r.json()["user_id"])


def get_granter():
    return grant_vendor_login


@router.post("/store/staff", response_model=StoreOut, status_code=status.HTTP_201_CREATED, summary="Owner invites staff by phone (they sign in with OTP)")
def invite(body: InviteIn, m: Me = Depends(me), db: Session = Depends(get_db), grant=Depends(get_granter)) -> StoreOut:
    if m.member.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the store owner can invite staff")
    uid = grant(body.phone, body.name)
    existing = db.scalar(select(VendorMember).where(VendorMember.user_id == uid))
    if existing and existing.vendor_id != m.vendor.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "This number already works for another store")
    if not existing:
        db.add(VendorMember(vendor_id=m.vendor.id, user_id=uid, phone=body.phone, name=body.name, role="staff"))
        db.commit()
    notify.send("whatsapp", body.phone, "vendor_staff_invite", {"store": m.vendor.name})
    return _store(db, m)


@router.post("/demo/order", response_model=SubOrderOut, summary="SEED_DEMO only: a new order rings the store")
def demo_order(m: Me = Depends(me), db: Session = Depends(get_db)) -> SubOrderOut:
    if not get_settings().seed_demo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    from ...seed_demo import new_sub_order

    so = new_sub_order(db, m.vendor, minutes_ago=0)
    db.commit()
    return _out(so)
