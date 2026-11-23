"""Content (ADMIN only): FAQs per page (draft / live), testimonials (consent required to go live), YouTube Shorts,
site config. GET /content/public serves what is live (for apps/web once it reads from here; see BACKLOG)."""
import re
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...core.access import Staff, admin_only
from ...core.audit import record
from ...db import get_db
from ...models import CONTENT_PAGES, ContentItem, SiteConfig

router = APIRouter(tags=["content"])
Page = Literal["Explore", "Fresh Food", "Services", "Marketplace"]
CONFIG_KEYS = {"whatsapp": "WhatsApp", "phone": "Phone", "email": "Email", "fssai": "FSSAI no.", "delivery_areas": "Delivery areas", "cats_supported": "catsSupported"}


def _item(c: ContentItem) -> dict:
    return {"id": str(c.id), "kind": c.kind, "page": c.page, "status": c.status, "consent": c.consent, "data": c.data, "updated_at": c.updated_at.isoformat()}


def _config(db: Session) -> dict:
    return {r.key: r.value.get("v") for r in db.scalars(select(SiteConfig))}


@router.get("/content")
def content(_: Staff = Depends(admin_only), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(ContentItem).order_by(ContentItem.kind, ContentItem.page, ContentItem.sort_order, ContentItem.created_at)).all()
    faqs = {p: [x for x in rows if x.kind == "faq" and x.page == p] for p in CONTENT_PAGES}
    return {
        "faq_sets": [{"page": p, "count": len(v), "live": sum(1 for x in v if x.status == "live"), "status": "live" if v and all(x.status == "live" for x in v) else "draft"}
                     for p, v in faqs.items()],
        "faqs": [_item(x) for x in rows if x.kind == "faq"],
        "testimonials": [_item(x) for x in rows if x.kind == "testimonial"],
        "videos": [_item(x) for x in rows if x.kind == "video"],
        "config": _config(db),
    }


class FaqIn(BaseModel):
    kind: Literal["faq"]
    page: Page
    q: str = Field(min_length=5, max_length=200)
    a: str = Field(min_length=5, max_length=2000)


class TestimonialIn(BaseModel):
    kind: Literal["testimonial"]
    pet: str = Field(min_length=1, max_length=40)
    parent: str = Field(min_length=1, max_length=60)
    service: Literal["Fresh Food", "Grooming", "Spa day", "Marketplace", "Training"]
    quote: str = Field(min_length=10, max_length=600)
    consent: bool


class VideoIn(BaseModel):
    kind: Literal["video"]
    url: str = Field(min_length=11, max_length=300)
    page: Page


def video_id(url: str) -> str:
    m = re.search(r"(?:shorts/|v=|youtu\.be/)([\w-]{11})", url) or re.fullmatch(r"([\w-]{11})", url.strip())
    if not m:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That doesn't look like a YouTube link or 11-character ID")
    return m.group(1)


@router.post("/content", status_code=status.HTTP_201_CREATED, summary="Add a FAQ (draft), a testimonial (draft; consent required) or a video")
def add(body: FaqIn | TestimonialIn | VideoIn, who: Staff = Depends(admin_only), db: Session = Depends(get_db)) -> dict:
    nxt = lambda kind, page: (db.scalar(select(func.max(ContentItem.sort_order)).where(ContentItem.kind == kind, ContentItem.page == page)) or 0) + 1  # noqa: E731
    if isinstance(body, FaqIn):
        c = ContentItem(kind="faq", page=body.page, status="draft", sort_order=nxt("faq", body.page), data={"q": body.q.strip(), "a": body.a.strip()})
        what = f"Added FAQ to {body.page}: {body.q.strip()}"
    elif isinstance(body, TestimonialIn):
        if not body.consent:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Customer consent must be recorded")
        c = ContentItem(kind="testimonial", status="draft", consent=True, sort_order=nxt("testimonial", None),
                        data={"pet": body.pet.strip(), "parent": body.parent.strip(), "service": body.service, "quote": body.quote.strip()})
        what = f"Added testimonial for {body.pet.strip()} (consent recorded)"
    else:
        vid = video_id(body.url)
        if db.scalar(select(ContentItem).where(ContentItem.kind == "video", ContentItem.data["video_id"].as_string() == vid)):
            raise HTTPException(status.HTTP_409_CONFLICT, "This video is already listed")
        c = ContentItem(kind="video", page=body.page, status="live", sort_order=nxt("video", body.page), data={"video_id": vid})
        what = f"Added video {vid} to {body.page}"
    db.add(c)
    db.commit()
    record(db, who, "Content", what, target=str(c.id)[:8], after=c.status)
    return _item(c)


class ItemPatch(BaseModel):
    status: Literal["draft", "live"] | None = None
    consent: bool | None = None


@router.patch("/content/{cid}", summary="Draft / live, consent (removing consent takes a testimonial off the site)")
def patch(cid: uuid.UUID, body: ItemPatch, who: Staff = Depends(admin_only), db: Session = Depends(get_db)) -> dict:
    c = db.get(ContentItem, cid)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    name = c.data.get("pet") or c.data.get("q") or c.data.get("video_id")
    if body.consent is not None and c.kind == "testimonial" and body.consent != c.consent:
        c.consent = body.consent
        if not body.consent:
            c.status = "draft"
        record(db, who, "Content", f"Consent for {name}", before=str(not body.consent).lower(), after=str(body.consent).lower())
    if body.status is not None and body.status != c.status:
        if c.kind == "testimonial" and body.status == "live" and not c.consent:
            raise HTTPException(status.HTTP_409_CONFLICT, "Record the customer's consent first")
        before, c.status = c.status, body.status
        record(db, who, "Content", f"{c.kind.capitalize()} {name}", before=before, after=c.status)
    db.commit()
    return _item(c)


class FaqSetIn(BaseModel):
    status: Literal["draft", "live"]


@router.post("/content/faqs/{page}", summary="Put a page's whole FAQ set live or back to draft")
def faq_set(page: Page, body: FaqSetIn, who: Staff = Depends(admin_only), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(ContentItem).where(ContentItem.kind == "faq", ContentItem.page == page)).all()
    before = "live" if rows and all(x.status == "live" for x in rows) else "draft"
    for x in rows:
        x.status = body.status
    db.commit()
    record(db, who, "Content", f"FAQs {page}", before=before, after=body.status)
    return {"page": page, "count": len(rows), "status": body.status}


class ConfigIn(BaseModel):
    whatsapp: str = Field(pattern=r"^\d{10,13}$")
    phone: str = Field(max_length=20)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=120)
    fssai: str = Field(default="", pattern=r"^(\d{14})?$")
    delivery_areas: str = Field(max_length=120)
    cats_supported: bool


@router.put("/site-config", summary="Contact details, FSSAI number, delivery areas, catsSupported")
def put_config(body: ConfigIn, who: Staff = Depends(admin_only), db: Session = Depends(get_db)) -> dict:
    cur = _config(db)
    for k, v in body.model_dump().items():
        if cur.get(k) != v:
            row = db.scalar(select(SiteConfig).where(SiteConfig.key == k))
            if row:
                row.value = {"v": v}
            else:
                db.add(SiteConfig(key=k, value={"v": v}))
            record(db, who, "Content", f"Site config: {CONFIG_KEYS[k]}", before=cur.get(k), after=v)
    db.commit()
    return _config(db)


@router.get("/content/public", summary="Live content for the public site (no login)")
def public(db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(ContentItem).where(ContentItem.status == "live").order_by(ContentItem.sort_order)).all()
    cfg = _config(db)
    return {"faqs": {p: [x.data for x in rows if x.kind == "faq" and x.page == p] for p in CONTENT_PAGES},
            "testimonials": [x.data for x in rows if x.kind == "testimonial" and x.consent],
            "videos": [{"id": x.data["video_id"], "page": x.page} for x in rows if x.kind == "video"],
            "config": {k: cfg.get(k) for k in ("whatsapp", "phone", "email", "fssai", "delivery_areas", "cats_supported")}}
