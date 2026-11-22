from fastapi import APIRouter, FastAPI

from .api.v1 import cart, catalog, orders, vendor

PREFIX = "/api/market"
app = FastAPI(title="Doggzi market", version="1.0.0", description="Marketplace (Page 5): catalog from local stores, carts split per store, orders and sub-orders. Payments run in mock mode until Razorpay test keys are set.", docs_url=f"{PREFIX}/docs", openapi_url=f"{PREFIX}/openapi.json")
v1 = APIRouter(prefix=f"{PREFIX}/v1")
v1.include_router(catalog.router)
v1.include_router(cart.router)
v1.include_router(orders.router)
v1.include_router(vendor.router)
app.include_router(v1)


@app.get(f"{PREFIX}/healthz", tags=["ops"])
def healthz() -> dict:
    return {"ok": True, "service": "market"}
