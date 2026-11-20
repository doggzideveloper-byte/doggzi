import { useEffect, useRef } from "react";
import type { Category } from "@/content/marketplace";
import { css } from "@/design-system/motion";
import { isReduced, useReduced } from "@/lib/reducedMotion";
import s from "./mk.module.css";

const LABELS: Record<Category, string> = { treats: "treat jar", toys: "rope toy", grooming: "spray bottle", walking: "leash", health: "supplement bottle" };
const FB = { transformBox: "fill-box", transformOrigin: "center" } as const;

/**
 * Phase-1 product visual: a category line-art tile in the pets-trio style with a small idle animation
 * (jar lid pops, toy squeaks, mist puffs, leash swings, bottle wobbles). No manufacturer images, ever.
 */
export function CategoryTile({ category, brand, large, muted, label }: { category: Category; brand: string; large?: boolean; muted?: boolean; label?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReduced();
  useEffect(() => {
    const r = root.current;
    if (!r || reduced || muted) return;
    let anims: Animation[] | null = null;
    const build = () => {
      const D = 3000, delay = Math.round(Math.random() * 1500);
      const o: KeyframeAnimationOptions = { duration: D, iterations: Infinity, delay, easing: "ease-in-out" };
      const all = (k: string) => [...r.querySelectorAll<SVGElement>(`[data-a="${k}"]`)];
      const A: Animation[] = [];
      all("lid").forEach((el) => A.push(el.animate([{ transform: "none" }, { transform: "translateY(-9px) rotate(-14deg)", offset: 0.12 }, { transform: "none", offset: 0.26 }, { transform: "none" }], { ...o, easing: css.bouncy })));
      all("crumb").forEach((el, i) => A.push(el.animate([{ opacity: 0, transform: "translateY(8px) scale(.4)" }, { opacity: 0, transform: "translateY(8px) scale(.4)", offset: 0.08 }, { opacity: 1, transform: "translateY(-4px) scale(1)", offset: 0.16 + i * 0.03 }, { opacity: 0, transform: "translateY(-10px) scale(.8)", offset: 0.32 }, { opacity: 0 }], o)));
      all("toy").forEach((el) => A.push(el.animate([{ transform: "none" }, { transform: "scale(1.08,.86)", offset: 0.1 }, { transform: "scale(.96,1.06)", offset: 0.18 }, { transform: "none", offset: 0.26 }, { transform: "none" }], o)));
      all("lines").forEach((el) => A.push(el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }], o)));
      all("mist").forEach((el, i) => A.push(el.animate([{ opacity: 0, transform: "translate(0,0) scale(.4)" }, { opacity: 1, transform: "translate(4px,0) scale(1)", offset: 0.1 + i * 0.04 }, { opacity: 0, transform: "translate(16px,-4px) scale(1.3)", offset: 0.4 }, { opacity: 0 }], o)));
      all("leash").forEach((el) => A.push(el.animate([{ transform: "rotate(-9deg)" }, { transform: "rotate(9deg)" }, { transform: "rotate(-9deg)" }], { ...o, duration: 2400 })));
      all("bottle").forEach((el) => A.push(el.animate([{ transform: "none" }, { transform: "rotate(-5deg)", offset: 0.08 }, { transform: "rotate(4deg)", offset: 0.16 }, { transform: "none", offset: 0.24 }, { transform: "none" }], o)));
      all("plus").forEach((el) => A.push(el.animate([{ transform: "none" }, { transform: "scale(1.25)", offset: 0.3 }, { transform: "none", offset: 0.45 }, { transform: "none" }], { ...o, easing: css.bouncy })));
      return A;
    };
    // Animate only while on screen.
    const io = new IntersectionObserver(([e]) => {
      const run = e.isIntersecting && !isReduced();
      if (run && !anims) anims = build();
      anims?.forEach((a) => (run ? a.play() : a.pause()));
    }, { threshold: 0.2 });
    io.observe(r);
    return () => {
      io.disconnect();
      anims?.forEach((a) => a.cancel());
    };
  }, [category, reduced, muted]);

  return (
    <div ref={root} role="img" aria-label={label || `Illustration: ${LABELS[category]} — ${brand}`} className={`${s.tile} ${muted ? s.tileMuted : ""}`}>
      <svg viewBox="0 0 120 90" aria-hidden="true" fill="var(--dz-paper)" stroke="var(--dz-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {category === "treats" && (
          <>
            <circle data-a="crumb" cx="50" cy="12" r="3" fill="var(--dz-cream)" style={{ ...FB, opacity: 0 }} />
            <circle data-a="crumb" cx="70" cy="9" r="2.5" fill="var(--dz-cream)" style={{ ...FB, opacity: 0 }} />
            <path d="M40 28h40v4c6 4 8 10 8 18v22a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8V50c0-8 2-14 8-18z" />
            <g data-a="lid" style={{ transformBox: "fill-box", transformOrigin: "0% 100%" }}><rect x="37" y="17" width="46" height="11" rx="4" fill="var(--dz-pink)" /></g>
            <rect x="40" y="46" width="40" height="22" rx="5" fill="var(--dz-cream)" />
            <path d="M52 54h16M52 60h16" fill="none" strokeWidth="5" />
            <path d="M52 54h16M52 60h16" fill="none" stroke="var(--dz-paper)" strokeWidth="1.6" />
          </>
        )}
        {category === "toys" && (
          <>
            <g data-a="lines"><path d="M14 36l-7-4M12 46H3M14 56l-7 4M106 36l7-4M108 46h9M106 56l7 4" fill="none" strokeWidth="2.2" /></g>
            <g data-a="toy" style={FB}>
              <path d="M30 48c10-14 20 14 30 0s20 14 30 0" fill="none" strokeWidth="9" />
              <path d="M30 48c10-14 20 14 30 0s20 14 30 0" fill="none" stroke="var(--dz-pink)" strokeWidth="4.4" />
              <circle cx="25" cy="50" r="10" /><path d="M19 46l12 8M19 54l12-8" fill="none" strokeWidth="1.8" />
              <circle cx="95" cy="46" r="10" /><path d="M89 42l12 8M89 50l12-8" fill="none" strokeWidth="1.8" />
            </g>
          </>
        )}
        {category === "grooming" && (
          <>
            <circle data-a="mist" cx="88" cy="22" r="2.6" strokeWidth="1.8" style={{ ...FB, opacity: 0 }} />
            <circle data-a="mist" cx="94" cy="16" r="2" strokeWidth="1.8" style={{ ...FB, opacity: 0 }} />
            <circle data-a="mist" cx="95" cy="27" r="2.2" strokeWidth="1.8" style={{ ...FB, opacity: 0 }} />
            <path d="M50 18h24l8 8H70v6H56v-6h-6z" fill="var(--dz-pink)" />
            <path d="M48 32h30v42a6 6 0 0 1-6 6H54a6 6 0 0 1-6-6z" />
            <rect x="52" y="44" width="22" height="18" rx="3" fill="var(--dz-cream)" />
            <path d="M58 53h10M63 48v10" fill="none" strokeWidth="2" />
          </>
        )}
        {category === "walking" && (
          <>
            <path d="M40 6h40" fill="none" strokeWidth="3" />
            <g data-a="leash" style={{ transformBox: "view-box", transformOrigin: "60px 6px" }}>
              <path d="M60 6v8" fill="none" />
              <ellipse cx="60" cy="24" rx="12" ry="10" fill="none" strokeWidth="7" />
              <ellipse cx="60" cy="24" rx="12" ry="10" fill="none" stroke="var(--dz-pink)" strokeWidth="3.2" />
              <path d="M60 34v32" fill="none" strokeWidth="6" />
              <path d="M60 34v32" fill="none" stroke="var(--dz-pink)" strokeWidth="2.4" />
              <rect x="53" y="66" width="14" height="8" rx="2" />
              <path d="M56 74v6a4 4 0 0 0 8 0" fill="none" />
            </g>
          </>
        )}
        {category === "health" && (
          <g data-a="bottle" style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}>
            <rect x="50" y="10" width="20" height="10" rx="2" fill="var(--dz-green)" />
            <path d="M46 20h28v4c4 2 6 6 6 10v38a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8V34c0-4 2-8 6-10z" />
            <rect x="44" y="38" width="32" height="28" rx="4" fill="var(--dz-cream)" />
            <g data-a="plus" style={FB}><path d="M60 44v16M52 52h16" fill="none" stroke="var(--dz-green)" strokeWidth="5" /></g>
          </g>
        )}
      </svg>
      <span className={s.tileBrand} style={large ? { fontSize: 16 } : undefined}>{brand}</span>
    </div>
  );
}
