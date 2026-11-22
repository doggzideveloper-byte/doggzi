# @doggzi/ui

The design system shared by `apps/web` (customer site) and `apps/console` (Admin / Vendor / Provider).
Tokens (`tokens.css`), `motion.ts` and primitives live here, so both apps render the same Button, Badge,
Toast, PetAvatar, etc. Consumed as TypeScript source through npm workspaces (no build step).

Rule: the website's visuals must not change when something moves here. `tools/visual/` captures every
page and diffs pixel-for-pixel against the baseline.
