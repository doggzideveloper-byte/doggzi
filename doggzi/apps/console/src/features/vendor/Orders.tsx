import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PetAvatar } from "@doggzi/ui/components/PetAvatar";
import { isReduced } from "@doggzi/ui/lib/reducedMotion";
import { ApiError, errMsg } from "@/lib/api";
import { istTime, prettyPhone } from "@/lib/format";
import { Chip, useUi } from "../common/ui";
import { vendor, type SubOrder } from "./api";
import s from "./vd.module.css";

const REASONS = ["Out of stock", "Shop closed", "Too far"] as const;
const COLS: [string, SubOrder["status"][]][] = [["New", ["placed"]], ["Packing", ["accepted"]], ["Ready / Out", ["packed", "out_for_delivery"]]];
const LABEL: Record<string, [string, string]> = { placed: ["New", "new"], accepted: ["Packing", "prog"], packed: ["Ready", "acc"], out_for_delivery: ["Out for delivery", "prog"], delivered: ["Delivered", "done"] };
const mmss = (ms: number) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

function Card({ o, now, fresh }: { o: SubOrder; now: number; fresh: boolean }) {
  const qc = useQueryClient();
  const { flash } = useUi();
  const ref = useRef<HTMLElement>(null);
  const [rejecting, setRejecting] = useState(false);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);
  useEffect(() => {
    if (fresh && !isReduced()) ref.current?.animate([{ transform: "translateY(-10px)", opacity: 0 }, { transform: "none", opacity: 1, offset: 0.5 }, { transform: "rotate(-1.5deg)", offset: 0.7 }, { transform: "rotate(1.5deg)", offset: 0.85 }, { transform: "none" }], { duration: 450, easing: "ease-out" });
  }, [fresh]);
  const put = (n: SubOrder) => qc.setQueryData<SubOrder[]>(["vd", "orders"], (old) => old?.map((x) => (x.id === n.id ? n : x)).filter((x) => ["placed", "accepted", "packed", "out_for_delivery"].includes(x.status)));
  const act = useMutation({
    mutationFn: (fn: () => Promise<SubOrder>) => fn(),
    onSuccess: (n) => {
      put(n);
      const msg: Record<string, string> = { accepted: `${o.ref} accepted. The customer has been told.`, rejected: `${o.ref} rejected (${n.reject_reason?.toLowerCase()}). OPS will reassign or refund.`, packed: `${o.ref} packed.`, out_for_delivery: `${o.ref} is out for delivery.`, delivered: `${o.ref} delivered. Payout released.` };
      if (msg[n.status]) flash(msg[n.status]);
      if (["rejected", "delivered"].includes(n.status)) qc.invalidateQueries({ queryKey: ["vd", "payouts"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && (e.status === 422 || e.status === 423) && o.status === "out_for_delivery") { setCodeErr(errMsg(e)); setCode(""); return; }
      flash(errMsg(e));
      qc.invalidateQueries({ queryKey: ["vd", "orders"] });
    },
  });
  const tick = useMutation({
    mutationFn: (checks: boolean[]) => vendor.checks(o.id, checks),
    onMutate: (checks) => { const prev = qc.getQueryData<SubOrder[]>(["vd", "orders"]); qc.setQueryData<SubOrder[]>(["vd", "orders"], (old) => old?.map((x) => (x.id === o.id ? { ...x, pack_checks: checks } : x))); return { prev }; },
    onSuccess: put,
    onError: (e, _c, ctx) => { if (ctx?.prev) qc.setQueryData(["vd", "orders"], ctx.prev); flash(errMsg(e)); },
  });
  const left = o.accept_by ? new Date(o.accept_by).getTime() - now : 0;
  const late = o.status === "placed" && left <= 0;
  const [label, kind] = late ? ["Missed · sent to OPS", "alert"] : LABEL[o.status];
  const allPacked = o.pack_checks.length > 0 && o.pack_checks.every(Boolean);
  return (
    <article ref={ref} className={s.card} data-late={late}>
      <div className={s.cardTop}>
        <span className={s.ref}>{o.ref}</span>
        <Chip kind={kind} pulseKey={o.status}>{label}</Chip>
        <span className={s.placed}>{istTime(o.placed_at)}</span>
      </div>
      <div className={s.who2}>
        {o.pet ? <PetAvatar type={o.pet.type === "cat" ? "cat" : "dog"} breed={o.pet.breed} size={40} border={1.5} /> : <span style={{ width: "2.5rem" }} />}
        <span>
          <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>for {o.pet ? `${o.pet.name} (${o.pet.type})` : "a Doggzi pet"}</span>
          <span>{o.area} · {o.phone_visible ? prettyPhone(o.customer_phone) : o.customer_phone}</span>
        </span>
      </div>
      {o.status === "placed" && !late && (
        <>
          <ul className={s.items}>{o.items.map((i) => <li key={i.sku}><strong>{i.qty}×</strong><span style={{ flex: 1 }}>{i.name}</span></li>)}</ul>
          <div className={s.timer} data-urgent={left < 120000} role="timer" aria-label={`${mmss(left)} left to accept`}><span>Accept within</span><b>{mmss(left)}</b></div>
          {rejecting && (
            <div role="group" aria-label="Reason for rejecting" className={s.reasons}>
              {REASONS.map((r) => <button key={r} type="button" className={s.reason} disabled={act.isPending} onClick={() => act.mutate(() => vendor.reject(o.id, r))}>{r}</button>)}
            </div>
          )}
          <div className={s.two}>
            <button type="button" className={s.ghost} onClick={() => setRejecting(!rejecting)}>{rejecting ? "Back" : "Reject"}</button>
            <button type="button" className={s.btn} disabled={act.isPending} onClick={() => act.mutate(() => vendor.accept(o.id))}>Accept</button>
          </div>
        </>
      )}
      {o.status === "accepted" && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {o.items.map((i, k) => (
              <label key={i.sku} className={s.check} data-done={!!o.pack_checks[k]}>
                <input type="checkbox" checked={!!o.pack_checks[k]} onChange={() => tick.mutate(o.items.map((_, x) => (x === k ? !o.pack_checks[x] : !!o.pack_checks[x])))} />
                {i.qty}× {i.name}
              </label>
            ))}
          </div>
          <button type="button" className={s.btn} data-tone="pink" disabled={!allPacked || act.isPending} onClick={() => act.mutate(() => vendor.packed(o.id))}>Mark packed</button>
        </>
      )}
      {(o.status === "packed" || o.status === "out_for_delivery") && (
        <>
          <span style={{ fontSize: "0.8125rem" }}>{o.items.map((i) => `${i.qty}× ${i.name}`).join(" · ")}</span>
          {o.status === "out_for_delivery" && (
            <label className={s.code}>Delivery code (optional)
              <input inputMode="numeric" maxLength={4} value={code} disabled={o.code_locked} aria-invalid={!!codeErr} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setCodeErr(null); }} />
              {o.demo_code && <span className={s.muted} style={{ fontWeight: 500 }}>Demo: the customer's code is <strong style={{ fontFamily: "var(--font-accent)", letterSpacing: ".2em" }}>{o.demo_code}</strong></span>}
            </label>
          )}
          {(codeErr || o.code_locked) && <p role="alert" className={s.err}>{o.code_locked ? "Code locked after 5 tries. Ask Doggzi OPS." : codeErr}</p>}
          <button type="button" className={s.btn} data-tone={o.status === "packed" ? "pink" : undefined} disabled={act.isPending || (o.status === "out_for_delivery" && code.length > 0 && code.length < 4)}
            onClick={() => act.mutate(() => (o.status === "packed" ? vendor.out(o.id) : vendor.delivered(o.id, code || undefined)))}>
            {o.status === "packed" ? "Out for delivery" : "Mark delivered"}
          </button>
        </>
      )}
      {o.phone_visible && <a className={s.call} href={`tel:${o.customer_phone}`}>Call customer</a>}
    </article>
  );
}

export function Orders({ orders, acceptMinutes, fresh, demo }: { orders: SubOrder[] | undefined; acceptMinutes: number; fresh: Set<string>; demo: boolean }) {
  const qc = useQueryClient();
  const { flash } = useUi();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // A new order that runs out of time leaves the board on the next refresh (it goes to OPS).
  const anyLate = orders?.some((o) => o.status === "placed" && o.accept_by && new Date(o.accept_by).getTime() < now - 4000);
  useEffect(() => { if (anyLate) qc.invalidateQueries({ queryKey: ["vd", "orders"] }); }, [anyLate, qc]);
  const ring = useMutation({ mutationFn: vendor.demoOrder, onSuccess: () => qc.invalidateQueries({ queryKey: ["vd", "orders"] }), onError: (e) => flash(errMsg(e)) });
  return (
    <>
      <div className={s.titleRow}>
        <h1 className={s.h1}>Orders</h1>
        <span className={s.muted}>Accept new orders within {acceptMinutes} minutes</span>
      </div>
      {!orders && <p className={s.muted} aria-busy="true">Loading orders…</p>}
      <div className={s.board}>
        {COLS.map(([title, sts]) => {
          const cards = (orders || []).filter((o) => sts.includes(o.status));
          return (
            <section key={title} aria-label={title} className={s.col}>
              <h2 className={s.colHead}>{title}<span>{cards.length}</span></h2>
              {!cards.length && <p className={s.none}>Nothing here.</p>}
              {cards.map((o) => <Card key={o.id} o={o} now={now} fresh={fresh.has(o.id)} />)}
            </section>
          );
        })}
      </div>
      {demo && <button type="button" className={s.demoBtn} disabled={ring.isPending} onClick={() => ring.mutate()}>Demo: a customer places an order</button>}
    </>
  );
}
