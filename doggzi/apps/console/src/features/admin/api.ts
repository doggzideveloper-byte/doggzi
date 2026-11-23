import { api, download } from "@/lib/api";

/** Admin panel API (services/admin through the gateway). OPS receives masked phones from the server. */
export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "month" | "lastmonth" | "custom";
export interface Range { key: RangeKey; from?: string; to?: string }
export interface Live { total: number; pages: { label: string; n: number }[]; mobile: number; desktop: number }
export interface Kpi { key: "bookings" | "orders" | "gmv_paise" | "aov_paise" | "passports"; cur: number; prev: number }
export interface OverdueItem { id: string; ref: string; module: "bookings" | "orders"; title: string; sub: string; slot_start: string | null }
export interface Overview {
  range: { key: RangeKey; from: string; to: string; prev_from: string; prev_to: string; days: number; text: string; prev_text: string };
  kpis: Kpi[]; booking_bars: { label: string; n: number }[]; order_bars: { label: string; n: number }[]; funnel: { label: string; n: number }[];
  overdue: OverdueItem[]; applications: { name: string; kind: string; at: string }[]; live: Live;
}
export interface Me { user_id: string; name: string; role: "ADMIN" | "OPS"; roles: string[]; is_admin: boolean }

export type Col = "requested" | "offered" | "accepted" | "enroute" | "inprogress" | "completed" | "cancelled";
export interface Pet { name: string; type: "dog" | "cat"; breed: string | null }
export interface BookingCard {
  id: string; ref: string; column: Col; status: string; job_step: string | null; dispatch_status: string; pet: Pet; services: string[]; total_paise: number;
  slot_start: string; slot_end: string; area: string; pincode: string; provider: { id: string; name: string } | null; offer_expires_at: string | null;
  customer_phone: string; user_id: string; pay: string; overdue: boolean; created_at: string; before?: Col; before_provider?: { id: string; name: string } | null;
}
export interface SubOrder {
  id: string; ref: string; order_id: string; order_ref: string; status: string; status_label: string; reject_reason: string | null; user_id: string; customer_phone: string;
  pet: Pet | null; area: string; vendor_id: string; vendor: string; subtotal_paise: number; delivery_fee_paise: number; total_paise: number; payment_mode: string;
  items: { name: string; sku: string; qty: number; price_paise: number }[]; placed_at: string; sla_due_at: string | null; accepted_at: string | null; deliver_by: string | null;
  payout_status: string; refund_status: string; refunded_paise: number | null; before?: string;
}
export interface CustomerRow { user_id: string; name: string; phone: string; area: string; pincode: string; pets: (Pet & { id: string })[]; bookings: number; orders: number; since?: string }
export interface Customer extends Omit<CustomerRow, "bookings" | "orders"> { bookings: BookingCard[]; orders: SubOrder[]; notes: { at: string; by: string; body: string }[] }
export interface Vendor {
  id: string; name: string; slug: string; stage: "applied" | "docs" | "razorpay" | "live"; stage_label: string; paused: boolean; area: string | null; phone: string; is_doggzi: boolean;
  commission_pct: number; pincodes: string[]; accept_rate: number | null; avg_pack_minutes: number | null; cancellations_month: number; listings: number; created_at: string;
}
export interface Provider {
  id: string; name: string; phone: string; stage: "applied" | "idcheck" | "skills" | "areas" | "training" | "live"; stage_label: string; paused: boolean; is_online: boolean;
  rating: number; jobs_done: number; skills: string[]; skill_labels: string[]; areas: string[]; owed_paise: number; created_at: string;
}
export interface ServiceItem { id: string; slug: string; group: string; name: string; price_paise: number | null; price_mode: string; cats: boolean; is_active: boolean; includes: string[] }
export interface Product {
  id: string; name: string; brand: string; brand_as_listed: string | null; category: string; pet_types: string[]; flags: string[]; is_blocked: boolean; brand_confirmed: boolean;
  sku: string | null; price_paise: number | null; mrp_paise: number | null; stores: string[];
}
export interface Approvals {
  photos: { listing_id: string; sku: string; product: string; vendor: string; meta: { name?: string; size?: number } | null; at: string }[];
  requests: { id: string; name: string; brand: string | null; category: string | null; price_paise: number | null; vendor: string | null; at: string }[];
}
export interface Payments {
  payments: { id: string; order_ref: string; amount_paise: number; method: string; status: string; at: string }[];
  refunds: { ref: string; order_ref: string; amount_paise: number; status: string; at: string | null }[];
  route: { ref: string; vendor: string; amount_paise: number; status: string }[];
  recon: { ref: string; expected_paise: number; captured_paise: number; difference_paise: number }[];
  payouts: { provider_id: string; name: string; jobs_done: number; owed_paise: number }[];
  payout_history: { id: string; provider: string; period_start: string; period_end: string; amount_paise: number; status: string; paid_at: string | null }[];
  collected: { ref: string; amount_paise: number; mode: string; at: string | null }[];
}
export interface ContentItem { id: string; kind: "faq" | "testimonial" | "video"; page: string | null; status: "draft" | "live"; consent: boolean; data: Record<string, string>; updated_at: string }
export interface Content {
  faq_sets: { page: string; count: number; live: number; status: "draft" | "live" }[]; faqs: ContentItem[]; testimonials: ContentItem[]; videos: ContentItem[];
  config: { whatsapp: string; phone: string; email: string; fssai: string; delivery_areas: string; cats_supported: boolean };
}
export interface Member { user_id: string; name: string | null; phone: string; roles: string[]; since: string }
export interface AuditRow { id: string; at: string; who: string; role: string; module: string; what: string; target: string | null; before: string | null; after: string | null }
export interface Listing { id: string; sku: string; name: string; price_paise: number; stock_qty: number }

const A = (path: string, opts?: Parameters<typeof api>[2]) => api<never>("admin", path, opts);
const get = <T,>(p: string) => api<T>("admin", p);
const post = <T,>(p: string, body: unknown = {}) => api<T>("admin", p, { method: "POST", body });
const patch = <T,>(p: string, body: unknown) => api<T>("admin", p, { method: "PATCH", body });

export const adm = {
  me: () => get<Me>("/me"),
  overview: (r: Range) => get<Overview>(`/overview?range=${r.key}${r.key === "custom" && r.from && r.to ? `&from=${r.from}&to=${r.to}` : ""}`),
  live: () => get<Live>("/live"),
  bookings: () => get<BookingCard[]>("/bookings"),
  move: (id: string, to: Col, undo = false) => post<BookingCard>(`/bookings/${id}/move`, { to, undo }),
  reassign: (id: string, provider_id: string) => post<BookingCard>(`/bookings/${id}/reassign`, { provider_id }),
  newBooking: (b: Record<string, unknown>) => post<BookingCard>("/bookings", b),
  orders: () => get<SubOrder[]>("/orders"),
  soCancel: (id: string) => post<SubOrder>(`/orders/${id}/cancel`),
  soUncancel: (id: string, to: string) => post<SubOrder>(`/orders/${id}/uncancel?to=${to}`),
  soRefund: (id: string) => post<SubOrder>(`/orders/${id}/refund`),
  soNudge: (id: string) => post<SubOrder>(`/orders/${id}/nudge`),
  soReassign: (id: string, vendor_id: string) => post<SubOrder>(`/orders/${id}/reassign`, { vendor_id }),
  newOrder: (b: Record<string, unknown>) => post<SubOrder>("/orders", b),
  listings: (vendor_id: string) => get<Listing[]>(`/orders/listings?vendor_id=${vendor_id}`),
  customers: () => get<CustomerRow[]>("/customers"),
  customer: (id: string) => get<Customer>(`/customers/${id}`),
  addCustomer: (b: Record<string, unknown>) => post<CustomerRow>("/customers", b),
  addPet: (id: string, b: Record<string, unknown>) => post<Pet & { id: string }>(`/customers/${id}/pets`, b),
  addNote: (id: string, body: string) => post<{ at: string; by: string; body: string }>(`/customers/${id}/notes`, { body }),
  vendors: () => get<Vendor[]>("/vendors"),
  addVendor: (b: Record<string, unknown>) => post<Vendor>("/vendors", b),
  patchVendor: (id: string, b: Record<string, unknown>) => patch<Vendor>(`/vendors/${id}`, b),
  providers: () => get<Provider[]>("/providers"),
  addProvider: (b: Record<string, unknown>) => post<Provider>("/providers", b),
  patchProvider: (id: string, b: Record<string, unknown>) => patch<Provider>(`/providers/${id}`, b),
  services: () => get<ServiceItem[]>("/catalog/services"),
  patchService: (id: string, b: Record<string, unknown>) => patch<ServiceItem>(`/catalog/services/${id}`, b),
  addService: (b: Record<string, unknown>) => post<ServiceItem>("/catalog/services", b),
  products: () => get<Product[]>("/catalog/products"),
  patchProduct: (id: string, b: Record<string, unknown>) => patch<Product>(`/catalog/products/${id}`, b),
  addProduct: (b: Record<string, unknown>) => post<Product>("/catalog/products", b),
  approvals: () => get<Approvals>("/catalog/approvals"),
  decidePhoto: (id: string, approve: boolean) => post(`/catalog/approvals/photos/${id}`, { approve }),
  decideRequest: (id: string, approve: boolean) => post(`/catalog/approvals/requests/${id}`, { approve }),
  payments: () => get<Payments>("/payments"),
  content: () => get<Content>("/content"),
  addContent: (b: Record<string, unknown>) => post<ContentItem>("/content", b),
  patchContent: (id: string, b: Record<string, unknown>) => patch<ContentItem>(`/content/${id}`, b),
  faqSet: (page: string, status: "draft" | "live") => post(`/content/faqs/${encodeURIComponent(page)}`, { status }),
  saveConfig: (b: Content["config"]) => api<Content["config"]>("admin", "/site-config", { method: "PUT", body: b }),
  team: () => get<Member[]>("/team"),
  invite: (b: Record<string, unknown>) => post("/team", b),
  removeMember: (id: string) => A(`/team/${id}`, { method: "DELETE" }),
  audit: () => get<AuditRow[]>("/audit"),
  exportCsv: (name: string) => download("admin", `/export/${name}.csv`, `doggzi-${name}.csv`),
};
