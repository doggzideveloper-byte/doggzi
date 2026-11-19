# Start here

## 1. Set up the folder (one time)
1. Create an empty folder, for example `D:\doggzi`, and unzip this kit into it.
2. Move `apps-web-src/design-system/` to `apps/web/src/design-system/`, and move `public/brand/` to `apps/web/public/brand/`.
   (Or just paste prompt A and Claude Code will do the moving.)
3. Optional: drop the licensed `TAN-Songbird.woff2` into `apps/web/public/brand/fonts/`.
4. Open Claude Code in that folder.

## 2. Prompt A: scaffold and Page 1 (paste into Claude Code)
```
Read CLAUDE.md, docs/DESIGN_SYSTEM.md, docs/ASSETS.md and docs/pages/PAGE_01_PET_PASSPORT.md fully before doing anything.

Then:
1. Scaffold the monorepo exactly as CLAUDE.md describes. Put apps-web-src/design-system into apps/web/src/design-system and public/brand into apps/web/public/brand (move these files only; don't delete anything else).
2. apps/web: Vite + React + TypeScript + react-router + motion (Framer Motion) + @tanstack/react-query. Load Atma and Poppins. Import tokens.css globally.
3. Build the design-system primitives Page 1 needs: Button, Card, Input, ToggleChip, Combobox, Badge, PassportCard, PetAvatar, Logo, PageShell. Every one of them must use tokens.css and motion.ts only.
4. Convert pets-trio.svg into a React component with named groups (puppy, lab, cat) and add the line-draw, hop and tail-swish animations.
5. Build services/pet-profile (FastAPI, SQLAlchemy 2, Alembic, pydantic-settings) with the breeds and pets tables, the seed migration and the endpoints in the page spec. Add pytest tests.
6. docker-compose.yml: web, pet-profile, postgres, redis and an nginx gateway routing /api/pet-profile/ → pet-profile. Add a .env.example with blank values and no real secrets.
7. Build Page 1 to the spec, including every animation and the reduced-motion fallback. Stub /choose with a placeholder that shows the passport chip.

Work in small steps and show me the plan first. Don't commit or stage anything. When you're done, list what you built, how to run it, and anything you weren't sure about.
```

## 3. Each later page (same pattern)
I'll write a `docs/pages/PAGE_XX_*.md` spec for each page (Choose, Fresh Food, Services, Marketplace), covering both UI and backend. For each one, paste:
```
Read CLAUDE.md, docs/DESIGN_SYSTEM.md and docs/pages/PAGE_XX_*.md. Build the page and the backend it needs. Reuse existing design-system components, and add a new primitive only if one is truly missing. Plan first, and don't commit.
```
