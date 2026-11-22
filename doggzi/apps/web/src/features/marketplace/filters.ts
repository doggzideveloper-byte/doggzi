import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CATEGORIES, type Category } from "@/content/marketplace";
import type { MBrowse, MListing } from "@/lib/api/market";

/** PAGE_05 section 4b. The URL is the single source of truth, so a filtered page can be shared. */
export type PetFilter = "dog" | "cat" | "both";
export type Sort = "popular" | "price_asc" | "new";
export interface Filters { cat: Category | null; price: string[]; brand: string[]; pet: PetFilter; stock: boolean; q: string; sort: Sort }

export const PRICE_BUCKETS = [
  { key: "under-250", label: "Under ₹250", lo: 0, hi: 25_000 },
  { key: "250-500", label: "₹250–₹500", lo: 25_000, hi: 50_000 },
  { key: "500-1000", label: "₹500–₹1,000", lo: 50_000, hi: 100_000 },
  { key: "1000-plus", label: "₹1,000+", lo: 100_000, hi: Infinity },
] as const;
export const PETS: { key: PetFilter; label: string }[] = [{ key: "dog", label: "Dog" }, { key: "cat", label: "Cat" }, { key: "both", label: "Both" }];
export const SORTS: { key: Sort; label: string }[] = [{ key: "popular", label: "Popular" }, { key: "price_asc", label: "Price: low to high" }, { key: "new", label: "New" }];

const CAT_KEYS = new Set<string>(CATEGORIES.map((c) => c.key));
const PRICE_KEYS = new Set<string>(PRICE_BUCKETS.map((p) => p.key));
const list = (v: string | null, ok?: Set<string>) => [...new Set((v || "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => x && (!ok || ok.has(x))))];

/** `petDefault` is the passport's pet: the page opens on it, and the URL only carries `pet` when it differs. */
export function useFilters(petDefault: "dog" | "cat") {
  const [sp, setSp] = useSearchParams();
  const f: Filters = useMemo(() => {
    const cat = sp.get("cat");
    const pet = sp.get("pet");
    const sort = sp.get("sort");
    return {
      cat: cat && CAT_KEYS.has(cat) ? (cat as Category) : null,
      price: list(sp.get("price"), PRICE_KEYS),
      brand: list(sp.get("brand")),
      pet: pet === "dog" || pet === "cat" || pet === "both" ? pet : petDefault,
      stock: sp.get("stock") === "1",
      q: sp.get("q") || "",
      sort: sort === "price_asc" || sort === "new" ? sort : "popular",
    };
  }, [sp, petDefault]);
  const set = useCallback((patch: Partial<Filters>) => {
    setSp((cur) => {
      const n = { ...f, ...patch };
      const out = new URLSearchParams(cur);
      const put = (k: string, v: string | null | false) => (v ? out.set(k, v) : out.delete(k));
      put("cat", n.cat);
      put("price", n.price.join(","));
      put("brand", n.brand.join(","));
      put("pet", n.pet !== petDefault && n.pet);
      put("stock", n.stock && "1");
      put("q", n.q.trim() && n.q);
      put("sort", n.sort !== "popular" && n.sort);
      return out;
    }, { replace: true, preventScrollReset: true });
  }, [f, setSp, petDefault]);
  const clear = useCallback(() => set({ cat: null, price: [], brand: [], pet: petDefault, stock: false, q: "" }), [set, petDefault]);
  /** Active filters for the badge and chips (sort and search are not "filters"). */
  const active = (f.cat ? 1 : 0) + f.price.length + f.brand.length + (f.pet !== petDefault ? 1 : 0) + (f.stock ? 1 : 0);
  return { f, set, clear, active };
}

export const toQuery = (f: Filters) => {
  const p = new URLSearchParams({ pet: f.pet, sort: f.sort });
  if (f.cat) p.set("cat", f.cat);
  if (f.price.length) p.set("price", [...f.price].sort().join(","));
  if (f.brand.length) p.set("brand", [...f.brand].sort().join(","));
  if (f.stock) p.set("in_stock", "true");
  if (f.q.trim()) p.set("q", f.q.trim());
  return p.toString();
};

// ---- Offline demo only: the same rules as services/market app/core/facets.py, over the bundled seed ----
const squash = (b: string) => b.toLowerCase().replace(/[^a-z0-9]+/g, "");
export const brandKey = (b: string) => (/^superfun/.test(squash(b)) ? "superfun" : squash(b) || "unbranded");
const brandLabel = (b: string) => (/^superfun/.test(squash(b)) ? "Super Fun" : b.split(/\s+/).filter(Boolean).join(" ") || "Unbranded");
const bucket = (p: number) => PRICE_BUCKETS.find((b) => p >= b.lo && p < b.hi)!.key;

export function browseLocal(all: MListing[], f: Filters): MBrowse {
  const q = f.q.trim().toLowerCase();
  const tests: Record<string, (x: MListing) => boolean> = {
    pet: (x) => f.pet === "both" || x.pet_types.includes(f.pet),
    cat: (x) => !f.cat || x.category === f.cat,
    price: (x) => !f.price.length || f.price.includes(bucket(x.price_paise)),
    brand: (x) => !f.brand.length || f.brand.includes(brandKey(x.brand)),
    stock: (x) => !f.stock || x.in_stock,
    q: (x) => !q || `${x.name} ${x.brand} ${brandLabel(x.brand)}`.toLowerCase().includes(q),
  };
  const except = (skip: string) => all.filter((x) => Object.entries(tests).every(([k, t]) => k === skip || t(x)));
  const items = except("").sort(f.sort === "price_asc" ? (a, b) => a.price_paise - b.price_paise || a.popularity_rank - b.popularity_rank : f.sort === "new" ? (a, b) => b.popularity_rank - a.popularity_rank : (a, b) => a.popularity_rank - b.popularity_rank)
    .map((x) => ({ ...x, brand: brandLabel(x.brand), brand_key: brandKey(x.brand) }));
  const byCat = except("cat"), byPrice = except("price"), byPet = except("pet"), byBrand = except("brand");
  const labels = new Map<string, Map<string, number>>();
  all.forEach((x) => { const k = brandKey(x.brand), m = labels.get(k) || new Map(); m.set(brandLabel(x.brand), (m.get(brandLabel(x.brand)) || 0) + 1); labels.set(k, m); });
  const label = (k: string) => [...(labels.get(k) || new Map([[k, 0]])).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const bc = new Map<string, number>();
  byBrand.forEach((x) => bc.set(brandKey(x.brand), (bc.get(brandKey(x.brand)) || 0) + 1));
  f.brand.forEach((k) => bc.has(k) || bc.set(k, 0));
  return {
    items, total: items.length,
    facets: {
      category: [{ key: "all", label: "All", count: byCat.length }, ...CATEGORIES.map((c) => ({ key: c.key, label: c.label, count: byCat.filter((x) => x.category === c.key).length }))],
      price: PRICE_BUCKETS.map((b) => ({ key: b.key, label: b.label, count: byPrice.filter((x) => bucket(x.price_paise) === b.key).length })),
      brand: [...bc.entries()].map(([key, count]) => ({ key, label: label(key), count })).sort((a, b) => b.count - a.count || a.label.toLowerCase().localeCompare(b.label.toLowerCase())),
      pet: PETS.map((p) => ({ key: p.key, label: p.label, count: p.key === "both" ? byPet.length : byPet.filter((x) => x.pet_types.includes(p.key as "dog" | "cat")).length })),
      in_stock: except("stock").filter((x) => x.in_stock).length,
    },
  };
}
