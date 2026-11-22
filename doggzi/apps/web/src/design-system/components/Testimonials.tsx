import { useEffect, useRef } from "react";
import { TESTIMONIALS, type Testimonial } from "@/content/explore-content";
import { useNarrow } from "@/lib/device";
import { useReduced } from "@/lib/reducedMotion";
import { Badge } from "./Badge";
import { PetAvatar } from "./PetAvatar";
import { useReveal } from "./useReveal";
import s from "./Testimonials.module.css";

/**
 * Real reviews only, collected with permission. Placeholders carry a visible badge;
 * an empty list (after the tag filter) hides the whole section.
 */
export function Testimonials({ tag, heading = "Happy tails", list = TESTIMONIALS }: { tag?: string; heading?: string; list?: Testimonial[] }) {
  const items = tag ? list.filter((t) => (t.tags || []).includes(tag)) : list;
  const narrow = useNarrow(720, 720);
  const reduced = useReduced();
  const marq = !narrow && !reduced && items.length >= 3;
  const sec = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  useReveal(sec, { deps: [items.length > 0] });

  useEffect(() => {
    anim.current?.cancel();
    anim.current = null;
    if (!marq || !track.current) return;
    anim.current = track.current.animate([{ transform: "translateX(0)" }, { transform: "translateX(-50%)" }], { duration: items.length * 9000, iterations: Infinity });
    return () => anim.current?.cancel();
  }, [marq, items.length]);

  if (!items.length) return null;
  const shown = marq ? [...items, ...items] : items;
  return (
    <section id="testimonials" ref={sec} className={s.sec} aria-labelledby="testimonials-h">
      <div className={s.head}>
        <div data-ri="" className={s.badges}>
          <Badge tone="cream">From Doggzi parents</Badge>
          {items.some((t) => t.placeholder) && <Badge tone="draft">Placeholder — real reviews only, with permission</Badge>}
        </div>
        <h2 data-ri="" id="testimonials-h" className="dz-h2">{heading}</h2>
      </div>
      <div data-ri="" className={`${s.scroller} dz-noscrollbar ${marq ? s.marquee : ""}`} onMouseEnter={() => anim.current?.pause()} onMouseLeave={() => anim.current?.play()}>
        <div ref={track} className={s.track}>
          {shown.map((t, i) => (
            <figure key={i} aria-hidden={i >= items.length || undefined} className={`${s.card} ${t.placeholder ? s.ph : ""}`}>
              <div className={s.who}>
                <PetAvatar type={t.type} breed={t.breed} size={52} bg="var(--dz-paper)" />
                <span style={{ display: "flex", flexDirection: "column", gap: "0.125rem", minWidth: 0 }}>
                  <span className={s.pet}>{t.pet}</span>
                  <span className={s.meta}>{t.parent} · {t.area}</span>
                </span>
              </div>
              <blockquote className={s.quote}>“{t.quote}”</blockquote>
              <figcaption className={s.cap}>
                <span className={s.svc}>{t.service}</span>
                {t.placeholder && <span className={s.phLabel}>Placeholder</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
