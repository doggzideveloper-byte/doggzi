# Service Provider panel (`/provider`): role PROVIDER (groomers, trainers, boarding partners)
Read PANELS_00_SHARED.md first. **Mobile-first**, because providers are in the field. Make it an installable PWA ("Add to home screen") with web push.

## Screens
1. **Offers:** when the dispatch engine offers a booking, a full-width card slides up with a sound, a vibration and a WhatsApp alert. It shows the services (with the same line-art scenes as the website, shrunk), the pet's avatar, name and breed (plus any notes from the passport, for example "anxious around dryers"), slot, area or pincode, distance, and the **provider's earning** for the job. A countdown ring runs down to the offer expiry.
   **Accept** or **Decline** (with a reason). An expired or declined offer moves on to the next provider automatically.
2. **Today (home):** a timeline of today's accepted jobs. Each job card has one big next-step button that changes with status:
   **Start travel**, then **I've arrived**, then **Start service** (the provider enters the 4-digit **start code** the customer sees on their booking page, which proves the provider is really there), then a **service checklist** (tick each booked item, with optional before and after photos), then **Complete** (the customer's **end code**), then **Collect payment** (only if pay-after-service is on: mark "collected by UPI or cash"). Each step sends a WhatsApp update to the customer.
   Problems: a "Need help" button (OPS WhatsApp) and "Can't make it" (sends the job back to dispatch, and frequent use hurts the provider's rating).
3. **Calendar & availability:** weekly working hours, days off, and a "Go offline now" toggle. Dispatch only offers slots inside these hours.
4. **Earnings:** today, this week and this month. A per-job breakdown and a payout status list.
5. **Profile:** skills (which service types they do), areas (pincodes), documents (ID, certificates) uploaded for OPS verification, and rating.

## Backend (`services/booking` provider routes, scoped to the provider of the logged-in user)
`GET /provider/v1/offers`, `POST /offers/{id}/accept|decline`, `GET /jobs?date`, `POST /jobs/{id}/travel|arrive|start {code}|checklist|complete {code}|collect`, `POST /jobs/{id}/photos`, `GET/PUT /availability`, `GET /earnings`, `GET/PATCH /profile`.
Booking gets a `start_code` and an `end_code`: 4 random digits, stored hashed, shown only to the customer who owns the booking, with 5 tries before the code locks.
