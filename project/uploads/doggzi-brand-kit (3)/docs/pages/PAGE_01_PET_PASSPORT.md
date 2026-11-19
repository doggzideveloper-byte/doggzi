# Page 01: Pet Passport (`/`)

## Goal
In about 10 seconds, the visitor gives us the pet's **name, type (dog or cat) and breed**, and gets a Doggzi Pet Passport. No login and no phone number yet, because we ask for those later, at the first booking or order.

## Layout (mobile first)
```
┌───────────────────────────────┐
│ [mark]                        │  slim header (logo mark only)
│                               │
│   doggzi-wordmark.svg         │  hero wordmark
│   pets-trio.svg (line-draws)  │  hero illustration
│                               │
│  ┌── Passport card ────────┐  │  builds live as they type
│  │ [avatar]  BRUNO         │  │
│  │ Dog · Labrador          │  │
│  │ DOGGZI PET PASSPORT     │  │
│  └─────────────────────────┘  │
│  Step 1  What's their name?   │  [ input ]
│  Step 2  Dog or cat?          │  [🐶 Dog] [🐱 Cat]  ToggleChips
│  Step 3  Breed                │  [ searchable combobox ]
│        [ Create passport → ]  │  sticker Button (orange)
└───────────────────────────────┘
```
On desktop (1024px and up), use two columns: the illustration and wordmark on the left, the form and live passport on the right.

## Interaction and animation
1. **On load:** the wordmark pops in (`spring.bouncy`), then `pets-trio` line-draws path by path and the cream fill fades in. The total stays under 1.6s, and the form is usable straight away.
2. **Name input:** the passport card fills in letter by letter, and the name renders in uppercase display type. The page heading becomes "Let's make **Bruno's** passport".
3. **Type picker:** choosing Dog makes the puppy and the Labrador do a small happy hop and dims the cat to 40%. Choosing Cat does the reverse, and the cat's tail (`#path70`) swishes. The group ids are in ASSETS.md. The passport avatar switches to the generic dog or cat.
4. **Breed:** a combobox filtered by type, with search and "Indie / Desi" and "Mixed / Not sure" pinned at the top. Picking a breed swaps the passport avatar for that breed's default with a soft cross-fade.
5. **Submit:** the button does the sticker press. A green **"APPROVED"** stamp lands on the passport (the `stamp` variant). The passport then shrinks with `layoutId="pet-passport"` into the header chip, and the app routes to `/choose`.
6. **Validation:** the name must be 1–24 characters, letters, spaces and `.'-` only. Type is required. Breed defaults to "Mixed / Not sure" if it's skipped. Show errors inline in a friendly tone, for example "Every good boy needs a name 🐾".
7. **Reduced motion:** no line-draw, hops, flip or stamp. Use simple fades only.

## Backend: `services/pet-profile` (FastAPI, Postgres)
Tables (all have UUID `id`, `created_at` and `updated_at`, with times stored in UTC and shown in IST):
- `breeds`: `id, type ('dog'|'cat'), name, slug, avatar_path, popularity_rank, is_active`
- `pets`: `id, guest_id (uuid, nullable), owner_user_id (uuid, nullable), name, type, breed_id (fk), photo_url (nullable)`

Endpoints (reached through the gateway at `/api/pet-profile/v1`):
| Method | Path | Notes |
|---|---|---|
| GET | `/breeds?type=dog&q=lab` | Sorted by `popularity_rank`, with pinned rows first. Returns `{id,name,slug,avatar_url}`. Cache in Redis for 24h. |
| POST | `/pets/guest` | Body `{name,type,breed_id?}`. Creates the pet and a `guest_id`, and returns `{pet, guest_token}` with a signed, short-lived JWT whose secret comes from an env var. |
| GET | `/pets/me` | Uses the guest token or user token. Returns the pet(s) for the passport chip. |
| POST | `/pets/claim` | **Built later, with the Auth service.** After OTP login, moves guest pets to `owner_user_id = user.id`. |

Seed data: about 30 dog breeds that are common in Delhi NCR (Labrador, Golden Retriever, German Shepherd, Beagle, Shih Tzu, Pug, Indie, Husky, Rottweiler, Pomeranian, Doberman, Cocker Spaniel, Lhasa Apso, Boxer, Great Dane, Dachshund, French Bulldog, Maltese, Saint Bernard, Siberian Husky, …) and about 12 cat breeds (Indian / Indie, Persian, Siamese, Maine Coon, British Shorthair, Bengal, Ragdoll, Himalayan, …), plus "Mixed / Not sure" for each type. Seed through an Alembic data migration.

Frontend storage: save the `guest_token` and passport in `localStorage` under the key `dz.passport`, so returning visitors skip straight to `/choose` with "Welcome back, Bruno".

## Done when
- Everything in CLAUDE.md's definition of done is met.
- Lighthouse on mobile scores 90 or above for performance and accessibility.
- pytest covers the breeds filter, guest creation, validation errors and the token round-trip.
