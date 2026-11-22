const IST = "Asia/Kolkata";
const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
/** ₹ with Indian grouping (₹1,23,456). Amounts are paise. */
export const inr = (paise: number) => inrFmt.format(Math.round(paise / 100));
export const istTime = (d: string | Date) => new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit" }).format(new Date(d));
export const istDate = (d: string | Date) => new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short" }).format(new Date(d));
export const istYmd = (d: Date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
export const istDayLabel = (d: string | Date) => {
  const ymd = istYmd(new Date(d));
  const today = istYmd();
  const y = istYmd(new Date(Date.now() - 864e5));
  return ymd === today ? "Today" : ymd === y ? "Yesterday" : new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short" }).format(new Date(d));
};
export const prettyPhone = (p: string) => {
  const d = p.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : p;
};
/** Two short rising beeps for a new offer (respects the mute toggle). */
export function beep(muted: boolean) {
  if (muted) return;
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const w = window as unknown as { __dzAudio?: AudioContext };
    const ctx = w.__dzAudio || (w.__dzAudio = new C());
    [0, 0.16].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = i ? 880 : 660;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.14);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.16);
    });
  } catch {
    /* no audio */
  }
}
