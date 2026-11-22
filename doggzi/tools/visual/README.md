# Visual diff (apps/web)

Deterministic full-page screenshots (reduced motion, fixed demo passport, fixed `Math.random`)
of every apps/web page at 375, 390, 768 and 1440 px, compared pixel-by-pixel.

```bash
# 1. run apps/web (npm run dev:web) or the docker stack
# 2. capture
NODE_PATH=$(npm root -g) node tools/visual/shoot.cjs http://localhost:5173 tools/visual/out
# 3. compare against the committed baseline (exit 1 on any changed pixel)
python3 tools/visual/diff.py tools/visual/baseline tools/visual/out
```

`baseline/` = approved look. Desktop scale (root 87.5% at >=1024px) approved and baselined on
22 Nov 2026. Update it only for an intentional, approved visual change: copy `out/*.png` over `baseline/`.
