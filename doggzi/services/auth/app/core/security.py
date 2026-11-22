import hashlib
import hmac
import uuid
from dataclasses import dataclass
from datetime import timedelta

import jwt
from fastapi import Header, HTTPException, status

from .config import get_settings
from .time import utcnow

ALG = "HS256"


@dataclass(frozen=True)
class AuthUser:
    """App code always reads `user.id` (UUID). `sub` is set for JWT conventions but never relied on."""

    id: uuid.UUID
    phone: str
    role: str


def _secret() -> str:
    s = get_settings().auth_jwt_secret
    if not s:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AUTH_JWT_SECRET is not configured")
    return s


def issue_token(user_id: uuid.UUID, phone: str, role: str) -> str:
    now = utcnow()
    ttl = timedelta(minutes=get_settings().access_token_ttl_minutes)
    return jwt.encode({"typ": "user", "sub": str(user_id), "user_id": str(user_id), "phone": phone, "role": role, "iat": now, "exp": now + ttl}, _secret(), algorithm=ALG)


@dataclass(frozen=True)
class ConsoleUser:
    """Console session. App code reads `user.id`, never `sub`."""

    id: uuid.UUID
    phone: str
    name: str
    roles: tuple[str, ...]
    tv: int


def issue_console_token(user_id: uuid.UUID, phone: str, name: str, roles: list[str], tv: int) -> tuple[str, int]:
    now = utcnow()
    ttl = timedelta(minutes=get_settings().console_token_ttl_minutes)
    claims = {"typ": "console", "sub": str(user_id), "user_id": str(user_id), "phone": phone, "name": name, "roles": sorted(roles), "tv": tv, "iat": now, "exp": now + ttl}
    return jwt.encode(claims, _secret(), algorithm=ALG), int(ttl.total_seconds())


def get_console_user(authorization: str | None = Header(default=None)) -> ConsoleUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in", headers={"WWW-Authenticate": "Bearer"})
    try:
        d = jwt.decode(authorization.split(" ", 1)[1], _secret(), algorithms=[ALG])
        if d.get("typ") != "console":
            raise jwt.InvalidTokenError()
        return ConsoleUser(id=uuid.UUID(d["user_id"]), phone=d["phone"], name=d.get("name", ""), roles=tuple(d.get("roles", [])), tv=int(d.get("tv", 0)))
    except (jwt.PyJWTError, KeyError, ValueError) as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.") from e


def get_user(authorization: str | None = Header(default=None)) -> AuthUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token", headers={"WWW-Authenticate": "Bearer"})
    try:
        d = jwt.decode(authorization.split(" ", 1)[1], _secret(), algorithms=[ALG])
        if d.get("typ") != "user":
            raise jwt.InvalidTokenError()
        return AuthUser(id=uuid.UUID(d["user_id"]), phone=d["phone"], role=d.get("role", "USER"))
    except (jwt.PyJWTError, KeyError, ValueError) as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from e


def hash_code(phone: str, code: str) -> str:
    pepper = get_settings().otp_hash_pepper or get_settings().auth_jwt_secret
    return hmac.new(pepper.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()
