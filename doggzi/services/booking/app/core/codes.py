"""Start/end codes. The 4 digits are derived with an HMAC (so the customer's booking page can show them),
and only a second HMAC of the code is stored. 5 wrong tries lock the code until OPS resets it."""
import hashlib
import hmac
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import BookingCode
from .config import get_settings
from .time import utcnow

MAX_TRIES = 5


def _key() -> bytes:
    s = get_settings()
    k = s.code_secret or s.auth_jwt_secret
    if not k:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "CODE_SECRET is not configured")
    return k.encode()


def code_for(booking_id: uuid.UUID, kind: str) -> str:
    n = int.from_bytes(hmac.new(_key(), f"code:{booking_id}:{kind}".encode(), hashlib.sha256).digest()[:4], "big")
    return f"{n % 10000:04d}"


def _hash(booking_id: uuid.UUID, kind: str, code: str) -> str:
    return hmac.new(_key(), f"hash:{booking_id}:{kind}:{code}".encode(), hashlib.sha256).hexdigest()


def ensure_codes(db: Session, booking_id: uuid.UUID) -> None:
    have = set(db.scalars(select(BookingCode.kind).where(BookingCode.booking_id == booking_id)))
    for kind in ("start", "end"):
        if kind not in have:
            db.add(BookingCode(booking_id=booking_id, kind=kind, code_hash=_hash(booking_id, kind, code_for(booking_id, kind))))


def check(db: Session, booking_id: uuid.UUID, kind: str, code: str) -> None:
    """Raises 422 (wrong, with tries left) or 423 (locked). Marks the code used on success."""
    row = db.scalar(select(BookingCode).where(BookingCode.booking_id == booking_id, BookingCode.kind == kind).with_for_update())
    if row is None:
        ensure_codes(db, booking_id)
        db.flush()
        row = db.scalar(select(BookingCode).where(BookingCode.booking_id == booking_id, BookingCode.kind == kind))
    if row.locked_at is not None:
        raise HTTPException(status.HTTP_423_LOCKED, "Code locked after 5 tries. Ask OPS for help.")
    if not hmac.compare_digest(row.code_hash, _hash(booking_id, kind, (code or "").strip())):
        row.attempts += 1
        left = MAX_TRIES - row.attempts
        if left <= 0:
            row.locked_at = utcnow()
            db.commit()
            raise HTTPException(status.HTTP_423_LOCKED, "Code locked after 5 tries. Ask OPS for help.")
        db.commit()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Wrong code. {left} {'try' if left == 1 else 'tries'} left.")
    row.used_at = utcnow()
