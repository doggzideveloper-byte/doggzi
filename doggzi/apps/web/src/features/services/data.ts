import { useQuery } from "@tanstack/react-query";
import { CATALOG, SERVICES_BY_PET_TYPE, SLOT_TIMES } from "@/content/services";
import { isUnreachable } from "@/lib/api/client";
import { booking, type ItemGroup, type PriceMode } from "@/lib/api/booking";
import type { PetType } from "@/lib/api/petProfile";
import { istYmd } from "@/lib/format";

export interface Item { slug: string; group: ItemGroup; name: string; price_paise: number | null; price_mode: PriceMode; scene: string }

const fallback = (t: PetType): Item[] => {
  const allowed = new Set(SERVICES_BY_PET_TYPE[t]);
  return CATALOG.filter((i) => allowed.has(i.id)).map((i) => ({ slug: i.id, group: i.group, name: i.name, price_paise: i.price_paise, price_mode: i.price_mode, scene: i.scene }));
};

/**
 * Catalog from the booking service (prices recomputed server-side at booking time).
 * If the gateway is unreachable we fall back to the bundled catalog and run the flow as a local demo.
 */
export function useCatalog(type: PetType) {
  const q = useQuery({
    queryKey: ["catalog", type],
    staleTime: 10 * 60_000,
    retry: (n, e) => !isUnreachable(e) && n < 1,
    queryFn: () => booking.catalog(type),
  });
  const offline = q.isError && isUnreachable(q.error);
  const items: Item[] = q.data
    ? q.data.items.map((i) => ({ slug: i.slug, group: i.group, name: i.name, price_paise: i.price_paise, price_mode: i.price_mode, scene: i.scene_key }))
    : q.isError ? fallback(type) : [];
  return { items, loading: q.isLoading, offline, error: q.isError && !offline ? q.error : null, refetch: q.refetch };
}

export interface SlotView { id: string; time: string; label: string; available: boolean }
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const istNowMin = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return +p.hour * 60 + +p.minute;
};
const timeLabel = (hhmm: string) => {
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, hh, mm).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
};
const istHHMM = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

/** Slots for an IST date. Same-day slots less than 2h away are always closed. */
export function useSlots(date: string | null, offline: boolean) {
  return useQuery({
    queryKey: ["slots", date, offline],
    enabled: !!date,
    staleTime: 30_000,
    queryFn: async (): Promise<SlotView[]> => {
      const today = istYmd(new Date()), now = istNowMin();
      const soon = (hhmm: string) => {
        const [h, m] = hhmm.split(":").map(Number);
        return date === today && h * 60 + m < now + 120;
      };
      if (offline) {
        // Demo availability (mirrors the prototype): ~1 in 5 slots shown as full.
        return SLOT_TIMES.map((t) => ({ id: `demo-${date}-${t}`, time: t, label: timeLabel(t), available: !soon(t) && hash(date + t) % 5 !== 0 }));
      }
      const slots = await booking.slots(date!);
      return slots.map((s) => {
        const t = istHHMM(s.starts_at);
        return { id: s.id, time: t, label: timeLabel(t), available: s.available && !soon(t) };
      });
    },
  });
}
