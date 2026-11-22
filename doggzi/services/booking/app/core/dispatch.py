"""Dispatch: offer each booking to one provider at a time.

Eligible = active + online, has every skill the booking needs, serves the pincode, works that IST weekday and
hour, isn't on a day off, has no other job in that slot, and wasn't offered this booking before.
Best first: higher rating, then fewer completed jobs (spreads work), then oldest profile.
An offer expires after OFFER_TTL_SECONDS (lazily on every read + a background sweep) and moves on; when nobody
is left the booking goes to the OPS queue.
"""
import uuid
from datetime import timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Booking, Offer, PackageItem, Provider, ServiceItem
from . import notify
from .config import get_settings
from .time import utcnow

IST = ZoneInfo("Asia/Kolkata")
# Provider skill chips (as in the Provider panel design) and what each service needs.
SKILLS = [("bath", "Bath"), ("dry", "Blow dry"), ("trim", "Trim"), ("style", "Styling"), ("dental", "Dental"), ("massage", "Massage"), ("dematting", "De-matting"), ("training", "Training"), ("boarding", "Boarding")]
SKILL_KEYS = {k for k, _ in SKILLS}
NEEDS = {
    "bath-blow-dry": {"bath", "dry"}, "medicated-bath": {"bath"}, "boot-cut": {"trim"}, "full-trim": {"trim"}, "face-styling": {"style"},
    "breed-styling": {"trim", "style"}, "body-massage": {"massage"}, "oil-massage": {"massage"}, "dental-cleaning": {"dental"},
    "light-dematting": {"dematting"}, "normal-dematting": {"dematting"}, "training": {"training"}, "boarding": {"boarding"},
}
LIVE = ("offered", "accepted")


def aware(d):
    return d if d is None or d.tzinfo else d.replace(tzinfo=timezone.utc)


def expanded_items(db: Session, b: Booking) -> list[ServiceItem]:
    """Booked items with packages replaced by their contents (for skills and the checklist)."""
    out: list[ServiceItem] = []
    for bi in b.items:
        it = bi.item
        if it.group == "package":
            ids = list(db.scalars(select(PackageItem.item_id).where(PackageItem.package_id == it.id)))
            subs = list(db.scalars(select(ServiceItem).where(ServiceItem.id.in_(ids)).order_by(ServiceItem.sort_order))) if ids else []
            out.extend(subs or [it])
        else:
            out.append(it)
    seen, uniq = set(), []
    for it in out:
        if it.id not in seen:
            seen.add(it.id)
            uniq.append(it)
    return uniq


def skills_needed(db: Session, b: Booking) -> set[str]:
    need: set[str] = set()
    for it in expanded_items(db, b):
        need |= NEEDS.get(it.slug, set())
    return need


def _works_then(p: Provider, b: Booking) -> bool:
    start = aware(b.slot.starts_at).astimezone(IST)
    end = aware(b.slot.ends_at).astimezone(IST)
    if start.date().isoformat() in (p.days_off or []):
        return False
    hours = p.weekly_hours or []
    if len(hours) != 7:
        return False
    d = hours[start.weekday()]
    if not d.get("on"):
        return False
    end_h = end.hour + end.minute / 60
    return d.get("from", 0) <= start.hour + start.minute / 60 and end_h <= d.get("to", 0)


def _busy(db: Session, p: Provider, b: Booking) -> bool:
    other = db.scalars(select(Booking).where(Booking.provider_id == p.id, Booking.id != b.id, Booking.job_step.is_not(None))).all()
    s0, s1 = aware(b.slot.starts_at), aware(b.slot.ends_at)
    return any(aware(o.slot.starts_at) < s1 and s0 < aware(o.slot.ends_at) for o in other if o.job_step != "done")


def earning_for(b: Booking) -> int:
    return round(b.total_paise * get_settings().provider_share_pct / 100)


def eligible(db: Session, b: Booking) -> list[Provider]:
    need = skills_needed(db, b)
    pin = (b.address_json or {}).get("pincode")
    tried = set(db.scalars(select(Offer.provider_id).where(Offer.booking_id == b.id)))
    ps = db.scalars(select(Provider).where(Provider.is_active.is_(True), Provider.is_online.is_(True))).all()
    ok = [p for p in ps if p.id not in tried and need <= set(p.skills or []) and pin in (p.areas or []) and _works_then(p, b) and not _busy(db, p, b)]
    return sorted(ok, key=lambda p: (-p.rating, p.jobs_done, p.created_at))


def offer_next(db: Session, b: Booking) -> Offer | None:
    """Offer the booking to the best eligible provider, or move it to the OPS queue. Caller commits."""
    if b.status in ("cancelled", "completed") or b.provider_id is not None:
        return None
    if db.scalar(select(Offer).where(Offer.booking_id == b.id, Offer.status == "offered")):
        return None
    cands = eligible(db, b)
    if not cands:
        b.dispatch_status = "ops_queue"
        return None
    p = cands[0]
    o = Offer(booking_id=b.id, provider_id=p.id, status="offered", expires_at=utcnow() + timedelta(seconds=get_settings().offer_ttl_seconds), earning_paise=earning_for(b))
    db.add(o)
    b.dispatch_status = "offered"
    db.flush()
    notify.send("push", str(p.user_id), "provider_offer", {"booking_id": str(b.id)})
    notify.send("whatsapp", p.phone, "provider_offer", {"pet": (b.pet_snapshot or {}).get("name")})
    return o


def sweep(db: Session, provider_id: uuid.UUID | None = None) -> int:
    """Expire overdue offers and re-dispatch their bookings. Returns how many expired."""
    q = select(Offer).where(Offer.status == "offered", Offer.expires_at <= utcnow())
    if provider_id is not None:
        q = q.where(Offer.provider_id == provider_id)
    n = 0
    for o in db.scalars(q.with_for_update(of=Offer)).all():
        o.status = "expired"
        o.responded_at = utcnow()
        db.flush()
        offer_next(db, o.booking)
        n += 1
    if n:
        db.commit()
    return n
