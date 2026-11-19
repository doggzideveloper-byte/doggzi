// Site config — mirrors apps/web/src/content + env. Replace placeholders before launch.
export const SITE = {
  company: 'Doggzi Private Limited',
  city: 'Gurgaon, Haryana',
  serviceArea: 'Serving dogs & cats across Delhi NCR',
  whatsapp: '910000000000',          // PLACEHOLDER — digits only, used for wa.me link
  email: 'hello@example.com',        // PLACEHOLDER
  phone: '+91 00000 00000',          // PLACEHOLDER
  fssai: '',                         // shown only once issued
  // App stores (Fresh Food is ordered in the app)
  appStoreUrl: 'https://apps.apple.com/in/app/doggzi/id6757533673',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.doggzi.doggzi&hl=en_IN&referrer=utm_source%3Dweb%26utm_medium%3Dfresh_food',
  appRedirectPath: '/app',           // UA-sniffing redirect (nginx/gateway); QR codes point here
  // Official Apple / Google badge artwork, unmodified (self-hosted copies).
  appStoreBadge: 'brand/badges/app-store-badge.svg',
  playStoreBadge: 'brand/badges/google-play-badge.svg',
  social: {
    instagram: 'https://instagram.com/',
    youtube: 'https://youtube.com/',
    linkedin: 'https://linkedin.com/',
  },
};

export function track(event, data) {
  (window.dataLayer = window.dataLayer || []).push({ event, ...data });
}

export function detectDevice() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  return 'Desktop';
}
