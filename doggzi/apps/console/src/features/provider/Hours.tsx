import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { errMsg } from "@/lib/api";
import { istYmd } from "@/lib/format";
import { provider, type Availability } from "./api";
import { Switch, useUi } from "./shared";
import s from "./pv.module.css";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6 am … 10 pm
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString("en-IN", { hour: "numeric" });

/** Weekly hours + days off. Changes save on their own (debounced); dispatch only offers slots inside them. */
export function Hours() {
  const qc = useQueryClient();
  const { flash } = useUi();
  const q = useQuery({ queryKey: ["pv", "availability"], queryFn: provider.availability });
  const [a, setA] = useState<Availability | null>(null);
  const timer = useRef<number>();
  useEffect(() => { if (q.data && !a) setA(q.data); }, [q.data, a]);
  const save = useMutation({
    mutationFn: provider.setAvailability,
    onSuccess: (d) => { qc.setQueryData(["pv", "availability"], d); flash("Hours saved."); },
    onError: (e) => flash(errMsg(e)),
  });
  const change = (next: Availability) => {
    setA(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save.mutate(next), 600);
  };
  if (!a) return <><h1 className="wm-h1">Calendar &amp; availability</h1><div className={s.empty} aria-busy="true"><span className={s.muted}>Loading your hours…</span></div></>;
  const setDay = (i: number, patch: Partial<Availability["weekly_hours"][number]>) => {
    const wh = a.weekly_hours.map((d, k) => (k === i ? { ...d, ...patch } : d));
    const d = wh[i];
    if (d.on && d.from >= d.to) { flash("A working day must end after it starts."); return; }
    change({ ...a, weekly_hours: wh });
  };
  const next14 = Array.from({ length: 14 }, (_, i) => new Date(Date.now() + (i + 1) * 864e5));
  return (
    <>
      <h1 className="wm-h1">Calendar &amp; availability</h1>
      <p className={s.muted} style={{ margin: 0 }}>Dispatch only offers you slots inside these hours (IST).</p>
      <div className={s.week}>
        {a.weekly_hours.map((d, i) => (
          <div key={DAYS[i]} className={s.day}>
            <Switch small tone="on" checked={d.on} label={`Working on ${DAYS[i]}`} onChange={() => setDay(i, { on: !d.on })} />
            <span className={s.dayName}>{DAYS[i]}</span>
            {d.on ? (
              <div className={s.hrs}>
                <select value={d.from} aria-label={`${DAYS[i]} start`} onChange={(e) => setDay(i, { from: +e.target.value })}>{HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
                <span aria-hidden="true">–</span>
                <select value={d.to} aria-label={`${DAYS[i]} end`} onChange={(e) => setDay(i, { to: +e.target.value })}>{HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
              </div>
            ) : <span className={s.muted} style={{ flex: 1, fontSize: "0.875rem" }}>Day off</span>}
          </div>
        ))}
      </div>
      <div className={s.sec}>
        <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Days off (next 2 weeks)</span>
        <div className={s.offDays}>
          {next14.map((d) => {
            const k = istYmd(d);
            const on = a.days_off.includes(k);
            const parts = Object.fromEntries(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric" }).formatToParts(d).map((x) => [x.type, x.value]));
            return (
              <button key={k} type="button" className={s.offDay} aria-pressed={on} aria-label={`${parts.weekday} ${parts.day}${on ? ", day off" : ""}`}
                onClick={() => change({ ...a, days_off: on ? a.days_off.filter((x) => x !== k) : [...a.days_off, k] })}>
                <span>{parts.weekday}</span><b>{parts.day}</b>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
