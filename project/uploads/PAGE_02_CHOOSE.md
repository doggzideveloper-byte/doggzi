# Page 02: Choose (`/choose`)

## Goal
The pet now has a passport. In one tap, the parent picks what they need: **Fresh Food**, **Services** or **Marketplace**. Everything on the page talks about the pet by name.

## Entry rules
- Arriving with no `dz.passport` saved → redirect to `/`.
- Arriving from Page 1 → the passport chip is already in the header (it travelled there with `layoutId="pet-passport"`).
- A returning visitor lands straight here, and the heading says "Welcome back, Bruno".

## Layout
```
[logo disc]                                  [chip: avatar · BRUNO · Labrador ▾]

            WHAT DOES BRUNO NEED TODAY?
            Pick one. You can always come back.

 ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
 │ PREMIUM      │  │ DOGS & CATS  │  │ LOCAL STORES │   ← Badge (Atma)
 │  [line icon] │  │  [line icon] │  │  [line icon] │
 │ FRESH FOOD   │  │ SERVICES     │  │ MARKETPLACE  │   ← display type
 │ Chef-cooked  │  │ Grooming,    │  │ Food, toys,  │
 │ meals for    │  │ walks, vet…  │  │ gear near    │
 │ Bruno        │  │ at home      │  │ you          │
 └──────────────┘  └──────────────┘  └──────────────┘
    orange             green              pink
```
- Desktop: three cards in a row, each about 300×400. Mobile: cards stacked, each 100% wide and about 220px tall, with the same flip.
- Each card's front uses its section colour (see DESIGN_SYSTEM.md §1), with paper text, the ink outline and the sticker shadow.
- Icons are line art in the same style as `pets-trio`: a bowl for Fresh Food, a brush or leash for Services, a shopping bag for Marketplace. Don't use emoji.

## Card backs (shown after the flip)
| Card | Back face content |
|---|---|
| Fresh Food | "Meals portioned for Bruno's size", "Starts at ₹XXX / week" (placeholder), the top three benefits from `reference/fresh-food-vs-kibble.pdf`, and a **Continue →** button |
| Services | The services available **for the pet's type** (dog: grooming, walking, boarding, training, vet consult; cat: grooming, boarding, vet consult), "Booked & tracked end to end", and **Continue →** |
| Marketplace | The top four categories with price ranges (placeholders), for example "Treats ₹99 – ₹799", "From N local stores near you", and **Continue →** |

All prices are placeholders until Abhiyash gives real ones. Format them in INR with Indian grouping.

## Interaction and animation
1. **Entrance:** the cards "deal" in from below. Each one starts tilted (−4°, 0°, 4°), lands with `spring.soft` and is staggered by 0.08s. The heading's pet name gets a small pink highlight sweep.
2. **Hover (desktop):** a gentle 3D tilt following the pointer (at most 6°), plus the sticker lift.
3. **Tap or click:** a 3D flip (`rotateY` 180°, `perspective: 1200px`, 0.6s). The other two cards dim to 50% and shrink slightly. Tapping the flipped card again flips it back, and tapping another card swaps the flip.
4. **Continue:** the card scales up to fill the screen in its section colour, which becomes the background of the next page (a shared-element handoff), then the app routes to `/fresh-food`, `/services` or `/marketplace`.
5. **Keyboard:** each card is a button. Enter or Space flips it, and Tab then moves to Continue. Escape flips it back.
6. **Reduced motion:** no tilt, flip or deal. The back content shows below the front as a simple expand, with fades only.

## Passport chip (header, shared on every page from now on)
- Shows the avatar, the name and the breed. Clicking it opens a small popover with "Edit passport", "Add another pet" (disabled with a "Coming soon" label for now) and "Start over".
- Building it here makes it a design-system component (`PassportChip`) that every later page reuses.

## Backend
- `GET /api/pet-profile/v1/pets/me` (already built on Page 1) → the chip and the heading.
- New: `PATCH /api/pet-profile/v1/pets/{id}` → for "Edit passport". Name, type and breed can change. Validate the same way as Page 1, and update `updated_at`.
- Card teaser content: a typed config file, `apps/web/src/features/choose/teasers.ts`, keyed by pet type. It moves into the Booking, CCK and Marketplace services when those are built, so don't create those services yet.

## Done when
- The definition of done in CLAUDE.md is met.
- Visiting `/choose` without a passport redirects to `/`.
- The chip, the flip and the Continue handoff work on mobile and desktop, and with reduced motion on.
