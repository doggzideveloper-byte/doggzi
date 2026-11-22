import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { errMsg } from "@/lib/api";
import { prettyPhone } from "@/lib/format";
import { Switch, useUi } from "../common/ui";
import { vendor, type Store as S, type StorePatch } from "./api";
import s from "./vd.module.css";

/** Text fields save on their own (debounced) — no Save buttons, as in the design. */
function useAutoSave() {
  const qc = useQueryClient();
  const { flash } = useUi();
  const t = useRef<number>();
  const m = useMutation({ mutationFn: vendor.patchStore, onSuccess: (st) => { qc.setQueryData(["vd", "store"], st); flash("Saved."); }, onError: (e) => { flash(errMsg(e)); qc.invalidateQueries({ queryKey: ["vd", "store"] }); } });
  return { save: (p: StorePatch, delay = 700) => { window.clearTimeout(t.current); t.current = window.setTimeout(() => m.mutate(p), delay); }, now: (p: StorePatch) => m.mutate(p) };
}

export function Store({ store }: { store: S | undefined }) {
  const qc = useQueryClient();
  const { flash } = useUi();
  const { save, now } = useAutoSave();
  const [f, setF] = useState({ name: "", story: "", since: "", hours: "", fee: "" });
  const [phone, setPhone] = useState("");
  const [sname, setSname] = useState("");
  useEffect(() => {
    if (store) setF({ name: store.name, story: store.story || "", since: store.since_year ? String(store.since_year) : "", hours: store.hours_text || "", fee: String(store.delivery_fee_paise / 100) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id]);
  const invite = useMutation({
    mutationFn: () => vendor.invite(phone, sname || undefined),
    onSuccess: (st) => { qc.setQueryData(["vd", "store"], st); flash(`Invited. They can sign in to the console with ${phone}.`); setPhone(""); setSname(""); },
    onError: (e) => flash(errMsg(e)),
  });
  const photo = useMutation({ mutationFn: ({ i, file }: { i: number; file: File }) => vendor.storePhoto(i, file), onSuccess: (st) => { qc.setQueryData(["vd", "store"], st); flash("Photo sent to Doggzi for approval."); }, onError: (e) => flash(errMsg(e)) });
  if (!store) return <><h1 className={s.h1}>Store profile</h1><p className={s.muted}>Loading…</p></>;
  const owner = store.my_role === "owner";
  const set = (k: keyof typeof f, v: string, patch: StorePatch | null) => { setF({ ...f, [k]: v }); if (patch) save(patch); };
  const onInvite = (e: FormEvent) => { e.preventDefault(); if (/^[6-9]\d{9}$/.test(phone)) invite.mutate(); else flash("Enter a 10-digit mobile number."); };
  return (
    <>
      <h1 className={s.h1}>Store profile</h1>
      <div className={s.cols3}>
        <section className={s.panel}>
          <h2 className={s.h2}>Shown in "Meet the stores"</h2>
          <label className={s.field}>Shop name<input value={f.name} disabled={!owner} onChange={(e) => set("name", e.target.value, e.target.value.trim().length >= 2 ? { name: e.target.value.trim() } : null)} /></label>
          <label className={s.field}>One-line story<input value={f.story} maxLength={90} onChange={(e) => set("story", e.target.value, { story: e.target.value })} /></label>
          <label className={s.field} style={{ width: "8.75rem" }}>Since<input inputMode="numeric" maxLength={4} value={f.since} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); set("since", v, v.length === 4 ? { since_year: +v } : null); }} /></label>
          <div className={s.photos}>
            {[0, 1, 2].map((i) => {
              const ph = store.photos[i];
              return <label key={i} className={s.photoSlot}><input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) photo.mutate({ i, file }); e.target.value = ""; }} />{ph ? `Photo ${i + 1} · ${ph.status}` : "+ Shop photo"}</label>;
            })}
          </div>
        </section>
        <section className={s.panel}>
          <h2 className={s.h2}>Opening &amp; delivery</h2>
          <div className={s.holidayRow} data-on={store.holiday_mode}>
            <span style={{ display: "flex", flexDirection: "column" }}><span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Holiday mode</span><span style={{ fontSize: "0.75rem" }}>Hides all your listings</span></span>
            <Switch checked={store.holiday_mode} label="Holiday mode" onChange={() => now({ holiday_mode: !store.holiday_mode })} />
          </div>
          <label className={s.field}>Hours<input value={f.hours} maxLength={80} onChange={(e) => set("hours", e.target.value, { hours_text: e.target.value })} /></label>
          <label className={s.field} style={{ width: "11.25rem" }}>Delivery fee (₹)<input inputMode="numeric" value={f.fee} disabled={!owner} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); set("fee", v, v ? { delivery_fee_paise: +v * 100 } : null); }} /></label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Delivery pincodes</span>
            <div className={s.pins}>{store.serviceable_pincodes.map((p) => <span key={p}>{p}</span>)}</div>
            <span className={s.muted} style={{ fontSize: "0.75rem" }}>Ask Doggzi OPS to change your delivery area.</span>
          </div>
        </section>
        <section className={s.panel}>
          <h2 className={s.h2}>Staff logins</h2>
          <ul className={s.staff}>
            {store.staff.map((m) => (
              <li key={m.phone}><span style={{ flex: 1, fontWeight: 600 }}>{m.name || "—"}{m.is_me ? " (you)" : ""}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{m.phone.startsWith("+") ? prettyPhone(m.phone) : m.phone}</span><span style={{ fontSize: "0.75rem", fontWeight: 600 }}>{m.role}</span></li>
            ))}
          </ul>
          {owner ? (
            <form className={s.invite} onSubmit={onInvite}>
              <input value={sname} maxLength={80} aria-label="Staff name" placeholder="Name (optional)" onChange={(e) => setSname(e.target.value)} />
              <input type="tel" inputMode="numeric" maxLength={10} value={phone} aria-label="Staff phone number" placeholder="Staff phone" onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} />
              <button type="submit" disabled={invite.isPending}>Invite</button>
            </form>
          ) : <span className={s.muted}>Only the store owner can invite staff.</span>}
        </section>
      </div>
    </>
  );
}
