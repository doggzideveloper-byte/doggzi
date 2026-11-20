// Explore content — Phase 1 config (moves to the Admin `content` table in Phase 2).

// Add more Shorts by appending IDs.
export const VIDEOS = [
  { id: 'meL36vGziOQ', title: 'Doggzi Short 1' },
  { id: 'gYXjrR1LE4U', title: 'Doggzi Short 2' },
];

// REAL reviews only, collected with permission. Placeholder entries are flagged and
// rendered with a visible "Placeholder" badge. Empty array hides the section.
// `tags` lets a page show only its own reviews (e.g. 'fresh-food').
export const TESTIMONIALS = [
  { placeholder: true, pet: 'Pet name', type: 'dog', parent: 'Parent', area: 'Sector —, Gurgaon', service: 'Fresh Food', tags: ['fresh-food'], quote: 'A real review from a Doggzi parent goes here, shared with their permission.' },
  { placeholder: true, pet: 'Pet name', type: 'cat', parent: 'Parent', area: 'Area —, Delhi', service: 'Grooming', tags: ['services'], quote: 'A real review from a Doggzi parent goes here, shared with their permission.' },
  { placeholder: true, pet: 'Pet name', type: 'dog', parent: 'Parent', area: 'Sector —, Noida', service: 'Marketplace', tags: ['marketplace'], quote: 'A real review from a Doggzi parent goes here, shared with their permission.' },
  { placeholder: true, pet: 'Pet name', type: 'dog', parent: 'Parent', area: 'DLF Phase —, Gurgaon', service: 'Spa day', tags: ['services'], quote: 'A real review from a Doggzi parent goes here, shared with their permission.' },
];

// DRAFT answers — to be confirmed by Abhiyash before launch.
export const FAQS = [
  { q: 'Which pets do you serve?', a: 'Dogs and cats only, for now.' },
  { q: 'Which areas do you deliver to?', a: 'Delhi NCR. Exact sectors and cities to be confirmed.' },
  { q: 'Who designs the meals?', a: 'Recipes are formulated and reviewed by certified pet nutritionists to meet AAFCO nutrient profiles for all life stages, then tailored to your pet’s age, breed, weight and activity level.' },
  { q: 'Is the food frozen?', a: 'No. It’s cooked weekly in a hygienic kitchen and delivered chilled, portioned and labelled.' },
  { q: 'Can I pause or skip my subscription?', a: 'Yes. You can pause, skip or edit meals any time.' },
  { q: 'How do I switch from kibble to fresh food?', a: 'Draft: mix a little fresh food into their usual bowl and increase it gradually over about a week. Your nutritionist will share a plan for your pet.' },
  { q: 'How do I book a groomer or vet, and can I reschedule?', a: 'Draft: pick a service under Services, choose a slot, and we confirm it. You can reschedule from your bookings.' },
  { q: 'Who are the Marketplace sellers?', a: 'Local, verified pet stores near you.' },
  { q: 'What if something goes wrong with an order or a visit?', a: 'Our refund and redo policy is being written and will be published here before launch.' },
];

// Fresh Food FAQ — ALL DRAFT, to be confirmed by Abhiyash before launch.
export const FRESH_FOOD_FAQS = [
  { q: 'What’s in the meals?', a: 'Human-grade fresh meat, veggies and oils. Our recipes combine chicken breast and thighs, organ meats with fortified nutritional yeast for B-vitamins, eggshell powder for calcium and cod liver oil for vitamins A and D. No preservatives, flavours or colours.' },
  { q: 'Who formulates the recipes?', a: 'Certified pet nutritionists formulate and review every recipe to meet AAFCO nutrient profiles for all life stages. Your plan is then tailored to your pet’s age, breed, weight and activity level.' },
  { q: 'Is it chilled or frozen? How do I store it?', a: 'Chilled, never frozen. Meals are cooked in a hygienic kitchen and arrive portioned and labelled. Keep them in the fridge. Storage guidance to be confirmed.' },
  { q: 'How long does it keep in the fridge?', a: 'To be confirmed by our nutritionist before launch.' },
  { q: 'What’s the difference between a trial order and a subscription?', a: 'A one-time order lets you try the food first, with no commitment. The daily subscription adds a personalised nutrition plan from a certified pet nutritionist and fresh meals delivered daily.' },
  { q: 'Can I pause or skip?', a: 'Yes. Pause, skip or edit meals any time in the app.' },
  { q: 'Where and when do you deliver?', a: 'Delhi NCR. In the app you choose a preferred delivery window. Exact sectors and timings to be confirmed.' },
  { q: 'How do I switch from kibble?', a: 'Mix fresh food into their usual bowl and increase it gradually over about a week. Your nutritionist will tailor the switch for your pet.' },
  { q: 'My pet has allergies. Can you help?', a: 'Add their allergies to their passport and in the app. Your nutritionist uses them when building the plan.' },
  { q: 'Is Fresh Food available for cats?', a: 'To be confirmed. If it isn’t available for your cat yet, tap Notify me and we’ll tell you when it is.' },
];

// Services FAQ — ALL DRAFT, to be confirmed by Abhiyash before launch.
export const SERVICES_FAQS = [
  { q: 'Do you come to my home?', a: 'Yes. Grooming and spa services are done at your doorstep across Delhi NCR. Exact areas to be confirmed.' },
  { q: 'What’s in each grooming package?', a: 'Full Package: bath, blow dry, trim and styling. Trimming Package: trim and face styling. Shower Package: bath and blow dry. Contents to be confirmed.' },
  { q: 'Are prices inclusive of GST?', a: 'To be confirmed.' },
  { q: 'How do I pay?', a: 'No online payment for now. Payment is collected after the service (to be confirmed).' },
  { q: 'Can I reschedule or cancel?', a: 'Yes. Message us on WhatsApp before your slot. Policy details to be confirmed.' },
  { q: 'Which services are available for cats?', a: 'Bath & blow dry, medicated bath, light de-matting, body massage and dental cleaning (draft list, to be confirmed).' },
  { q: 'How does training work?', a: 'Training is 12 sessions a month with a Doggzi trainer.' },
  { q: 'How do I book boarding or pickup?', a: 'Boarding is priced per hour on request and pickup is subject to availability. Ask us on WhatsApp.' },
];

// Marketplace FAQ — ALL DRAFT, to be confirmed by Abhiyash before launch.
export const MARKETPLACE_FAQS = [
  { q: 'Who sells these products?', a: 'Local pet stores near you. Until more stores join, products are sold by Doggzi Store, Doggzi’s own shop.' },
  { q: 'How fast is delivery?', a: 'Most orders arrive the same day from a store near you. Exact timings to be confirmed.' },
  { q: 'Is there a delivery fee?', a: 'Each store sets its own delivery fee, shown in your cart before you pay.' },
  { q: 'How do I pay?', a: 'Securely with Razorpay: UPI, cards, net banking and wallets.' },
  { q: 'Can I return something?', a: 'Returns are handled by the store that sold it, and you can call them directly. Policy details to be confirmed.' },
  { q: 'Why don’t I see a product photo?', a: 'We only show photos taken by the store itself. Until then you’ll see a Doggzi illustration of the category.' },
];
