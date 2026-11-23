"""SEED_DEMO=true: Vendor panel demo data (local / demo server only; a no-op otherwise).

- 9000000002 (Meera) owns Doggzi Store; 9000000005 (Arjun) owns a small second store, "Paws Corner".
  User ids are uuid5 of the phone, the same as services/auth seed_demo.
- Doggzi Store gets one order in each column (New, Packing, Ready, Out) and delivered orders for Payouts.
Safe to run on every start: it only adds what's missing. Run: python -m app.seed_demo
"""
import random
import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .core.config import get_settings
from .core.time import utcnow
from .db import SessionLocal
from .models import Listing, Order, Product, ProductRequest, SubOrder, SubOrderItem, Vendor, VendorMember

DEMO_NS = uuid.UUID("6f1c2a8e-3b7d-4c55-9e0a-d0991e5f0d01")  # same as services/auth
DEMO_CUSTOMER = uuid.uuid5(DEMO_NS, "demo-customer")
CUSTOMERS = [
    ({"name": "Bruno", "type": "dog", "breed": "Labrador Retriever"}, "Sector 56", "+919876543210"),
    ({"name": "Coco", "type": "dog", "breed": "Shih Tzu"}, "Sector 57", "+919812345609"),
    ({"name": "Mishti", "type": "cat", "breed": "Persian"}, "Sector 50", "+919988776612"),
    ({"name": "Leo", "type": "dog", "breed": "Beagle"}, "DLF Phase 3", "+919900112233"),
    ({"name": "Simba", "type": "dog", "breed": "Golden Retriever"}, "Sector 49", "+919810098100"),
]


def user_id(phone: str) -> uuid.UUID:
    return uuid.uuid5(DEMO_NS, phone)


PIPELINE = [  # Admin panel: stores still onboarding
    ("Paws & Claws", "paws-and-claws", "+919100000021", "Sector 29, Gurgaon", "razorpay"),
    ("Happy Tails Pet Shop", "happy-tails", "+919100000022", "DLF Phase 4, Gurgaon", "docs"),
    ("The Pet Corner", "the-pet-corner", "+919100000023", "Sector 14, Gurgaon", "applied"),
]


def seed_admin(db: Session, doggzi: Vendor) -> list[str]:
    made = []
    # Older demo data used one shared customer id; give each order its customer's own id (demo rows only).
    for o in db.scalars(select(Order).where(Order.user_id == DEMO_CUSTOMER)):
        if o.customer_phone:
            o.user_id = user_id(o.customer_phone)
    if db.scalar(select(Vendor).where(Vendor.slug == PIPELINE[0][1])):
        return made
    for name, slug, phone, area, stage in PIPELINE:
        db.add(Vendor(name=name, slug=slug, phone=phone, area=area, serviceable_pincodes=["122001", "122002", "122011"], delivery_fee_paise=4900, commission_bps=1200,
                      stage=stage, kyc_status="verified" if stage == "razorpay" else "pending", hours_text="Mon–Sun, 10 am – 8 pm"))
    # One order the store turned down: it waits for OPS to reassign or refund.
    so = new_sub_order(db, doggzi, 35, "placed", k=1)
    so.status, so.reject_reason = "rejected", "Out of stock"
    for it in so.items:
        it.listing.stock_qty += it.qty
    # A vendor photo and a product request waiting for approval.
    x = db.scalar(select(Listing).where(Listing.vendor_id == doggzi.id).order_by(Listing.sku))
    if x and x.photo_status == "none":
        x.photo_status, x.photo_meta = "pending", {"name": "shelf-photo.jpg", "size": 182000, "at": utcnow().isoformat()}
    db.add(ProductRequest(vendor_id=doggzi.id, name="Himalaya Erina-EP Tick & Flea Shampoo 200 ml", brand="Himalaya", category="grooming", price_paise=29900))
    made.append("Admin pipeline + needs-OPS order")
    return made


def new_sub_order(db: Session, v: Vendor, minutes_ago: int = 0, status: str = "placed", k: int | None = None) -> SubOrder:
    """One paid order from a demo customer to this store, at a given step."""
    s = get_settings()
    rnd = random.Random(k if k is not None else random.random())
    pet, area, phone = CUSTOMERS[(k if k is not None else rnd.randrange(len(CUSTOMERS))) % len(CUSTOMERS)]
    pool = db.scalars(select(Listing).where(Listing.vendor_id == v.id, Listing.is_active.is_(True)).order_by(Listing.sku)).all()
    picks = rnd.sample(pool, k=min(len(pool), rnd.choice([1, 2, 3])))
    when = utcnow() - timedelta(minutes=minutes_ago)
    lines = [(x, rnd.choice([1, 1, 2])) for x in picks]
    sub = sum(x.price_paise * q for x, q in lines)
    addr = {"line1": "Flat 12B, Tower 4", "line2": area, "city": "Gurgaon", "pincode": "122011"}
    o = Order(user_id=user_id(phone), address_json=addr, total_paise=sub + v.delivery_fee_paise, status="paid", payment_mode="mock", customer_phone=phone, pet_snapshot=pet,
              lines_json=[{"listing_id": str(x.id), "sku": x.sku, "name": x.product.name, "qty": q, "price_paise": x.price_paise, "vendor_id": str(v.id)} for x, q in lines])
    o.created_at = when
    db.add(o)
    db.flush()
    so = SubOrder(order_id=o.id, vendor_id=v.id, subtotal_paise=sub, delivery_fee_paise=v.delivery_fee_paise, commission_paise=sub * v.commission_bps // 10_000,
                  status=status, sla_due_at=when + timedelta(minutes=s.accept_sla_minutes))
    so.created_at = when
    db.add(so)
    db.flush()
    for x, q in lines:
        db.add(SubOrderItem(sub_order_id=so.id, listing_id=x.id, qty=q, price_paise_at_order=x.price_paise))
    db.flush()
    db.refresh(so)
    if status != "placed":
        so.accepted_at = when + timedelta(minutes=2)
        so.pack_checks = [status != "accepted"] * len(lines)
        if status == "accepted" and lines:
            so.pack_checks = [True] + [False] * (len(lines) - 1)
    if status in ("packed", "out_for_delivery", "delivered"):
        so.packed_at = when + timedelta(minutes=8)
    if status in ("out_for_delivery", "delivered"):
        so.out_at = when + timedelta(minutes=12)
    if status == "delivered":
        so.delivered_at, so.payout_status = when + timedelta(minutes=40), "released"
    return so


def seed(db: Session) -> str:
    made = []
    doggzi = db.scalar(select(Vendor).where(Vendor.is_doggzi.is_(True)))
    if not doggzi:
        return "no Doggzi Store (catalog migration not run)"
    # Fill only what's missing (the catalog migration already gives Doggzi Store a story).
    doggzi.story = doggzi.story or "Doggzi's own shop, stocked by people who love pets."
    doggzi.since_year = doggzi.since_year or 2024
    doggzi.hours_text = doggzi.hours_text or "Mon–Sun, 9 am – 9 pm"
    doggzi.commission_bps = doggzi.commission_bps or 1000  # DRAFT 10%
    doggzi.phone = doggzi.phone or "+919000000002"
    if not db.scalar(select(VendorMember).where(VendorMember.user_id == user_id("+919000000002"))):
        db.add(VendorMember(vendor_id=doggzi.id, user_id=user_id("+919000000002"), phone="+919000000002", name="Meera Shah", role="owner"))
        made.append("Meera → Doggzi Store")
    paws = db.scalar(select(Vendor).where(Vendor.slug == "paws-corner"))
    if not paws:
        paws = Vendor(name="Paws Corner", slug="paws-corner", phone="+919000000005", area="Sector 49, Gurgaon", story="A neighbourhood pet shop since the first Labrador moved in.",
                      since_year=2019, serviceable_pincodes=["122018", "122011", "122002"], delivery_fee_paise=3900, commission_bps=1000, hours_text="Mon–Sat, 10 am – 8 pm", kyc_status="verified")
        db.add(paws)
        db.flush()
        for i, p in enumerate(db.scalars(select(Product).order_by(Product.popularity_rank).limit(3)).all(), 1):
            db.add(Listing(vendor_id=paws.id, product_id=p.id, sku=f"PAWSCO-{i:03d}", price_paise=19900 + i * 5000, mrp_paise=24900 + i * 5000, stock_qty=6 + i))
        made.append("Paws Corner")
    if not db.scalar(select(VendorMember).where(VendorMember.user_id == user_id("+919000000005"))):
        db.add(VendorMember(vendor_id=paws.id, user_id=user_id("+919000000005"), phone="+919000000005", name="Arjun Mehta", role="owner"))
    db.flush()
    if not db.scalar(select(SubOrder.id).where(SubOrder.vendor_id == doggzi.id)):
        for k, (mins, st) in enumerate([(2, "placed"), (18, "accepted"), (46, "packed"), (75, "out_for_delivery")]):
            new_sub_order(db, doggzi, mins, st, k=k)
        for k, days in enumerate([1, 1, 2, 3, 6, 9, 12]):
            so = new_sub_order(db, doggzi, days * 24 * 60, "delivered", k=k + 4)
            if days > 2:
                so.payout_status, so.settled_at = "settled", so.delivered_at + timedelta(days=2)
        made.append("Doggzi Store orders")
    db.flush()
    made += seed_admin(db, doggzi)
    db.commit()
    return ", ".join(made) or "nothing new"


if __name__ == "__main__":
    if get_settings().seed_demo:
        with SessionLocal() as db:
            print(f"seed_demo: {seed(db)}")
    else:
        print("seed_demo: SEED_DEMO is off, nothing to do")
