# Doggzi Design System v0.1

The brand is warm, playful and premium: a cream canvas with bold colour blocks, chunky retro type, hand-drawn line pets and soft, bouncy motion.
Every page must look like it came from the same studio.

## 1. Colour
These are taken from the official logo files.

| Token | Hex | Use |
|---|---|---|
| `--dz-orange` | `#F65322` | Primary brand colour: CTAs, key headings, Fresh Food |
| `--dz-pink` | `#F989EF` | Logo letters, highlights, selected states, Marketplace |
| `--dz-green` | `#09A460` | Success, "fresh", trust, Services |
| `--dz-cream` | `#F2E7CB` | The default page background and the logo badge |
| `--dz-ink` | `#141210` | Text, outlines, the hard shadow under the logo |
| `--dz-paper` | `#FFFBF2` | Cards on top of cream |

Each section owns one colour so people always know where they are: **Fresh Food is orange, Services is green, Marketplace is pink.**
Text on orange or green is cream or paper, never pink. Text on pink is ink.

## 2. Type
| Role | Font | Notes |
|---|---|---|
| Display (H1/H2) | **TAN Songbird** | The brand display face, used in the brand files. It's a commercial font, so put the licensed `.woff2` in `public/brand/fonts/`. Until then, fall back to **Atma 700**. |
| Accent / labels | **Atma** 500/700 (Google) | Used in the logo's tagline. Use it for badges, small caps labels and the tagline. |
| Body / UI | **Poppins** 400/500/600 (Google) | Paragraphs, inputs, buttons. |

Scale (fluid, using clamp): display `clamp(2.5rem, 6vw, 4.5rem)`, h2 `clamp(1.75rem, 4vw, 2.75rem)`, h3 `1.375rem`, body `1rem / 1.6`, small `0.875rem`.
Display text is UPPERCASE with a slight letter spacing (`0.02em`).

## 3. Shape, depth and texture
- **The "sticker" look** is the brand's signature. Elements get a 2–3px ink outline and a **hard offset shadow** (`4px 4px 0 var(--dz-ink)`), like the shadow under the logo letters. No blurry grey shadows.
- Radius: `--r-sm 10px`, `--r-md 18px`, `--r-lg 28px`, `--r-pill 999px`.
- The scalloped "cloud" badge shape from the wordmark is reused as a decorative frame (an SVG mask) for hero elements and the passport photo.
- Illustration style: black line art (2.4px stroke, round caps) filled with cream `#F2E7CB`, as in `pets-trio.svg`. All new illustrations, including the breed avatars, must follow this style.
- Background: plain cream, with an optional faint paw-print pattern at 4% opacity.

## 4. Motion (signature, not decoration)
Use **Framer Motion (`motion`)**. Keep all values in `src/design-system/motion.ts`.

| Token | Value | Use |
|---|---|---|
| `spring.bouncy` | `{ type:'spring', stiffness: 420, damping: 22 }` | Buttons, chips, stickers popping in |
| `spring.soft` | `{ type:'spring', stiffness: 160, damping: 24 }` | Cards, layout shifts |
| `ease.out` | `[0.22, 1, 0.36, 1]` | Fades and slides |
| `dur.fast / base / slow` | `0.18 / 0.35 / 0.7` s | |
| `stagger` | `0.06` s | Lists and grids |

Signature moves, reused on every page:
1. **Line-draw reveal.** Line art draws itself with `pathLength` from 0 to 1, then the cream fill fades in.
2. **Sticker press.** On hover the button lifts 2px and its shadow grows to 6px. On press it moves down 4px and the shadow drops to 0, so it feels physical.
3. **Stamp.** A confirmation lands with scale 1.4 → 1 plus a small rotate, then a tiny ink-splat burst.
4. **Flip.** A 3D `rotateY` with `perspective: 1200px`, used for the Choose cards and for page handoffs.
5. **Shared-element passport.** The passport card uses `layoutId="pet-passport"` so it travels between pages, shrinking into the header chip after Page 1.
6. **Page transitions.** `AnimatePresence` with the old page fading out and lifting 12px, and the new page sliding up with a soft spring.

Rules: animate only `transform` and `opacity`, never run more than one "hero" animation at a time, and when `prefers-reduced-motion` is on, turn every animation into a 150ms fade.

## 5. Core components (build once in `design-system/components/`)
`Button` (primary/secondary/ghost, sticker style), `Card` (paper, ink outline, hard shadow), `Chip`/`ToggleChip` (dog/cat picker), `Input` and `Combobox` (breed search), `Badge` (Atma uppercase), `FlipCard`, `PassportCard`, `PetAvatar` (photo → breed default → generic dog/cat), `Logo` (wordmark or mark, by size), `PageShell` (header with logo and passport chip, footer), `Toast`, `Skeleton`.

## 6. Voice
Short and warm, and always use the pet's name once we know it: "Let's make Bruno's passport", "Fresh meals for Bruno".
Use the tagline sparingly, at most once per page. All prices are in ₹ with Indian grouping.
