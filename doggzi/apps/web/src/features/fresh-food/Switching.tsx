import { Badge } from "@/design-system/components";
import { TRANSITION } from "@/content/fresh-food";
import s from "./ff.module.css";

/** 7-day kibble → fresh strip. Ratios are DRAFT config (content/fresh-food.ts) until the nutritionist signs off. */
export function Switching() {
  return (
    <section id="switching" data-reveal="" className={s.band}>
      <div className={`${s.wrap} ${s.sec}`}>
        <div data-ri="" className={s.head}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Badge tone="cream">Switching from kibble</Badge>
            <Badge tone="draft">Draft ratios — confirm before launch</Badge>
          </div>
          <h2 className="dz-h2">A gentle week-long switch</h2>
          <p className={s.muted}>General guide — your nutritionist will tailor it.</p>
        </div>
        <ol className={s.days}>
          {TRANSITION.map((t) => (
            <li key={t.days} data-ri="" className={s.day}>
              <span style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: 18, letterSpacing: ".08em", textTransform: "uppercase" }}>{t.days}</span>
              <div aria-hidden="true" style={{ width: "100%", maxWidth: 170, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div className={s.miniBowl}>
                  <div style={{ width: `${t.fresh}%`, background: "var(--dz-orange)", borderRight: t.fresh > 0 && t.fresh < 100 ? "var(--stroke)" : 0 }} />
                </div>
                <div className={s.miniFoot} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 500, textAlign: "center" }}>{t.fresh >= 100 ? "All fresh" : `${t.fresh}% fresh · ${100 - t.fresh}% kibble`}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
