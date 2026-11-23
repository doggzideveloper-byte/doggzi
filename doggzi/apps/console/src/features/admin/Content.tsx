import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { errMsg } from "@/lib/api";
import { adm, type Content as C, type ContentItem } from "./api";
import { forms } from "./forms";
import { AddBtns, pulse, useAdmin } from "./kit";
import s from "./adm.module.css";

const CFG: [keyof C["config"], string, string][] = [["whatsapp", "WhatsApp (digits, with 91)", "numeric"], ["phone", "Phone", "tel"], ["email", "Email", "email"], ["fssai", "FSSAI no. (14 digits, once issued)", "numeric"], ["delivery_areas", "Delivery areas", "text"]];

export function Content() {
  const { flash, ask, openAdd } = useAdmin();
  const q = useQuery({ queryKey: ["ad", "content"], queryFn: adm.content });
  const d = q.data;
  const [cfg, setCfg] = useState<C["config"] | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (d && !cfg) setCfg(d.config); }, [d, cfg]);
  const refresh = (x?: ContentItem) => { q.refetch(); if (x) pulse(x.id); };
  const patch = async (x: ContentItem, b: Record<string, unknown>, msg: string) => { try { await adm.patchContent(x.id, b); refresh(x); flash(msg); } catch (e) { flash(errMsg(e)); } };
  const dirty = !!(cfg && d && JSON.stringify(cfg) !== JSON.stringify(d.config));

  return (
    <>
      <div className={s.titleRow}>
        <h1 className={s.h1}>Content</h1>
        <span className={s.muted}>Drafts stay off the site until you make them live.</span>
        <AddBtns items={[["+ Add FAQ", () => openAdd(forms.faq(refresh))], ["+ Add testimonial", () => openAdd(forms.testimonial(refresh))], ["+ Add video", () => openAdd(forms.video(refresh))]]} />
      </div>
      {q.isError && <p role="alert" className={s.err}>{errMsg(q.error)}</p>}
      {!d && !q.isError && <div className={s.skel} />}
      {d && cfg && (
        <div className={s.grid3}>
          <section className={s.section}>
            <h2 className={s.h2}>Testimonials</h2>
            <p className={s.muted} style={{ margin: 0 }}>A testimonial can only go live once customer consent is recorded.</p>
            {!d.testimonials.length && <p className={s.muted}>None yet.</p>}
            {d.testimonials.map((t) => (
              <div key={t.id} data-row={t.id} className={s.item}>
                <b>{t.data.pet} · {t.data.service}{t.data.placeholder ? " · Placeholder" : ""}</b>
                <q>{t.data.quote}</q>
                <div className={s.itemRow}>
                  <label className={s.consent}><input type="checkbox" className={s.cb} checked={t.consent}
                    onChange={() => (t.consent && t.status === "live"
                      ? ask({ title: `Remove consent for ${t.data.pet}?`, body: "The testimonial comes off the site straight away.", word: "CONFIRM", cta: "Remove consent", run: () => patch(t, { consent: false }, "Consent removed; testimonial is a draft.") })
                      : patch(t, { consent: !t.consent }, t.consent ? "Consent removed." : "Consent recorded."))} />Customer consent recorded</label>
                  <button type="button" role="switch" aria-checked={t.status === "live"} className={s.liveBtn} disabled={!t.consent}
                    onClick={() => patch(t, { status: t.status === "live" ? "draft" : "live" }, t.status === "live" ? "Back to draft." : "Testimonial is live.")}>
                    {t.status === "live" ? "Live" : "Draft · make live"}
                  </button>
                </div>
              </div>
            ))}
          </section>
          <section className={s.section}>
            <h2 className={s.h2}>FAQs by page</h2>
            {d.faq_sets.map((f) => (
              <div key={f.page} className={s.rowItem}>
                <span>{f.page}</span><span>{f.count} questions{f.live !== f.count && f.live ? ` · ${f.live} live` : ""}</span>
                <button type="button" role="switch" aria-checked={f.status === "live"} className={s.liveBtn} disabled={!f.count}
                  onClick={async () => { try { await adm.faqSet(f.page, f.status === "live" ? "draft" : "live"); refresh(); flash(`${f.page} FAQs ${f.status === "live" ? "back to draft" : "live"}.`); } catch (e) { flash(errMsg(e)); } }}>
                  {f.status === "live" ? "Live" : "Draft"}
                </button>
              </div>
            ))}
            <h2 className={s.h2} style={{ marginTop: "0.5rem" }}>YouTube Shorts</h2>
            {d.videos.map((v) => (
              <div key={v.id} data-row={v.id} className={s.rowItem} style={{ fontVariantNumeric: "tabular-nums" }}>
                <span>{v.data.video_id}</span><span>{v.page}</span>
                <button type="button" role="switch" aria-checked={v.status === "live"} className={s.liveBtn} onClick={() => patch(v, { status: v.status === "live" ? "draft" : "live" }, v.status === "live" ? "Video hidden." : "Video live.")}>
                  {v.status === "live" ? "Live" : "Hidden"}
                </button>
              </div>
            ))}
          </section>
          <section className={s.section}>
            <h2 className={s.h2}>Site config</h2>
            {CFG.map(([k, label, mode]) => (
              <label key={k} className={s.field}>{label}
                <input value={String(cfg[k] ?? "")} inputMode={mode === "numeric" ? "numeric" : undefined} type={mode === "email" ? "email" : "text"}
                  onChange={(e) => setCfg({ ...cfg, [k]: mode === "numeric" ? e.target.value.replace(/\D/g, "") : e.target.value })} />
              </label>
            ))}
            <label className={s.checkField} data-on={cfg.cats_supported}><input type="checkbox" checked={cfg.cats_supported} onChange={() => setCfg({ ...cfg, cats_supported: !cfg.cats_supported })} />catsSupported (Fresh Food for cats)</label>
            <span className={s.muted}>Switching ratios (draft): 25% → 50% → 75% → 100% fresh over 7 days</span>
            <button type="button" className={s.dark} disabled={!dirty || saving} onClick={async () => {
              setSaving(true);
              try { const r = await adm.saveConfig(cfg); setCfg(r); q.refetch(); flash("Site config saved."); } catch (e) { flash(errMsg(e)); } finally { setSaving(false); }
            }}>{saving ? "Saving…" : "Save config"}</button>
          </section>
        </div>
      )}
    </>
  );
}
