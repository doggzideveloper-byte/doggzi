import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ...core.security import AuthUser, CurrentPrincipal, CurrentUser, Principal, create_guest_token, decode_guest_token
from ...db import get_db
from ...models import Breed, Pet
from ...schemas.pet import GuestPetIn, GuestPetOut, NutritionIn, PetOut, PetPatch, PreferencesIn
from ...seed import MIXED, slugify
from .serializers import pet_out

router = APIRouter(prefix="/pets", tags=["pets"])


def _resolve_breed(db: Session, pet_type: str, breed_id: uuid.UUID | None) -> Breed:
    """Breed must match the pet type; a skipped breed becomes "Mixed / Not sure"."""
    if breed_id is not None:
        b = db.get(Breed, breed_id)
        if not b or not b.is_active:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown breed")
        if b.type != pet_type:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"That breed is for a {b.type}, not a {pet_type}")
        return b
    b = db.scalar(select(Breed).where(Breed.type == pet_type, Breed.slug == slugify(MIXED)))
    if not b:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Breed seed data is missing")
    return b


def _owned(p: Principal):
    conds = []
    if p.guest_id:
        conds.append(Pet.guest_id == p.guest_id)
    if p.user:
        conds.append(Pet.owner_user_id == p.user.id)
    return or_(*conds)


def _get_owned(db: Session, pet_id: uuid.UUID, p: Principal) -> Pet:
    pet = db.scalar(select(Pet).where(Pet.id == pet_id, _owned(p)))
    if not pet:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pet not found")
    return pet


@router.post("/guest", response_model=GuestPetOut, status_code=status.HTTP_201_CREATED, summary="Create a passport without logging in")
def create_guest_pet(body: GuestPetIn, db: Session = Depends(get_db)) -> GuestPetOut:
    breed = _resolve_breed(db, body.type, body.breed_id)
    guest_id = uuid.uuid4()
    pet = Pet(guest_id=guest_id, name=body.name, type=body.type, breed_id=breed.id, allergies=[])
    db.add(pet)
    db.commit()
    db.refresh(pet)
    return GuestPetOut(pet=pet_out(pet), guest_token=create_guest_token(guest_id))


@router.get("/me", response_model=list[PetOut], summary="Pets for the guest or user token")
def my_pets(p: Principal = CurrentPrincipal, db: Session = Depends(get_db)) -> list[PetOut]:
    rows = db.scalars(select(Pet).where(_owned(p)).order_by(Pet.created_at)).all()
    return [pet_out(x) for x in rows]


@router.patch("/{pet_id}", response_model=PetOut, summary="Edit passport: name, type, breed")
def update_pet(pet_id: uuid.UUID, body: PetPatch, p: Principal = CurrentPrincipal, db: Session = Depends(get_db)) -> PetOut:
    pet = _get_owned(db, pet_id, p)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        pet.name = data["name"]
    new_type = data.get("type") or pet.type
    if "type" in data or "breed_id" in data:
        breed_id = data.get("breed_id", pet.breed_id if new_type == pet.type else None)
        pet.breed_id = _resolve_breed(db, new_type, breed_id).id
        pet.type = new_type
    db.commit()
    db.refresh(pet)
    return pet_out(pet)


@router.patch("/{pet_id}/nutrition", response_model=PetOut, summary="Save the Fresh Food plan details")
def update_nutrition(pet_id: uuid.UUID, body: NutritionIn, p: Principal = CurrentPrincipal, db: Session = Depends(get_db)) -> PetOut:
    pet = _get_owned(db, pet_id, p)
    if body.life_stage == "puppy" and pet.type == "cat" or body.life_stage == "kitten" and pet.type == "dog":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"A {pet.type} can't be a {body.life_stage}")
    pet.weight_kg = Decimal(str(round(body.weight_kg, 2)))
    pet.life_stage = body.life_stage
    pet.age_years = Decimal(str(round(body.age_years, 1))) if body.age_years is not None else None
    pet.allergies = list(body.allergies)
    pet.activity_level = body.activity_level
    db.commit()
    db.refresh(pet)
    return pet_out(pet)


@router.patch("/{pet_id}/preferences", response_model=PetOut, summary="e.g. notify me when Fresh Food comes to cats")
def update_preferences(pet_id: uuid.UUID, body: PreferencesIn, p: Principal = CurrentPrincipal, db: Session = Depends(get_db)) -> PetOut:
    pet = _get_owned(db, pet_id, p)
    pet.notify_fresh_food = body.notify_fresh_food
    db.commit()
    db.refresh(pet)
    return pet_out(pet)


@router.post("/claim", response_model=list[PetOut], summary="After OTP login, move guest pets to the user")
def claim(user: AuthUser = CurrentUser, x_guest_token: str = Header(..., alias="X-Guest-Token"), db: Session = Depends(get_db)) -> list[PetOut]:
    guest_id = decode_guest_token(x_guest_token)
    pets = db.scalars(select(Pet).where(Pet.guest_id == guest_id)).all()
    for pet in pets:
        if pet.owner_user_id and pet.owner_user_id != user.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "This passport already belongs to another account")
        pet.owner_user_id = user.id  # guest_id is kept so the browser's guest token keeps working
    db.commit()
    rows = db.scalars(select(Pet).where(Pet.owner_user_id == user.id).order_by(Pet.created_at)).all()
    return [pet_out(x) for x in rows]
