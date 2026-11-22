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
