# Backlog (not scheduled)

Items agreed but not being built yet. Each needs a Claude Design file first unless noted.

## apps/web: customer "My bookings & orders" page
- Design first (Abhiyash, in Claude Design).
- **Bookings (Services):** each booking's status (requested, offered, confirmed with provider name, en route,
  arrived, in service, done) and, once a provider is assigned, the customer's **start and end codes** that the
  provider asks for.
  API: `GET /api/booking/v1/bookings/me`, `GET /api/booking/v1/bookings/{id}/codes` (owner only; codes appear
  only after a provider accepts).
- **Orders (Marketplace):** each order's sub-orders per store (placed, accepted, packed, out for delivery,
  delivered) and the **4-digit delivery code** the store may ask for at the door.
  API: `GET /api/market/v1/orders/me` exists; still needed: an owner-only `GET /api/market/v1/orders/{id}/codes`
  returning each sub-order's delivery code (derived with the same HMAC as `vendor.delivery_code`).
- Until it ships, the Provider and Vendor panels show the codes only on the demo server (`SEED_DEMO=true`).

## Provider panel follow-ups
- Real web push (VAPID keys + provider); today push messages are logged by services/notification.
- Photo and document storage (only file metadata is kept now).
- Distance on offers once addresses have coordinates.

## Vendor panel follow-ups
- Photo storage (Azure Blob) for product and shop photos; admin approval queue.
- Vendors editing their own delivery pincodes (today: via OPS).

## Admin panel follow-ups
- apps/web still renders FAQs, testimonials, Shorts and site config from `src/content/*`. Switch it to read
  `GET /api/admin/v1/content/public` (live items only) so the Content module takes effect on the site.
  Until then, Content edits are stored, audited and served, but the public pages don't change.
- Real Razorpay: refunds, Route transfers and nightly reconciliation against Razorpay settlements.
  Today they run in test mode: refunds are recorded, transfers and reconciliation are computed from orders.
- Funnel events the site doesn't send yet: "Plan saved" (currently "Plan previews" = pets with a Fresh Food
  plan preview) and "Guide downloads". Add them as anonymous events next to the live-visitors heartbeat.
- Vendor photo approval only records the decision; serving approved photos needs photo storage (see above).
- Provider payouts: "Mark paid" and payout generation per fortnight (today: list and amount owed only).
