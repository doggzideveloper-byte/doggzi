"""Admin panel back office for bookings, providers and the services catalog (service-to-service only).

services/admin is the only caller: it checks the console role (ADMIN / OPS), masks phones for OPS and writes the
audit log. These routes trust X-Internal-Token and are never reachable through the gateway (/internal/ is blocked).

Board columns: Requested → Offered → Accepted → En route → In progress → Completed, plus Cancelled.
OPS may move a card to any column (the panel offers 5 seconds to undo), so moves work in both directions.
"""
import re
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...core import cache, codes, dispatch, notify
from ...core.config import get_settings
from ...core.time import utcnow
from ...db import get_db
from ...models import Booking, BookingItem, JobEvent, Offer, PackageItem, Payout, Provider, ServiceItem, Slot
from .logic import ensure_slots, ist_today

IST = ZoneInfo("Asia/Kolkata")
COLUMNS = ("requested", "offered", "accepted", "enroute", "inprogress", "completed", "cancelled")
STEP_OF = {"accepted": "accepted", "enroute": "travel", "inprogress": "in_service", "completed": "done"}
STAGES = ("applied", "idcheck", "skills", "areas", "training", "live")
SCENES = {"package": "full", "spa": "bathdry", "training": "training", "boarding": "boarding", "pickup": "pickup"}
OVERDUE_MINUTES = 15


def internal_only(x_internal_token: str | None = Header(default=None)) -> None:
    expected = get_settings().internal_token
    if not expected or x_internal_token != expected:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Internal endpoint")


router = APIRouter(prefix="/internal/admin", tags=["internal: admin"], dependencies=[Depends(internal_only)])
aware = dispatch.aware


def ref(b: Booking) -> str:
    return "BK-" + str(b.id)[:4].upper()


def column(b: Booking, live_offer: Offer | None) -> str:
    if b.status == "cancelled":
        return "cancelled"
    if b.status == "completed" or b.job_step in ("completed", "done"):
        return "completed"
    if b.job_step == "in_service":
        return "inprogress"
    if b.job_step in ("travel", "arrived"):
        return "enroute"
    if b.job_step == "accepted":
        return "accepted"
    if live_offer is not None:
        return "offered"
    return "requested"


def _live_offer(db: Session, b: Booking) -> Offer | None:
    return db.scalar(select(Offer).where(Offer.booking_id == b.id, Offer.status == "offered").order_by(Offer.created_at.desc()))


def _card(db: Session, b: Booking, providers: dict | None = None) -> dict:
    o = _live_offer(db, b)
    col = column(b, o)
    pid = b.provider_id or (o.provider_id if o else None)
    p = (providers or {}).get(pid) if providers is not None else (db.get(Provider, pid) if pid else None)
    start = aware(b.slot.starts_at)
    overdue = col in ("requested", "offered", "accepted", "enroute") and start + timedelta(minutes=OVERDUE_MINUTES) < utcnow()
    pay = "Not charged" if col == "cancelled" else f"Collected · {b.collected_mode}" if b.collected_mode else "Pay after service"
    a = b.address_json or {}
    return {
        "id": str(b.id), "ref": ref(b), "column": col, "status": b.status, "job_step": b.job_step, "dispatch_status": b.dispatch_status,
        "pet": b.pet_snapshot or {}, "pet_id": str(b.pet_id), "services": [bi.item.name for bi in b.items], "total_paise": b.total_paise,
        "slot_start": start.isoformat(), "slot_end": aware(b.slot.ends_at).isoformat(), "area": ", ".join(x for x in [a.get("line2"), a.get("city")] if x), "pincode": a.get("pincode"),
        "provider": {"id": str(p.id), "name": p.name} if p else None, "offer_expires_at": aware(o.expires_at).isoformat() if o else None,
        "customer_phone": b.customer_phone, "user_id": str(b.user_id), "pay": pay, "overdue": overdue, "notes": b.notes,
        "created_at": aware(b.created_at).isoformat(),
    }


def _get(db: Session, bid: uuid.UUID) -> Booking:
    b = db.scalar(select(Booking).where(Booking.id == bid).with_for_update(of=Booking))
    if not b:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    return b


# ---------- board ----------
@router.get("/bookings", summary="Board cards: yesterday to +14 days (IST) plus anything still open, or one customer's bookings")
def bookings(user_id: uuid.UUID | None = None, db: Session = Depends(get_db)) -> list[dict]:
    dispatch.sweep(db)
    q = select(Booking).join(Booking.slot)
    if user_id:
        q = q.where(Booking.user_id == user_id)
    else:
        lo = datetime.combine(ist_today() - timedelta(days=1), time(0), IST)
        q = q.where((Slot.starts_at >= lo) | Booking.status.in_(("requested", "confirmed")))
    rows = db.scalars(q.order_by(Slot.starts_at).limit(500)).unique().all()
    providers = {p.id: p for p in db.scalars(select(Provider))}
    return [_card(db, b, providers) for b in rows]


def _release(db: Session, b: Booking, why: str) -> None:
    """Take the booking away from whoever holds it (open offer or accepted job)."""
    for o in db.scalars(select(Offer).where(Offer.booking_id == b.id, Offer.status.in_(("offered", "accepted")))):
        o.status, o.responded_at = ("cancelled" if o.status == "offered" else "released"), utcnow()
    if b.provider_id:
        notify.send("push", str(db.get(Provider, b.provider_id).user_id), "job_removed", {"booking_id": str(b.id), "why": why})
    b.provider_id, b.job_step, b.checklist = None, None, None
    if b.status != "cancelled":
        b.status = "requested"
    b.dispatch_status = "ops_queue"


def _offer_to(db: Session, b: Booking, p: Provider) -> Offer:
    o = Offer(booking_id=b.id, provider_id=p.id, status="offered", expires_at=utcnow() + timedelta(seconds=get_settings().offer_ttl_seconds), earning_paise=dispatch.earning_for(b))
    db.add(o)
    b.dispatch_status = "offered"
    db.flush()
    notify.send("push", str(p.user_id), "provider_offer", {"booking_id": str(b.id)})
    notify.send("whatsapp", p.phone, "provider_offer", {"pet": (b.pet_snapshot or {}).get("name")})
    return o


def _assign(db: Session, b: Booking, p: Provider, step: str) -> None:
    for o in db.scalars(select(Offer).where(Offer.booking_id == b.id, Offer.status == "offered")):
        o.status, o.responded_at = ("accepted" if o.provider_id == p.id else "cancelled"), utcnow()
    if not db.scalar(select(Offer).where(Offer.booking_id == b.id, Offer.provider_id == p.id, Offer.status == "accepted")):
        db.add(Offer(booking_id=b.id, provider_id=p.id, status="accepted", expires_at=utcnow(), responded_at=utcnow(), earning_paise=dispatch.earning_for(b)))
    b.provider_id, b.dispatch_status, b.status = p.id, "assigned", "confirmed"
    b.earning_paise = b.earning_paise or dispatch.earning_for(b)
    if not b.checklist:
        b.checklist = [{"label": it.name, "done": step in ("completed", "done")} for it in dispatch.expanded_items(db, b)]
    codes.ensure_codes(db, b.id)


def _set_step(db: Session, b: Booking, step: str) -> None:
    p = db.get(Provider, b.provider_id)
    was_done = b.status == "completed"
    b.job_step = step
    if step == "done":
        b.status, b.dispatch_status, b.completed_at = "completed", "closed", b.completed_at or utcnow()
        b.checklist = [{**c, "done": True} for c in (b.checklist or [])]
        if not was_done:
            p.jobs_done += 1
    else:
        b.status, b.dispatch_status, b.completed_at = "confirmed", "assigned", None
        if was_done:
            p.jobs_done = max(0, p.jobs_done - 1)


def _cancel(db: Session, b: Booking) -> None:
    meta = {"provider_id": str(b.provider_id) if b.provider_id else None, "job_step": b.job_step, "status": b.status}
    if b.status == "completed":
        raise HTTPException(status.HTTP_409_CONFLICT, "A completed booking can't be cancelled")
    if b.job_step == "in_service":
        raise HTTPException(status.HTTP_409_CONFLICT, "The service has started; finish it or call the provider")
    _release(db, b, "cancelled")
    b.status, b.dispatch_status = "cancelled", "closed"
    slot = db.scalar(select(Slot).where(Slot.id == b.slot_id).with_for_update())
    if slot and slot.booked_count > 0:
        slot.booked_count -= 1
    db.add(JobEvent(booking_id=b.id, step="ops_cancelled", meta=meta))
    notify.send("whatsapp", b.customer_phone, "booking_cancelled", {"pet": (b.pet_snapshot or {}).get("name")})


def _reopen(db: Session, b: Booking) -> None:
    slot = db.scalar(select(Slot).where(Slot.id == b.slot_id).with_for_update())
    if slot.booked_count >= slot.capacity:
        raise HTTPException(status.HTTP_409_CONFLICT, "That slot has filled up since; create a new booking instead")
    slot.booked_count += 1
    b.status, b.dispatch_status = "requested", "ops_queue"
    ev = db.scalar(select(JobEvent).where(JobEvent.booking_id == b.id, JobEvent.step == "ops_cancelled").order_by(JobEvent.created_at.desc()))
    meta = (ev.meta or {}) if ev else {}
    if meta.get("provider_id") and meta.get("job_step"):
        p = db.get(Provider, uuid.UUID(meta["provider_id"]))
        if p:
            _assign(db, b, p, meta["job_step"])
            b.job_step = meta["job_step"]
    db.add(JobEvent(booking_id=b.id, step="ops_reopened"))


class MoveIn(BaseModel):
    to: Literal["requested", "offered", "accepted", "enroute", "inprogress", "completed", "cancelled"]


@router.post("/bookings/{bid}/move", summary="Move a card to another column (both directions, so the panel can undo)")
def move(bid: uuid.UUID, body: MoveIn, db: Session = Depends(get_db)) -> dict:
    b = _get(db, bid)
    before = column(b, _live_offer(db, b))
    to = body.to
    if before == to:
        return {"before": before, **_card(db, b)}
    if to == "cancelled":
        _cancel(db, b)
    else:
        if before == "cancelled":
            _reopen(db, b)
            db.flush()
        cur = column(b, _live_offer(db, b))
        if cur != to:
            holder = b.provider_id or (o.provider_id if (o := _live_offer(db, b)) else None)
            if to == "requested":
                if cur in ("inprogress", "completed"):
                    raise HTTPException(status.HTTP_409_CONFLICT, "The service has started; it can't go back to Requested")
                _release(db, b, "ops_moved")
            elif to == "offered":
                if cur in ("inprogress", "completed"):
                    raise HTTPException(status.HTTP_409_CONFLICT, "The service has started; use Reassign only before it starts")
                if holder:
                    p = db.get(Provider, holder)
                    _release(db, b, "ops_moved")
                    _offer_to(db, b, p)
                else:
                    b.dispatch_status = "pending"
                    if not dispatch.offer_next(db, b):
                        raise HTTPException(status.HTTP_409_CONFLICT, "No eligible provider is free for this slot. Use Reassign to pick one.")
            else:
                if not holder:
                    raise HTTPException(status.HTTP_409_CONFLICT, "Nobody has this booking yet. Use Reassign to pick a provider first.")
                p = db.get(Provider, holder)
                if not b.provider_id:
                    _assign(db, b, p, STEP_OF[to])
                _set_step(db, b, STEP_OF[to])
    db.add(JobEvent(booking_id=b.id, provider_id=b.provider_id, step=f"ops_move_{to}", meta={"from": before}))
    db.commit()
    db.refresh(b)
    return {"before": before, **_card(db, b)}


class ReassignIn(BaseModel):
    provider_id: uuid.UUID


@router.post("/bookings/{bid}/reassign", summary="Offer the booking to a chosen provider (the normal offer timer runs; dispatch carries on if it expires)")
def reassign(bid: uuid.UUID, body: ReassignIn, db: Session = Depends(get_db)) -> dict:
    b = _get(db, bid)
    if b.status in ("cancelled", "completed") or b.job_step in ("in_service", "completed", "done"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a booking that hasn't started can be reassigned")
    p = db.get(Provider, body.provider_id)
    if not p or p.stage != "live" or not p.is_active:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick a live provider")
    o = _live_offer(db, b)
    old = db.get(Provider, b.provider_id or (o.provider_id if o else None)) if (b.provider_id or o) else None
    before = column(b, o)
    _release(db, b, "reassigned")
    _offer_to(db, b, p)
    db.add(JobEvent(booking_id=b.id, step="ops_reassigned", meta={"from": str(old.id) if old else None, "to": str(p.id)}))
    db.commit()
    db.refresh(b)
    return {"before": before, "before_provider": {"id": str(old.id), "name": old.name} if old else None, **_card(db, b)}


class BookingIn(BaseModel):
    user_id: uuid.UUID
    customer_phone: str = Field(max_length=16)
    pet: dict  # {id?, name, type, breed}
    item_slug: str = Field(max_length=80)
    date_: date = Field(alias="date")
    time_: str = Field(alias="time", pattern=r"^\d{2}:\d{2}$")
    address: dict  # {line1?, line2, city, pincode}
    provider_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=500)


@router.post("/bookings", status_code=status.HTTP_201_CREATED, summary="OPS books for a customer (phone / WhatsApp orders)")
def create(body: BookingIn, db: Session = Depends(get_db)) -> dict:
    item = db.scalar(select(ServiceItem).where(ServiceItem.slug == body.item_slug, ServiceItem.is_active.is_(True)))
    if not item or item.price_mode != "fixed" or item.price_paise is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick a bookable service")
    if body.date_ < ist_today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Date can't be in the past")
    if str(body.address.get("pincode") or "") not in get_settings().pincodes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "We don't come to this pincode yet")
    hh, mm = map(int, body.time_.split(":"))
    start = datetime.combine(body.date_, time(hh, mm), IST)
    if start < utcnow():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That time has passed")
    ensure_slots(db, body.date_)
    slot = db.scalar(select(Slot).where(Slot.starts_at == start.astimezone(timezone.utc)).with_for_update())
    if not slot:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick one of the slot times")
    if slot.booked_count >= slot.capacity:
        raise HTTPException(status.HTTP_409_CONFLICT, "That slot is full")
    slot.booked_count += 1
    pet = {k: body.pet.get(k) for k in ("name", "type", "breed")}
    pid = body.pet.get("id")
    b = Booking(user_id=body.user_id, pet_id=uuid.UUID(pid) if pid else uuid.uuid4(), slot_id=slot.id, address_json=body.address, status="requested",
                total_paise=item.price_paise, notes=body.notes, customer_phone=body.customer_phone, pet_snapshot=pet, pay_after_service=True)
    db.add(b)
    db.flush()
    db.add(BookingItem(booking_id=b.id, item_id=item.id, price_paise_at_booking=item.price_paise))
    db.flush()
    db.refresh(b)
    if body.provider_id:
        p = db.get(Provider, body.provider_id)
        if not p or p.stage != "live" or not p.is_active:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick a live provider")
        _offer_to(db, b, p)
    else:
        dispatch.offer_next(db, b)
    db.add(JobEvent(booking_id=b.id, step="ops_created"))
    db.commit()
    db.refresh(b)
    notify.send("whatsapp", b.customer_phone, "booking_received", {"pet": pet.get("name")})
    return _card(db, b)


# ---------- providers ----------
def _owed(db: Session, p: Provider) -> int:
    last = db.scalar(select(func.max(Payout.period_end)).where(Payout.provider_id == p.id))
    pending = db.scalar(select(func.sum(Payout.amount_paise)).where(Payout.provider_id == p.id, Payout.status == "pending")) or 0
    done = db.scalars(select(Booking).where(Booking.provider_id == p.id, Booking.status == "completed")).unique().all()
    unbilled = sum(b.earning_paise or 0 for b in done if b.completed_at and (last is None or aware(b.completed_at).astimezone(IST).date() > last))
    return int(pending + unbilled)


def _provider(db: Session, p: Provider) -> dict:
    labels = dict(dispatch.SKILLS)
    return {"id": str(p.id), "user_id": str(p.user_id), "name": p.name, "phone": p.phone, "stage": p.stage, "paused": not p.is_active, "is_online": p.is_online,
            "rating": round(p.rating, 1), "jobs_done": p.jobs_done, "skills": list(p.skills or []), "skill_labels": [labels.get(s, s) for s in p.skills or []],
            "areas": list(p.areas or []), "docs": list(p.docs or []), "owed_paise": _owed(db, p), "created_at": aware(p.created_at).isoformat()}


@router.get("/providers")
def providers(db: Session = Depends(get_db)) -> list[dict]:
    return [_provider(db, p) for p in db.scalars(select(Provider).order_by(Provider.created_at))]


def _skills(v: list[str]) -> list[str]:
    by_label = {label.lower(): k for k, label in dispatch.SKILLS} | {k: k for k in dispatch.SKILL_KEYS}
    out, bad = [], []
    for s in v:
        k = by_label.get(s.strip().lower())
        (out if k else bad).append(k or s.strip())
    if bad:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown skills: {', '.join(bad)}. Use {', '.join(label for _, label in dispatch.SKILLS)}.")
    return sorted(set(out))


def _pins(v: list[str]) -> list[str]:
    out = sorted({p.strip() for p in v if p.strip()})
    if not out or not all(re.fullmatch(r"\d{6}", p) for p in out):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Use 6-digit pincodes")
    return out


class ProviderIn(BaseModel):
    user_id: uuid.UUID
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(max_length=16)
    skills: list[str] = Field(max_length=20)
    areas: list[str] = Field(max_length=100)


@router.post("/providers", status_code=status.HTTP_201_CREATED, summary="A new provider starts in Applied (dispatch ignores them until Live)")
def add_provider(body: ProviderIn, db: Session = Depends(get_db)) -> dict:
    if db.scalar(select(Provider.id).where(Provider.user_id == body.user_id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "This number is already a provider")
    p = Provider(user_id=body.user_id, name=body.name.strip(), phone=body.phone, skills=_skills(body.skills), areas=_pins(body.areas), stage="applied", is_online=False,
                 rating=5.0, weekly_hours=[{"on": i < 6, "from": 9, "to": 20} for i in range(7)], days_off=[],
                 docs=[{"name": "Aadhaar / ID", "status": "Missing"}, {"name": "Grooming certificate", "status": "Missing"}, {"name": "Police verification", "status": "Missing"}])
    db.add(p)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "This number is already a provider") from e
    return _provider(db, p)


class ProviderPatch(BaseModel):
    stage: Literal["applied", "idcheck", "skills", "areas", "training", "live"] | None = None
    paused: bool | None = None
    skills: list[str] | None = None
    areas: list[str] | None = None


@router.patch("/providers/{pid}")
def patch_provider(pid: uuid.UUID, body: ProviderPatch, db: Session = Depends(get_db)) -> dict:
    p = db.scalar(select(Provider).where(Provider.id == pid).with_for_update(of=Provider))
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider not found")
    before = _provider(db, p)
    if body.stage is not None:
        p.stage = body.stage
        if body.stage == "live" and before["stage"] != "live":
            p.is_online = True
            notify.send("whatsapp", p.phone, "provider_live", {"name": p.name.split(" ")[0]})
    if body.paused is not None:
        p.is_active = not body.paused
        if body.paused:  # open offers move on to someone else
            for o in db.scalars(select(Offer).where(Offer.provider_id == p.id, Offer.status == "offered")):
                o.status, o.responded_at = "cancelled", utcnow()
                db.flush()
                dispatch.offer_next(db, o.booking)
    if body.skills is not None:
        p.skills = _skills(body.skills)
    if body.areas is not None:
        p.areas = _pins(body.areas)
    db.commit()
    return {"before": before, **_provider(db, p)}


@router.get("/payouts", summary="Provider payouts (fortnightly) and what each live provider is owed")
def payouts(db: Session = Depends(get_db)) -> dict:
    ps = {p.id: p for p in db.scalars(select(Provider))}
    rows = db.scalars(select(Payout).order_by(Payout.period_end.desc()).limit(300)).all()
    return {
        "owed": [{"provider_id": str(p.id), "name": p.name, "jobs_done": p.jobs_done, "owed_paise": _owed(db, p)} for p in ps.values() if p.stage == "live"],
        "payouts": [{"id": str(x.id), "provider": ps[x.provider_id].name if x.provider_id in ps else "—", "period_start": x.period_start.isoformat(), "period_end": x.period_end.isoformat(),
                     "amount_paise": x.amount_paise, "status": x.status, "paid_at": aware(x.paid_at).isoformat() if x.paid_at else None} for x in rows],
        "collected": [{"ref": ref(b), "amount_paise": b.total_paise, "mode": b.collected_mode, "at": aware(b.completed_at).isoformat() if b.completed_at else None}
                      for b in db.scalars(select(Booking).where(Booking.collected_mode.is_not(None)).order_by(Booking.completed_at.desc()).limit(300)).unique().all()],
    }


# ---------- numbers ----------
@router.get("/stats", summary="Booking numbers for bookings created in [from, to) (UTC instants); 'now' lists ignore the range")
def stats(frm: datetime = Query(alias="from"), to: datetime = Query(), db: Session = Depends(get_db)) -> dict:
    dispatch.sweep(db)
    rows = db.scalars(select(Booking).where(Booking.created_at >= frm, Booking.created_at < to)).unique().all()
    by = {c: 0 for c in COLUMNS}
    for b in rows:
        by[column(b, _live_offer(db, b))] += 1
    open_rows = db.scalars(select(Booking).where(Booking.status.in_(("requested", "confirmed")))).unique().all()
    providers = {p.id: p for p in db.scalars(select(Provider))}
    overdue = [c for c in (_card(db, b, providers) for b in open_rows) if c["overdue"] or c["dispatch_status"] == "ops_queue"]
    return {"bookings": len(rows), "gmv_paise": sum(b.total_paise for b in rows if b.status != "cancelled"), "by_column": by, "overdue": overdue,
            "applications": [{"name": p.name, "kind": "Provider", "at": aware(p.created_at).isoformat()}
                             for p in sorted((p for p in providers.values() if p.stage != "live"), key=lambda p: aware(p.created_at), reverse=True)[:5]]}


@router.get("/customers", summary="Per customer: booking count, phones used and last address")
def customers(db: Session = Depends(get_db)) -> dict:
    out: dict = {}
    for b in db.scalars(select(Booking).order_by(Booking.created_at)).unique().all():
        c = out.setdefault(str(b.user_id), {"bookings": 0, "address": None, "phones": []})
        c["bookings"] += 1
        c["address"] = b.address_json
        if b.customer_phone and b.customer_phone not in c["phones"]:
            c["phones"].append(b.customer_phone)
    return out


# ---------- services catalog ----------
def _item(i: ServiceItem, includes: list[str]) -> dict:
    return {"id": str(i.id), "slug": i.slug, "group": i.group, "name": i.name, "price_paise": i.price_paise, "price_mode": i.price_mode, "cats": "cat" in (i.pet_types or []),
            "is_active": i.is_active, "includes": includes, "sort_order": i.sort_order}


def _items(db: Session) -> list[dict]:
    names = {i.id: i.name for i in db.scalars(select(ServiceItem))}
    inc: dict = {}
    for pi in db.scalars(select(PackageItem)):
        inc.setdefault(pi.package_id, []).append(names.get(pi.item_id, "?"))
    return [_item(i, sorted(inc.get(i.id, []))) for i in db.scalars(select(ServiceItem).order_by(ServiceItem.sort_order))]


@router.get("/items")
def items(db: Session = Depends(get_db)) -> list[dict]:
    return _items(db)


class ItemPatch(BaseModel):
    price_paise: int | None = Field(default=None, gt=0, le=10_000_000)
    is_active: bool | None = None
    cats: bool | None = None


@router.patch("/items/{iid}")
def patch_item(iid: uuid.UUID, body: ItemPatch, db: Session = Depends(get_db)) -> dict:
    i = db.get(ServiceItem, iid)
    if not i:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    before = {"price_paise": i.price_paise, "is_active": i.is_active, "cats": "cat" in (i.pet_types or [])}
    if body.price_paise is not None:
        if i.price_mode != "fixed":
            raise HTTPException(status.HTTP_409_CONFLICT, "This service is priced on request")
        i.price_paise = body.price_paise
    if body.is_active is not None:
        i.is_active = body.is_active
    if body.cats is not None:
        i.pet_types = ["dog", "cat"] if body.cats else ["dog"]
    db.commit()
    cache.delete_prefix("catalog:")
    return {"before": before, **next(x for x in _items(db) if x["id"] == str(i.id))}


class ItemIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    group: Literal["package", "spa", "training", "boarding", "pickup"]
    price_paise: int = Field(gt=0, le=10_000_000)
    cats: bool = False
    includes: list[str] = Field(default=[], max_length=20)


@router.post("/items", status_code=status.HTTP_201_CREATED, summary="Add a service, or a package made of existing services")
def add_item(body: ItemIn, db: Session = Depends(get_db)) -> dict:
    subs: list[ServiceItem] = []
    if body.group == "package":
        all_items = list(db.scalars(select(ServiceItem).where(ServiceItem.group != "package")))
        by = {i.name.lower(): i for i in all_items} | {i.slug: i for i in all_items}
        wanted = [x.strip() for x in body.includes if x.strip()]
        bad = [x for x in wanted if x.lower() not in by]
        if bad:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown services: {', '.join(bad)}")
        subs = list({by[x.lower()].id: by[x.lower()] for x in wanted}.values())
        if len(subs) < 2:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A package needs at least two services")
    base = re.sub(r"[^a-z0-9]+", "-", body.name.lower()).strip("-")[:70] or "service"
    slug, n = base, 2
    while db.scalar(select(ServiceItem.id).where(ServiceItem.slug == slug)):
        slug, n = f"{base}-{n}", n + 1
    i = ServiceItem(group=body.group, name=body.name.strip(), slug=slug, price_paise=body.price_paise, price_mode="fixed", scene_key=SCENES[body.group],
                    pet_types=["dog", "cat"] if body.cats else ["dog"], is_active=True, sort_order=(db.scalar(select(func.max(ServiceItem.sort_order))) or 0) + 1)
    db.add(i)
    db.flush()
    for s in subs:
        db.add(PackageItem(package_id=i.id, item_id=s.id))
    db.commit()
    cache.delete_prefix("catalog:")
    return next(x for x in _items(db) if x["id"] == str(i.id))
