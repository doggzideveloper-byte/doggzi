from fastapi import APIRouter, FastAPI

from .api.v1 import audit, catalog, content, live, money, ops, overview, people

PREFIX = "/api/admin"
app = FastAPI(title="Doggzi admin", version="1.0.0",
              description="Admin panel API. ADMIN on every route; OPS on Overview, Bookings, Orders and Customers (phones masked) and read-only Vendors / Providers. "
                          "Every write is recorded in the audit log. Calls booking, market, auth and pet-profile through their internal APIs.",
              docs_url=f"{PREFIX}/docs", openapi_url=f"{PREFIX}/openapi.json")
v1 = APIRouter(prefix=f"{PREFIX}/v1")
for r in (live.router, overview.router, ops.router, people.router, catalog.router, money.router, content.router, audit.router):
    v1.include_router(r)
app.include_router(v1)


@app.get(f"{PREFIX}/healthz", tags=["ops"])
def healthz() -> dict:
    return {"ok": True, "service": "admin"}
