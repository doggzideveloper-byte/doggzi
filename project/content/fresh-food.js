// Fresh Food page config (features/fresh-food). Values marked DRAFT need sign-off.
export const FRESH_FOOD = {
  catsSupported: false,  // DECISION NEEDED — Play listing says dogs & cats; App Store + PDF say dogs.
  guidePdf: 'brand/downloads/doggzi-fresh-food-guide.pdf',
};

// From reference/fresh-food-vs-kibble.pdf
export const INGREDIENTS = {
  dog: [
    { key: 'chicken', label: 'Chicken breast & thighs' },
    { key: 'organ', label: 'Organ meats + nutritional yeast' },
    { key: 'veg', label: 'Fresh veggies' },
    { key: 'egg', label: 'Calcium from eggshell' },
    { key: 'oil', label: 'Vitamins A & D from cod liver oil' },
  ],
  // DRAFT — no cat recipe in the source material yet; confirm with the nutritionist.
  cat: [
    { key: 'chicken', label: 'Chicken breast & thighs' },
    { key: 'organ', label: 'Organ meats + nutritional yeast' },
    { key: 'egg', label: 'Calcium from eggshell' },
    { key: 'oil', label: 'Vitamins A & D from cod liver oil' },
  ],
};

// DRAFT ratios — Abhiyash + nutritionist must confirm before launch.
export const TRANSITION = [
  { days: 'Days 1–2', fresh: 25 },
  { days: 'Days 3–4', fresh: 50 },
  { days: 'Days 5–6', fresh: 75 },
  { days: 'Day 7+', fresh: 100 },
];

// Captions written from what each store screenshot shows.
export const APP_SCREENS = [
  { src: 'brand/app/screen-4.webp', title: 'Set up their profile', body: 'Pick dog or cat, then add their details once. Every order fits them from then on.' },
  { src: 'brand/app/screen-1.webp', title: 'Dogs or cats, sorted', body: 'Set your delivery address and jump straight to meals for dogs or for cats.' },
  { src: 'brand/app/screen-2.webp', title: 'Browse the menu', body: 'Search meals, filter veg or non-veg, and switch between your pets in one tap.' },
  { src: 'brand/app/screen-3.webp', title: 'Subscription plans', body: 'Meal plans customised to age, breed and health goals, with expert-approved nutrition delivered to your door.' },
  { src: 'brand/app/screen-5.webp', title: 'Your meal schedule', body: 'Choose the plan length, one or two meals a day, and the delivery window that suits you.' },
  { src: 'brand/app/screen-6.webp', title: 'Everything in one profile', body: 'Order history, all your pets, your subscriptions, and support when you need it.' },
];
