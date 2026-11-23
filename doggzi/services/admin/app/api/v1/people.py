"""Customers (ADMIN full, OPS with masked phones), vendors and providers (ADMIN edits, OPS views), team (ADMIN)."""
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core import notify
from ...core.access import Staff, admin_only, mask_phone, staff
from ...core.audit import record
from ...core.config import get_settings
from ...core.upstream import Upstream, get_upstream
from ...db import get_db
from ...models import CustomerNote, CustomerProfile
from .ops import card, sub

router = APIRouter(tags=["customers, vendors, providers, team"])
V_STAGES = {"applied": "Applied", "docs": "Docs", "razorpay": "Razorpay linked", "live": "Live"}
P_STAGES = {"applied": "Applied", "idcheck": "ID check", "skills": "Skills", "areas": "Areas", "training": "Training done", "live": "Live"}


def phone10(v: str) -> str:
    d = re.sub(r"\D", "", v or "")[-10:]
    if not re.fullmatch(r"[6-9]\d{9}", d):
        raise ValueError("Enter a 10-digit Indian mobile number")
    return d


def pins(v: str | list[str]) -> list[str]:
    items = [p.strip() for p in (v.split(",") if isinstance(v, str) else v) if p.strip()]
    if not items or not all(re.fullmatch(r"\d{6}", p) for p in items):
        raise ValueError("Use 6-digit pincodes separated by commas")
    return items


# ---------- customers ----------
def customer_rows(who: Staff, up: Upstream, db: Session) -> list[dict]:
    with ThreadPoolExecutor(4) as ex:
        fu, fb, fm, fp = (ex.submit(up.get, "auth", "/customers"), ex.submit(up.get, "booking", "/customers"), ex.submit(up.get, "market", "/customers"),
                          ex.submit(up.get, "pets", "/pets"))
        users, bk, mk, pets = fu.result(), fb.result(), fm.result(), fp.result()
    profiles = {str(p.user_id): p for p in db.scalars(select(CustomerProfile))}
    by_owner: dict = {}
    for p in pets:
        by_owner.setdefault(p["owner_user_id"], []).append({"id": p["id"], "name": p["name"], "type": p["type"], "breed": p["breed"]})
    out = []
    for u in users:
        uid = u["user_id"]
        b, m, prof = bk.get(uid, {}), mk.get(uid, {}), profiles.get(uid)
        addr = (m.get("address") or b.get("address") or {})
        area = (prof.area if prof and prof.area else ", ".join(x for x in [addr.get("line2"), addr.get("city")] if x))
        pin = (prof.pincode if prof and prof.pincode else addr.get("pincode"))
        out.append({"user_id": uid, "name": u["name"] or "—", "phone": who.phone(u["phone"]), "area": area or "", "pincode": pin or "", "pets": by_owner.get(uid, []),
                    "bookings": b.get("bookings", 0), "orders": m.get("orders", 0), "since": u["since"]})
    return out


@router.get("/customers", summary="Customers (phones masked for OPS)")
def customers(who: Staff = Depends(staff), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> list[dict]:
    return customer_rows(who, up, db)


@router.get("/customers/{uid}", summary="One customer: pets, bookings & orders, support notes")
def customer(uid: uuid.UUID, who: Staff = Depends(staff), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    u = up.get("auth", f"/users/{uid}")
    with ThreadPoolExecutor(3) as ex:
        fp, fb, fo = ex.submit(up.get, "pets", "/pets", owners=str(uid)), ex.submit(up.get, "booking", "/bookings", user_id=str(uid)), ex.submit(up.get, "market", "/sub-orders", user_id=str(uid))
        pets, bks, sos = fp.result(), fb.result(), fo.result()
    prof = db.scalar(select(CustomerProfile).where(CustomerProfile.user_id == uid))
    last = next((x for x in sorted(bks, key=lambda x: x["created_at"], reverse=True)), None)
    notes = db.scalars(select(CustomerNote).where(CustomerNote.user_id == uid).order_by(CustomerNote.created_at)).all()
    return {"user_id": str(uid), "name": u["name"] or "—", "phone": who.phone(u["phone"]), "area": (prof.area if prof else None) or (last["area"] if last else ""),
            "pincode": (prof.pincode if prof else None) or (last["pincode"] if last else ""),
            "pets": [{"id": p["id"], "name": p["name"], "type": p["type"], "breed": p["breed"]} for p in pets],
            "bookings": [card(c, who) for c in bks], "orders": [sub(s, who) for s in sos],
            "notes": [{"at": n.created_at.isoformat(), "by": n.author_name, "body": n.body} for n in notes]}


class CustomerIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str
    area: str = Field(min_length=2, max_length=120)
    pincode: str = Field(pattern=r"^\d{6}$")
    _p = field_validator("phone")(lambda cls, v: phone10(v))


@router.post("/customers", status_code=status.HTTP_201_CREATED)
def add_customer(body: CustomerIn, who: Staff = Depends(staff), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    r = up.post("auth", "/users", {"phone": body.phone, "name": body.name, "must_be_new": True})
    db.add(CustomerProfile(user_id=uuid.UUID(r["user_id"]), area=body.area.strip(), pincode=body.pincode))
    db.commit()
    record(db, who, "Customers", f"Added customer {body.name.strip()} ({mask_phone(body.phone)})", target=r["user_id"][:8], after="created")
    return {"user_id": r["user_id"], "name": body.name.strip(), "phone": who.phone(body.phone), "area": body.area.strip(), "pincode": body.pincode, "pets": [], "bookings": 0, "orders": 0}


class PetIn(BaseModel):
    name: str = Field(min_length=1, max_length=24)
    type: Literal["dog", "cat"]
    breed: str = Field(min_length=1, max_length=80)


@router.post("/customers/{uid}/pets", status_code=status.HTTP_201_CREATED)
def add_pet(uid: uuid.UUID, body: PetIn, who: Staff = Depends(staff), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    u = up.get("auth", f"/users/{uid}")
    p = up.post("pets", "/pets", {"owner_user_id": str(uid), "name": body.name, "type": body.type, "breed": body.breed})
    record(db, who, "Customers", f"Added pet {p['name']} ({p['breed']}) to {u['name'] or 'customer'}", target=p["id"][:8], after="created")
    return p


class NoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


@router.post("/customers/{uid}/notes", status_code=status.HTTP_201_CREATED)
def add_note(uid: uuid.UUID, body: NoteIn, who: Staff = Depends(staff), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    u = up.get("auth", f"/users/{uid}")
    n = CustomerNote(user_id=uid, author_name=who.user.name or "Staff", body=body.body.strip())
    db.add(n)
    db.commit()
    record(db, who, "Customers", f"Note on {u['name'] or 'customer'}", target=str(uid)[:8], after=body.body.strip())
    return {"at": n.created_at.isoformat(), "by": n.author_name, "body": n.body}


# ---------- vendors ----------
def _vendor(v: dict, who: Staff) -> dict:
    return {**v, "phone": who.phone(v.get("phone")), "stage_label": V_STAGES[v["stage"]]}


@router.get("/vendors", summary="Onboarding pipeline + performance (OPS: view only)")
def vendors(who: Staff = Depends(staff), up: Upstream = Depends(get_upstream)) -> list[dict]:
    return [_vendor(v, who) for v in up.get("market", "/vendors")]


class VendorIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    area: str = Field(min_length=2, max_length=80)
    phone: str
    commission_pct: float = Field(ge=0, le=40)
    pincodes: list[str]
    _p = field_validator("phone")(lambda cls, v: phone10(v))
    _pc = field_validator("pincodes", mode="before")(lambda cls, v: pins(v))


@router.post("/vendors", status_code=status.HTTP_201_CREATED)
def add_vendor(body: VendorIn, who: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    v = up.post("market", "/vendors", body.model_dump())
    record(db, who, "Vendors", f"Added vendor {v['name']}", target=v["slug"], after="Applied")
    return _vendor(v, who)


class VendorPatch(BaseModel):
    stage: Literal["applied", "docs", "razorpay", "live"] | None = None
    paused: bool | None = None
    commission_pct: float | None = Field(default=None, ge=0, le=40)
    pincodes: list[str] | None = None
    undo: bool = False
    _pc = field_validator("pincodes", mode="before")(lambda cls, v: None if v is None else pins(v))


@router.patch("/vendors/{vid}")
def patch_vendor(vid: uuid.UUID, body: VendorPatch, who: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    payload = body.model_dump(exclude_none=True, exclude={"undo"})
    if body.stage == "live":
        cur = next((v for v in up.get("market", "/vendors") if v["id"] == str(vid)), None)
        if cur and cur["stage"] != "live" and cur.get("phone"):
            g = up.post("auth", "/memberships", {"phone": cur["phone"], "role": "VENDOR", "name": None})  # the owner can now sign in to the Vendor panel
            payload["owner_user_id"] = g["user_id"]
    v = up.patch("market", f"/vendors/{vid}", payload)
    b = v.pop("before")
    pre = "Undo: " if body.undo else ""
    if body.stage is not None:
        record(db, who, "Vendors", f"{pre}{v['name']} stage", target=v["slug"], before=V_STAGES[b["stage"]], after=V_STAGES[v["stage"]])
    if body.paused is not None:
        record(db, who, "Vendors", f"{pre}{'Paused' if v['paused'] else 'Resumed'} {v['name']}", target=v["slug"], before="paused" if b["paused"] else "live", after="paused" if v["paused"] else "live")
    if body.commission_pct is not None:
        record(db, who, "Vendors", f"{pre}{v['name']} commission", target=v["slug"], before=f"{b['commission_pct']:g}%", after=f"{v['commission_pct']:g}%")
    if body.pincodes is not None:
        record(db, who, "Vendors", f"{pre}{v['name']} pincodes", target=v["slug"], before=", ".join(b["pincodes"]), after=", ".join(v["pincodes"]))
    return _vendor(v, who)


# ---------- providers ----------
def _provider(p: dict, who: Staff) -> dict:
    return {**p, "phone": who.phone(p.get("phone")), "stage_label": P_STAGES[p["stage"]]}


@router.get("/providers", summary="Onboarding pipeline, rating, jobs, earnings owed (OPS: view only; also the Reassign picker)")
def providers(who: Staff = Depends(staff), up: Upstream = Depends(get_upstream)) -> list[dict]:
    return [_provider(p, who) for p in up.get("booking", "/providers")]


class ProviderIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str
    skills: list[str] = Field(min_length=1, max_length=20)
    areas: list[str]
    _p = field_validator("phone")(lambda cls, v: phone10(v))
    _a = field_validator("areas", mode="before")(lambda cls, v: pins(v))
    _s = field_validator("skills", mode="before")(lambda cls, v: [x.strip() for x in (v.split(",") if isinstance(v, str) else v) if x.strip()])


@router.post("/providers", status_code=status.HTTP_201_CREATED)
def add_provider(body: ProviderIn, who: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    u = up.post("auth", "/users", {"phone": body.phone, "name": body.name})
    p = up.post("booking", "/providers", {"user_id": u["user_id"], "name": body.name, "phone": "+91" + body.phone, "skills": body.skills, "areas": body.areas})
    record(db, who, "Providers", f"Added provider {p['name']}", target=p["id"][:8], after="Applied")
    return _provider(p, who)


class ProviderPatch(BaseModel):
    stage: Literal["applied", "idcheck", "skills", "areas", "training", "live"] | None = None
    paused: bool | None = None
    undo: bool = False


@router.patch("/providers/{pid}")
def patch_provider(pid: uuid.UUID, body: ProviderPatch, who: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    if body.stage == "live":
        cur = next((p for p in up.get("booking", "/providers") if p["id"] == str(pid)), None)
        if cur and cur["stage"] != "live" and cur.get("phone"):
            up.post("auth", "/memberships", {"phone": cur["phone"], "role": "PROVIDER", "name": cur["name"]})  # can now sign in to the Provider panel
    p = up.patch("booking", f"/providers/{pid}", body.model_dump(exclude_none=True, exclude={"undo"}))
    b = p.pop("before")
    pre = "Undo: " if body.undo else ""
    if body.stage is not None:
        record(db, who, "Providers", f"{pre}{p['name']} stage", target=p["id"][:8], before=P_STAGES[b["stage"]], after=P_STAGES[p["stage"]])
    if body.paused is not None:
        record(db, who, "Providers", f"{pre}{'Paused' if p['paused'] else 'Resumed'} {p['name']}", target=p["id"][:8], before="paused" if b["paused"] else "live",
               after="paused" if p["paused"] else "live")
    return _provider(p, who)


# ---------- team ----------
def team_rows(up: Upstream) -> list[dict]:
    from ...core.access import show_phone

    return [{**m, "phone": show_phone(m["phone"])} for m in up.get("auth", "/members")]


@router.get("/team", summary="Everyone with a console role")
def team(_: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream)) -> list[dict]:
    return team_rows(up)


class InviteIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str
    role: Literal["ADMIN", "OPS", "VENDOR", "PROVIDER"]
    _p = field_validator("phone")(lambda cls, v: phone10(v))


@router.post("/team", status_code=status.HTTP_201_CREATED, summary="Invite by phone: they sign in to /console with an OTP")
def invite(body: InviteIn, who: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    members = up.get("auth", "/members")
    if any(m["phone"].endswith(body.phone) and body.role in m["roles"] for m in members):
        raise HTTPException(status.HTTP_409_CONFLICT, f"This number is already {body.role}")
    up.post("auth", "/memberships", {"phone": body.phone, "role": body.role, "name": body.name})
    notify.send("whatsapp", "+91" + body.phone, "console_invite", {"name": body.name.split(" ")[0], "role": body.role, "link": get_settings().console_url or "/console"})
    record(db, who, "Team", f"Invited {body.name.strip()} ({mask_phone(body.phone)})", target=mask_phone(body.phone), after=body.role)
    return {"ok": True}


@router.delete("/team/{user_id}", summary="Remove console access (all roles) and end their sessions now")
def remove(user_id: uuid.UUID, who: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    if user_id == who.user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You can't remove yourself")
    r = up.delete("auth", f"/members/{user_id}")
    record(db, who, "Team", f"Removed {r['name'] or 'member'} ({mask_phone(r['phone'])})", target=mask_phone(r["phone"]), before=" + ".join(r["removed"]) or "—", after="none")
    return {"ok": True}
