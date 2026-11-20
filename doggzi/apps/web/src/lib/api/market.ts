import { api } from "./client";
import type { PetType } from "./petProfile";
import type { Category } from "@/content/marketplace";

export interface MVendor { id: string; name: string; slug: string; area: string | null; story: string | null; since_year: number | null; delivery_fee_paise: number; serviceable_pincodes: string[]; is_doggzi: boolean }
export interface MListing {
  id: string; sku: string; name: string; brand: string; category: Category; pet_types: PetType[]; description: string | null; pack_size: string | null;
  price_paise: number; mrp_paise: number | null; in_stock: boolean; available_qty: number; photo_url: string | null; popularity_rank: number; vendor: MVendor;
}
export interface MCart { groups: { vendor: MVendor; lines: { id: string; listing: MListing; qty: number; line_total_paise: number }[]; subtotal_paise: number; delivery_fee_paise: number }[]; item_count: number; total_paise: number }
export type SubStatus = "placed" | "accepted" | "rejected" | "packed" | "out_for_delivery" | "delivered" | "cancelled";
export interface MOrder {
  id: string; status: "pending_payment" | "paid" | "cancelled" | "expired"; total_paise: number; address: Record<string, string>; created_at: string;
  sub_orders: { id: string; vendor: MVendor; subtotal_paise: number; delivery_fee_paise: number; status: SubStatus; sla_due_at: string | null; items: { sku: string; name: string; qty: number; price_paise_at_order: number }[] }[];
  lines: { listing_id: string; sku: string; name: string; qty: number; price_paise: number; vendor_id: string }[];
}
export interface MAddress { line1: string; line2?: string; landmark?: string; city: string; pincode: string }

const S = "market";
const cartHdr = (cartId: string) => ({ "X-Cart-Id": cartId });
export const market = {
  catalog: (petType: PetType) => api<{ items: MListing[]; vendors: MVendor[] }>(S, `/catalog?pet_type=${petType}`),
  cart: (cartId: string) => api<MCart>(S, "/cart", { headers: cartHdr(cartId) }),
  setItem: (cartId: string, listing_id: string, qty: number) => api<MCart>(S, "/cart/items", { body: { listing_id, qty }, headers: cartHdr(cartId) }),
  createOrder: (token: string, body: { address: MAddress; lines: { listing_id: string; qty: number }[]; client_total_paise?: number }) =>
    api<{ order: MOrder; payment: { mode: "mock" | "razorpay"; amount_paise: number; currency: string; razorpay_order_id: string | null } }>(S, "/orders", { body, token }),
  payMock: (token: string, orderId: string, cartId: string) => api<MOrder>(S, `/orders/${orderId}/pay/mock`, { method: "POST", token, headers: cartHdr(cartId) }),
  order: (token: string, id: string) => api<MOrder>(S, `/orders/${id}`, { token }),
};
