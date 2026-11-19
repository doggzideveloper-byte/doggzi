from ...models import Breed, Pet
from ...schemas.pet import BreedOut, PetOut


def breed_out(b: Breed) -> BreedOut:
    return BreedOut(id=b.id, name=b.name, slug=b.slug, avatar_url=b.avatar_path, pinned=b.is_pinned)


def pet_out(p: Pet) -> PetOut:
    return PetOut(
        id=p.id,
        name=p.name,
        type=p.type,  # type: ignore[arg-type]
        breed=breed_out(p.breed) if p.breed else None,
        weight_kg=float(p.weight_kg) if p.weight_kg is not None else None,
        life_stage=p.life_stage,  # type: ignore[arg-type]
        age_years=float(p.age_years) if p.age_years is not None else None,
        allergies=list(p.allergies or []),  # type: ignore[arg-type]
        activity_level=p.activity_level,  # type: ignore[arg-type]
        notify_fresh_food=p.notify_fresh_food,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )
