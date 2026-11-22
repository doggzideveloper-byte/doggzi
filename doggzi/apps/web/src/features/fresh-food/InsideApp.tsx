import { useEffect, useRef, useState } from "react";
import { Badge } from "@/design-system/components";
import { css } from "@/design-system/motion";
import { APP_SCREENS } from "@/content/fresh-food";
import { isReduced, useReduced } from "@/lib/reducedMotion";
import s from "./ff.module.css";

// Each benefit sticker is pinned to a screen (index-aligned with APP_SCREENS). None of the screenshots shows
// tracking, so "Live tracking" rides with the dogs-or-cats home screen.
const STICKERS = ["Nutritionist plan", "Live tracking", "Veg / non-veg menu", "Pause anytime", "15 or 30-day plans", "Order history"];
const ORBIT_ROT = ["-4deg", "3deg", "-2deg", "4deg", "-3deg", "2deg"];

/**
 * 3D coverflow pinned while the visitor scrolls: active phone in front, neighbours at ±25°, 0.85 scale, 60% opacity.
 * Stickers orbit the active phone and pop in (spring.bouncy) as their screen appears.
 * Reduced motion: a static grid of all six screens.
 */
export function InsideApp({ onOpen }: { onOpen: (i: number) => void }) {
  const reduced = useReduced();
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [seenMax, setSeenMax] = useState(0);
  const inView = useRef(false);
  const tiltDone = useRef(false);

  useEffect(() => {
    if (reduced) return;
    let sRaf = 0, raf = 0;
    const sync = () => {
      const tr = track.current;
      if (!tr) return void (inView.current = false);
      const r = tr.getBoundingClientRect(), span = r.height - window.innerHeight;
      inView.current = r.top < window.innerHeight && r.bottom > 0;
      if (inView.current && !tiltDone.current && r.top < window.innerHeight * 0.6) {
        tiltDone.current = true;
        stage.current?.querySelector<HTMLElement>("[data-stage-tilt]")?.animate([{ transform: "rotateX(25deg)", opacity: 0.4 }, { transform: "rotateX(0deg)", opacity: 1 }], { duration: 900, easing: css.easeOut });
      }
      const p = Math.max(0, Math.min(0.9999, -r.top / span)), a = Math.floor(p * 6);
      setActive(a);
      setSeenMax((m) => Math.max(m, a));
    };
    const onScroll = () => {
      if (sRaf) return;
      sRaf = requestAnimationFrame(() => { sRaf = 0; sync(); });
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const st = stage.current;
      if (!st || !inView.current) return;
      const ph = st.querySelector<HTMLElement>("[data-stage-tilt]");
      if (!ph) return;
      const W = ph.offsetWidth, H = st.offsetHeight, SW = st.offsetWidth;
      const rx = Math.min(W * 0.5 + 80, SW * 0.5 - 40), ry = H * 0.44;
      st.querySelectorAll<HTMLElement>("[data-orbit]").forEach((el) => {
        const i = +el.dataset.orbit!, a = i * (Math.PI / 3) - Math.PI / 2 + now * 0.00012;
        el.style.transform = `translate(${(Math.cos(a) * rx).toFixed(1)}px,${(Math.sin(a) * ry).toFixed(1)}px)`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const t = setTimeout(sync, 400);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(sRaf);
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [reduced]);

  // Pop the sticker that belongs to the screen now in front.
  useEffect(() => {
    if (isReduced()) return;
    stage.current?.querySelector<HTMLElement>(`[data-orbit="${active}"] [data-pop]`)?.animate(
      [{ scale: "0", opacity: 0 }, { scale: "1.12", opacity: 1, offset: 0.6 }, { scale: "1", opacity: 1 }],
      { duration: 480, easing: css.bouncy },
    );
  }, [active]);

  const go = (i: number) => {
    const tr = track.current;
    if (!tr) return;
    const top = tr.getBoundingClientRect().top + window.scrollY, span = tr.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + ((i + 0.5) / 6) * span, behavior: isReduced() ? "auto" : "smooth" });
  };
  const sc = APP_SCREENS[active];

  return (
    <section id="inside-the-app" className={s.band}>
      <div data-reveal="" className={s.wrap} style={{ paddingTop: "clamp(3.5rem,8vw,6.5rem)", paddingBottom: "0.5rem" }}>
        <div data-ri="" className={s.head}>
          <Badge tone="cream">Inside the app</Badge>
          <h2 className="dz-h2">Ordering happens in the app</h2>
        </div>
      </div>
      {reduced ? (
        <div className={`${s.wrap} ${s.grid6}`}>
          {APP_SCREENS.map((c, i) => (
            <figure key={c.src} style={{ margin: 0, display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <button type="button" className={s.gridShot} onClick={() => onOpen(i)} aria-label={`Enlarge screen ${i + 1}: ${c.title}`}>
                <img src={c.src} alt={`Doggzi app: ${c.title}`} loading="lazy" width={300} height={649} decoding="async" />
              </button>
              <figcaption style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <span style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: "1.0625rem", letterSpacing: ".04em", textTransform: "uppercase" }}>{i + 1}. {c.title}</span>
                <span style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>{c.body}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div ref={track} className={s.coverTrack}>
          <div className={`${s.wrap} ${s.coverStage}`}>
            <div className={s.coverText} aria-live="polite">
              <span className={s.coverN}>{active + 1}</span>
              <h3 className={s.coverH}>{sc.title}</h3>
              <p style={{ margin: 0, maxWidth: "36ch", fontSize: "clamp(0.9375rem,1.6vw,1.125rem)", lineHeight: 1.6, textWrap: "pretty" } as React.CSSProperties}>{sc.body}</p>
              <div className={s.dots}>
                {APP_SCREENS.map((_, i) => <button key={i} type="button" className={s.dotBtn} aria-label={`Show screen ${i + 1}`} aria-current={i === active} onClick={() => go(i)} />)}
              </div>
            </div>
            <div ref={stage} className={s.stage}>
              <div data-stage-tilt="" className={s.tilt}>
                {APP_SCREENS.map((c, i) => {
                  const d = i - active, ad = Math.abs(d), sg = Math.sign(d);
                  const t = d === 0 ? "translateX(0) rotateY(0deg) scale(1)" : ad === 1 ? `translateX(${d * 58}%) rotateY(${-d * 25}deg) scale(.85)` : `translateX(${sg * 95}%) rotateY(${-sg * 25}deg) scale(.7)`;
                  return (
                    <button key={c.src} type="button" tabIndex={-1} className={s.cover} aria-label={`Go to screen ${i + 1}: ${c.title}`} onClick={() => (d === 0 ? onOpen(i) : go(i))}
                      style={{ transform: t, opacity: d === 0 ? 1 : ad === 1 ? 0.6 : 0, zIndex: 3 - Math.min(ad, 2), pointerEvents: ad <= 1 ? "auto" : "none" }}>
                      <img src={c.src} alt={`Doggzi app: ${c.title}`} loading="lazy" width={300} height={649} decoding="async" />
                    </button>
                  );
                })}
              </div>
              <div aria-hidden="true" className={s.orbitLayer}>
                {STICKERS.map((label, i) => (
                  <span key={label} data-orbit={i} className={s.orbit} style={{ opacity: i <= seenMax ? 1 : 0 }}>
                    <span data-pop="" className={s.orbitPill} style={{ transform: `translate(-50%,-50%) rotate(${ORBIT_ROT[i]})`, background: i === active ? "var(--dz-pink)" : "var(--dz-paper)" }}>{label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Two rows (four copies each, so wide screens never run out) of all six screens on a tilted plane, marquee in opposite directions, pausing on hover. */
export function AppWall({ onOpen }: { onOpen: (i: number) => void }) {
  const a = useRef<HTMLDivElement>(null);
  const b = useRef<HTMLDivElement>(null);
  const anims = useRef<Animation[]>([]);
  useEffect(() => {
    if (!a.current || !b.current || isReduced()) return;
    anims.current = [
      a.current.animate([{ transform: "translateX(0)" }, { transform: "translateX(-50%)" }], { duration: 96000, iterations: Infinity }),
      b.current.animate([{ transform: "translateX(-50%)" }, { transform: "translateX(0)" }], { duration: 104000, iterations: Infinity }),
    ];
    return () => anims.current.forEach((x) => x.cancel());
  }, []);
  const pause = () => anims.current.forEach((x) => x.pause());
  const play = () => anims.current.forEach((x) => x.play());
  const row = (offset: number, shadow: string, focusable: boolean) =>
    Array.from({ length: 24 }, (_, k) => {
      const i = (k + offset) % 6, sc = APP_SCREENS[i], dup = !focusable || k >= 6;
      return (
        <button key={k} type="button" className={s.wallShot} style={{ boxShadow: `5px 5px 0 ${shadow}` }} tabIndex={dup ? -1 : 0} aria-hidden={dup || undefined}
          aria-label={dup ? undefined : `Enlarge screen ${i + 1}: ${sc.title}`} onClick={() => onOpen(i)}>
          <img src={sc.src} alt="" loading="lazy" width={300} height={649} decoding="async" />
        </button>
      );
    });
  return (
    <section aria-labelledby="ff-wall-h" className={s.wall}>
      <div data-reveal="" className={s.wrap} style={{ paddingTop: "clamp(3rem,7vw,5rem)", display: "flex", flexDirection: "column", gap: "0.625rem", alignItems: "flex-start" }}>
        <span data-ri=""><Badge tone="onDark">App wall</Badge></span>
        <h2 data-ri="" id="ff-wall-h" className="dz-h2" style={{ color: "var(--dz-cream)" }}>Every screen, one tap away</h2>
        <p data-ri="" style={{ margin: 0, fontSize: "1rem" }}>Tap any screen for a closer look.</p>
      </div>
      <div className={s.wallPlane} onMouseEnter={pause} onMouseLeave={play} onFocus={pause} onBlur={play}>
        <div className={s.wallTilt}>
          <div ref={a} className={s.wallRow}>{row(0, "var(--dz-orange)", true)}</div>
          <div ref={b} className={s.wallRow}>{row(3, "var(--dz-green)", false)}</div>
        </div>
      </div>
    </section>
  );
}

/** Lightbox carousel: swipe, arrow keys, Escape; focus returns to the opener. */
export function Lightbox({ index, onNav, onClose }: { index: number; onNav: (d: number) => void; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const x0 = useRef<number | null>(null);
  const lastDir = useRef(0);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    root.current?.querySelector<HTMLElement>("[data-lb-close]")?.focus({ preventScroll: true });
    if (!isReduced()) root.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: css.easeOut });
    return () => (opener.current as HTMLElement | null)?.focus?.({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (isReduced() || !img.current) return;
    const d = lastDir.current;
    img.current.animate(d ? [{ transform: `translateX(${d * 48}px)`, opacity: 0 }, { transform: "none", opacity: 1 }] : [{ transform: "scale(.94)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 350, easing: css.easeOut });
  }, [index]);
  const nav = (d: number) => { lastDir.current = d; onNav(d); };
  const sc = APP_SCREENS[index];
  return (
    <div ref={root} role="dialog" aria-modal="true" aria-label="Doggzi app screens" className={s.lb}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); nav(1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); nav(-1); }
        else if (e.key === "Escape") { e.preventDefault(); onClose(); }
        else if (e.key === "Tab") {
          const f = [...root.current!.querySelectorAll<HTMLElement>("button")];
          const i = f.indexOf(document.activeElement as HTMLElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
        }
      }}
      onPointerDown={(e) => (x0.current = e.clientX)}
      onPointerUp={(e) => {
        if (x0.current == null) return;
        const dx = e.clientX - x0.current;
        x0.current = null;
        if (Math.abs(dx) > 50) nav(dx < 0 ? 1 : -1);
      }}>
      <button type="button" data-lb-close="" className={s.lbBtn} style={{ position: "absolute", top: "1rem", right: "1rem", fontSize: "1.625rem", fontWeight: 500 }} onClick={onClose} aria-label="Close">×</button>
      <div style={{ display: "flex", alignItems: "center", gap: "clamp(0.5rem,3vw,2rem)" }}>
        <button type="button" className={s.lbBtn} onClick={() => nav(-1)} aria-label="Previous screen">←</button>
        <figure style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.875rem" }}>
          <img ref={img} src={sc.src} alt={`Doggzi app: ${sc.title}`} width={300} height={649} decoding="async" draggable={false} className={s.lbImg} />
          <figcaption className={s.lbCap}>{index + 1} / 6 · {sc.title}</figcaption>
        </figure>
        <button type="button" className={s.lbBtn} onClick={() => nav(1)} aria-label="Next screen">→</button>
      </div>
    </div>
  );
}
