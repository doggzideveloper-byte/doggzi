"""Service-to-service only (X-Internal-Token; the gateway blocks /internal/ from outside)."""
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core import sessions
from ...core.config import get_settings
from ...db import get_db
from ...models import CONSOLE_ROLES, Membership, User
from .otp import _norm_phone

router = APIRouter(prefix="/internal", tags=["internal"])


def internal_only(x_internal_token: str | None = Header(default=None)) -> None:
    expected = get_settings().internal_token
    if not expected or x_internal_token != expected:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Internal endpoint")


class GrantIn(BaseModel):
    phone: str
    role: str
    name: str | None = None
    _p = field_validator("phone")(lambda cls, v: _norm_phone(v))

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        if v not in CONSOLE_ROLES:
            raise ValueError("Unknown console role")
        return v


class GrantOut(BaseModel):
    user_id: str
    phone: str
    created_user: bool


@router.post("/memberships", response_model=GrantOut, dependencies=[Depends(internal_only)], summary="Give a phone number a console role (creates the user if needed)")
def grant(body: GrantIn, db: Session = Depends(get_db)) -> GrantOut:
    user = db.scalar(select(User).where(User.phone == body.phone))
    created = user is None
    if created:
        user = User(phone=body.phone, role="USER", name=body.name)
        db.add(user)
        db.flush()
    elif body.name and not user.name:
        user.name = body.name
    if not db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.role == body.role)):
        db.add(Membership(user_id=user.id, role=body.role))
    db.commit()
    return GrantOut(user_id=str(user.id), phone=user.phone, created_user=created)


# ---------- Admin panel (called by services/admin only) ----------
def _members(db: Session, user_ids=None) -> list[dict]:
    q = select(Membership).order_by(Membership.created_at)
    if user_ids is not None:
        q = q.where(Membership.user_id.in_(user_ids))
    roles: dict = {}
    for m in db.scalars(q):
        roles.setdefault(m.user_id, []).append(m.role)
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(list(roles))))} if roles else {}
    order = {"ADMIN": 0, "OPS": 1, "VENDOR": 2, "PROVIDER": 3}
    return [{"user_id": str(uid), "name": users[uid].name, "phone": users[uid].phone, "roles": sorted(rs, key=lambda r: order.get(r, 9)),
             "since": users[uid].created_at.isoformat()} for uid, rs in roles.items() if uid in users]


@router.get("/members", dependencies=[Depends(internal_only)], summary="Everyone with a console role")
def members(db: Session = Depends(get_db)) -> list[dict]:
    return _members(db)


@router.delete("/members/{user_id}", dependencies=[Depends(internal_only)], summary="Remove console roles (all, or one) and end their sessions now")
def remove_member(user_id: uuid.UUID, role: str | None = None, db: Session = Depends(get_db)) -> dict:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    q = select(Membership).where(Membership.user_id == user_id)
    if role:
        q = q.where(Membership.role == role)
    gone = [m.role for m in db.scalars(q)]
    for m in db.scalars(q):
        db.delete(m)
    user.token_version += 1  # every console session of this person stops working straight away
    db.commit()
    sessions.publish(user.id, user.token_version)
    return {"user_id": str(user.id), "name": user.name, "phone": user.phone, "removed": gone}


class UserIn(BaseModel):
    phone: str
    name: str | None = None
    must_be_new: bool = False
    _p = field_validator("phone")(lambda cls, v: _norm_phone(v))


@router.post("/users", dependencies=[Depends(internal_only)], summary="Find or create a user by phone (customers added by OPS, new providers)")
def ensure_user(body: UserIn, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.phone == body.phone))
    if user and body.must_be_new:
        raise HTTPException(status.HTTP_409_CONFLICT, "This number already exists")
    created = user is None
    if created:
        user = User(phone=body.phone, role="USER", name=(body.name or "").strip() or None)
        db.add(user)
    elif body.name and not user.name:
        user.name = body.name.strip()
    db.commit()
    return {"user_id": str(user.id), "phone": user.phone, "name": user.name, "created_user": created}


@router.get("/customers", dependencies=[Depends(internal_only)], summary="People without a console role (customers), newest first")
def customers(db: Session = Depends(get_db)) -> list[dict]:
    staff = select(Membership.user_id)
    rows = db.scalars(select(User).where(User.id.not_in(staff)).order_by(User.created_at.desc()).limit(2000))
    return [{"user_id": str(u.id), "name": u.name, "phone": u.phone, "since": u.created_at.isoformat()} for u in rows]


@router.get("/users/{user_id}", dependencies=[Depends(internal_only)])
def get_user(user_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return {"user_id": str(u.id), "name": u.name, "phone": u.phone, "since": u.created_at.isoformat()}
