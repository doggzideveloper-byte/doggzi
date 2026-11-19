import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PetType = Literal["dog", "cat"]
LifeStage = Literal["puppy", "kitten", "adult", "senior"]
Activity = Literal["couch_potato", "normal", "zoomies"]
Allergy = Literal["chicken", "beef", "grains", "dairy", "none"]
NAME_RE = re.compile(r"^[A-Za-z .'\-]{1,24}$")


def _clean_name(v: str) -> str:
    v = (v or "").strip()
    if not v:
        raise ValueError("Every pet needs a name")
    if not NAME_RE.fullmatch(v):
        raise ValueError("Names can use letters, spaces and . ' - only (1–24 characters)")
    return v


class BreedOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    avatar_url: str | None
    pinned: bool


class PetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: PetType
    breed: BreedOut | None
    weight_kg: float | None
    life_stage: LifeStage | None
    age_years: float | None
    allergies: list[Allergy]
    activity_level: Activity | None
    notify_fresh_food: bool
    created_at: datetime
    updated_at: datetime


class GuestPetIn(BaseModel):
    name: str
    type: PetType
    breed_id: uuid.UUID | None = None

    _n = field_validator("name")(_clean_name)


class GuestPetOut(BaseModel):
    pet: PetOut
    guest_token: str


class PetPatch(BaseModel):
    name: str | None = None
    type: PetType | None = None
    breed_id: uuid.UUID | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return None if v is None else _clean_name(v)


class NutritionIn(BaseModel):
    weight_kg: float = Field(ge=0.5, le=100)
    life_stage: LifeStage
    age_years: float | None = Field(default=None, ge=0, le=30)
    allergies: list[Allergy] = Field(default_factory=list, max_length=5)
    activity_level: Activity

    @field_validator("allergies")
    @classmethod
    def _dedupe(cls, v: list[str]) -> list[str]:
        v = list(dict.fromkeys(v))
        if "none" in v and len(v) > 1:
            raise ValueError("'none' can't be combined with other allergies")
        return [] if v == ["none"] else v


class PreferencesIn(BaseModel):
    notify_fresh_food: bool
