"""Console (panel) sessions: verify the 12-hour console JWT issued by services/auth.

App code reads `user.id`, never `sub`. "Log out of all devices" is honoured through SESSION_REDIS_URL.
"""
import uuid
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException, status

from .config import get_settings

_redis = None


@dataclass(frozen=True)
class ConsoleUser:
    id: uuid.UUID
    phone: str
    name: str
    roles: tuple[str, ...]


def _min_tv(user_id: uuid.UUID) -> int:
    global _redis
    url = get_settings().session_redis_url
    if not url:
        return 0
    try:
        if _redis is None:
            import redis

            _redis = redis.Redis.from_url(url, socket_timeout=1)
        v = _redis.get(f"console:tv:{user_id}")
        return int(v) if v is not None else 0
    except Exception as e:  # fail closed: a session store outage must not keep revoked sessions alive
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Session check unavailable. Try again.") from e


def console_user(authorization: str | None = Header(default=None)) -> ConsoleUser:
    secret = get_settings().auth_jwt_secret
    if not secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AUTH_JWT_SECRET is not configured")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in", headers={"WWW-Authenticate": "Bearer"})
    try:
        d = jwt.decode(authorization.split(" ", 1)[1], secret, algorithms=["HS256"])
        if d.get("typ") != "console":
            raise jwt.InvalidTokenError()
        u = ConsoleUser(id=uuid.UUID(d["user_id"]), phone=d.get("phone", ""), name=d.get("name", ""), roles=tuple(d.get("roles", [])))
        tv = int(d.get("tv", 0))
    except (jwt.PyJWTError, KeyError, ValueError) as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.") from e
    if tv < _min_tv(u.id):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")
    return u


def require_roles(*roles: str):
    def dep(u: ConsoleUser = Depends(console_user)) -> ConsoleUser:
        if not set(roles) & set(u.roles):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have access to this panel")
        return u

    return dep
