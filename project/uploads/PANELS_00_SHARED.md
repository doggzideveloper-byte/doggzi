# Doggzi Console: shared rules for the Admin, Vendor and Provider panels

## One app, three panels
- `apps/console`: a single React + Vite + TS app, served at `console.doggzi.com` (locally at `/console` through the gateway).
- Routes: `/admin/*` (roles ADMIN, OPS), `/vendor/*` (role VENDOR), `/provider/*` (role PROVIDER). After OTP login, the user lands on the panel for their role. A user with several roles sees a panel switcher.
- It reuses `design-system/` (tokens, Button, Card, Badge, Input, Toast, Skeleton, PetAvatar, Logo) from `apps/web`, moved into `packages/ui` so both apps import the same files. **The visuals of `apps/web` must not change** (the visual-diff check still applies).

## "Work mode" styling (same brand, calmer)
- Cream background, paper cards, ink text. Outlines are **1.5px** and shadows `2px 2px 0` (lighter than the website's sticker style).
- Section colours mark areas: **Services/bookings green, Marketplace/orders pink, Fresh Food orange, Admin-only ink**.
- Status chips (used everywhere): new = orange, accepted = green outline, in progress = green, done = ink, problem or overdue = red `#D93A2B` (add it to tokens as `--dz-alert`).
- Motion: micro only, 150–250ms. Rows slide in, a status change pulses its chip once, a new order or offer gets a single wiggle plus a sound (with a mute toggle). No line-draw or hero animations.
- Dense tables on desktop. Lists of cards on mobile. Every table has search, filters and CSV export (ADMIN only).
- All times are in IST, and money uses ₹ with Indian grouping.

## Security (applies to every panel)
- OTP login (Auth service). JWT with a role claim. The app reads **`user.id`** and never `user.sub`.
- Every API call is scoped on the server: a vendor sees only its own vendor_id, and a provider only its own assignments. Hiding something in the frontend alone is not enough.
- Customer phone numbers are **masked** in the Vendor and Provider panels (`98xxxxxx09`). Calls go through a "Call customer" button that opens a click-to-call or masked-number flow later. For now, show the number only once a job or order is accepted and active.
- Every admin write goes to an `audit_log` (who, what, before, after, when).
- Sessions time out after 12 hours on the console, and there's a "Log out of all devices" option.

## Build order
1. Design each panel in Claude Design as a NEW file (Console-Admin, Console-Vendor, Console-Provider), using these specs.
2. Claude Code builds `apps/console` and the APIs together, panel by panel: Provider (it unblocks Services), then Vendor (unblocks Marketplace), then Admin.
