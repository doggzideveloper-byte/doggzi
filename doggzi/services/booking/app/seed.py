"""Catalog seed (docs/reference/Doggzi_Services_Catalog.pdf, prices as given, in paise).
GST treatment and cat eligibility are DRAFTS for Abhiyash to confirm."""

CAT_OK = {"bath-blow-dry", "medicated-bath", "light-dematting", "body-massage", "dental-cleaning", "boarding", "pickup"}

ITEMS = [
    ("package", "Full Package", "full-package", 172400, "fixed", "full"),
    ("package", "Trimming Package", "trimming-package", 114900, "fixed", "trimpkg"),
    ("package", "Shower Package", "shower-package", 114900, "fixed", "shower"),
    ("spa", "Bath & blow dry", "bath-blow-dry", 103400, "fixed", "bathdry"),
    ("spa", "Boot cut / poodle look", "boot-cut", 34400, "fixed", "pompom"),
    ("spa", "Body Massage", "body-massage", 34400, "fixed", "massage"),
    ("spa", "Only face styling", "face-styling", 57400, "fixed", "style"),
    ("spa", "Medicated bath", "medicated-bath", 22900, "fixed", "medbath"),
    ("spa", "Dental cleaning", "dental-cleaning", 22900, "fixed", "dental"),
    ("spa", "Light de-matting", "light-dematting", 34400, "fixed", "dematLight"),
    ("spa", "Normal de-matting", "normal-dematting", 103400, "fixed", "dematNormal"),
    ("spa", "De-stressing oil massage", "oil-massage", 68900, "fixed", "oil"),
    ("spa", "Full body hair trim", "full-trim", 114900, "fixed", "fulltrim"),
    ("spa", "Breed based styling", "breed-styling", 114900, "fixed", "breed"),
    ("training", "Pet Training (12 sessions/month)", "training", 1150000, "fixed", "training"),
    ("boarding", "Boarding (per hour)", "boarding", None, "on_request", "boarding"),
    ("pickup", "Pickup facility", "pickup", None, "availability", "pickup"),
]

# DRAFT package contents (Abhiyash to confirm)
PACKAGES = {
    "full-package": ["bath-blow-dry", "full-trim", "face-styling"],
    "trimming-package": ["full-trim", "face-styling"],
    "shower-package": ["bath-blow-dry"],
}


def item_rows() -> list[dict]:
    return [
        {"group": g, "name": n, "slug": s, "price_paise": p, "price_mode": m, "scene_key": k, "pet_types": ["dog", "cat"] if s in CAT_OK else ["dog"], "is_active": True, "sort_order": i}
        for i, (g, n, s, p, m, k) in enumerate(ITEMS)
    ]
