"""Marketplace seed from docs/reference/marketplace_catalog_seed.csv (51 rows from the Doggzi menu card).

- Rows flagged `medicine_check_rules` are skipped until approved (vet medicine rules).
- `brand` uses `brand_suggested` (as in the approved design); `brand_as_listed` and the CSV flags are kept
  on the product so Abhiyash can review the 12 mislabelled "Doggzi Premium" items before launch.
- Stock is a placeholder (the menu only says "In-stock"). MRP is empty until printed MRPs are added.
"""
import csv
import re
from pathlib import Path

CSV = Path(__file__).with_name("seed_catalog.csv")
SKIP_FLAGS = {"medicine_check_rules"}
PLACEHOLDER_STOCK = 20
GURGAON_PINS = [str(122001 + i) for i in range(18)]

DOGGZI_STORE = {
    "name": "Doggzi Store", "slug": "doggzi-store", "area": "Gurgaon", "story": "Doggzi's own shop, until local stores join.",
    "serviceable_pincodes": GURGAON_PINS, "delivery_fee_paise": 4900, "kyc_status": "verified", "commission_bps": 0,
    "is_doggzi": True, "is_active": True,
}
CATEGORY = {"treats": "treats", "toys": "toys", "grooming": "grooming", "walking": "walking", "health": "health"}


def pack_of(name: str) -> str | None:
    m = re.search(r"(\d+(?:\.\d+)?\s?(?:g|gm|ml|psc|pcs)\b|Pack of \d+|\d+ Sticks)", name, re.I)
    return re.sub("psc", "pcs", m.group(1), flags=re.I) if m else None


def product_rows() -> list[dict]:
    rows = []
    with CSV.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            flags = [x for x in (r.get("flags") or "").replace(";", "|").split("|") if x]
            if SKIP_FLAGS & set(flags):
                continue
            pt = r["pet_type"].strip().lower()
            rows.append({
                "sku": r["sku"].strip(),
                "name": r["name"].strip(),
                "brand": (r.get("brand_suggested") or r["brand_as_listed"]).strip(),
                "brand_as_listed": r["brand_as_listed"].strip(),
                "category": CATEGORY[r["category"].strip().lower()],
                "pet_types": ["dog", "cat"] if pt == "both" else [pt],
                "pack_size": pack_of(r["name"]),
                "popularity_rank": int(r["row"]),
                "source_flags": flags,
                "price_paise": int(r["price_paise"]),
                "stock_qty": PLACEHOLDER_STOCK if r["status"].strip().lower() == "in-stock" else 0,
            })
    return rows
