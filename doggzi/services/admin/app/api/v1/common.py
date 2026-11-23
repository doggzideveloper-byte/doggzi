from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status

IST = ZoneInfo("Asia/Kolkata")
RANGES = ("today", "yesterday", "7d", "30d", "month", "lastmonth", "custom")


def ist_today() -> date:
    return datetime.now(IST).date()


def _month_start(d: date) -> date:
    return d.replace(day=1)


def resolve_range(key: str, frm: date | None = None, to: date | None = None) -> tuple[date, date, date, date]:
    """(from, to, prev_from, prev_to) as inclusive IST dates. The previous period has the same length, just before."""
    t = ist_today()
    if key == "yesterday":
        a = b = t - timedelta(days=1)
    elif key == "7d":
        a, b = t - timedelta(days=6), t
    elif key == "30d":
        a, b = t - timedelta(days=29), t
    elif key == "month":
        a, b = _month_start(t), t
    elif key == "lastmonth":
        b = _month_start(t) - timedelta(days=1)
        a = _month_start(b)
    elif key == "custom":
        if not frm or not to:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick both dates")
        a, b = min(frm, to), max(frm, to)
        if b > t:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The range can't end in the future")
        if (b - a).days > 366:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick at most a year")
    else:
        a = b = t
    days = (b - a).days + 1
    if key in ("month", "lastmonth"):
        pa = _month_start(a - timedelta(days=1))
        pb = min(pa + timedelta(days=days - 1), a - timedelta(days=1))
    else:
        pb = a - timedelta(days=1)
        pa = pb - timedelta(days=days - 1)
    return a, b, pa, pb


def instants(a: date, b: date) -> tuple[str, str]:
    """[start of a, start of b+1) in IST, as ISO instants for the other services."""
    return datetime.combine(a, time(0), IST).isoformat(), datetime.combine(b + timedelta(days=1), time(0), IST).isoformat()


def days_between(a: date, b: date) -> list[date]:
    return [a + timedelta(days=i) for i in range((b - a).days + 1)]


def inr(paise: int | None) -> str:
    """₹ with Indian grouping, for audit text (the panel formats its own numbers)."""
    if paise is None:
        return "—"
    r = paise / 100
    whole = int(abs(r))
    s = str(whole)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    frac = round(abs(r) - whole, 2)
    return ("-" if r < 0 else "") + "₹" + s + (f"{frac:.2f}"[1:] if frac else "")


def label(d: date, ref: date | None = None) -> str:
    ref = ref or ist_today()
    return f"{d.day} {d.strftime('%b')}" + (f" {d.year}" if d.year != ref.year else "")


def span(a: date, b: date) -> str:
    return label(a) if a == b else f"{label(a)} – {label(b)}"
