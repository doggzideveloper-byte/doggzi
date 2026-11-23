"""Overview: KPIs for a date range (IST) vs the previous period of the same length, plus live 'needs attention' lists."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query

from ...core import live
from ...core.access import Staff, staff
from ...core.upstream import Upstream, get_upstream
from .common import days_between, instants, resolve_range, span

router = APIRouter(tags=["overview"])
BCOLS = [("requested", "Requested"), ("offered", "Offered"), ("accepted", "Accepted"), ("enroute", "En route"), ("inprogress", "In progress"), ("completed", "Completed"), ("cancelled", "Cancelled")]
OCOLS = [("new", "New"), ("packing", "Packing"), ("ready", "Ready"), ("out", "Out"), ("delivered", "Delivered"), ("rejected", "Rejected")]


def _period(up: Upstream, a: date, b: date) -> dict:
    frm, to = instants(a, b)
    with ThreadPoolExecutor(3) as ex:
        fb = ex.submit(up.get, "booking", "/stats", **{"from": frm, "to": to})
        fm = ex.submit(up.get, "market", "/stats", **{"from": frm, "to": to})
        fp = ex.submit(up.get, "pets", "/stats", **{"from": frm, "to": to})
        bk, mk, pt = fb.result(), fm.result(), fp.result()
    gmv = bk["gmv_paise"] + mk["gmv_paise"]
    n = bk["bookings"] + mk["orders"]
    days = days_between(a, b)
    return {"bk": bk, "mk": mk, "pt": pt, "kpi": {"bookings": bk["bookings"], "orders": mk["orders"], "gmv_paise": gmv, "aov_paise": round(gmv / n) if n else 0,
                                                 "passports": pt["passports"]},
            "funnel": [("Site visitors", live.visitors(days)), ("Passports created", pt["passports"]), ("Fresh Food views", live.visitors(days, "Fresh Food")),
                       ("Plan previews", pt["plans"]), ("Marketplace visits", live.visitors(days, "Marketplace"))]}


@router.get("/overview", summary="KPIs for a range (IST) with the previous period, bars, funnel, overdue and new applications")
def overview(range_: Literal["today", "yesterday", "7d", "30d", "month", "lastmonth", "custom"] = Query(default="today", alias="range"),
             frm: date | None = Query(default=None, alias="from"), to: date | None = None, who: Staff = Depends(staff), up: Upstream = Depends(get_upstream)) -> dict:
    a, b, pa, pb = resolve_range(range_, frm, to)
    cur, prev = _period(up, a, b), _period(up, pa, pb)
    bk, mk = cur["bk"], cur["mk"]
    overdue = []
    for c in bk["overdue"]:
        why = "no provider found yet" if c["dispatch_status"] == "ops_queue" and not c["overdue"] else "provider hasn't started" if c["provider"] else "nobody has accepted"
        overdue.append({"id": c["id"], "ref": c["ref"], "module": "bookings", "title": f"{c['ref']} · {why}",
                        "sub": f"{c['pet'].get('name', '')} · slot {c['slot_start']} · {(c['provider'] or {}).get('name', 'Unassigned')}", "slot_start": c["slot_start"]})
    for s in mk["needs_ops"]:
        what = f"rejected by {s['vendor']}" if s["status"] == "rejected" else "not accepted in time"
        overdue.append({"id": s["id"], "ref": s["ref"], "module": "orders", "title": f"{s['ref']} {what}", "sub": f"{s['reason']} · needs reassign or refund", "slot_start": None})
    apps = sorted(bk["applications"] + mk["applications"], key=lambda x: x["at"], reverse=True)[:5]
    return {
        "range": {"key": range_, "from": a.isoformat(), "to": b.isoformat(), "prev_from": pa.isoformat(), "prev_to": pb.isoformat(), "days": (b - a).days + 1,
                  "text": span(a, b), "prev_text": span(pa, pb)},
        "kpis": [{"key": k, "cur": cur["kpi"][k], "prev": prev["kpi"][k]} for k in ("bookings", "orders", "gmv_paise", "aov_paise", "passports")],
        "booking_bars": [{"label": lab, "n": bk["by_column"].get(k, 0)} for k, lab in BCOLS],
        "order_bars": [{"label": lab, "n": mk["by_status"].get(k, 0)} for k, lab in OCOLS],
        "funnel": [{"label": lab, "n": n} for lab, n in cur["funnel"]],
        "overdue": overdue, "applications": apps, "live": live.snapshot(),
    }
