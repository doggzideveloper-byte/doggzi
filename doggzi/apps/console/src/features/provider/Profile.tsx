import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { errMsg } from "@/lib/api";
import { authApi } from "@/lib/auth";
import { session } from "@/lib/session";
import { provider, type Profile as P } from "./api";
import { useUi } from "./shared";
import s from "./pv.module.css";

export function Profile({ me }: { me: P | undefined }) {
  const qc = useQueryClient();
  const { flash } = useUi();
  const [pin, setPin] = useState("");
  const set = (p: P) => qc.setQueryData(["pv", "me"], p);
  const patch = useMutation({ mutationFn: provider.patch, onSuccess: set, onError: (e) => flash(errMsg(e)) });
  const upload = useMutation({ mutationFn: ({ i, f }: { i: number; f: File }) => provider.uploadDoc(i, f), onSuccess: (p) => { set(p); flash("Uploaded. OPS will verify it soon."); }, onError: (e) => flash(errMsg(e)) });
  const logoutAll = useMutation({ mutationFn: authApi.logoutAll, onSettled: () => { session.set(null); location.assign("/console/login"); } });
  if (!me) return <><h1 className="wm-h1">Profile</h1><div className={s.empty} aria-busy="true"><span className={s.muted}>Loading…</span></div></>;
  const addPin = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(pin)) return flash("Pincodes are 6 digits.");
    if (!me.areas.includes(pin)) patch.mutate({ areas: [...me.areas, pin] });
    setPin("");
  };
  return (
    <>
      <h1 className="wm-h1">Profile</h1>
      <div className={s.rating}>
        <b>{me.rating.toFixed(1)}</b>
        <span style={{ display: "flex", flexDirection: "column", fontSize: "0.8125rem" }}><span style={{ fontWeight: 600 }}>Rating</span><span>From {me.jobs_done} completed jobs</span></span>
      </div>
      <section className={s.sec}>
        <h2 className={s.h2} style={{ margin: 0 }}>Skills</h2>
        <div className={s.chips}>
          {me.skill_options.map((o) => {
            const on = me.skills.includes(o.key);
            return <button key={o.key} type="button" className={s.skill} aria-pressed={on} onClick={() => patch.mutate({ skills: on ? me.skills.filter((x) => x !== o.key) : [...me.skills, o.key] })}>{o.label}</button>;
          })}
        </div>
      </section>
      <section className={s.sec}>
        <h2 className={s.h2} style={{ margin: 0 }}>Areas (pincodes)</h2>
        <div className={s.chips}>
          {me.areas.map((a) => (
            <span key={a} className={s.pin}>{a}<button type="button" aria-label={`Remove ${a}`} onClick={() => patch.mutate({ areas: me.areas.filter((x) => x !== a) })}>×</button></span>
          ))}
        </div>
        <form onSubmit={addPin} className={s.addPin}>
          <input inputMode="numeric" maxLength={6} value={pin} aria-label="Add a pincode" placeholder="Add pincode" onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          <button type="submit">Add</button>
        </form>
      </section>
      <section className={s.sec}>
        <h2 className={s.h2} style={{ margin: 0 }}>Documents</h2>
        {me.docs.map((d, i) => (
          <div key={d.name} className={s.doc}>
            <span style={{ flex: 1, fontWeight: 600, fontSize: "0.875rem" }}>{d.name}</span>
            <span className="wm-chip" data-kind={d.status === "Verified" ? "done" : d.status === "In review" ? "acc" : "alert"}>{d.status}</span>
            <label className={s.upload}><input type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate({ i, f }); e.target.value = ""; }} />Upload</label>
          </div>
        ))}
      </section>
      {"Notification" in window && Notification.permission === "default" && (
        <button type="button" className={s.ghost} style={{ height: "3rem", fontSize: "0.9375rem" }} onClick={() => Notification.requestPermission().then((r) => flash(r === "granted" ? "Phone alerts are on." : "Alerts stay off. You can change this in your browser settings."))}>Turn on phone alerts</button>
      )}
      <button type="button" className={s.ghost} style={{ height: "3rem", fontSize: "0.9375rem" }} disabled={logoutAll.isPending} onClick={() => logoutAll.mutate()}>Log out of all devices</button>
    </>
  );
}
