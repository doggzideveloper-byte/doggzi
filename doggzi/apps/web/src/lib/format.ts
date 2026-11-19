const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
/** ₹1,23,456 — rupees in, Indian grouping out. */
export const inr = (rupees: number) => inrFmt.format(rupees);
/** Prices are stored in paise as integers. */
export const inrPaise = (paise: number) => inrFmt.format(Math.round(paise / 100));
export const possessive = (name: string) => name + (/s$/i.test(name) ? "'" : "'s");

const IST = "Asia/Kolkata";
export const istDate = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: IST, ...opts }).format(d);
/** YYYY-MM-DD for a Date, in IST. */
export const istYmd = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p;
};
