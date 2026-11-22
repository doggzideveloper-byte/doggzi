from fastapi import APIRouter, FastAPI

from .api.v1 import console, internal, otp

PREFIX = "/api/auth"
app = FastAPI(title="Doggzi auth", version="1.0.0", description="Phone OTP login. Issues the user JWT that every service verifies.", docs_url=f"{PREFIX}/docs", openapi_url=f"{PREFIX}/openapi.json")
v1 = APIRouter(prefix=f"{PREFIX}/v1")
v1.include_router(otp.router)
v1.include_router(console.router)
v1.include_router(internal.router)
app.include_router(v1)


@app.get(f"{PREFIX}/healthz", tags=["ops"])
def healthz() -> dict:
    return {"ok": True, "service": "auth"}
