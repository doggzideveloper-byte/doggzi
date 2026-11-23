import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isReduced } from "@doggzi/ui/lib/reducedMotion";
import { errMsg } from "@/lib/api";
import s from "./adm.module.css";

/* ---------- panel context: toast (with 5 s Undo), typed confirmation, picker, add drawer ---------- */
export interface Danger { title: string; body: string; word: string; cta: string; preview?: [string, string]; run: () => Promise<unknown> | void }
export interface PickOpt { label: string; sub?: string; pick: () => Promise<unknown> | void }
interface Ctx {
  isAdmin: boolean;
  flash: (msg: string, undo?: () => Promise<unknown> | void) => void;
  ask: (d: Danger) => void;
  pickFrom: (title: string, opts: PickOpt[]) => void;
  openAdd: (form: FormDef) => void;
}
const C = createContext<Ctx>(null as unknown as Ctx);
export const useAdmin = () => useContext(C);

export function AdminKit({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; msg: string; undo?: () => Promise<unknown> | void } | null>(null);
  const [danger, setDanger] = useState<Danger | null>(null);
  const [picker, setPicker] = useState<{ title: string; opts: PickOpt[] } | null>(null);
  const [form, setForm] = useState<FormDef | null>(null);
  const t = useRef<number>();
  const flash = useCallback((msg: string, undo?: () => Promise<unknown> | void) => {
    window.clearTimeout(t.current);
    setToast({ id: Date.now(), msg, undo });
    t.current = window.setTimeout(() => setToast(null), 5000);
  }, []);
  // Opening a sheet, picker or drawer clears the toast so it never covers their buttons.
  const v = useMemo(() => ({
    isAdmin, flash,
    ask: (d: Danger) => { setToast(null); setDanger(d); },
    pickFrom: (title: string, opts: PickOpt[]) => { setToast(null); setPicker({ title, opts }); },
    openAdd: (f: FormDef) => { setToast(null); setForm(f); },
  }), [isAdmin, flash]);
  return (
    <C.Provider value={v}>
      {children}
      {danger && <DangerSheet d={danger} onClose={() => setDanger(null)} />}
      {picker && <Picker {...picker} onClose={() => setPicker(null)} />}
      {form && <AddDrawer key={form.title} def={form} onClose={() => setForm(null)} />}
      {toast && <Toast key={toast.id} msg={toast.msg} undo={toast.undo} onDone={() => setToast(null)} />}
    </C.Provider>
  );
}

const slideIn = (el: HTMLElement | null, kf: Keyframe[], ms = 220) => { if (el && !isReduced()) el.animate(kf, { duration: ms, easing: "ease-out" }); };

function Toast({ msg, undo, onDone }: { msg: string; undo?: () => Promise<unknown> | void; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => slideIn(ref.current, [{ transform: "translate(-50%,12px)", opacity: 0 }, { transform: "translate(-50%,0)", opacity: 1 }], 200), []);
  return (
    <div ref={ref} role="status" className={s.toast}>
      <span>{msg}</span>
      {undo && <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await undo(); } finally { onDone(); } }}>Undo</button>}
    </div>
  );
}

/** Esc closes; focus moves into the dialog and back to where it was. */
function useDialog(onClose: () => void, focusSel = "input,select,textarea,button") {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => (ref.current?.querySelector(focusSel) as HTMLElement | null)?.focus(), 60);
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => { window.clearTimeout(t); window.removeEventListener("keydown", k); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

function DangerSheet({ d, onClose }: { d: Danger; onClose: () => void }) {
  const ref = useDialog(onClose, "input");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => slideIn(ref.current, [{ transform: "translateY(100%)" }, { transform: "none" }], 250), [ref]);
  const ok = text.trim() === d.word;
  const go = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try { await d.run(); onClose(); } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <div className={s.overlay} data-side="bottom" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="dg-t" aria-describedby="dg-b" className={s.sheet}>
        <h2 id="dg-t">{d.title}</h2>
        <p id="dg-b">{d.body}</p>
        {d.preview && (
          <div className={s.preview}>
            <div><span>Old price</span><s>{d.preview[0]}</s></div>
            <div><span>New price</span><b>{d.preview[1]}</b></div>
          </div>
        )}
        <label className={s.field}>
          <span>Type <code>{d.word}</code> to confirm</span>
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} autoComplete="off" spellCheck={false} />
        </label>
        {err && <p role="alert" className={s.fieldErr}>{err}</p>}
        <div className={s.two}>
          <button type="button" className={s.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={s.cta} data-tone="danger" disabled={!ok || busy} onClick={go}>{busy ? "Working…" : d.cta}</button>
        </div>
      </div>
    </div>
  );
}

function Picker({ title, opts, onClose }: { title: string; opts: PickOpt[]; onClose: () => void }) {
  const ref = useDialog(onClose);
  const [err, setErr] = useState("");
  return (
    <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="pk-t" className={s.dialog} style={{ maxWidth: "26.25rem" }}>
        <div className={s.dialogHead}><h2 id="pk-t">{title}</h2></div>
        {!opts.length && <p className={s.muted}>Nobody to pick right now.</p>}
        {opts.map((o) => (
          <button key={o.label} type="button" className={s.pick} onClick={async () => { try { await o.pick(); onClose(); } catch (e) { setErr(errMsg(e)); } }}>
            <span>{o.label}</span>{o.sub && <small>{o.sub}</small>}
          </button>
        ))}
        {err && <p role="alert" className={s.fieldErr}>{err}</p>}
        <button type="button" className={s.ghost} style={{ height: "2.75rem" }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

/* ---------- "+ Add" drawer: a small form engine with validation ---------- */
export type FieldKind = "text" | "tel" | "number" | "date" | "select" | "area" | "check";
export interface Field {
  key: string; label: string; kind?: FieldKind; req?: boolean; ph?: string; help?: string;
  options?: [string, string][] | ((v: Record<string, unknown>) => [string, string][]);
  /** Extra rule: return an error message or nothing. */
  check?: (val: unknown, all: Record<string, unknown>) => string | undefined | false;
}
export interface FormDef {
  title: string; cta?: string; fields: Field[]; initial?: Record<string, unknown>;
  /** Saves; throws ApiError on failure (shown under the form). Returning a string flashes it. */
  save: (v: Record<string, unknown>, draft?: boolean) => Promise<string | void>;
  draftable?: boolean;
  onChange?: (key: string, v: Record<string, unknown>) => Record<string, unknown> | void;
}

export const PHONE = (v: unknown) => (v && !/^[6-9]\d{9}$/.test(String(v)) ? "Enter a 10-digit Indian mobile number." : undefined);
export const PIN = (v: unknown) => (v && !/^\d{6}$/.test(String(v)) ? "Enter a 6-digit pincode." : undefined);
export const PINS = (v: unknown) => (v && !String(v).split(",").map((x) => x.trim()).filter(Boolean).every((x) => /^\d{6}$/.test(x)) ? "Use 6-digit pincodes separated by commas." : undefined);
export const MONEY = (v: unknown) => (v !== undefined && v !== "" && Number(v) <= 0 ? "Price must be more than ₹0." : undefined);

function AddDrawer({ def, onClose }: { def: FormDef; onClose: () => void }) {
  const ref = useDialog(onClose);
  const [vals, setVals] = useState<Record<string, unknown>>(def.initial || {});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const { flash } = useAdmin();
  useEffect(() => slideIn(ref.current, [{ transform: "translateX(100%)" }, { transform: "none" }]), [ref]);
  const set = (k: string, v: unknown) => {
    const next = { ...vals, [k]: v };
    const derived = def.onChange?.(k, next) || {};
    setVals({ ...next, ...derived });
    // Clear the error of every field this change filled in (e.g. picking a customer fills area and pincode).
    setErrs((e) => { const n = { ...e, [k]: "" }; Object.keys(derived).forEach((d) => { n[d] = ""; }); return n; });
  };
  const submit = async (draft = false) => {
    const e: Record<string, string> = {};
    def.fields.forEach((f) => {
      const v = vals[f.key];
      if (f.req && !draft && (f.kind === "check" ? !v : !String(v ?? "").trim())) e[f.key] = f.kind === "check" ? "This must be ticked." : `${f.label} is required.`;
      const extra = v !== undefined && v !== "" ? f.check?.(v, vals) : undefined;
      if (extra && !e[f.key]) e[f.key] = extra;
    });
    setErrs(e);
    if (Object.values(e).some(Boolean)) {
      (ref.current?.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus();
      return;
    }
    setBusy(true);
    setFormErr("");
    try {
      const msg = await def.save(vals, draft);
      onClose();
      if (msg) flash(msg);
    } catch (x) {
      setFormErr(errMsg(x));
      setBusy(false);
    }
  };
  return (
    <div className={s.overlay} data-side="right" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="af-t" className={s.drawer}>
        <div className={s.drawerHead}>
          <h2 id="af-t">{def.title}</h2>
          <button type="button" className={s.close} aria-label="Close" onClick={onClose}>×</button>
        </div>
        <form noValidate className={s.drawerBody} onSubmit={(e) => { e.preventDefault(); submit(false); }} id="af-form">
          {def.fields.map((f) => {
            const id = `af-${f.key}`;
            const err = errs[f.key];
            const v = vals[f.key];
            const opts = typeof f.options === "function" ? f.options(vals) : f.options || [];
            const label = f.label + (f.req ? " *" : "");
            const desc = [f.help && `${id}-h`, err && `${id}-e`].filter(Boolean).join(" ") || undefined;
            return (
              <div key={f.key} className={s.field} data-err={!!err}>
                {f.kind === "check" ? (
                  <label className={s.checkField} data-on={!!v}>
                    <input type="checkbox" checked={!!v} onChange={(e) => set(f.key, e.target.checked)} aria-invalid={!!err} aria-describedby={desc} />{label}
                  </label>
                ) : (
                  <>
                    <label htmlFor={id}>{label}</label>
                    {f.kind === "select" ? (
                      <select id={id} value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} aria-invalid={!!err} aria-describedby={desc}>
                        {opts.map(([ov, ol]) => <option key={ov} value={ov}>{ol}</option>)}
                      </select>
                    ) : f.kind === "area" ? (
                      <textarea id={id} rows={4} value={String(v ?? "")} placeholder={f.ph} onChange={(e) => set(f.key, e.target.value)} aria-invalid={!!err} aria-describedby={desc} />
                    ) : (
                      <input id={id} type={f.kind === "date" ? "date" : f.kind === "tel" ? "tel" : "text"} inputMode={f.kind === "tel" || f.kind === "number" ? "numeric" : undefined}
                        value={String(v ?? "")} placeholder={f.ph} aria-invalid={!!err} aria-describedby={desc}
                        onChange={(e) => set(f.key, f.kind === "tel" ? e.target.value.replace(/\D/g, "").slice(-10) : f.kind === "number" ? e.target.value.replace(/[^\d]/g, "") : e.target.value)} />
                    )}
                  </>
                )}
                {f.help && <span id={`${id}-h`} className={s.help}>{f.help}</span>}
                {err && <span id={`${id}-e`} role="alert" className={s.fieldErr}>{err}</span>}
              </div>
            );
          })}
          {formErr && <p role="alert" className={s.err}>{formErr}</p>}
        </form>
        <div className={s.drawerFoot} data-three={!!def.draftable}>
          <button type="button" className={s.ghost} onClick={onClose}>Cancel</button>
          {def.draftable && <button type="button" className={s.ghost} disabled={busy} onClick={() => submit(true)}>Save as draft</button>}
          <button type="submit" form="af-form" className={s.cta} disabled={busy}>{busy ? "Saving…" : def.cta || "Save"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- table module ---------- */
export interface Row { id: string; tone?: "alert" | "changed" | "muted"; search: string; fk: string; cells: ReactNode[] }
export function TableModule({ title, note, cols, rows, filters, adds, subtabs, exportName, searchPh, minWidth, extra, loading, error, numCols = [] }: {
  title: string; note: ReactNode; cols: string[]; rows: Row[]; filters: [string, string][]; adds?: ReactNode; subtabs?: ReactNode; exportName?: string | null;
  searchPh?: string; minWidth?: string; extra?: ReactNode; loading?: boolean; error?: unknown; numCols?: number[];
}) {
  const { isAdmin, flash } = useAdmin();
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  useEffect(() => { setQ(""); setF("all"); }, [title, exportName]);
  const qq = q.trim().toLowerCase();
  const shown = rows.filter((r) => (!qq || r.search.toLowerCase().includes(qq)) && (f === "all" || r.fk === f));
  return (
    <>
      <div className={s.titleRow}>
        <h1 className={s.h1}>{title}</h1>
        <span className={s.muted}>{note}</span>
        {adds}
      </div>
      {subtabs}
      <div className={s.tools}>
        <input type="search" className={s.search} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" placeholder={searchPh || "Search"} />
        <select className={s.select} value={f} onChange={(e) => setF(e.target.value)} aria-label="Filter">
          {filters.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {isAdmin && exportName && (
          <button type="button" className={s.small} style={{ height: "2.5rem" }} onClick={async () => { try { await (await import("./api")).adm.exportCsv(exportName); flash("Export downloaded and logged in the audit log."); } catch (e) { flash(errMsg(e)); } }}>Export CSV</button>
        )}
        {extra}
      </div>
      {error ? <p role="alert" className={s.err}>{errMsg(error, "We couldn't load this. Try again.")}</p> : null}
      <div className={s.tableWrap}>
        <table className={s.table} style={{ minWidth: minWidth || "56rem" }}>
          <thead><tr>{cols.map((c, i) => <th key={i} scope="col" className={numCols.includes(i) ? s.num : undefined}>{c}</th>)}</tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} data-row={r.id} data-tone={r.tone}>
                {r.cells.map((c, i) => <td key={i} className={numCols.includes(i) ? s.num : undefined}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {loading && !rows.length && <p className={s.empty}>Loading…</p>}
        {!loading && !shown.length && <p className={s.empty}>{rows.length ? "No matches." : "Nothing here yet."}</p>}
      </div>
      <span className={s.count}>{shown.length} of {rows.length} rows</span>
    </>
  );
}

export const Cell = ({ main, sub, cls }: { main: ReactNode; sub?: ReactNode; cls?: string }) => (
  <><span className={`${s.cellMain} ${cls || ""}`}>{main}</span>{sub ? <span className={s.cellSub}>{sub}</span> : null}</>
);
export const Act = ({ children, onClick, danger, disabled }: { children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) => (
  <button type="button" className={s.small} data-tone={danger ? "danger" : undefined} onClick={onClick} disabled={disabled}>{children}</button>
);
export const Acts = ({ children }: { children: ReactNode }) => <span className={s.acts}>{children}</span>;
export const AddBtns = ({ items }: { items: [string, () => void][] }) => (
  <div className={s.adds}>{items.map(([l, fn]) => <button key={l} type="button" className={s.add} onClick={fn}>{l}</button>)}</div>
);
export const SubTabs = <T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) => (
  <div role="tablist" className={s.tabs}>{tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={value === k} className={s.tab} onClick={() => onChange(k)}>{l}</button>)}</div>
);
export function pulse(id: string) {
  if (isReduced()) return;
  window.setTimeout(() => document.querySelectorAll(`[data-card="${id}"],[data-row="${id}"]`).forEach((el) => (el as HTMLElement).animate(
    [{ transform: "translateY(-6px)", opacity: 0.4 }, { transform: "none", opacity: 1 }], { duration: 220, easing: "ease-out" })), 60);
}
export function redPulse(el: HTMLElement | null) {
  if (!el || isReduced()) return;
  el.animate([{ transform: "translateX(-8px)", opacity: 0 }, { transform: "none", opacity: 1, offset: 0.5 }, { transform: "scale(1.02)", offset: 0.75 }, { transform: "none" }], { duration: 250, easing: "ease-out" });
}
