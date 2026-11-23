"""Live visitors (anonymous heartbeats from apps/web) and per-day unique visitors, in Redis.

- live:s:{sid}  "page|device", expires after LIVE_KEY_TTL_SECONDS (90 s)
- live:z        sorted set sid → last heartbeat (trimmed to the TTL window)
- live:d:{YYYYMMDD}:{page}  HyperLogLog of session ids (unique visitors per IST day; kept 400 days)
"On the site right now" = unique sessions with a heartbeat in the last LIVE_WINDOW_SECONDS (60 s).
No personal data: the session id is random per browser tab and nothing else is stored.
An in-process store stands in when REDIS_URL is empty (tests, local dev).
"""
import time
from collections import Counter
from datetime import date, datetime
from zoneinfo import ZoneInfo

from .config import get_settings

IST = ZoneInfo("Asia/Kolkata")
PAGES = {"/": "Passport", "/choose": "Choose", "/fresh-food": "Fresh Food", "/services": "Services", "/marketplace": "Marketplace", "/explore": "Explore"}
PAGE_ORDER = ["Passport", "Choose", "Fresh Food", "Services", "Marketplace", "Explore", "Other"]
DAY_TTL = 400 * 86400


def page_label(path: str) -> str:
    p = "/" + (path or "/").split("?")[0].split("#")[0].strip("/").split("/")[0]
    return PAGES.get(p, "Other")


def _day(ts: float) -> str:
    return datetime.fromtimestamp(ts, IST).strftime("%Y%m%d")


class MemoryStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.sessions: dict[str, tuple[float, str, str]] = {}
        self.days: dict[str, set[str]] = {}
        self.counters: dict[str, tuple[int, float]] = {}

    def beat(self, sid: str, page: str, device: str, now: float) -> None:
        self.sessions[sid] = (now, page, device)
        for k in (f"{_day(now)}:{page}", f"{_day(now)}:all"):
            self.days.setdefault(k, set()).add(sid)

    def active(self, since: float) -> list[tuple[str, str]]:
        return [(p, d) for ts, p, d in self.sessions.values() if ts >= since]

    def uniques(self, days: list[str], page: str) -> int:
        out: set[str] = set()
        for d in days:
            out |= self.days.get(f"{d}:{page}", set())
        return len(out)

    def incr(self, key: str, ttl: int) -> int:
        n, exp = self.counters.get(key, (0, 0))
        now = time.time()
        n = 1 if exp < now else n + 1
        self.counters[key] = (n, now + ttl if n == 1 else exp)
        return n


class RedisStore:
    def __init__(self, url: str) -> None:
        import redis

        self.r = redis.Redis.from_url(url, socket_timeout=1, decode_responses=True)

    def beat(self, sid: str, page: str, device: str, now: float) -> None:
        ttl = get_settings().live_key_ttl_seconds
        p = self.r.pipeline()
        p.set(f"live:s:{sid}", f"{page}|{device}", ex=ttl)
        p.zadd("live:z", {sid: now})
        p.zremrangebyscore("live:z", "-inf", now - ttl)
        p.expire("live:z", ttl)
        for k in (f"live:d:{_day(now)}:{page}", f"live:d:{_day(now)}:all"):
            p.pfadd(k, sid)
            p.expire(k, DAY_TTL)
        p.execute()

    def active(self, since: float) -> list[tuple[str, str]]:
        sids = self.r.zrangebyscore("live:z", since, "+inf")
        if not sids:
            return []
        vals = self.r.mget([f"live:s:{s}" for s in sids])
        return [tuple(v.split("|", 1)) for v in vals if v and "|" in v]  # type: ignore[misc]

    def uniques(self, days: list[str], page: str) -> int:
        keys = [f"live:d:{d}:{page}" for d in days]
        return int(self.r.pfcount(*keys)) if keys else 0

    def incr(self, key: str, ttl: int) -> int:
        p = self.r.pipeline()
        p.incr(key)
        p.expire(key, ttl, nx=True)
        return int(p.execute()[0])


_store = None


def store():
    global _store
    if _store is None:
        url = get_settings().redis_url
        _store = RedisStore(url) if url else MemoryStore()
    return _store


def heartbeat(sid: str, path: str, device: str) -> None:
    store().beat(sid, page_label(path), device, time.time())


def snapshot() -> dict:
    act = store().active(time.time() - get_settings().live_window_seconds)
    pages = Counter(p for p, _ in act)
    dev = Counter(d for _, d in act)
    return {"total": len(act), "pages": [{"label": p, "n": pages.get(p, 0)} for p in PAGE_ORDER if p != "Other" or pages.get(p)],
            "mobile": dev.get("mobile", 0), "desktop": dev.get("desktop", 0)}


def visitors(days: list[date], page: str = "all") -> int:
    return store().uniques([d.strftime("%Y%m%d") for d in days], page)
