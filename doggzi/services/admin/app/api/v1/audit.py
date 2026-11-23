"""Audit log (ADMIN) and CSV exports (ADMIN only, rate-limited, each export logged)."""
import csv
import io
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ...core import live
from ...core.access import Staff, admin_only, staff
from ...core.audit import record
from ...core.config import get_settings
from ...core.upstream import Upstream, get_upstream
from ...db import get_db
from ...models import AuditEntry
from .money import payments_data
from .ops import COLS, SO_LABEL
from .people import customer_rows, team_rows

router = APIRouter(tags=["audit & export"])
IST = ZoneInfo("Asia/Kolkata")


def ist(v) -> str:
    if not v:
        return ""
    d = v if isinstance(v, datetime) else datetime.fromisoformat(v)
    return d.astimezone(IST).strftime("%d %b %Y, %H:%M IST") if d.tzinfo else d.strftime("%d %b %Y, %H:%M")


def rupees(p) -> str:
    return "" if p is None else f"{p / 100:.2f}"


@router.get("/me", summary="Who is signed in and what they can do")
def me(who: Staff = Depends(staff)) -> dict:
    return {"user_id": str(who.user.id), "name": who.user.name, "role": who.role, "roles": list(who.user.roles), "is_admin": who.is_admin}


@router.get("/audit", summary="Every admin write, newest first")
def audit(module: str | None = None, q: str = Query(default="", max_length=80), limit: int = Query(default=300, le=2000), _: Staff = Depends(admin_only),
          db: Session = Depends(get_db)) -> list[dict]:
    stmt = select(AuditEntry)
    if module:
        stmt = stmt.where(AuditEntry.module == module)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(AuditEntry.actor_name.ilike(like), AuditEntry.action.ilike(like), AuditEntry.target.ilike(like)))
    rows = db.scalars(stmt.order_by(AuditEntry.created_at.desc()).limit(limit)).all()
    return [{"id": str(a.id), "at": a.created_at.isoformat(), "who": a.actor_name, "role": a.actor_role, "module": a.module, "what": a.action, "target": a.target,
             "before": a.before, "after": a.after} for a in rows]


Export = Literal["bookings", "orders", "customers", "services", "products", "vendors", "providers", "payments", "refunds", "route", "recon", "payouts", "team", "audit"]


def _rows(name: str, who: Staff, up: Upstream, db: Session) -> list[list]:
    if name == "bookings":
        return [["Booking", "Status", "Pet", "Services", "Slot (IST)", "Area", "Provider", "Customer phone", "Total (₹)", "Payment"]] + [
            [c["ref"], COLS[c["column"]], (c["pet"] or {}).get("name", ""), " + ".join(c["services"]), ist(c["slot_start"]), c["area"], (c["provider"] or {}).get("name", ""),
             c["customer_phone"], rupees(c["total_paise"]), c["pay"]] for c in up.get("booking", "/bookings")]
    if name == "orders":
        return [["Sub-order", "Order", "Store", "Status", "Total (₹)", "Placed (IST)", "Customer phone", "Refund"]] + [
            [s["ref"], s["order_ref"], s["vendor"], SO_LABEL.get(s["status"], s["status"]), rupees(s["total_paise"]), ist(s["placed_at"]), s["customer_phone"], s["refund_status"]]
            for s in up.get("market", "/sub-orders")]
    if name == "customers":
        return [["Name", "Phone", "Area", "Pincode", "Pets", "Bookings", "Orders"]] + [
            [c["name"], c["phone"], c["area"], c["pincode"], " / ".join(f"{p['name']} ({p['breed']})" for p in c["pets"]), c["bookings"], c["orders"]] for c in customer_rows(who, up, db)]
    if name == "services":
        return [["Service", "Group", "Price (₹)", "Cats", "Active", "Includes"]] + [
            [i["name"], i["group"], rupees(i["price_paise"]), "yes" if i["cats"] else "no", "yes" if i["is_active"] else "no", " + ".join(i["includes"])] for i in up.get("booking", "/items")]
    if name == "products":
        return [["SKU", "Product", "Brand", "Category", "Price (₹)", "Flags", "Status", "Stores"]] + [
            [p["sku"] or "", p["name"], p["brand"], p["category"], rupees(p["price_paise"]), ";".join(p["flags"]), "blocked" if p["is_blocked"] else "live", " / ".join(p["stores"])]
            for p in up.get("market", "/products")]
    if name == "vendors":
        return [["Store", "Stage", "Paused", "Area", "Commission %", "Pincodes", "Accept rate %", "Avg pack (min)", "Cancellations this month"]] + [
            [v["name"], v["stage"], "yes" if v["paused"] else "no", v["area"] or "", v["commission_pct"], " ".join(v["pincodes"]), v["accept_rate"] if v["accept_rate"] is not None else "",
             v["avg_pack_minutes"] if v["avg_pack_minutes"] is not None else "", v["cancellations_month"]] for v in up.get("market", "/vendors")]
    if name == "providers":
        return [["Provider", "Stage", "Paused", "Rating", "Jobs", "Skills", "Areas", "Owed (₹)"]] + [
            [p["name"], p["stage"], "yes" if p["paused"] else "no", p["rating"], p["jobs_done"], " / ".join(p["skill_labels"]), " ".join(p["areas"]), rupees(p["owed_paise"])]
            for p in up.get("booking", "/providers")]
    if name in ("payments", "refunds", "route", "recon", "payouts"):
        d = payments_data(up)
        if name == "payments":
            return [["Payment", "Order", "Amount (₹)", "Method", "Status", "When (IST)"]] + [[x["id"], x["order_ref"], rupees(x["amount_paise"]), x["method"], x["status"], ist(x["at"])] for x in d["payments"]]
        if name == "refunds":
            return [["Sub-order", "Order", "Amount (₹)", "Status", "When (IST)"]] + [[x["ref"], x["order_ref"], rupees(x["amount_paise"]), x["status"], ist(x["at"])] for x in d["refunds"]]
        if name == "route":
            return [["Sub-order", "Store", "Transfer (₹)", "Status"]] + [[x["ref"], x["vendor"], rupees(x["amount_paise"]), x["status"]] for x in d["route"]]
        if name == "recon":
            return [["Reference", "Expected (₹)", "Captured (₹)", "Difference (₹)"]] + [[x["ref"], rupees(x["expected_paise"]), rupees(x["captured_paise"]), rupees(x["difference_paise"])] for x in d["recon"]]
        return [["Provider", "Jobs", "Owed (₹)"]] + [[x["name"], x["jobs_done"], rupees(x["owed_paise"])] for x in d["payouts"]]
    if name == "team":
        return [["Name", "Phone", "Roles"]] + [[m["name"] or "", m["phone"], " + ".join(m["roles"])] for m in team_rows(up)]
    return [["When (IST)", "Who", "Role", "Module", "What", "Before", "After"]] + [
        [ist(a.created_at), a.actor_name, a.actor_role, a.module, a.action, a.before or "", a.after or ""]
        for a in db.scalars(select(AuditEntry).order_by(AuditEntry.created_at.desc()).limit(10_000))]


@router.get("/export/{name}.csv", summary="CSV export (ADMIN only; rate-limited per person per hour; logged in the audit log)")
def export(name: Export, who: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> Response:
    hour = datetime.now(IST).strftime("%Y%m%d%H")
    if live.store().incr(f"rl:export:{who.user.id}:{hour}", 3600) > get_settings().exports_per_hour:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"Export limit reached ({get_settings().exports_per_hour} an hour). Try again later.")
    rows = _rows(name, who, up, db)
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    record(db, who, "Export", f"Exported {name}.csv", after=f"{len(rows) - 1} rows")
    stamp = datetime.now(IST).strftime("%Y%m%d-%H%M")
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="doggzi-{name}-{stamp}.csv"'})
