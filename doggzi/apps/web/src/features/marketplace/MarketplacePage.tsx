import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Badge, FAQ, Header, Loading, Skeleton, SkeletonCard, PassportChip, SiteFooter, Sweep, Testimonials, useSectionReveals } from "@/design-system/components";
import { css, ms } from "@/design-system/motion";
import { CATEGORIES, DELIVERY_COMPARE, PICK_RULES } from "@/content/marketplace";
import { track } from "@/lib/analytics";
import { isUnreachable } from "@/lib/api/client";
import { market, type MListing } from "@/lib/api/market";
import type { PetType } from "@/lib/api/petProfile";
import { useNarrow } from "@/lib/device";
import { inrPaise } from "@/lib/format";
import { avatarVariant, useFrom, usePet } from "@/lib/passport";
import { isReduced } from "@/lib/reducedMotion";
import { CheckoutDrawer } from "./CheckoutDrawer";
import { FilterPanel, ResultCount } from "./FilterPanel";
import { FilterSheet } from "./FilterSheet";
import { browseLocal, PRICE_BUCKETS, SORTS, toQuery, useFilters, type Filters } from "./filters";
import { cartStore, notifyStore, setQty as setQtyRaw, storeLine, useMarketCatalog, usePruneCart } from "./data";
import { ProductCard } from "./ProductCard";
import { ProductSheet } from "./ProductSheet";
import s from "./mk.module.css";

const ICONS: Record<string, string> = {
  all: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  treats: "M7 3h10v3H7zM6 6h12v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z",
  toys: "M4 13c3-5 5 5 8 0s5 5 8 0M3 13a2.5 2.5 0 1 0 0 .1M21 13a2.5 2.5 0 1 0 0 .1",
  grooming: "M8 9h8v12H8zM9 4h6l3 3h-4v2h-4V7H9zM20 4l1-1M21 7h1.5",
  walking: "M12 2v3M12 5a4 3.5 0 1 1 0 7a4 3.5 0 1 1 0-7M12 12v6M10 18h4v4h-4z",
  health: "M9 2h6v3H9zM7 5h10v16H7zM12 9v8M8 13h8",
};
const COMPARE = [
  { k: "Who you support", us: "A pet store in your neighbourhood", them: "A distant warehouse" },
  { k: "Where the money goes", us: "The store’s share goes straight to the local owner, via Razorpay Route", them: "Mostly to a large platform" },
  { k: "Returns", us: "Handled by a store you can call", them: "A ticket in a support queue" },
  { k: "Delivery", us: DELIVERY_COMPARE, them: "From a central warehouse" },
];

/** Hero bag: tiny items drop in with a bounce, then bob. */
function Bag() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const bag = ref.current;
    if (!bag || isReduced()) return;
    const anims: Animation[] = [];
    bag.querySelectorAll<SVGGElement>("[data-bag]").forEach((g, i) => {
      const a = g.animate([{ transform: "translateY(-170px)", opacity: 0 }, { transform: "translateY(-170px)", opacity: 1, offset: 0.01 }, { transform: "translateY(0)", offset: 0.6 }, { transform: "translateY(-16px)", offset: 0.78 }, { transform: "translateY(0)" }], { duration: 700, delay: 300 + i * 260, easing: "ease-in", fill: "backwards" });
      a.onfinish = () => { if (!isReduced()) anims.push(g.animate([{ transform: "translateY(0)" }, { transform: "translateY(-5px)" }, { transform: "translateY(0)" }], { duration: 2400 + i * 300, iterations: Infinity, easing: "ease-in-out" })); };
      anims.push(a);
    });
    return () => anims.forEach((a) => a.cancel());
  }, []);
  const fb = { transformBox: "fill-box", transformOrigin: "50% 100%" } as const;
  return (
    <svg ref={ref} viewBox="0 0 280 250" role="img" aria-label="A shopping bag filling up with treats and toys" style={{ width: "100%", maxWidth: "25rem", display: "block", overflow: "visible" }} fill="var(--dz-paper)" stroke="var(--dz-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M96 92c0-50 88-50 88 0" fill="none" strokeWidth="6" />
      <g data-bag="" style={fb}><g transform="translate(78 40)"><rect x="0" y="10" width="34" height="9" rx="3" fill="var(--dz-orange)" /><path d="M2 19h30v40H2z" /><path d="M10 34h14M10 42h14" fill="none" strokeWidth="3" /></g></g>
      <g data-bag="" style={fb}><g transform="translate(118 48) rotate(-18)"><rect x="6" y="6" width="44" height="12" rx="5" /><circle cx="6" cy="6" r="7" /><circle cx="6" cy="18" r="7" /><circle cx="50" cy="6" r="7" /><circle cx="50" cy="18" r="7" /><path d="M6 8h44v8H6z" stroke="none" /></g></g>
      <g data-bag="" style={fb}><g transform="translate(172 50)"><circle cx="16" cy="16" r="16" fill="var(--dz-green)" /><path d="M2 10c10 6 18 6 28 0M2 22c10-6 18-6 28 0" fill="none" stroke="var(--dz-paper)" strokeWidth="2.4" /></g></g>
      <g data-bag="" style={fb}><g transform="translate(150 30)"><rect x="6" y="0" width="16" height="8" rx="2" fill="var(--dz-green)" /><path d="M2 8h24v46H2z" /><path d="M14 22v14M7 29h14" fill="none" stroke="var(--dz-green)" strokeWidth="4" /></g></g>
      <path d="M52 92h176l-14 146H66z" />
      <path d="M52 92h176" fill="none" strokeWidth="3" />
      <path d="M104 150c8 10 24 10 32 0M144 150c8 10 24 10 32 0" fill="none" strokeWidth="3" />
      <path d="M126 178c6 6 22 6 28 0" fill="none" strokeWidth="3" />
      <path d="M58 132h-24M60 160h-18" fill="none" strokeWidth="2.4" />
    </svg>
  );
}

/** Page 5 (/marketplace): products from local stores, filtered to the pet; cart split per store. */
export default function MarketplacePage() {
  const { pet, isDemo } = usePet();
  const narrow = useNarrow(700, 740);
  const cameFrom = useFrom();
  const { all, forPet, vendors, offline, loading, error, refetch } = useMarketCatalog();
  const lines = cartStore.use();
  const notified = notifyStore.use();
  const petDefault: PetType = pet?.type === "cat" ? "cat" : "dog";
  const { f, set, clear, active } = useFilters(petDefault);
  /** Hero toggle + "Picked for": "Both" keeps the passport's pet for the personal picks. */
  const mode: PetType = f.pet === "both" ? petDefault : f.pet;
  const query = useDeferredValue(toQuery(f));
  const shop = useQuery({ queryKey: ["market", "browse", query], queryFn: () => market.browse(query), enabled: !offline && !!pet, staleTime: 30_000, placeholderData: keepPreviousData, retry: (n, e) => !isUnreachable(e) && n < 1 });
  const local = useMemo(() => (offline ? browseLocal(all, f) : null), [offline, all, f]);
  const view = local || shop.data || null;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sideRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sideRef.current;
    if (!el) return;
    const fit = () => el.classList.toggle(s.sideStick, el.offsetHeight < window.innerHeight - (parseFloat(getComputedStyle(el).top) || 160) - 16);
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [loading]);
  const [sheet, setSheet] = useState<MListing | null>(null);
  const [drawer, setDrawer] = useState(false);
  const lastFocus = useRef<Element | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  usePruneCart(all, !loading);
  useSectionReveals(root, { narrow, deps: [loading] });

  useEffect(() => {
    const el = overlay.current;
    if (!el) return;
    if (cameFrom !== "choose-market") return void (el.style.display = "none");
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: isReduced() ? ms.reduced : 600, delay: isReduced() ? 0 : 120, easing: css.easeOut, fill: "forwards" }).onfinish = () => (el.style.display = "none");
  }, [cameFrom]);

  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const online = !offline;
  const setQty = useCallback((id: string, qty: number) => setQtyRaw(id, qty, online && !isDemo), [online, isDemo]);
  const qtyOf = (id: string) => lines.find((l) => l.listing_id === id)?.qty || 0;

  /** Fly-to-cart: the card's tile arcs into the cart pill (same move as Services). */
  const addToCart = useCallback((item: MListing, qty: number, src: Element | null) => {
    const land = () => {
      const cur = cartStore.get().find((l) => l.listing_id === item.id)?.qty || 0;
      setQty(item.id, Math.min(10, item.available_qty, cur + qty));
      const p = pill.current;
      if (p && !isReduced()) {
        p.animate([{ scale: "1" }, { scale: "1.15", offset: 0.35 }, { scale: ".95", offset: 0.7 }, { scale: "1" }], { duration: 480, easing: css.bouncy });
        p.querySelector("[data-count]")?.animate([{ transform: "translateY(6px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 300, easing: css.bouncy });
      }
      track("market_add", { sku: item.sku, qty });
    };
    const tile = src?.querySelector<HTMLElement>("[role=img]");
    const p = pill.current;
    if (isReduced() || !tile || !p) return land();
    const a = tile.getBoundingClientRect(), b = p.getBoundingClientRect();
    const fly = tile.cloneNode(true) as HTMLElement;
    fly.removeAttribute("role");
    fly.setAttribute("aria-hidden", "true");
    fly.style.cssText += `;position:fixed;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;z-index:80;pointer-events:none;transform-origin:0 0;margin:0`;
    document.body.appendChild(fly);
    const k = 40 / a.width, dx = b.left + 10 - a.left, dy = b.top + 8 - a.top;
    fly.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.45}px,${dy * 0.45 - 140}px) scale(${(1 + k) / 2.4}) rotate(-8deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px,${dy}px) scale(${k})`, opacity: 0.6 },
    ], { duration: 720, easing: "cubic-bezier(0.5, 0, 0.3, 1)" }).onfinish = () => { fly.remove(); land(); };
  }, [setQty]);

  const onAdd = useCallback((item: MListing, e: MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    if (!isReduced()) btn.animate([{ transform: "none" }, { transform: "translate(3px,3px)", offset: 0.4 }, { transform: "none" }], { duration: 260, easing: css.bouncy });
    addToCart(item, 1, btn.closest("[data-card]"));
  }, [addToCart]);
  const onOpen = useCallback((item: MListing, opener: HTMLElement) => { lastFocus.current = opener; setSheet(item); }, []);
  const onNotify = useCallback((item: MListing) => notifyStore.set((l) => (l.includes(item.sku) ? l : [...l, item.sku])), []);

  if (!pet) return <Navigate to="/" replace />;
  const petKey = avatarVariant(pet.type, pet.breed);
  const list = view?.items || [];
  const facets = view?.facets || null;
  const catCount = (k: string) => facets?.category.find((c) => c.key === k)?.count ?? (k === "all" ? forPet(mode).length : forPet(mode).filter((x) => x.category === k).length);
  const brandLabel = (k: string) => facets?.brand.find((b) => b.key === k)?.label || k;
  const chips: { label: string; patch: Partial<Filters> }[] = [
    ...(f.cat ? [{ label: CATEGORIES.find((c) => c.key === f.cat)!.label, patch: { cat: null } }] : []),
    ...f.price.map((k) => ({ label: PRICE_BUCKETS.find((b) => b.key === k)!.label, patch: { price: f.price.filter((x) => x !== k) } })),
    ...f.brand.map((k) => ({ label: brandLabel(k), patch: { brand: f.brand.filter((x) => x !== k) } })),
    ...(f.pet !== petDefault ? [{ label: f.pet === "both" ? "Dogs & cats" : f.pet === "cat" ? "Cats" : "Dogs", patch: { pet: petDefault } }] : []),
    ...(f.stock ? [{ label: "In stock only", patch: { stock: false } }] : []),
  ];
  const rule = mode === "cat" ? PICK_RULES.cat : petKey === "puppy" ? PICK_RULES.small : PICK_RULES.large;
  const picked = all
    .filter((x) => x.pet_types.some((t) => rule.pet_types.includes(t)) && (mode === "dog" ? x.pet_types.includes("dog") : x.pet_types.includes("cat")) && (!rule.categories || rule.categories.includes(x.category)) && (!rule.max_price_paise || x.price_paise <= rule.max_price_paise) && x.in_stock)
    .sort((a, b) => a.popularity_rank - b.popularity_rank)
    .slice(0, 8);
  const count = lines.reduce((t, l) => t + (byId.has(l.listing_id) ? l.qty : 0), 0);
  const cartTotal = (() => {
    const fees = new Map<string, number>();
    let sub = 0;
    lines.forEach((l) => { const i = byId.get(l.listing_id); if (i) { sub += i.price_paise * l.qty; fees.set(i.vendor.id, i.vendor.delivery_fee_paise); } });
    return sub + [...fees.values()].reduce((a, b) => a + b, 0);
  })();
  const localStores = vendors.filter((v) => !v.is_doggzi);
  const toShop = () => {
    const sh = document.getElementById("shop");
    if (sh) window.scrollTo({ top: sh.getBoundingClientRect().top + window.scrollY - 150, behavior: isReduced() ? "auto" : "smooth" });
  };
  const card = (x: MListing) => <ProductCard key={x.id} item={x} storeLine={storeLine(x.vendor)} inCart={qtyOf(x.id)} notified={notified.includes(x.sku)} onOpen={onOpen} onAdd={onAdd} onNotify={onNotify} />;

  return (
    <div ref={root} className={`${s.root} ${narrow ? s.narrow : ""}`}>
      <div ref={overlay} aria-hidden="true" className={s.overlay} />
      <Header right={<PassportChip pet={pet} pop={false} />} />
      <main>
        <section className={s.hero}>
          <div className={`${s.wrap} ${s.heroGrid}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.125rem", alignItems: "flex-start", minWidth: 0 }}>
              <Badge>Marketplace</Badge>
              <h1 className={`dz-display ${s.h1}`}>Treats, toys &amp; more for <span className={s.nameTag}>{pet.name}</span></h1>
              <form role="search" className={s.search} onSubmit={(e) => { e.preventDefault(); toShop(); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", width: "1.375rem", height: "1.375rem", margin: "0 0.25rem 0 1.125rem" }} fill="none" stroke="var(--dz-ink)" strokeWidth="2.4" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
                <label htmlFor="mk-q" className="dz-sr-only">Search products</label>
                <input id="mk-q" type="search" value={f.q} placeholder="Search treats, toys, brands…" autoComplete="off" onChange={(e) => set({ q: e.target.value })} />
              </form>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.875rem" }}>
                <div role="radiogroup" aria-label="Shopping for" className={s.toggle}>
                  {(["dog", "cat"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={f.pet === k} onClick={() => set({ pet: k, brand: [] })}>{k === "dog" ? "Dog" : "Cat"}</button>)}
                </div>
                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9375rem", fontWeight: 600 }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: "1.375rem", height: "1.375rem" }} fill="var(--dz-paper)" stroke="var(--dz-ink)" strokeWidth="2" strokeLinejoin="round"><path d="M3 10l2-6h14l2 6" /><path d="M4 10h16v10H4z" /><path d="M10 20v-5h4v5" /></svg>
                  Delivered by local stores near you
                </span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "center", minWidth: 0 }}><Bag /></div>
          </div>
        </section>

        <nav aria-label="Categories" className={s.rail}>
          <div className={`${s.wrap} ${s.railInner} dz-noscrollbar`}>
            {[{ key: "all" as const, label: "All" }, ...CATEGORIES].map((c) => (
              <button key={c.key} type="button" className={s.chip} aria-pressed={(f.cat || "all") === c.key} onClick={() => { set({ cat: c.key === "all" ? null : c.key }); const sh = document.getElementById("shop"); if (sh && sh.getBoundingClientRect().top > 200) toShop(); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="var(--dz-paper)" stroke="var(--dz-ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[c.key]} /></svg>
                <span>{c.label}</span>
                <span className={s.count}>{catCount(c.key)}</span>
              </button>
            ))}
          </div>
        </nav>

        {error && <p className={s.wrap} role="alert" style={{ padding: "2.5rem 1.25rem" }}>We couldn't load the shop. <button type="button" onClick={refetch} style={{ font: "inherit", fontWeight: 600, textDecoration: "underline", background: "none", border: 0, cursor: "pointer" }}>Try again</button></p>}

        {loading && (
          <Loading label="Picking favourites…" className={`${s.wrap} ${s.sec}`} style={{ paddingTop: "clamp(2.5rem,6vw,4.5rem)" }}>
            <h2 className={s.h2}>Picked for <Sweep>{pet.name}</Sweep></h2>
            <Skeleton w="min(22rem, 70%)" h="0.9375rem" />
            <div className={s.picked}>{Array.from({ length: 6 }, (_, k) => <div key={k}><SkeletonCard /></div>)}</div>
          </Loading>
        )}
        {picked.length > 0 && (
          <section data-reveal="" className={`${s.wrap} ${s.sec}`} style={{ paddingTop: "clamp(2.5rem,6vw,4.5rem)" }}>
            <div data-ri="" style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <h2 className={s.h2}>Picked for <Sweep>{pet.name}</Sweep></h2>
              <p style={{ margin: 0, fontSize: "0.9375rem", color: "rgba(20,18,16,.8)" }}>{mode === "cat" ? `For cats like ${pet.name}` : petKey === "puppy" ? `Small chews and treats sized for a ${pet.breed}` : `Tough toys and gear for a ${pet.breed}`}</p>
            </div>
            <div data-ri="" className={s.picked}>{picked.map((x) => <div key={x.id}>{card(x)}</div>)}</div>
          </section>
        )}

        <section id="shop" data-reveal="" className={`${s.wrap} ${s.sec}`} style={{ paddingTop: "clamp(2.5rem,6vw,4.5rem)", paddingBottom: "clamp(3.5rem,8vw,6.5rem)", scrollMarginTop: "9.375rem" }}>
          <h2 data-ri="" className={s.h2}>{f.cat ? CATEGORIES.find((c) => c.key === f.cat)?.label : "Everything"}</h2>
          <div data-ri="" className={s.shopGrid}>
            <aside className={s.side} aria-label="Filters"><div ref={sideRef}><FilterPanel f={f} set={set} facets={facets} /></div></aside>
            <div className={s.shopMain}>
              <div className={s.toolbar}>
                <button type="button" className={s.filtersBtn} aria-haspopup="dialog" onClick={() => { lastFocus.current = document.activeElement; setFiltersOpen(true); }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--dz-ink)" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                  Filters{active > 0 && <span className={s.badgeN} aria-label={`${active} active`}>{active}</span>}
                </button>
                <ResultCount n={view ? view.total : 0} />
                <label className={s.lbl}><span className={s.lblText}>Sort</span>
                  <select className={s.select} value={f.sort} onChange={(e) => set({ sort: e.target.value as Filters["sort"] })}>
                    {SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </label>
              </div>
              {chips.length > 0 && (
                <div className={s.applied} aria-label="Applied filters">
                  {chips.map((c) => <button key={c.label} type="button" className={s.appliedChip} onClick={() => set(c.patch)} aria-label={`Remove filter: ${c.label}`}>{c.label}<span aria-hidden="true">×</span></button>)}
                  <button type="button" className={s.flink} style={{ alignSelf: "center" }} onClick={clear}>Clear all</button>
                </div>
              )}
              {f.pet === "cat" && <p className={s.soon}><Badge size="sm" style={{ fontSize: "0.8125rem" }}>Coming soon</Badge>More for cats coming soon.</p>}
              {view ? (
                <div className={`${s.grid} ${shop.isPlaceholderData ? s.gridBusy : ""}`} aria-busy={shop.isFetching || undefined}>{list.map(card)}</div>
              ) : shop.isError && !offline ? (
                <p role="alert" style={{ margin: 0, padding: "1rem 0" }}>We couldn't load these products. <button type="button" onClick={() => shop.refetch()} style={{ font: "inherit", fontWeight: 600, textDecoration: "underline", background: "none", border: 0, cursor: "pointer" }}>Try again</button></p>
              ) : !error && (
                <Loading label="Stocking the shelves…" className={s.grid}>{Array.from({ length: 8 }, (_, k) => <SkeletonCard key={k} />)}</Loading>
              )}
              {!loading && view && !list.length && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", padding: "2rem 1rem", textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 600 }}>Nothing matches that yet.</p>
                  <button type="button" className={s.fchip} style={{ height: "2.875rem", background: "var(--dz-paper)", boxShadow: "3px 3px 0 var(--dz-ink)" }} onClick={() => { clear(); }}>Clear filters</button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="why-local" data-reveal="" className={s.band}>
          <div className={s.wrap} style={{ maxWidth: "62.5rem", paddingTop: "clamp(3.5rem,8vw,6.5rem)", paddingBottom: "clamp(3.5rem,8vw,6.5rem)", display: "flex", flexDirection: "column", gap: "clamp(1.5rem,4vw,2.25rem)" }}>
            <div data-ri="" style={{ display: "flex", flexDirection: "column", gap: "0.625rem", alignItems: "flex-start" }}>
              <Badge tone="cream">Why buy local</Badge>
              <h2 className="dz-h2">Your money stays in the neighbourhood</h2>
            </div>
            <div data-ri="" role="table" aria-label="Doggzi compared with a big warehouse app" className={s.cmp}>
              <div role="row" className={`${s.cmpRow} ${s.cmpHead}`}>
                <span role="columnheader" />
                <span role="columnheader" style={{ background: "var(--dz-pink)", color: "var(--dz-ink)" }}>Doggzi</span>
                <span role="columnheader">Big warehouse app</span>
              </div>
              {COMPARE.map((r) => (
                <div key={r.k} role="row" className={s.cmpRow}>
                  <span role="rowheader" className={s.cmpK}>{r.k}</span>
                  <span role="cell" className={s.cmpUs}>{r.us}</span>
                  <span role="cell" className={s.cmpThem}>{r.them}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Meet the stores: hidden until at least one real vendor other than Doggzi Store is live. */}
        {localStores.length > 0 && (
          <section data-reveal="" className={`${s.wrap} ${s.sec}`} style={{ paddingTop: "clamp(3.5rem,8vw,6.5rem)" }}>
            <h2 data-ri="" className="dz-h2">Meet the stores</h2>
            <div data-ri="" className={s.stores}>
              {localStores.map((v) => (
                <article key={v.id} className={s.store}>
                  <span style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: "1.125rem", letterSpacing: ".06em", textTransform: "uppercase" }}>{v.name}</span>
                  {v.area && <span style={{ fontSize: "0.875rem" }}>{v.area}</span>}
                  {v.story && <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.5 }}>{v.story}</p>}
                  {v.since_year && <Badge size="sm" tone="cream" style={{ alignSelf: "flex-start" }}>Since {v.since_year}</Badge>}
                </article>
              ))}
            </div>
          </section>
        )}

        <Testimonials tag="marketplace" heading="Happy shoppers" />
        <FAQ set="marketplace" heading="Shopping questions" />
      </main>
      <SiteFooter />

      <button ref={pill} type="button" className={s.cartPill} onClick={() => { lastFocus.current = document.activeElement; setDrawer(true); }} aria-label={count ? `Open cart: ${count} items, ${inrPaise(cartTotal)}` : "Open cart (empty)"}>
        <span className={s.cartIcon}>
          <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: "1.375rem", height: "1.375rem" }} fill="var(--dz-paper)" stroke="var(--dz-ink)" strokeWidth="1.8" strokeLinejoin="round"><path d="M5 8h14l-1.5 12h-11z" /><path d="M9 8a3 3 0 0 1 6 0" fill="none" /></svg>
          <span data-count="" className={s.cartCount}>{count}</span>
        </span>
        <span>{count ? inrPaise(cartTotal) : "Cart"}</span>
      </button>

      {sheet && (
        <ProductSheet item={sheet} narrow={narrow} notified={notified.includes(sheet.sku)}
          onAdd={(qty, el) => addToCart(sheet, qty, el)} onNotify={() => onNotify(sheet)}
          onClose={() => { setSheet(null); (lastFocus.current as HTMLElement | null)?.focus?.({ preventScroll: true }); }} />
      )}
      {filtersOpen && (
        <FilterSheet f={f} set={set} clear={clear} active={active} facets={facets} total={view ? view.total : 0}
          onClose={() => { setFiltersOpen(false); (lastFocus.current as HTMLElement | null)?.focus?.({ preventScroll: true }); }} />
      )}
      {drawer && (
        <CheckoutDrawer narrow={narrow} lines={lines} byId={byId} pet={pet} isDemo={isDemo} offline={offline} setQty={setQty}
          onPaid={() => cartStore.set([])}
          onClose={() => { setDrawer(false); (lastFocus.current as HTMLElement | null)?.focus?.({ preventScroll: true }); }} />
      )}
    </div>
  );
}
