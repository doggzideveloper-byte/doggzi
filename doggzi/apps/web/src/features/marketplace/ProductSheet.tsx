import { useEffect, useRef, useState } from "react";
import { CATEGORIES, DELIVERY_ESTIMATE } from "@/content/marketplace";
import { css } from "@/design-system/motion";
import type { MListing } from "@/lib/api/market";
import { inrPaise } from "@/lib/format";
import { isReduced } from "@/lib/reducedMotion";
import { CategoryTile } from "./CategoryTile";
import { distanceKm } from "./data";
import s from "./mk.module.css";

/** Product sheet: bottom sheet on mobile, modal on desktop. */
export function ProductSheet({ item, narrow, notified, onAdd, onNotify, onClose }: { item: MListing; narrow: boolean; notified: boolean; onAdd: (qty: number, el: HTMLElement) => void; onNotify: () => void; onClose: () => void }) {
  const [qty, setQty] = useState(1);
  const sheet = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>("[data-close]")?.focus({ preventScroll: true });
    if (isReduced()) return;
    sheet.current?.animate(narrow ? [{ transform: "translateY(100%)" }, { transform: "none" }] : [{ transform: "translateY(24px) scale(.94)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 420, easing: narrow ? css.easeOut : css.bouncy });
    backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: css.easeOut });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = (after?: () => void) => {
    const p = sheet.current;
    const done = () => { onClose(); after?.(); };
    if (!p || isReduced()) return done();
    p.animate([{ transform: "none", opacity: 1 }, { transform: narrow ? "translateY(100%)" : "translateY(20px) scale(.96)", opacity: narrow ? 1 : 0 }], { duration: 260, easing: css.easeOut, fill: "forwards" }).onfinish = done;
  };
  const d = distanceKm(item.vendor);
  const pack = item.pack_size || item.name.match(/(\d+(?:\.\d+)?\s?(?:g|gm|ml|psc|pcs)\b|Pack of \d+|\d+ Sticks)/i)?.[1]?.replace(/psc/i, "pcs");
  return (
    <div className={`${s.sheetRoot} ${narrow ? s.narrow : ""}`}>
      <div ref={backdrop} className={s.backdrop} onClick={() => close()} aria-hidden="true" />
      <div ref={sheet} role="dialog" aria-modal="true" aria-labelledby="sh-title" data-card="" className={s.sheet}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); close(); }
          else if (e.key === "Tab") {
            const f = [...sheet.current!.querySelectorAll<HTMLElement>("button:not(:disabled)")];
            const i = f.indexOf(document.activeElement as HTMLElement);
            if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]?.focus(); }
            else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]?.focus(); }
          }
        }}>
        <button type="button" data-close="" className={s.round} style={{ position: "absolute", top: 12, right: 12, zIndex: 2 }} onClick={() => close()} aria-label="Close">×</button>
        <div style={{ minWidth: 0 }}><CategoryTile category={item.category} brand={item.brand} large muted={!item.in_stock} /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <span className={s.storeChip} style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", background: "var(--dz-pink-200)", padding: "2px 10px", border: "2px solid var(--dz-ink)" }}>{CATEGORIES.find((c) => c.key === item.category)?.label}</span>
          <h2 id="sh-title" style={{ margin: 0, paddingRight: 44, fontSize: "clamp(1.2rem,2.4vw,1.5rem)", fontWeight: 600, lineHeight: 1.3 }}>{item.name}</h2>
          <span style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: 16, letterSpacing: ".06em", textTransform: "uppercase" }}>{item.brand}</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span className={s.price} style={{ fontSize: 30 }}>{inrPaise(item.price_paise)}</span>
            {item.mrp_paise && <s className={s.mrp} style={{ fontSize: 15 }}>MRP {inrPaise(item.mrp_paise)}</s>}
          </div>
          {item.description && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{item.description}</p>}
          {pack && <p style={{ margin: 0, fontSize: 15 }}><strong style={{ fontWeight: 600 }}>Pack:</strong> {pack}</p>}
          {item.in_stock ? (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
              <div role="group" aria-label="Quantity" className={s.stepper}>
                <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                <span aria-live="polite" style={{ minWidth: 32, textAlign: "center", fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: 22 }}>{qty}</span>
                <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(Math.min(10, item.available_qty), q + 1))}>+</button>
              </div>
              <button type="button" className={s.primary} style={{ flex: "1 1 180px", height: 52, background: "var(--dz-pink)" }} onClick={() => { const el = sheet.current!; onAdd(qty, el); close(); }}>
                Add {qty} · {inrPaise(item.price_paise * qty)}
              </button>
            </div>
          ) : (
            <button type="button" className={s.notify} style={{ height: 52, fontSize: 16 }} onClick={onNotify}>{notified ? "We'll tell you ✓" : "Notify me when it’s back"}</button>
          )}
          <div className={s.soldBy}>
            <span style={{ flex: "none", width: 44, height: 44, borderRadius: 999, background: "var(--dz-paper)", border: "2px solid var(--dz-ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 24, height: 24 }} fill="var(--dz-pink-200)" stroke="var(--dz-ink)" strokeWidth="1.9" strokeLinejoin="round"><path d="M3 10l2-6h14l2 6" /><path d="M4 10h16v10H4z" fill="var(--dz-paper)" /><path d="M10 20v-5h4v5" /></svg>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-75)" }}>Sold by</span>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{item.vendor.name}</span>
              <span style={{ fontSize: 13 }}>{[item.vendor.area, d != null ? `${d} km away` : null].filter(Boolean).join(" · ")}</span>
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{DELIVERY_ESTIMATE}</p>
        </div>
      </div>
    </div>
  );
}
