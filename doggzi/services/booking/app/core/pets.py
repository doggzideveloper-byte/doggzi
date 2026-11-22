"""Looks up a pet's owner in pet-profile (internal API). Bookings may only be made for your own pet."""
import uuid
from typing import Protocol

import httpx
from fastapi import HTTPException, status

from .config import get_settings


class PetLookup(Protocol):
    def owner_of(self, pet_id: uuid.UUID) -> uuid.UUID | None | str: ...


class HttpPetLookup:
    def owner_of(self, pet_id: uuid.UUID) -> uuid.UUID | None | str:
        """Returns the owner's user id, None for an unclaimed (guest) pet, or "missing"."""
        s = get_settings()
        try:
            r = httpx.get(f"{s.pet_profile_url}/api/pet-profile/v1/internal/pets/{pet_id}", headers={"X-Internal-Token": s.internal_token}, timeout=5)
        except httpx.HTTPError as e:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Couldn't check the pet just now. Try again.") from e
        if r.status_code == 404:
            return "missing"
        if r.status_code != 200:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Couldn't check the pet just now. Try again.")
        owner = r.json().get("owner_user_id")
        return uuid.UUID(owner) if owner else None


def get_pet_lookup() -> PetLookup:
    return HttpPetLookup()


def require_own_pet(lookup: PetLookup, pet_id: uuid.UUID, user_id: uuid.UUID) -> None:
    owner = lookup.owner_of(pet_id)
    if owner == "missing":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown pet")
    if owner != user_id:
        # Includes unclaimed guest pets: the passport must be claimed (after OTP) before booking.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only book for your own pet")
