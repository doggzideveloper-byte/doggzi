/** Pet basics shared by the website and the console. */
export type PetType = "dog" | "cat";
export const SMALL_BREEDS = new Set(["Beagle", "Shih Tzu", "Pug", "Pomeranian", "Lhasa Apso", "Dachshund", "French Bulldog", "Maltese", "Chihuahua", "Cavalier King Charles Spaniel", "Bichon Frise", "Yorkshire Terrier", "Indian Spitz", "Cocker Spaniel"]);
export type AvatarVariant = "dog" | "puppy" | "cat";
/** Until breed art exists: small dog breeds use the puppy, other dogs the Labrador, all cats the cat. */
export const avatarVariant = (type: PetType | null | undefined, breed?: string | null): AvatarVariant | null =>
  !type ? null : type === "cat" ? "cat" : breed && SMALL_BREEDS.has(breed) ? "puppy" : "dog";
