import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useReduced } from "@/lib/reducedMotion";
import s from "./ff.module.css";

// From reference/fresh-food-vs-kibble.pdf (Fresh Food wording)
const ROWS = [
  { label: "Ingredients", doggzi: "Human-grade fresh meat, veggies and oils", kibble: "Processed meat meals, fillers, artificial flavours" },
  { label: "Nutrition", doggzi: "Balanced with vitamins and minerals, no preservatives", kibble: "Nutrient loss from high-heat processing" },
  { label: "Digestibility", doggzi: "Highly digestible, easy on the gut", kibble: "Harder to digest, may cause bloating or gas" },
  { label: "Palatability", doggzi: "They love the fresh smell and taste", kibble: "Often sprayed with fat to add taste" },
  { label: "Health outcome", doggzi: "Shiny coat, more energy, fewer vet visits", kibble: "Possible long-term allergies, obesity, joint issues" },
];

export interface SliderHandle { hint: () => void }

/** Draggable sticker handle reveals DOGGZI over KIBBLE. Arrow keys move it. Reduced motion: side-by-side, no drag. */
export const KibbleSlider = forwardRef<SliderHandle, { narrow: boolean }>(function KibbleSlider({ narrow }, ref) {
  const reduced = useReduced();
  const [split, setSplit] = useState(50);
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const hintRaf = useRef(0);
  const dragRef = useRef(false);
  dragRef.current = dragging;

  useImperativeHandle(ref, () => ({
    hint: () => {
      if (reduced) return;
      const keys = [[0, 50], [0.35, 72], [0.7, 34], [1, 50]], dur = 1600, t0 = performance.now() + 500;
      const step = (now: number) => {
        if (dragRef.current) return;
        const t = Math.max(0, Math.min(1, (now - t0) / dur));
        let i = 0;
        while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
        const [a, va] = keys[i], [b, vb] = keys[i + 1], k = (t - a) / (b - a), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        setSplit(va + (vb - va) * e);
        if (t < 1) hintRaf.current = requestAnimationFrame(step);
      };
      hintRaf.current = requestAnimationFrame(step);
    },
  }), [reduced]);
  useEffect(() => () => cancelAnimationFrame(hintRaf.current), []);

  const fromEvent = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    setSplit(Math.max(4, Math.min(96, ((e.clientX - r.left) / r.width) * 100)));
  };
  const onKey = (e: KeyboardEvent) => {
    const d = ({ ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -20, PageUp: 20 } as Record<string, number>)[e.key];
    if (d) {
      e.preventDefault();
      cancelAnimationFrame(hintRaf.current);
      setSplit((v) => Math.max(4, Math.min(96, v + d)));
    } else if (e.key === "Home") { e.preventDefault(); setSplit(4); }
    else if (e.key === "End") { e.preventDefault(); setSplit(96); }
  };

  const cls = narrow ? s.narrow : "";
  if (reduced)
    return (
      <div className={`${s.slider} ${s.reducedCols} ${cls}`}>
        <div className={`${s.kib} ${s.layer}`}>
          <div className={s.sideHead} style={{ color: "var(--ink-75)", gridTemplateColumns: "1fr" }}>Kibble</div>
          {ROWS.map((r) => <div key={r.label} className={s.cell} style={{ padding: "10px 0", borderTop: "2px dashed rgba(20,18,16,.25)", color: "rgba(20,18,16,.8)" }}><span aria-hidden="true" className={s.mark} style={{ border: "2px solid rgba(20,18,16,.7)" }}>✗</span><span><strong>{r.label}:</strong> {r.kibble}</span></div>)}
        </div>
        <div className={s.layer} style={{ background: "var(--dz-paper)" }}>
          <div className={s.sideHead} style={{ color: "var(--dz-green-700)", gridTemplateColumns: "1fr" }}>Doggzi</div>
          {ROWS.map((r) => <div key={r.label} className={s.cell} style={{ padding: "10px 0", borderTop: "2px dashed rgba(9,164,96,.4)", fontWeight: 600 }}><span aria-hidden="true" className={s.mark} style={{ border: "2px solid var(--dz-ink)", background: "var(--dz-green)", color: "var(--dz-paper)" }}>✓</span><span><strong>{r.label}:</strong> {r.doggzi}</span></div>)}
        </div>
      </div>
    );

  return (
    <div ref={box} className={`${s.slider} ${cls}`} style={{ cursor: dragging ? "grabbing" : "ew-resize" }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        cancelAnimationFrame(hintRaf.current);
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        fromEvent(e);
      }}
      onPointerMove={(e) => dragging && fromEvent(e)}
      onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
      <div className={`${s.kib} ${s.layer}`}>
        <div className={s.sideHead}><span style={{ color: "var(--ink-75)" }}>Kibble</span><span className={s.hide} style={{ textAlign: "right" }}>Doggzi</span></div>
        {ROWS.map((r) => (
          <div key={r.label} className={s.row}>
            <span className={s.cell} style={{ color: "rgba(20,18,16,.8)" }}><span aria-hidden="true" className={s.mark} style={{ border: "2px solid rgba(20,18,16,.7)" }}>✗</span>{r.kibble}</span>
            <span className={s.rowLabel}>{r.label}</span>
            <span className={`${s.cell} ${s.hide}`} style={{ fontWeight: 600 }}><span className={s.mark} />{r.doggzi}</span>
          </div>
        ))}
      </div>
      <div className={`${s.fresh} ${s.layer}`} style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
        <div className={s.sideHead}><span className={s.hide}>Kibble</span><span style={{ textAlign: "right", color: "var(--dz-green-700)" }}>Doggzi</span></div>
        {ROWS.map((r) => (
          <div key={r.label} className={s.row}>
            <span className={`${s.cell} ${s.hide}`}><span className={s.mark} />{r.kibble}</span>
            <span className={s.rowLabel}>{r.label}</span>
            <span className={s.cell} style={{ fontWeight: 600 }}><span aria-hidden="true" className={s.mark} style={{ border: "2px solid var(--dz-ink)", background: "var(--dz-green)", color: "var(--dz-paper)" }}>✓</span>{r.doggzi}</span>
          </div>
        ))}
      </div>
      <div aria-hidden="true" className={s.divider} style={{ left: `${split}%` }} />
      <div role="slider" tabIndex={0} aria-label="Compare kibble and Doggzi fresh food" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)} aria-valuetext={`${Math.round(split)}% kibble shown`}
        onKeyDown={onKey} className={s.handle} style={{ left: `${split}%` }}>
        <svg viewBox="0 0 32 16" aria-hidden="true" style={{ width: 28, height: 14 }}><path d="M10 2 3 8l7 6M22 2l7 6-7 6" fill="none" stroke="var(--dz-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
    </div>
  );
});
