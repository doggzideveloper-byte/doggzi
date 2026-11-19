import { useEffect, useRef } from "react";
import { Badge } from "@/design-system/components";
import { css } from "@/design-system/motion";
import { isReduced } from "@/lib/reducedMotion";
import s from "./ff.module.css";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Kitchen → chilled van → door. The route line-draws and the van drives it, trailing chill-vapour puffs. */
export function KitchenRoute() {
  const sec = useRef<HTMLElement>(null);
  const path = useRef<SVGPathElement>(null);
  const van = useRef<SVGGElement>(null);
  const puffs = useRef<SVGGElement>(null);

  useEffect(() => {
    const p = path.current, v = van.current, g = puffs.current;
    if (!p || !v || !g || !sec.current) return;
    let pos: DOMPoint | null = null, raf = 0, lastPuff = 0;
    const place = (t: number) => {
      const L = p.getTotalLength(), pt = p.getPointAtLength(L * t), pt2 = p.getPointAtLength(Math.min(L, L * t + 1));
      const ang = Math.max(-18, Math.min(18, (Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * 180) / Math.PI));
      pos = pt;
      v.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
    };
    const puff = () => {
      if (!pos) return;
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", (pos.x - 30 + Math.random() * 4).toFixed(1));
      c.setAttribute("cy", (pos.y - 44 + Math.random() * 10).toFixed(1));
      c.setAttribute("r", (5 + Math.random() * 4).toFixed(1));
      c.setAttribute("fill", "var(--dz-paper)");
      c.setAttribute("stroke", "var(--dz-ink)");
      c.setAttribute("stroke-width", "1.6");
      c.style.transformBox = "fill-box";
      c.style.transformOrigin = "center";
      g.appendChild(c);
      c.animate([{ transform: "scale(.4)", opacity: 0.9 }, { transform: `translate(${-18 - Math.random() * 16}px,${-8 - Math.random() * 14}px) scale(1.7)`, opacity: 0 }], { duration: 950, easing: css.easeOut, fill: "forwards" }).onfinish = () => c.remove();
    };
    if (isReduced()) {
      place(1);
      return;
    }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      p.animate([{ strokeDashoffset: 600, opacity: 0 }, { strokeDashoffset: 0, opacity: 1 }], { duration: 900, easing: css.easeOut });
      const t0 = performance.now() + 400, dur = 2800;
      const step = (now: number) => {
        const t = Math.max(0, Math.min(1, (now - t0) / dur));
        const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        place(k);
        if (t > 0 && t < 1 && now - lastPuff > 110) { lastPuff = now; puff(); }
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.35 });
    io.observe(sec.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  return (
    <section ref={sec} id="kitchen-to-door" data-reveal="" className={`${s.wrap} ${s.sec} ${s.route}`} style={{ gap: "clamp(20px,3vw,32px)" }}>
      <div data-ri="" className={s.head}>
        <Badge>Kitchen to door</Badge>
        <h2 className="dz-h2">Track every bowl, live</h2>
      </div>
      <svg viewBox="0 0 1000 250" role="img" aria-label="Route from the kitchen, in a chilled van, to your door" stroke="var(--dz-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path ref={path} d="M110 135 C 260 20, 360 250, 500 135 S 740 20, 890 135" fill="none" strokeWidth="3" strokeDasharray="2 12" />
        <g transform="translate(110 135)"><circle r="54" fill="var(--dz-orange)" /><g fill="var(--dz-cream)"><path d="M-24 -2h48v16c0 10-8 18-18 18h-12c-10 0-18-8-18-18z" /><path d="M-30 -2h60" fill="none" /><path d="M-6 -10h12" fill="none" /><path d="M-8 -22c-3-4 3-6 0-10M8 -22c-3-4 3-6 0-10" fill="none" /></g></g>
        <g transform="translate(500 135)"><circle r="54" fill="var(--dz-green)" /><g fill="none" stroke="var(--dz-cream)" strokeWidth="3.2"><path d="M0 -26v52M-22 -13l44 26M-22 13l44 -26" /><path d="M-6 -22l6 5 6 -5M-6 22l6 -5 6 5" /></g></g>
        <g transform="translate(890 135)"><circle r="54" fill="var(--dz-pink)" /><g fill="var(--dz-cream)"><path d="M-18 30v-52a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v52z" /><circle cx="8" cy="4" r="2.6" fill="var(--dz-ink)" /><path d="M-30 30h60" fill="none" /></g></g>
        <g ref={puffs} />
        <g ref={van} transform="translate(110 135)"><VanArt /></g>
      </svg>
      <div data-ri="" className={s.stops}>
        <div><div className={s.stopT}>Kitchen</div><div className={s.stopB}>Cooked fresh</div></div>
        <div><div className={s.stopT}>Chilled van</div><div className={s.stopB}>Kept chilled, never frozen</div></div>
        <div><div className={s.stopT}>Your door</div><div className={s.stopB}>On time, portioned &amp; labelled</div></div>
      </div>
    </section>
  );
}

/** The chilled van, reused by ServiceScene (pickup). Origin is the wheel line centre. */
export function VanArt() {
  return (
    <g transform="translate(-30 -66)">
      <path d="M2 8h36v26H2z" fill="var(--dz-paper)" />
      <path d="M38 14h12l8 10v10H38z" fill="var(--dz-orange)" />
      <path d="M42 17h7l5 7h-12z" fill="var(--dz-cream)" strokeWidth="2" />
      <circle cx="14" cy="36" r="5.5" fill="var(--dz-ink)" />
      <circle cx="48" cy="36" r="5.5" fill="var(--dz-ink)" />
      <path d="M14 16v10M9 21h10" stroke="var(--dz-green)" strokeWidth="2.6" />
    </g>
  );
}
