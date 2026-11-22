import logging
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core import cache
from ...core.config import get_settings
from ...core.pets import PetLookup, get_pet_lookup, require_own_pet
from ...core.security import AuthUser, get_user
from ...db import get_db
from ...models import Booking, BookingItem, ServiceItem, Slot
from ...schemas.booking import BookingIn, BookingOut, CatalogOut, ItemOut, SlotOut
from .logic import booking_out, ensure_slots, ist_today, item_outs, slot_available, slot_out

router = APIRouter(tags=["booking"])
log = logging.getLogger("booking")


@router.get("/catalog", response_model=CatalogOut, summary="Bookable items for a pet type (cached)")
def catalog(pet_type: Literal["dog", "cat"], db: Session = Depends(get_db)) -> CatalogOut:
    key = f"catalog:v1:{pet_type}"
    hit = cache.get(key)
    if hit is not None:
        return CatalogOut(items=[ItemOut(**i) for i in hit])
    rows = [i for i in db.scalars(select(ServiceItem).where(ServiceItem.is_active.is_(True)).order_by(ServiceItem.sort_order)) if pet_type in (i.pet_types or [])]
    out = item_outs(db, rows)
    cache.set(key, [o.model_dump(mode="json") for o in out], get_settings().catalog_cache_seconds)
    return CatalogOut(items=out)


@router.get("/slots", response_model=list[SlotOut], summary="Slots for an IST date (next 14 days)")
def slots(date_: date = Query(alias="date"), db: Session = Depends(get_db)) -> list[SlotOut]:
    today = ist_today()
    if date_ < today or date_ >= today + timedelta(days=get_settings().booking_window_days):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick a date within the next 14 days")
    return [slot_out(s) for s in ensure_slots(db, date_)]


@router.post("/bookings", response_model=BookingOut, status_code=status.HTTP_201_CREATED, summary="Request a booking (login required)")
def create_booking(body: BookingIn, user: AuthUser = Depends(get_user), db: Session = Depends(get_db), pets: PetLookup = Depends(get_pet_lookup)) -> BookingOut:
    require_own_pet(pets, body.pet_id, user.id)
    slugs = list(dict.fromkeys(body.item_slugs))
    items = {i.slug: i for i in db.scalars(select(ServiceItem).where(ServiceItem.slug.in_(slugs), ServiceItem.is_active.is_(True)))}
    missing = [s for s in slugs if s not in items]
    if missing:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown service: {', '.join(missing)}")
    not_bookable = [s for s in slugs if items[s].price_mode != "fixed" or items[s].price_paise is None]
    if not_bookable:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Boarding and pickup are arranged on WhatsApp")
    if body.address.pincode not in get_settings().pincodes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "We don't come to this pincode yet")

    # Lock the slot row so two requests can't take the last place.
    slot = db.scalar(select(Slot).where(Slot.id == body.slot_id).with_for_update())
    if not slot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Slot not found")
    if not slot_available(slot):
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That slot is no longer available")
    slot.booked_count += 1

    total = sum(items[s].price_paise or 0 for s in slugs)  # never trust the client total
    if body.client_total_paise is not None and body.client_total_paise != total:
        log.warning("client total %s differs from server total %s", body.client_total_paise, total)
    b = Booking(user_id=user.id, pet_id=body.pet_id, slot_id=slot.id, address_json=body.address.model_dump(), status="requested", total_paise=total, notes=body.notes)
    db.add(b)
    db.flush()
    for s in slugs:
        db.add(BookingItem(booking_id=b.id, item_id=items[s].id, price_paise_at_booking=items[s].price_paise or 0))
    db.commit()
    db.refresh(b)
    return booking_out(b)


@router.get("/bookings/me", response_model=list[BookingOut])
def my_bookings(user: AuthUser = Depends(get_user), db: Session = Depends(get_db)) -> list[BookingOut]:
    rows = db.scalars(select(Booking).where(Booking.user_id == user.id).order_by(Booking.created_at.desc())).unique().all()
    return [booking_out(b) for b in rows]



