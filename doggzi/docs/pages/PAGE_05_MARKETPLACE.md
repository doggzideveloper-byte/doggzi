# Page 05: Marketplace (`/marketplace`)

## Goal
Shopping that feels as easy as a quick-commerce app, but **every product is sold by a local pet store near you**. The parent browses products filtered to their pet, adds items to a cart (split per store), pays with Razorpay, and each store gets its part of the order in the Vendor panel.
Section colour: **pink**. Text on pink is ink.

## Source data
- `docs/reference/marketplace_catalog_seed.csv`: 51 products taken from `Doggzi_Customer_Menu_Card.pdf`. Columns: sku, name, brand_as_listed, brand_suggested, category, pet_type, price_paise, status and **flags**.
- Categories: **Treats** (22), **Toys** (15), **Grooming & hygiene** (6), **Walking gear** (4), **Health & supplements** (4).
- Pet type: 47 dog, 2 cat, 2 both. The cat range is thin, so show "More for cats coming soon" in cat mode.
- Prices run from ₹99 to ₹2,000. All of them are in paise in the database and shown with `en-IN` grouping.
- **Rows flagged in the CSV must be reviewed by Abhiyash before going live** (see "Data to fix" at the bottom).
- Seeding: every product is listed under one vendor, **"Doggzi Store"** (Doggzi's own shop), until real local vendors are onboarded.

## Product visuals (no outside images)
- Never use manufacturer, Amazon or quick-commerce images. Copying them can break copyright and the brand owners' terms.
- **Phase 1:** each product card shows a **category line-art tile** in the `pets-trio` style (treat jar, bone, rope toy, leash, spray bottle, bottle with a plus sign) on a pink-tinted sticker, with the brand name set in Atma. Each tile has a small idle animation: the jar lid pops, the toy squeaks with motion lines, the leash swings.
- **Phase 2:** vendors upload **their own photos** of products in their shop through the Vendor panel. A photo replaces the tile once Doggzi approves it.

## Page structure
1. **Hero:** "TREATS, TOYS & MORE FOR **BRUNO**". A line-art shopping bag fills with tiny items that bounce in. Below it: a search bar and the pet toggle (Bruno's type pre-selected), plus "Delivered by local stores near you".
2. **Category rail:** five sticker chips with line icons. The selected chip turns pink with the sticker press. The rail sticks to the top while scrolling.
3. **Picked for Bruno:** products for the pet's type and size, for example small chew toys for small breeds, using a simple rule table in config.
4. **Product grid:** card = tile or photo, name, brand, **MRP ₹X struck through** (only when an MRP has been entered) next to the **Doggzi price**, the store name and distance chip ("Doggzi Store · 2.1 km"), and **Add +**. Adding uses the same fly-to-cart arc as Services, and the cart pill shows the item count.
   - Filters: price range, brand, pet type and in stock. Sort: popular, price low→high, new.
   - Out of stock: the card greys out with a "Notify me" option.
5. **Product sheet** (bottom sheet on mobile, modal on desktop): bigger visual, description, size or pack, a quantity stepper, "Sold by" with the store card, and delivery estimate text from config.
6. **Why buy local, the "Compare" band.** It compares **Doggzi** with a generic "big warehouse app" (never named) on: who you're supporting (a local store vs a warehouse), where the money goes (the store's share goes to the local owner via Razorpay Route), returns handled by a store you can call, and delivery time from config. **No competitor prices**, because scraping other platforms breaks their terms and prices change by the minute.
7. **Meet the stores:** a carousel of vendor cards (name, area, a one-line story, "since 20XX", a line-art storefront) taken from vendor profiles. It's hidden until there's at least one real vendor other than Doggzi Store.
8. Testimonials (tag `marketplace`), FAQ (marketplace questions, marked draft), SiteFooter.

## Cart and checkout (drawer, same component family as Services)
1. **Cart grouped by store:** each store group shows its subtotal and a delivery fee from vendor config. Then the grand total, counted up with `en-IN` formatting.
2. **Address:** saved addresses or a new one, checked against each vendor's serviceable pincodes or radius. If a store can't deliver to the address, the drawer says so and offers to remove its items.
3. **Phone OTP** (Auth), only if the person isn't logged in yet.
4. **Pay with Razorpay:** the order is created on the server, the total is recomputed on the server, stock is reserved, and Checkout opens. On success, a **"PACKED WITH LOVE"** stamp lands and the order splits into one sub-order per store.
5. **Order tracking page** (`/orders/:id`): a timeline per store (Placed → Accepted → Packed → Out for delivery → Delivered), with the line-art van from Fresh Food moving along it.

## Backend: `services/market` (new)
Tables (UUID ids, `created_at`/`updated_at`, money in paise):
- `vendors`: name, slug, owner_user_id (role VENDOR), phone, address, lat/lng, serviceable_pincodes[], delivery_fee_paise, hours_json, story, since_year, kyc_status, razorpay_linked_account_id, commission_bps, is_active
- `products`: canonical product: name, brand, category, pet_types[], description, pack_size
- `listings`: vendor_id, product_id, sku, price_paise, mrp_paise (nullable), stock_qty, is_active, photo_url (nullable, Doggzi-approved only)
- `carts`, `cart_items`
- `orders`: user_id (= user.id), address_json, total_paise, status, razorpay_order_id
- `sub_orders`: order_id, vendor_id, subtotal_paise, delivery_fee_paise, commission_paise, status (placed|accepted|rejected|packed|out_for_delivery|delivered|cancelled), sla_due_at
- `sub_order_items`: listing_id, qty, price_paise_at_order
- `stock_reservations`: listing_id, qty, expires_at

Endpoints (`/api/market/v1`):
- `GET /catalog?pet_type&category&q&sort&price_min&price_max`, `GET /listings/{id}`, `GET /vendors/{slug}`
- `POST /cart/items`, `PATCH /cart/items/{id}`, `GET /cart` (grouped by vendor)
- `POST /orders` (auth): validates serviceability, reserves stock, returns a Razorpay order via the payments service
- `GET /orders/me`, `GET /orders/{id}` (owner only)
- Payment captured (event) → sub-orders are created and each vendor is notified (WhatsApp plus Vendor panel). A Route transfer is created per sub-order **on hold**, and released when the sub-order is delivered.

Seed: an Alembic data migration loads `marketplace_catalog_seed.csv`, **skipping rows with a `medicine_check_rules` flag** until they're approved, and using `brand_suggested` only after Abhiyash confirms it.

## Data to fix before launch (from the CSV `flags` column)
1. **Brand labels:** 12 items are listed as "Doggzi Premium" but are other companies' brands (ZippyPaws, FOFOS, Truelove, Pedigree, Lozalo, Super Fun). Showing them as Doggzi's own brand would mislead customers. Use the real brand.
2. **Possible duplicate:** row 11 has the same name as row 2 ("Super Fun Toy Twisted Knotted Bone Dog Toy") but a different brand (Zippy paws) and price (₹975 vs ₹436). It's probably a different product with the wrong name.
3. **Medicine:** row 27, "GRIPTOL-N SYRUP", is a veterinary medicine. Check the rules for selling vet medicines online before listing it. It's excluded from the seed until then.
4. **MRP:** the menu shows only Doggzi's price. Add the MRP printed on each pack so the struck-through MRP shows. Packaged goods in India must display MRP.
