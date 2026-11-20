# Vendor panel (`/vendor`): role VENDOR (local pet store owners and staff)
Read PANELS_00_SHARED.md first. Built for a **tablet or desktop at the shop counter**, and it also works on a phone.

## Screens
1. **Orders (home):** three columns: **New**, **Packing**, **Ready / Out**.
   - A new sub-order arrives with a sound, a wiggle and a WhatsApp alert. The card shows the items with quantities, the customer's area (masked), the pet's name and type ("for Bruno 🐶" style, using line-art), and an **accept countdown** (from config, for example 10 minutes).
   - **Accept** or **Reject** (with a reason: out of stock, shop closed, too far). A rejected sub-order goes to OPS to reassign or refund.
   - Packing shows a checklist of items to tick off, then "Mark packed".
   - Ready / Out: "Out for delivery" (the store delivers itself, or a Doggzi rider later), then "Delivered" (with an optional delivery code from the customer).
2. **Products:** the vendor's listings: name, brand, category, **price and MRP**, stock quantity (+/− stepper), and an active toggle.
   - Add a product: search the Doggzi catalog first so products aren't duplicated. If it isn't there, request a new product, which Doggzi approves.
   - **Upload own photos:** phone camera upload with crop to square. It goes to Doggzi for approval, then appears on the site.
   - Bulk: a CSV import and export template, matching the columns of `marketplace_catalog_seed.csv`.
   - Low-stock alert below a threshold the vendor sets.
3. **Payouts:** per sub-order: order value, Doggzi commission, delivery fee and net payout. Status: on hold (until delivered), released, settled (from Razorpay Route webhooks). Monthly statement as a CSV download.
4. **Store profile:** shop name, photos, a one-line story and "since" year (shown in "Meet the stores"), hours, **holiday mode** toggle (hides their listings), delivery pincodes or radius, delivery fee, staff logins (owner can invite staff by phone).
5. **Help:** a WhatsApp link to Doggzi OPS, plus FAQ.

## Backend (`services/market` vendor routes, scoped to the vendor of the logged-in user)
`GET /vendor/v1/sub-orders?status`, `POST /sub-orders/{id}/accept|reject|packed|out|delivered`, `GET/POST/PATCH /listings`, `POST /listings/{id}/photos` (Azure Blob, pending approval), `POST /listings/import`, `GET /payouts`, `GET/PATCH /store`, `POST /store/staff`.
Rule: every query is filtered by `vendor_id` taken from the user's membership on the server, never from the request.
