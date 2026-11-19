# Brand assets: what goes where

Copy the kit's `public/brand/` folder to `apps/web/public/brand/`. Reference files as `/brand/...`.

## Logos (`/brand/logo/`)
| File | What it is | Use it for |
|---|---|---|
| `doggzi-wordmark.svg` | "DOGGZI" in pink on the scalloped cream badge, with the tagline. Transparent background. | Page 1 hero, footer, splash or loader. Minimum width 160px. |
| `doggzi-wordmark.png` | The same, as a 1497×487 transparent PNG | Emails and Open Graph images, or wherever SVG isn't allowed |
| `doggzi-mark.svg` | A round cream badge with a pink "D" and the tagline in a circle. Transparent background. | Header logo on every page, favicon source, app icon, loading spinner (rotate only the tagline ring) |
| `doggzi-mark.png` | The same, as a 974×974 transparent PNG | Favicon and PWA icons (generate 32, 192 and 512px) |
| `doggzi-wordmark-on-orange.svg` | The original square tile on orange | Social posts only. Not for the site UI. |
| `doggzi-mark-on-green.svg` | The original square tile on green | Social avatar only |

**On a cream background**, the mark's cream badge disappears. Always put the mark on a **sticker disc**: a paper (`#FFFBF2`) circle with a 2.5px ink outline and a `4px 4px 0` ink shadow. Header size: 56px on mobile, 64px on desktop.

Logo rules: place it on cream, orange or green only. Keep clear space equal to the height of the "D". Never recolour, outline, stretch or rotate the logo itself.

## Illustrations (`/brand/illustrations/`)
| File | Use |
|---|---|
| `pets-trio.svg` | Line art of a golden puppy, a Labrador and a cat. **The hero illustration on Page 1.** Inline it as a React component (not `<img>`) so each path can run the line-draw animation and the dog or cat can react to the type picker. The viewBox is already cropped to the art (`0 410 864 492`). The parts are: **puppy (left)**, `#path17`–`#path19` with its eyes `#path42`/`#path42-4`, mouth `#path38`–`#path41` and tail group `#g45`; **Labrador (centre)**, group `#g16`; **cat (right)**, `#path46` with features `#path47`–`#path69` and tail `#path70`. When you convert the file, wrap these in `<g id="puppy">`, `<g id="lab">` and `<g id="cat">`, and keep the paint order (puppy last so it sits in front). |

Breed avatars (to come): `/brand/breeds/<type>/<breed-slug>.svg`, drawn in the same line-art style. The fallbacks are `/brand/breeds/dog/_generic.svg` and `/brand/breeds/cat/_generic.svg`. Until real avatars exist, crop the generic dog and cat from `pets-trio.svg`.

## Fonts (`/brand/fonts/`)
Put the licensed **TAN Songbird** `.woff2` here (it's commercial and not included). Load Atma and Poppins from Google Fonts, or self-host them.

## Reference (`docs/reference/`)
`fresh-food-vs-kibble.pdf` is the source copy for the Fresh Food page: the comparison table, the five subscription benefits and the ingredients. Use its text, and rebuild the layout using the design system.
