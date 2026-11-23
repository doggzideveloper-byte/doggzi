"""Admin panel API: role scoping (ADMIN / OPS / everyone else), OPS phone masking, audit on every write,
live visitors, exports (ADMIN only, rate-limited, logged) and content rules."""
from datetime import date, timedelta
from unittest import mock

import pytest

from app.api.v1 import common
from app.models import AuditEntry
from tests.conftest import API, PHONE, UID, console

ADMIN_ONLY = [
    ("GET", "/catalog/services"), ("GET", "/catalog/products"), ("GET", "/catalog/approvals"), ("GET", "/payments"), ("GET", "/content"), ("GET", "/team"),
    ("GET", "/audit"), ("GET", "/export/customers.csv"), ("POST", "/orders/00000000-0000-0000-0000-000000000001/refund"),
    ("PATCH", "/vendors/00000000-0000-0000-0000-000000000001"), ("POST", "/vendors"), ("POST", "/providers"), ("PATCH", "/providers/00000000-0000-0000-0000-000000000001"),
    ("POST", "/team"), ("PUT", "/site-config"), ("POST", "/content"),
]
STAFF = [("GET", "/overview"), ("GET", "/bookings"), ("GET", "/orders"), ("GET", "/customers"), ("GET", "/vendors"), ("GET", "/providers"), ("GET", "/live"), ("GET", "/me")]


def call(c, method, path, headers=None, json=None):
    return c.request(method, API + path, headers=headers or {}, json=json if json is not None else ({} if method in ("POST", "PATCH", "PUT") else None))


@pytest.mark.parametrize("method,path", ADMIN_ONLY + STAFF)
def test_no_login_is_401(ctx, method, path):
    c, _, _ = ctx
    assert call(c, method, path).status_code == 401


@pytest.mark.parametrize("roles", [("VENDOR",), ("PROVIDER",), ("PROVIDER", "VENDOR")])
@pytest.mark.parametrize("method,path", ADMIN_ONLY + STAFF)
def test_vendor_and_provider_logins_never_reach_admin(ctx, roles, method, path):
    c, _, up = ctx
    assert call(c, method, path, console(roles)).status_code == 403
    assert up.calls == []  # nothing was read from another service


@pytest.mark.parametrize("method,path", ADMIN_ONLY)
def test_ops_is_refused_admin_only_routes(ctx, method, path):
    c, _, up = ctx
    assert call(c, method, path, console(("OPS",))).status_code == 403
    assert up.calls == []


@pytest.mark.parametrize("method,path", STAFF)
def test_ops_reaches_operations_modules(ctx, method, path):
    c, _, _ = ctx
    assert call(c, method, path, console(("OPS",))).status_code == 200


def test_ops_sees_masked_phones_everywhere(ctx):
    c, _, _ = ctx
    ops, adm = console(("OPS",)), console()
    digits = PHONE[3:]
    for path in ("/bookings", "/orders", "/customers", f"/customers/{UID}", "/vendors", "/providers"):
        body = c.get(API + path, headers=ops).text
        assert digits not in body and "9876543210" not in body, path
    assert c.get(API + "/bookings", headers=ops).json()[0]["customer_phone"] == "+91 98xxx xx210"
    assert c.get(API + "/bookings", headers=adm).json()[0]["customer_phone"] == "+91 98765 43210"
    assert c.get(API + "/customers", headers=adm).json()[0]["phone"] == "+91 98765 43210"


def test_me_reports_role(ctx):
    c, _, _ = ctx
    assert c.get(API + "/me", headers=console(("OPS",))).json()["is_admin"] is False
    assert c.get(API + "/me", headers=console(("ADMIN", "OPS"))).json()["role"] == "ADMIN"


def audit(S):
    with S() as db:
        return db.query(AuditEntry).order_by(AuditEntry.created_at).all()


def test_every_write_is_audited(ctx):
    c, S, up = ctx
    ops = console(("OPS",), name="Neha Gupta")
    bid = "00000000-0000-0000-0000-0000000000b1"
    assert c.post(f"{API}/bookings/{bid}/move", json={"to": "enroute"}, headers=ops).status_code == 200
    assert c.post(f"{API}/bookings/{bid}/move", json={"to": "accepted", "undo": True}, headers=ops).status_code == 200
    assert c.post(f"{API}/bookings/{bid}/reassign", json={"provider_id": "00000000-0000-0000-0000-0000000000c1"}, headers=ops).status_code == 200
    sid = "00000000-0000-0000-0000-0000000000d1"
    assert c.post(f"{API}/orders/{sid}/cancel", headers=ops).status_code == 200
    assert c.post(f"{API}/orders/{sid}/refund", headers=console()).status_code == 200
    assert c.post(f"{API}/customers/{UID}/notes", json={"body": "Prefers evening slots"}, headers=ops).status_code == 201
    rows = audit(S)
    assert [(a.module, a.actor_role) for a in rows] == [("Bookings", "OPS")] * 3 + [("Orders", "OPS"), ("Orders", "ADMIN"), ("Customers", "OPS")]
    assert rows[0].action == "Moved BK-AB12 to En route" and rows[0].before == "Accepted"
    assert rows[1].action.startswith("Undo: moved")
    assert rows[2].after == "Sana Ali" and rows[2].before == "Ravi Kumar"
    assert rows[4].action == "Refunded SO-CD34 (DZ-ORD-ABC123) · ₹719" and rows[4].after == "Refunded"
    assert rows[5].after == "Prefers evening slots"
    assert all(a.actor_name for a in rows)


def test_failed_upstream_write_is_not_audited(ctx):
    c, S, up = ctx
    from fastapi import HTTPException

    def boom(*a, **k):
        raise HTTPException(409, "Nobody has this booking yet. Use Reassign to pick a provider first.")

    with mock.patch.object(up, "post", boom):
        r = c.post(f"{API}/bookings/00000000-0000-0000-0000-0000000000b1/move", json={"to": "accepted"}, headers=console())
    assert r.status_code == 409 and "Reassign" in r.json()["detail"]
    assert audit(S) == []


def test_vendor_go_live_grants_the_vendor_login(ctx):
    c, S, up = ctx
    vid = up.vendor["id"]
    r = c.patch(f"{API}/vendors/{vid}", json={"stage": "live"}, headers=console())
    assert r.status_code == 200
    grants = [x for x in up.calls if x[2] == "/memberships"]
    assert grants and grants[0][3]["role"] == "VENDOR"
    patch = [x for x in up.calls if x[0] == "PATCH"][0]
    assert patch[3]["stage"] == "live" and patch[3]["owner_user_id"]  # market links the owner login to the store
    assert audit(S)[0].before == "Docs" and audit(S)[0].after == "Live"


def test_team_invite_and_remove(ctx):
    c, S, up = ctx
    adm = console()
    assert c.post(f"{API}/team", json={"name": "Kabir", "phone": "98111 22233", "role": "OPS"}, headers=adm).status_code == 201
    assert c.post(f"{API}/team", json={"name": "Kabir", "phone": "12345", "role": "OPS"}, headers=adm).status_code == 422
    assert c.post(f"{API}/team", json={"name": "Neha", "phone": "9000000004", "role": "OPS"}, headers=adm).status_code == 409
    assert c.delete(f"{API}/team/00000000-0000-0000-0000-0000000000e1", headers=adm).status_code == 200
    me = "00000000-0000-0000-0000-0000000000e2"
    assert c.delete(f"{API}/team/{me}", headers=console(user_id=__import__("uuid").UUID(me))).status_code == 409
    acts = [a.action for a in audit(S)]
    assert acts[0] == "Invited Kabir (+91 98xxx xx233)" and acts[1].startswith("Removed Neha Gupta")


# ---------- live visitors ----------
def test_heartbeat_is_anonymous_and_counts_unique_sessions(ctx):
    c, _, _ = ctx
    for sid, page, dev in [("aaaaaaaa-1", "/fresh-food", "mobile"), ("aaaaaaaa-1", "/fresh-food", "mobile"), ("bbbbbbbb-2", "/", "desktop"), ("cccccccc-3", "/nope/x", "mobile")]:
        assert c.post(f"{API}/live/heartbeat", json={"sid": sid, "page": page, "device": dev}).status_code == 204
    live = c.get(f"{API}/live", headers=console(("OPS",))).json()
    assert live["total"] == 3 and live["mobile"] == 2 and live["desktop"] == 1
    pages = {p["label"]: p["n"] for p in live["pages"]}
    assert pages["Fresh Food"] == 1 and pages["Passport"] == 1 and pages["Other"] == 1
    assert c.post(f"{API}/live/heartbeat", json={"sid": "x", "page": "/", "device": "mobile"}).status_code == 422
    assert c.post(f"{API}/live/heartbeat", json={"sid": "dddddddd-4", "page": "/", "device": "tv"}).status_code == 422


def test_heartbeats_older_than_the_window_drop_out(ctx):
    c, _, _ = ctx
    import time as t

    with mock.patch("app.core.live.time.time", return_value=t.time() - 61):
        c.post(f"{API}/live/heartbeat", json={"sid": "eeeeeeee-5", "page": "/", "device": "mobile"})
    c.post(f"{API}/live/heartbeat", json={"sid": "ffffffff-6", "page": "/", "device": "mobile"})
    assert c.get(f"{API}/live", headers=console()).json()["total"] == 1


# ---------- overview ----------
def test_ranges_and_previous_period():
    t = common.ist_today()
    a, b, pa, pb = common.resolve_range("7d")
    assert (a, b) == (t - timedelta(days=6), t) and (pa, pb) == (t - timedelta(days=13), t - timedelta(days=7))
    a, b, pa, pb = common.resolve_range("yesterday")
    assert a == b == t - timedelta(days=1) and pa == pb == t - timedelta(days=2)
    a, b, pa, pb = common.resolve_range("lastmonth")
    assert a.day == 1 and (b + timedelta(days=1)).day == 1 and pa.day == 1 and pa.month != a.month
    a, b, _, _ = common.resolve_range("custom", date(2026, 1, 10), date(2026, 1, 5))
    assert (a, b) == (date(2026, 1, 5), date(2026, 1, 10))
    assert common.inr(12345678) == "₹1,23,456.78" and common.inr(71900) == "₹719"


def test_overview_compares_with_previous_period(ctx):
    c, _, up = ctx
    r = c.get(f"{API}/overview?range=7d", headers=console(("OPS",))).json()
    k = {x["key"]: x for x in r["kpis"]}
    assert k["bookings"]["cur"] == 9 and k["gmv_paise"]["cur"] == 1_200_000 and k["aov_paise"]["cur"] == 100_000 and k["passports"]["cur"] == 5
    assert r["range"]["days"] == 7 and r["overdue"][0]["module"] == "bookings"
    stats = [x for x in up.calls if x[2] == "/stats"]
    assert len(stats) == 6  # 3 services x (current + previous)
    assert r["overdue"][0]["title"].endswith("provider hasn't started")
    assert "9876543210" not in str(r)


# ---------- exports ----------
def test_export_is_admin_only_logged_and_rate_limited(ctx):
    c, S, _ = ctx
    adm = console()
    r = c.get(f"{API}/export/customers.csv", headers=adm)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv") and "Ananya Iyer" in r.text and "+91 98765 43210" in r.text
    assert c.get(f"{API}/export/customers.csv", headers=console(("OPS",))).status_code == 403
    assert c.get(f"{API}/export/bookings.csv", headers=adm).status_code == 200
    assert c.get(f"{API}/export/audit.csv", headers=adm).status_code == 200
    assert c.get(f"{API}/export/audit.csv", headers=adm).status_code == 429  # EXPORTS_PER_HOUR=3 in tests
    rows = [a for a in audit(S) if a.module == "Export"]
    assert [a.action for a in rows] == ["Exported customers.csv", "Exported bookings.csv", "Exported audit.csv"]


# ---------- content ----------
def test_testimonials_need_consent_to_go_live(ctx):
    c, _, _ = ctx
    adm = console()
    t = {"kind": "testimonial", "pet": "Bruno", "parent": "Ananya", "service": "Grooming", "quote": "Came back fluffy and calm.", "consent": False}
    assert c.post(f"{API}/content", json=t, headers=adm).status_code == 422
    item = c.post(f"{API}/content", json={**t, "consent": True}, headers=adm).json()
    assert item["status"] == "draft"
    assert c.patch(f"{API}/content/{item['id']}", json={"status": "live"}, headers=adm).json()["status"] == "live"
    assert c.get(f"{API}/content/public").json()["testimonials"][0]["pet"] == "Bruno"
    off = c.patch(f"{API}/content/{item['id']}", json={"consent": False}, headers=adm).json()
    assert off["status"] == "draft"  # removing consent takes it off the site
    assert c.patch(f"{API}/content/{item['id']}", json={"status": "live"}, headers=adm).status_code == 409
    assert c.get(f"{API}/content/public").json()["testimonials"] == []


def test_faqs_videos_and_site_config(ctx):
    c, S, _ = ctx
    adm = console()
    f = c.post(f"{API}/content", json={"kind": "faq", "page": "Services", "q": "Do you bring the shampoo?", "a": "Yes, every product we use comes with us."}, headers=adm).json()
    assert f["status"] == "draft"
    assert c.get(f"{API}/content/public").json()["faqs"]["Services"] == []
    c.post(f"{API}/content/faqs/Services", json={"status": "live"}, headers=adm)
    assert c.get(f"{API}/content/public").json()["faqs"]["Services"][0]["q"] == "Do you bring the shampoo?"
    v = {"kind": "video", "url": "https://youtube.com/shorts/meL36vGziOQ?feature=share", "page": "Explore"}
    assert c.post(f"{API}/content", json=v, headers=adm).json()["data"]["video_id"] == "meL36vGziOQ"
    assert c.post(f"{API}/content", json=v, headers=adm).status_code == 409
    assert c.post(f"{API}/content", json={**v, "url": "not a link at all"}, headers=adm).status_code == 422
    cfg = {"whatsapp": "919876500000", "phone": "+91 98765 00000", "email": "hello@doggzi.in", "fssai": "", "delivery_areas": "Delhi NCR", "cats_supported": True}
    assert c.put(f"{API}/site-config", json=cfg, headers=adm).json()["cats_supported"] is True
    assert c.put(f"{API}/site-config", json={**cfg, "fssai": "123"}, headers=adm).status_code == 422
    assert any(a.action == "Site config: catsSupported" for a in audit(S))
