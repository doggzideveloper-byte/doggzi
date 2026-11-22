import logging
import threading
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from .api.v1 import admin, provider, public
from .core.config import get_settings

PREFIX = "/api/booking"
log = logging.getLogger("booking")


def _sweeper(stop: threading.Event, every: int) -> None:
    """Expire overdue offers and move them on, even when no provider is looking at the panel."""
    from .core import dispatch
    from .db import SessionLocal

    while not stop.wait(every):
        try:
            with SessionLocal() as db:
                dispatch.sweep(db)
        except Exception as e:  # noqa: BLE001 - keep sweeping
            log.warning("dispatch sweep failed: %s", e)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    stop = threading.Event()
    every = get_settings().dispatch_sweep_seconds
    t = threading.Thread(target=_sweeper, args=(stop, every), daemon=True) if every > 0 else None
    if t:
        t.start()
    yield
    stop.set()


app = FastAPI(title="Doggzi booking", version="1.0.0", description="Services catalog, slots, booking requests, dispatch and the Provider panel API.",
              docs_url=f"{PREFIX}/docs", openapi_url=f"{PREFIX}/openapi.json", lifespan=lifespan)
v1 = APIRouter(prefix=f"{PREFIX}/v1")
v1.include_router(public.router)
v1.include_router(admin.router)
v1.include_router(provider.router)
app.include_router(v1)


@app.get(f"{PREFIX}/healthz", tags=["ops"])
def healthz() -> dict:
    return {"ok": True, "service": "booking"}
