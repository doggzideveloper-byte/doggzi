"""Service-to-service routes (not exposed by the gateway: /api/pet-profile/internal/* returns 404 there).
Protected by INTERNAL_TOKEN."""
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...core.config import get_settings
from ...db import get_db
from ...models import Breed, Pet

router = APIRouter(prefix="/internal", tags=["internal"])


def internal_only(x_internal_token: str | None = Header(default=None)) -> None:
    expected = get_settings().internal_token
    if not expected or x_internal_token != expected:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Internal endpoint")


@router.get("/pets/{pet_id}", dependencies=[Depends(internal_only)], summary="Owner and basics of a pet, for other services")
def pet_owner(pet_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    pet = db.get(Pet, pet_id)
    if not pet:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pet not found")
    return {
        "id": str(pet.id), "owner_user_id": str(pet.owner_user_id) if pet.owner_user_id else None,
        "name": pet.name, "type": pet.type, "breed": pet.breed.name if pet.breed else None,
    }


# ---------- Admin panel (called by services/admin only) ----------
def _pet(p: Pet) -> dict:
    return {"id": str(p.id), "owner_user_id": str(p.owner_user_id) if p.owner_user_id else None, "name": p.name, "type": p.type,
            "breed": p.breed.name if p.breed else None, "created_at": p.created_at.isoformat()}


@router.get("/pets", dependencies=[Depends(internal_only)], summary="Pets of the given owners (comma-separated user ids), or all owned pets")
def pets(owners: str = Query(default="", max_length=40_000), db: Session = Depends(get_db)) -> list[dict]:
    q = select(Pet).where(Pet.owner_user_id.is_not(None))
    ids = [uuid.UUID(x) for x in owners.split(",") if x.strip()]
    if ids:
        q = q.where(Pet.owner_user_id.in_(ids))
    return [_pet(p) for p in db.scalars(q.order_by(Pet.created_at).limit(5000))]


class PetIn(BaseModel):
    owner_user_id: uuid.UUID
    name: str = Field(min_length=1, max_length=24)
    type: Literal["dog", "cat"]
    breed: str = Field(min_length=1, max_length=80)


@router.post("/pets", dependencies=[Depends(internal_only)], status_code=status.HTTP_201_CREATED, summary="OPS adds a pet to a customer's account")
def add_pet(body: PetIn, db: Session = Depends(get_db)) -> dict:
    name = body.breed.strip().lower()
    breed = db.scalar(select(Breed).where(Breed.type == body.type, func.lower(Breed.name) == name)) or \
        db.scalar(select(Breed).where(Breed.type == body.type, func.lower(Breed.name).like(f"{name}%")).order_by(Breed.popularity_rank))
    if not breed:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown {body.type} breed: {body.breed.strip()}")
    p = Pet(owner_user_id=body.owner_user_id, name=body.name.strip(), type=body.type, breed_id=breed.id)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _pet(p)


@router.get("/stats", dependencies=[Depends(internal_only)], summary="Passports created and Fresh Food plans previewed in [from, to)")
def stats(frm: datetime = Query(alias="from"), to: datetime = Query(), db: Session = Depends(get_db)) -> dict:
    rng = (Pet.created_at >= frm, Pet.created_at < to)
    return {"passports": db.scalar(select(func.count(Pet.id)).where(*rng)) or 0,
            "plans": db.scalar(select(func.count(Pet.id)).where(*rng, Pet.weight_kg.is_not(None))) or 0}
