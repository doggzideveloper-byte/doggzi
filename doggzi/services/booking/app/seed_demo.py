"""SEED_DEMO=true: demo provider profiles + today's jobs, an open offer, last week's earnings and payouts.

Local / demo server only (a no-op otherwise). Provider user ids match services/auth seed_demo (uuid5 of the
phone), so logging in as 9000000001 opens Ravi's panel. Safe to run on every start: it only adds what's missing.
Run: python -m app.seed_demo
"""
import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from .core import codes, dispatch
from .core.config import get_settings
from .core.time import utcnow
from .db import SessionLocal
from .models import Booking, BookingItem, Offer, Payout, Provider, ServiceItem, Slot

IST = ZoneInfo("Asia/Kolkata")
DEMO_NS = uuid.UUID("6f1c2a8e-3b7d-4c55-9e0a-d0991e5f0d01")  # same as services/auth
DEMO_CUSTOMER = uuid.uuid5(DEMO_NS, "demo-customer")
HOURS = [{"on": i < 6, "from": 9, "to": 14 if i == 5 else 20} for i in range(7)]
PROVIDERS = [
    ("+919000000001", "Ravi Kumar", ["bath", "dry", "trim", "style", "dental", "massage"], 4.8, 126),
    ("+919000000005", "Arjun Mehta", ["bath", "dry", "massage"], 4.6, 41),
]
AREA = {"line1": "Flat 12B, Tower 4", "line2": "Sector 56", "city": "Gurgaon", "pincode": "122011"}


def user_id(phone: str) -> uuid.UUID:
    return uuid.uuid5(DEMO_NS, phone)


def _slot(db: Session, d: date, hh: int, mm: int) -> Slot:
    st = datetime.combine(d, time(hh, mm), IST)
    s = db.scalar(select(Slot).where(Slot.starts_at == st))
    if not s:
        s = Slot(starts_at=st, ends_at=st + timedelta(minutes=get_settings().slot_minutes), capacity=4, booked_count=0)
        db.add(s)
        db.flush()
    s.booked_count += 1
    return s


def _booking(db: Session, slot: Slot, slugs: list[str], pet: dict, phone: str, line2: str, note: str | None = None) -> Booking:
    items = {i.slug: i for i in db.scalars(select(ServiceItem).where(ServiceItem.slug.in_(slugs)))}
    total = sum(items[s].price_paise or 0 for s in slugs)
    b = Booking(user_id=DEMO_CUSTOMER, pet_id=uuid.uuid4(), slot_id=slot.id, address_json={**AREA, "line2": line2}, status="requested", total_paise=total,
                notes=note, customer_phone=phone, pet_snapshot=pet, pay_after_service=True)
    db.add(b)
    db.flush()
    for s in slugs:
        db.add(BookingItem(booking_id=b.id, item_id=items[s].id, price_paise_at_booking=items[s].price_paise or 0))
    db.flush()
    db.refresh(b)
    return b


def _assign(db: Session, p: Provider, b: Booking, step: str) -> None:
    b.provider_id, b.job_step, b.dispatch_status, b.status = p.id, step, "assigned", "confirmed"
    b.earning_paise = dispatch.earning_for(b)
    b.checklist = [{"label": it.name, "done": step == "done"} for it in dispatch.expanded_items(db, b)]
    db.add(Offer(booking_id=b.id, provider_id=p.id, status="accepted", expires_at=utcnow(), responded_at=utcnow(), earning_paise=b.earning_paise))
    codes.ensure_codes(db, b.id)
    if step == "done":
        b.status, b.dispatch_status, b.collected_mode = "completed", "closed", "UPI"
        b.completed_at = b.slot.ends_at


def demo_offer(db: Session, p: Provider) -> Offer:
    """A fresh booking offered straight to this provider (used by the seed and the demo 'ring me' button)."""
    today = datetime.now(IST).date()
    b = _booking(db, _slot(db, today, 19, 0), ["full-package", "body-massage"], {"name": "Bruno", "type": "dog", "breed": "Labrador Retriever"},
                 "+919811122233", "Sector 56", note="Anxious around dryers")
    o = Offer(booking_id=b.id, provider_id=p.id, status="offered", expires_at=utcnow() + timedelta(seconds=get_settings().offer_ttl_seconds), earning_paise=dispatch.earning_for(b))
    b.dispatch_status = "offered"
    db.add(o)
    db.flush()
    return o


def seed(db: Session) -> str:
    made = []
    for phone, name, skills, rating, done in PROVIDERS:
        p = db.scalar(select(Provider).where(Provider.user_id == user_id(phone)))
        if not p:
            p = Provider(user_id=user_id(phone), name=name, phone=phone, skills=skills, areas=["122011", "122018", "122002", "122003"], rating=rating, jobs_done=done,
                         weekly_hours=HOURS, days_off=[], docs=[{"name": "Aadhaar / ID", "status": "Verified"}, {"name": "Grooming certificate", "status": "In review"}, {"name": "Police verification", "status": "Missing"}])
            db.add(p)
            db.flush()
            made.append(name)
    ravi = db.scalar(select(Provider).where(Provider.user_id == user_id(PROVIDERS[0][0])))
    today = datetime.now(IST).date()
    day0 = datetime.combine(today, time(0), IST)
    have_today = [b for b in db.scalars(select(Booking).where(Booking.provider_id == ravi.id)).unique() if dispatch.aware(b.slot.starts_at) >= day0]
    if not have_today:
        coco = _booking(db, _slot(db, today, 9, 0), ["shower-package"], {"name": "Coco", "type": "dog", "breed": "Shih Tzu"}, "+919812345609", "Sector 57")
        _assign(db, ravi, coco, "done")
        bruno = _booking(db, _slot(db, today, 12, 0), ["full-package", "dental-cleaning"], {"name": "Bruno", "type": "dog", "breed": "Labrador Retriever"}, "+919876543210", "Sector 56")
        _assign(db, ravi, bruno, "accepted")
        mishti = _booking(db, _slot(db, today, 15, 30), ["bath-blow-dry"], {"name": "Mishti", "type": "cat", "breed": "Persian"}, "+919988776612", "Sector 50")
        _assign(db, ravi, mishti, "accepted")
        # Last week: completed jobs for the earnings screen.
        for k, (slugs, pet) in enumerate([(["full-package"], ("Leo", "dog", "Golden Retriever")), (["breed-styling"], ("Simba", "dog", "Pomeranian")),
                                          (["bath-blow-dry"], ("Kiara", "cat", "Persian")), (["dental-cleaning"], ("Max", "dog", "Beagle"))]):
            d = today - timedelta(days=k + 1)
            b = _booking(db, _slot(db, d, 11 + k, 0), slugs, {"name": pet[0], "type": pet[1], "breed": pet[2]}, "+919800000001", "Sector 56")
            _assign(db, ravi, b, "done")
        made.append("today's jobs")
    if not db.scalar(select(Offer).where(Offer.provider_id == ravi.id, Offer.status == "offered")):
        demo_offer(db, ravi)
        made.append("an open offer")
    if not db.scalar(select(Payout).where(Payout.provider_id == ravi.id)):
        m = today.replace(day=1)
        prev = (m - timedelta(days=1)).replace(day=1)
        db.add_all([
            Payout(provider_id=ravi.id, period_start=m, period_end=min(today, m + timedelta(days=14)), amount_paise=920000, status="pending"),
            Payout(provider_id=ravi.id, period_start=prev + timedelta(days=15), period_end=m - timedelta(days=1), amount_paise=1045000, status="paid", paid_at=utcnow()),
            Payout(provider_id=ravi.id, period_start=prev, period_end=prev + timedelta(days=14), amount_paise=870000, status="paid", paid_at=utcnow()),
        ])
        made.append("payouts")
    db.commit()
    return ", ".join(made) or "nothing new"


if __name__ == "__main__":
    if get_settings().seed_demo:
        with SessionLocal() as db:
            print(f"seed_demo: {seed(db)}")
    else:
        print("seed_demo: SEED_DEMO is off, nothing to do")
