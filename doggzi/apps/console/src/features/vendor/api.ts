import { api } from "@/lib/api";

export type SoStatus = "placed" | "accepted" | "packed" | "out_for_delivery" | "delivered" | "rejected" | "missed";
export interface SubOrder {
  id: string; ref: string; status: SoStatus; placed_at: string; accept_by: string | null; items: { sku: string; name: string; qty: number; price_paise: number }[];
  pet: { name: string; type: string; breed?: string | null } | null; area: string; address: Record<string, string> | null; customer_phone: string; phone_visible: boolean;
  subtotal_paise: number; delivery_fee_paise: number; pack_checks: boolean[]; reject_reason: string | null; code_locked: boolean; demo_code: string | null;
}
export interface VListing { id: string; sku: string; product_id: string; name: string; brand: string; category: string; pet_types: string[]; price_paise: number; mrp_paise: number | null; stock_qty: number; is_active: boolean; photo_status: string; photo_url: string | null }
export interface CatalogHit { product_id: string; name: string; brand: string; category: string; already_listed: boolean }
export interface Payouts { on_hold_paise: number; released_paise: number; settled_paise: number; commission_pct: number; rows: { id: string; ref: string; date: string; order_value_paise: number; commission_paise: number; delivery_fee_paise: number; net_paise: number; status: "on_hold" | "released" | "settled" }[] }
export interface Store {
  id: string; name: string; story: string | null; since_year: number | null; hours_text: string | null; holiday_mode: boolean; delivery_fee_paise: number; serviceable_pincodes: string[];
  photos: ({ name: string; status: string } | null)[]; low_stock_threshold: number; commission_pct: number; accept_minutes: number; my_role: "owner" | "staff";
  staff: { name: string | null; phone: string; role: string; is_me: boolean }[]; help_whatsapp: string | null; demo: boolean;
}
export type StorePatch = Partial<Pick<Store, "name" | "story" | "since_year" | "hours_text" | "holiday_mode" | "delivery_fee_paise" | "serviceable_pincodes" | "low_stock_threshold">>;

const M = "market";
const file = (f: Blob, name = "upload") => { const fd = new FormData(); fd.append("file", f, name); return fd; };
export const vendor = {
  orders: () => api<SubOrder[]>(M, "/vendor/sub-orders"),
  accept: (id: string) => api<SubOrder>(M, `/vendor/sub-orders/${id}/accept`, { method: "POST" }),
  reject: (id: string, reason: string) => api<SubOrder>(M, `/vendor/sub-orders/${id}/reject`, { body: { reason } }),
  checks: (id: string, checks: boolean[]) => api<SubOrder>(M, `/vendor/sub-orders/${id}/checks`, { body: { checks } }),
  packed: (id: string) => api<SubOrder>(M, `/vendor/sub-orders/${id}/packed`, { method: "POST" }),
  out: (id: string) => api<SubOrder>(M, `/vendor/sub-orders/${id}/out`, { method: "POST" }),
  delivered: (id: string, code?: string) => api<SubOrder>(M, `/vendor/sub-orders/${id}/delivered`, { body: code ? { code } : {} }),
  demoOrder: () => api<SubOrder>(M, "/vendor/demo/order", { method: "POST" }),
  listings: () => api<VListing[]>(M, "/vendor/listings"),
  patchListing: (id: string, body: Partial<Pick<VListing, "price_paise" | "mrp_paise" | "stock_qty" | "is_active">>) => api<VListing>(M, `/vendor/listings/${id}`, { method: "PATCH", body }),
  addListing: (body: { product_id: string; price_paise: number; mrp_paise?: number | null; stock_qty?: number }) => api<VListing>(M, "/vendor/listings", { body }),
  photo: (id: string, blob: Blob) => api<VListing>(M, `/vendor/listings/${id}/photos`, { form: file(blob, "photo.jpg") }),
  search: (q: string) => api<CatalogHit[]>(M, `/vendor/catalog?q=${encodeURIComponent(q)}`),
  requestProduct: (name: string) => api<{ id: string }>(M, "/vendor/product-requests", { body: { name } }),
  importCsv: (f: File) => api<{ updated: number; requested: number; errors: string[] }>(M, "/vendor/listings/import", { form: file(f, f.name) }),
  payouts: () => api<Payouts>(M, "/vendor/payouts"),
  store: () => api<Store>(M, "/vendor/store"),
  patchStore: (body: StorePatch) => api<Store>(M, "/vendor/store", { method: "PATCH", body }),
  storePhoto: (i: number, f: File) => api<Store>(M, `/vendor/store/photos/${i}`, { form: file(f, f.name) }),
  invite: (phone: string, name?: string) => api<Store>(M, "/vendor/store/staff", { body: { phone, name } }),
};
