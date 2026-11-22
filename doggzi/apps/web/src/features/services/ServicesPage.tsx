import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Navigate } from "react-router-dom";
import { Badge, ButtonA, FAQ, Header, PassportChip, SiteFooter, Sweep, Testimonials, useSectionReveals } from "@/design-system/components";
import { css, ms } from "@/design-system/motion";
import { PACKAGE_STEPS, PRICE_NOTE } from "@/content/services";
import { waLink } from "@/content/site-config";
import { track } from "@/lib/analytics";
import { useNarrow } from "@/lib/device";
import { inrPaise, possessive } from "@/lib/format";
import { avatarVariant, useFrom, usePet } from "@/lib/passport";
import { isReduced, useReduced } from "@/lib/reducedMotion";
import { createStore } from "@/lib/store";
import { BookingDrawer } from "./BookingDrawer";
import { useCatalog, type Item } from "./data";
import { ServiceScene } from "./ServiceScene";
import s from "./sv.module.css";

const cartStore = createStore<string[]>("dz.cart", []);
const EXTRAS: Record<string, { title: string; sub: string }> = {
  training: { title: "Pet training", sub: "12 sessions a month with a Doggzi trainer" },
  boarding: { title: "Boarding", sub: "Priced per hour, on request" },
  pickup: { title: "Pickup", sub: "Subject to availability" },
};

/** "What's included" chips tick off in step with the package's scene sequence. */
function PackageCard({ item, pet, petName, inCart, onAdd }: { item: Item; pet: ReturnType<typeof avatarVariant>; petName: string; inCart: boolean; onAdd: (e: MouseEvent<HTMLButtonElement>) => void }) {
  const steps = PACKAGE_STEPS[item.slug] || [];
  const reduced = useReduced();
  const [done, setDone] = useState(reduced ? steps.length - 1 : -1);
  const listRef = useRef<HTMLUListElement>(null);
  const onStep = useCallback((i: number) => {
    setDone(i);
    if (isReduced()) return;
    listRef.current?.querySelector<HTMLElement>(`[data-k="${i}"] [data-dot]`)?.animate([{ transform: "scale(.4)" }, { transform: "scale(1.2)", offset: 0.6 }, { transform: "scale(1)" }], { duration: 420, easing: css.bouncy });
  }, []);
  useEffect(() => { if (reduced) setDone(steps.length - 1); }, [reduced, steps.length]);
  return (
    <article data-ri="" data-card="" className={s.pkg}>
      {item.slug === "full-package" && <span className={s.best}>Best value</span>}
      <div className={s.sceneBox}>
        <ServiceScene sequence={steps.map((x) => x.scene)} pet={pet!} petName={petName} onStep={onStep} label={`Illustration: ${petName} going through ${steps.map((x) => x.label.toLowerCase()).join(", then ")}`} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.75rem" }}>
        <h3 className={s.pkgTitle}>{item.name}</h3>
        <span className={s.price}>{inrPaise(item.price_paise!)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <span className={s.kicker}>What's included</span>
        <ul ref={listRef} className={s.checks}>
          {steps.map((st, k) => (
            <li key={k} data-k={k} className={s.check} data-done={k <= done}><span data-dot="" aria-hidden="true" className={s.checkDot}>✓</span>{st.label}</li>
          ))}
        </ul>
      </div>
      <button type="button" className={s.add} style={{ marginTop: "auto" }} aria-pressed={inCart} onClick={onAdd}>{inCart ? "Added ✓" : `Add + · ${inrPaise(item.price_paise!)}`}</button>
    </article>
  );
}

/** Page 4 (/services): Urban Company-style booking, personalised to the pet's type. Every visual is an inline line-art scene. */
export default function ServicesPage() {
  const { pet, isDemo } = usePet();
  const narrow = useNarrow(700, 740);
  const cameFrom = useFrom();
  const root = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const cart = cartStore.use();
  const [drawer, setDrawer] = useState(false);
  const lastFocus = useRef<Element | null>(null);
  const { items, loading, offline, error, refetch } = useCatalog(pet?.type || "dog");
  useSectionReveals(root, { narrow, deps: [items.length > 0] });

  useEffect(() => {
    const el = overlay.current;
    if (!el) return;
    if (cameFrom !== "choose-services") return void (el.style.display = "none");
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: isReduced() ? ms.reduced : 600, delay: isReduced() ? 0 : 120, easing: css.easeOut, fill: "forwards" }).onfinish = () => (el.style.display = "none");
  }, [cameFrom]);

  if (!pet) return <Navigate to="/" replace />;
  const petKey = avatarVariant(pet.type, pet.breed)!;
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const cartItems = cart.map((slug) => bySlug.get(slug)).filter(Boolean) as Item[];
  const total = cartItems.reduce((t, i) => t + (i.price_paise || 0), 0);
  const packages = items.filter((i) => i.group === "package");
  const spa = items.filter((i) => i.group === "spa");
  const extras = items.filter((i) => ["training", "boarding", "pickup"].includes(i.group));

  const toggle = (slug: string, e?: MouseEvent<HTMLButtonElement>) => {
    if (cart.includes(slug)) return cartStore.set((c) => c.filter((x) => x !== slug));
    const btn = e?.currentTarget;
    if (btn && !isReduced()) btn.animate([{ transform: "translate(0,0)" }, { transform: "translate(4px,4px)", offset: 0.4 }, { transform: "translate(0,0)" }], { duration: 260, easing: css.bouncy });
    const land = () => {
      cartStore.set((c) => (c.includes(slug) ? c : [...c, slug]));
      const p = pill.current;
      if (p && !isReduced()) {
        p.animate([{ scale: "1" }, { scale: "1.15", offset: 0.35 }, { scale: ".95", offset: 0.7 }, { scale: "1" }], { duration: 480, easing: css.bouncy });
        p.querySelector("[data-count]")?.animate([{ transform: "translateY(6px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 300, easing: css.bouncy });
      }
      track("service_add", { id: slug });
    };
    // Fly-to-cart: a tiny copy of the card's scene arcs into the cart pill.
    const scene = btn?.closest("[data-card]")?.querySelector<HTMLElement>("[role=img]");
    const p = pill.current;
    if (isReduced() || !scene || !p || !scene.firstChild) return land();
    const a = scene.getBoundingClientRect(), b = p.getBoundingClientRect();
    const fly = document.createElement("div");
    fly.setAttribute("aria-hidden", "true");
    fly.style.cssText = `position:fixed;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;z-index:80;pointer-events:none;background:var(--dz-paper);border:var(--stroke);border-radius:18px;transform-origin:0 0;overflow:hidden`;
    fly.appendChild(scene.firstChild.cloneNode(true));
    document.body.appendChild(fly);
    const k = 40 / a.width, dx = b.left + 10 - a.left, dy = b.top + 8 - a.top;
    fly.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.45}px,${dy * 0.45 - 140}px) scale(${(1 + k) / 2.4}) rotate(-8deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px,${dy}px) scale(${k}) rotate(0)`, opacity: 0.6 },
    ], { duration: 720, easing: "cubic-bezier(0.5, 0, 0.3, 1)" }).onfinish = () => { fly.remove(); land(); };
  };

  const openCart = () => { lastFocus.current = document.activeElement; setDrawer(true); };
  const closeCart = () => { setDrawer(false); (lastFocus.current as HTMLElement | null)?.focus?.({ preventScroll: true }); };
  const ask = (svc: string) => waLink(`Hi Doggzi! I'd like to ask about ${svc} for ${pet.name} (${pet.breed}).`);
  const howSteps = ["Pick", "Choose a slot", "We come home", `${pet.name}'s spa-fresh`];
  const howColors = [["var(--dz-cream)", "var(--dz-ink)"], ["var(--dz-pink)", "var(--dz-ink)"], ["var(--dz-green)", "var(--dz-paper)"], ["var(--dz-orange)", "var(--dz-paper)"]];

  return (
    <div ref={root} className={`${s.root} ${narrow ? s.narrow : ""}`}>
      <div ref={overlay} aria-hidden="true" className={s.overlay} />
      <Header right={<PassportChip pet={pet} pop={false} />} />
      <main>
        <section className={s.hero}>
          <div className={`${s.wrap} ${s.heroGrid}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", alignItems: "flex-start", minWidth: 0 }}>
              <Badge>Services</Badge>
              <h1 className={`dz-display ${s.h1}`}>Spa day for <span className={s.nameTag}>{pet.name}</span></h1>
              <p style={{ margin: 0, maxWidth: "36ch", fontSize: "clamp(1.05rem,1.8vw,1.25rem)", lineHeight: 1.55, fontWeight: 500 }}>Doorstep grooming, training &amp; boarding across Delhi NCR.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                <ButtonA variant="ink" href={pet.type === "cat" ? "#spa" : "#packages"} style={{ height: "3.5rem", fontSize: "1.0625rem" }}>{pet.type === "cat" ? "See spa services ↓" : "See packages ↓"}</ButtonA>
                <a href="#spa" className={s.outline}>Build your own spa</a>
              </div>
            </div>
            <div className={s.heroArt}>
              <ServiceScene scene="bath" pet={petKey} petName={pet.name} label={`Illustration: ${pet.name} in a bubble bath, shaking off water`} />
            </div>
          </div>
        </section>

        {loading && <p className={s.wrap} style={{ padding: "3rem 1.25rem", fontWeight: 600 }} role="status">Fetching {possessive(pet.name)} services…</p>}
        {error && (
          <p className={s.wrap} style={{ padding: "3rem 1.25rem" }} role="alert">
            We couldn't load services right now. <button type="button" onClick={() => refetch()} style={{ font: "inherit", fontWeight: 600, textDecoration: "underline", background: "none", border: 0, cursor: "pointer" }}>Try again</button>
          </p>
        )}

        {packages.length > 0 && (
          <section id="packages" data-reveal="" className={`${s.wrap} ${s.sec}`}>
            <div data-ri="" className={s.head}>
              <Badge>Grooming packages</Badge>
              <h2 className="dz-h2">The full pamper, start to finish</h2>
              <Badge tone="draft" size="sm" style={{ fontSize: "0.8125rem" }}>Package contents: draft, to confirm</Badge>
            </div>
            <div className={s.pkgGrid}>
              {packages.map((i) => <PackageCard key={i.slug} item={i} pet={petKey} petName={pet.name} inCart={cart.includes(i.slug)} onAdd={(e) => toggle(i.slug, e)} />)}
            </div>
          </section>
        )}

        {spa.length > 0 && (
          <section id="spa" data-reveal="" className={s.band}>
            <div className={`${s.wrap} ${s.sec}`}>
              <div data-ri="" className={s.head}>
                <Badge tone="cream">Build your own spa</Badge>
                <h2 className="dz-h2">Pick what <Sweep>{pet.name}</Sweep> needs</h2>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--ink-75)" }}>{PRICE_NOTE}</p>
                {pet.type === "cat" && <Badge tone="draft" size="sm" style={{ fontSize: "0.8125rem" }}>Cat services: draft list, to confirm</Badge>}
              </div>
              <div className={s.spaGrid}>
                {spa.map((i) => {
                  const on = cart.includes(i.slug);
                  return (
                    <article key={i.slug} data-ri="" data-card="" className={s.spa}>
                      <div className={s.sceneBoxPaper}><ServiceScene scene={i.scene} pet={petKey} petName={pet.name} /></div>
                      <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, lineHeight: 1.3, minHeight: "2.6em" }}>{i.name}</h3>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                        <span className={s.price} style={{ fontSize: "1.25rem" }}>{inrPaise(i.price_paise!)}</span>
                        <button type="button" className={`${s.add} ${s.addSm}`} aria-pressed={on} aria-label={on ? `Remove ${i.name}` : `Add ${i.name}`} onClick={(e) => toggle(i.slug, e)}>{on ? "Added ✓" : "Add +"}</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {extras.length > 0 && (
          <section id="training" data-reveal="" className={`${s.wrap} ${s.sec}`}>
            <div data-ri="" className={s.head}>
              <Badge>Training &amp; boarding</Badge>
              <h2 className="dz-h2">Good habits, cosy nights</h2>
            </div>
            <div className={s.extraGrid}>
              {extras.map((i) => {
                const meta = EXTRAS[i.group], on = cart.includes(i.slug);
                return (
                  <article key={i.slug} data-ri="" data-card="" className={s.pkg} style={{ gap: "0.75rem", padding: "1rem 1rem 1.25rem" }}>
                    <div className={s.sceneBox}><ServiceScene scene={i.scene} pet={petKey} petName={pet.name} /></div>
                    <h3 className={s.pkgTitle} style={{ fontSize: "clamp(1.4rem,2.2vw,1.7rem)" }}>{meta.title}</h3>
                    <span style={{ fontSize: "0.9375rem", lineHeight: 1.45 }}>{meta.sub}</span>
                    <span className={s.price} style={{ fontSize: "1.25rem" }}>{i.price_mode === "fixed" ? `${inrPaise(i.price_paise!)} / month` : i.price_mode === "on_request" ? "On request" : "Subject to availability"}</span>
                    {i.price_mode === "fixed" ? (
                      <button type="button" className={s.add} style={{ marginTop: "auto" }} aria-pressed={on} onClick={(e) => toggle(i.slug, e)}>{on ? "Added ✓" : `Add + · ${inrPaise(i.price_paise!)}`}</button>
                    ) : (
                      <ButtonA variant="greenInk" href={ask(meta.title.toLowerCase())} target="_blank" rel="noopener noreferrer" style={{ marginTop: "auto", fontSize: "1.0625rem" }} onClick={() => track("whatsapp_ask", { service: i.slug })}>Ask on WhatsApp</ButtonA>
                    )}
                  </article>
                );
              })}
            </div>
            <p data-ri="" style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.625rem", fontSize: "0.9375rem" }}>
              <Badge size="sm" style={{ borderStyle: "dashed", background: "transparent", fontSize: "0.8125rem" }}>Coming soon</Badge>Walking and vet consults
            </p>
          </section>
        )}

        <section id="how-booking-works" data-reveal="" className={s.band}>
          <div className={`${s.wrap} ${s.sec}`} style={{ gap: "clamp(1.75rem,4vw,3rem)" }}>
            <div data-ri="" className={s.head}>
              <Badge tone="cream">How a booking works</Badge>
              <h2 className="dz-h2">Four steps to spa-fresh</h2>
            </div>
            <ol className={s.steps}>
              <span data-line="" aria-hidden="true" className={s.line} />
              {howSteps.map((label, k) => (
                <li key={k} data-ri="" className={s.step}>
                  <span className={s.num} style={{ background: howColors[k][0], color: howColors[k][1] }}>{k + 1}</span>
                  <span className={s.stepLabel}>{label}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <Testimonials tag="services" heading="Spa-fresh tails" />
        <FAQ set="services" heading="Service questions" />
      </main>
      <SiteFooter />

      <button ref={pill} type="button" className={s.cartPill} onClick={openCart} aria-label={cart.length ? `Open cart: ${cartItems.length} items, ${inrPaise(total)}` : "Open cart (empty)"}>
        <span className={s.cartIcon}>
          <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: "1.375rem", height: "1.375rem" }} fill="var(--dz-paper)" stroke="var(--dz-ink)" strokeWidth="1.8" strokeLinejoin="round"><path d="M5 8h14l-1.5 12h-11z" /><path d="M9 8a3 3 0 0 1 6 0" fill="none" /></svg>
          <span data-count="" className={s.count}>{cartItems.length}</span>
        </span>
        <span>{cartItems.length ? inrPaise(total) : "Cart"}</span>
      </button>

      {drawer && (
        <BookingDrawer narrow={narrow} items={cartItems} pet={pet} isDemo={isDemo} offline={offline}
          onRemove={(slug) => cartStore.set((c) => c.filter((x) => x !== slug))}
          onBooked={() => cartStore.set([])}
          onClose={closeCart} />
      )}
    </div>
  );
}
