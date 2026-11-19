"""Guest tokens (issued here) and user tokens (issued by the auth service, verified here)."""
import uuid
from dataclasses import dataclass
from datetime import timedelta

import jwt
from fastapi import Depends, Header, HTTPException, status

from .config import get_settings
from .time import utcnow

ALG = "HS256"


@dataclass(frozen=True)
class AuthUser:
    """Logged-in user. App code always reads `user.id` (UUID), never the raw `sub` claim."""

    id: uuid.UUID
    phone: str
    role: str


@dataclass(frozen=True)
class Principal:
    guest_id: uuid.UUID | None = None
    user: AuthUser | None = None


def _require_secret(name: str, value: str) -> str:
    if not value:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"{name} is not configured")
    return value


def create_guest_token(guest_id: uuid.UUID) -> str:
    s = get_settings()
    secret = _require_secret("GUEST_JWT_SECRET", s.guest_jwt_secret)
    now = utcnow()
    payload = {"typ": "guest", "guest_id": str(guest_id), "iat": now, "exp": now + timedelta(hours=s.guest_token_ttl_hours)}
    return jwt.encode(payload, secret, algorithm=ALG)


def decode_guest_token(token: str) -> uuid.UUID:
    secret = _require_secret("GUEST_JWT_SECRET", get_settings().guest_jwt_secret)
    try:
        data = jwt.decode(token, secret, algorithms=[ALG])
        if data.get("typ") != "guest":
            raise jwt.InvalidTokenError("not a guest token")
        return uuid.UUID(data["guest_id"])
    except (jwt.PyJWTError, KeyError, ValueError) as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired guest token") from e


def decode_user_token(token: str) -> AuthUser:
    secret = _require_secret("AUTH_JWT_SECRET", get_settings().auth_jwt_secret)
    try:
        data = jwt.decode(token, secret, algorithms=[ALG])
        if data.get("typ") != "user":
            raise jwt.InvalidTokenError("not a user token")
        return AuthUser(id=uuid.UUID(data["user_id"]), phone=data.get("phone", ""), role=data.get("role", "USER"))
    except (jwt.PyJWTError, KeyError, ValueError) as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from e


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token", headers={"WWW-Authenticate": "Bearer"})
    return authorization.split(" ", 1)[1].strip()


def get_principal(authorization: str | None = Header(default=None)) -> Principal:
    """Accepts either a guest token or a user token."""
    token = _bearer(authorization)
    try:
        typ = jwt.decode(token, options={"verify_signature": False}).get("typ")
    except jwt.PyJWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from e
    if typ == "user":
        return Principal(user=decode_user_token(token))
    return Principal(guest_id=decode_guest_token(token))


def get_user(authorization: str | None = Header(default=None)) -> AuthUser:
    return decode_user_token(_bearer(authorization))


CurrentPrincipal = Depends(get_principal)
CurrentUser = Depends(get_user)
