import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { avatarVariant, type AvatarVariant } from "@doggzi/ui/lib/pet";
import { isReduced } from "@doggzi/ui/lib/reducedMotion";
import type { Pet, Step } from "./api";
import s from "./pv.module.css";

export const petKey = (p: Pet): AvatarVariant => avatarVariant(p.type === "cat" ? "cat" : "dog", p.breed) || "dog";

/** Status chip label + kind per job step (PANELS_00_SHARED: new orange, accepted green outline, in progress green, done ink). */
export const STATUS: Record<Step, [string, "new" | "acc" | "prog" | "done"]> = {
  accepted: ["Accepted", "acc"], travel: ["En route", "prog"], arrived: ["Arrived", "prog"], in_service: ["In service", "prog"], completed: ["Collect payment", "new"], done: ["Done", "done"],
};
/** What the customer's WhatsApp says after each step (sent by the server). */
export const WA: Partial<Record<Step, string>> = { travel: "is on the way", arrived: "has arrived", in_service: "started the service", completed: "finished the service", done: "marked payment collected" };

interface Ctx { flash: (msg: string) => void; muted: boolean; setMuted: (m: boolean) => void }
const UiCtx = createContext<Ctx>({ flash: () => undefined, muted: false, setMuted: () => undefined });
export const useUi = () => useContext(UiCtx);

export function UiProvider({ children }: { children: ReactNode }) {
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
      {toast && <Toast key={toast.id} msg={toast.msg} />}
    </UiCtx.Provider>
  );
}

function Toast({ msg }: { msg: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isReduced()) ref.current?.animate([{ transform: "translate(-50%,12px)", opacity: 0 }, { transform: "translate(-50%,0)", opacity: 1 }], { duration: 200, easing: "ease-out" });
  }, []);
  return <div ref={ref} role="status" className={s.toast}>{msg}</div>;
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
