import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { AppDownload, Badge, Button } from "@/design-system/components";
import { css } from "@/design-system/motion";
import { FRESH_FOOD, INGREDIENTS } from "@/content/fresh-food";
import { track } from "@/lib/analytics";
import { possessive } from "@/lib/format";
import type { Passport } from "@/lib/passport";
import { isReduced, useReduced } from "@/lib/reducedMotion";
import s from "./ff.module.css";

const ROTS = ["-3deg", "2deg", "-1deg", "3deg", "-2deg"];
const HERO_SCREENS = [3, 5, 6, 4, 1, 2].map((n) => `/brand/app/screen-${n}.webp`);

/** Ingredients drop in one by one, labels pop, steam draws, then the nutritionist stamp lands. */
function playBowl(root: HTMLElement | null) {
  if (!root) return;
  root.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  if (isReduced()) return;
  const ings = [...root.querySelectorAll<SVGGElement>("[data-ing]")].filter((g) => (g.parentNode as SVGGElement).style.display !== "none");
  const labels = [...root.querySelectorAll<HTMLElement>("[data-label]")];
  let t = 350;
  ings.forEach((g, i) => {
    g.animate([{ transform: "translateY(-260px)", opacity: 0 }, { transform: "translateY(-260px)", opacity: 1, offset: 0.01 }, { transform: "translateY(0)", offset: 0.6 }, { transform: "translateY(-14px)", offset: 0.78 }, { transform: "translateY(0)" }], { duration: 640, delay: t, easing: "ease-in", fill: "backwards" });
    labels[i]?.animate([{ transform: `rotate(${ROTS[i % 5]}) scale(0)`, opacity: 0 }, { transform: `rotate(${ROTS[i % 5]}) scale(1)`, opacity: 1 }], { duration: 380, delay: t + 420, easing: css.bouncy, fill: "backwards" });
    t += 420;
  });
  root.querySelectorAll<SVGPathElement>("[data-steam]").forEach((p, i) => {
    const len = p.getTotalLength();
    p.animate([{ strokeDasharray: len, strokeDashoffset: len, opacity: 1 }, { strokeDasharray: len, strokeDashoffset: 0, opacity: 1 }], { duration: 900, delay: t + 300 + i * 120, easing: css.easeOut, fill: "backwards" });
  });
  root.querySelector<HTMLElement>("[data-stamp]")?.animate([{ transform: "scale(1.5) rotate(-14deg)", opacity: 0 }, { transform: "scale(1) rotate(-6deg)", opacity: 1 }], { duration: 420, delay: t + 1200, easing: css.bouncy, fill: "backwards" });
}

/** Three phones fanned at −12°, 0°, 12° behind the bowl: float, parallax, spread on hover; the middle one cycles screens. */
function PhoneFan({ artRef, visible }: { artRef: React.RefObject<HTMLDivElement>; visible: boolean }) {
  const [idx, setIdx] = useState(0);
  const [prev, setPrev] = useState(-1);
  const vis = useRef(visible);
  vis.current = visible;
  useEffect(() => {
    const id = setInterval(() => {
      if (isReduced() || !vis.current || document.hidden) return;
      setIdx((i) => {
        setPrev(i);
        return (i + 1) % 6;
      });
    }, 2500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const art = artRef.current;
    if (!art) return;
    const f = { mx: 0, my: 0, tmx: 0, tmy: 0, spread: 0, tspread: 0 };
    const move = (e: PointerEvent) => {
      const r = art.getBoundingClientRect();
      f.tmx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      f.tmy = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const enter = () => (f.tspread = 1);
    const leave = () => Object.assign(f, { tspread: 0, tmx: 0, tmy: 0 });
    art.addEventListener("pointermove", move);
    art.addEventListener("pointerenter", enter);
    art.addEventListener("pointerleave", leave);
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (isReduced() || !vis.current) return;
      f.mx += (f.tmx - f.mx) * 0.06;
      f.my += (f.tmy - f.my) * 0.06;
      f.spread += (f.tspread - f.spread) * 0.1;
      const sc = Math.min(window.scrollY, 700);
      art.querySelectorAll<HTMLElement>("[data-fan]").forEach((el) => {
        const k = +el.dataset.fan!, W = el.offsetWidth, ak = Math.abs(k);
        const x = k * (W * 0.62 + f.spread * W * 0.32) + f.mx * (10 + ak * 8);
        const y = ak * 16 - f.spread * 16 + Math.sin(now / 1400 + k * 1.3) * 6 + f.my * 8 - sc * 0.1 * (1 + ak * 0.5);
        const r = k * (12 + f.spread * 7) + f.mx * 2;
        el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg)`;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      art.removeEventListener("pointermove", move);
      art.removeEventListener("pointerenter", enter);
      art.removeEventListener("pointerleave", leave);
    };
  }, [artRef]);
  return (
    <div aria-hidden="true" className={s.fanAnchor}>
      <div data-fan="-1" className={s.phone}><img src="/brand/app/screen-1.webp" alt="" /></div>
      <div data-fan="1" className={s.phone}><img src="/brand/app/screen-4.webp" alt="" /></div>
      <div data-fan="0" className={s.phone} style={{ zIndex: 1 }}>
        {HERO_SCREENS.map((src, i) => (
          <img key={src} src={src} alt="" className={s.slide}
            style={{ transform: i === idx ? "translateX(0)" : i === prev ? "translateX(-100%)" : "translateX(100%)", transition: i === idx || i === prev ? `transform 600ms ${css.easeOut}` : "none" }} />
        ))}
      </div>
    </div>
  );
}

interface Props {
  pet: Passport;
  soon: boolean;
  notified: boolean;
  onNotify: () => void;
  visible: boolean;
}

export const Hero = forwardRef<HTMLElement, Props>(function Hero({ pet, soon, notified, onNotify, visible }, ref) {
  const reduced = useReduced();
  const bowl = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const ings = INGREDIENTS[pet.type === "cat" ? "cat" : "dog"];
  const poss = possessive(pet.name);
  const replay = useCallback(() => playBowl(bowl.current), []);
  useEffect(() => {
    replay();
  }, [replay, pet.type, soon]);

  return (
    <section ref={ref} className={s.hero}>
      <div className={`${s.wrap} ${s.heroGrid}`}>
        <div className={s.heroCopy}>
          <Badge>Fresh Food</Badge>
          {!soon ? (
            <>
              <h1 className={`dz-display ${s.h1}`}>Fresh meals for <span className={s.nameTag}>{pet.name}</span></h1>
              <p className={s.heroP}>Planned by a certified pet nutritionist from {poss} exact details. Cooked fresh, delivered chilled — never frozen.</p>
              <AppDownload layout="compact" source="fresh_food_hero" />
              <a className={s.ghostLink} href={FRESH_FOOD.guidePdf} download onClick={() => track("fresh_food_guide_download", { source: "hero" })}>Get the free guide (PDF) <span aria-hidden="true">↓</span></a>
            </>
          ) : (
            <>
              <h1 className={`dz-display ${s.h1}`} style={{ fontSize: "clamp(2.4rem,6vw,4.2rem)" }}>Fresh meals for <span className={s.nameTag}>{pet.name}</span> are coming soon</h1>
              <p className={s.heroP}>We're finishing our cat recipes. Tap Notify me and we'll tell you first.</p>
              {notified ? (
                <p role="status" className={s.notified}>Saved to {poss} passport. We'll let you know ✓</p>
              ) : (
                <Button variant="secondary" style={{ height: 56, fontSize: 18, padding: "0 28px" }} onClick={onNotify}>Notify me</Button>
              )}
            </>
          )}
        </div>

        <div ref={art} className={s.art} style={{ paddingTop: reduced ? 0 : "clamp(110px,13vw,170px)" }}>
          {!reduced && <PhoneFan artRef={art} visible={visible} />}
          <div ref={bowl} className={s.bowl} role="button" tabIndex={0} title="Tap to replay" aria-label="Replay the bowl animation"
            onClick={replay} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); replay(); } }}>
            <svg viewBox="0 0 400 300" role="img" aria-label={`A green bowl filled with ${ings.map((i) => i.label.toLowerCase()).join(", ")}`} stroke="var(--dz-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <g fill="none">
                <path data-steam="" d="M168 104c-12-14 12-24 0-38s12-24 0-38" />
                <path data-steam="" d="M204 96c-12-14 12-24 0-38s12-24 0-38" />
                <path data-steam="" d="M240 104c-12-14 12-24 0-38s12-24 0-38" />
              </g>
              <ellipse cx="200" cy="178" rx="140" ry="20" fill="var(--dz-cream)" />
              <g transform="translate(112 132)"><g data-ing=""><path d="M2 30c-4-18 10-32 32-30s36 12 34 28-16 26-34 24S6 46 2 30z" fill="var(--dz-paper)" /><path d="M20 22c8 4 18 4 28 0M24 34c6 2 14 2 20 0" fill="none" /></g></g>
              <g transform="translate(180 128)"><g data-ing=""><path d="M4 22C0 8 14-2 28 2s26 14 22 26-18 18-30 14S8 34 4 22z" fill="var(--dz-pink)" /><path d="M18 14c4 4 4 10 0 14" fill="none" /></g></g>
              <g transform="translate(250 134)" style={{ display: pet.type === "cat" ? "none" : "inline" }}><g data-ing=""><rect x="0" y="0" width="34" height="34" rx="7" fill="var(--dz-green)" transform="rotate(12 17 17)" /><path d="M14 -6c4 2 6 6 4 10" fill="none" /></g></g>
              <g transform="translate(146 98)"><g data-ing=""><path d="M0 20 L6 10 L12 18 L18 8 L24 18 L30 10 L36 20 C36 36 0 36 0 20z" fill="var(--dz-paper)" /></g></g>
              <g transform="translate(226 78)"><g data-ing=""><path d="M14 0C14 0 0 18 0 28a14 14 0 0 0 28 0C28 18 14 0 14 0z" fill="var(--dz-orange)" /><path d="M8 28a6 6 0 0 0 6 6" fill="none" stroke="var(--dz-paper)" /></g></g>
              <path d="M58 180c6 70 70 98 142 98s136-28 142-98c-30 14-86 20-142 20s-112-6-142-20z" fill="var(--dz-green)" />
              <path d="M120 222c20 10 50 14 80 14s60-4 80-14" fill="none" stroke="var(--dz-paper)" strokeWidth="2" />
              <path d="M150 276h100l-6 14h-88z" fill="var(--dz-green-700)" />
            </svg>
            <ul aria-label="What goes in the bowl" className={s.labels}>
              {ings.map((l, k) => <li key={l.key} data-label="" style={{ transform: `rotate(${ROTS[k % 5]})` }}>{l.label}</li>)}
            </ul>
            <div data-stamp="" aria-hidden="true" className={s.bowlStamp} style={{ color: soon ? "var(--danger)" : "var(--dz-green-700)" }}>
              {soon ? "Coming soon" : "Approved by nutritionist"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
