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
| `/marketplace` | Holding page until Page 05 is specced | — |

Services: `services/pet-profile`, `services/auth`, `services/booking`, `services/notification` (internal).
OpenAPI docs: `/api/<service>/docs` through the gateway.

Shared design-system components (`apps/web/src/design-system/components`): Button, Badge, Header (logo
sticker disc), PassportChip, PetAvatar + PetSprite, PetsTrio, FlipCard, SiteFooter, Testimonials, FAQ,
AppDownload, HighlightName/Sweep, Toast, and the scroll-reveal hooks.

## Decisions to confirm (carried over from the design chat)
- **Placeholders:** WhatsApp number, email, phone (env `VITE_*`), FSSAI number (hidden until set), Choose card prices and "40+ stores", testimonials (all marked *Placeholder*), every FAQ answer (marked *Draft*).
- **Fresh Food:** `catsSupported` is `false`; cat ingredients are a draft; the 7-day ratios are draft config; store badges are self-hosted copies — replace them with files from Apple/Google.
- **Services:** package contents, GST treatment, which services cats get, serviceable pincodes and pay-after-service are drafts. Walking/vet consult appear as "Coming soon" on `/services` but are still listed on Choose's Services card back.
- **Booking availability** is mock in phase 1 (`MOCK_AVAILABILITY=true` pre-fills about 1 in 5 slots as full).
- The booking service trusts the `pet_id` it is sent; pet ownership is checked in pet-profile, not cross-service, yet.
- TAN Songbird isn't licensed in the kit, so display type falls back to Atma 700.
