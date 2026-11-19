// Site config. Contact details come from env (VITE_*) so they are never hard-coded in a component.
// Replace the placeholders before launch.
const env = import.meta.env;

export const SITE = {
  company: "Doggzi Private Limited",
  city: "Gurgaon, Haryana",
  serviceArea: "Serving dogs & cats across Delhi NCR",
  /** digits only, used for wa.me links. PLACEHOLDER until VITE_WHATSAPP is set. */
  whatsapp: (env.VITE_WHATSAPP as string) || "910000000000",
  email: (env.VITE_SUPPORT_EMAIL as string) || "hello@example.com",
  phone: (env.VITE_SUPPORT_PHONE as string) || "+91 00000 00000",
  /** Shown only once issued. */
  fssai: (env.VITE_FSSAI as string) || "",
  // App stores (Fresh Food is ordered in the app)
  appStoreUrl: "https://apps.apple.com/in/app/doggzi/id6757533673",
  playStoreUrl: "https://play.google.com/store/apps/details?id=com.doggzi.doggzi&hl=en_IN&referrer=utm_source%3Dweb%26utm_medium%3Dfresh_food",
  /** UA-sniffing redirect (nginx gateway). QR codes point here. */
  appRedirectPath: "/app",
  // Official Apple / Google badge artwork, unmodified (self-hosted copies). Swap for files from Apple/Google directly.
  appStoreBadge: "/brand/badges/app-store-badge.svg",
  playStoreBadge: "/brand/badges/google-play-badge.svg",
  social: {
    instagram: "https://instagram.com/",
    youtube: "https://youtube.com/",
    linkedin: "https://linkedin.com/",
  },
} as const;

export const waLink = (text?: string, number: string = SITE.whatsapp) =>
  `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
