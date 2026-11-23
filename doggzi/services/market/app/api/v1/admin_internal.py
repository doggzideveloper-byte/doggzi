"""Admin panel back office for the marketplace (service-to-service only).

services/admin is the only caller: it checks the console role (ADMIN / OPS), masks phones for OPS and writes the
audit log. These routes trust X-Internal-Token and are never reachable through the gateway (/internal/ is blocked).
"""
import re
import uuid
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...core import cache, notify
from ...core.config import get_settings
from ...core.time import utcnow
from ...db import get_db
from ...models import Listing, Order, Product, ProductRequest, SubOrder, SubOrderItem, Vendor, VendorMember
from .logic import aware, reserved_qty
from .orders import finalize_paid
from .vendor import sweep_missed


def internal_only(x_internal_token: str | None = Header(default=None)) -> None:
    expected = get_settings().internal_token
    if not expected or x_internal_token != expected:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Internal endpoint")


router = APIRouter(prefix="/internal/admin", tags=["internal: admin"], dependencies=[Depends(internal_only)])
OPEN = ("placed", "accepted", "packed", "out_for_delivery")
ENDED = ("delivered", "cancelled")
VENDOR_STAGES = ("applied", "docs", "razorpay", "live")
CATEGORIES = ("treats", "toys", "grooming", "walking", "health")


def _bust() -> None:
    cache.delete_prefix("market:")


def order_ref(o: Order) -> str:
    return "DZ-ORD-" + str(o.id)[:6].upper()


def so_ref(so: SubOrder) -> str:
    return "SO-" + str(so.id)[:4].upper()


def _so(so: SubOrder) -> dict:
    o = so.order
    a = o.address_json or {}
    return {
        "id": str(so.id), "ref": so_ref(so), "order_id": str(o.id), "order_ref": order_ref(o), "status": so.status, "reject_reason": so.reject_reason,
        "user_id": str(o.user_id), "customer_phone": o.customer_phone, "pet": o.pet_snapshot, "area": ", ".join(x for x in [a.get("line2"), a.get("city")] if x),
        "vendor_id": str(so.vendor_id), "vendor": so.vendor.name, "subtotal_paise": so.subtotal_paise, "delivery_fee_paise": so.delivery_fee_paise,
        "total_paise": so.subtotal_paise + so.delivery_fee_paise, "commission_paise": so.commission_paise, "payment_mode": o.payment_mode,
        "items": [{"name": i.listing.product.name, "sku": i.listing.sku, "qty": i.qty, "price_paise": i.price_paise_at_order} for i in so.items],
        "placed_at": aware(so.created_at).isoformat(), "sla_due_at": aware(so.sla_due_at).isoformat() if so.sla_due_at else None,
        "accepted_at": aware(so.accepted_at).isoformat() if so.accepted_at else None,
        "deliver_by": (aware(so.accepted_at) + timedelta(minutes=get_settings().deliver_sla_minutes)).isoformat() if so.accepted_at and so.status in OPEN else None,
        "payout_status": so.payout_status, "refund_status": so.refund_status, "refunded_paise": so.refunded_paise,
    }


def _get_so(db: Session, sid: uuid.UUID) -> SubOrder:
    so = db.scalar(select(SubOrder).where(SubOrder.id == sid).with_for_update(of=SubOrder))
    if not so:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sub-order not found")
    return so


# ---------- orders ----------
@router.get("/sub-orders", summary="Every sub-order, newest first (expired accept windows move to 'missed' first)")
def sub_orders(limit: int = Query(default=300, le=1000), user_id: uuid.UUID | None = None, db: Session = Depends(get_db)) -> list[dict]:
    sweep_missed(db)
    q = select(SubOrder).join(SubOrder.order)
    if user_id:
        q = q.where(Order.user_id == user_id)
    return [_so(so) for so in db.scalars(q.order_by(SubOrder.created_at.desc()).limit(limit)).all()]


@router.post("/sub-orders/{sid}/cancel", summary="Cancel a sub-order: stock goes back, store and customer are told")
def cancel(sid: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    so = _get_so(db, sid)
    if so.status in ENDED:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This sub-order is already {so.status}")
    if so.status != "rejected":  # a rejection already put the stock back
        for it in so.items:
            it.listing.stock_qty += it.qty
    before = so.status
    so.status = "cancelled"
    so.payout_status = "on_hold"
    db.commit()
    _bust()
    notify.send("whatsapp", so.vendor.phone, "ops_cancelled_order", {"ref": so_ref(so)})
    notify.send("whatsapp", so.order.customer_phone, "order_cancelled", {"store": so.vendor.name})
    return {"before": before, **_so(so)}


@router.post("/sub-orders/{sid}/uncancel", summary="Undo a cancel within the panel's undo window (stock is taken again)")
def uncancel(sid: uuid.UUID, to: str = Query(pattern="^(placed|accepted|packed|out_for_delivery|rejected|missed)$"), db: Session = Depends(get_db)) -> dict:
    so = _get_so(db, sid)
    if so.status != "cancelled" or so.refund_status != "none":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a cancelled, unrefunded sub-order can be restored")
    if to != "rejected":
        for it in so.items:
            it.listing.stock_qty = max(0, it.listing.stock_qty - it.qty)
    so.status = to
    if to == "placed":
        so.sla_due_at = utcnow() + timedelta(minutes=get_settings().accept_sla_minutes)
    db.commit()
    _bust()
    return _so(so)


@router.post("/sub-orders/{sid}/refund", summary="Refund the customer for this sub-order (test mode: no money moves). Cancels it if still open.")
def refund(sid: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    so = _get_so(db, sid)
    if so.refund_status != "none":
        raise HTTPException(status.HTTP_409_CONFLICT, "Already refunded")
    if so.order.status != "paid":
        raise HTTPException(status.HTTP_409_CONFLICT, "This order was never paid")
    before = so.status
    if so.status in OPEN:
        for it in so.items:
            it.listing.stock_qty += it.qty
        so.status = "cancelled"
    # TODO(payments): Razorpay refund + Route transfer reversal once keys arrive. Mock mode records it.
    so.refund_status, so.refunded_paise, so.refunded_at = "refunded", so.subtotal_paise + so.delivery_fee_paise, utcnow()
    so.payout_status = "on_hold" if so.payout_status != "settled" else so.payout_status
    db.commit()
    _bust()
    notify.send("whatsapp", so.order.customer_phone, "order_refunded", {"amount_paise": so.refunded_paise})
    return {"before": before, **_so(so)}


@router.post("/sub-orders/{sid}/nudge", summary="WhatsApp the store about this sub-order")
def nudge(sid: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    so = db.get(SubOrder, sid)
    if not so:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sub-order not found")
    notify.send("whatsapp", so.vendor.phone, "ops_nudge", {"ref": so_ref(so), "status": so.status})
    return {"sent_to": so.vendor.name, **_so(so)}


class ReassignIn(BaseModel):
    vendor_id: uuid.UUID


@router.post("/sub-orders/{sid}/reassign", summary="Send a rejected / missed sub-order to another store (same products, same prices for the customer)")
def reassign(sid: uuid.UUID, body: ReassignIn, db: Session = Depends(get_db)) -> dict:
    so = _get_so(db, sid)
    if so.status not in ("rejected", "missed"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a rejected or missed sub-order can go to another store")
    v = db.get(Vendor, body.vendor_id)
    if not v or v.id == so.vendor_id or v.stage != "live" or v.paused or not v.is_active:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick another live store")
    pin = (so.order.address_json or {}).get("pincode")
    if pin not in (v.serviceable_pincodes or []):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{v.name} doesn't deliver to {pin}")
    theirs = {x.product_id: x for x in db.scalars(select(Listing).where(Listing.vendor_id == v.id, Listing.is_active.is_(True)).with_for_update(of=Listing))}
    res = reserved_qty(db, [x.id for x in theirs.values()])
    missing = [it.listing.product.name for it in so.items if it.listing.product_id not in theirs or theirs[it.listing.product_id].stock_qty - res.get(theirs[it.listing.product_id].id, 0) < it.qty]
    if missing:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{v.name} doesn't have: {', '.join(missing)}")
    before = so.vendor.name
    if so.status == "missed":  # stock of the first store was never returned
        for it in so.items:
            it.listing.stock_qty += it.qty
    for it in so.items:
        x = theirs[it.listing.product_id]
        x.stock_qty -= it.qty
        it.listing_id = x.id
    so.vendor_id, so.status, so.reject_reason, so.accepted_at, so.pack_checks = v.id, "placed", None, None, None
    so.commission_paise = so.subtotal_paise * v.commission_bps // 10_000
    so.sla_due_at = utcnow() + timedelta(minutes=get_settings().accept_sla_minutes)
    db.commit()
    db.expire(so)
    _bust()
    notify.send("whatsapp", v.phone, "vendor_new_order", {"store": v.name})
    return {"before": before, **_so(so)}


class OrderIn(BaseModel):
    user_id: uuid.UUID
    customer_phone: str = Field(max_length=16)
    address: dict
    pet: dict | None = None
    listing_id: uuid.UUID
    qty: int = Field(ge=1, le=20)


@router.post("/orders", summary="OPS creates an order for a customer (pay on delivery); the store gets it like any other order")
def create_order(body: OrderIn, db: Session = Depends(get_db)) -> dict:
    x = db.scalar(select(Listing).where(Listing.id == body.listing_id).with_for_update(of=Listing))
    if not x or not x.is_active or x.product.is_blocked or x.vendor.stage != "live" or x.vendor.paused:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That product isn't sold right now")
    if x.stock_qty - reserved_qty(db, [x.id]).get(x.id, 0) < body.qty:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Only {x.stock_qty} in stock")
    pin = str(body.address.get("pincode") or "")
    if pin not in (x.vendor.serviceable_pincodes or []):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{x.vendor.name} doesn't deliver to {pin or 'this pincode'}")
    total = x.price_paise * body.qty + x.vendor.delivery_fee_paise
    o = Order(user_id=body.user_id, address_json=body.address, total_paise=total, status="paid", payment_mode="ops", customer_phone=body.customer_phone, pet_snapshot=body.pet,
              lines_json=[{"listing_id": str(x.id), "sku": x.sku, "name": x.product.name, "qty": body.qty, "price_paise": x.price_paise, "vendor_id": str(x.vendor_id)}])
    db.add(o)
    db.flush()
    finalize_paid(db, o)
    db.commit()
    _bust()
    so = db.scalar(select(SubOrder).where(SubOrder.order_id == o.id))
    return _so(so)


# ---------- catalog ----------
def _product(p: Product, listings: list[Listing]) -> dict:
    own = next((x for x in listings if x.vendor.is_doggzi), listings[0] if listings else None)
    return {"id": str(p.id), "name": p.name, "brand": p.brand, "brand_as_listed": p.brand_as_listed, "category": p.category, "pet_types": list(p.pet_types or []),
            "flags": list(p.source_flags or []), "is_blocked": p.is_blocked, "brand_confirmed": p.brand_confirmed, "sku": own.sku if own else None,
            "price_paise": own.price_paise if own else None, "mrp_paise": own.mrp_paise if own else None, "stores": sorted({x.vendor.name for x in listings}),
            "updated_at": aware(p.updated_at).isoformat()}


@router.get("/products")
def products(db: Session = Depends(get_db)) -> list[dict]:
    by: dict = {}
    for x in db.scalars(select(Listing)).all():
        by.setdefault(x.product_id, []).append(x)
    return [_product(p, by.get(p.id, [])) for p in db.scalars(select(Product).order_by(Product.popularity_rank, Product.name)).all()]


class ProductPatch(BaseModel):
    brand: str | None = Field(default=None, min_length=1, max_length=80)
    brand_confirmed: bool | None = None
    is_blocked: bool | None = None


@router.patch("/products/{pid}")
def patch_product(pid: uuid.UUID, body: ProductPatch, db: Session = Depends(get_db)) -> dict:
    p = db.get(Product, pid)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    before = {"brand": p.brand, "brand_confirmed": p.brand_confirmed, "is_blocked": p.is_blocked}
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    _bust()
    return {"before": before, **_product(p, list(db.scalars(select(Listing).where(Listing.product_id == p.id))))}


class ProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    brand: str = Field(min_length=1, max_length=80)
    category: Literal["treats", "toys", "grooming", "walking", "health"]
    pet_type: Literal["dog", "cat", "both"]
    price_paise: int = Field(gt=0, le=10_000_000)
    mrp_paise: int | None = Field(default=None, gt=0, le=10_000_000)
    stock_qty: int = Field(default=10, ge=0, le=100_000)


@router.post("/products", status_code=status.HTTP_201_CREATED, summary="Add a product to the catalog, listed in Doggzi Store")
def add_product(body: ProductIn, db: Session = Depends(get_db)) -> dict:
    if body.mrp_paise is not None and body.mrp_paise < body.price_paise:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "MRP can't be lower than the price")
    store = db.scalar(select(Vendor).where(Vendor.is_doggzi.is_(True)))
    if not store:
        raise HTTPException(status.HTTP_409_CONFLICT, "Doggzi Store is missing")
    last = max([int(m.group(1)) for s in db.scalars(select(Listing.sku).where(Listing.vendor_id == store.id)) if (m := re.fullmatch(r"DZ-MKT-(\d+)", s or ""))] or [0])
    rank = (db.scalar(select(func.max(Product.popularity_rank))) or 0) + 1
    p = Product(name=body.name.strip(), brand=body.brand.strip(), brand_as_listed=body.brand.strip(), category=body.category,
                pet_types=["dog", "cat"] if body.pet_type == "both" else [body.pet_type], popularity_rank=rank, source_flags=[])
    db.add(p)
    db.flush()
    x = Listing(vendor_id=store.id, product_id=p.id, sku=f"DZ-MKT-{last + 1:03d}", price_paise=body.price_paise, mrp_paise=body.mrp_paise, stock_qty=body.stock_qty)
    db.add(x)
    db.commit()
    _bust()
    return _product(p, [x])


@router.get("/approvals", summary="Vendor photos waiting for approval and product requests")
def approvals(db: Session = Depends(get_db)) -> dict:
    photos = db.scalars(select(Listing).where(Listing.photo_status == "pending").order_by(Listing.updated_at)).all()
    reqs = db.scalars(select(ProductRequest).where(ProductRequest.status == "pending").order_by(ProductRequest.created_at)).all()
    vendors = {v.id: v.name for v in db.scalars(select(Vendor))}
    return {
        "photos": [{"listing_id": str(x.id), "sku": x.sku, "product": x.product.name, "vendor": x.vendor.name, "meta": x.photo_meta, "at": aware(x.updated_at).isoformat()} for x in photos],
        "requests": [{"id": str(r.id), "name": r.name, "brand": r.brand, "category": r.category, "price_paise": r.price_paise, "vendor": vendors.get(r.vendor_id), "at": aware(r.created_at).isoformat()} for r in reqs],
    }


class Decision(BaseModel):
    approve: bool


@router.post("/listings/{lid}/photo")
def decide_photo(lid: uuid.UUID, body: Decision, db: Session = Depends(get_db)) -> dict:
    x = db.get(Listing, lid)
    if not x or x.photo_status != "pending":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No photo waiting for this listing")
    x.photo_status = "approved" if body.approve else "rejected"
    # Photo storage isn't wired yet (BACKLOG): approval is recorded, the shop keeps the Doggzi photo.
    db.commit()
    _bust()
    return {"sku": x.sku, "product": x.product.name, "vendor": x.vendor.name, "photo_status": x.photo_status}


@router.post("/product-requests/{rid}")
def decide_request(rid: uuid.UUID, body: Decision, db: Session = Depends(get_db)) -> dict:
    r = db.get(ProductRequest, rid)
    if not r or r.status != "pending":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    r.status = "approved" if body.approve else "rejected"
    pid = None
    if body.approve:
        p = Product(name=r.name, brand=r.brand or "Unbranded", brand_as_listed=r.brand, category=r.category if r.category in CATEGORIES else "treats",
                    pet_types=["dog", "cat"], popularity_rank=(db.scalar(select(func.max(Product.popularity_rank))) or 0) + 1, source_flags=[])
        db.add(p)
        db.flush()
        pid = str(p.id)
    db.commit()
    v = db.get(Vendor, r.vendor_id)
    notify.send("whatsapp", v.phone if v else None, "product_request_" + r.status, {"name": r.name})
    return {"name": r.name, "status": r.status, "product_id": pid}


@router.get("/listings", summary="A store's sellable listings (for the New order form)")
def store_listings(vendor_id: uuid.UUID, db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Listing).where(Listing.vendor_id == vendor_id, Listing.is_active.is_(True)).order_by(Listing.sku)).all()
    return [{"id": str(x.id), "sku": x.sku, "name": x.product.name, "price_paise": x.price_paise, "stock_qty": x.stock_qty} for x in rows if not x.product.is_blocked]


# ---------- vendors ----------
def _vendor(db: Session, v: Vendor) -> dict:
    since = utcnow() - timedelta(days=30)
    rows = db.scalars(select(SubOrder).where(SubOrder.vendor_id == v.id, SubOrder.created_at >= since)).all()
    decided = [s for s in rows if s.status not in ("placed",)]
    accepted = [s for s in decided if s.accepted_at]
    packs = [(aware(s.packed_at) - aware(s.accepted_at)).total_seconds() / 60 for s in rows if s.packed_at and s.accepted_at]
    month0 = utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    owner = db.scalar(select(VendorMember).where(VendorMember.vendor_id == v.id, VendorMember.role == "owner"))
    return {
        "id": str(v.id), "name": v.name, "slug": v.slug, "stage": v.stage, "paused": v.paused, "area": v.area, "phone": v.phone, "is_doggzi": v.is_doggzi,
        "commission_pct": v.commission_bps / 100, "pincodes": list(v.serviceable_pincodes or []), "hours_text": v.hours_text, "holiday_mode": v.holiday_mode,
        "kyc_status": v.kyc_status, "razorpay_linked": bool(v.razorpay_linked_account_id), "owner_user_id": str(owner.user_id) if owner else None,
        "accept_rate": round(100 * len(accepted) / len(decided)) if decided else None, "avg_pack_minutes": round(sum(packs) / len(packs)) if packs else None,
        "cancellations_month": sum(1 for s in rows if s.status in ("rejected", "missed", "cancelled") and aware(s.created_at) >= month0),
        "listings": db.scalar(select(func.count(Listing.id)).where(Listing.vendor_id == v.id)) or 0, "created_at": aware(v.created_at).isoformat(),
    }


@router.get("/vendors")
def vendors(db: Session = Depends(get_db)) -> list[dict]:
    return [_vendor(db, v) for v in db.scalars(select(Vendor).order_by(Vendor.created_at)).all()]


def _pins(v: list[str]) -> list[str]:
    out = [p.strip() for p in v if p.strip()]
    if not out or not all(re.fullmatch(r"\d{6}", p) for p in out):
        raise ValueError("Use 6-digit pincodes")
    return sorted(set(out))


def _phone(v: str) -> str:
    d = re.sub(r"\D", "", v or "")[-10:]
    if not re.fullmatch(r"[6-9]\d{9}", d):
        raise ValueError("Enter a 10-digit mobile number")
    return "+91" + d


class VendorIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    area: str = Field(min_length=2, max_length=80)
    phone: str
    commission_pct: float = Field(ge=0, le=40)
    pincodes: list[str] = Field(max_length=200)
    _p = field_validator("phone")(lambda cls, v: _phone(v))
    _pc = field_validator("pincodes")(lambda cls, v: _pins(v))


@router.post("/vendors", status_code=status.HTTP_201_CREATED, summary="A new store starts in Applied (not visible, no panel login yet)")
def add_vendor(body: VendorIn, db: Session = Depends(get_db)) -> dict:
    base = re.sub(r"[^a-z0-9]+", "-", body.name.lower()).strip("-")[:70] or "store"
    slug, n = base, 2
    while db.scalar(select(Vendor.id).where(Vendor.slug == slug)):
        slug, n = f"{base}-{n}", n + 1
    v = Vendor(name=body.name.strip(), slug=slug, area=body.area.strip(), phone=body.phone, commission_bps=round(body.commission_pct * 100), serviceable_pincodes=body.pincodes,
               delivery_fee_paise=4900, stage="applied", kyc_status="pending", hours_text="Mon–Sun, 10 am – 8 pm")
    db.add(v)
    db.commit()
    return _vendor(db, v)


class VendorPatch(BaseModel):
    stage: Literal["applied", "docs", "razorpay", "live"] | None = None
    paused: bool | None = None
    commission_pct: float | None = Field(default=None, ge=0, le=40)
    pincodes: list[str] | None = None
    owner_user_id: uuid.UUID | None = None  # set by services/admin once auth has granted the VENDOR login (going Live)

    @field_validator("pincodes")
    @classmethod
    def _pc(cls, v):
        return None if v is None else _pins(v)


@router.patch("/vendors/{vid}")
def patch_vendor(vid: uuid.UUID, body: VendorPatch, db: Session = Depends(get_db)) -> dict:
    v = db.scalar(select(Vendor).where(Vendor.id == vid).with_for_update(of=Vendor))
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Store not found")
    before = _vendor(db, v)
    if body.stage is not None:
        v.stage = body.stage
        if body.stage in ("razorpay", "live"):
            v.kyc_status = "verified"
    if body.paused is not None:
        v.paused = body.paused
    if body.commission_pct is not None:
        v.commission_bps = round(body.commission_pct * 100)
    if body.pincodes is not None:
        v.serviceable_pincodes = body.pincodes
    if body.owner_user_id and not db.scalar(select(VendorMember).where(VendorMember.user_id == body.owner_user_id)):
        db.add(VendorMember(vendor_id=v.id, user_id=body.owner_user_id, phone=v.phone, name=None, role="owner"))
    db.commit()
    _bust()
    if body.stage == "live" and before["stage"] != "live":
        notify.send("whatsapp", v.phone, "vendor_live", {"store": v.name})
    return {"before": before, **_vendor(db, v)}


# ---------- numbers ----------
def _range(frm: datetime, to: datetime):
    return (Order.created_at >= frm, Order.created_at < to)


@router.get("/stats", summary="Marketplace numbers for [from, to) (UTC instants); 'now' figures ignore the range")
def stats(frm: datetime = Query(alias="from"), to: datetime = Query(), db: Session = Depends(get_db)) -> dict:
    sweep_missed(db)
    paid = db.scalars(select(Order).where(Order.status == "paid", *_range(frm, to))).all()
    subs = [s for o in paid for s in o.sub_orders]
    by = {k: 0 for k in ("new", "packing", "ready", "out", "delivered", "rejected")}
    m = {"placed": "new", "accepted": "packing", "packed": "ready", "out_for_delivery": "out", "delivered": "delivered", "rejected": "rejected", "missed": "rejected"}
    for s in subs:
        if s.status in m:
            by[m[s.status]] += 1
    refunded = sum(s.refunded_paise or 0 for s in subs)
    stuck = db.scalars(select(SubOrder).where(SubOrder.status.in_(("rejected", "missed")), SubOrder.refund_status == "none").order_by(SubOrder.created_at)).all()
    return {"orders": len(paid), "gmv_paise": sum(o.total_paise for o in paid) - refunded, "by_status": by,
            "needs_ops": [{"id": str(s.id), "ref": so_ref(s), "status": s.status, "vendor": s.vendor.name, "reason": s.reject_reason or "Not accepted in time",
                           "at": aware(s.updated_at).isoformat()} for s in stuck],
            "applications": [{"name": v.name, "kind": "Vendor", "at": aware(v.created_at).isoformat()}
                             for v in db.scalars(select(Vendor).where(Vendor.stage != "live").order_by(Vendor.created_at.desc()).limit(5))]}


@router.get("/customers", summary="Per customer: order count and last delivery address")
def customers(db: Session = Depends(get_db)) -> dict:
    out: dict = {}
    for o in db.scalars(select(Order).where(Order.status == "paid").order_by(Order.created_at)).all():
        c = out.setdefault(str(o.user_id), {"orders": 0, "address": None, "phones": []})
        c["orders"] += 1
        c["address"] = o.address_json
        if o.customer_phone and o.customer_phone not in c["phones"]:
            c["phones"].append(o.customer_phone)
    return out


@router.get("/payments", summary="Test-mode payments, refunds, Route transfers and reconciliation (no money moves)")
def payments(db: Session = Depends(get_db)) -> dict:
    orders = db.scalars(select(Order).where(Order.status.in_(("paid", "cancelled", "expired"))).order_by(Order.created_at.desc()).limit(300)).all()
    pays, recon, route, refunds = [], [], [], []
    for o in orders:
        captured = o.total_paise if o.status == "paid" else 0
        pays.append({"id": "pay_" + str(o.id).replace("-", "")[:10], "order_ref": order_ref(o), "amount_paise": o.total_paise, "method": {"mock": "Test mode", "ops": "Pay on delivery"}.get(o.payment_mode, o.payment_mode),
                     "status": "captured" if o.status == "paid" else "failed", "at": aware(o.created_at).isoformat()})
        expected = sum(s.subtotal_paise + s.delivery_fee_paise for s in o.sub_orders) if o.sub_orders else o.total_paise
        if o.status == "paid":
            recon.append({"ref": order_ref(o), "expected_paise": expected, "captured_paise": captured, "difference_paise": captured - expected})
        for s in o.sub_orders:
            net = s.subtotal_paise - s.commission_paise + s.delivery_fee_paise
            st = "Reversed" if s.refund_status == "refunded" or s.status in ("cancelled", "rejected", "missed") else {"released": "Released", "settled": "Settled"}.get(s.payout_status, "On hold")
            route.append({"ref": so_ref(s), "vendor": s.vendor.name, "amount_paise": net, "status": st})
            if s.refund_status == "refunded":
                refunds.append({"ref": so_ref(s), "order_ref": order_ref(o), "amount_paise": s.refunded_paise or 0, "status": "Refunded (test mode)", "at": aware(s.refunded_at).isoformat() if s.refunded_at else None})
    return {"payments": pays, "refunds": refunds, "route": route, "recon": recon}
