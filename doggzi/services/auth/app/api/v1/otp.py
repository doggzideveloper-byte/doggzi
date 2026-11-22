import re
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core import ratelimit
from ...core.config import get_settings
from ...core.security import AuthUser, get_user, hash_code, issue_token
from ...core.time import utcnow
from ...db import get_db
from ...models import OtpCode, User
from ...notify import OtpSender, get_sender

router = APIRouter(tags=["otp"])
PHONE_RE = re.compile(r"\+91[6-9]\d{9}")


def _norm_phone(v: str) -> str:
    digits = re.sub(r"\D", "", v or "")
    if len(digits) == 10:
        digits = "91" + digits
    p = "+" + digits
    if not PHONE_RE.fullmatch(p):
        raise ValueError("Enter a 10-digit Indian mobile number")
    return p


class OtpRequestIn(BaseModel):
    phone: str
    _p = field_validator("phone")(lambda cls, v: _norm_phone(v))


class OtpRequestOut(BaseModel):
    sent: bool
    expires_in: int
    dev_code: str | None = None


class OtpVerifyIn(BaseModel):
    phone: str
    code: str
    _p = field_validator("phone")(lambda cls, v: _norm_phone(v))

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        if not re.fullmatch(r"\d{6}", v or ""):
            raise ValueError("Enter the 6-digit code")
        return v


class UserOut(BaseModel):
    id: str
    phone: str
    role: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


def send_code(phone: str, request: Request, db: Session, sender: OtpSender) -> OtpRequestOut:
    """Rate-limit, store a hashed 6-digit code and text it. Shared by the website and console logins."""
    s = get_settings()
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    if not ratelimit.hit(f"otp:phone:{phone}", s.otp_requests_per_phone, s.otp_rate_window_seconds) or not ratelimit.hit(
        f"otp:ip:{ip}", s.otp_requests_per_ip, s.otp_rate_window_seconds
    ):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many codes requested. Try again in a few minutes.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    # Older unused codes for this number stop working.
    for old in db.scalars(select(OtpCode).where(OtpCode.phone == phone, OtpCode.consumed_at.is_(None))):
        old.consumed_at = utcnow()
    db.add(OtpCode(phone=phone, code_hash=hash_code(phone, code), expires_at=utcnow() + timedelta(seconds=s.otp_ttl_seconds)))
    db.commit()
    sender.send(phone, code)
    return OtpRequestOut(sent=True, expires_in=s.otp_ttl_seconds, dev_code=code if s.otp_dev_echo else None)


def consume_code(phone: str, code: str, db: Session) -> None:
    """Check the latest code for this number (max attempts, expiry) and mark it used. Raises 400 on failure."""
    s = get_settings()
    otp = db.scalar(select(OtpCode).where(OtpCode.phone == phone, OtpCode.consumed_at.is_(None)).order_by(OtpCode.created_at.desc()))
    now = utcnow()
    if not otp:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That code has expired. Ask for a new one.")
    # SQLite drops tzinfo; Postgres keeps it.
    expires = otp.expires_at if otp.expires_at.tzinfo else otp.expires_at.replace(tzinfo=now.tzinfo)
    if expires < now or otp.attempts >= s.otp_max_attempts:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That code has expired. Ask for a new one.")
    if otp.code_hash != hash_code(phone, code):
        otp.attempts += 1
        db.commit()
        left = s.otp_max_attempts - otp.attempts
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"That code doesn't match. {left} {'try' if left == 1 else 'tries'} left." if left > 0 else "Too many wrong tries. Ask for a new code.")
    otp.consumed_at = now


@router.post("/otp/request", response_model=OtpRequestOut, summary="Text a 6-digit code (rate-limited)")
def request_otp(body: OtpRequestIn, request: Request, db: Session = Depends(get_db), sender: OtpSender = Depends(get_sender)) -> OtpRequestOut:
    return send_code(body.phone, request, db, sender)


@router.post("/otp/verify", response_model=TokenOut, summary="Check the code and return a JWT")
def verify_otp(body: OtpVerifyIn, db: Session = Depends(get_db)) -> TokenOut:
    s = get_settings()
    consume_code(body.phone, body.code, db)
    user = db.scalar(select(User).where(User.phone == body.phone))
    if not user:
        admins = {_norm_phone(p) for p in s.admin_phones.split(",") if p.strip()}
        user = User(phone=body.phone, role="ADMIN" if body.phone in admins else "USER")
        db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=issue_token(user.id, user.phone, user.role), user=UserOut(id=str(user.id), phone=user.phone, role=user.role))


@router.get("/me", response_model=UserOut)
def me(user: AuthUser = Depends(get_user)) -> UserOut:
    return UserOut(id=str(user.id), phone=user.phone, role=user.role)
