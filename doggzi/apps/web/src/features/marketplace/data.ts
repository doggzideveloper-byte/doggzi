import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PRODUCTS, VENDORS } from "@/content/marketplace";
import { isUnreachable } from "@/lib/api/client";
import { market, type MListing, type MVendor } from "@/lib/api/market";
import type { PetType } from "@/lib/api/petProfile";
import { createStore } from "@/lib/store";

const v0 = VENDORS[0];
export const FALLBACK_VENDOR: MVendor = { id: v0.id, name: v0.name, slug: v0.id, area: v0.area, story: null, since_year: null, delivery_fee_paise: v0.delivery_fee_paise, serviceable_pincodes: v0.serviceable_pincodes, is_doggzi: true };
/** DRAFT display distance per store (until stores have coordinates). */
export const distanceKm = (v: MVendor) => VENDORS.find((x) => x.id === v.slug || x.name === v.name)?.distance_km ?? null;
export const storeLine = (v: MVendor) => {
  const d = distanceKm(v);
  return d != null ? `${v.name} · ${d} km` : v.area ? `${v.name} · ${v.area}` : v.name;
};

const fallback = (): MListing[] =>
  PRODUCTS.map((p) => ({
    id: p.sku, sku: p.sku, name: p.name, brand: p.brand, category: p.category, pet_types: p.pet_type === "both" ? ["dog", "cat"] : [p.pet_type],
    description: null, pack_size: null, price_paise: p.price_paise, mrp_paise: p.mrp_paise, in_stock: p.stock_qty > 0, available_qty: p.stock_qty,
    photo_url: null, popularity_rank: p.popularity, vendor: FALLBACK_VENDOR,
  }));

/**
 * Both pet types are loaded (the page toggles dog/cat without a round trip). If the gateway is unreachable we
 * use the bundled seed and the checkout runs as a clearly-labelled local demo.
 */
export function useMarketCatalog() {
  const dog = useQuery({ queryKey: ["market", "dog"], queryFn: () => market.catalog("dog"), staleTime: 60_000, retry: (n, e) => !isUnreachable(e) && n < 1 });
  const cat = useQuery({ queryKey: ["market", "cat"], queryFn: () => market.catalog("cat"), staleTime: 60_000, retry: (n, e) => !isUnreachable(e) && n < 1 });
  const offline = (dog.isError && isUnreachable(dog.error)) || (cat.isError && isUnreachable(cat.error));
  const all = useMemo(() => {
    if (offline) return fallback();
    const m = new Map<string, MListing>();
    [...(dog.data?.items || []), ...(cat.data?.items || [])].forEach((i) => m.set(i.id, i));
    return [...m.values()];
  }, [offline, dog.data, cat.data]);
  const vendors = offline ? [FALLBACK_VENDOR] : dog.data?.vendors || [];
  const forPet = (t: PetType) => all.filter((i) => i.pet_types.includes(t));
  return {
    all, forPet, vendors, offline,
    loading: dog.isLoading || cat.isLoading,
    error: !offline && (dog.isError || cat.isError) ? (dog.error || cat.error) : null,
    refetch: () => { dog.refetch(); cat.refetch(); },
  };
}

export interface CartLine { listing_id: string; qty: number }
export const cartStore = createStore<CartLine[]>("dz.mcart", []);
const cartIdStore = createStore<string>("dz.mcartId", "");
export const cartId = () => {
  let id = cartIdStore.get();
  if (!id) {
    id = crypto.randomUUID?.() || "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (Math.random() * 16) >> (+c / 4)).toString(16));
    cartIdStore.set(id);
  }
  return id;
};

/** Local cart for instant UI; mirrored to the server cart (X-Cart-Id) whenever the backend is reachable. */
export function setQty(listingId: string, qty: number, online: boolean) {
  const q = Math.max(0, Math.min(10, qty));
  cartStore.set((c) => {
    const has = c.some((l) => l.listing_id === listingId);
    if (!q) return c.filter((l) => l.listing_id !== listingId);
    return has ? c.map((l) => (l.listing_id === listingId ? { ...l, qty: q } : l)) : [...c, { listing_id: listingId, qty: q }];
  });
  if (online) market.setItem(cartId(), listingId, q).catch(() => undefined);
}

/** Drop cart lines whose listing no longer exists (e.g. switching between demo and live data). */
export function usePruneCart(all: MListing[], ready: boolean) {
  useEffect(() => {
    if (!ready || !all.length) return;
    const ids = new Set(all.map((i) => i.id));
    const c = cartStore.get();
    if (c.some((l) => !ids.has(l.listing_id))) cartStore.set(c.filter((l) => ids.has(l.listing_id)));
  }, [all, ready]);
}

export const notifyStore = createStore<string[]>("dz.notify_stock", []);
export const demoOrders = createStore<unknown[]>("dz.orders.demo", []);
