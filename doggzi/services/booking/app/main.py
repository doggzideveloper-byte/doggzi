from fastapi import APIRouter, FastAPI

from .api.v1 import admin, public

PREFIX = "/api/booking"
app = FastAPI(title="Doggzi booking", version="1.0.0", description="Services catalog, slots and booking requests (Page 4).", docs_url=f"{PREFIX}/docs", openapi_url=f"{PREFIX}/openapi.json")
v1 = APIRouter(prefix=f"{PREFIX}/v1")
v1.include_router(public.router)
v1.include_router(admin.router)
app.include_router(v1)


@app.get(f"{PREFIX}/healthz", tags=["ops"])
def healthz() -> dict:
    return {"ok": True, "service": "booking"}
