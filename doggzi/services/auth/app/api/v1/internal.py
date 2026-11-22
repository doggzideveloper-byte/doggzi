"""Service-to-service only (X-Internal-Token; the gateway blocks /internal/ from outside)."""
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

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
