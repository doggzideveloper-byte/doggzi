import type { PetType } from "@/lib/api/petProfile";

/**
 * Card-back teaser content, keyed by pet type. PLACEHOLDER prices until Abhiyash confirms.
 * Moves into the Booking, CCK and Marketplace services once those exist.
 * Note: walking and vet consult aren't in the services catalog yet (shown as "Coming soon" on /services).
 */
export interface Teaser { services: string[]; market: [string, number, number][]; svcDesc: string }
export const TEASERS: Record<PetType, Teaser> = {
  dog: {
    services: ["Grooming", "Walking", "Boarding", "Training", "Vet consult"],
    market: [["Treats", 99, 799], ["Toys", 149, 1299], ["Beds", 899, 4999], ["Grooming kits", 199, 1499]],
    svcDesc: "Grooming, walks, vet visits — at home",
  },
  cat: {
    services: ["Grooming", "Boarding", "Vet consult"],
    market: [["Treats", 99, 699], ["Litter", 249, 1199], ["Scratchers", 399, 2999], ["Toys", 99, 899]],
    svcDesc: "Grooming, boarding, vet visits — at home",
  },
};
/** Top three benefits from reference/fresh-food-vs-kibble.pdf */
export const FRESH_POINTS = ["Tailored by a certified pet nutritionist", "Cooked weekly, delivered chilled — not frozen", "Pause, skip or edit meals anytime"];
export const FRESH_FROM_PRICE = 1299; // PLACEHOLDER ₹ / week
export const STORE_COUNT_LINE = "From 40+ local stores near you"; // PLACEHOLDER
