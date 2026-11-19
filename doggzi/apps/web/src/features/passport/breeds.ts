import { useQuery } from "@tanstack/react-query";
import { petProfile, type Breed, type PetType } from "@/lib/api/petProfile";

/** Offline fallback; mirrors the pet-profile seed migration (services/pet-profile/alembic/versions/0002). */
export const FALLBACK_BREEDS: Record<PetType, string[]> = {
  dog: ["Indie / Desi", "Mixed / Not sure", "Labrador Retriever", "Golden Retriever", "German Shepherd", "Beagle", "Shih Tzu", "Pug", "Siberian Husky", "Rottweiler", "Pomeranian", "Doberman", "Cocker Spaniel", "Lhasa Apso", "Boxer", "Great Dane", "Dachshund", "French Bulldog", "Maltese", "Saint Bernard", "Indian Spitz", "Chihuahua", "Pit Bull", "Border Collie", "Cavalier King Charles Spaniel", "Bichon Frise", "Yorkshire Terrier", "Dalmatian", "Poodle", "Belgian Malinois", "Samoyed", "Akita"],
  cat: ["Indian / Indie", "Mixed / Not sure", "Persian", "Siamese", "Maine Coon", "British Shorthair", "Bengal", "Ragdoll", "Himalayan", "Scottish Fold", "Russian Blue", "Exotic Shorthair", "Abyssinian", "Sphynx"],
};
export const PINNED = new Set(["Indie / Desi", "Indian / Indie", "Mixed / Not sure"]);
export const MIXED = "Mixed / Not sure";

const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fallback = (t: PetType): Breed[] => FALLBACK_BREEDS[t].map((name) => ({ id: "", name, slug: slug(name), avatar_url: null, pinned: PINNED.has(name) }));

/**
 * Full breed list for a type (cached 24h server-side; filtered client-side as they type).
 * Falls back to the bundled list if the service can't be reached, so the form always works.
 */
export function useBreeds(type: PetType | null) {
  const q = useQuery({
    queryKey: ["breeds", type],
    enabled: !!type,
    staleTime: 24 * 3600_000,
    queryFn: ({ signal }) => petProfile.breeds(type!, "", signal),
  });
  const list = type ? (q.data && q.data.length ? q.data : fallback(type)) : [];
  return { list, loading: q.isLoading, offline: q.isError };
}
