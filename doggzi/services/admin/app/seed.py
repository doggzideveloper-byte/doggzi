"""First start: copy the site's current content (apps/web/src/content, exported to seed_content.json) into the
content tables as drafts, and the site config. Runs on every start; only fills empty tables.
Run: python -m app.seed
"""
import json
from pathlib import Path

from sqlalchemy import func, select

from .db import SessionLocal
from .models import ContentItem, SiteConfig

DATA = json.loads((Path(__file__).parent / "seed_content.json").read_text())


def seed(db) -> str:
    made = []
    if not db.scalar(select(func.count(ContentItem.id))):
        n = 0
        for page, faqs in DATA["faqs"].items():
            for i, f in enumerate(faqs):
                db.add(ContentItem(kind="faq", page=page, status="live", sort_order=i, data={"q": f["q"], "a": f["a"]}))  # already on the site
                n += 1
        for i, t in enumerate(DATA["testimonials"]):
            db.add(ContentItem(kind="testimonial", page=None, status="draft", consent=False, sort_order=i,
                               data={k: t.get(k) for k in ("pet", "type", "parent", "area", "service", "quote", "placeholder")}))
        for i, v in enumerate(DATA["videos"]):
            db.add(ContentItem(kind="video", page=v["page"], status="live", sort_order=i, data={"video_id": v["id"], "title": v.get("title")}))
        made.append(f"{n} FAQs, {len(DATA['testimonials'])} testimonials, {len(DATA['videos'])} videos")
    for k, v in DATA["site"].items():
        if not db.scalar(select(SiteConfig).where(SiteConfig.key == k)):
            db.add(SiteConfig(key=k, value={"v": v}))
    db.commit()
    return ", ".join(made) or "nothing new"


if __name__ == "__main__":
    with SessionLocal() as db:
        print(f"seed: {seed(db)}")
