import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PetAvatar } from "@doggzi/ui/components/PetAvatar";
import { ServiceScene } from "@doggzi/ui/components/ServiceScene";
import { isReduced } from "@doggzi/ui/lib/reducedMotion";
import { errMsg } from "@/lib/api";
import { inr, istTime, istDayLabel } from "@/lib/format";
import { provider, type Offer } from "./api";
import { petKey, useUi } from "./shared";
import s from "./pv.module.css";

const REASONS = ["Too far", "Not available", "Not my skill", "Other"] as const;
const C = 169.6; // ring circumference (r = 27)

function OfferCard({ o, onAccepted }: { o: Offer; onAccepted: () => void }) {
  const qc = useQueryClient();
  const { flash } = useUi();
  const ref = useRef<HTMLElement>(null);
  const [declining, setDeclining] = useState(false);
  const [now, setNow] = useState(Date.now());
  const ends = useRef(Date.now() + o.seconds_left * 1000);
  useEffect(() => {
    if (!isReduced()) ref.current?.animate([{ transform: "translateY(40px)", opacity: 0 }, { transform: "none", opacity: 1, offset: 0.6 }, { transform: "rotate(-1.2deg)", offset: 0.75 }, { transform: "rotate(1.2deg)", offset: 0.88 }, { transform: "none" }], { duration: 450, easing: "ease-out" });
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((ends.current - now) / 1000));
  useEffect(() => {
    if (left === 0) { flash("Offer expired. It moved to the next provider."); qc.invalidateQueries({ queryKey: ["pv", "offers"] }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left === 0]);
  const accept = useMutation({
    mutationFn: () => provider.accept(o.id),
    onSuccess: () => { flash(`Accepted. ${o.pet.name} is on your Today list.`); qc.invalidateQueries({ queryKey: ["pv"] }); onAccepted(); },
    onError: (e) => { flash(errMsg(e)); qc.invalidateQueries({ queryKey: ["pv", "offers"] }); },
  });
  const decline = useMutation({
    mutationFn: (r: string) => provider.decline(o.id, r),
    onSuccess: (_d, r) => { flash(`Declined (${r.toLowerCase()}). It moved to the next provider.`); qc.invalidateQueries({ queryKey: ["pv", "offers"] }); },
    onError: (e) => flash(errMsg(e)),
  });
  const pk = petKey(o.pet);
  return (
    <article ref={ref} aria-live="assertive" className={s.offer}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div className={s.ring} role="timer" aria-label={`${left} seconds left to accept`}>
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="27" fill="var(--dz-paper)" stroke="var(--dz-disabled)" strokeWidth="6" />
            <circle cx="32" cy="32" r="27" fill="none" stroke={left <= 15 ? "var(--dz-alert)" : "var(--dz-green)"} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - left / Math.max(1, o.ttl_seconds))} />
          </svg>
          <b>{left}</b>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.125rem" }}>
          <span className="wm-chip" data-kind="new" style={{ alignSelf: "flex-start" }}>New offer</span>
          <span className={s.earnBig}>You earn {inr(o.earning_paise)}</span>
        </div>
      </div>
      <div className={s.svcGrid}>
        {o.services.map((sv) => (
          <div key={sv.name} className={s.svc}>
            <ServiceScene scene={sv.scene} pet={pk} petName={o.pet.name} label={`${sv.name} for ${o.pet.name}`} />
            <span>{sv.name}</span>
          </div>
        ))}
      </div>
      <div className={s.petRow}>
        <PetAvatar type={o.pet.type === "cat" ? "cat" : "dog"} breed={o.pet.breed} size={44} border={1.5} bg="var(--dz-paper)" />
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "0.125rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{o.pet.name}{o.pet.breed ? ` · ${o.pet.breed}` : ""}</span>
          {o.pet.note && <span className={s.note}>Note: {o.pet.note}</span>}
        </div>
      </div>
      <dl className={s.dl}>
        <dt>Slot</dt><dd>{istDayLabel(o.slot_start)}, {istTime(o.slot_start)}</dd>
        <dt>Area</dt><dd>{o.area}</dd>
      </dl>
      {declining && (
        <div role="group" aria-label="Reason for declining" className={s.reasons}>
          {REASONS.map((r) => <button key={r} type="button" className={s.reason} disabled={decline.isPending} onClick={() => decline.mutate(r)}>{r}</button>)}
        </div>
      )}
      <div className={s.two}>
        <button type="button" className={s.ghost} onClick={() => setDeclining(!declining)}>{declining ? "Back" : "Decline"}</button>
        <button type="button" className={s.go} disabled={accept.isPending || left === 0} onClick={() => accept.mutate()}>{accept.isPending ? "Accepting…" : "Accept"}</button>
      </div>
    </article>
  );
}

export function Offers({ offers, online, demo, onAccepted }: { offers: Offer[] | undefined; online: boolean; demo: boolean; onAccepted: () => void }) {
  const qc = useQueryClient();
  const { flash } = useUi();
  const ring = useMutation({ mutationFn: provider.demoOffer, onSuccess: () => qc.invalidateQueries({ queryKey: ["pv", "offers"] }), onError: (e) => flash(errMsg(e)) });
  return (
    <>
      <h1 className="wm-h1">Offers</h1>
      {offers?.map((o) => <OfferCard key={o.id} o={o} onAccepted={onAccepted} />)}
      {offers && !offers.length && (
        <div className={s.empty}>
          <span style={{ fontWeight: 600, fontSize: "1rem" }}>{online ? "No offers right now" : "You're offline"}</span>
          <span className={s.muted} style={{ fontSize: "0.875rem" }}>{online ? "We'll ring and buzz when a job near you comes in." : 'Switch "Go offline now" off to get offers again.'}</span>
        </div>
      )}
      {!offers && <div className={s.empty} aria-busy="true"><span className={s.muted}>Checking for offers…</span></div>}
      {demo && online && <button type="button" className={s.demoBtn} onClick={() => ring.mutate()} disabled={ring.isPending}>Demo: ring me with an offer</button>}
    </>
  );
}
