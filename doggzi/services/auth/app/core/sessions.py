"""Console token versions, shared with every service through SESSION_REDIS_URL.

"Log out of all devices" bumps users.token_version (source of truth) and publishes it here; services reject
console tokens whose `tv` is older. In-process fallback when SESSION_REDIS_URL is empty (tests, local dev).
"""
import uuid

from .config import get_settings

_mem: dict[str, int] = {}
_redis = None


def _client():
    global _redis
    url = get_settings().session_redis_url
    if not url:
        return None
    if _redis is None:
        import redis

        _redis = redis.Redis.from_url(url, socket_timeout=1)
    return _redis


def key(user_id: uuid.UUID) -> str:
    return f"console:tv:{user_id}"


def publish(user_id: uuid.UUID, tv: int) -> None:
    r = _client()
    if r is not None:
        r.set(key(user_id), tv)
    _mem[key(user_id)] = tv


def current(user_id: uuid.UUID) -> int:
    r = _client()
    if r is not None:
        v = r.get(key(user_id))
        return int(v) if v is not None else 0
    return _mem.get(key(user_id), 0)


def reset() -> None:
    _mem.clear()
