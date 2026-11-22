import { useQuery } from "@tanstack/react-query";
import { download, errMsg } from "@/lib/api";
import { inr, istYmd } from "@/lib/format";
import { useUi } from "../common/ui";
import { vendor } from "./api";
import s from "./vd.module.css";

const ST: Record<string, [string, string]> = { on_hold: ["On hold", "new"], released: ["Released", "acc"], settled: ["Settled", "done"] };

export function Payouts() {
  const { flash } = useUi();
  const q = useQuery({ queryKey: ["vd", "payouts"], queryFn: vendor.payouts });
  const p = q.data;
  const month = istYmd().slice(0, 7);
  const monthName = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "long" }).format(new Date());
  return (
    <>
      <div className={s.titleRow}>
        <h1 className={s.h1}>Payouts</h1>
        <button type="button" className={s.tool} onClick={() => download("market", `/vendor/payouts/statement.csv?month=${month}`, `doggzi-statement-${month}.csv`).catch((e) => flash(errMsg(e)))}>Download {monthName} statement (CSV)</button>
      </div>
      <div className={s.totals}>
        {[["On hold (until delivered)", p?.on_hold_paise], ["Released", p?.released_paise], ["Settled", p?.settled_paise]].map(([k, v]) => (
          <div key={k as string} className={s.total}><span>{k}</span><b>{v == null ? "…" : inr(v as number)}</b></div>
        ))}
      </div>
      <div className={s.tableWrap}>
        <table className={s.table} style={{ minWidth: "45rem", fontVariantNumeric: "tabular-nums" }}>
          <thead><tr><th scope="col">Sub-order</th><th scope="col">Date</th><th scope="col" className={s.right}>Order value</th><th scope="col" className={s.right}>Commission</th><th scope="col" className={s.right}>Delivery fee</th><th scope="col" className={s.right}>Net payout</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {!p && <tr><td colSpan={7} className={s.muted}>Loading…</td></tr>}
            {p && !p.rows.length && <tr><td colSpan={7} className={s.muted}>No payouts yet. They appear as soon as you accept an order.</td></tr>}
            {p?.rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.ref}</td>
                <td>{new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(new Date(r.date))}</td>
                <td className={s.right}>{inr(r.order_value_paise)}</td>
                <td className={s.right}>−{inr(r.commission_paise)}</td>
                <td className={s.right}>{inr(r.delivery_fee_paise)}</td>
                <td className={s.right} style={{ fontWeight: 700 }}>{inr(r.net_paise)}</td>
                <td><span className="wm-chip" data-kind={ST[r.status][1]}>{ST[r.status][0]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className={s.muted} style={{ fontSize: "0.75rem" }}>Commission {p ? `${p.commission_pct}%` : ""} (draft). On hold until delivered, then released and settled via Razorpay Route.</span>
    </>
  );
}
