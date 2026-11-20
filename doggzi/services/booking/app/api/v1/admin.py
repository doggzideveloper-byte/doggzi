import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...core import cache
from ...core.security import AuthUser, require_admin
from ...db import get_db
from ...models import Booking, ServiceItem, Slot
from ...schemas.booking import BookingOut, ItemCreate, ItemOut, ItemPatch, SlotCreate, SlotOut, StatusPatch
from .logic import booking_out, item_outs, slot_out

router = APIRouter(prefix="/admin", tags=["admin"])

# Allowed status moves (no going back from completed/cancelled).
TRANSITIONS = {"requested": {"confirmed", "cancelled"}, "confirmed": {"completed", "cancelled"}, "completed": set(), "cancelled": set()}


@router.post("/items", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(body: ItemCreate, _: AuthUser = Depends(require_admin), db: Session = Depends(get_db)) -> ItemOut:
    item = ServiceItem(**body.model_dump())
    db.add(item)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug already exists") from e
    cache.delete_prefix("catalog:")
    return item_outs(db, [item])[0]


@router.patch("/items/{item_id}", response_model=ItemOut)
def update_item(item_id: uuid.UUID, body: ItemPatch, _: AuthUser = Depends(require_admin), db: Session = Depends(get_db)) -> ItemOut:
    item = db.get(ServiceItem, item_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    cache.delete_prefix("catalog:")
    return item_outs(db, [item])[0]


@router.post("/slots", response_model=SlotOut, status_code=status.HTTP_201_CREATED)
def create_slot(body: SlotCreate, _: AuthUser = Depends(require_admin), db: Session = Depends(get_db)) -> SlotOut:
    from datetime import timedelta

    slot = Slot(starts_at=body.starts_at, ends_at=body.starts_at + timedelta(minutes=body.minutes), capacity=body.capacity, booked_count=0)
    db.add(slot)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A slot already starts at that time") from e
    return slot_out(slot)


@router.patch("/bookings/{booking_id}/status", response_model=BookingOut)
def set_status(booking_id: uuid.UUID, body: StatusPatch, _: AuthUser = Depends(require_admin), db: Session = Depends(get_db)) -> BookingOut:
    b = db.scalar(select(Booking).where(Booking.id == booking_id).with_for_update(of=Booking))
    if not b:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if body.status != b.status and body.status not in TRANSITIONS[b.status]:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Can't move a {b.status} booking to {body.status}")
    if body.status == "cancelled" and b.status != "cancelled":
        slot = db.scalar(select(Slot).where(Slot.id == b.slot_id).with_for_update())
        if slot and slot.booked_count > 0:
            slot.booked_count -= 1  # free the place
    b.status = body.status
    db.commit()
    db.refresh(b)
    return booking_out(b)
