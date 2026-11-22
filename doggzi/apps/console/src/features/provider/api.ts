import { api } from "@/lib/api";

export interface Service { name: string; scene: string }
export interface Pet { name: string; type: "dog" | "cat" | string; breed: string | null; note: string | null }
export interface Offer { id: string; booking_id: string; expires_at: string; seconds_left: number; ttl_seconds: number; earning_paise: number; services: Service[]; pet: Pet; slot_start: string; area: string }
export type Step = "accepted" | "travel" | "arrived" | "in_service" | "completed" | "done";
export interface Job {
  id: string; ref: string; step: Step; slot_start: string; slot_end: string; services: Service[]; pet: Pet; area: string; address: Record<string, string> | null;
  customer_phone: string; phone_visible: boolean; earning_paise: number; total_paise: number; pay_after_service: boolean; collected_mode: string | null;
  checklist: { label: string; done: boolean }[]; photos: Record<string, boolean>; code_locked: Record<string, boolean>; demo_codes: { start: string; end: string } | null;
}
export interface Profile { id: string; name: string; rating: number; jobs_done: number; is_online: boolean; skills: string[]; skill_options: { key: string; label: string }[]; areas: string[]; docs: { name: string; status: string }[]; help_whatsapp: string | null; demo: boolean }
export interface DayHours { on: boolean; from: number; to: number }
export interface Availability { weekly_hours: DayHours[]; days_off: string[] }
export interface Earnings { today_paise: number; week_paise: number; month_paise: number; jobs: { title: string; at: string; amount_paise: number }[]; payouts: { period_start: string; period_end: string; amount_paise: number; status: string }[] }

const B = "booking";
const file = (f: File) => { const fd = new FormData(); fd.append("file", f); return fd; };
export const provider = {
  me: () => api<Profile>(B, "/provider/me"),
  patch: (body: Partial<Pick<Profile, "is_online" | "skills" | "areas">>) => api<Profile>(B, "/provider/me", { method: "PATCH", body }),
  uploadDoc: (i: number, f: File) => api<Profile>(B, `/provider/me/docs/${i}`, { form: file(f) }),
  offers: () => api<Offer[]>(B, "/provider/offers"),
  accept: (id: string) => api<Job>(B, `/provider/offers/${id}/accept`, { method: "POST" }),
  decline: (id: string, reason: string) => api<null>(B, `/provider/offers/${id}/decline`, { body: { reason } }),
  demoOffer: () => api<Offer>(B, "/provider/demo/offer", { method: "POST" }),
  jobs: (date?: string) => api<Job[]>(B, `/provider/jobs${date ? `?date=${date}` : ""}`),
  step: (id: string, step: "travel" | "arrive" | "release") => api<Job>(B, `/provider/jobs/${id}/${step}`, { method: "POST" }),
  code: (id: string, which: "start" | "complete", code: string) => api<Job>(B, `/provider/jobs/${id}/${which}`, { body: { code } }),
  checklist: (id: string, done: boolean[]) => api<Job>(B, `/provider/jobs/${id}/checklist`, { body: { done } }),
  photo: (id: string, which: "before" | "after", f: File) => api<Job>(B, `/provider/jobs/${id}/photos?which=${which}`, { form: file(f) }),
  collect: (id: string, mode: "UPI" | "Cash") => api<Job>(B, `/provider/jobs/${id}/collect`, { body: { mode } }),
  availability: () => api<Availability>(B, "/provider/availability"),
  setAvailability: (a: Availability) => api<Availability>(B, "/provider/availability", { method: "PUT", body: a }),
  earnings: () => api<Earnings>(B, "/provider/earnings"),
};
