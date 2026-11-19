"""Breed seed data (Delhi NCR favourites). Used by the Alembic data migration and by the tests."""
import re

DOGS = [
    "Labrador Retriever", "Golden Retriever", "German Shepherd", "Beagle", "Shih Tzu", "Pug", "Siberian Husky",
    "Rottweiler", "Pomeranian", "Doberman", "Cocker Spaniel", "Lhasa Apso", "Boxer", "Great Dane", "Dachshund",
    "French Bulldog", "Maltese", "Saint Bernard", "Indian Spitz", "Chihuahua", "Pit Bull", "Border Collie",
    "Cavalier King Charles Spaniel", "Bichon Frise", "Yorkshire Terrier", "Dalmatian", "Poodle", "Belgian Malinois",
    "Samoyed", "Akita",
]
CATS = [
    "Persian", "Siamese", "Maine Coon", "British Shorthair", "Bengal", "Ragdoll", "Himalayan", "Scottish Fold",
    "Russian Blue", "Exotic Shorthair", "Abyssinian", "Sphynx",
]
PINNED = {"dog": ["Indie / Desi", "Mixed / Not sure"], "cat": ["Indian / Indie", "Mixed / Not sure"]}
MIXED = "Mixed / Not sure"


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def breed_rows() -> list[dict]:
    rows = []
    for t, names in (("dog", DOGS), ("cat", CATS)):
        for i, n in enumerate(PINNED[t]):
            rows.append({"type": t, "name": n, "slug": slugify(n), "popularity_rank": i, "is_pinned": True})
        for i, n in enumerate(names):
            rows.append({"type": t, "name": n, "slug": slugify(n), "popularity_rank": 10 + i, "is_pinned": False})
    for r in rows:
        r["avatar_path"] = f"/brand/breeds/{r['type']}/{r['slug']}.svg"
        r["is_active"] = True
    return rows
