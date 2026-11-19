from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...core.config import get_settings
from ...core.time import utcnow
from ...models import Booking, PackageItem, ServiceItem, Slot
from ...schemas.booking import BookingItemOut, BookingOut, ItemOut, SlotOut

IST = ZoneInfo("Asia/Kolkata")


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def slot_available(s: Slot) -> bool:
    return s.booked_count < s.capacity and _aware(s.starts_at) >= utcnow() + timedelta(minutes=get_settings().min_lead_minutes)


def slot_out(s: Slot) -> SlotOut:
    return SlotOut(id=s.id, starts_at=_aware(s.starts_at), ends_at=_aware(s.ends_at), available=slot_available(s))


def _mock_full(d: date, hhmm: str) -> bool:
    h = 7
    for c in f"{d.isoformat()}{hhmm}":
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return h % 5 == 0


def ensure_slots(db: Session, d: date) -> list[Slot]:
    """Slots are created lazily from the IST template the first time a date is asked for."""
    s = get_settings()
    starts = []
    for hhmm in [t.strip() for t in s.slot_times.split(",") if t.strip()]:
        hh, mm = map(int, hhmm.split(":"))
        starts.append((hhmm, datetime.combine(d, time(hh, mm), IST).astimezone(timezone.utc)))
    existing = {_aware(x.starts_at): x for x in db.scalars(select(Slot).where(Slot.starts_at.in_([st for _, st in starts])))}
    created = False
    for hhmm, st in starts:
        if st not in existing:
            cap = s.slot_capacity
            db.add(Slot(starts_at=st, ends_at=st + timedelta(minutes=s.slot_minutes), capacity=cap, booked_count=cap if s.mock_availability and _mock_full(d, hhmm) else 0))
            created = True
    if created:
        try:
            db.commit()
        except IntegrityError:  # another request created them first
            db.rollback()
    day_start = datetime.combine(d, time(0, 0), IST).astimezone(timezone.utc)
    return list(db.scalars(select(Slot).where(Slot.starts_at >= day_start, Slot.starts_at < day_start + timedelta(days=1)).order_by(Slot.starts_at)))


def item_outs(db: Session, items: list[ServiceItem]) -> list[ItemOut]:
    by_id = {i.id: i for i in db.scalars(select(ServiceItem))}
    includes: dict = {}
    for pi in db.scalars(select(PackageItem)):
        includes.setdefault(pi.package_id, []).append(by_id[pi.item_id].slug)
    return [
        ItemOut(id=i.id, slug=i.slug, group=i.group, name=i.name, price_paise=i.price_paise, price_mode=i.price_mode, scene_key=i.scene_key,  # type: ignore[arg-type]
                pet_types=list(i.pet_types or []), includes=sorted(includes.get(i.id, [])), sort_order=i.sort_order)  # type: ignore[arg-type]
        for i in items
    ]


def booking_out(b: Booking) -> BookingOut:
    return BookingOut(
        id=b.id, pet_id=b.pet_id, slot=slot_out(b.slot), address=b.address_json, status=b.status, total_paise=b.total_paise,  # type: ignore[arg-type]
        items=[BookingItemOut(slug=bi.item.slug, name=bi.item.name, price_paise_at_booking=bi.price_paise_at_booking) for bi in b.items],
        notes=b.notes, created_at=_aware(b.created_at),
    )


def ist_today() -> date:
    return datetime.now(IST).date()
