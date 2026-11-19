# Admin panel (`/admin`): roles ADMIN (everything) and OPS (operations only)
Read PANELS_00_SHARED.md first.

## Navigation (left rail on desktop, bottom sheet menu on mobile)
| Module | ADMIN | OPS | What it does |
|---|---|---|---|
| **Today** | ✓ | ✓ | Live dashboard: bookings today by status, marketplace orders by status, **overdue items** (red), GMV today and this week, the Fresh Food funnel (passports → Fresh Food views → plan saved → store clicks → guide downloads), and new partner applications |
| **Bookings** | ✓ | ✓ | A kanban board for services: Requested → Offered → Accepted → En route → In progress → Completed / Cancelled. Each card shows the pet avatar, services, slot, area, provider and payment status. Drag or use a button to **reassign a provider manually**. An offer timer shows when the automatic offer to the next provider happens. |
| **Orders** | ✓ | ✓ | Marketplace orders with their sub-orders per vendor and an SLA countdown (accept within N minutes, deliver by the promised time). Actions: nudge vendor (WhatsApp), cancel a sub-order, trigger a refund (ADMIN only). |
| **Catalog** | ✓ | | Services (prices, packages and what they include, cat or dog availability, active toggle) and Marketplace products: approve vendor listings and photos, fix brand names, block items (for example medicines). Any price change shows a preview of the old vs new price before saving. |
| **Vendors** | ✓ | view | Onboarding pipeline: Applied → Docs (GST, shop licence, bank) → Razorpay linked account created → Live. Per-vendor commission, serviceable pincodes, hours, performance (accept rate, average time to pack, cancellations). Pause a vendor. |
| **Providers** | ✓ | view | Onboarding: Applied → ID check → Skills (service scene keys) → Areas (pincodes) → Training done → Live. Availability calendar, rating, completed jobs, earnings owed. Pause a provider. |
| **Customers** | ✓ | ✓ (masked) | Search by phone or name, see their pets (passports), bookings and orders, and add support notes. OPS sees masked phone numbers. Data exports are ADMIN only and logged. |
| **Payments** | ✓ | | Razorpay payments, refunds, Route transfers per vendor (on hold / released), the nightly reconciliation report (payments vs bookings and orders, mismatches in red), and a provider payouts list. |
| **Content** | ✓ | | FAQs (draft/live per page), testimonials (**must have a "customer consent recorded" checkbox before they can go live**), YouTube Shorts list, site-config (WhatsApp, phone, email, FSSAI no., delivery areas, switching ratios, catsSupported flag). |
| **Team** | ✓ | | Invite people by phone, assign ADMIN / OPS / VENDOR / PROVIDER, and remove access. |
| **Audit log** | ✓ | | Every admin write, filterable by person, module and date. |

## Key interactions
- **Today** updates live every 30s (polling now, websockets later). New overdue items slide in with a red pulse.
- **Bookings board:** when a card moves to a new column, the card animates and a toast appears with "Undo" for 5s (all actions except refunds).
- **Dangerous actions** (refund, cancel, pause a vendor or provider, price change): a confirmation sheet where the person types the order number or the word CONFIRM.

## Backend (`services/admin` plus calls into booking, market, payments and pet-profile)
- Admin routes need ADMIN, and OPS where marked. `GET /admin/v1/today`, `/bookings`, `PATCH /bookings/{id}/assign`, `/orders`, `/catalog/*`, `/vendors/*`, `/providers/*`, `/customers/*`, `/payments/*`, `/content/*`, `/team/*`, `/audit`.
- All writes are audited. Exports are rate-limited and logged.
