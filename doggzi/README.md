# Doggzi

Pet care for dogs and cats across Delhi NCR. *Not just food. Their food.*

This monorepo implements the Claude Design handoff (`../project`, `../chats`) as a real app:
React + Vite + TypeScript on the front, FastAPI services behind an nginx gateway on the back.
Read `CLAUDE.md` and `docs/` first; page specs live in `docs/pages/`.

## Run it

### Everything (Docker)
```bash
cp .env.example .env        # fill POSTGRES_PASSWORD, GUEST_JWT_SECRET, AUTH_JWT_SECRET, INTERNAL_TOKEN
docker compose up --build
open http://localhost:8080
```
OTPs are printed by the `notification` service (`docker compose logs -f notification`) and, with
`OTP_DEV_ECHO=true`, also shown in the booking drawer.

### Frontend only
```bash
cd apps/web && npm install && npm run dev     # http://localhost:5173
```
Without a gateway the app still works: breeds and the services catalog fall back to bundled copies,
passports are kept in `localStorage`, and the booking drawer runs as a clearly labelled local demo.
Point it at a running gateway with `VITE_GATEWAY_URL=http://localhost:8080`.

The **Tweaks** button (bottom left, dev builds or `?tweaks=1`) carries over the prototype's preview
switches: demo pet (dog/cat), device (iOS/Android/Desktop for Smart Download), `catsSupported` and
forced reduced motion.

### Tests
```bash
cd services/<name> && uv venv && uv pip install -r requirements-dev.txt && .venv/bin/pytest
# market and booking can also run against a real Postgres (catches dialect-only bugs such as row locking):
TEST_DATABASE_URL=postgresql+psycopg://user@host/throwaway_db .venv/bin/pytest
cd apps/web && npm run typecheck && npm run build
```

## What's here

| Route | Page | Backend |
|---|---|---|
| `/` | Pet Passport: live passport card, dog/cat picker with hops, breed combobox, APPROVED stamp, card flies into the header chip | `pet-profile`: `GET /breeds`, `POST /pets/guest`, `PATCH /pets/{id}` |
| `/choose` | Three flip cards with deal-in, pointer tilt, flip, Continue handoff in section colour | `GET /pets/me`, `PATCH /pets/{id}`; teasers in `features/choose/teasers.ts` |
| `/explore` | Hero, what we do, how it works, fresh vs kibble, YouTube facades, testimonials, FAQ (+JSON-LD), sticky CTA | content config only |
| `/fresh-food` | Bowl builder + phone fan, kibble slider, plans, nutrition preview, 3D coverflow, app wall + lightbox, kitchen-to-door route, switch strip, Smart Download | `PATCH /pets/{id}/nutrition`, `PATCH /pets/{id}/preferences`, gateway `GET /app` |
| `/services` | ServiceScene line-art for every item, package sequences with synced checklists, fly-to-cart, booking drawer (cart → slot → address → OTP → review → BOOKED) | `booking`, `auth`, `notification`, `POST /pets/claim` |
| `/marketplace` | Products filtered to the pet, animated category tiles (no outside images), rail, filters, product sheet, "Why buy local", cart split per store, checkout (address per-store serviceability → OTP → **mock payment**) → PACKED WITH LOVE | `market`: `GET /catalog`, `/listings/{id}`, `/vendors/{slug}`, cart (`X-Cart-Id`), `POST /orders` (server total + stock reservations), `POST /orders/{id}/pay/mock`, `GET /orders/me`, `/orders/{id}` |
| `/orders/:id` | Per-store timeline (Placed → Delivered) | `GET /orders/{id}` (owner only) |

Services: `services/pet-profile`, `services/auth`, `services/booking`, `services/market`, `services/notification` (internal).
OpenAPI docs: `/api/<service>/docs` through the gateway.

Shared design-system components (`apps/web/src/design-system/components`): Button, Badge, Header (logo
sticker disc), PassportChip, PetAvatar + PetSprite, PetsTrio, FlipCard, SiteFooter, Testimonials, FAQ,
AppDownload, HighlightName/Sweep, Toast, and the scroll-reveal hooks.

## Marketplace: test mode and data to fix
- **Payments are mocked** (`PAYMENTS_MODE=mock`): `POST /orders` prices the cart on the server and reserves stock for 15 minutes, then `POST /orders/{id}/pay/mock` stands in for Razorpay and creates one sub-order per store. Razorpay Checkout, the webhook and Route transfers (held until delivery) come with the test keys.
- **Catalog seed** (`docs/reference/marketplace_catalog_seed.csv`, 50 of 51 rows): row 27 (GRIPTOL-N SYRUP, vet medicine) is excluded. Brands use `brand_suggested`, as in the approved design; the menu-card brand and the CSV flags are kept on each product (`brand_as_listed`, `source_flags`) so the 12 "Doggzi Premium" items and the row 2/11 duplicate can be reviewed. Stock is a placeholder (20 each); MRPs are empty until the printed MRPs are added.
- Vendor notifications (WhatsApp + Vendor panel) arrive with the Vendor console.

## Decisions to confirm (carried over from the design chat)
- **Placeholders:** WhatsApp number, email, phone (env `VITE_*`), FSSAI number (hidden until set), Choose card prices and "40+ stores", testimonials (all marked *Placeholder*), every FAQ answer (marked *Draft*).
- **Fresh Food:** `catsSupported` is `false`; cat ingredients are a draft; the 7-day ratios are draft config; store badges are self-hosted copies — replace them with files from Apple/Google.
- **Services:** package contents, GST treatment, which services cats get, serviceable pincodes and pay-after-service are drafts. Walking/vet consult appear as "Coming soon" on `/services` but are still listed on Choose's Services card back.
- **Booking availability** is mock in phase 1 (`MOCK_AVAILABILITY=true` pre-fills about 1 in 5 slots as full).
- The booking service trusts the `pet_id` it is sent; pet ownership is checked in pet-profile, not cross-service, yet.
- TAN Songbird isn't licensed in the kit, so display type falls back to Atma 700.
