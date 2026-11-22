from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1 import breeds, internal, pets
from .core.config import get_settings

PREFIX = "/api/pet-profile"

settings = get_settings()
app = FastAPI(
    title="Doggzi pet-profile",
    version="1.0.0",
    description="Pet Passport: breeds, guest passports, nutrition details and claiming after login.",
    docs_url=f"{PREFIX}/docs",
    openapi_url=f"{PREFIX}/openapi.json",
)
if settings.cors_origins:
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(","), allow_methods=["*"], allow_headers=["*"])

v1 = APIRouter(prefix=f"{PREFIX}/v1")
v1.include_router(breeds.router)
v1.include_router(pets.router)
v1.include_router(internal.router)
app.include_router(v1)


@app.get(f"{PREFIX}/healthz", tags=["ops"])
def healthz() -> dict:
    return {"ok": True, "service": settings.service_name}
