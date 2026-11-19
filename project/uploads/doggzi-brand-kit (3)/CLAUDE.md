# Doggzi Platform: instructions for Claude Code

Read this file, then `docs/DESIGN_SYSTEM.md` and `docs/ASSETS.md`, before writing any code.
We build **page by page**. For each page we build its frontend and the backend it needs together.

## Product in one breath
Doggzi is a premium pet-care brand in Delhi NCR, for **dogs and cats only**. The site flow:
1. **Pet Passport** (`/`): ask only pet name, type (dog/cat) and breed, then create a passport.
2. **Choose** (`/choose`): three flip cards, personalised with the pet's name: Fresh Food, Services, Marketplace.
3. **Fresh Food** (`/fresh-food`): a fixed page that promotes the app and the subscription, and explains why fresh food beats kibble.
4. **Services** (`/services`): an Urban Company-style booking flow, personalised to the pet's type.
5. **Marketplace** (`/marketplace`): products from local vendors, filtered to the pet.

Tagline: **"Not just food. Their food."**

## Repo layout (monorepo)
```
doggzi/
├─ CLAUDE.md
├─ docs/                      DESIGN_SYSTEM.md, ASSETS.md, pages/PAGE_XX.md, reference/
├─ apps/web/                  React + Vite + TypeScript SPA
│  ├─ public/brand/           logos, illustrations, fonts (see docs/ASSETS.md)
│  └─ src/
│     ├─ design-system/       tokens.css, motion.ts, components/ (the ONLY place UI primitives live)
│     ├─ features/<page>/     one folder per page
│     ├─ lib/api/             typed API clients, one file per service
│     └─ app/                 router, providers, layout
├─ services/
│  ├─ pet-profile/            FastAPI: Pet Passport + breeds (built with Page 1)
│  ├─ auth/  booking/  cck/  notification/  admin/   (added as their pages arrive)
├─ infra/                     Azure Container Apps / Bicep (later)
└─ docker-compose.yml         local: web, services, postgres, redis, mongo, nginx gateway
```
Each FastAPI service is structured as `app/main.py`, `app/api/v1/`, `app/models/`, `app/schemas/`, `app/core/config.py` (pydantic-settings, env vars only), `alembic/`, `tests/` and `Dockerfile`.
The frontend never calls a service directly. It goes through the gateway at `/api/<service>/v1/...`.

## Standing rules (non-negotiable)
- No secrets in code, CLAUDE.md or any committed file. Use env vars only, and commit a `.env.example` with blank values.
- Ask before any destructive DB change (dropping columns, deleting data).
- AuthUser always uses `user.id` (UUID), never `user.sub`.
- Every table has `created_at` and `updated_at`, both set by the app or a trigger.
- New admin endpoints require the ADMIN role.
- Show all dates and times in IST. Show money in INR with Indian grouping (₹1,23,456), using `Intl.NumberFormat('en-IN', {style:'currency',currency:'INR'})`.
- Never run `git reset --hard` or `git clean`, never delete untracked files, never stash or overwrite existing work, and never stage or commit without Abhiyash's explicit approval.

## UI rules
- Every colour, font, radius, shadow and duration comes from `design-system/tokens.css` and `motion.ts`. Hard-coded hex values or ms timings in feature code are bugs.
- Build each new primitive once in `design-system/components/` and reuse it. Don't restyle the same component per page.
- Use the brand assets from `public/brand/` exactly as `docs/ASSETS.md` says. Never recolour, stretch or redraw the logo.
- Mobile first: design at 375px, then scale up to 1440px.
- Every animation respects `prefers-reduced-motion` and falls back to a simple fade.
- Accessibility: visible focus rings, labels on every input, AA contrast, and full keyboard use.

## Definition of done for a page
1. The UI matches DESIGN_SYSTEM.md and works at 375, 768 and 1440px.
2. Its backend endpoints exist, are typed and tested (pytest), and are documented in the service's OpenAPI.
3. The frontend calls them through `lib/api/`, with loading, error and empty states.
4. `docker compose up` runs the page end to end locally.
5. A short summary of what changed is ready for review. Do not commit anything.
