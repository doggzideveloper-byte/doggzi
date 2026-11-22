# Claude Code prompts: one per phase (paste one, review it, then move to the next)

## Before Phase 0
Export or download every approved page from Claude Design (Pet Passport, Choose, Explore, Fresh Food, Services, SiteFooter, Testimonials, FAQ, plus the `content/`, `brand/` and `backup/` folders) into `design-export/` in the repo folder. Don't edit anything.

## Phase 0: Freeze & foundation
```
Read CLAUDE.md and docs/BACKEND_PLAN.md fully. Plan first and show me the plan before writing code.
Phase 0 only:
1. Copy design-export/ into apps/web/ exactly as-is (byte-identical; verify with checksums and print them).
2. Serve apps/web as static files from the nginx gateway in docker-compose (gateway, postgres, redis, mongo).
3. Add Playwright visual tests for every page at 390/768/1440, mock mode, reduced motion on; capture baselines from the untouched files.
4. Create packages/dz-common per BACKEND_PLAN §2 with tests.
5. Add the CI pipeline (azure-pipelines.yml) per §6 — lint, tests, visual diff, docker build, Trivy.
Do not modify any file inside apps/web. Do not commit or stage. Report what you built and how to run it.
```

## Phase 1: Identity
```
Read CLAUDE.md and docs/BACKEND_PLAN.md. Phase 1 only: build services/auth, services/notification (console provider for dev) and services/pet-profile per the plan and docs/pages/PAGE_01, PAGE_03 (nutrition fields) and PAGE_04 (claim). Alembic migrations, seeds, pytest.
Then create apps/web/data/dz-api.js that, when DZ_DATA_MODE="api", replaces only the passport save/load and OTP mock calls with real API calls — find where each page reads mock data and route it through dz-api.js without changing markup, CSS or behaviour. Add one <script> include per page if needed.
Visual-diff suite must pass in both modes. Plan first; no commits.
```

## Phase 2: Fresh Food conversion
```
Phase 2 only, per BACKEND_PLAN: events endpoint in services/admin (Mongo, anonymous, rate-limited, schema-validated), the /app smart redirect with UTM preservation, and funnel queries (daily, by device and source). In dz-api.js, fire events for: passport_created, choose_card_flipped, fresh_food_view, plan_preview_saved, app_store_click{platform}, qr_shown, whatsapp_link_sent, guide_download, notify_me. Frontend untouched otherwise; visual diff must pass. Plan first; no commits.
```

## Phase 3: Services commerce + Razorpay
```
Phase 3 only, per BACKEND_PLAN §3–4 and PAGE_04: services/booking (catalog seeded from docs/reference/Doggzi_Services_Catalog.pdf, slots, bookings, server-side totals), services/payments (Razorpay test mode: orders, verify, idempotent webhook, refunds), provider dispatch with offer expiry and OPS fallback, event bus on Redis streams. In dz-api.js, wire catalog, slots, booking and Razorpay Checkout into the existing booking drawer without visual change. Include a test-mode end-to-end test. Plan first; no commits.
```

## Phase 4: Admin API
```
Phase 4 only: services/admin RBAC (ADMIN, OPS, PROVIDER, VENDOR), CRUD for catalog/slots/content/site-config, bookings board, provider management, provider-panel APIs (scoped to own records), conversion dashboard endpoints, audit log of every admin write. No UI. Plan first; no commits.
```

## Phase 5: Azure
```
Phase 5 only: infra/ in Bicep for ACR, Container Apps environment (one app per service + gateway), migrations as a Container Apps job, Postgres Flexible Server, Azure Cache for Redis, Mongo, Key Vault with managed identity (no secrets in files), staging and prod parameter files, and the Azure DevOps release stages with manual approval for prod. Show me the resource list and estimated monthly cost before applying anything. Do not run any deploy or az command that creates resources without my explicit go-ahead.
```
