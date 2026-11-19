from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core import cache
from ...core.config import get_settings
from ...db import get_db
from ...models import Breed
from ...schemas.pet import BreedOut
from .serializers import breed_out

router = APIRouter(tags=["breeds"])


@router.get("/breeds", response_model=list[BreedOut], summary="Breeds for a pet type, pinned rows first")
def list_breeds(
    type: Literal["dog", "cat"],
    q: str = Query(default="", max_length=60, description="Case-insensitive search on the name"),
    db: Session = Depends(get_db),
) -> list[BreedOut]:
    q = q.strip().lower()
    key = f"breeds:v1:{type}:{q}"
    hit = cache.get(key)
    if hit is not None:
        return [BreedOut(**b) for b in hit]
    stmt = select(Breed).where(Breed.type == type, Breed.is_active.is_(True))
    if q:
        stmt = stmt.where(Breed.name.ilike(f"%{q}%"))
    rows = db.scalars(stmt.order_by(Breed.is_pinned.desc(), Breed.popularity_rank, Breed.name)).all()
    out = [breed_out(b) for b in rows]
    cache.set(key, [o.model_dump(mode="json") for o in out], get_settings().breeds_cache_seconds)
    return out
