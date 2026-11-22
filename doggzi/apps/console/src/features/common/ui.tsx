import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { isReduced } from "@doggzi/ui/lib/reducedMotion";
import s from "./ui.module.css";

/** Shared console UI: dark toast, mute setting, status chip (pulses on change) and the switch. */
interface Ctx { flash: (msg: string) => void; muted: boolean; setMuted: (m: boolean) => void }
const UiCtx = createContext<Ctx>({ flash: () => undefined, muted: false, setMuted: () => undefined });
export const useUi = () => useContext(UiCtx);

export function UiProvider({ children, toastBottom }: { children: ReactNode; toastBottom?: string }) {
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const [muted, setMutedState] = useState(() => { try { return localStorage.getItem("dz.console.muted") === "1"; } catch { return false; } });
  const timer = useRef<number>();
  const flash = useCallback((msg: string) => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), msg });
    timer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  const setMuted = (m: boolean) => { setMutedState(m); try { localStorage.setItem("dz.console.muted", m ? "1" : "0"); } catch { /* ignore */ } };
  return (
    <UiCtx.Provider value={{ flash, muted, setMuted }}>
      {children}
      {toast && <Toast key={toast.id} msg={toast.msg} bottom={toastBottom} />}
    </UiCtx.Provider>
  );
}

function Toast({ msg, bottom }: { msg: string; bottom?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isReduced()) ref.current?.animate([{ transform: "translate(-50%,12px)", opacity: 0 }, { transform: "translate(-50%,0)", opacity: 1 }], { duration: 200, easing: "ease-out" });
  }, []);
  return <div ref={ref} role="status" className={s.toast} style={bottom ? ({ "--toast-bottom": bottom } as React.CSSProperties) : undefined}>{msg}</div>;
}

export function Chip({ kind, children, pulseKey }: { kind: string; children: ReactNode; pulseKey?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!isReduced()) ref.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 220, easing: "ease-out" });
  }, [pulseKey]);
  return <span ref={ref} className="wm-chip" data-kind={kind}>{children}</span>;
}

export function Switch({ checked, onChange, label, tone = "alert", small }: { checked: boolean; onChange: () => void; label?: string; tone?: "alert" | "on"; small?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange} className={`${s.switch} ${tone === "on" ? s.on : ""} ${small ? s.small : ""}`}>
      <span aria-hidden="true" />
    </button>
  );
}

/** Header controls shared by the panels. */
export function MuteButton({ className }: { className: string }) {
  const { muted, setMuted } = useUi();
  return (
    <button type="button" className={className} aria-pressed={muted} aria-label={muted ? "Unmute alerts" : "Mute alerts"} onClick={() => setMuted(!muted)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--dz-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="var(--dz-cream)" /><path d={muted ? "M16 9l5 6M21 9l-5 6" : "M16 8c2 2 2 6 0 8M19 5c4 4 4 10 0 14"} /></svg>
    </button>
  );
}
