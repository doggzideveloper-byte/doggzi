import { api } from "./client";

export type PetType = "dog" | "cat";
export type LifeStage = "puppy" | "kitten" | "adult" | "senior";
export type Activity = "couch_potato" | "normal" | "zoomies";
export const ALLERGIES = ["chicken", "beef", "grains", "dairy", "none"] as const;
export type Allergy = (typeof ALLERGIES)[number];

export interface Breed { id: string; name: string; slug: string; avatar_url: string | null; pinned: boolean }
export interface Pet {
  id: string;
  name: string;
  type: PetType;
  breed: Breed | null;
  weight_kg: number | null;
  life_stage: LifeStage | null;
  age_years: number | null;
  allergies: Allergy[];
  activity_level: Activity | null;
  notify_fresh_food: boolean;
  created_at: string;
  updated_at: string;
}
export interface NutritionIn {
  weight_kg: number;
  life_stage: LifeStage;
  age_years: number | null;
  allergies: Allergy[];
  activity_level: Activity;
}

const S = "pet-profile";
export const petProfile = {
  breeds: (type: PetType, q = "", signal?: AbortSignal) =>
    api<Breed[]>(S, `/breeds?type=${type}${q ? `&q=${encodeURIComponent(q)}` : ""}`, { signal }),
  createGuest: (body: { name: string; type: PetType; breed_id?: string | null }) =>
    api<{ pet: Pet; guest_token: string }>(S, "/pets/guest", { body }),
  me: (token: string) => api<Pet[]>(S, "/pets/me", { token }),
  update: (id: string, token: string, body: Partial<{ name: string; type: PetType; breed_id: string | null }>) =>
    api<Pet>(S, `/pets/${id}`, { method: "PATCH", body, token }),
  nutrition: (id: string, token: string, body: NutritionIn) => api<Pet>(S, `/pets/${id}/nutrition`, { method: "PATCH", body, token }),
  preferences: (id: string, token: string, body: { notify_fresh_food: boolean }) =>
    api<Pet>(S, `/pets/${id}/preferences`, { method: "PATCH", body, token }),
  claim: (userToken: string, guestToken: string) =>
    api<Pet[]>(S, "/pets/claim", { method: "POST", token: userToken, headers: { "X-Guest-Token": guestToken }, body: {} }),
};
