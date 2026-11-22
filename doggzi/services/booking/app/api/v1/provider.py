"""Provider panel API. Every query is scoped to the provider of the signed-in console user (role PROVIDER):
another provider's offers and jobs are simply not found (404)."""
import uuid
from datetime import date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core import codes, dispatch, notify
from ...core.console import ConsoleUser, require_roles
from ...core.time import utcnow
from ...db import get_db
from ...models import Booking, BookingCode, JobEvent, Offer, Payout, Provider

router = APIRouter(prefix="/provider", tags=["provider panel"])
IST = ZoneInfo("Asia/Kolkata")
ACTIVE = ("accepted", "travel", "arrived", "in_service", "completed")
STEP_WA = {"travel": "job_on_the_way", "arrived": "job_arrived", "in_service": "job_started", "completed": "job_finished", "done": "job_done"}


# ---------- schemas ----------
class DayHours(BaseModel):
    on: bool
    from_: int = Field(alias="from", ge=0, le=24)
    to: int = Field(ge=0, le=24)
    model_config = {"populate_by_name": True}


class ProfileOut(BaseModel):
    id: uuid.UUID
    name: str
    rating: float
    jobs_done: int
    is_online: bool
    skills: list[str]
    skill_options: list[dict]
    areas: list[str]
    docs: list[dict]
    help_whatsapp: str | None
    demo: bool = False


class ProfilePatch(BaseModel):
    is_online: bool | None = None
    skills: list[str] | None = None
    areas: list[str] | None = None

    @field_validator("skills")
    @classmethod
    def _skills(cls, v):
        if v is not None and not set(v) <= dispatch.SKILL_KEYS:
            raise ValueError("Unknown skill")
        return v

    @field_validator("areas")
    @classmethod
    def _areas(cls, v):
        if v is not None and (len(v) > 40 or not all(len(p) == 6 and p.isdigit() for p in v)):
            raise ValueError("Pincodes are 6 digits")
        return v


class Availability(BaseModel):
    weekly_hours: list[DayHours] = Field(min_length=7, max_length=7)
    days_off: list[date] = Field(default_factory=list, max_length=60)

    @field_validator("weekly_hours")
    @classmethod
    def _hours(cls, v):
        for d in v:
            if d.on and d.from_ >= d.to:
                raise ValueError("Each working day must end after it starts")
        return v


class ServiceOut(BaseModel):
    name: str
    scene: str


class PetOut(BaseModel):
    name: str
    type: str
    breed: str | None
    note: str | None


class OfferOut(BaseModel):
    id: uuid.UUID
    booking_id: uuid.UUID
    expires_at: datetime
    seconds_left: int
    ttl_seconds: int
    earning_paise: int
    services: list[ServiceOut]
    pet: PetOut
    slot_start: datetime
    area: str


class ChecklistItem(BaseModel):
    label: str
    done: bool


class JobOut(BaseModel):
    id: uuid.UUID
    ref: str
    step: str
    slot_start: datetime
    slot_end: datetime
    services: list[ServiceOut]
    pet: PetOut
    area: str
    address: dict | None
    customer_phone: str
    phone_visible: bool
    earning_paise: int
    total_paise: int
    pay_after_service: bool
    collected_mode: str | None
    checklist: list[ChecklistItem]
    photos: dict
    code_locked: dict


class CodeIn(BaseModel):
    code: str = Field(pattern=r"^\d{4}$")


class ChecklistIn(BaseModel):
    done: list[bool] = Field(max_length=40)


class CollectIn(BaseModel):
    mode: Literal["UPI", "Cash"]


class DeclineIn(BaseModel):
    reason: Literal["Too far", "Not available", "Not my skill", "Other"]


# ---------- helpers ----------
def me(u: ConsoleUser = Depends(require_roles("PROVIDER")), db: Session = Depends(get_db)) -> Provider:
    p = db.scalar(select(Provider).where(Provider.user_id == u.id))
    if not p or not p.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No active provider profile for this login. Ask OPS to set you up.")
    return p


def mask(phone: str | None) -> str:
    d = "".join(c for c in (phone or "") if c.isdigit())[-10:]
    return f"{d[:2]}xxxxxx{d[-2:]}" if len(d) == 10 else "xxxxxxxxxx"


def _aware(d):
    return dispatch.aware(d)


def _area(b: Booking) -> str:
    a = b.address_json or {}
    return " · ".join(x for x in [", ".join(x for x in [a.get("line2"), a.get("city")] if x), a.get("pincode")] if x)


def _pet(b: Booking) -> PetOut:
    p = b.pet_snapshot or {}
    return PetOut(name=p.get("name") or "Pet", type=p.get("type") or "dog", breed=p.get("breed"), note=b.notes)


def _services(b: Booking) -> list[ServiceOut]:
    return [ServiceOut(name=bi.item.name, scene=bi.item.scene_key) for bi in b.items]


def _next_job_id(db: Session, provider_id) -> uuid.UUID | None:
    """The provider's current job: the earliest one not yet done."""
    rows = [b for b in db.scalars(select(Booking).where(Booking.provider_id == provider_id, Booking.job_step.is_not(None), Booking.job_step != "done")).unique().all()]
    return min(rows, key=lambda b: _aware(b.slot.starts_at)).id if rows else None


def _job(b: Booking, db: Session) -> JobOut:
    # Customer's number: only for the job that is under way, or the provider's next job once accepted.
    visible = b.job_step in ACTIVE and (b.job_step != "accepted" or _next_job_id(db, b.provider_id) == b.id)
    locked = {k: bool(r.locked_at) for k, r in ((c.kind, c) for c in db.scalars(select(BookingCode).where(BookingCode.booking_id == b.id)))}
    return JobOut(
        id=b.id, ref="BK-" + str(b.id)[:4].upper(), step=b.job_step or "accepted", slot_start=_aware(b.slot.starts_at), slot_end=_aware(b.slot.ends_at),
        services=_services(b), pet=_pet(b), area=_area(b), address=b.address_json if visible else None,
        customer_phone=(b.customer_phone or "") if visible else mask(b.customer_phone), phone_visible=visible,
        earning_paise=b.earning_paise or dispatch.earning_for(b), total_paise=b.total_paise, pay_after_service=b.pay_after_service, collected_mode=b.collected_mode,
        checklist=[ChecklistItem(**c) for c in (b.checklist or [])], photos={k: True for k in (b.photos or {})}, code_locked=locked,
    )


def _my_job(db: Session, p: Provider, job_id: uuid.UUID, lock: bool = False) -> Booking:
    q = select(Booking).where(Booking.id == job_id, Booking.provider_id == p.id)
    b = db.scalar(q.with_for_update(of=Booking) if lock else q)
    if not b:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return b


def _step(db: Session, p: Provider, b: Booking, frm: tuple[str, ...], to: str, meta: dict | None = None) -> None:
    if b.job_step not in frm:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This job is at '{b.job_step}', not ready for that step")
    b.job_step = to
    db.add(JobEvent(booking_id=b.id, provider_id=p.id, step=to, meta=meta))
    if to in STEP_WA:
        notify.send("whatsapp", b.customer_phone, STEP_WA[to], {"provider": p.name.split(" ")[0], "pet": (b.pet_snapshot or {}).get("name")})


def _finish(p: Provider, b: Booking) -> None:
    b.job_step = "done"
    b.status = "completed"
    b.dispatch_status = "closed"
    b.completed_at = utcnow()
    b.earning_paise = b.earning_paise or dispatch.earning_for(b)
    p.jobs_done += 1


# ---------- profile ----------
def _profile(p: Provider) -> ProfileOut:
    from ...core.config import get_settings

    return ProfileOut(id=p.id, name=p.name, rating=round(p.rating, 1), jobs_done=p.jobs_done, is_online=p.is_online, skills=list(p.skills or []),
                      skill_options=[{"key": k, "label": label} for k, label in dispatch.SKILLS], areas=list(p.areas or []), docs=list(p.docs or []),
                      help_whatsapp=get_settings().ops_whatsapp or None, demo=get_settings().seed_demo)


@router.get("/me", response_model=ProfileOut)
def get_profile(p: Provider = Depends(me)) -> ProfileOut:
    return _profile(p)


@router.patch("/me", response_model=ProfileOut, summary="Online toggle, skills, areas")
def patch_profile(body: ProfilePatch, p: Provider = Depends(me), db: Session = Depends(get_db)) -> ProfileOut:
    if body.is_online is not None:
        p.is_online = body.is_online
        if not body.is_online:  # going offline hands back any open offer
            for o in db.scalars(select(Offer).where(Offer.provider_id == p.id, Offer.status == "offered")):
                o.status, o.responded_at, o.decline_reason = "declined", utcnow(), "Went offline"
                db.flush()
                dispatch.offer_next(db, o.booking)
    if body.skills is not None:
        p.skills = sorted(set(body.skills))
    if body.areas is not None:
        p.areas = sorted(set(body.areas))
    db.commit()
    return _profile(p)


@router.post("/me/docs/{index}", response_model=ProfileOut, summary="Upload a verification document (stored as metadata only for now)")
async def upload_doc(index: int, file: UploadFile = File(...), p: Provider = Depends(me), db: Session = Depends(get_db)) -> ProfileOut:
    docs = list(p.docs or [])
    if not 0 <= index < len(docs):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    data = await file.read(10 * 1024 * 1024 + 1)
    if len(data) > 10 * 1024 * 1024 or not (file.content_type or "").startswith(("image/", "application/pdf")):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Upload a photo or PDF under 10 MB")
    docs[index] = {**docs[index], "status": "In review", "file": file.filename, "size": len(data), "uploaded_at": utcnow().isoformat()}
    p.docs = docs
    db.commit()
    return _profile(p)


# ---------- availability ----------
@router.get("/availability", response_model=Availability)
def get_availability(p: Provider = Depends(me)) -> Availability:
    return Availability(weekly_hours=[DayHours(**d) for d in (p.weekly_hours or [])] or [DayHours(on=False, **{"from": 9}, to=18)] * 7,
                        days_off=[date.fromisoformat(d) for d in (p.days_off or [])])


@router.put("/availability", response_model=Availability, summary="Weekly hours (IST) and days off; dispatch only offers slots inside them")
def put_availability(body: Availability, p: Provider = Depends(me), db: Session = Depends(get_db)) -> Availability:
    p.weekly_hours = [{"on": d.on, "from": d.from_, "to": d.to} for d in body.weekly_hours]
    p.days_off = sorted({d.isoformat() for d in body.days_off})
    db.commit()
    return get_availability(p)


# ---------- offers ----------
def _offer_out(o: Offer) -> OfferOut:
    from ...core.config import get_settings

    b = o.booking
    left = max(0, int((_aware(o.expires_at) - utcnow()).total_seconds()))
    return OfferOut(id=o.id, booking_id=b.id, expires_at=_aware(o.expires_at), seconds_left=left, ttl_seconds=get_settings().offer_ttl_seconds,
                    earning_paise=o.earning_paise, services=_services(b), pet=_pet(b), slot_start=_aware(b.slot.starts_at), area=_area(b))


@router.get("/offers", response_model=list[OfferOut], summary="Open offers for me (expired ones move on first)")
def offers(p: Provider = Depends(me), db: Session = Depends(get_db)) -> list[OfferOut]:
    dispatch.sweep(db)
    rows = db.scalars(select(Offer).where(Offer.provider_id == p.id, Offer.status == "offered").order_by(Offer.expires_at)).all()
    return [_offer_out(o) for o in rows]


def _my_offer(db: Session, p: Provider, offer_id: uuid.UUID) -> Offer:
    dispatch.sweep(db)
    o = db.scalar(select(Offer).where(Offer.id == offer_id, Offer.provider_id == p.id).with_for_update(of=Offer))
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Offer not found")
    if o.status != "offered":
        raise HTTPException(status.HTTP_409_CONFLICT, "This offer has expired or was already answered")
    return o


@router.post("/offers/{offer_id}/accept", response_model=JobOut)
def accept(offer_id: uuid.UUID, p: Provider = Depends(me), db: Session = Depends(get_db)) -> JobOut:
    o = _my_offer(db, p, offer_id)
    b = db.scalar(select(Booking).where(Booking.id == o.booking_id).with_for_update(of=Booking))
    if b.provider_id is not None or b.status in ("cancelled", "completed"):
        o.status = "cancelled"
        db.commit()
        raise HTTPException(status.HTTP_409_CONFLICT, "This booking is no longer available")
    o.status, o.responded_at = "accepted", utcnow()
    b.provider_id, b.job_step, b.dispatch_status, b.status = p.id, "accepted", "assigned", "confirmed"
    b.earning_paise = o.earning_paise
    b.checklist = [{"label": it.name, "done": False} for it in dispatch.expanded_items(db, b)]
    codes.ensure_codes(db, b.id)
    db.add(JobEvent(booking_id=b.id, provider_id=p.id, step="accepted"))
    db.commit()
    notify.send("whatsapp", b.customer_phone, "job_confirmed", {"provider": p.name.split(" ")[0]})
    return _job(b, db)


@router.post("/offers/{offer_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline(offer_id: uuid.UUID, body: DeclineIn, p: Provider = Depends(me), db: Session = Depends(get_db)) -> None:
    o = _my_offer(db, p, offer_id)
    o.status, o.responded_at, o.decline_reason = "declined", utcnow(), body.reason
    db.flush()
    dispatch.offer_next(db, o.booking)
    db.commit()


# ---------- jobs ----------
@router.get("/jobs", response_model=list[JobOut], summary="My jobs for an IST date (default today)")
def jobs(date_: date | None = Query(default=None, alias="date"), p: Provider = Depends(me), db: Session = Depends(get_db)) -> list[JobOut]:
    dispatch.sweep(db)
    d = date_ or datetime.now(IST).date()
    lo = datetime.combine(d, time(0), IST)
    hi = lo + timedelta(days=1)
    rows = [b for b in db.scalars(select(Booking).where(Booking.provider_id == p.id)).unique().all() if lo <= _aware(b.slot.starts_at) < hi]
    rows.sort(key=lambda b: _aware(b.slot.starts_at))
    return [_job(b, db) for b in rows]


@router.post("/jobs/{job_id}/travel", response_model=JobOut)
def travel(job_id: uuid.UUID, p: Provider = Depends(me), db: Session = Depends(get_db)) -> JobOut:
    b = _my_job(db, p, job_id, lock=True)
    _step(db, p, b, ("accepted",), "travel")
    db.commit()
    return _job(b, db)


@router.post("/jobs/{job_id}/arrive", response_model=JobOut)
def arrive(job_id: uuid.UUID, p: Provider = Depends(me), db: Session = Depends(get_db)) -> JobOut:
    b = _my_job(db, p, job_id, lock=True)
    _step(db, p, b, ("travel",), "arrived")
    db.commit()
    return _job(b, db)


@router.post("/jobs/{job_id}/start", response_model=JobOut, summary="Customer's 4-digit start code (5 tries)")
def start(job_id: uuid.UUID, body: CodeIn, p: Provider = Depends(me), db: Session = Depends(get_db)) -> JobOut:
    b = _my_job(db, p, job_id, lock=True)
    if b.job_step != "arrived":
        raise HTTPException(status.HTTP_409_CONFLICT, "Mark yourself arrived first")
    codes.check(db, b.id, "start", body.code)
    _step(db, p, b, ("arrived",), "in_service")
    db.commit()
    return _job(b, db)


@router.post("/jobs/{job_id}/checklist", response_model=JobOut)
def checklist(job_id: uuid.UUID, body: ChecklistIn, p: Provider = Depends(me), db: Session = Depends(get_db)) -> JobOut:
    b = _my_job(db, p, job_id, lock=True)
    if b.job_step != "in_service":
        raise HTTPException(status.HTTP_409_CONFLICT, "Start the service first")
    items = list(b.checklist or [])
    if len(body.done) != len(items):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Checklist length doesn't match the booking")
    b.checklist = [{**it, "done": d} for it, d in zip(items, body.done)]
    db.commit()
    return _job(b, db)


@router.post("/jobs/{job_id}/photos", response_model=JobOut, summary="Optional before/after photo (metadata only for now)")
async def photo(job_id: uuid.UUID, which: Literal["before", "after"] = Query(), file: UploadFile = File(...), p: Provider = Depends(me), db: Session = Depends(get_db)) -> JobOut:
    b = _my_job(db, p, job_id, lock=True)
    if b.job_step != "in_service":
        raise HTTPException(status.HTTP_409_CONFLICT, "Photos are added during the service")
    data = await file.read(10 * 1024 * 1024 + 1)
    if len(data) > 10 * 1024 * 1024 or not (file.content_type or "").startswith("image/"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Upload a photo under 10 MB")
    b.photos = {**(b.photos or {}), which: {"name": file.filename, "size": len(data), "at": utcnow().isoformat()}}
    db.commit()
    return _job(b, db)


@router.post("/jobs/{job_id}/complete", response_model=JobOut, summary="Customer's 4-digit end code (5 tries)")
def complete(job_id: uuid.UUID, body: CodeIn, p: Provider = Depends(me), db: Session = Depends(get_db)) -> JobOut:
    b = _my_job(db, p, job_id, lock=True)
    if b.job_step != "in_service":
        raise HTTPException(status.HTTP_409_CONFLICT, "Start the service first")
    if not all(c.get("done") for c in (b.checklist or [])):
        raise HTTPException(status.HTTP_409_CONFLICT, "Tick every checklist item first")
    codes.check(db, b.id, "end", body.code)
    _step(db, p, b, ("in_service",), "completed")
    if not b.pay_after_service:
        _finish(p, b)
    db.commit()
    return _job(b, db)


@router.post("/jobs/{job_id}/collect", response_model=JobOut, summary="Mark pay-after-service payment collected")
def collect(job_id: uuid.UUID, body: CollectIn, p: Provider = Depends(me), db: Session = Depends(get_db)) -> JobOut:
    b = _my_job(db, p, job_id, lock=True)
    if b.job_step != "completed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Complete the service first")
    b.collected_mode = body.mode
    db.add(JobEvent(booking_id=b.id, provider_id=p.id, step="collected", meta={"mode": body.mode, "amount_paise": b.total_paise}))
    _finish(p, b)
    notify.send("whatsapp", b.customer_phone, STEP_WA["done"], {"mode": body.mode})
    db.commit()
    return _job(b, db)


@router.post("/jobs/{job_id}/release", status_code=status.HTTP_204_NO_CONTENT, summary="Can't make it: back to dispatch (lowers rating)")
def release(job_id: uuid.UUID, p: Provider = Depends(me), db: Session = Depends(get_db)) -> None:
    b = _my_job(db, p, job_id, lock=True)
    if b.job_step not in ("accepted", "travel"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Once you've arrived, ask OPS for help instead")
    for o in db.scalars(select(Offer).where(Offer.booking_id == b.id, Offer.provider_id == p.id, Offer.status == "accepted")):
        o.status, o.responded_at = "released", utcnow()
    b.provider_id, b.job_step, b.checklist, b.dispatch_status, b.status = None, None, None, "pending", "requested"
    p.cant_make_count += 1
    p.rating = max(1.0, round(p.rating - 0.1, 2))
    db.add(JobEvent(booking_id=b.id, provider_id=p.id, step="released"))
    db.flush()
    dispatch.offer_next(db, b)
    db.commit()


# ---------- earnings ----------
class EarnJob(BaseModel):
    title: str
    at: datetime
    amount_paise: int


class EarnPayout(BaseModel):
    period_start: date
    period_end: date
    amount_paise: int
    status: str


class EarningsOut(BaseModel):
    today_paise: int
    week_paise: int
    month_paise: int
    jobs: list[EarnJob]
    payouts: list[EarnPayout]


@router.get("/earnings", response_model=EarningsOut, summary="Today / this week / this month (IST), per-job list and payouts")
def earnings(p: Provider = Depends(me), db: Session = Depends(get_db)) -> EarningsOut:
    now = datetime.now(IST)
    d0 = datetime.combine(now.date(), time(0), IST)
    w0 = d0 - timedelta(days=now.weekday())
    m0 = d0.replace(day=1)
    done = [b for b in db.scalars(select(Booking).where(Booking.provider_id == p.id, Booking.job_step == "done")).unique().all() if b.completed_at]
    tot = lambda since: sum(b.earning_paise or 0 for b in done if _aware(b.completed_at) >= since)  # noqa: E731
    week = sorted((b for b in done if _aware(b.completed_at) >= w0), key=lambda b: b.completed_at, reverse=True)
    pays = db.scalars(select(Payout).where(Payout.provider_id == p.id).order_by(Payout.period_start.desc()).limit(12)).all()
    return EarningsOut(
        today_paise=tot(d0), week_paise=tot(w0), month_paise=tot(m0),
        jobs=[EarnJob(title=f"{' + '.join(bi.item.name for bi in b.items)} · {(b.pet_snapshot or {}).get('name', 'Pet')}", at=_aware(b.completed_at), amount_paise=b.earning_paise or 0) for b in week],
        payouts=[EarnPayout(period_start=x.period_start, period_end=x.period_end, amount_paise=x.amount_paise, status=x.status) for x in pays],
    )


@router.post("/demo/offer", response_model=OfferOut, summary="SEED_DEMO only: ring me with a fresh demo offer")
def demo_offer(p: Provider = Depends(me), db: Session = Depends(get_db)) -> OfferOut:
    from ...core.config import get_settings
    from ...seed_demo import demo_offer as make

    if not get_settings().seed_demo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    if not p.is_online:
        raise HTTPException(status.HTTP_409_CONFLICT, "You're offline, so no offers are coming in.")
    o = make(db, p)
    db.commit()
    return _offer_out(o)
