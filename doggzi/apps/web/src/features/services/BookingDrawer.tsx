import { useEffect, useRef, useState, type PointerEvent } from "react";
import { css } from "@/design-system/motion";
import { PRICE_NOTE, SERVICEABLE_PINCODES } from "@/content/services";
import { track } from "@/lib/analytics";
import { ApiError, isUnreachable } from "@/lib/api/client";
import { auth } from "@/lib/api/auth";
import { booking, type Address } from "@/lib/api/booking";
import { petProfile } from "@/lib/api/petProfile";
import { inrPaise, istDate, istYmd, possessive } from "@/lib/format";
import { passportStore, type Passport } from "@/lib/passport";
import { isReduced } from "@/lib/reducedMotion";
import { addressesStore, sessionStore, useSession } from "@/lib/session";
import { createStore } from "@/lib/store";
import { useSlots, type Item } from "./data";
import s from "./sv.module.css";

const STEPS = ["cart", "slot", "address", "verify", "review", "done"] as const;
type Step = (typeof STEPS)[number];
const TITLES: Record<Step, string> = { cart: "Your cart", slot: "Pick a slot", address: "Where should we come?", verify: "Verify your phone", review: "Review & request", done: "Requested!" };
const demoBookings = createStore<unknown[]>("dz.bookings.demo", []);

const cityFor = (pin: string) => (pin.startsWith("122") ? "Gurgaon" : pin.startsWith("201") ? "Noida" : pin.startsWith("110") ? "Delhi" : "Delhi NCR");
const addrText = (a: Address) => [a.line1, a.line2, a.landmark && `Near ${a.landmark}`, a.pincode].filter(Boolean).join(", ");
const jwtLive = (t: string) => {
  try {
    return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000 > Date.now() + 60_000;
  } catch {
    return false;
  }
};

interface Props {
  narrow: boolean;
  items: Item[];
  pet: Passport;
  isDemo: boolean;
  offline: boolean;
  onRemove: (slug: string) => void;
  onBooked: () => void;
  onClose: () => void;
}

/** Cart → slot → address → OTP → review → BOOKED. Side drawer on desktop, bottom sheet on mobile. */
export function BookingDrawer({ narrow, items, pet, isDemo, offline, onRemove, onBooked, onClose }: Props) {
  const session = useSession();
  const loggedIn = !!session && jwtLive(session.token);
  const local = offline || isDemo; // no backend calls: the prototype's demo flow
  const [step, setStep] = useState<Step>("cart");
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ id: string; time: string; label: string } | null>(null);
  const [addrs, setAddrs] = useState<Address[]>(() => addressesStore.get());
  const [addr, setAddr] = useState<Address | null>(null);
  const [af, setAf] = useState({ line1: "", area: "", pin: "", landmark: "" });
  const [afErr, setAfErr] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [otp, setOtp] = useState("");
  const [otpErr, setOtpErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reqErr, setReqErr] = useState<string | null>(null);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const totalEl = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const totRaf = useRef(0);
  const stamp = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ slug: string; x: number; el: HTMLElement } | null>(null);
  const slots = useSlots(date, local);

  const total = items.reduce((t, i) => t + (i.price_paise || 0), 0);
  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() + i * 86400000);
    return { k: istYmd(d), wd: i === 0 ? "Today" : istDate(d, { weekday: "short" }), day: istDate(d, { day: "numeric" }), mon: istDate(d, { month: "short" }) };
  });

  // Enter: panel slides in (side or bottom), focus the close button.
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("[data-close]")?.focus({ preventScroll: true });
    if (isReduced()) return;
    panel.current?.animate([{ transform: narrow ? "translateY(100%)" : "translateX(100%)" }, { transform: "none" }], { duration: 450, easing: css.easeOut });
    backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: css.easeOut });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => {
    const p = panel.current;
    if (!p || isReduced()) return onClose();
    p.animate([{ transform: "none" }, { transform: narrow ? "translateY(100%)" : "translateX(100%)" }], { duration: 300, easing: css.easeOut, fill: "forwards" }).onfinish = onClose;
  };

  // Running total counts up (en-IN).
  useEffect(() => {
    const el = totalEl.current;
    if (!el) return void (shown.current = null);
    const to = total;
    if (shown.current == null || isReduced()) {
      shown.current = to;
      el.textContent = inrPaise(to);
      return;
    }
    const from = shown.current, t0 = performance.now();
    cancelAnimationFrame(totRaf.current);
    const stepFn = (now: number) => {
      const t = Math.min(1, (now - t0) / 600), e = 1 - Math.pow(1 - t, 3), v = Math.round(from + (to - from) * e);
      el.textContent = inrPaise(v);
      shown.current = v;
      if (t < 1) totRaf.current = requestAnimationFrame(stepFn);
    };
    totRaf.current = requestAnimationFrame(stepFn);
    return () => cancelAnimationFrame(totRaf.current);
  }, [total, step]);

  useEffect(() => {
    if (step === "done" && stamp.current && !isReduced())
      stamp.current.animate([{ transform: "scale(1.6) rotate(-16deg)", opacity: 0 }, { transform: "scale(1) rotate(-6deg)", opacity: 1 }], { duration: 480, easing: css.bouncy });
  }, [step]);

  const next = () => {
    const i = STEPS.indexOf(step);
    let nx = STEPS[i + 1];
    if (nx === "verify" && (loggedIn || local && !!sessionStore.get())) nx = "review";
    setStep(nx);
  };
  const back = () => {
    const i = STEPS.indexOf(step);
    let pv = STEPS[i - 1];
    if (pv === "verify" && (loggedIn || local && !!sessionStore.get())) pv = "address";
    if (pv) setStep(pv);
  };

  const saveAddr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!af.line1.trim() || !af.area.trim()) return setAfErr("Add your house/flat and area.");
    if (!/^\d{6}$/.test(af.pin)) return setAfErr("Enter a 6-digit pincode.");
    if (!SERVICEABLE_PINCODES.includes(af.pin)) return setAfErr("We don’t come to this pincode yet. Ask us on WhatsApp.");
    const a: Address = { line1: af.line1.trim(), line2: af.area.trim(), landmark: af.landmark.trim() || undefined, city: cityFor(af.pin), pincode: af.pin };
    const list = [...addrs, a];
    addressesStore.set(list);
    setAddrs(list);
    setAddr(a);
    setAf({ line1: "", area: "", pin: "", landmark: "" });
  };

  const digits = phone.replace(/\D/g, "");
  const sendOtp = async () => {
    setOtpErr(null);
    if (local) {
      setDevCode(String(Math.floor(100000 + Math.random() * 900000)));
      setOtpSent(true);
      setOtp("");
      return;
    }
    setBusy(true);
    try {
      const r = await auth.requestOtp(`+91${digits}`);
      setDevCode(r.dev_code || "");
      setOtpSent(true);
      setOtp("");
    } catch (e) {
      setOtpErr(e instanceof ApiError && e.status === 429 ? "Too many codes. Wait a minute and try again." : e instanceof Error ? e.message : "Couldn't send the code.");
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setOtpErr(null);
    if (local) {
      if (otp !== devCode) return setOtpErr("That code doesn’t match. Try again.");
      sessionStore.set({ token: "demo", user: { id: crypto.randomUUID?.() || String(Date.now()), phone: `+91${digits}`, role: "USER" } });
      return setStep("review");
    }
    setBusy(true);
    try {
      const r = await auth.verifyOtp(`+91${digits}`, otp);
      sessionStore.set({ token: r.access_token, user: r.user });
      // The guest passport is claimed by the new user.
      const g = passportStore.get()?.guest_token;
      if (g) await petProfile.claim(r.access_token, g).catch(() => undefined);
      setStep("review");
    } catch (e) {
      setOtpErr(e instanceof ApiError && e.status === 400 ? "That code doesn’t match. Try again." : e instanceof Error ? e.message : "Couldn't verify.");
    } finally {
      setBusy(false);
    }
  };

  /** Make sure the pet exists server-side (a passport made offline has no id yet). */
  const ensurePetId = async (): Promise<string> => {
    const cur = passportStore.get();
    if (cur?.pet_id) return cur.pet_id;
    const r = await petProfile.createGuest({ name: pet.name, type: pet.type, breed_id: cur?.breed_id || null });
    passportStore.set((p) => (p ? { ...p, pet_id: r.pet.id, guest_token: r.guest_token } : p));
    const sess = sessionStore.get();
    if (sess) await petProfile.claim(sess.token, r.guest_token).catch(() => undefined);
    return r.pet.id;
  };

  const request = async () => {
    setReqErr(null);
    if (local) {
      demoBookings.set((l) => [...l, { id: crypto.randomUUID?.() || String(Date.now()), pet: pet.name, items: items.map((i) => i.slug), slot, address: addr, status: "requested", total_paise_client: total, created_at: new Date().toISOString() }]);
      track("booking_requested", { items: items.length, demo: true });
      onBooked();
      return setStep("done");
    }
    setBusy(true);
    try {
      const petId = await ensurePetId();
      const b = await booking.create(sessionStore.get()!.token, { pet_id: petId, slot_id: slot!.id, item_slugs: items.map((i) => i.slug), address: addr!, client_total_paise: total });
      setServerTotal(b.total_paise);
      track("booking_requested", { items: items.length, booking_id: b.id });
      onBooked();
      setStep("done");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        sessionStore.set(null);
        setStep("verify");
        setOtpErr("Your login expired. Verify your phone again.");
      } else if (e instanceof ApiError && e.status === 409) {
        setReqErr("That slot just filled up. Pick another time.");
        setSlot(null);
        setStep("slot");
      } else setReqErr(isUnreachable(e) ? "We couldn't reach Doggzi. Try again in a moment." : e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const ix = STEPS.indexOf(step);
  const primary: { label: string; dis: boolean; fn: () => void } = {
    cart: { label: "Choose a slot →", dis: !items.length, fn: next },
    slot: { label: "Continue →", dis: !(date && slot), fn: next },
    address: { label: "Continue →", dis: !addr, fn: next },
    verify: otpSent ? { label: busy ? "Checking…" : "Verify →", dis: otp.length !== 6 || busy, fn: verify } : { label: busy ? "Sending…" : "Send code", dis: !/^[6-9]\d{9}$/.test(digits) || busy, fn: sendOtp },
    review: { label: busy ? "Requesting…" : "Request booking", dis: busy, fn: request },
    done: { label: "Done", dis: false, fn: close },
  }[step];
  const selDate = dates.find((d) => d.k === date);

  const onDown = (slug: string) => (e: PointerEvent<HTMLLIElement>) => (swipe.current = { slug, x: e.clientX, el: e.currentTarget });
  const onMove = (slug: string) => (e: PointerEvent<HTMLLIElement>) => {
    const sw = swipe.current;
    if (!sw || sw.slug !== slug) return;
    const dx = Math.min(0, e.clientX - sw.x);
    sw.el.style.transform = `translateX(${dx}px)`;
    sw.el.style.opacity = String(1 + dx / 240);
  };
  const onUp = (slug: string) => (e: PointerEvent<HTMLLIElement>) => {
    const sw = swipe.current;
    if (!sw || sw.slug !== slug) return;
    swipe.current = null;
    sw.el.style.transform = "";
    sw.el.style.opacity = "";
    if (e.clientX - sw.x < -90) onRemove(slug);
  };

  return (
    <div className={s.drawerRoot}>
      <div ref={backdrop} className={s.backdrop} onClick={close} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="bk-title" className={`${s.panel} ${narrow ? s.sheet : ""}`}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); close(); }
          else if (e.key === "Tab") {
            const f = [...panel.current!.querySelectorAll<HTMLElement>("button:not(:disabled), input, a[href]")];
            const i = f.indexOf(document.activeElement as HTMLElement);
            if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]?.focus(); }
            else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]?.focus(); }
          }
        }}>
        <div className={s.pHead}>
          {ix > 0 && step !== "done" && <button type="button" className={s.round} onClick={back} aria-label="Back">←</button>}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.125rem" }}>
            <span className={s.kicker} style={{ fontSize: "0.75rem" }}>{step === "done" ? "Booking" : `Step ${Math.min(ix + 1, 5)} of 5`}</span>
            <h2 id="bk-title" className={s.pTitle}>{TITLES[step]}</h2>
          </div>
          <button type="button" data-close="" className={s.round} style={{ fontSize: "1.5rem", fontWeight: 500 }} onClick={close} aria-label="Close booking">×</button>
        </div>
        <div className={s.progress} aria-hidden="true">{[0, 1, 2, 3, 4].map((k) => <span key={k} data-on={k <= ix} />)}</div>

        <div className={s.body}>
          {local && step !== "done" && <p className={s.demo}>{isDemo ? "Demo pet: nothing is sent to Doggzi." : "Demo mode: the booking service isn't reachable, so this stays on this device."}</p>}
          {step === "cart" && (
            <>
              {!items.length && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.875rem", padding: "2rem 0.5rem", textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 600 }}>Nothing in the cart yet.</p>
                  <a href="#spa" onClick={close} style={{ fontWeight: 600 }}>Browse spa services</a>
                </div>
              )}
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                {items.map((i) => (
                  <li key={i.slug} className={s.cartItem} onPointerDown={onDown(i.slug)} onPointerMove={onMove(i.slug)} onPointerUp={onUp(i.slug)} onPointerCancel={onUp(i.slug)}>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.35 }}>{i.name}</span>
                    <span style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: "1.125rem", whiteSpace: "nowrap" }}>{inrPaise(i.price_paise || 0)}</span>
                    <button type="button" className={s.x} onClick={() => onRemove(i.slug)} aria-label={`Remove ${i.name}`}>×</button>
                  </li>
                ))}
              </ul>
              {items.length > 0 && <p className={s.hint}>Swipe an item left or tap × to remove.</p>}
            </>
          )}

          {step === "slot" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.125rem" }}>
              <div role="group" aria-label="Date" className={s.dates}>
                {dates.map((d) => (
                  <button key={d.k} type="button" className={s.date} aria-pressed={date === d.k} onClick={() => { setDate(d.k); setSlot(null); }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 500, textTransform: "uppercase" }}>{d.wd}</span>
                    <span style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: "1.5rem", lineHeight: 1 }}>{d.day}</span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>{d.mon}</span>
                  </button>
                ))}
              </div>
              {!date && <p className={s.hint} style={{ margin: 0 }}>Pick a date to see times.</p>}
              {date && slots.isLoading && <p className={s.hint} style={{ margin: 0 }}>Checking availability…</p>}
              {date && slots.isError && <p role="alert" className={s.err}>Couldn't load times. <button type="button" onClick={() => slots.refetch()} style={{ font: "inherit", textDecoration: "underline", background: "none", border: 0, cursor: "pointer", color: "inherit" }}>Try again</button></p>}
              {slots.data && (
                <div role="group" aria-label="Time" className={s.times}>
                  {slots.data.map((t) => (
                    <button key={t.id} type="button" className={s.time} disabled={!t.available} aria-pressed={slot?.id === t.id} onClick={() => setSlot(t)}>{t.label}</button>
                  ))}
                </div>
              )}
              {reqErr && <p role="alert" className={s.err}>{reqErr}</p>}
              <p className={s.hint} style={{ margin: 0 }}>Times in IST. Greyed-out slots are full.{local ? " Availability is a demo." : ""}</p>
            </div>
          )}

          {step === "address" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              {addrs.map((a, i) => (
                <button key={i} type="button" className={s.addr} aria-pressed={addr === a} onClick={() => setAddr(a)}>{addrText(a)}</button>
              ))}
              <form onSubmit={saveAddr} noValidate className={s.addrForm}>
                <span style={{ fontWeight: 600 }}>{addrs.length ? "Or add a new address" : "Add your address"}</span>
                <label className={s.fl}>House / flat<input className={s.in} value={af.line1} autoComplete="address-line1" onChange={(e) => { setAf({ ...af, line1: e.target.value }); setAfErr(null); }} /></label>
                <label className={s.fl}>Area / sector<input className={s.in} value={af.area} autoComplete="address-line2" onChange={(e) => { setAf({ ...af, area: e.target.value }); setAfErr(null); }} /></label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
                  <label className={s.fl}>Pincode<input className={s.in} value={af.pin} inputMode="numeric" maxLength={6} autoComplete="postal-code" aria-invalid={!!afErr && /pincode/i.test(afErr)} onChange={(e) => { setAf({ ...af, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }); setAfErr(null); }} /></label>
                  <label className={s.fl}>Landmark (optional)<input className={s.in} value={af.landmark} onChange={(e) => { setAf({ ...af, landmark: e.target.value }); setAfErr(null); }} /></label>
                </div>
                {afErr && <p role="alert" className={s.err}>{afErr}</p>}
                <button type="submit" className={s.primary} style={{ height: "3rem", fontSize: "0.9375rem", boxShadow: "none" }}>Use this address</button>
              </form>
            </div>
          )}

          {step === "verify" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.5 }}>We'll text a 6-digit code to confirm it's you. {possessive(pet.name)} passport is saved to your number.</p>
              <label className={s.fl}>Mobile number
                <span className={s.phone}><span aria-hidden="true" style={{ padding: "0 0.25rem 0 1rem", fontWeight: 600 }}>+91</span>
                  <input type="tel" inputMode="numeric" maxLength={11} value={phone} autoComplete="tel-national" placeholder="98765 43210" onChange={(e) => { setPhone(e.target.value.replace(/[^\d ]/g, "")); setOtpErr(null); setOtpSent(false); }} />
                </span>
              </label>
              {otpSent && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                  {devCode && <p role="status" className={s.dev}>Dev only: console OTP provider sent <strong style={{ fontFamily: "var(--font-accent)", letterSpacing: ".2em" }}>{devCode}</strong></p>}
                  <label className={s.fl}>6-digit code
                    <input className={s.otp} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setOtpErr(null); }} />
                  </label>
                </div>
              )}
              {otpErr && <p role="alert" className={s.err}>{otpErr}</p>}
            </div>
          )}

          {step === "review" && (
            <>
              <dl className={s.sum}>
                {[
                  ["Pet", `${pet.name} · ${pet.breed}`],
                  ["Services", items.map((i) => i.name).join(", ")],
                  ["Slot (IST)", selDate && slot ? `${selDate.wd} ${selDate.day} ${selDate.mon}, ${slot.label}` : "—"],
                  ["Address", addr ? addrText(addr) : "—"],
                  ["Phone", sessionStore.get()?.user.phone || "—"],
                ].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
              {reqErr && <p role="alert" className={s.err} style={{ marginTop: "0.75rem" }}>{reqErr}</p>}
              <p style={{ margin: "0.875rem 0 0", fontSize: "0.8125rem", lineHeight: 1.5, color: "var(--ink-75)" }}>No online payment. Payment is collected after the service (to be confirmed). {PRICE_NOTE}</p>
            </>
          )}

          {step === "done" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.125rem", padding: "1.75rem 0.5rem", textAlign: "center" }}>
              <div ref={stamp} className={s.booked}>Booked</div>
              <p style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>{possessive(pet.name)} spa day is requested.</p>
              {serverTotal != null && <p style={{ margin: 0, fontSize: "0.9375rem" }}>Total {inrPaise(serverTotal)}, payable after the service.</p>}
              <p style={{ margin: 0, fontSize: "0.9375rem" }}>We'll confirm on WhatsApp shortly.</p>
            </div>
          )}
        </div>

        <div className={s.foot}>
          {step !== "done" && step !== "verify" && (
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>Total</span>
              <span ref={totalEl} aria-live="polite" style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: "1.625rem", fontVariantNumeric: "tabular-nums" }} />
            </div>
          )}
          <button type="button" className={s.primary} disabled={primary.dis} style={{ background: step === "review" ? "var(--dz-green)" : undefined }} onClick={() => !primary.dis && primary.fn()}>{primary.label}</button>
        </div>
      </div>
    </div>
  );
}
