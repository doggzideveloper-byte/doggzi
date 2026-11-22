import uuid
from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ...core import notify
from ...core.config import get_settings
from ...core.security import AuthUser, get_user
from ...core.time import utcnow
from ...db import get_db
from ...models import Cart, Listing, Order, StockReservation, SubOrder, SubOrderItem
from ...schemas.market import OrderCreatedOut, OrderIn, OrderOut, PaymentOut
from .logic import aware, order_out, reserved_qty

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderCreatedOut, status_code=status.HTTP_201_CREATED, summary="Price on the server, check delivery, reserve stock")
def create_order(body: OrderIn, user: AuthUser = Depends(get_user), db: Session = Depends(get_db)) -> OrderCreatedOut:
    s = get_settings()
    qty: dict[uuid.UUID, int] = defaultdict(int)
    for line in body.lines:
        qty[line.listing_id] += line.qty
    # Lock the listing rows so two checkouts can't reserve the same last units.
    listings = {x.id: x for x in db.scalars(select(Listing).where(Listing.id.in_(list(qty))).with_for_update(of=Listing))}
    missing = [str(i) for i in qty if i not in listings or not listings[i].is_active or not listings[i].vendor.is_active or listings[i].vendor.holiday_mode]
    if missing:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Some items are no longer sold")
    for lid, q in qty.items():
        if q > s.max_qty_per_line:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"At most {s.max_qty_per_line} of each item")
    blocked = sorted({x.vendor.name for x in listings.values() if body.address.pincode not in (x.vendor.serviceable_pincodes or [])})
    if blocked:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": "not_serviceable", "vendors": blocked, "message": f"{', '.join(blocked)} can't deliver to {body.address.pincode} yet"})
    res = reserved_qty(db, list(qty))
    short = [listings[i].product.name for i, q in qty.items() if listings[i].stock_qty - res.get(i, 0) < q]
    if short:
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "out_of_stock", "items": short, "message": "Some items just ran out"})

    by_vendor: dict = defaultdict(int)
    lines = []
    for lid, q in qty.items():
        x = listings[lid]
        by_vendor[x.vendor_id] += x.price_paise * q
        lines.append({"listing_id": str(lid), "sku": x.sku, "name": x.product.name, "qty": q, "price_paise": x.price_paise, "vendor_id": str(x.vendor_id)})
    fees = {vid: next(x.vendor.delivery_fee_paise for x in listings.values() if x.vendor_id == vid) for vid in by_vendor}
    total = sum(by_vendor.values()) + sum(fees.values())  # never trust client_total_paise

    order = Order(user_id=user.id, address_json=body.address.model_dump(), total_paise=total, status="pending_payment", payment_mode=s.payments_mode, lines_json=lines,
                  customer_phone=user.phone or None, pet_snapshot=body.pet.model_dump() if body.pet else None)
    db.add(order)
    db.flush()
    exp = utcnow() + timedelta(minutes=s.reservation_minutes)
    for lid, q in qty.items():
        db.add(StockReservation(listing_id=lid, order_id=order.id, qty=q, expires_at=exp))
    db.commit()
    db.refresh(order)
    if s.payments_mode != "mock":
        # Razorpay is wired once test keys arrive (payments service creates the Razorpay order here).
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Online payment isn't set up yet")
    return OrderCreatedOut(order=order_out(order), payment=PaymentOut(mode="mock", amount_paise=total))


def _owned(db: Session, order_id: uuid.UUID, user: AuthUser, lock: bool = False) -> Order:
    stmt = select(Order).where(Order.id == order_id, Order.user_id == user.id)
    o = db.scalar(stmt.with_for_update(of=Order) if lock else stmt)
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return o


@router.post("/{order_id}/pay/mock", response_model=OrderOut, summary="TEST MODE ONLY: confirm payment without Razorpay")
def pay_mock(order_id: uuid.UUID, user: AuthUser = Depends(get_user), x_cart_id: uuid.UUID | None = Header(default=None, alias="X-Cart-Id"), db: Session = Depends(get_db)) -> OrderOut:
    s = get_settings()
    if s.payments_mode != "mock":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not available")
    o = _owned(db, order_id, user, lock=True)
    if o.status == "paid":
        return order_out(o)
    if o.status != "pending_payment":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Order is {o.status}")
    reservations = db.scalars(select(StockReservation).where(StockReservation.order_id == o.id)).all()
    if not reservations or any(aware(r.expires_at) < utcnow() for r in reservations):
        o.status = "expired"
        db.execute(delete(StockReservation).where(StockReservation.order_id == o.id))
        db.commit()
        raise HTTPException(status.HTTP_409_CONFLICT, "This checkout timed out. Please try again.")
    finalize_paid(db, o)
    # The cart that produced this order is emptied.
    if x_cart_id:
        cart = db.scalar(select(Cart).where(Cart.cart_key == x_cart_id))
        if cart:
            cart.items.clear()
    db.commit()
    db.refresh(o)
    return order_out(o)


def finalize_paid(db: Session, o: Order) -> None:
    """Payment captured → stock is taken, reservations released, one sub-order per store (status placed)."""
    s = get_settings()
    listings = {x.id: x for x in db.scalars(select(Listing).where(Listing.id.in_([uuid.UUID(line["listing_id"]) for line in o.lines_json])).with_for_update(of=Listing))}
    groups: dict = defaultdict(list)
    for line in o.lines_json:
        groups[uuid.UUID(line["vendor_id"])].append(line)
    for vid, ls in groups.items():
        sub = sum(line["price_paise"] * line["qty"] for line in ls)
        vendor = next(x.vendor for x in listings.values() if x.vendor_id == vid)
        so = SubOrder(order_id=o.id, vendor_id=vid, subtotal_paise=sub, delivery_fee_paise=vendor.delivery_fee_paise,
                      commission_paise=sub * vendor.commission_bps // 10_000, status="placed", sla_due_at=utcnow() + timedelta(minutes=s.accept_sla_minutes))
        db.add(so)
        db.flush()
        for line in ls:
            lid = uuid.UUID(line["listing_id"])
            listings[lid].stock_qty = max(0, listings[lid].stock_qty - line["qty"])
            db.add(SubOrderItem(sub_order_id=so.id, listing_id=lid, qty=line["qty"], price_paise_at_order=line["price_paise"]))
    db.execute(delete(StockReservation).where(StockReservation.order_id == o.id))
    o.status = "paid"
    # Each store hears about its sub-order (WhatsApp + the Vendor panel rings on its next poll).
    for vid in groups:
        v = next(x.vendor for x in listings.values() if x.vendor_id == vid)
        notify.send("whatsapp", v.phone, "vendor_new_order", {"store": v.name})
    # TODO(payments): create a Razorpay Route transfer per sub-order, on hold until delivered.


@router.get("/me", response_model=list[OrderOut])
def my_orders(user: AuthUser = Depends(get_user), db: Session = Depends(get_db)) -> list[OrderOut]:
    rows = db.scalars(select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc())).all()
    return [order_out(o) for o in rows]


@router.get("/{order_id}", response_model=OrderOut, summary="Owner only")
def get_order(order_id: uuid.UUID, user: AuthUser = Depends(get_user), db: Session = Depends(get_db)) -> OrderOut:
    return order_out(_owned(db, order_id, user))
