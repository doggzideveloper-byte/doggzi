import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { inr, istYmd } from "@/lib/format";
import { adm, type BookingCard, type ContentItem, type CustomerRow, type Product, type Provider, type ServiceItem, type SubOrder, type Vendor } from "./api";
import { MONEY, PHONE, PIN, PINS, type FormDef } from "./kit";

/** Every "+ Add" drawer (Revision 1). Each one validates on the client, the server validates again, and every save is audited. */
const SLOTS = ["09:00", "10:30", "12:00", "14:00", "15:30", "17:00", "18:30"];
const slotLabel = (t: string) => new Date(2000, 0, 1, +t.slice(0, 2), +t.slice(3)).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
const pins = (v: unknown) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
const PAGES: [string, string][] = ["Explore", "Fresh Food", "Services", "Marketplace"].map((p) => [p, p]);
interface CatalogItem { slug: string; name: string; price_paise: number | null; price_mode: string }

async function customersFor(qc: QueryClient): Promise<CustomerRow[]> {
  return qc.fetchQuery({ queryKey: ["ad", "customers"], queryFn: adm.customers, staleTime: 30_000 });
}
const custOpts = (cs: CustomerRow[]): [string, string][] => [["", "Choose a customer"], ...cs.map((c) => [c.user_id, `${c.name} · ${c.phone}`] as [string, string])];
const fromCustomer = (cs: CustomerRow[]) => (key: string, v: Record<string, unknown>) => {
  if (key !== "customer") return;
  const c = cs.find((x) => x.user_id === v.customer);
  return { pet: c?.pets[0]?.id || "", area: c?.area || "", pincode: c?.pincode || "" };
};

export const forms = {
  async booking(qc: QueryClient, done: (b: BookingCard) => void): Promise<FormDef> {
    const [cs, provs, dog, cat] = await Promise.all([
      customersFor(qc), qc.fetchQuery({ queryKey: ["ad", "providers"], queryFn: adm.providers, staleTime: 60_000 }),
      api<{ items: CatalogItem[] }>("booking", "/catalog?pet_type=dog"), api<{ items: CatalogItem[] }>("booking", "/catalog?pet_type=cat"),
    ]);
    const bookable = (xs: CatalogItem[]) => xs.filter((i) => i.price_mode === "fixed" && i.price_paise).map((i) => [i.slug, `${i.name} · ${inr(i.price_paise!)}`] as [string, string]);
    const petOf = (v: Record<string, unknown>) => cs.find((c) => c.user_id === v.customer)?.pets.find((p) => p.id === v.pet);
    return {
      title: "New booking", cta: "Create booking", initial: { date: istYmd(), time: "10:30", provider: "", service: "full-package" }, onChange: fromCustomer(cs),
      fields: [
        { key: "customer", label: "Customer", kind: "select", req: true, options: custOpts(cs) },
        { key: "pet", label: "Pet", kind: "select", req: true, help: "Pick the customer first. Add a pet from their customer card.",
          options: (v) => [["", "Choose a pet"], ...(cs.find((c) => c.user_id === v.customer)?.pets || []).map((p) => [p.id, `${p.name} · ${p.breed || p.type}`] as [string, string])] },
        { key: "service", label: "Service", kind: "select", req: true, options: (v) => bookable((petOf(v)?.type === "cat" ? cat : dog).items),
          check: (val, v) => (bookable((petOf(v)?.type === "cat" ? cat : dog).items).some(([k]) => k === val) ? undefined : "This service isn't offered for this pet.") },
        { key: "date", label: "Date (IST)", kind: "date", req: true, check: (val) => (String(val) < istYmd() ? "Date can't be in the past." : undefined) },
        { key: "time", label: "Time (IST)", kind: "select", req: true, options: SLOTS.map((t) => [t, slotLabel(t)]) },
        { key: "area", label: "Area", req: true, ph: "e.g. Sector 56, Gurgaon" },
        { key: "pincode", label: "Pincode", kind: "number", req: true, check: PIN },
        { key: "provider", label: "Provider", kind: "select", options: [["", "Unassigned (dispatch will offer it)"], ...provs.filter((p) => p.stage === "live" && !p.paused).map((p) => [p.id, `${p.name} · ${p.rating}`] as [string, string])] },
      ],
      save: async (v) => {
        const b = await adm.newBooking({ user_id: v.customer, pet_id: v.pet, item_slug: v.service, date: v.date, time: v.time, area: v.area, pincode: v.pincode, provider_id: v.provider || null });
        done(b);
        qc.invalidateQueries({ queryKey: ["ad", "customers"] });
        return `${b.ref} created${b.provider ? ` and offered to ${b.provider.name}` : ""}.`;
      },
    };
  },

  async order(qc: QueryClient, done: (o: SubOrder) => void): Promise<FormDef> {
    const [cs, vendors] = await Promise.all([customersFor(qc), qc.fetchQuery({ queryKey: ["ad", "vendors"], queryFn: adm.vendors, staleTime: 60_000 })]);
    const live = vendors.filter((v) => v.stage === "live" && !v.paused);
    const listings = Object.fromEntries(await Promise.all(live.map(async (v) => [v.id, await adm.listings(v.id)] as const)));
    return {
      title: "New order", cta: "Create order", initial: { vendor: live[0]?.id || "", qty: "1" }, onChange: (k, v) => (k === "vendor" ? { product: "" } : fromCustomer(cs)(k, v)),
      fields: [
        { key: "customer", label: "Customer", kind: "select", req: true, options: custOpts(cs) },
        { key: "vendor", label: "Store", kind: "select", req: true, options: live.map((v) => [v.id, v.name]) },
        { key: "product", label: "Product", kind: "select", req: true, options: (v) => [["", "Choose a product"], ...(listings[String(v.vendor)] || []).map((l) => [l.id, `${l.name} · ${inr(l.price_paise)} · ${l.stock_qty} in stock`] as [string, string])] },
        { key: "qty", label: "Quantity", kind: "number", req: true, check: (q) => (+String(q) < 1 || +String(q) > 20 ? "Quantity must be 1–20." : undefined) },
        { key: "area", label: "Delivery area", req: true, ph: "e.g. Sector 56, Gurgaon" },
        { key: "pincode", label: "Pincode", kind: "number", req: true, check: PIN },
      ],
      save: async (v) => {
        const o = await adm.newOrder({ user_id: v.customer, listing_id: v.product, qty: +String(v.qty), area: v.area, pincode: v.pincode });
        done(o);
        return `${o.ref} created for ${inr(o.total_paise)} (pay on delivery). ${o.vendor} has been told.`;
      },
    };
  },

  service(done: (x: ServiceItem) => void): FormDef {
    return {
      title: "Add service", initial: { group: "spa" },
      fields: [
        { key: "name", label: "Service name", req: true },
        { key: "group", label: "Group", kind: "select", req: true, options: [["spa", "Spa"], ["training", "Training"], ["boarding", "Boarding"], ["pickup", "Pickup"]] },
        { key: "price", label: "Price (₹)", kind: "number", req: true, check: MONEY },
        { key: "cat", label: "Available for cats", kind: "check" },
      ],
      save: async (v) => { const x = await adm.addService({ name: v.name, group: v.group, price_paise: +String(v.price) * 100, cats: !!v.cat }); done(x); return `${x.name} added.`; },
    };
  },

  package(done: (x: ServiceItem) => void): FormDef {
    return {
      title: "Add package",
      fields: [
        { key: "name", label: "Package name", req: true },
        { key: "price", label: "Price (₹)", kind: "number", req: true, check: MONEY },
        { key: "includes", label: "What's included", kind: "area", req: true, ph: "Bath & blow dry, Full body hair trim", help: "Names of existing services, separated by commas. At least two.",
          check: (val) => (pins(val).length < 2 ? "A package needs at least two items." : undefined) },
        { key: "cat", label: "Available for cats", kind: "check" },
      ],
      save: async (v) => { const x = await adm.addService({ name: v.name, group: "package", price_paise: +String(v.price) * 100, cats: !!v.cat, includes: pins(v.includes) }); done(x); return `${x.name} added.`; },
    };
  },

  product(done: (x: Product) => void): FormDef {
    return {
      title: "Add product", initial: { category: "treats", pet_type: "dog" },
      fields: [
        { key: "name", label: "Product name", req: true }, { key: "brand", label: "Brand", req: true },
        { key: "category", label: "Category", kind: "select", req: true, options: [["treats", "Treats"], ["toys", "Toys"], ["grooming", "Grooming & hygiene"], ["walking", "Walking gear"], ["health", "Health & supplements"]] },
        { key: "pet_type", label: "For", kind: "select", req: true, options: [["dog", "Dogs"], ["cat", "Cats"], ["both", "Dogs & cats"]] },
        { key: "price", label: "Doggzi price (₹)", kind: "number", req: true, check: MONEY },
        { key: "mrp", label: "MRP (₹)", kind: "number", help: "Printed on the pack. Must be at least the price.", check: (m, v) => (v.price && +String(m) < +String(v.price) ? "MRP can't be lower than the price." : undefined) },
      ],
      save: async (v) => {
        const x = await adm.addProduct({ name: v.name, brand: v.brand, category: v.category, pet_type: v.pet_type, price_paise: +String(v.price) * 100, mrp_paise: v.mrp ? +String(v.mrp) * 100 : null });
        done(x);
        return `${x.name} added to Doggzi Store (${x.sku}).`;
      },
    };
  },

  vendor(done: (x: Vendor) => void): FormDef {
    return {
      title: "Add vendor", initial: { commission: "12" },
      fields: [
        { key: "name", label: "Shop name", req: true }, { key: "area", label: "Area", req: true }, { key: "phone", label: "Owner phone", kind: "tel", req: true, check: PHONE },
        { key: "commission", label: "Commission (%)", kind: "number", req: true, check: (c) => (+String(c) > 40 ? "Commission must be 0–40%." : undefined) },
        { key: "pins", label: "Delivery pincodes", ph: "122001, 122002", req: true, check: PINS },
      ],
      save: async (v) => { const x = await adm.addVendor({ name: v.name, area: v.area, phone: v.phone, commission_pct: +String(v.commission), pincodes: pins(v.pins) }); done(x); return `${x.name} added to Applied.`; },
    };
  },

  vendorTerms(x: Vendor, done: (x: Vendor) => void): FormDef {
    return {
      title: `${x.name} terms`, cta: "Save terms", initial: { commission: String(x.commission_pct), pins: x.pincodes.join(", ") },
      fields: [
        { key: "commission", label: "Commission (%)", kind: "number", req: true, check: (c) => (+String(c) > 40 ? "Commission must be 0–40%." : undefined) },
        { key: "pins", label: "Delivery pincodes", req: true, check: PINS },
      ],
      save: async (v) => { const r = await adm.patchVendor(x.id, { commission_pct: +String(v.commission), pincodes: pins(v.pins) }); done(r); return `${x.name} terms saved.`; },
    };
  },

  provider(done: (x: Provider) => void): FormDef {
    return {
      title: "Add provider",
      fields: [
        { key: "name", label: "Full name", req: true }, { key: "phone", label: "Phone", kind: "tel", req: true, check: PHONE },
        { key: "skills", label: "Skills", ph: "Bath, Blow dry, Trim", req: true, help: "Bath, Blow dry, Trim, Styling, Dental, Massage, De-matting, Training, Boarding" },
        { key: "pins", label: "Areas (pincodes)", ph: "122011, 122018", req: true, check: PINS },
      ],
      save: async (v) => { const x = await adm.addProvider({ name: v.name, phone: v.phone, skills: pins(v.skills), areas: pins(v.pins) }); done(x); return `${x.name} added to Applied.`; },
    };
  },

  customer(done: (c: CustomerRow) => void): FormDef {
    return {
      title: "Add customer",
      fields: [
        { key: "name", label: "Name", req: true }, { key: "phone", label: "Phone", kind: "tel", req: true, check: PHONE },
        { key: "area", label: "Area", req: true, ph: "e.g. Sector 56, Gurgaon" }, { key: "pin", label: "Pincode", kind: "number", req: true, check: PIN },
      ],
      save: async (v) => { const c = await adm.addCustomer({ name: v.name, phone: v.phone, area: v.area, pincode: v.pin }); done(c); return `${c.name} added.`; },
    };
  },

  pet(customerId: string, name: string, done: () => void): FormDef {
    return {
      title: "Add pet", initial: { type: "dog" },
      fields: [
        { key: "name", label: "Pet's name", req: true, check: (n) => (String(n).length > 24 ? "At most 24 characters." : undefined) },
        { key: "type", label: "Type", kind: "select", req: true, options: [["dog", "Dog"], ["cat", "Cat"]] },
        { key: "breed", label: "Breed", req: true, ph: "e.g. Indie / Desi, Persian" },
      ],
      save: async (v) => { const p = await adm.addPet(customerId, { name: v.name, type: v.type, breed: v.breed }); done(); return `${p.name} added to ${name}.`; },
    };
  },

  faq(done: (x: ContentItem) => void): FormDef {
    return {
      title: "Add FAQ", cta: "Publish", draftable: true, initial: { page: "Explore" },
      fields: [
        { key: "page", label: "Page", kind: "select", req: true, options: PAGES },
        { key: "q", label: "Question", req: true, check: (q) => (String(q).trim().length < 5 ? "A little longer, please." : undefined) },
        { key: "a", label: "Answer", kind: "area", req: true },
      ],
      save: async (v, draft) => {
        let x = await adm.addContent({ kind: "faq", page: v.page, q: v.q, a: v.a });
        if (!draft) x = await adm.patchContent(x.id, { status: "live" });
        done(x);
        return draft ? `FAQ added to ${v.page} as a draft.` : `FAQ added to ${v.page} and live.`;
      },
    };
  },

  testimonial(done: (x: ContentItem) => void): FormDef {
    return {
      title: "Add testimonial", cta: "Publish", draftable: true, initial: { service: "" },
      fields: [
        { key: "pet", label: "Pet's name", req: true }, { key: "parent", label: "Pet parent", req: true },
        { key: "service", label: "Service", kind: "select", req: true, options: [["", "Choose"], ...["Fresh Food", "Grooming", "Spa day", "Marketplace", "Training"].map((x) => [x, x] as [string, string])] },
        { key: "quote", label: "Quote", kind: "area", req: true, check: (q) => (String(q).trim().length < 10 ? "A little longer, please." : undefined) },
        { key: "consent", label: "Customer consent recorded", kind: "check", req: true, help: "Required. You must have written permission to publish this." },
      ],
      save: async (v, draft) => {
        if (!v.consent) throw new Error("Customer consent must be recorded");
        let x = await adm.addContent({ kind: "testimonial", pet: v.pet, parent: v.parent, service: v.service, quote: v.quote, consent: true });
        if (!draft) x = await adm.patchContent(x.id, { status: "live" });
        done(x);
        return draft ? "Testimonial added as a draft." : "Testimonial added and live.";
      },
    };
  },

  video(done: (x: ContentItem) => void): FormDef {
    return {
      title: "Add video", initial: { page: "Explore" },
      fields: [
        { key: "url", label: "YouTube Shorts link or ID", req: true, ph: "https://youtube.com/shorts/…",
          check: (u) => (/(?:shorts\/|v=|youtu\.be\/)[\w-]{11}/.test(String(u)) || /^[\w-]{11}$/.test(String(u).trim()) ? undefined : "That doesn't look like a YouTube link or 11-character ID.") },
        { key: "page", label: "Show on", kind: "select", req: true, options: PAGES },
      ],
      save: async (v) => { const x = await adm.addContent({ kind: "video", url: v.url, page: v.page }); done(x); return "Video added."; },
    };
  },

  member(done: () => void): FormDef {
    return {
      title: "Invite member", cta: "Send invite", initial: { role: "OPS" },
      fields: [
        { key: "name", label: "Name", req: true }, { key: "phone", label: "Phone", kind: "tel", req: true, check: PHONE },
        { key: "role", label: "Role", kind: "select", req: true, options: ["OPS", "ADMIN", "VENDOR", "PROVIDER"].map((r) => [r, r]),
          help: "Vendors and providers also need a store or provider profile (Vendors / Providers) to use their panel." },
      ],
      save: async (v) => { await adm.invite({ name: v.name, phone: v.phone, role: v.role }); done(); return `Invite sent to ${v.name} on WhatsApp.`; },
    };
  },
};
