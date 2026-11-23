"""Bookings board and marketplace orders (ADMIN + OPS; refunds ADMIN only). Every write is audited."""
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.access import Staff, admin_only, staff
from ...core.audit import record
from ...core.upstream import Upstream, get_upstream
from ...db import get_db
from ...models import CustomerProfile
from .common import inr

router = APIRouter(tags=["bookings & orders"])
COLS = {"requested": "Requested", "offered": "Offered", "accepted": "Accepted", "enroute": "En route", "inprogress": "In progress", "completed": "Completed", "cancelled": "Cancelled"}
SO_LABEL = {"placed": "New", "accepted": "Packing", "packed": "Ready", "out_for_delivery": "Out for delivery", "delivered": "Delivered", "rejected": "Rejected",
            "missed": "Missed", "cancelled": "Cancelled"}


def card(c: dict, who: Staff) -> dict:
    return {**c, "customer_phone": who.phone(c.get("customer_phone"))}


def sub(s: dict, who: Staff) -> dict:
    return {**s, "customer_phone": who.phone(s.get("customer_phone")), "status_label": "Refunded" if s.get("refund_status") == "refunded" else SO_LABEL.get(s["status"], s["status"])}


# ---------- bookings ----------
@router.get("/bookings", summary="Board cards (yesterday → +14 days, plus anything open)")
def bookings(who: Staff = Depends(staff), up: Upstream = Depends(get_upstream)) -> list[dict]:
    return [card(c, who) for c in up.get("booking", "/bookings")]


class MoveIn(BaseModel):
    to: Literal["requested", "offered", "accepted", "enroute", "inprogress", "completed", "cancelled"]
    undo: bool = False


@router.post("/bookings/{bid}/move", summary="Move a card (Cancelled needs the typed confirmation in the panel)")
def move(bid: uuid.UUID, body: MoveIn, who: Staff = Depends(staff), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    r = up.post("booking", f"/bookings/{bid}/move", {"to": body.to})
    verb = "Undo: moved" if body.undo else "Cancelled" if body.to == "cancelled" else "Moved"
    record(db, who, "Bookings", f"{verb} {r['ref']}" + ("" if body.to == "cancelled" and not body.undo else f" to {COLS[body.to]}"), target=r["ref"],
           before=COLS.get(r["before"]), after=COLS[r["column"]])
    return card(r, who)


class ReassignIn(BaseModel):
    provider_id: uuid.UUID


@router.post("/bookings/{bid}/reassign", summary="Offer the booking to a chosen provider (normal offer timer)")
def reassign(bid: uuid.UUID, body: ReassignIn, who: Staff = Depends(staff), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    r = up.post("booking", f"/bookings/{bid}/reassign", {"provider_id": str(body.provider_id)})
    record(db, who, "Bookings", f"Reassigned {r['ref']} to {r['provider']['name']}", target=r["ref"], before=(r.get("before_provider") or {}).get("name") or "Unassigned",
           after=r["provider"]["name"])
    return card(r, who)


def _customer(up: Upstream, db: Session, user_id: uuid.UUID, pincode: str, area: str) -> dict:
    u = up.get("auth", f"/users/{user_id}")
    if not u.get("phone"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "This customer has no phone number")
    prof = db.scalar(select(CustomerProfile).where(CustomerProfile.user_id == user_id))
    if not prof:
        prof = CustomerProfile(user_id=user_id)
        db.add(prof)
    prof.area, prof.pincode = area, pincode  # remember for next time
    db.commit()
    parts = [p.strip() for p in area.split(",") if p.strip()]
    return {"user": u, "address": {"line1": "", "line2": parts[0] if parts else area, "city": parts[-1] if len(parts) > 1 else "Gurgaon", "pincode": pincode}}


class NewBooking(BaseModel):
    user_id: uuid.UUID
    pet_id: uuid.UUID
    item_slug: str = Field(max_length=80)
    date_: date = Field(alias="date")
    time_: str = Field(alias="time", pattern=r"^\d{2}:\d{2}$")
    area: str = Field(min_length=2, max_length=120)
    pincode: str = Field(pattern=r"^\d{6}$")
    provider_id: uuid.UUID | None = None


@router.post("/bookings", status_code=status.HTTP_201_CREATED, summary="New booking for a customer (phone / WhatsApp)")
def new_booking(body: NewBooking, who: Staff = Depends(staff), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    c = _customer(up, db, body.user_id, body.pincode, body.area)
    pet = next((p for p in up.get("pets", "/pets", owners=str(body.user_id)) if p["id"] == str(body.pet_id)), None)
    if not pet:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick one of this customer's pets")
    r = up.post("booking", "/bookings", {"user_id": str(body.user_id), "customer_phone": c["user"]["phone"], "pet": {"id": pet["id"], "name": pet["name"], "type": pet["type"], "breed": pet["breed"]},
                                         "item_slug": body.item_slug, "date": body.date_.isoformat(), "time": body.time_, "address": c["address"],
                                         "provider_id": str(body.provider_id) if body.provider_id else None})
    record(db, who, "Bookings", f"Created {r['ref']} for {pet['name']} ({', '.join(r['services'])})", target=r["ref"], after=COLS[r["column"]])
    return card(r, who)


# ---------- orders ----------
@router.get("/orders", summary="Sub-orders per store with SLA")
def orders(who: Staff = Depends(staff), up: Upstream = Depends(get_upstream)) -> list[dict]:
    return [sub(s, who) for s in up.get("market", "/sub-orders")]


def _so_action(name: str, verb: str, sid: uuid.UUID, who: Staff, up: Upstream, db: Session, **params) -> dict:
    r = up.post("market", f"/sub-orders/{sid}/{name}", None, **params)
    after = "Refunded" if name == "refund" else SO_LABEL.get(r["status"], r["status"])
    record(db, who, "Orders", f"{verb} {r['ref']} ({r['order_ref']})" + (f" · {inr(r['refunded_paise'])}" if name == "refund" else ""), target=r["ref"],
           before=SO_LABEL.get(r.get("before", ""), r.get("before")), after=after)
    return sub(r, who)


@router.post("/orders/{sid}/cancel")
def cancel(sid: uuid.UUID, who: Staff = Depends(staff), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    return _so_action("cancel", "Cancelled", sid, who, up, db)


@router.post("/orders/{sid}/uncancel", summary="Undo a cancel (5-second window in the panel)")
def uncancel(sid: uuid.UUID, to: str, who: Staff = Depends(staff), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    return _so_action("uncancel", "Undo: restored", sid, who, up, db, to=to)


@router.post("/orders/{sid}/refund", summary="ADMIN only. Test mode: recorded, no money moves")
def refund(sid: uuid.UUID, who: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    return _so_action("refund", "Refunded", sid, who, up, db)


@router.post("/orders/{sid}/nudge", summary="WhatsApp the store")
def nudge(sid: uuid.UUID, who: Staff = Depends(staff), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    r = up.post("market", f"/sub-orders/{sid}/nudge")
    record(db, who, "Orders", f"Nudged {r['vendor']} on {r['ref']}", target=r["ref"], after="WhatsApp")
    return sub(r, who)


class VendorPick(BaseModel):
    vendor_id: uuid.UUID


@router.post("/orders/{sid}/reassign", summary="Send a rejected / missed sub-order to another store")
def reassign_order(sid: uuid.UUID, body: VendorPick, who: Staff = Depends(staff), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    r = up.post("market", f"/sub-orders/{sid}/reassign", {"vendor_id": str(body.vendor_id)})
    record(db, who, "Orders", f"Reassigned {r['ref']} to {r['vendor']}", target=r["ref"], before=r["before"], after=r["vendor"])
    return sub(r, who)


class NewOrder(BaseModel):
    user_id: uuid.UUID
    listing_id: uuid.UUID
    qty: int = Field(ge=1, le=20)
    area: str = Field(min_length=2, max_length=120)
    pincode: str = Field(pattern=r"^\d{6}$")


@router.post("/orders", status_code=status.HTTP_201_CREATED, summary="New order for a customer (pay on delivery)")
def new_order(body: NewOrder, who: Staff = Depends(staff), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    c = _customer(up, db, body.user_id, body.pincode, body.area)
    pets = up.get("pets", "/pets", owners=str(body.user_id))
    pet = {k: pets[0][k] for k in ("name", "type", "breed")} if pets else None
    r = up.post("market", "/orders", {"user_id": str(body.user_id), "customer_phone": c["user"]["phone"], "address": c["address"], "pet": pet,
                                      "listing_id": str(body.listing_id), "qty": body.qty})
    lines = ", ".join(f"{i['qty']}× {i['name']}" for i in r["items"])
    record(db, who, "Orders", f"Created {r['ref']} ({r['order_ref']}): {lines}", target=r["ref"], after=inr(r["total_paise"]))
    return sub(r, who)


@router.get("/orders/listings", summary="A store's products, for the New order form")
def listings(vendor_id: uuid.UUID, _: Staff = Depends(staff), up: Upstream = Depends(get_upstream)) -> list[dict]:
    return up.get("market", "/listings", vendor_id=str(vendor_id))
