"""Calls into the other services' /internal/ APIs (X-Internal-Token). Tests swap this for a fake (get_upstream)."""
import logging

import httpx
from fastapi import HTTPException, status

from .config import get_settings

log = logging.getLogger("admin.upstream")
NAMES = {"auth": "Accounts", "booking": "Bookings", "market": "Marketplace", "pets": "Pet profiles"}


class Upstream:
    def __init__(self) -> None:
        s = get_settings()
        self.base = {"auth": f"{s.auth_url}/api/auth/v1/internal", "booking": f"{s.booking_url}/api/booking/v1/internal/admin",
                     "market": f"{s.market_url}/api/market/v1/internal/admin", "pets": f"{s.pet_profile_url}/api/pet-profile/v1/internal"}
        self.headers = {"X-Internal-Token": s.internal_token}

    def call(self, method: str, svc: str, path: str, *, params: dict | None = None, json: dict | None = None):
        try:
            r = httpx.request(method, self.base[svc] + path, params=params, json=json, headers=self.headers, timeout=10)
        except httpx.HTTPError as e:
            log.warning("%s %s%s failed: %s", method, svc, path, e)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"{NAMES[svc]} service is unavailable. Try again.") from e
        if r.status_code >= 500 or r.status_code in (401, 403):
            log.warning("%s %s%s -> %s %s", method, svc, path, r.status_code, r.text[:300])
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"{NAMES[svc]} service had a problem. Try again.")
        if r.status_code >= 400:
            try:
                detail = r.json().get("detail")
            except ValueError:
                detail = r.text
            if isinstance(detail, list):  # pydantic validation errors
                detail = "; ".join(str(d.get("msg", d)).removeprefix("Value error, ") for d in detail)
            raise HTTPException(r.status_code, detail)
        return r.json() if r.content else None

    def get(self, svc: str, path: str, **params):
        return self.call("GET", svc, path, params={k: v for k, v in params.items() if v is not None})

    def post(self, svc: str, path: str, json: dict | None = None, **params):
        return self.call("POST", svc, path, json=json or {}, params=params or None)

    def patch(self, svc: str, path: str, json: dict):
        return self.call("PATCH", svc, path, json=json)

    def delete(self, svc: str, path: str, **params):
        return self.call("DELETE", svc, path, params={k: v for k, v in params.items() if v is not None})


_up: Upstream | None = None


def get_upstream() -> Upstream:
    global _up
    if _up is None:
        _up = Upstream()
    return _up
