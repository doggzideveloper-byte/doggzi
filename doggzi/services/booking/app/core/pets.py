"""Looks up a pet's owner in pet-profile (internal API). Bookings may only be made for your own pet."""
import uuid
from typing import Protocol

import httpx
from fastapi import HTTPException, status

from .config import get_settings


class PetLookup(Protocol):
    def get(self, pet_id: uuid.UUID) -> dict | None: ...


class HttpPetLookup:
    def get(self, pet_id: uuid.UUID) -> dict | None:
        """{owner_user_id (UUID or None for an unclaimed guest pet), name, type, breed}, or None if unknown."""
        s = get_settings()
        try:
            r = httpx.get(f"{s.pet_profile_url}/api/pet-profile/v1/internal/pets/{pet_id}", headers={"X-Internal-Token": s.internal_token}, timeout=5)
        except httpx.HTTPError as e:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Couldn't check the pet just now. Try again.") from e
        if r.status_code == 404:
            return None
        if r.status_code != 200:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Couldn't check the pet just now. Try again.")
        d = r.json()
        owner = d.get("owner_user_id")
        return {"owner_user_id": uuid.UUID(owner) if owner else None, "name": d.get("name"), "type": d.get("type"), "breed": d.get("breed")}


def get_pet_lookup() -> PetLookup:
    return HttpPetLookup()


def require_own_pet(lookup: PetLookup, pet_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    """Returns the pet snapshot {name, type, breed} when the pet is the user's own."""
    pet = lookup.get(pet_id)
    if pet is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown pet")
    if pet["owner_user_id"] != user_id:
        # Includes unclaimed guest pets: the passport must be claimed (after OTP) before booking.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only book for your own pet")
    return {"name": pet.get("name"), "type": pet.get("type"), "breed": pet.get("breed")}
