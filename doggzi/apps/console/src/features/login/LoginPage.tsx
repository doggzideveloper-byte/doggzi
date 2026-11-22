import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isReduced } from "@doggzi/ui/lib/reducedMotion";
import { ApiError, errMsg } from "@/lib/api";
import { authApi } from "@/lib/auth";
import { panelsFor, session, useSession, type Role } from "@/lib/session";
import s from "./login.module.css";

type Step = "phone" | "otp" | "resume" | "choose";
const EMPTY = ["", "", "", "", "", ""];

/** Console login (Console-Login design): phone → 6-digit OTP → panel (or a panel chooser for several roles). */
export default function LoginPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const reason = sp.get("reason");
  const next = sp.get("next");
  const current = useSession();
  const [step, setStep] = useState<Step>(current && !reason ? "resume" : "phone");
  const [phone, setPhone] = useState(sp.get("phone") || "");
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const [digits, setDigits] = useState(EMPTY);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [otpErr, setOtpErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockUntil, setLockUntil] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const card = useRef<HTMLDivElement>(null);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const banner = reason === "noaccess" ? "You don't have access to that panel." : reason === "signin" ? "Please sign in." : null;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const shake = () => {
    if (!isReduced()) card.current?.animate([{ transform: "none" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-3px)" }, { transform: "none" }], { duration: 220, easing: "ease-out" });
  };
  const focusBox = (i: number) => { const b = boxes.current[Math.max(0, Math.min(5, i))]; b?.focus(); b?.select(); };
  const digitsOnly = phone.replace(/\D/g, "").slice(-10);

  const go = (roles: Role[], role?: Role) => {
    const ps = panelsFor(roles);
    const want = next && ps.find((p) => next.startsWith(p.path));
    const pick = want || ps.find((p) => p.role === role) || (ps.length === 1 ? ps[0] : null);
    if (!pick) return setStep("choose");
    session.setRole(pick.role);
    nav(want ? next! : pick.path, { replace: true });
  };

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (!/^[6-9]\d{9}$/.test(digitsOnly)) { setPhoneErr("Enter a 10-digit mobile number."); shake(); return; }
    setBusy(true);
    try {
      const r = await authApi.request(digitsOnly);
      setDevCode(r.dev_code);
      setDigits(EMPTY);
      setOtpErr(null);
      setResendAt(Date.now() + 30000);
      setStep("otp");
      setTimeout(() => focusBox(0), 30);
    } catch (err) {
      setPhoneErr(errMsg(err));
      shake();
    } finally {
      setBusy(false);
    }
  }

  async function verify(code = digits.join("")) {
    if (code.length !== 6 || Date.now() < lockUntil || busy) return;
    setBusy(true);
    try {
      const r = await authApi.verify(digitsOnly, code);
      const roles = r.user.roles;
      session.set({ token: r.access_token, user: r.user, role: panelsFor(roles)[0]?.role || roles[0], expires_at: Date.now() + r.expires_in * 1000 });
      go(roles);
    } catch (err) {
      const msg = errMsg(err);
      const locked = err instanceof ApiError && /Too many|expired/.test(msg);
      if (locked) setLockUntil(Date.now() + 60000);
      setOtpErr(locked ? "Too many wrong tries. Locked for 60 seconds, then ask for a new code." : msg);
      setDigits(EMPTY);
      shake();
      setTimeout(() => focusBox(0), 30);
    } finally {
      setBusy(false);
    }
  }

  const setD = (nd: string[], focus: number | null) => {
    setDigits(nd);
    setOtpErr(null);
    if (focus != null) focusBox(focus);
    if (nd.every(Boolean)) verify(nd.join(""));
  };
  const onPaste = (e: ClipboardEvent) => {
    const t = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!t) return;
    e.preventDefault();
    const nd = [...EMPTY];
    t.split("").forEach((c, k) => (nd[k] = c));
    setD(nd, Math.min(5, t.length));
  };

  const locked = now < lockUntil;
  const lockLeft = Math.ceil((lockUntil - now) / 1000);
  const resendLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const firstName = (current?.user.name || "").split(" ")[0];

  return (
    <div className={`${s.page} wm-root`}>
      <div ref={card} className={s.card}>
        <div className={s.brand}>
          <span aria-hidden="true" className={s.mark} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
            <h1 className={s.title}>Doggzi Console</h1>
            <span className={s.sub}>For providers, stores and the Doggzi team</span>
          </div>
        </div>

        {banner && step === "phone" && <p role="alert" className={s.banner}>{banner}</p>}

        {step === "phone" && (
          <form onSubmit={sendCode} noValidate className={s.col}>
            <label htmlFor="cl-phone" className={s.label}>Mobile number</label>
            <div className={s.phoneBox}>
              <span aria-hidden="true" className={s.cc}>+91</span>
              <input id="cl-phone" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={11} value={phone} placeholder="90000 00001"
                aria-invalid={!!phoneErr} aria-describedby="cl-phone-err" onChange={(e) => { setPhone(e.target.value.replace(/[^\d ]/g, "")); setPhoneErr(null); }} />
            </div>
            {phoneErr && <p id="cl-phone-err" role="alert" className={s.err}>{phoneErr}</p>}
            <button type="submit" className={s.primary} disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
          </form>
        )}

        {step === "otp" && (
          <div className={s.col}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span className={s.label}>Enter the 6-digit code</span>
              <span style={{ fontSize: "0.875rem" }}>Sent to +91 {digitsOnly.slice(0, 5)} {digitsOnly.slice(5)} · <button type="button" className={s.link} onClick={() => setStep("phone")}>Change</button></span>
            </div>
            {devCode && <p role="status" className={s.demo}>Demo OTP: <strong>{devCode}</strong></p>}
            <div role="group" aria-label="One-time code" className={s.boxes} onPaste={onPaste}>
              {digits.map((v, i) => (
                <input key={i} ref={(el) => (boxes.current[i] = el)} type="text" inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={6} value={v}
                  disabled={locked} aria-label={`Digit ${i + 1} of 6`} aria-invalid={!!otpErr && !locked} onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    if (val.length > 1) { const nd = [...digits]; val.slice(0, 6).split("").forEach((c, k) => { if (i + k < 6) nd[i + k] = c; }); setD(nd, Math.min(5, i + val.length)); return; }
                    const nd = [...digits]; nd[i] = val; setD(nd, val ? i + 1 : null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !digits[i] && i > 0) { e.preventDefault(); const nd = [...digits]; nd[i - 1] = ""; setD(nd, i - 1); }
                    else if (e.key === "ArrowLeft") { e.preventDefault(); focusBox(i - 1); }
                    else if (e.key === "ArrowRight") { e.preventDefault(); focusBox(i + 1); }
                    else if (e.key === "Enter") verify();
                  }} />
              ))}
            </div>
            {(otpErr || locked) && <p role="alert" className={s.err}>{locked ? `Too many wrong tries. Try again in ${lockLeft}s.` : otpErr}</p>}
            <button type="button" className={s.primary} onClick={() => verify()} disabled={locked || busy || digits.join("").length !== 6}>
              {locked ? `Locked · ${lockLeft}s` : busy ? "Checking…" : "Verify & sign in"}
            </button>
            <div className={s.resend}>
              {resendLeft > 0 ? <span>Resend in {resendLeft}s</span> : !locked && <button type="button" className={s.link} style={{ minHeight: "2.75rem", padding: "0 0.75rem" }} onClick={() => sendCode()}>Resend code</button>}
            </div>
          </div>
        )}

        {step === "resume" && current && (
          <div className={s.col} style={{ gap: "0.75rem" }}>
            <span className={s.label}>You're signed in as {current.user.name}</span>
            <button type="button" className={s.primary} onClick={() => go(current.user.roles, current.role)}>Continue to console</button>
            <button type="button" className={s.secondary} onClick={() => { session.set(null); setStep("phone"); }}>Use a different number</button>
          </div>
        )}

        {step === "choose" && current && (
          <div className={s.col} style={{ gap: "0.75rem" }}>
            <span className={s.label}>Hi {firstName}, choose a panel</span>
            {panelsFor(current.user.roles).map((p) => (
              <button key={p.path} type="button" className={s.panelBtn} onClick={() => { session.setRole(p.role); nav(p.path, { replace: true }); }}>
                <span aria-hidden="true" className={s.dot} style={{ background: p.color }} />
                <span style={{ flex: 1 }}>{p.label} panel</span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        )}

        <p className={s.foot}>Sessions last 12 hours. Customer phone numbers stay masked inside the console.</p>
      </div>
    </div>
  );
}
