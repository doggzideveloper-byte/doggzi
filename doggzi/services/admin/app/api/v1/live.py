"""Live visitors. The heartbeat is anonymous (apps/web sends it every 30 s while the tab is visible)."""
from typing import Literal

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, Field

from ...core import live
from ...core.access import Staff, staff

router = APIRouter(tags=["live visitors"])


class Beat(BaseModel):
    sid: str = Field(pattern=r"^[A-Za-z0-9-]{8,64}$", description="Random per-tab id (sessionStorage); no personal data")
    page: str = Field(max_length=200, description="Path, e.g. /fresh-food (unknown paths count as Other)")
    device: Literal["mobile", "desktop"]


@router.post("/live/heartbeat", status_code=status.HTTP_204_NO_CONTENT, summary="Anonymous 'I'm on this page' ping (public)")
def heartbeat(body: Beat, request: Request) -> Response:
    # Light abuse guard: at most 12 beats a minute from one session id.
    if live.store().incr(f"rl:beat:{body.sid}", 60) <= 12:
        live.heartbeat(body.sid, body.page, body.device)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/live", summary="People on the site right now (heartbeat in the last 60 s), by page and device")
def now(_: Staff = Depends(staff)) -> dict:
    return live.snapshot()
