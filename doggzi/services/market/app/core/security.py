import uuid
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException, status

from .config import get_settings


@dataclass(frozen=True)
class AuthUser:
    """App code always reads `user.id` (UUID), never `sub`."""

    id: uuid.UUID
    phone: str
    role: str


def get_user(authorization: str | None = Header(default=None)) -> AuthUser:
    secret = get_settings().auth_jwt_secret
    if not secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AUTH_JWT_SECRET is not configured")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Login required", headers={"WWW-Authenticate": "Bearer"})
    try:
        d = jwt.decode(authorization.split(" ", 1)[1], secret, algorithms=["HS256"])
        if d.get("typ") != "user":
            raise jwt.InvalidTokenError()
        return AuthUser(id=uuid.UUID(d["user_id"]), phone=d.get("phone", ""), role=d.get("role", "USER"))
    except (jwt.PyJWTError, KeyError, ValueError) as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from e


def require_admin(user: AuthUser = Depends(get_user)) -> AuthUser:
    if user.role != "ADMIN":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only")
    return user
