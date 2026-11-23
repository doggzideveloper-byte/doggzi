import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PetAvatar } from "@doggzi/ui/components/PetAvatar";
import { errMsg } from "@/lib/api";
import { inr, istDayLabel, istTime, istYmd } from "@/lib/format";
import { Chip } from "../common/ui";
import { adm, type BookingCard, type Col, type Provider, type Vendor } from "./api";
import { forms } from "./forms";
import { AddBtns, pulse, useAdmin } from "./kit";
import s from "./adm.module.css";

const COLS: [Col, string][] = [["requested", "Requested"], ["offered", "Offered"], ["accepted", "Accepted"], ["enroute", "En route"], ["inprogress", "In progress"], ["completed", "Completed"], ["cancelled", "Cancelled"]];
const KIND: Record<Col, string> = { requested: "new", offered: "new", accepted: "acc", enroute: "prog", inprogress: "prog", completed: "done", cancelled: "muted" };
const label = (c: Col) => COLS.find((x) => x[0] === c)![1];
const mmss = (ms: number) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const when = (iso: string) => `${istYmd(new Date(iso)) === istYmd() ? "" : `${istDayLabel(iso)} `}${istTime(iso)}`;

export function Bookings() {
  const { flash, ask, pickFrom, openAdd } = useAdmin();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ad", "bookings"], queryFn: adm.bookings, refetchInterval: 15_000 });
  const provs = useQuery({ queryKey: ["ad", "providers"], queryFn: adm.providers, staleTime: 60_000 });
  const [now, setNow] = useState(Date.now());
  const [over, setOver] = useState<Col | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const put = (c: BookingCard) => { qc.setQueryData<BookingCard[]>(["ad", "bookings"], (xs) => (xs || []).some((x) => x.id === c.id) ? xs!.map((x) => (x.id === c.id ? c : x)) : [c, ...(xs || [])]); pulse(c.id); };
  const refresh = () => qc.invalidateQueries({ queryKey: ["ad", "bookings"] });

  const move = async (b: BookingCard, to: Col) => {
    if (b.column === to) return;
    if (to === "cancelled") return cancel(b);
    try {
      const r = await adm.move(b.id, to);
      put(r);
      flash(`${r.ref} moved to ${label(r.column)}.`, async () => { try { put(await adm.move(b.id, r.before!, true)); } catch (e) { flash(errMsg(e)); refresh(); } });
    } catch (e) { flash(errMsg(e)); refresh(); }
  };
  const cancel = (b: BookingCard) => ask({
    title: `Cancel ${b.ref}?`, body: `${b.pet.name}'s ${b.services.join(" + ")} will be cancelled and the customer told on WhatsApp.`, word: b.ref, cta: "Cancel booking",
    run: async () => {
      const r = await adm.move(b.id, "cancelled");
      put(r);
      flash(`${r.ref} cancelled.`, async () => { try { put(await adm.move(b.id, r.before!, true)); } catch (e) { flash(errMsg(e)); refresh(); } });
    },
  });
  const reassign = (b: BookingCard) => pickFrom(`Reassign ${b.ref}`, (provs.data || []).filter((p) => p.stage === "live" && !p.paused && p.id !== b.provider?.id).map((p) => ({
    label: p.name, sub: `Rating ${p.rating} · ${p.jobs_done} jobs`,
    pick: async () => {
      const r = await adm.reassign(b.id, p.id);
      put(r);
      flash(`${r.ref} offered to ${p.name}.`);
    },
  })));

  const list = q.data || [];
  return (
    <>
      <div className={s.titleRow}>
        <h1 className={s.h1}>Bookings</h1>
        <span className={s.muted}>Drag a card or use its buttons. Every move can be undone for 5 seconds.</span>
        <AddBtns items={[["+ New booking", () => forms.booking(qc, put).then(openAdd, (e) => flash(errMsg(e)))]]} />
      </div>
      {q.isError && <p role="alert" className={s.err}>{errMsg(q.error, "We couldn't load bookings. Retrying.")}</p>}
      <div className={s.board}>
        {COLS.map(([k, l], i) => {
          const cards = list.filter((b) => b.column === k);
          const nx = COLS[i + 1] && COLS[i + 1][0] !== "cancelled" ? COLS[i + 1] : null;
          return (
            <section key={k} aria-label={l} className={s.col} data-over={over === k}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(k); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); const b = list.find((x) => x.id === e.dataTransfer.getData("text/plain")); if (b) move(b, k); }}>
              <h2 className={s.colHead}>{l}<span>{cards.length}</span></h2>
              {!cards.length && <p className={s.none}>{q.isLoading ? "Loading…" : "None"}</p>}
              {cards.map((b) => {
                const live = k !== "completed" && k !== "cancelled";
                const left = b.offer_expires_at ? new Date(b.offer_expires_at).getTime() - now : 0;
                return (
                  <article key={b.id} data-card={b.id} className={s.card} data-alert={b.overdue} draggable={live}
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", b.id); e.dataTransfer.effectAllowed = "move"; }}>
                    <div className={s.cardTop}>
                      <PetAvatar type={b.pet.type === "cat" ? "cat" : "dog"} breed={b.pet.breed || undefined} size={34} border={1.5} bg="var(--dz-cream)" />
                      <span><b>{b.pet.name} · {b.ref}</b><small>{b.pet.breed}</small></span>
                    </div>
                    <span className={s.line}>{b.services.join(" + ")} · {inr(b.total_paise)}</span>
                    <span className={s.line}>{when(b.slot_start)} · {b.area}</span>
                    <span className={s.line}>Provider: {b.provider?.name || "Unassigned"}</span>
                    <span className={s.line}>Customer: {b.customer_phone}</span>
                    {k === "offered" && b.offer_expires_at && <span className={s.line} data-tone={left < 20_000 ? "alert" : undefined}>{left > 0 ? `Next provider offered in ${mmss(left)}` : "Offer expired · moving on…"}</span>}
                    {k === "requested" && b.dispatch_status === "ops_queue" && <span className={s.line} data-tone="alert">No provider found · pick one with Reassign</span>}
                    <div className={s.chips}>
                      {b.overdue && <Chip kind="alert">Overdue</Chip>}
                      <span className={`wm-chip ${KIND[k] === "muted" ? s.chipMuted : ""}`} data-kind={KIND[k]}>{l}</span>
                      <span className="wm-chip" data-kind={b.pay.startsWith("Collected") ? "done" : k === "cancelled" ? undefined : "acc"}>{b.pay}</span>
                    </div>
                    {live && (
                      <div className={s.acts}>
                        {nx && <button type="button" className={s.small} onClick={() => move(b, nx[0])}>→ {nx[1]}</button>}
                        {k !== "inprogress" && <button type="button" className={s.small} onClick={() => reassign(b)}>Reassign</button>}
                        {k !== "inprogress" && <button type="button" className={s.small} data-tone="danger" onClick={() => cancel(b)}>Cancel</button>}
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}

/* ---------- onboarding pipelines ---------- */
const V_STAGES: [Vendor["stage"], string][] = [["applied", "Applied"], ["docs", "Docs (GST, licence, bank)"], ["razorpay", "Razorpay linked"], ["live", "Live"]];
const P_STAGES: [Provider["stage"], string][] = [["applied", "Applied"], ["idcheck", "ID check"], ["skills", "Skills"], ["areas", "Areas"], ["training", "Training done"], ["live", "Live"]];

export function Pipeline({ kind }: { kind: "vendors" | "providers" }) {
  const { isAdmin, flash, ask, openAdd } = useAdmin();
  const qc = useQueryClient();
  const isV = kind === "vendors";
  const q = useQuery<(Vendor | Provider)[]>({ queryKey: ["ad", kind], queryFn: isV ? adm.vendors : adm.providers, refetchInterval: 60_000 });
  const stages = (isV ? V_STAGES : P_STAGES) as [string, string][];
  const put = (x: Vendor | Provider) => { qc.setQueryData<(Vendor | Provider)[]>(["ad", kind], (xs) => (xs || []).some((y) => y.id === x.id) ? xs!.map((y) => (y.id === x.id ? x : y)) : [...(xs || []), x]); pulse(x.id); };
  const patch = (id: string, b: Record<string, unknown>) => (isV ? adm.patchVendor(id, b) : adm.patchProvider(id, b));
  const short = (l: string) => l.split(" (")[0];

  const advance = async (x: Vendor | Provider, to: string, toLabel: string) => {
    try {
      const r = await patch(x.id, { stage: to });
      put(r);
      flash(`${x.name} moved to ${short(toLabel)}.${to === "live" ? (isV ? " The owner can now sign in to the Vendor panel." : " They can now sign in and get jobs.") : ""}`,
        to === "live" ? undefined : async () => { try { put(await patch(x.id, { stage: x.stage, undo: true })); } catch (e) { flash(errMsg(e)); } });
    } catch (e) { flash(errMsg(e)); }
  };
  const pause = (x: Vendor | Provider) => {
    if (x.paused) return patch(x.id, { paused: false }).then((r) => { put(r); flash(`${x.name} resumed.`); }).catch((e) => flash(errMsg(e)));
    ask({ title: `Pause ${x.name}?`, body: isV ? "Their listings hide and new orders stop until you resume." : "Dispatch stops offering them jobs until you resume. Open offers move on.", word: "CONFIRM", cta: "Pause",
      run: async () => { put(await patch(x.id, { paused: true })); flash(`${x.name} paused.`); } });
  };

  return (
    <>
      <div className={s.titleRow}>
        <h1 className={s.h1}>{isV ? "Vendors" : "Providers"}</h1>
        <span className={s.muted}>{isAdmin ? (isV ? "Onboarding pipeline. Commission and pincodes are set per vendor." : "Onboarding pipeline. Dispatch only offers jobs to Live providers.") : "View only for OPS."}</span>
        {isAdmin && <AddBtns items={[[isV ? "+ Add vendor" : "+ Add provider", () => openAdd(isV ? forms.vendor(put) : forms.provider(put))]]} />}
      </div>
      {q.isError && <p role="alert" className={s.err}>{errMsg(q.error)}</p>}
      <div className={s.board}>
        {stages.map(([k, l], si) => {
          const cards = (q.data || []).filter((x) => x.stage === k);
          const nx = stages[si + 1];
          return (
            <section key={k} aria-label={l} className={s.col} style={{ "--colbg": isV ? "var(--ad-col-pink)" : "var(--ad-col-green)" } as React.CSSProperties}>
              <h2 className={s.colHead}>{short(l)}<span>{cards.length}</span></h2>
              {!cards.length && <p className={s.none}>{q.isLoading ? "Loading…" : "None"}</p>}
              {cards.map((x) => {
                const v = x as Vendor, p = x as Provider;
                return (
                  <article key={x.id} data-card={x.id} className={s.card} data-alert={x.paused}>
                    <div className={s.cardTop}><span><b>{x.name}</b><small>{isV ? (v.is_doggzi ? "Doggzi's own store" : "Store") : "Groomer / trainer"}</small></span></div>
                    {isV ? (
                      <>
                        <span className={s.line}>{v.area || "—"} · {x.phone}</span>
                        <span className={s.line}>Commission {v.commission_pct}% · {v.pincodes.length} pincodes</span>
                        {k === "live" && <span className={s.line}>Accept rate {v.accept_rate ?? "—"}{v.accept_rate !== null ? "%" : ""} · avg pack {v.avg_pack_minutes ?? "—"}{v.avg_pack_minutes !== null ? " min" : ""}</span>}
                        {k === "live" && <span className={s.line}>Cancellations this month: {v.cancellations_month}</span>}
                      </>
                    ) : (
                      <>
                        <span className={s.line}>{p.skill_labels.join(" · ") || "No skills yet"}</span>
                        <span className={s.line}>{x.phone} · {p.areas.length} pincodes</span>
                        {k === "live" && <span className={s.line}>Rating {p.rating} · {p.jobs_done} jobs · {p.is_online ? "online" : "offline"}</span>}
                        {k === "live" && <span className={s.line}>Earnings owed {inr(p.owed_paise)}</span>}
                      </>
                    )}
                    <div className={s.chips}>{x.paused ? <Chip kind="alert">Paused</Chip> : <span className="wm-chip" data-kind={k === "live" ? "prog" : "new"}>{short(l)}</span>}</div>
                    {isAdmin && (
                      <div className={s.acts}>
                        {nx && <button type="button" className={s.small} onClick={() => advance(x, nx[0], nx[1])}>→ {short(nx[1])}</button>}
                        {k === "live" && !(isV && v.is_doggzi) && <button type="button" className={s.small} data-tone={x.paused ? undefined : "danger"} onClick={() => pause(x)}>{x.paused ? "Resume" : "Pause"}</button>}
                        {isV && <button type="button" className={s.small} onClick={() => openAdd(forms.vendorTerms(v, put))}>Edit terms</button>}
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}
