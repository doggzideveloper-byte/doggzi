from fastapi import APIRouter, FastAPI

from .api.v1 import send

PREFIX = "/api/notification"
app = FastAPI(title="Doggzi notification", version="1.0.0", description="Internal: sends OTP SMS through a pluggable provider.", docs_url=f"{PREFIX}/docs", openapi_url=f"{PREFIX}/openapi.json")
v1 = APIRouter(prefix=f"{PREFIX}/v1")
v1.include_router(send.router)
app.include_router(v1)


@app.get(f"{PREFIX}/healthz", tags=["ops"])
def healthz() -> dict:
    return {"ok": True, "service": "notification"}
