import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ServiceScene } from "@doggzi/ui/components/ServiceScene";
import { ApiError, errMsg } from "@/lib/api";
import { inr, istDate, istTime, prettyPhone } from "@/lib/format";
import { provider, type Job } from "./api";
import { Chip, STATUS, WA, petKey, useUi } from "./shared";
import s from "./pv.module.css";

const NEXT: Record<string, string> = { accepted: "Start travel", travel: "I've arrived", arrived: "Start service", in_service: "Complete", completed: "Mark payment collected", done: "Job complete ✓" };

function ActiveJob({ j, firstName, help }: { j: Job; firstName: string; help: string }) {
  const qc = useQueryClient();
  const { flash } = useUi();
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [endStage, setEndStage] = useState(false);
  const [mode, setMode] = useState<"UPI" | "Cash" | null>(null);
  const [cant, setCant] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const update = (nj: Job) => {
    qc.setQueryData<Job[]>(["pv", "jobs"], (old) => old?.map((x) => (x.id === nj.id ? nj : x)));
    if (nj.step !== j.step && WA[nj.step]) flash(`WhatsApp sent to the customer: ${firstName} ${WA[nj.step]}.`);
  };
  const run = useMutation({
    mutationFn: async (): Promise<Job> => {
      if (j.step === "accepted") return provider.step(j.id, "travel");
      if (j.step === "travel") return provider.step(j.id, "arrive");
      if (j.step === "arrived") return provider.code(j.id, "start", code);
      if (j.step === "in_service") return provider.code(j.id, "complete", code);
      return provider.collect(j.id, mode!);
    },
    onSuccess: (nj) => { setCode(""); setCodeErr(null); setEndStage(false); update(nj); },
    onError: (e) => {
      setCode("");
      if (e instanceof ApiError && (e.status === 422 || e.status === 423)) { setCodeErr(errMsg(e)); if (e.status === 423) qc.invalidateQueries({ queryKey: ["pv", "jobs"] }); codeRef.current?.focus(); }
      else flash(errMsg(e));
    },
  });
  // Ticks flip instantly (optimistic) and roll back if saving fails.
  const tick = useMutation({
    mutationFn: (done: boolean[]) => provider.checklist(j.id, done),
    onMutate: (done) => {
      const prev = qc.getQueryData<Job[]>(["pv", "jobs"]);
      qc.setQueryData<Job[]>(["pv", "jobs"], (old) => old?.map((x) => (x.id === j.id ? { ...x, checklist: x.checklist.map((c, i) => ({ ...c, done: done[i] })) } : x)));
      return { prev };
    },
    onSuccess: update,
    onError: (e, _d, ctx) => { if (ctx?.prev) qc.setQueryData(["pv", "jobs"], ctx.prev); flash(errMsg(e)); },
  });
  const photo = useMutation({ mutationFn: ({ w, f }: { w: "before" | "after"; f: File }) => provider.photo(j.id, w, f), onSuccess: (nj) => { update(nj); flash("Photo added."); }, onError: (e) => flash(errMsg(e)) });
  const release = useMutation({
    mutationFn: () => provider.step(j.id, "release"),
    onSuccess: () => { setCant(false); flash("Sent back to dispatch. OPS has been told."); qc.invalidateQueries({ queryKey: ["pv"] }); },
    onError: (e) => { setCant(false); flash(errMsg(e)); },
  });
  useEffect(() => { if (j.step === "arrived" || endStage) codeRef.current?.focus(); }, [j.step, endStage]);

  const allTicked = j.checklist.every((c) => c.done);
  const codeKind = j.step === "arrived" ? "start" : j.step === "in_service" && endStage ? "end" : null;
  const locked = codeKind ? !!j.code_locked[codeKind] : false;
  let label = NEXT[j.step];
  let disabled = run.isPending;
  if (j.step === "in_service" && !endStage) { label = allTicked ? "Complete" : `Tick all ${j.checklist.length} items to complete`; disabled = !allTicked; }
  if (codeKind) { label = codeKind === "start" ? "Start service" : "Confirm end code"; disabled = disabled || code.length !== 4 || locked; }
  if (j.step === "completed") disabled = disabled || !mode;
  const onNext = () => (j.step === "in_service" && !endStage ? setEndStage(true) : run.mutate());

  return (
    <div className={s.active}>
      <div className={s.callRow}>
        <span>Customer: <strong style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{prettyPhone(j.customer_phone)}</strong></span>
        <a className={s.call} href={`tel:${j.customer_phone}`}>Call customer</a>
      </div>
      {j.address && <span className={s.muted}>{[j.address.line1, j.address.line2, j.address.landmark, j.address.city, j.address.pincode].filter(Boolean).join(", ")}</span>}
      {codeKind && (
        <div className={s.codeBox}>
          <label htmlFor={`code-${j.id}`} style={{ fontWeight: 600, fontSize: "0.875rem" }}>{codeKind === "start" ? "Customer's start code" : "Customer's end code"}</label>
          <input id={`code-${j.id}`} ref={codeRef} className={s.codeInput} inputMode="numeric" autoComplete="off" maxLength={4} value={code} disabled={locked}
            aria-invalid={!!codeErr} aria-describedby={`code-${j.id}-err`} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setCodeErr(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && code.length === 4 && !locked) run.mutate(); }} />
          {j.demo_codes ? (
            <span className={s.muted} style={{ fontSize: "0.75rem" }}>Demo: the customer's code is <strong style={{ fontFamily: "var(--font-accent)", letterSpacing: ".2em" }}>{j.demo_codes[codeKind]}</strong></span>
          ) : <span className={s.muted} style={{ fontSize: "0.75rem" }}>Ask the customer for the code on their booking page.</span>}
          {(codeErr || locked) && <p id={`code-${j.id}-err`} role="alert" className={s.err}>{locked ? "Code locked after 5 tries. Ask OPS for help." : codeErr}</p>}
        </div>
      )}
      {j.step === "in_service" && !endStage && (
        <fieldset className={s.check}>
          <legend>Service checklist</legend>
          {j.checklist.map((c, k) => (
            <label key={c.label} className={s.checkItem} data-done={c.done}>
              <input type="checkbox" checked={c.done} onChange={() => tick.mutate(j.checklist.map((x, i) => (i === k ? !x.done : x.done)))} />
              {c.label}
            </label>
          ))}
          <div className={s.half}>
            {(["before", "after"] as const).map((w) => (
              <label key={w} className={s.photo} data-on={!!j.photos[w]}>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; if (f) photo.mutate({ w, f }); e.target.value = ""; }} />
                {j.photos[w] ? `${w === "before" ? "Before" : "After"} ✓` : `+ ${w === "before" ? "Before" : "After"} photo`}
              </label>
            ))}
          </div>
          <span className={s.muted} style={{ fontSize: "0.75rem" }}>Photos are optional.</span>
        </fieldset>
      )}
      {j.step === "completed" && (
        <>
          <div role="radiogroup" aria-label="Payment collected by" className={s.half}>
            {(["UPI", "Cash"] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} className={s.pay} onClick={() => setMode(m)}>{m}</button>)}
          </div>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Amount to collect: {inr(j.total_paise)}</span>
        </>
      )}
      <button type="button" className={s.next} disabled={disabled} onClick={onNext}>{run.isPending ? "Saving…" : label}</button>
      <div className={s.half}>
        <a className={s.help} href={help} target="_blank" rel="noopener noreferrer">Need help</a>
        {(j.step === "accepted" || j.step === "travel") && <button type="button" className={s.cant} onClick={() => setCant(true)}>Can't make it</button>}
      </div>
      {cant && (
        <div className={s.scrim} onClick={(e) => e.target === e.currentTarget && setCant(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby={`cm-${j.id}`} className={s.dialog} onKeyDown={(e) => e.key === "Escape" && setCant(false)}>
            <h2 id={`cm-${j.id}`} style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>Send this job back to dispatch?</h2>
            <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5 }}>We'll offer it to another provider. Using this often lowers your rating.</p>
            <div className={s.half} style={{ gap: "0.625rem" }}>
              <button type="button" autoFocus className={s.ghost} style={{ height: "3.25rem" }} onClick={() => setCant(false)}>Keep job</button>
              <button type="button" className={s.danger} disabled={release.isPending} onClick={() => release.mutate()}>Send back</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Today({ jobs, firstName, help }: { jobs: Job[] | undefined; firstName: string; help: string }) {
  const activeId = jobs?.find((j) => j.step !== "done")?.id;
  return (
    <>
      <div className={s.row}>
        <h1 className="wm-h1">Today</h1>
        <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>{istDate(new Date())}</span>
      </div>
      {!jobs && <div className={s.empty} aria-busy="true"><span className={s.muted}>Loading today's jobs…</span></div>}
      {jobs && !jobs.length && (
        <div className={s.empty}><span style={{ fontWeight: 600 }}>No jobs today yet</span><span className={s.muted}>Accepted offers show up here.</span></div>
      )}
      <ol className={s.timeline}>
        {jobs?.map((j) => {
          const [label, kind] = STATUS[j.step];
          const active = j.id === activeId;
          return (
            <li key={j.id} className={s.tl}>
              <div className={s.tlTime}><b>{istTime(j.slot_start).replace(" ", " ")}</b><i aria-hidden="true" /></div>
              <article className={s.job} data-active={active} data-done={j.step === "done" && !active}>
                <div className={s.jobTop}>
                  <Chip kind={kind} pulseKey={j.step}>{label}</Chip>
                  <span className={s.muted} style={{ fontWeight: 500 }}>{j.area}</span>
                </div>
                <div className={s.jobMid}>
                  <div className={s.thumb}><ServiceScene scene={j.services[0]?.scene} pet={petKey(j.pet)} petName={j.pet.name} label={`${j.services[0]?.name} for ${j.pet.name}`} /></div>
                  <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{j.pet.name}{j.pet.breed ? ` · ${j.pet.breed}` : ""}</span>
                    <span style={{ fontSize: "0.8125rem", lineHeight: 1.35 }}>{j.services.map((x) => x.name).join(" + ")}</span>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>You earn {inr(j.earning_paise)}</span>
                  </div>
                </div>
                {active && j.phone_visible ? <ActiveJob j={j} firstName={firstName} help={help} /> : (
                  <span className={s.muted} style={{ fontSize: "0.75rem" }}>Customer {j.phone_visible ? prettyPhone(j.customer_phone) : j.customer_phone}{j.step === "done" ? "" : " · number shows when the job starts"}</span>
                )}
              </article>
            </li>
          );
        })}
      </ol>
    </>
  );
}
