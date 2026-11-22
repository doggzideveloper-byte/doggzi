import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { AppDownload, Badge, Button, PetAvatar, Sweep, useToast } from "@/design-system/components";
import { css, ms } from "@/design-system/motion";
import { track } from "@/lib/analytics";
import { isUnreachable } from "@/lib/api/client";
import { petProfile, type Activity, type Allergy, type LifeStage } from "@/lib/api/petProfile";
import { possessive } from "@/lib/format";
import { passportStore, type Passport } from "@/lib/passport";
import { isReduced, useReduced } from "@/lib/reducedMotion";
import s from "./ff.module.css";

const ALLERGIES = ["Chicken", "Beef", "Grains", "Dairy", "None"];
const ACTIVITY: [Activity, string][] = [["couch_potato", "Couch potato"], ["normal", "Normal"], ["zoomies", "Zoomies"]];

interface Nut { weight: number | null; stage: LifeStage | null; years: string; allergies: string[]; activity: Activity | null }
const fromPassport = (p: Passport): Nut => {
  const n = p.nutrition;
  if (!n) return { weight: null, stage: null, years: "", allergies: [], activity: null };
  return {
    weight: n.weight_kg ?? null,
    stage: n.life_stage ?? null,
    years: n.age_years != null ? String(n.age_years) : "",
    allergies: n.allergies?.length ? n.allergies.map((a) => a[0].toUpperCase() + a.slice(1)) : ["None"],
    activity: n.activity_level ?? null,
  };
};

/**
 * "Your nutritionist needs a few more things": weight, age, allergies, activity. The passport card grows a
 * Nutrition section as they answer. Saving PATCHes /pets/{id}/nutrition — no portions, calories or prices here.
 */
export function PlanPreview({ pet, isDemo }: { pet: Passport; isDemo: boolean }) {
  const reduced = useReduced();
  const toast = useToast();
  const [nut, setNutState] = useState<Nut>(() => fromPassport(pet));
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savedRef = useRef<HTMLDivElement>(null);
  useEffect(() => setNutState(fromPassport(pet)), [pet.name, pet.type]); // eslint-disable-line react-hooks/exhaustive-deps

  const setNut = (patch: Partial<Nut>) => {
    setNutState((n) => ({ ...n, ...patch }));
    setErr(null);
    setSaved(false);
  };

  const save = useMutation({
    mutationFn: async (n: NonNullable<Passport["nutrition"]>) => {
      if (isDemo) return;
      const cur = passportStore.get();
      if (cur?.pet_id && cur.guest_token) {
        try {
          await petProfile.nutrition(cur.pet_id, cur.guest_token, n);
        } catch (e) {
          if (!isUnreachable(e)) throw e; // offline: keep it locally, it syncs with the passport later
        }
      }
      passportStore.set((p) => (p ? { ...p, nutrition: n } : p));
    },
    onSuccess: () => {
      track("fresh_food_nutrition_saved", {});
      setSaved(true);
    },
    onError: (e) => toast(e instanceof Error ? e.message : "Couldn't save that. Try again?", "error"),
  });

  useEffect(() => {
    if (!saved || !savedRef.current) return;
    savedRef.current.animate(isReduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: "translateY(16px) scale(.96)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: isReduced() ? ms.reduced : 450, easing: css.bouncy });
  }, [saved]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const miss = [nut.weight == null && "weight", !nut.stage && "age", !nut.allergies.length && "allergies (or None)", !nut.activity && "activity"].filter(Boolean);
    if (miss.length) return setErr(`Almost there — add ${miss.join(", ")}.`);
    save.mutate({
      weight_kg: nut.weight!,
      life_stage: nut.stage!,
      age_years: nut.years === "" ? null : +nut.years,
      allergies: nut.allergies.includes("None") ? [] : (nut.allergies.map((x) => x.toLowerCase()) as Allergy[]),
      activity_level: nut.activity!,
    });
  };

  const poss = possessive(pet.name);
  const stageOpts: [LifeStage, string][] = [[pet.type === "cat" ? "kitten" : "puppy", pet.type === "cat" ? "Kitten" : "Puppy"], ["adult", "Adult"], ["senior", "Senior"]];
  const stageLabel = stageOpts.find((o) => o[0] === nut.stage)?.[1];
  const ageTxt = [stageLabel, nut.years !== "" ? `${nut.years} yrs` : null].filter(Boolean).join(" · ");
  const vals: [string, string][] = [["Weight", nut.weight != null ? `${nut.weight} kg` : ""], ["Age", ageTxt], ["Allergies", nut.allergies.join(", ")], ["Activity", ACTIVITY.find((o) => o[0] === nut.activity)?.[1] || ""]];
  const anyNut = vals.some((v) => v[1]);
  const letterAnim = reduced ? "dzFade 150ms both" : `dzLetter 360ms ${css.bouncy} both`;
  const chip = (on: boolean, label: string, onClick: () => void) => <button key={label} type="button" aria-pressed={on} className={s.chip} onClick={onClick}>{label}</button>;

  return (
    <section id="plan-preview" data-reveal="" className={`${s.wrap} ${s.preview}`} style={{ paddingTop: "clamp(3.5rem,8vw,6.5rem)", paddingBottom: "clamp(3.5rem,8vw,6.5rem)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", minWidth: 0 }}>
        <div data-ri="" className={s.head}>
          <Badge>{poss} plan</Badge>
          <h2 className="dz-display" style={{ fontSize: "clamp(1.8rem,4.2vw,2.8rem)", lineHeight: 1.08 }}>Your nutritionist needs a few more things about <Sweep>{pet.name}</Sweep></h2>
          <p className={s.muted}>No portions, calories or prices here. Your nutritionist sets those in the app.</p>
        </div>
        <form data-ri="" onSubmit={submit} noValidate className={s.form}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            <label htmlFor="ff-weight" className={s.fLabel} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.75rem" }}>
              Weight <span style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: "1.375rem", fontVariantNumeric: "tabular-nums" }}>{nut.weight != null ? `${nut.weight} kg` : "— kg"}</span>
            </label>
            <input id="ff-weight" type="range" min={1} max={80} step={0.5} value={nut.weight ?? 15} className={s.range} aria-valuetext={nut.weight != null ? `${nut.weight} kg` : "not set"} onChange={(e) => setNut({ weight: parseFloat(e.target.value) })} />
            <div aria-hidden="true" style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "rgba(20,18,16,.7)" }}><span>1 kg</span><span>80 kg</span></div>
          </div>
          <div role="group" aria-labelledby="ff-age-l" style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            <span id="ff-age-l" className={s.fLabel}>Age</span>
            <div className={s.chips}>
              {stageOpts.map(([k, l]) => chip(nut.stage === k, l, () => setNut({ stage: nut.stage === k ? null : k })))}
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9375rem", fontWeight: 500 }}>
                <input type="number" min={0} max={25} step={0.5} inputMode="decimal" value={nut.years} aria-label="Age in years" placeholder="0" className={s.years}
                  onChange={(e) => { const v = e.target.value; if (v === "" || (+v >= 0 && +v <= 25)) setNut({ years: v }); }} />
                years
              </label>
            </div>
          </div>
          <div role="group" aria-labelledby="ff-all-l" style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            <span id="ff-all-l" className={s.fLabel}>Allergies</span>
            <div className={s.chips}>
              {ALLERGIES.map((a) => chip(nut.allergies.includes(a), a, () => {
                let l = nut.allergies;
                if (a === "None") l = l.includes("None") ? [] : ["None"];
                else l = l.includes(a) ? l.filter((x) => x !== a) : [...l.filter((x) => x !== "None"), a];
                setNut({ allergies: l });
              }))}
            </div>
          </div>
          <div role="group" aria-labelledby="ff-act-l" style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            <span id="ff-act-l" className={s.fLabel}>Activity</span>
            <div className={s.chips}>{ACTIVITY.map(([k, l]) => chip(nut.activity === k, l, () => setNut({ activity: nut.activity === k ? null : k })))}</div>
          </div>
          {err && <p role="alert" className={s.err}>{err}</p>}
          <Button type="submit" block disabled={save.isPending} style={{ height: "3.625rem", fontSize: "1.125rem" }}>{save.isPending ? "Saving…" : `Save to ${poss} passport`}</Button>
        </form>
      </div>

      <div data-ri="" className={s.sticky}>
        <div className={s.pass}>
          <div className={s.passBar}><span>Doggzi pet passport</span><span>Delhi NCR</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.125rem", padding: "1.125rem 1.25rem" }}>
            <PetAvatar type={pet.type} breed={pet.breed} size={88} border={2.5} />
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span className={s.passName}>{pet.name}</span>
              <span style={{ fontSize: "0.9375rem", fontWeight: 500, color: "var(--ink-75)" }}>{pet.type === "cat" ? "Cat" : "Dog"} · {pet.breed}</span>
            </div>
          </div>
          <div className={s.grow} style={{ gridTemplateRows: anyNut ? "1fr" : "0fr" }}>
            <div>
              <div style={{ borderTop: "2.5px dashed var(--dz-ink)", padding: "0.875rem 1.25rem 1.125rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                <span style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: "0.875rem", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--dz-green-700)" }}>Nutrition</span>
                <dl className={s.dl}>
                  {vals.map(([k, v]) => (
                    <div key={k} style={{ display: "contents" }}>
                      <dt>{k}</dt>
                      <dd>{v ? v.split("").map((ch, i) => <span key={i} style={{ display: "inline-block", whiteSpace: "pre", animation: letterAnim }}>{ch}</span>) : <span style={{ color: "rgba(20,18,16,.3)" }}>—</span>}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </div>
        {saved && (
          <div ref={savedRef} role="status" className={s.savedBox}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: "1.0625rem", lineHeight: 1.45 }}>Saved to {poss} passport ✓. Your nutritionist will use this in the app.</p>
            <AppDownload layout="compact" source="fresh_food_plan" />
          </div>
        )}
      </div>
    </section>
  );
}
