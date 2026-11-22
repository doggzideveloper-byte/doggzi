from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...core.facets import brand_display, brand_key
from ...core.time import utcnow
from ...models import Listing, Order, StockReservation, SubOrder, Vendor
from ...schemas.market import ListingOut, OrderOut, SubOrderItemOut, SubOrderOut, VendorOut


def aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def vendor_out(v: Vendor) -> VendorOut:
    return VendorOut(id=v.id, name=v.name, slug=v.slug, area=v.area, story=v.story, since_year=v.since_year, delivery_fee_paise=v.delivery_fee_paise,
                     serviceable_pincodes=list(v.serviceable_pincodes or []), is_doggzi=v.is_doggzi)


def reserved_qty(db: Session, listing_ids: list) -> dict:
    """Live reservations (unexpired, for unpaid orders) hold stock back from other shoppers."""
    if not listing_ids:
        return {}
    rows = db.execute(
        select(StockReservation.listing_id, func.sum(StockReservation.qty)).where(StockReservation.listing_id.in_(listing_ids), StockReservation.expires_at > utcnow()).group_by(StockReservation.listing_id)
    ).all()
    return {lid: int(q or 0) for lid, q in rows}


def listing_out(item: Listing, reserved: int = 0) -> ListingOut:
    p = item.product
    avail = max(0, item.stock_qty - reserved)
    return ListingOut(
        id=item.id, sku=item.sku, name=p.name, brand=brand_display(p.brand), brand_key=brand_key(p.brand), category=p.category, pet_types=list(p.pet_types or []),  # type: ignore[arg-type]
        description=p.description, pack_size=p.pack_size, price_paise=item.price_paise, mrp_paise=item.mrp_paise,
        in_stock=avail > 0, available_qty=avail, photo_url=item.photo_url, popularity_rank=p.popularity_rank, vendor=vendor_out(item.vendor),
    )


def sub_order_out(so: SubOrder) -> SubOrderOut:
    return SubOrderOut(
        id=so.id, vendor=vendor_out(so.vendor), subtotal_paise=so.subtotal_paise, delivery_fee_paise=so.delivery_fee_paise, status=so.status,  # type: ignore[arg-type]
        sla_due_at=aware(so.sla_due_at) if so.sla_due_at else None,
        items=[SubOrderItemOut(sku=i.listing.sku, name=i.listing.product.name, qty=i.qty, price_paise_at_order=i.price_paise_at_order) for i in so.items],
    )


def order_out(o: Order) -> OrderOut:
    return OrderOut(id=o.id, status=o.status, total_paise=o.total_paise, address=o.address_json, created_at=aware(o.created_at),  # type: ignore[arg-type]
                    sub_orders=[sub_order_out(s) for s in o.sub_orders], lines=list(o.lines_json or []))
