"""Payments (ADMIN only). Razorpay is in test / mock mode: these are records, no money moves."""
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends

from ...core.access import Staff, admin_only
from ...core.upstream import Upstream, get_upstream

router = APIRouter(tags=["payments"])


def payments_data(up: Upstream) -> dict:
    with ThreadPoolExecutor(2) as ex:
        fm, fb = ex.submit(up.get, "market", "/payments"), ex.submit(up.get, "booking", "/payouts")
        m, b = fm.result(), fb.result()
    return {**m, "payouts": b["owed"], "payout_history": b["payouts"], "collected": b["collected"], "mode": "test"}


@router.get("/payments", summary="Payments, refunds, Route transfers, reconciliation, provider payouts (test mode)")
def payments(_: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream)) -> dict:
    return payments_data(up)
