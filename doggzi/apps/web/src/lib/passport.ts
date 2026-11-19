import { useEffect, useState } from "react";
import { createStore } from "./store";
import { useTweaks } from "./tweaks";
import type { Activity, Allergy, LifeStage, PetType } from "./api/petProfile";

export interface Nutrition {
  weight_kg: number;
  life_stage: LifeStage;
  age_years: number | null;
  allergies: Allergy[];
  activity_level: Activity;
}
/** What we keep in localStorage under `dz.passport`. */
export interface Passport {
  name: string;
  type: PetType;
  breed: string;
  breed_id?: string | null;
  pet_id?: string | null;
  guest_token?: string | null;
  created_at: string;
  nutrition?: Nutrition | null;
  notify_fresh_food?: boolean;
}

export const passportStore = createStore<Passport | null>("dz.passport", null);
export const usePassport = () => passportStore.use();

export const DEMO: Record<PetType, Passport> = {
  dog: { name: "Bruno", type: "dog", breed: "Labrador Retriever", created_at: "" },
  cat: { name: "Mishti", type: "cat", breed: "Persian", created_at: "" },
};

/**
 * The pet a page should talk about: the Tweaks demo pet if one is forced, otherwise the saved passport.
 * `isDemo` is true when it is not the visitor's real passport.
 */
export function usePet(): { pet: Passport | null; isDemo: boolean } {
  const saved = usePassport();
  const t = useTweaks();
  if (t.demoPet === "dog" || t.demoPet === "cat") return { pet: DEMO[t.demoPet], isDemo: true };
  return { pet: saved && saved.name ? saved : null, isDemo: false };
}

/** One-shot flag for "came here from page X" (used for welcome-back copy and the orange handoff). */
export const from = {
  set: (v: string) => { try { sessionStorage.setItem("dz.from", v); } catch { /* ignore */ } },
  /** Read without clearing (safe in render / StrictMode double-invocation); pair with `clear` in an effect. */
  peek: (): string | null => {
    try { return sessionStorage.getItem("dz.from"); } catch { return null; }
  },
  clear: () => { try { sessionStorage.removeItem("dz.from"); } catch { /* ignore */ } },
}
/** Read the one-shot "from" flag once per mount, clearing it after the first commit. */
export function useFrom(): string | null {
  const [v] = useState(from.peek);
  useEffect(() => from.clear(), []);
  return v;
}

export const SMALL_BREEDS = new Set(["Beagle", "Shih Tzu", "Pug", "Pomeranian", "Lhasa Apso", "Dachshund", "French Bulldog", "Maltese", "Chihuahua", "Cavalier King Charles Spaniel", "Bichon Frise", "Yorkshire Terrier", "Indian Spitz", "Cocker Spaniel"]);
export type AvatarVariant = "dog" | "puppy" | "cat";
export const avatarVariant = (type: PetType | null | undefined, breed?: string | null): AvatarVariant | null =>
  !type ? null : type === "cat" ? "cat" : breed && SMALL_BREEDS.has(breed) ? "puppy" : "dog";
