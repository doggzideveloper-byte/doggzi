"""Fixed-window counters in Redis (INCR + EXPIRE); in-process fallback when REDIS_URL is empty."""
import time

from .config import get_settings

_mem: dict[str, tuple[float, int]] = {}
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


def hit(key: str, limit: int, window: int) -> bool:
    """Count one hit; return False when the limit is exceeded."""
    r = _client()
    if r is not None:
        n = r.incr(key)
        if n == 1:
            r.expire(key, window)
        return n <= limit
    now = time.time()
    exp, n = _mem.get(key, (now + window, 0))
    if exp < now:
        exp, n = now + window, 0
    _mem[key] = (exp, n + 1)
    return n + 1 <= limit


def reset() -> None:
    _mem.clear()
