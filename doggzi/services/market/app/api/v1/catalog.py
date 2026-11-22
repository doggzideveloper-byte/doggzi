import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core import cache, facets as fx
from ...core.config import get_settings
from ...db import get_db
from ...models import Listing, Product, Vendor
from ...schemas.market import BrowseOut, CatalogOut, ListingOut, VendorOut
from .logic import listing_out, reserved_qty, vendor_out

router = APIRouter(tags=["catalog"])


@router.get("/catalog", response_model=CatalogOut, summary="Listings filtered to a pet, with live availability")
def catalog(
    pet_type: Literal["dog", "cat"],
    category: Literal["treats", "toys", "grooming", "walking", "health"] | None = None,
    q: str = Query(default="", max_length=60),
    sort: Literal["popular", "price_asc", "price_desc", "new"] = "popular",
    price_min: int | None = Query(default=None, ge=0, description="paise"),
    price_max: int | None = Query(default=None, ge=0, description="paise"),
    db: Session = Depends(get_db),
) -> CatalogOut:
    key = f"market:catalog:v1:{pet_type}:{category}:{q.strip().lower()}:{sort}:{price_min}:{price_max}"
    hit = cache.get(key)
    if hit is not None:
        return CatalogOut(**hit)
    stmt = select(Listing).join(Listing.product).join(Listing.vendor).where(Listing.is_active.is_(True), Vendor.is_active.is_(True), Vendor.holiday_mode.is_(False))
    if category:
        stmt = stmt.where(Product.category == category)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(Product.name.ilike(like) | Product.brand.ilike(like))
    if price_min is not None:
        stmt = stmt.where(Listing.price_paise >= price_min)
    if price_max is not None:
        stmt = stmt.where(Listing.price_paise <= price_max)
    rows = [r for r in db.scalars(stmt) if pet_type in (r.product.pet_types or [])]
    order = {
        "popular": lambda r: r.product.popularity_rank,
        "price_asc": lambda r: (r.price_paise, r.product.popularity_rank),
        "price_desc": lambda r: (-r.price_paise, r.product.popularity_rank),
        "new": lambda r: -r.product.popularity_rank,
    }[sort]
    rows.sort(key=order)
    res = reserved_qty(db, [r.id for r in rows])
    vendors = db.scalars(select(Vendor).where(Vendor.is_active.is_(True)).order_by(Vendor.is_doggzi, Vendor.name)).all()
    out = CatalogOut(items=[listing_out(r, res.get(r.id, 0)) for r in rows], vendors=[vendor_out(v) for v in vendors])
    cache.set(key, out.model_dump(mode="json"), get_settings().catalog_cache_seconds)
    return out


def _csv(v: str, allowed: set[str] | None = None, limit: int = 40) -> frozenset[str]:
    out = {x.strip().lower() for x in v.split(",") if x.strip()}
    return frozenset(sorted(x for x in out if allowed is None or x in allowed)[:limit])


@router.get("/browse", response_model=BrowseOut, summary="Shop grid: filters, sort and facet counts (each facet counted with the other filters applied)")
def browse(
    pet: Literal["dog", "cat", "both"] = "both",
    cat: Literal["treats", "toys", "grooming", "walking", "health"] | None = None,
    price: str = Query(default="", max_length=80, description="Comma list of under-250, 250-500, 500-1000, 1000-plus"),
    brand: str = Query(default="", max_length=600, description="Comma list of brand keys (from facets.brand)"),
    in_stock: bool = False,
    q: str = Query(default="", max_length=60),
    sort: Literal["popular", "price_asc", "price_desc", "new"] = "popular",
    db: Session = Depends(get_db),
) -> BrowseOut:
    f = fx.Filters(pet=pet, category=cat, prices=_csv(price, {k for k, *_ in fx.PRICE_BUCKETS}), brands=_csv(brand), in_stock=in_stock, q=q, sort=sort)
    key = f"market:browse:v1:{f.pet}:{f.category}:{','.join(sorted(f.prices))}:{','.join(sorted(f.brands))}:{int(f.in_stock)}:{f.q.strip().lower()}:{f.sort}"
    hit = cache.get(key)
    if hit is not None:
        return BrowseOut(**hit)
    stmt = select(Listing).join(Listing.product).join(Listing.vendor).where(Listing.is_active.is_(True), Vendor.is_active.is_(True), Vendor.holiday_mode.is_(False))
    listings = [r for r in db.scalars(stmt) if set(r.product.pet_types or []) & {"dog", "cat"}]
    res = reserved_qty(db, [r.id for r in listings])
    outs = [listing_out(r, res.get(r.id, 0)) for r in listings]
    rows = [fx.Row(id=o.id, name=o.name, brand=r.product.brand, category=o.category, pet_types=list(o.pet_types), price_paise=o.price_paise,
                   in_stock=o.in_stock, popularity_rank=o.popularity_rank, payload=o) for r, o in zip(listings, outs)]
    b = fx.browse(rows, f)
    out = BrowseOut(items=[r.payload for r in b["items"]], total=b["total"], facets=b["facets"])
    cache.set(key, out.model_dump(mode="json"), get_settings().catalog_cache_seconds)
    return out


@router.get("/listings/{listing_id}", response_model=ListingOut)
def get_listing(listing_id: uuid.UUID, db: Session = Depends(get_db)) -> ListingOut:
    item = db.get(Listing, listing_id)
    if not item or not item.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return listing_out(item, reserved_qty(db, [item.id]).get(item.id, 0))


@router.get("/vendors/{slug}", response_model=VendorOut)
def get_vendor(slug: str, db: Session = Depends(get_db)) -> VendorOut:
    v = db.scalar(select(Vendor).where(Vendor.slug == slug, Vendor.is_active.is_(True)))
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Store not found")
    return vendor_out(v)
