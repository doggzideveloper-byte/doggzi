"""Console login (Admin / Vendor / Provider panels): same OTP, team members only, 12-hour role-bearing token."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core import sessions
from ...core.security import ConsoleUser, get_console_user, issue_console_token
from ...db import get_db
from ...models import CONSOLE_ROLES, Membership, User
from ...notify import OtpSender, get_sender
from .otp import OtpRequestIn, OtpRequestOut, OtpVerifyIn, consume_code, send_code

router = APIRouter(prefix="/console", tags=["console"])
NOT_TEAM = "This number isn't on the Doggzi team. Ask an admin to invite you."


class ConsoleMe(BaseModel):
    id: str
    phone: str
    name: str
    roles: list[str]


class ConsoleTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: ConsoleMe


def _member(db: Session, phone: str) -> tuple[User, list[str]] | None:
    user = db.scalar(select(User).where(User.phone == phone))
    if not user:
        return None
    roles = sorted(r for r in db.scalars(select(Membership.role).where(Membership.user_id == user.id)) if r in CONSOLE_ROLES)
    return (user, roles) if roles else None


def _me(user: User, roles: list[str]) -> ConsoleMe:
    return ConsoleMe(id=str(user.id), phone=user.phone, name=user.name or user.phone, roles=roles)


@router.post("/otp/request", response_model=OtpRequestOut, summary="Text a code to a team member's number")
def console_request(body: OtpRequestIn, request: Request, db: Session = Depends(get_db), sender: OtpSender = Depends(get_sender)) -> OtpRequestOut:
    if not _member(db, body.phone):
        raise HTTPException(status.HTTP_403_FORBIDDEN, NOT_TEAM)
    return send_code(body.phone, request, db, sender)


@router.post("/otp/verify", response_model=ConsoleTokenOut, summary="Check the code; return a 12-hour console token with roles")
def console_verify(body: OtpVerifyIn, db: Session = Depends(get_db)) -> ConsoleTokenOut:
    m = _member(db, body.phone)
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, NOT_TEAM)
    consume_code(body.phone, body.code, db)
    db.commit()
    user, roles = m
    sessions.publish(user.id, user.token_version)
    token, ttl = issue_console_token(user.id, user.phone, user.name or user.phone, roles, user.token_version)
    return ConsoleTokenOut(access_token=token, expires_in=ttl, user=_me(user, roles))


def current_console_user(cu: ConsoleUser = Depends(get_console_user), db: Session = Depends(get_db)) -> tuple[ConsoleUser, User]:
    user = db.get(User, cu.id)
    if not user or cu.tv < user.token_version:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")
    return cu, user


@router.get("/me", response_model=ConsoleMe, summary="Who is signed in (roles re-read from the database)")
def console_me(ctx: tuple[ConsoleUser, User] = Depends(current_console_user), db: Session = Depends(get_db)) -> ConsoleMe:
    cu, user = ctx
    m = _member(db, user.phone)
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, NOT_TEAM)
    return _me(user, m[1])


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT, summary="End every console session of this user")
def logout_all(ctx: tuple[ConsoleUser, User] = Depends(current_console_user), db: Session = Depends(get_db)) -> None:
    _, user = ctx
    user.token_version += 1
    db.commit()
    sessions.publish(user.id, user.token_version)
