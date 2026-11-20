import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db import get_db
from ...models import Cart, CartItem, Listing
from ...schemas.market import CartGroupOut, CartItemIn, CartLineOut, CartOut
from .logic import listing_out, reserved_qty

router = APIRouter(prefix="/cart", tags=["cart"])


def _cart(db: Session, key: uuid.UUID, create: bool) -> Cart | None:
    cart = db.scalar(select(Cart).where(Cart.cart_key == key))
    if not cart and create:
        cart = Cart(cart_key=key)
        db.add(cart)
        db.flush()
    return cart


def cart_out(db: Session, cart: Cart | None) -> CartOut:
    """Grouped by store, priced from the current listings (never from the client)."""
    if not cart or not cart.items:
        return CartOut(groups=[], item_count=0, total_paise=0)
    res = reserved_qty(db, [i.listing_id for i in cart.items])
    groups: dict = {}
    for it in cart.items:
        lo = listing_out(it.listing, res.get(it.listing_id, 0))
        g = groups.setdefault(it.listing.vendor_id, {"vendor": lo.vendor, "lines": []})
        g["lines"].append(CartLineOut(id=it.id, listing=lo, qty=it.qty, line_total_paise=it.qty * it.listing.price_paise))
    out = []
    for g in groups.values():
        sub = sum(line.line_total_paise for line in g["lines"])
        out.append(CartGroupOut(vendor=g["vendor"], lines=g["lines"], subtotal_paise=sub, delivery_fee_paise=g["vendor"].delivery_fee_paise))
    total = sum(g.subtotal_paise + g.delivery_fee_paise for g in out)
    return CartOut(groups=out, item_count=sum(i.qty for i in cart.items), total_paise=total)


@router.get("", response_model=CartOut, summary="The cart for X-Cart-Id, grouped by store")
def get_cart(x_cart_id: uuid.UUID = Header(..., alias="X-Cart-Id"), db: Session = Depends(get_db)) -> CartOut:
    return cart_out(db, _cart(db, x_cart_id, create=False))


@router.post("/items", response_model=CartOut, summary="Set a line's quantity (0 removes it)")
def set_item(body: CartItemIn, x_cart_id: uuid.UUID = Header(..., alias="X-Cart-Id"), db: Session = Depends(get_db)) -> CartOut:
    listing = db.get(Listing, body.listing_id)
    if not listing or not listing.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    cart = _cart(db, x_cart_id, create=True)
    line = next((i for i in cart.items if i.listing_id == listing.id), None)
    if body.qty == 0:
        if line:
            cart.items.remove(line)
    elif line:
        line.qty = body.qty
    else:
        cart.items.append(CartItem(listing_id=listing.id, qty=body.qty))
    db.commit()
    db.refresh(cart)
    return cart_out(db, cart)


@router.patch("/items/{item_id}", response_model=CartOut)
def patch_item(item_id: uuid.UUID, body: CartItemIn, x_cart_id: uuid.UUID = Header(..., alias="X-Cart-Id"), db: Session = Depends(get_db)) -> CartOut:
    cart = _cart(db, x_cart_id, create=False)
    line = next((i for i in cart.items if i.id == item_id), None) if cart else None
    if not line:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not in your cart")
    if body.qty == 0:
        cart.items.remove(line)
    else:
        line.qty = body.qty
    db.commit()
    db.refresh(cart)
    return cart_out(db, cart)
