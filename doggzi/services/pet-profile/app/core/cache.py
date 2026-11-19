"""Tiny cache: Redis when REDIS_URL is set, otherwise an in-process dict (dev/tests)."""
import json
import time
from typing import Any

from .config import get_settings

_mem: dict[str, tuple[float, str]] = {}
_redis = None


def _client():
    global _redis
    url = get_settings().redis_url
    if not url:
        return None
    if _redis is None:
        import redis

        _redis = redis.Redis.from_url(url, socket_timeout=1)
    return _redis


def get(key: str) -> Any | None:
    try:
        r = _client()
        if r is not None:
            raw = r.get(key)
            return json.loads(raw) if raw else None
    except Exception:  # cache is best-effort: never fail a request because Redis is down
        return None
    hit = _mem.get(key)
    if hit and hit[0] > time.time():
        return json.loads(hit[1])
    return None


def set(key: str, value: Any, ttl: int) -> None:
    raw = json.dumps(value)
    try:
        r = _client()
        if r is not None:
            r.setex(key, ttl, raw)
            return
    except Exception:
        return
    _mem[key] = (time.time() + ttl, raw)


def clear() -> None:
    _mem.clear()
