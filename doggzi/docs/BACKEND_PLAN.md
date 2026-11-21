# Doggzi Backend Plan v1 (frontend frozen)

## 0. The one rule: the frontend does not change
The pages approved in Claude Design (Pet Passport, Choose, Explore, Fresh Food, Services, the shared footer, Testimonials and FAQ) are **frozen**.
- They are copied into `apps/web/` **exactly as exported**. No restyling, no refactoring and no React port.
- Only one thing may change in frontend code: **where data comes from**. Today the pages read mock data (content/*.js, localStorage, fake slots, mock OTP). A single new file, `apps/web/data/dz-api.js`, swaps those mocks for real API calls behind a flag:
  `window.DZ_DATA_MODE = "mock" | "api"`. In mock mode, the pages behave exactly as they do today.
- Any change outside `apps/web/data/` and the one `<script>` include per page needs Abhiyash's written approval in the PR.
- **Automatic guard:** Playwright takes screenshots of every page at 390, 768 and 1440px, in mock mode, with reduced motion on (so frames are stable). CI fails if any pixel diff goes over 0.1%. The baselines are captured once, from today's approved files.

## 1. Architecture
```
Browser (frozen pages) ──► nginx gateway ──► /api/auth/v1         auth
                                         ├─► /api/pet-profile/v1  pet-profile
                                         ├─► /api/booking/v1      booking   (services checkout + dispatch)
                                         ├─► /api/market/v1       market    (marketplace checkout + vendor dispatch)  [Phase 6]
                                         ├─► /api/payments/v1     payments  (Razorpay: orders, webhooks, refunds, Route)
                                         ├─► /api/notify/v1       notification (OTP, WhatsApp/SMS updates) — internal only
                                         └─► /api/admin/v1        admin     (ops, catalog, content, analytics, panels' APIs)
Postgres: one server, one database per service · Redis: cache, OTP rate limits, queues · MongoDB: analytics events
Service-to-service calls use internal HTTP plus a Redis-stream event bus (booking.created, payment.captured, order.dispatched, …)
```
**Each vertical has its own checkout and fulfilment:**
| Vertical | Checkout | Fulfilment | What we measure |
|---|---|---|---|
| Fresh Food | In the **app** (not the web) | App or kitchen | **Conversion:** passport → Fresh Food view → plan preview saved → store click (iOS/Android/QR/WhatsApp link) → guide download |
| Services | Web: booking + Razorpay | Dispatched to the **Service Provider panel** | Bookings, paid %, provider accept time, completion |
| Marketplace | Web: cart + Razorpay | Split per vendor, dispatched to the **Vendor panel**, money split through **Razorpay Route** | Orders, GMV, vendor acceptance and dispatch time |

## 2. Shared Python package `packages/dz-common` (built first, used by every service)
- `BaseModel` with UUID `id`, `created_at`, `updated_at` (set automatically).
- `AuthUser` dependency: verifies the JWT and exposes **`user.id` (UUID)**. `user.sub` is never read.
- `require_role("ADMIN" | "OPS" | "PROVIDER" | "VENDOR")`. Every `/admin/*` route needs ADMIN, or OPS where noted.
- `money.py`: amounts are integer paise everywhere, with `format_inr()` giving ₹1,23,456. `timez.py`: store in UTC, render IST.
- Settings come from env vars only (pydantic-settings). Each service commits a `.env.example` with blank values.
- Structured JSON logs with a request id, a `/healthz` endpoint, and OpenAPI docs.

## 3. Razorpay (Services + Marketplace)
- **Create the order on the server:** `POST /api/payments/v1/orders {purpose: booking|market_order, ref_id}`. The server recomputes the amount from the database. The client amount is never trusted.
- **Checkout:** the frozen page opens Razorpay Checkout through `dz-api.js` (the only frontend touch). On success, the page posts `razorpay_payment_id`, `order_id` and `signature` to `/payments/verify`, and the server checks the HMAC signature.
- **The webhook is the source of truth:** `POST /payments/webhook` verifies the `X-Razorpay-Signature`, is idempotent on `event.id`, and handles `payment.captured`, `payment.failed`, `refund.processed` and the `transfer.*` events. It then emits `payment.captured` on the bus, and Booking or Market marks the record paid and dispatches it.
- **Refunds:** for cancellations, either a full refund or a policy-based partial refund. Admin only.
- **Marketplace splits:** use Razorpay **Route** with one Linked Account per vendor. Create transfers at order time, or after delivery for vendor protection, using `on_hold` and release later. The commission percentage is config, set per vendor.
- Keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) live only in env or Azure Key Vault. **Use test mode until launch day.**

## 4. Dispatch
- **Services → providers:** `providers` (id, user_id, name, phone, skills [scene keys], areas [pincodes], rating, is_active) and `assignments` (booking_id, provider_id, status: offered → accepted | declined | expired → en_route → started → completed).
  Auto-offer goes to the best provider by pincode, skill and free slot. The offer expires after N minutes (config) and moves to the next provider, with a fallback to the OPS queue. Providers get a WhatsApp alert with a link to the Provider panel.
- **Marketplace → vendors:** one cart becomes one `order` with one `sub_order` per vendor. The vendor accepts, packs, marks it ready, and it's dispatched by the vendor or a courier, then delivered. Stock is reserved at checkout and released on failure or timeout.
- **Panels:** Provider panel and Vendor panel are **new frontends, designed later in Claude Design**. Their APIs are built now under `/api/admin/v1/provider/*` and `/vendor/*`, scoped to the logged-in provider or vendor (role PROVIDER or VENDOR, and they only see their own records).

## 5. Phases (each one is a separate Claude Code run and a separate PR)
| # | Phase | Delivers | Frontend touch |
|---|---|---|---|
| 0 | **Freeze & foundation** | Monorepo, frozen pages copied in, Playwright visual baselines, docker-compose (gateway, Postgres, Redis, Mongo), `dz-common`, CI pipeline | Copy files in as-is |
| 1 | **Identity** | `auth` (OTP request/verify, JWT, refresh), `notification` (provider interface, console provider for dev), `pet-profile` (breeds, guest pets, claim, nutrition fields) | `dz-api.js`: passport save, OTP |
| 2 | **Fresh Food conversion** | `POST /api/admin/v1/events` (anonymous, rate-limited, stored in Mongo), `/app` smart redirect with UTM tags, funnel queries | `dz-api.js`: fire events |
| 3 | **Services commerce** | `booking` (catalog seeded from the PDF, slots, bookings, server-side totals), `payments` (Razorpay orders, verify, webhook, refunds), provider dispatch engine | `dz-api.js`: catalog, slots, booking, Razorpay checkout |
| 4 | **Admin API** | RBAC, catalog/slot CRUD, content CRUD (FAQs, testimonials, videos, site-config), bookings board, provider management, conversion dashboard data, audit log | None. The admin UI is designed later. |
| 5 | **Deploy to Azure** | ACR, Container Apps (one app per service plus the gateway), Postgres Flexible Server, Azure Cache for Redis, Mongo (Cosmos DB for MongoDB vCore or Atlas), Key Vault, Azure DevOps pipelines, staging then production | None |
| 6 | **Marketplace** (after its page is approved in Design) | `market` (vendors, products, inventory, cart, orders, sub-orders), Razorpay Route linked accounts and transfers, vendor dispatch | `dz-api.js` for the new page |
| 7 | **Panels** (after they're designed) | Wire the Provider and Vendor panel frontends to the APIs from Phases 3, 4 and 6 | New pages only |

## 6. Automation: what runs without anyone touching it
- **On every push:** ruff, mypy, pytest (per service, with coverage of 80% or more), **Playwright visual diff of the frozen pages**, Docker build, and a Trivy image scan. A merge is blocked if anything fails.
- **On merge to `main`:** images are pushed to ACR, Alembic migrations run as a Container Apps **job**, the services deploy to **staging**, and smoke tests run (health, the passport flow, a test-mode Razorpay booking).
- **Production** deploys on manual approval in Azure DevOps. Every deploy is revision-based, so rollback is one click.
- **Destructive migrations** (drops or deletes) fail CI unless the PR carries the label `approved-destructive`, which only Abhiyash adds.
- **Nightly:** database backups (built into Azure), a dependency update PR, and a Razorpay reconciliation job (payments vs bookings and orders).

## 7. Decisions still open
- Are Services prices GST-inclusive? What exactly is in each package? Which services are for cats? Walking and vet consult: remove or "coming soon"?
- Services: pay in full at booking, or a token amount plus pay after the service?
- Marketplace commission percentage and when vendors get paid (immediately or after delivery).
- Which WhatsApp/SMS provider will send OTPs and updates.
