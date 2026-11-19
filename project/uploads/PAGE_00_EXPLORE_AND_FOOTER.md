# Explore page (`/explore`) and site footer

## 1. Entry point on Page 1
- Below the passport form, add a secondary button: **"New to Doggzi? Explore first ↓"**. Use ghost style with an ink outline and a small paw icon that bounces every 4s.
- It routes to `/explore`. Page 1 itself only gets the button and the footer, with no extra sections, so the passport stays the hero.

## 2. Explore page sections (in order)
Each section reveals on scroll (`listItem`, staggered), and only once.

1. **Hero:** "Meet Doggzi" plus the tagline. `pets-trio` sits small and peeking, with a sticky **"Make Bruno's passport →"** CTA that appears after scrolling 40% (it says "Make a passport" when there's no pet yet).
2. **What we do:** three mini cards (Fresh Food, Services, Marketplace) in their section colours, matching the Choose cards so the pages feel connected.
3. **How it works:** three steps with a line-draw connector: *Make a passport → Pick what they need → We deliver or come home*.
4. **Why fresh food:** the comparison table from `reference/fresh-food-vs-kibble.pdf` (Ingredients, Nutrition, Digestibility, Palatability, Health), rebuilt as cards that swipe on mobile.
5. **Watch:** a YouTube Shorts row (9:16 vertical cards, swipeable):
   - `https://www.youtube-nocookie.com/embed/meL36vGziOQ`
   - `https://www.youtube-nocookie.com/embed/gYXjrR1LE4U`
   Use a **click-to-play facade**: show the thumbnail `https://i.ytimg.com/vi/<id>/hqdefault.jpg` with a sticker play button, and load the iframe only on tap. This keeps the page fast. Keep the video IDs in a config array so more can be added without code changes.
6. **Testimonials:** sticker cards showing the pet's name and avatar, the parent's first name, their area (for example "Sector 56, Gurgaon"), a quote and the service used. Auto-scroll as a slow marquee, pause on hover, and use a swipe carousel on mobile.
   **Only use real reviews collected from customers, with their permission.** Until those arrive, render the section from `testimonials.ts` with clearly marked placeholder entries, and hide the section entirely if the list is empty. Never ship made-up reviews.
7. **FAQ:** an accordion (one item open at a time, a "+" that rotates to "×", height animated with `spring.soft`). Add `FAQPage` JSON-LD for SEO. Starter questions, with answers drafted from the PDF and to be confirmed by Abhiyash before launch:
   - Which pets do you serve? (Dogs and cats only.)
   - Which areas do you deliver to? (Delhi NCR; confirm the exact sectors and cities.)
   - Who designs the meals? (Recipes are formulated by certified pet nutritionists to AAFCO nutrient profiles.)
   - Is the food frozen? (No. It's cooked weekly in a hygienic kitchen and delivered chilled.)
   - Can I pause or skip my subscription? (Yes, you can pause, skip or edit meals any time.)
   - How do I switch from kibble to fresh food?
   - How do I book a groomer or vet, and can I reschedule?
   - Who are the Marketplace sellers? (Local, verified pet stores near you.)
   - What if something goes wrong with an order or a visit? (Refund and redo policy, still to be written.)
8. **Final CTA band** in orange: "Ready when Bruno is", with a **Make a passport** button that returns to `/`.

## 3. Site footer (`SiteFooter`, a design-system component used on EVERY page)
**The look:** a dark ink (`#141210`) block with a scalloped top edge, cut in the same cloud shape as the wordmark badge. The puppy, Labrador and cat from `pets-trio` **peek over the top edge**, and they pop up a little when the footer scrolls into view, with the cat's tail swishing. A faint paw-print pattern sits in the background.

Columns (four on desktop, accordions on mobile):
- **Doggzi:** the wordmark (cream badge reads well on ink), "Not just food. Their food.", and "Serving dogs & cats across Delhi NCR".
- **Explore:** Fresh Food, Services, Marketplace, How it works, FAQ.
- **Company:** About, Careers, Partner with us (kitchens and vendors), Contact.
- **Get help:** a WhatsApp button, email and phone. All three come from env or config, never hard-coded in a component.

Bottom bar: © {current year} Doggzi Private Limited · Gurgaon, Haryana · Privacy · Terms · Refunds · FSSAI licence no. (from config, shown once it's issued) · social icons (Instagram, YouTube, LinkedIn).

Easter egg: hovering over or tapping the peeking dogs makes them do a tiny hop. Turn this off when reduced motion is on.

## 4. Backend
- Phase 1: FAQs, testimonials and video IDs live in typed config files in `apps/web/src/content/`, so no service is needed yet.
- Phase 2: move them to a small `content` table in the Admin service, so the team can edit them from the admin panel. Admin endpoints require the ADMIN role.

## Done when
- The footer is the same component on `/`, `/choose` and `/explore`.
- No YouTube iframe loads until the visitor taps play.
- The FAQ JSON-LD validates in Google's Rich Results Test.
- The testimonials section is hidden when there are no real entries.
