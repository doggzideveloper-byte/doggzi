import { useEffect, useRef } from "react";
import { Button } from "@/design-system/components";
import { css } from "@/design-system/motion";
import type { MBrowse } from "@/lib/api/market";
import { isReduced } from "@/lib/reducedMotion";
import { FilterPanel } from "./FilterPanel";
import type { Filters } from "./filters";
import s from "./mk.module.css";

/** Tablet and mobile: the sidebar's sections in a bottom sheet. Filters apply live; the button just closes. */
export function FilterSheet({ f, set, clear, active, facets, total, onClose }: {
  f: Filters; set: (p: Partial<Filters>) => void; clear: () => void; active: number; facets: MBrowse["facets"] | null; total: number; onClose: () => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>("[data-close]")?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!isReduced()) {
      sheet.current?.animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: 420, easing: css.easeOut });
      backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: css.easeOut });
    }
    return () => { document.body.style.overflow = prev; };
  }, []);
  const close = () => {
    const p = sheet.current;
    if (!p || isReduced()) return onClose();
    p.animate([{ transform: "none" }, { transform: "translateY(100%)" }], { duration: 260, easing: css.easeOut, fill: "forwards" }).onfinish = onClose;
  };
  return (
    <div className={`${s.sheetRoot} ${s.narrow}`}>
      <div ref={backdrop} className={s.backdrop} onClick={close} aria-hidden="true" />
      <div ref={sheet} role="dialog" aria-modal="true" aria-labelledby="fs-title" className={s.fsheet}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); close(); }
          else if (e.key === "Tab") {
            const all = [...sheet.current!.querySelectorAll<HTMLElement>("button:not(:disabled), input")];
            const i = all.indexOf(document.activeElement as HTMLElement);
            if (e.shiftKey && i <= 0) { e.preventDefault(); all[all.length - 1]?.focus(); }
            else if (!e.shiftKey && i === all.length - 1) { e.preventDefault(); all[0]?.focus(); }
          }
        }}>
        <div className={s.fsheetHead}>
          <h2 id="fs-title" className={s.fsheetTitle}>Filters</h2>
          {active > 0 && <button type="button" className={s.flink} onClick={clear}>Clear all</button>}
          <button type="button" data-close="" className={s.round} onClick={close} aria-label="Close filters">×</button>
        </div>
        <div className={s.fsheetBody}><FilterPanel f={f} set={set} facets={facets} /></div>
        <div className={s.fsheetFoot}>
          <Button block onClick={close}>Show {total} product{total === 1 ? "" : "s"}</Button>
        </div>
      </div>
    </div>
  );
}
