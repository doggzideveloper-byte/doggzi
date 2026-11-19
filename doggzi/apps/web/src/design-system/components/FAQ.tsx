import { useEffect, useRef, useState } from "react";
import { FAQ_SETS, type FaqSet } from "@/content/explore-content";
import { Badge } from "./Badge";
import { useReveal } from "./useReveal";
import s from "./FAQ.module.css";

/** Accordion (one open at a time, "+" rotates to "×") with FAQPage JSON-LD. All answers are drafts until confirmed. */
export function FAQ({ set = "explore", heading = "Good questions" }: { set?: FaqSet; heading?: string }) {
  const list = FAQ_SETS[set];
  const [open, setOpen] = useState(-1);
  const sec = useRef<HTMLElement>(null);
  useReveal(sec, { threshold: 0.08, deps: [set] });

  useEffect(() => {
    if (!list.length) return;
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: list.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
    document.head.appendChild(ld);
    return () => ld.remove();
  }, [list]);

  if (!list.length) return null;
  return (
    <section id="faq" ref={sec} className={s.sec} aria-labelledby={`faq-${set}-h`}>
      <div data-ri="" className={s.head}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Badge>FAQ</Badge>
          <Badge tone="draft">Draft answers — confirm before launch</Badge>
        </div>
        <h2 id={`faq-${set}-h`} className="dz-h2">{heading}</h2>
      </div>
      <div className={s.list}>
        {list.map((f, i) => {
          const isOpen = open === i;
          return (
            <div data-ri="" key={f.q} className={`${s.item} ${isOpen ? s.open : ""}`}>
              <h3 style={{ margin: 0 }}>
                <button type="button" id={`faq-${set}-b${i}`} aria-expanded={isOpen} aria-controls={`faq-${set}-p${i}`} className={s.q} onClick={() => setOpen(isOpen ? -1 : i)}>
                  <span>{f.q}</span>
                  <span aria-hidden="true" className={s.icon}>+</span>
                </button>
              </h3>
              <div id={`faq-${set}-p${i}`} role="region" aria-labelledby={`faq-${set}-b${i}`} className={s.panel}>
                <div><p className={s.a}>{f.a}</p></div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
