"""Service-to-service routes (not exposed by the gateway: /api/pet-profile/internal/* returns 404 there).
Protected by INTERNAL_TOKEN."""
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from ...core.config import get_settings
from ...db import get_db
from ...models import Pet

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
