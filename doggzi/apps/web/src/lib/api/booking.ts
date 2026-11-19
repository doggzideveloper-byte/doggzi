import { api } from "./client";
import type { PetType } from "./petProfile";

export type ItemGroup = "package" | "spa" | "training" | "boarding" | "pickup";
export type PriceMode = "fixed" | "on_request" | "availability";
export interface ServiceItem {
  id: string;
  slug: string;
  group: ItemGroup;
  name: string;
  price_paise: number | null;
  price_mode: PriceMode;
  scene_key: string;
  pet_types: PetType[];
  includes: string[];
  sort_order: number;
}
export interface Slot { id: string; starts_at: string; ends_at: string; available: boolean }
export interface Address { label?: string; line1: string; line2?: string; landmark?: string; city: string; pincode: string }
export interface Booking {
  id: string;
  pet_id: string;
  slot: Slot;
  address: Address;
  status: "requested" | "confirmed" | "completed" | "cancelled";
  total_paise: number;
  items: { slug: string; name: string; price_paise_at_booking: number }[];
  notes: string | null;
  created_at: string;
}

const S = "booking";
export const booking = {
  catalog: (petType: PetType) => api<{ items: ServiceItem[] }>(S, `/catalog?pet_type=${petType}`),
  slots: (date: string) => api<Slot[]>(S, `/slots?date=${date}`),
  create: (token: string, body: { pet_id: string; slot_id: string; item_slugs: string[]; address: Address; notes?: string; client_total_paise?: number }) =>
    api<Booking>(S, "/bookings", { body, token }),
  mine: (token: string) => api<Booking[]>(S, "/bookings/me", { token }),
};
