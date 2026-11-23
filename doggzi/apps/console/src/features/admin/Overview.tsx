import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isReduced } from "@doggzi/ui/lib/reducedMotion";
import { errMsg } from "@/lib/api";
import { beep, inr, istDayLabel, istTime, istYmd } from "@/lib/format";
import { useUi } from "../common/ui";
import { adm, type Kpi, type Live, type Range, type RangeKey } from "./api";
import { redPulse } from "./kit";
import s from "./adm.module.css";

const RANGES: [RangeKey, string][] = [["today", "Today"], ["yesterday", "Yesterday"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["month", "This month"], ["lastmonth", "Last month"], ["custom", "Custom range"]];
const KPI: Record<Kpi["key"], [string, string, (n: number) => string]> = {
  bookings: ["Bookings", "var(--dz-green)", (n) => n.toLocaleString("en-IN")],
  orders: ["Marketplace orders", "var(--dz-pink)", (n) => n.toLocaleString("en-IN")],
  gmv_paise: ["GMV", "var(--dz-orange)", inr],
  aov_paise: ["Avg order value", "var(--dz-orange)", inr],
  passports: ["Passports created", "var(--dz-ink)", (n) => n.toLocaleString("en-IN")],
};
const KEY = "dz.admin.range";

function loadRange(): Range {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "null") || { key: "today" }; } catch { return { key: "today" }; }
}

function delta(cur: number, prev: number): [string, "up" | "down" | "flat"] {
  if (!prev) return cur ? ["▲ new vs previous period", "up"] : ["— 0% vs previous period", "flat"];
  const p = Math.round(((cur - prev) / prev) * 100);
  return p > 0 ? [`▲ ${p}% vs previous period`, "up"] : p < 0 ? [`▼ ${-p}% vs previous period`, "down"] : ["— 0% vs previous period", "flat"];
}

export function Overview({ go }: { go: (mod: string) => void }) {
  const { muted } = useUi();
  const [range, setRange] = useState<Range>(loadRange);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(range)); } catch { /* private mode */ } }, [range]);
  const ready = range.key !== "custom" || (!!range.from && !!range.to);
  const q = useQuery({ queryKey: ["ad", "overview", range], queryFn: () => adm.overview(range), refetchInterval: 30_000, placeholderData: keepPreviousData, enabled: ready });
  const live = useQuery({ queryKey: ["ad", "live"], queryFn: adm.live, refetchInterval: 15_000 });
  const [liveOpen, setLiveOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const d = q.data;
  const today = istYmd();

  // A newly overdue item slides in red and rings once.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!d) return;
    const ids = d.overdue.map((o) => o.id);
    if (seen.current) {
      const nw = ids.filter((i) => !seen.current!.has(i));
      if (nw.length) {
        beep(muted);
        window.setTimeout(() => nw.forEach((i) => redPulse(document.querySelector(`[data-overdue="${i}"]`))), 50);
      }
    }
    seen.current = new Set(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  const pick = (k: RangeKey) => setRange((r) => (k === "custom" ? { key: "custom", from: r.from || istYmd(new Date(Date.now() - 6 * 864e5)), to: r.to || today } : { key: k }));
  const lv: Live = live.data || d?.live || { total: 0, pages: [], mobile: 0, desktop: 0 };
  const ago = q.dataUpdatedAt ? Math.round((now - q.dataUpdatedAt) / 1000) : null;
  const max = (xs: { n: number }[]) => Math.max(1, ...xs.map((x) => x.n));

  return (
    <>
      <div className={s.titleRow}>
        <h1 className={s.h1}>Overview</h1>
        <span role="status" className={s.muted} style={{ fontWeight: 500 }}>Live · updated {ago === null ? "…" : ago < 5 ? "just now" : `${ago}s ago`} · refreshes every 30s</span>
      </div>
      <div className={s.rangeBar}>
        <div role="group" aria-label="Date range" className={s.ranges}>
          {RANGES.map(([k, l]) => <button key={k} type="button" className={s.range} aria-pressed={range.key === k} onClick={() => pick(k)}>{l}</button>)}
        </div>
        {range.key === "custom" && (
          <div className={s.custom}>
            <label>From<input type="date" value={range.from || ""} max={today} onChange={(e) => { const v = e.target.value; if (v) setRange((r) => ({ ...r, from: v, to: r.to && r.to < v ? v : r.to })); }} /></label>
            <label>To<input type="date" value={range.to || ""} max={today} onChange={(e) => { const v = e.target.value; if (v) setRange((r) => ({ ...r, to: v, from: r.from && r.from > v ? v : r.from })); }} /></label>
          </div>
        )}
        {d && <span className={s.rangeText}>{d.range.text}<span> · vs {d.range.prev_text} (IST)</span></span>}
      </div>
      {q.isError && <p role="alert" className={s.err}>{errMsg(q.error, "We couldn't load the overview. Retrying every 30 seconds.")}</p>}
      <div className={s.kpis}>
        <button type="button" className={s.kpi} style={{ "--k": "var(--dz-green)" } as React.CSSProperties} onClick={() => setLiveOpen(true)} aria-label={`${lv.total} people on the site right now. Open breakdown`}>
          <span><LiveDot />Live visitors</span>
          <span className={s.kpiV}>{lv.total}</span>
          <span className={s.delta} style={{ fontWeight: 500 }}>people on the site right now · tap for breakdown</span>
        </button>
        {(d?.kpis || []).map((k) => {
          const [label, color, fmt] = KPI[k.key];
          const [txt, dir] = delta(k.cur, k.prev);
          return (
            <div key={k.key} className={s.kpi} style={{ "--k": color } as React.CSSProperties}>
              <span>{label}</span><span className={s.kpiV}>{fmt(k.cur)}</span><span className={s.delta} data-dir={dir}>{txt}</span>
            </div>
          );
        })}
        {d && (
          <div className={s.kpi} style={{ "--k": "var(--dz-alert)" } as React.CSSProperties}>
            <span>Overdue now</span><span className={s.kpiV}>{d.overdue.length}</span><span className={s.delta} data-dir="flat">Live, not affected by the range</span>
          </div>
        )}
        {!d && !q.isError && [0, 1, 2, 3, 4].map((i) => <div key={i} className={s.skel} />)}
      </div>
      {d && (
        <div className={s.grid3}>
          <section className={s.section} data-tone="alert">
            <h2 className={s.h2}>Overdue<span className={s.badge}>{d.overdue.length}</span></h2>
            {!d.overdue.length && <p className={s.muted} style={{ margin: 0, fontSize: "0.875rem" }}>Nothing overdue. Nice.</p>}
            <ul className={s.overdue}>
              {d.overdue.map((o) => (
                <li key={o.id} data-overdue={o.id}>
                  <span><b>{o.title}</b><small>{o.slot_start ? o.sub.replace(o.slot_start, `${istDayLabel(o.slot_start)} ${istTime(o.slot_start)}`) : o.sub}</small></span>
                  <button type="button" className={s.small} onClick={() => go(o.module)}>Open</button>
                </li>
              ))}
            </ul>
          </section>
          <section className={s.section}>
            <h2 className={s.h2}>Bookings by status</h2>
            {d.booking_bars.map((b) => <Bar key={b.label} label={b.label} n={b.n} max={max(d.booking_bars)} color="var(--dz-green)" />)}
            <h2 className={s.h2} style={{ marginTop: "0.375rem" }}>Marketplace orders by status</h2>
            {d.order_bars.map((b) => <Bar key={b.label} label={b.label} n={b.n} max={max(d.order_bars)} color="var(--dz-pink)" />)}
          </section>
          <section className={s.section}>
            <h2 className={s.h2}>Fresh Food funnel</h2>
            {d.funnel.map((f) => (
              <div key={f.label} className={s.funnel}>
                <span><span>{f.label}</span><b>{f.n.toLocaleString("en-IN")}</b></span>
                <span className={s.track}><span style={{ width: `${(f.n / max(d.funnel)) * 100}%`, "--c": "var(--dz-orange)" } as React.CSSProperties} /></span>
              </div>
            ))}
            <h2 className={s.h2} style={{ marginTop: "0.375rem" }}>New partner applications</h2>
            {!d.applications.length && <p className={s.muted} style={{ margin: 0 }}>None waiting.</p>}
            <ul className={s.apps}>
              {d.applications.map((a) => <li key={a.kind + a.name}><b>{a.name}</b><span>{a.kind} · {istDayLabel(a.at) === "Today" ? istTime(a.at) : istDayLabel(a.at)}</span></li>)}
            </ul>
          </section>
        </div>
      )}
      {liveOpen && <LiveDialog live={lv} onClose={() => setLiveOpen(false)} />}
    </>
  );
}

function Bar({ label, n, max, color }: { label: string; n: number; max: number; color: string }) {
  return (
    <div className={s.barRow}>
      <span>{label}</span>
      <span className={s.track}><span style={{ width: `${(n / max) * 100}%`, "--c": color } as React.CSSProperties} /></span>
      <span>{n.toLocaleString("en-IN")}</span>
    </div>
  );
}

function LiveDot() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (isReduced() || !ref.current) return;
    const a = ref.current.animate([{ transform: "scale(1)", opacity: 0.6 }, { transform: "scale(2.4)", opacity: 0 }], { duration: 1600, iterations: Infinity, easing: "ease-out" });
    return () => a.cancel();
  }, []);
  return <span className={s.dot} aria-hidden="true"><span ref={ref} /><span /></span>;
}

function LiveDialog({ live, onClose }: { live: Live; onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); prev?.focus(); };
  }, [onClose]);
  const max = Math.max(1, ...live.pages.map((p) => p.n));
  return (
    <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="lv-t" className={s.dialog}>
        <div className={s.dialogHead}><h2 id="lv-t">{live.total} {live.total === 1 ? "person" : "people"} on the site right now</h2><button ref={ref} type="button" className={s.close} aria-label="Close" onClick={onClose}>×</button></div>
        <span className={s.muted} style={{ fontSize: "0.75rem" }}>Refreshes every 15s · ignores the date range · anonymous (no personal data)</span>
        <h3 className={s.h2} style={{ fontSize: "0.9375rem" }}>By page</h3>
        {live.pages.map((p) => (
          <div key={p.label} className={s.liveRow}>
            <span>{p.label}</span><span className={s.track}><span style={{ width: `${(p.n / max) * 100}%`, "--c": "var(--dz-green)" } as React.CSSProperties} /></span><b className={s.num}>{p.n}</b>
          </div>
        ))}
        <h3 className={s.h2} style={{ fontSize: "0.9375rem", marginTop: "0.25rem" }}>By device</h3>
        <div className={s.devBar}>
          <span style={{ width: `${live.total ? (live.mobile / live.total) * 100 : 50}%` }}>Mobile · {live.mobile}</span>
          <span>Desktop · {live.desktop}</span>
        </div>
      </div>
    </div>
  );
}
