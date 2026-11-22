import { useEffect, useId, useRef, useState } from "react";
import { css, ms } from "@/design-system/motion";
import type { Category } from "@/content/marketplace";
import type { MBrowse } from "@/lib/api/market";
import { isReduced } from "@/lib/reducedMotion";
import { PRICE_BUCKETS, type Filters } from "./filters";
import s from "./mk.module.css";

const TOP_BRANDS = 6;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <fieldset className={s.fsec} aria-labelledby={id}>
      <legend id={id} className={s.fhead}>{title}</legend>
      {children}
    </fieldset>
  );
}

function Opt({ type, name, checked, label, count, onChange }: { type: "radio" | "checkbox"; name: string; checked: boolean; label: string; count: number; onChange: () => void }) {
  return (
    <label className={s.opt} data-empty={count === 0 && !checked ? "" : undefined}>
      <input type={type} name={name} checked={checked} onChange={onChange} />
      <span className={s.optLabel}>{label}</span>
      <span className={s.optCount}>{count}</span>
    </label>
  );
}

/** The filter sections (PAGE_05 4b). Used as the desktop sidebar and inside the mobile Filters sheet. */
export function FilterPanel({ f, set, facets }: { f: Filters; set: (p: Partial<Filters>) => void; facets: MBrowse["facets"] | null }) {
  const name = useId();
  const [bq, setBq] = useState("");
  const [allBrands, setAllBrands] = useState(false);
  if (!facets) return <div className={s.fpanel} aria-busy="true" />;
  const toggle = (arr: string[], k: string) => (arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
  const bqn = bq.trim().toLowerCase();
  const brands = facets.brand.filter((b) => !bqn || b.label.toLowerCase().includes(bqn));
  const shown = bqn || allBrands ? brands : [...brands.slice(0, TOP_BRANDS), ...brands.slice(TOP_BRANDS).filter((b) => f.brand.includes(b.key))];
  return (
    <div className={s.fpanel}>
      <Section title="Category">
        {facets.category.map((c) => (
          <Opt key={c.key} type="radio" name={`${name}-cat`} label={c.label} count={c.count} checked={(f.cat || "all") === c.key}
            onChange={() => set({ cat: c.key === "all" ? null : (c.key as Category) })} />
        ))}
      </Section>
      <Section title="Price">
        {facets.price.map((p) => (
          <Opt key={p.key} type="checkbox" name={`${name}-price`} label={PRICE_BUCKETS.find((b) => b.key === p.key)?.label || p.label} count={p.count}
            checked={f.price.includes(p.key)} onChange={() => set({ price: toggle(f.price, p.key) })} />
        ))}
      </Section>
      <Section title="Brand">
        <label className={s.bsearch}>
          <span className="dz-sr-only">Search brands</span>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--dz-ink)" strokeWidth="2.4" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
          <input type="search" value={bq} placeholder="Search brands" autoComplete="off" onChange={(e) => setBq(e.target.value)} />
        </label>
        {shown.map((b) => (
          <Opt key={b.key} type="checkbox" name={`${name}-brand`} label={b.label} count={b.count} checked={f.brand.includes(b.key)} onChange={() => set({ brand: toggle(f.brand, b.key) })} />
        ))}
        {!shown.length && <p className={s.fnone}>No brand called “{bq.trim()}”.</p>}
        {!bqn && brands.length > TOP_BRANDS && (
          <button type="button" className={s.flink} aria-expanded={allBrands} onClick={() => setAllBrands(!allBrands)}>
            {allBrands ? "Show fewer" : `Show all (${brands.length})`}
          </button>
        )}
      </Section>
      <Section title="Pet">
        <div role="radiogroup" aria-label="Pet" className={s.seg}>
          {facets.pet.map((p) => (
            <button key={p.key} type="button" role="radio" aria-checked={f.pet === p.key} onClick={() => set({ pet: p.key as Filters["pet"] })}>
              {p.label}<span className={s.segCount}>{p.count}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Availability">
        <label className={s.switchRow}>
          <span>In stock only <span className={s.optCount}>{facets.in_stock}</span></span>
          <input type="checkbox" role="switch" className={s.switch} checked={f.stock} onChange={(e) => set({ stock: e.target.checked })} />
        </label>
      </Section>
    </div>
  );
}

/** "32 products": the number counts up or down when it changes (instant with reduced motion). */
export function ResultCount({ n }: { n: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(n);
  useEffect(() => {
    const el = ref.current;
    const from = shown.current;
    shown.current = n;
    if (!el || from === n) return;
    const word = (v: number) => `${v} product${v === 1 ? "" : "s"}`;
    if (isReduced()) return void (el.textContent = word(n));
    const t0 = performance.now(), dur = ms.base;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = word(Math.round(from + (n - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    el.animate([{ transform: "scale(1.12)" }, { transform: "none" }], { duration: dur, easing: css.bouncy });
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return <span ref={ref} aria-live="polite" className={s.resultCount}>{`${n} product${n === 1 ? "" : "s"}`}</span>;
}
