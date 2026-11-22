"""Pixel-diff two screenshot folders. Usage: python3 diff.py <baselineDir> <currentDir> [outDir]
Exit code 1 if any file differs (count of changed pixels > 0) or is missing."""
import sys
from pathlib import Path
from PIL import Image, ImageChops

base, cur = Path(sys.argv[1]), Path(sys.argv[2])
out = Path(sys.argv[3]) if len(sys.argv) > 3 else None
bad = 0
for f in sorted(base.glob("*.png")):
    g = cur / f.name
    if not g.exists():
        print(f"MISSING  {f.name}"); bad += 1; continue
    a, b = Image.open(f).convert("RGB"), Image.open(g).convert("RGB")
    if a.size != b.size:
        print(f"SIZE     {f.name}: {a.size} -> {b.size}"); bad += 1; continue
    d = ImageChops.difference(a, b)
    n = sum(d.convert("L").histogram()[1:])
    if n:
        bad += 1
        print(f"DIFF     {f.name}: {n} px")
        if out:
            out.mkdir(parents=True, exist_ok=True)
            d.point(lambda v: 255 if v else 0).save(out / f.name)
    else:
        print(f"same     {f.name}")
print("FAIL" if bad else "OK: 0 changed pixels"); sys.exit(1 if bad else 0)
