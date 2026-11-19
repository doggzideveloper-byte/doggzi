# Page 04: Services (`/services`)

## Goal
An Urban Company-style booking flow. The parent picks a package or individual spa services, sees the total, picks a slot and an address, verifies by phone OTP, and the booking is requested.
Section colour: **green**.

## No outside images. Every service gets an animated line-art "scene"
All visuals are hand-drawn inline SVG in the `pets-trio` style (cream fill `#FFFBF2`/`#F2E7CB`, 2.4px ink stroke, round caps), animated with CSS or motion. There are no photos, stock images or icon fonts. Each scene uses **the pet from the passport** (puppy, Labrador or cat crop) as its model, with props and motion layered on top. Bruno is the one getting groomed in every picture.

Build it as one component, `ServiceScene`, with a `scene` prop, plus a small library of reusable props: bathtub, shower head, bubbles, water drops, dryer, air lines, scissors, falling hair, comb, tangle knot, hands, hearts, oil drop, calm waves, toothbrush, sparkle, mirror, pom-pom, bottle with a plus sign, house, moon, "z"s, van (reused from Fresh Food), ball, whistle and check-stamp. Each scene loops for 2–3s, plays only while it's on screen, and is static when reduced motion is on.

## Catalog (source: `docs/reference/Doggzi_Services_Catalog.pdf`, prices as given)
| Group | Item | Price | Scene |
|---|---|---|---|
| Grooming package | Full Package | ₹1,724 | **Sequence:** bath → dry → trim → styling, playing one after another like a mini story |
| Grooming package | Trimming Package | ₹1,149 | trim → face styling sequence |
| Grooming package | Shower Package | ₹1,149 | bath → blow dry sequence |
| Spa | Bath & blow dry | ₹1,034 | tub, rising bubbles, dryer air lines |
| Spa | Boot cut / poodle look | ₹344 | pom-poms pop onto the legs |
| Spa | Body Massage | ₹344 | hands rubbing, hearts popping |
| Spa | Only face styling | ₹574 | mirror shine, little snips around the face |
| Spa | Medicated bath | ₹229 | bottle with a plus sign, green bubbles |
| Spa | Dental cleaning | ₹229 | toothbrush scrubbing, sparkles |
| Spa | Light de-matting | ₹344 | comb glides, a small knot untangles |
| Spa | Normal de-matting | ₹1,034 | comb pulls a bigger knot that unravels into a straight line |
| Spa | De-stressing oil massage | ₹689 | an oil drop, calm wave lines, the pet's eyes close slowly |
| Spa | Full body hair trim | ₹1,149 | scissors snipping, hair bits falling |
| Spa | Breed based styling | ₹1,149 | the pet's breed avatar with style sparkle lines and a "BRUNO-STYLE" sticker |
| Training & boarding | Pet Training (12 sessions/month) | ₹11,500 | a ball bounces and the pet sits, followed by a check-stamp, with a "12" session counter ticking |
| Training & boarding | Boarding (per hour) | **On request** | a house with a moon, "z"s floating up, the pet breathing |
| Training & boarding | Pickup facility | **Subject to availability** | the van drives to a door (reused from Fresh Food) |

Prices are stored in paise as integers and shown with `en-IN` grouping. **GST-inclusive or not: Abhiyash to confirm.** Add a config line under prices once that's decided.

## Page structure
1. **Hero:** "SPA DAY FOR **BRUNO**". The pet stands in a tub on a loop: bubbles rise, then a shake sends drops flying. Copy line: "Doorstep grooming, training & boarding across Delhi NCR."
2. **Packages:** three large sticker cards (Full, Trimming, Shower). Each card's scene plays its sequence, with a "What's included" checklist that ticks off in step with the scene. Badge Full Package as **BEST VALUE** (no savings figure unless confirmed).
3. **Build your own spa:** a grid of the 11 spa items as smaller cards, each with its scene, name, price and **Add +**. On Add, the card does the sticker press and a tiny copy of its scene **flies into the cart pill** (a shared-element arc). The cart pill bounces and its count ticks up.
4. **Training & boarding:** Training is bookable. Boarding and Pickup show **"Ask on WhatsApp"** buttons, using the number from `site-config`, with a prefilled message that includes the pet's name and breed.
5. **How a booking works:** four steps with a line-draw connector: *Pick → Choose a slot → We come home → Bruno's spa-fresh*.
6. Testimonials (tag `services`), FAQ (services questions, drafts), SiteFooter. Reuse the shared components.

## Booking flow (bottom sheet on mobile, side drawer on desktop)
1. **Cart:** the items, a running total that counts up (`en-IN`), and remove with a swipe or ×.
2. **Slot:** date chips for the next 14 days in IST, then time slots, with greyed-out slots unavailable. It starts as mock availability from the booking service.
3. **Address:** saved addresses, or a new one with pincode validation against the serviceable list in config.
4. **Verify phone:** a 6-digit OTP (Auth service), shown only if the person isn't logged in yet. The guest passport is claimed on success (`POST /pets/claim`).
5. **Review & request:** a summary, then **Request booking**. The confirmation shows the stamp animation ("BOOKED") and "We'll confirm on WhatsApp shortly". No online payment in phase 1. Payment is collected after the service (to be confirmed).

## Pet-type rules (decision needed)
- The catalog doesn't say which services are for cats. Add a config map, `servicesByPetType`. Default it to everything for dogs, and for cats Bath & blow dry, Medicated bath, Light de-matting, Body Massage and Dental cleaning **as a draft for Abhiyash to confirm**.
- The Choose page's Services card back currently lists **walking** and **vet consult**, which aren't in this catalog. Either remove them from that card or add them here as "Coming soon". Abhiyash to decide.

## Backend
### `services/booking` (new: FastAPI, Postgres)
Tables (UUID ids, `created_at`/`updated_at`, times stored in UTC and shown in IST):
- `service_items`: `id, group (package|spa|training|boarding|pickup), name, slug, price_paise (nullable when on request), price_mode (fixed|on_request|availability), scene_key, pet_types text[], is_active, sort_order`
- `package_items`: `package_id, item_id` (what each package includes, **Abhiyash to confirm the contents**)
- `slots`: `id, starts_at, ends_at, capacity, booked_count`
- `bookings`: `id, user_id (uuid = user.id), pet_id, slot_id, address_json, status (requested|confirmed|completed|cancelled), total_paise, notes`
- `booking_items`: `booking_id, item_id, price_paise_at_booking`

Endpoints (`/api/booking/v1`):
- `GET /catalog?pet_type=dog`: grouped items. Cache it.
- `GET /slots?date=YYYY-MM-DD`
- `POST /bookings` (auth required): recompute the total on the server, never trust the client total, and lock the slot capacity in a transaction.
- `GET /bookings/me`
- Admin, with the ADMIN role: `POST/PATCH /admin/items`, `POST /admin/slots`, `PATCH /admin/bookings/{id}/status`.

Seed `service_items` from the catalog table above through an Alembic data migration.

### `services/auth` (new: built with this page)
- `POST /otp/request {phone}`: rate-limited (Redis). Sends through the Notification service. The provider key comes from an env var.
- `POST /otp/verify {phone, code}` returns a JWT. `sub` may hold the id, but app code always reads `user.id` (UUID).
- `services/notification`: a minimal `POST /send/otp` with the provider behind an interface, plus a console provider for local development.

### `services/pet-profile`
- `POST /pets/claim`: moves the guest pets to `owner_user_id = user.id` after OTP.

## Done when
- The CLAUDE.md definition of done is met.
- Every catalog item has its own scene, and no `<img>` or external image URL appears on the page.
- The fly-to-cart animation works, and the total is recomputed on the server.
- The whole flow works locally with the console OTP provider.
