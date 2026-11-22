import { useQuery } from "@tanstack/react-query";
import { inr, istDayLabel, istTime } from "@/lib/format";
import { provider } from "./api";
import s from "./pv.module.css";

const period = (a: string, b: string) => {
  const f = (d: string, m: boolean) => new Intl.DateTimeFormat("en-IN", { day: "numeric", ...(m ? { month: "short" } : {}) }).format(new Date(`${d}T00:00:00`));
  return a.slice(0, 7) === b.slice(0, 7) ? `${f(a, false)}–${f(b, true)}` : `${f(a, true)} – ${f(b, true)}`;
};

export function Earnings() {
  const q = useQuery({ queryKey: ["pv", "earnings"], queryFn: provider.earnings });
  const e = q.data;
  return (
    <>
      <h1 className="wm-h1">Earnings</h1>
      <div className={s.totals}>
        {[["Today", e?.today_paise], ["This week", e?.week_paise], ["This month", e?.month_paise]].map(([k, v]) => (
          <div key={k as string} className={s.total}><span>{k}</span><b>{v == null ? "…" : inr(v as number)}</b></div>
        ))}
      </div>
      <h2 className={s.h2}>Per job (this week)</h2>
      {e && !e.jobs.length ? <p className={s.muted} style={{ margin: 0 }}>No completed jobs this week yet.</p> : (
        <ul className={s.list}>
          {e?.jobs.map((j) => (
            <li key={j.title + j.at}>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}><span style={{ fontWeight: 600 }}>{j.title}</span><span className={s.muted} style={{ fontSize: "0.75rem" }}>{istDayLabel(j.at)}, {istTime(j.at)}</span></span>
              <span className={s.num}>{inr(j.amount_paise)}</span>
            </li>
          ))}
        </ul>
      )}
      <h2 className={s.h2}>Payouts</h2>
      <ul className={s.cards}>
        {e?.payouts.map((p) => (
          <li key={p.period_start}>
            <span style={{ flex: 1, fontWeight: 600 }}>{period(p.period_start, p.period_end)}</span>
            <span className={s.num}>{inr(p.amount_paise)}</span>
            <span className="wm-chip" data-kind={p.status === "paid" ? "done" : "new"}>{p.status === "paid" ? "Paid" : "Pending"}</span>
          </li>
        ))}
        {e && !e.payouts.length && <li className={s.muted}>No payouts yet.</li>}
      </ul>
    </>
  );
}
