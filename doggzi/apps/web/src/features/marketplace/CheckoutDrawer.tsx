import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { DELIVERY_ESTIMATE } from "@/content/marketplace";
import { css } from "@/design-system/motion";
import { track } from "@/lib/analytics";
import { ApiError, isUnreachable } from "@/lib/api/client";
import { auth } from "@/lib/api/auth";
import { market, type MAddress, type MListing, type MOrder, type MVendor } from "@/lib/api/market";
import { inrPaise, possessive } from "@/lib/format";
import type { Passport } from "@/lib/passport";
import { isReduced } from "@/lib/reducedMotion";
import { addressesStore, sessionStore, useSession } from "@/lib/session";
import { cartId, demoOrders, distanceKm, type CartLine } from "./data";
import s from "./mk.module.css";

const STEPS = ["cart", "address", "verify", "pay", "done"] as const;
type Step = (typeof STEPS)[number];
const TITLES: Record<Step, string> = { cart: "Your cart", address: "Deliver to", verify: "Verify your phone", pay: "Review & pay", done: "Order placed" };
export const TRACK = ["Placed", "Accepted", "Packed", "Out for delivery", "Delivered"];
const TRACK_STATUS = ["placed", "accepted", "packed", "out_for_delivery", "delivered"];

const cityFor = (pin: string) => (pin.startsWith("122") ? "Gurgaon" : pin.startsWith("201") ? "Noida" : pin.startsWith("110") ? "Delhi" : "Delhi NCR");
const addrText = (a: MAddress) => [a.line1, a.line2, a.pincode].filter(Boolean).join(", ");
const jwtLive = (t: string) => {
  try { return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000 > Date.now() + 60_000; } catch { return false; }
};

interface Group { vendor: MVendor; lines: { item: MListing; qty: number }[]; sub: number; fee: number }
interface Props {
  narrow: boolean;
  lines: CartLine[];
  byId: Map<string, MListing>;
  pet: Passport;
  isDemo: boolean;
  offline: boolean;
  setQty: (id: string, qty: number) => void;
  onPaid: () => void;
  onClose: () => void;
}

/** Cart grouped by store → address (serviceability per store) → OTP → pay (mock until Razorpay keys) → PACKED WITH LOVE. */
export function CheckoutDrawer({ narrow, lines, byId, pet, isDemo, offline, setQty, onPaid, onClose }: Props) {
  const session = useSession();
  const loggedIn = !!session && jwtLive(session.token);
  const local = offline || isDemo;
  const [step, setStep] = useState<Step>("cart");
  const [addrs, setAddrs] = useState<MAddress[]>(() => addressesStore.get().map((a) => ({ ...a, city: a.city || cityFor(a.pincode) })));
  const [addr, setAddr] = useState<MAddress | null>(null);
  const [af, setAf] = useState({ line1: "", area: "", pin: "" });
  const [afErr, setAfErr] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [otp, setOtp] = useState("");
  const [otpErr, setOtpErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [order, setOrder] = useState<MOrder | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const totalEl = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const stamp = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ id: string; x: number; el: HTMLElement } | null>(null);

  const groups: Group[] = [];
  lines.forEach((l) => {
    const item = byId.get(l.listing_id);
    if (!item) return;
    let g = groups.find((x) => x.vendor.id === item.vendor.id);
    if (!g) groups.push((g = { vendor: item.vendor, lines: [], sub: 0, fee: item.vendor.delivery_fee_paise }));
    g.lines.push({ item, qty: l.qty });
    g.sub += item.price_paise * l.qty;
  });
  const total = groups.reduce((t, g) => t + g.sub + g.fee, 0);
  const count = lines.reduce((t, l) => t + l.qty, 0);
  const blocked = addr ? groups.filter((g) => !g.vendor.serviceable_pincodes.includes(addr.pincode)) : [];

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

  // Grand total counts up (en-IN).
  useEffect(() => {
    const el = totalEl.current;
    if (!el) return void (shown.current = null);
    if (shown.current == null || isReduced()) {
      shown.current = total;
      el.textContent = inrPaise(total);
      return;
    }
    const from = shown.current, t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / 600), v = Math.round(from + (total - from) * (1 - Math.pow(1 - t, 3)));
      el.textContent = inrPaise(v);
      shown.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total, step]);

  useEffect(() => {
    if (step === "done" && stamp.current && !isReduced())
      stamp.current.animate([{ transform: "scale(1.7) rotate(-18deg)", opacity: 0 }, { transform: "scale(1) rotate(-6deg)", opacity: 1 }], { duration: 480, easing: css.bouncy });
  }, [step]);

  const skipVerify = loggedIn || (local && !!sessionStore.get());
  const next = () => {
    let nx = STEPS[STEPS.indexOf(step) + 1];
    if (nx === "verify" && skipVerify) nx = "pay";
    setStep(nx);
  };
  const back = () => {
    let pv = STEPS[STEPS.indexOf(step) - 1];
    if (pv === "verify" && skipVerify) pv = "address";
    if (pv) setStep(pv);
  };

  const saveAddr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!af.line1.trim() || !af.area.trim()) return setAfErr("Add your house/flat and area.");
    if (!/^\d{6}$/.test(af.pin)) return setAfErr("Enter a 6-digit pincode.");
    const a: MAddress = { line1: af.line1.trim(), line2: af.area.trim(), city: cityFor(af.pin), pincode: af.pin };
    const list = [...addrs, a];
    addressesStore.set(list);
    setAddrs(list);
    setAddr(a);
    setAf({ line1: "", area: "", pin: "" });
  };

  const digits = phone.replace(/\D/g, "");
  const sendOtp = async () => {
    setOtpErr(null);
    if (local) {
      setDevCode(String(Math.floor(100000 + Math.random() * 900000)));
      setOtpSent(true);
      return setOtp("");
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
      return setStep("pay");
    }
    setBusy(true);
    try {
      const r = await auth.verifyOtp(`+91${digits}`, otp);
      sessionStore.set({ token: r.access_token, user: r.user });
      setStep("pay");
    } catch (e) {
      setOtpErr(e instanceof ApiError && e.status === 400 ? "That code doesn’t match. Try again." : e instanceof Error ? e.message : "Couldn't verify.");
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    setPayErr(null);
    setBusy(true);
    if (local) {
      await new Promise((r) => setTimeout(r, isReduced() ? 0 : 900));
      const id = crypto.randomUUID?.() || String(Date.now());
      const o: MOrder = {
        id, status: "paid", total_paise: total, address: addr as unknown as Record<string, string>, created_at: new Date().toISOString(), lines: [],
        sub_orders: groups.map((g) => ({ id: `${id}-${g.vendor.id}`, vendor: g.vendor, subtotal_paise: g.sub, delivery_fee_paise: g.fee, status: "placed", sla_due_at: null, items: g.lines.map((l) => ({ sku: l.item.sku, name: l.item.name, qty: l.qty, price_paise_at_order: l.item.price_paise })) })),
      };
      demoOrders.set((l) => [...l, o]);
      track("market_order_paid", { stores: groups.length, demo: true });
      setOrder(o);
      setBusy(false);
      onPaid();
      return setStep("done");
    }
    try {
      const token = sessionStore.get()!.token;
      const created = await market.createOrder(token, { address: addr!, lines: lines.map((l) => ({ listing_id: l.listing_id, qty: l.qty })), client_total_paise: total });
      // Mock mode: confirm the payment ourselves. With Razorpay keys this becomes Checkout + webhook.
      const paid = created.payment.mode === "mock" ? await market.payMock(token, created.order.id, cartId()) : created.order;
      track("market_order_paid", { stores: paid.sub_orders.length, order_id: paid.id });
      setOrder(paid);
      onPaid();
      setStep("done");
    } catch (e) {
      const d = e instanceof ApiError ? (e.detail as { code?: string; message?: string }) : null;
      if (e instanceof ApiError && e.status === 401) {
        sessionStore.set(null);
        setStep("verify");
        setOtpErr("Your login expired. Verify your phone again.");
      } else if (d?.code === "not_serviceable") {
        setStep("address");
        setPayErr(d.message || "A store can't deliver there.");
      } else if (d?.code === "out_of_stock") setPayErr(`${d.message}. Update your cart and try again.`);
      else setPayErr(isUnreachable(e) ? "We couldn't reach Doggzi. Try again in a moment." : (d?.message || (e instanceof Error ? e.message : "Something went wrong.")));
    } finally {
      setBusy(false);
    }
  };

  const ix = STEPS.indexOf(step);
  const primary = {
    cart: { label: "Checkout →", dis: !count, fn: next },
    address: { label: "Continue →", dis: !addr || blocked.length > 0 || !count, fn: next },
    verify: otpSent ? { label: busy ? "Checking…" : "Verify →", dis: otp.length !== 6 || busy, fn: verify } : { label: busy ? "Sending…" : "Send code", dis: !/^[6-9]\d{9}$/.test(digits) || busy, fn: sendOtp },
    pay: { label: busy ? "Confirming payment…" : `Pay ${inrPaise(total)} (test mode)`, dis: busy || !count, fn: pay },
    done: { label: "Keep shopping", dis: false, fn: close },
  }[step];

  const onDown = (id: string) => (e: PointerEvent<HTMLLIElement>) => { if (!(e.target as Element).closest("button")) swipe.current = { id, x: e.clientX, el: e.currentTarget }; };
  const onMove = (id: string) => (e: PointerEvent<HTMLLIElement>) => {
    const sw = swipe.current;
    if (!sw || sw.id !== id) return;
    const dx = Math.min(0, e.clientX - sw.x);
    sw.el.style.transform = `translateX(${dx}px)`;
    sw.el.style.opacity = String(1 + dx / 240);
  };
  const onUp = (id: string) => (e: PointerEvent<HTMLLIElement>) => {
    const sw = swipe.current;
    if (!sw || sw.id !== id) return;
    swipe.current = null;
    sw.el.style.transform = "";
    sw.el.style.opacity = "";
    if (e.clientX - sw.x < -90) setQty(id, 0);
  };

  return (
    <div className={`${s.drawerRoot} ${narrow ? s.narrow : ""}`}>
      <div ref={backdrop} className={s.backdrop} onClick={close} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="ck-title" className={s.panel}
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
          {ix > 0 && step !== "done" && !busy && <button type="button" className={s.round} style={{ fontSize: 18, fontWeight: 600 }} onClick={back} aria-label="Back">←</button>}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span className={s.kicker}>{step === "done" ? "Thank you" : `Step ${ix + 1} of 4`}</span>
            <h2 id="ck-title" className={s.pTitle}>{TITLES[step]}</h2>
          </div>
          <button type="button" data-close="" className={s.round} onClick={close} aria-label="Close cart">×</button>
        </div>
        <div className={s.progress} aria-hidden="true">{[0, 1, 2, 3].map((k) => <span key={k} data-on={k <= ix} />)}</div>

        <div className={s.body}>
          {local && step !== "done" && <p className={s.demo}>{isDemo ? "Demo pet: nothing is sent to Doggzi." : "Demo mode: the marketplace service isn't reachable, so this stays on this device."}</p>}

          {step === "cart" && (
            <>
              {!count && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "32px 8px", textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Your cart is empty.</p>
                  <a href="#shop" onClick={close} style={{ fontWeight: 600 }}>Start shopping</a>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {groups.map((g) => {
                  const d = distanceKm(g.vendor);
                  return (
                    <div key={g.vendor.id} className={s.group}>
                      <div className={s.groupHead}>
                        <span style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: 16, letterSpacing: ".06em", textTransform: "uppercase" }}>{g.vendor.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{d != null ? `${d} km away` : g.vendor.area}</span>
                      </div>
                      <ul style={{ margin: 0, padding: 10, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                        {g.lines.map(({ item, qty }) => (
                          <li key={item.id} className={s.line} onPointerDown={onDown(item.id)} onPointerMove={onMove(item.id)} onPointerUp={onUp(item.id)} onPointerCancel={onUp(item.id)}>
                            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                              <span className={s.cardName} style={{ minHeight: 0 }}>{item.name}</span>
                              <span style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: 16 }}>{inrPaise(item.price_paise * qty)}</span>
                            </span>
                            <span role="group" aria-label={`Quantity of ${item.name}`} className={`${s.stepper} ${s.stepperSm}`}>
                              <button type="button" aria-label={qty === 1 ? `Remove ${item.name}` : `One less ${item.name}`} onClick={() => setQty(item.id, qty - 1)}>−</button>
                              <span style={{ minWidth: 20, textAlign: "center", fontWeight: 700 }}>{qty}</span>
                              <button type="button" aria-label={`One more ${item.name}`} disabled={qty >= Math.min(10, item.available_qty)} onClick={() => setQty(item.id, qty + 1)}>+</button>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className={s.sums}>
                        <span><span>Subtotal</span><strong style={{ fontWeight: 600 }}>{inrPaise(g.sub)}</strong></span>
                        <span><span>Delivery</span><strong style={{ fontWeight: 600 }}>{g.fee ? inrPaise(g.fee) : "Free"}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {count > 0 && <p style={{ margin: "12px 0 0", fontSize: 13, color: "rgba(20,18,16,.7)" }}>Swipe an item left to remove it. Delivery fee: draft, set per store.</p>}
            </>
          )}

          {step === "address" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {addrs.map((a, i) => <button key={i} type="button" className={s.addr} aria-pressed={addr === a} onClick={() => { setAddr(a); setPayErr(null); }}>{addrText(a)}</button>)}
              {blocked.map((g) => (
                <div key={g.vendor.id} role="alert" className={s.blocked}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{g.vendor.name} can't deliver to {addr!.pincode} yet.</p>
                  <button type="button" className={s.fchip} style={{ alignSelf: "flex-start", height: 44, background: "var(--dz-paper)" }} onClick={() => g.lines.forEach((l) => setQty(l.item.id, 0))}>Remove its items</button>
                </div>
              ))}
              {payErr && <p role="alert" className={s.err}>{payErr}</p>}
              <form onSubmit={saveAddr} noValidate className={s.form}>
                <span style={{ fontWeight: 600 }}>{addrs.length ? "Or add a new address" : "Add your address"}</span>
                <label className={s.fl}>House / flat<input className={s.in} value={af.line1} autoComplete="address-line1" onChange={(e) => { setAf({ ...af, line1: e.target.value }); setAfErr(null); }} /></label>
                <label className={s.fl}>Area / sector<input className={s.in} value={af.area} autoComplete="address-line2" onChange={(e) => { setAf({ ...af, area: e.target.value }); setAfErr(null); }} /></label>
                <label className={s.fl}>Pincode<input className={s.in} value={af.pin} inputMode="numeric" maxLength={6} autoComplete="postal-code" onChange={(e) => { setAf({ ...af, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }); setAfErr(null); }} /></label>
                {afErr && <p role="alert" className={s.err}>{afErr}</p>}
                <button type="submit" className={s.primary} style={{ height: 48, fontSize: 15, boxShadow: "none" }}>Use this address</button>
              </form>
            </div>
          )}

          {step === "verify" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>We'll text a 6-digit code to confirm it's you.</p>
              <label className={s.fl}>Mobile number
                <span className={s.phone}><span aria-hidden="true" style={{ padding: "0 4px 0 16px", fontWeight: 600 }}>+91</span>
                  <input type="tel" inputMode="numeric" maxLength={11} value={phone} autoComplete="tel-national" placeholder="98765 43210" onChange={(e) => { setPhone(e.target.value.replace(/[^\d ]/g, "")); setOtpErr(null); setOtpSent(false); }} />
                </span>
              </label>
              {otpSent && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {devCode && <p role="status" className={s.note}>Dev only: console OTP provider sent <strong style={{ fontFamily: "var(--font-accent)", letterSpacing: ".2em" }}>{devCode}</strong></p>}
                  <label className={s.fl}>6-digit code<input className={s.otp} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setOtpErr(null); }} /></label>
                </div>
              )}
              {otpErr && <p role="alert" className={s.err}>{otpErr}</p>}
            </div>
          )}

          {step === "pay" && (
            <>
              <dl className={s.sum}>
                {[
                  ["Items", `${count} item${count === 1 ? "" : "s"} from ${groups.map((g) => g.vendor.name).join(", ")}`],
                  ["Deliver to", addr ? addrText(addr) : "—"],
                  ["Phone", sessionStore.get()?.user.phone || "—"],
                  ["Estimate", DELIVERY_ESTIMATE],
                ].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
              {busy && <p role="status" className={s.note} style={{ marginTop: 14, fontSize: 14, fontWeight: 600 }}>Payment (test mode): confirming…</p>}
              {payErr && <p role="alert" className={s.err} style={{ marginTop: 12 }}>{payErr}</p>}
              <p style={{ margin: "14px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--ink-75)" }}>Test mode: no real payment is taken. The total is recomputed on the server and stock is reserved before payment. Razorpay will replace this step.</p>
            </>
          )}

          {step === "done" && order && (
            <>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "20px 4px", textAlign: "center" }}>
                <div ref={stamp} className={s.stamp}>Packed with love</div>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{possessive(pet.name)} order is with the store.</p>
                <p style={{ margin: 0, fontSize: 15 }}>Total {inrPaise(order.total_paise)}</p>
                {!local && <Link to={`/orders/${order.id}`} onClick={onClose} style={{ fontWeight: 600 }}>Track this order →</Link>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {order.sub_orders.map((so) => <OrderTrack key={so.id} store={so.vendor.name} reference={order.id.slice(0, 6).toUpperCase()} status={so.status} />)}
              </div>
            </>
          )}
        </div>

        <div className={s.foot}>
          {step !== "done" && step !== "verify" && (
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Total</span>
              <span ref={totalEl} aria-live="polite" style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: 26, fontVariantNumeric: "tabular-nums" }} />
            </div>
          )}
          <button type="button" className={s.primary} disabled={primary.dis} style={{ background: step === "pay" ? "var(--dz-pink)" : undefined }} onClick={() => !primary.dis && primary.fn()}>{primary.label}</button>
        </div>
      </div>
    </div>
  );
}

/** Per-store timeline (Placed → Delivered) with the line-art van easing in. Reused by /orders/:id. */
export function OrderTrack({ store, reference, status }: { store: string; reference: string; status: string }) {
  const van = useRef<SVGSVGElement>(null);
  const at = Math.max(0, TRACK_STATUS.indexOf(status));
  useEffect(() => {
    if (van.current && !isReduced()) van.current.animate([{ transform: "translateX(-30px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 900, delay: 400, easing: css.easeOut, fill: "backwards" });
  }, []);
  return (
    <div className={s.track}>
      <span style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: 15, letterSpacing: ".08em", textTransform: "uppercase" }}>{store} · order {reference}</span>
      <div style={{ position: "relative", height: 40, margin: "0 12px" }}>
        <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 30, height: 2.5, background: "var(--dz-ink)" }} />
        <svg ref={van} viewBox="0 0 72 46" aria-hidden="true" style={{ position: "absolute", left: `calc(${(at / 4) * 100}% - 14px)`, top: 0, width: 44, height: 28 }} fill="var(--dz-paper)" stroke="var(--dz-ink)" strokeWidth="2.4" strokeLinejoin="round">
          <path d="M2 8h44v28H2z" /><path d="M46 14h14l10 12v10H46z" fill="var(--dz-pink)" /><circle cx="16" cy="38" r="6" fill="var(--dz-ink)" /><circle cx="58" cy="38" r="6" fill="var(--dz-ink)" />
        </svg>
      </div>
      <ol className={s.trackSteps}>
        {TRACK.map((l, k) => <li key={l} aria-current={k === at ? "step" : undefined}><span aria-hidden="true" className={s.trackDot} data-on={k <= at} />{l}</li>)}
      </ol>
    </div>
  );
}
