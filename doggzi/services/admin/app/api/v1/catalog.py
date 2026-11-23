"""Catalog (ADMIN only): services and packages (booking), marketplace products, vendor photo / product approvals."""
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...core.access import Staff, admin_only
from ...core.audit import record
from ...core.upstream import Upstream, get_upstream
from ...db import get_db
from .common import inr

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/services")
def services(_: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream)) -> list[dict]:
    return up.get("booking", "/items")


class ServicePatch(BaseModel):
    price_paise: int | None = Field(default=None, gt=0, le=10_000_000)
    is_active: bool | None = None
    cats: bool | None = None


@router.patch("/services/{iid}", summary="Price change (confirmed with a preview in the panel), active, cats")
def patch_service(iid: uuid.UUID, body: ServicePatch, who: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    r = up.patch("booking", f"/items/{iid}", body.model_dump(exclude_none=True))
    b = r.pop("before")
    if body.price_paise is not None:
        record(db, who, "Catalog", f"Price of {r['name']}", target=r["slug"], before=inr(b["price_paise"]), after=inr(r["price_paise"]))
    if body.is_active is not None:
        record(db, who, "Catalog", f"{r['name']} active", target=r["slug"], before=str(b["is_active"]).lower(), after=str(r["is_active"]).lower())
    if body.cats is not None:
        record(db, who, "Catalog", f"{r['name']} for cats", target=r["slug"], before=str(b["cats"]).lower(), after=str(r["cats"]).lower())
    return r


class ServiceIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    group: Literal["package", "spa", "training", "boarding", "pickup"]
    price_paise: int = Field(gt=0, le=10_000_000)
    cats: bool = False
    includes: list[str] = Field(default=[], max_length=20)


@router.post("/services", status_code=status.HTTP_201_CREATED, summary="Add a service, or a package (includes = names of existing services)")
def add_service(body: ServiceIn, who: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    r = up.post("booking", "/items", body.model_dump())
    kind = "package" if body.group == "package" else "service"
    record(db, who, "Catalog", f"Added {kind} {r['name']}" + (f" ({', '.join(r['includes'])})" if r["includes"] else ""), target=r["slug"], after=inr(r["price_paise"]))
    return r


@router.get("/products")
def products(_: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream)) -> list[dict]:
    return up.get("market", "/products")


class ProductPatch(BaseModel):
    brand: str | None = Field(default=None, min_length=1, max_length=80)
    brand_confirmed: bool | None = None
    is_blocked: bool | None = None


@router.patch("/products/{pid}", summary="Fix brand, confirm brand, block / unblock (blocked products leave the site)")
def patch_product(pid: uuid.UUID, body: ProductPatch, who: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    r = up.patch("market", f"/products/{pid}", body.model_dump(exclude_none=True))
    b = r.pop("before")
    if body.brand is not None and b["brand"] != r["brand"]:
        record(db, who, "Catalog", f"Brand of {r['name']}", target=r["sku"], before=b["brand"], after=r["brand"])
    if body.brand_confirmed is not None:
        record(db, who, "Catalog", f"Brand confirmed for {r['name']}" if r["brand_confirmed"] else f"Brand unconfirmed for {r['name']}", target=r["sku"],
               before="unconfirmed" if not b["brand_confirmed"] else "confirmed", after=r["brand"])
    if body.is_blocked is not None:
        record(db, who, "Catalog", f"{'Blocked' if r['is_blocked'] else 'Unblocked'} {r['name']}", target=r["sku"], before="blocked" if b["is_blocked"] else "live",
               after="blocked" if r["is_blocked"] else "live")
    return r


class ProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    brand: str = Field(min_length=1, max_length=80)
    category: Literal["treats", "toys", "grooming", "walking", "health"]
    pet_type: Literal["dog", "cat", "both"]
    price_paise: int = Field(gt=0, le=10_000_000)
    mrp_paise: int | None = Field(default=None, gt=0, le=10_000_000)


@router.post("/products", status_code=status.HTTP_201_CREATED, summary="Add a product (listed in Doggzi Store)")
def add_product(body: ProductIn, who: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    r = up.post("market", "/products", body.model_dump())
    record(db, who, "Catalog", f"Added product {r['name']}", target=r["sku"], after=inr(r["price_paise"]))
    return r


@router.get("/approvals", summary="Vendor photos and product requests waiting for a decision")
def approvals(_: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream)) -> dict:
    return up.get("market", "/approvals")


class Decision(BaseModel):
    approve: bool


@router.post("/approvals/photos/{lid}")
def photo(lid: uuid.UUID, body: Decision, who: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    r = up.post("market", f"/listings/{lid}/photo", body.model_dump())
    record(db, who, "Catalog", f"{'Approved' if body.approve else 'Rejected'} {r['vendor']} photo for {r['product']}", target=r["sku"], before="pending", after=r["photo_status"])
    return r


@router.post("/approvals/requests/{rid}")
def request(rid: uuid.UUID, body: Decision, who: Staff = Depends(admin_only), up: Upstream = Depends(get_upstream), db: Session = Depends(get_db)) -> dict:
    r = up.post("market", f"/product-requests/{rid}", body.model_dump())
    record(db, who, "Catalog", f"{'Approved' if body.approve else 'Rejected'} product request: {r['name']}", before="pending", after=r["status"])
    return r
