// Services config (features/services). Source: docs/reference/Doggzi_Services_Catalog.pdf
// Prices in paise (integers). GST-inclusive or not: TO CONFIRM (Abhiyash).
export const PRICE_NOTE = 'Prices as per the Doggzi catalog. GST treatment to be confirmed.';

export const CATALOG = [
  { id: 'full-package', group: 'package', name: 'Full Package', price_paise: 172400, price_mode: 'fixed', scene: 'full' },
  { id: 'trimming-package', group: 'package', name: 'Trimming Package', price_paise: 114900, price_mode: 'fixed', scene: 'trimpkg' },
  { id: 'shower-package', group: 'package', name: 'Shower Package', price_paise: 114900, price_mode: 'fixed', scene: 'shower' },
  { id: 'bath-blow-dry', group: 'spa', name: 'Bath & blow dry', price_paise: 103400, price_mode: 'fixed', scene: 'bathdry' },
  { id: 'boot-cut', group: 'spa', name: 'Boot cut / poodle look', price_paise: 34400, price_mode: 'fixed', scene: 'pompom' },
  { id: 'body-massage', group: 'spa', name: 'Body Massage', price_paise: 34400, price_mode: 'fixed', scene: 'massage' },
  { id: 'face-styling', group: 'spa', name: 'Only face styling', price_paise: 57400, price_mode: 'fixed', scene: 'style' },
  { id: 'medicated-bath', group: 'spa', name: 'Medicated bath', price_paise: 22900, price_mode: 'fixed', scene: 'medbath' },
  { id: 'dental-cleaning', group: 'spa', name: 'Dental cleaning', price_paise: 22900, price_mode: 'fixed', scene: 'dental' },
  { id: 'light-dematting', group: 'spa', name: 'Light de-matting', price_paise: 34400, price_mode: 'fixed', scene: 'dematLight' },
  { id: 'normal-dematting', group: 'spa', name: 'Normal de-matting', price_paise: 103400, price_mode: 'fixed', scene: 'dematNormal' },
  { id: 'oil-massage', group: 'spa', name: 'De-stressing oil massage', price_paise: 68900, price_mode: 'fixed', scene: 'oil' },
  { id: 'full-trim', group: 'spa', name: 'Full body hair trim', price_paise: 114900, price_mode: 'fixed', scene: 'fulltrim' },
  { id: 'breed-styling', group: 'spa', name: 'Breed based styling', price_paise: 114900, price_mode: 'fixed', scene: 'breed' },
  { id: 'training', group: 'training', name: 'Pet Training (12 sessions/month)', price_paise: 1150000, price_mode: 'fixed', scene: 'training' },
  { id: 'boarding', group: 'boarding', name: 'Boarding (per hour)', price_paise: null, price_mode: 'on_request', scene: 'boarding' },
  { id: 'pickup', group: 'pickup', name: 'Pickup facility', price_paise: null, price_mode: 'availability', scene: 'pickup' },
];

// DRAFT — package contents to be confirmed by Abhiyash. Steps drive the scene sequence + checklist.
export const PACKAGE_STEPS = {
  'full-package': [{ scene: 'bath', label: 'Bath' }, { scene: 'dry', label: 'Blow dry' }, { scene: 'trim', label: 'Trim' }, { scene: 'style', label: 'Styling' }],
  'trimming-package': [{ scene: 'trim', label: 'Trim' }, { scene: 'style', label: 'Face styling' }],
  'shower-package': [{ scene: 'bath', label: 'Bath' }, { scene: 'dry', label: 'Blow dry' }],
};

// DRAFT — Abhiyash to confirm which services are offered for cats.
export const SERVICES_BY_PET_TYPE = {
  dog: CATALOG.map(i => i.id),
  cat: ['bath-blow-dry', 'medicated-bath', 'light-dematting', 'body-massage', 'dental-cleaning', 'boarding', 'pickup'],
};

// DRAFT — serviceable pincodes (Delhi NCR), confirm before launch.
export const SERVICEABLE_PINCODES = [
  ...Array.from({ length: 18 }, (_, i) => String(122001 + i)),   // Gurgaon
  ...Array.from({ length: 10 }, (_, i) => String(201301 + i)),   // Noida
  '110017', '110024', '110048', '110049', '110065', '110070',     // South Delhi
];

export const SLOT_TIMES = ['09:00', '10:30', '12:00', '14:00', '15:30', '17:00', '18:30'];
