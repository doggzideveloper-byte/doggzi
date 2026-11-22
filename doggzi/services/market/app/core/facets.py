"""Marketplace browse: filters, brand grouping and facet counts (PAGE_05 section 4b).

Pure functions over plain rows, so the rules are easy to test and identical for every caller.
Facet counts follow the usual rule: each section is counted with every *other* active filter applied,
so ticking a brand never hides the other brands and the numbers always match what a click would show.
"""
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

CATEGORIES = [("treats", "Treats"), ("toys", "Toys"), ("grooming", "Grooming & hygiene"), ("walking", "Walking gear"), ("health", "Health & supplements")]
# key, label, lo (incl., paise), hi (excl., paise)
PRICE_BUCKETS = [
    ("under-250", "Under ₹250", 0, 25_000),
    ("250-500", "₹250–₹500", 25_000, 50_000),
    ("500-1000", "₹500–₹1,000", 50_000, 100_000),
    ("1000-plus", "₹1,000+", 100_000, None),
]
PETS = [("dog", "Dog"), ("cat", "Cat"), ("both", "Both")]

# Product lines and spelling variants that belong to one brand. (pattern on the squashed key, slug, display)
BRAND_ALIASES = [
    (re.compile(r"^superfun"), "superfun", "Super Fun"),
]


def brand_key(raw: str) -> str:
    """Stable URL slug: lower-case letters and digits only ("Zippy paws" and "ZippyPaws" -> "zippypaws")."""
    k = re.sub(r"[^a-z0-9]+", "", (raw or "").lower())
    for pat, slug, _ in BRAND_ALIASES:
        if pat.search(k):
            return slug
    return k or "unbranded"


def brand_display(raw: str) -> str:
    """The name shown on the site for one listed brand (aliases resolved, whitespace tidied)."""
    k = re.sub(r"[^a-z0-9]+", "", (raw or "").lower())
    for pat, _, display in BRAND_ALIASES:
        if pat.search(k):
            return display
    return " ".join((raw or "").split()) or "Unbranded"


@dataclass
class Row:
    id: object
    name: str
    brand: str
    category: str
    pet_types: list[str]
    price_paise: int
    in_stock: bool
    popularity_rank: int
    payload: object = None  # whatever the caller wants back (ListingOut)
    bkey: str = field(init=False)

    def __post_init__(self) -> None:
        self.bkey = brand_key(self.brand)


@dataclass
class Filters:
    pet: str = "both"  # dog | cat | both (both = everything for dogs or cats)
    category: str | None = None
    prices: frozenset[str] = frozenset()
    brands: frozenset[str] = frozenset()
    in_stock: bool = False
    q: str = ""
    sort: str = "popular"


def _bucket(price: int) -> str:
    for k, _, lo, hi in PRICE_BUCKETS:
        if price >= lo and (hi is None or price < hi):
            return k
    return PRICE_BUCKETS[-1][0]


def _tests(f: Filters):
    q = f.q.strip().lower()
    return {
        "pet": lambda r: f.pet == "both" or f.pet in r.pet_types,
        "category": lambda r: not f.category or r.category == f.category,
        "price": lambda r: not f.prices or _bucket(r.price_paise) in f.prices,
        "brand": lambda r: not f.brands or r.bkey in f.brands,
        "stock": lambda r: not f.in_stock or r.in_stock,
        "q": lambda r: not q or q in f"{r.name} {r.brand} {brand_display(r.brand)}".lower(),
    }


def _except(rows: list[Row], tests: dict, skip: str) -> list[Row]:
    fs = [t for k, t in tests.items() if k != skip]
    return [r for r in rows if all(t(r) for t in fs)]


SORTS = {
    "popular": lambda r: r.popularity_rank,
    "price_asc": lambda r: (r.price_paise, r.popularity_rank),
    "price_desc": lambda r: (-r.price_paise, r.popularity_rank),
    "new": lambda r: -r.popularity_rank,
}


def browse(rows: list[Row], f: Filters) -> dict:
    tests = _tests(f)
    items = _except(rows, tests, skip="")
    items.sort(key=SORTS.get(f.sort, SORTS["popular"]))

    by_cat = _except(rows, tests, "category")
    cc = Counter(r.category for r in by_cat)
    by_price = _except(rows, tests, "price")
    pc = Counter(_bucket(r.price_paise) for r in by_price)
    by_pet = _except(rows, tests, "pet")
    by_stock = _except(rows, tests, "stock")

    # Brand groups: label = the most common display spelling inside the group (ties: alphabetical).
    by_brand = _except(rows, tests, "brand")
    bc = Counter(r.bkey for r in by_brand)
    spellings: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        spellings[r.bkey][brand_display(r.brand)] += 1
    label = {k: sorted(v.items(), key=lambda kv: (-kv[1], kv[0]))[0][0] for k, v in spellings.items()}
    keys = set(bc) | set(f.brands)  # a ticked brand stays listed even at 0
    brands = sorted(({"key": k, "label": label.get(k, k), "count": bc.get(k, 0)} for k in keys), key=lambda b: (-b["count"], b["label"].lower()))

    return {
        "items": items,
        "total": len(items),
        "facets": {
            "category": [{"key": "all", "label": "All", "count": len(by_cat)}] + [{"key": k, "label": lbl, "count": cc.get(k, 0)} for k, lbl in CATEGORIES],
            "price": [{"key": k, "label": lbl, "count": pc.get(k, 0)} for k, lbl, _, _ in PRICE_BUCKETS],
            "brand": brands,
            "pet": [{"key": k, "label": lbl, "count": len(by_pet) if k == "both" else sum(1 for r in by_pet if k in r.pet_types)} for k, lbl in PETS],
            "in_stock": sum(1 for r in by_stock if r.in_stock),
        },
    }
