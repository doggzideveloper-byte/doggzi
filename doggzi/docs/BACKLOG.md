# Backlog (not scheduled)

Items agreed but not being built yet. Each needs a Claude Design file first unless noted.

## apps/web: customer "My bookings" page
- Design first (Abhiyash, in Claude Design).
- Shows each booking's status (requested, offered, confirmed with provider name, en route, arrived, in service, done)
  and, once a provider is assigned, the customer's **start and end codes** that the provider asks for.
- API already exists: `GET /api/booking/v1/bookings/me` and `GET /api/booking/v1/bookings/{id}/codes`
  (owner only; codes appear only after a provider accepts).
- Until it ships, the Provider panel shows the codes only on the demo server (`SEED_DEMO=true`).

## Provider panel follow-ups
- Real web push (VAPID keys + provider); today push messages are logged by services/notification.
- Photo and document storage (only file metadata is kept now).
- Distance on offers once addresses have coordinates.
