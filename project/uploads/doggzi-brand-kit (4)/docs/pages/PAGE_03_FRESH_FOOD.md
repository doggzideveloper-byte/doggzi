# Page 03: Fresh Food (`/fresh-food`)

## Goal
Make the parent want fresh food for their pet, then get them to **download the Doggzi app**, which is where ordering happens. The secondary goal is getting them to download the Fresh Food guide (PDF).
The website doesn't take food orders. Every "buy" action leads to the app.

Section colour: **orange**. The page opens in orange, continuing the colour from the card that expanded on the Choose page.

## Source material (use only these facts)
- `docs/reference/fresh-food-vs-kibble.pdf`: the AAFCO statement, the comparison table, the five subscription benefits and the ingredients (chicken breast and thighs, organ meats with fortified nutritional yeast, eggshell powder for calcium, cod liver oil for vitamins A and D).
- The App Store and Play Store listings say the app offers: a personalised pet profile (breed, age, weight, allergies) leading to a recommended nutrition plan, human-grade ingredients, flexible subscriptions (pause, skip or cancel any time, with custom portions), on-demand **one-time orders**, quick reorder, live kitchen-to-door delivery tracking, address management, multiple pet profiles, secure checkout and support for all life stages.
- From Abhiyash: the **subscription has daily deliveries and a personalised nutrition plan made by a nutritionist** from the pet's exact details, and a **one-time order lets people try the food first**.
- App screenshots: six images. Save them to `/brand/app/screen-1.webp` through `screen-6.webp`. Look at each one and caption it with what it actually shows.
- Store links (keep in `content/site-config.js`):
  - iOS: `https://apps.apple.com/in/app/doggzi/id6757533673`
  - Android: `https://play.google.com/store/apps/details?id=com.doggzi.doggzi&hl=en_IN`
  - Add `&referrer=utm_source%3Dweb%26utm_medium%3Dfresh_food` to the Play link so installs from the website can be tracked.

Don't invent figures such as prices, calories, gram portions, "X% healthier" or customer counts. Don't show store ratings until there are enough reviews to mean something.

## Sections and the surprises

### 1. Hero: "Bruno's bowl, built fresh"
- On the left: "FRESH MEALS FOR **BRUNO**", one line of copy, then the **Smart Download** button (see §9) and a ghost link, "Get the free guide (PDF)".
- On the right: **an animated bowl builder**. An empty line-art bowl (green, as in the PDF) sits there, and the ingredients from the PDF drop in one by one with a bouncy spring: a chicken piece, organ meat, a veg cube, an eggshell, an oil drop. Each one lands with a small label sticker ("Calcium from eggshell"). Then steam curls rise (line-draw) and an "APPROVED BY NUTRITIONIST" stamp lands.
- When the pet is a cat, the ingredient set and copy change (see §10).

### 2. Kibble vs Fresh: a drag slider
- One full-width card. On the left, a dull, grey, grainy "KIBBLE" half; on the right, a bright, fresh "DOGGZI" half. Between them is a **draggable sticker handle**. Dragging it reveals each comparison row from the PDF (Ingredients, Nutrition, Digestibility, Palatability, Health outcome), with ✗ on the kibble side and ✓ on the Doggzi side.
- Keyboard: the arrow keys move the handle. Reduced motion: show the two columns side by side with no dragging.
- Below the slider, show the **AAFCO adequacy statement** in a small sticker note.

### 3. Two ways to start
These are two plan cards. Both buttons go to the app download.
| **Try it once** | **Daily subscription** (badge: MOST LOVED) |
|---|---|
| A one-time order to see if Bruno loves it | A personalised nutrition plan from a certified pet nutritionist, built from Bruno's exact details |
| No commitment | Fresh meals delivered daily, cooked in a hygienic kitchen and delivered chilled, not frozen |
| | Pause, skip or edit meals any time |
| **Order a trial in the app →** | **Start the plan in the app →** |
On hover, a card lifts. On selection, a little paw stamp lands on it.

### 4. Bruno's plan preview (connects to the backend)
- "Your nutritionist needs 3 more things about Bruno": **weight** (a slider from 1 to 80 kg), **age** (puppy / adult / senior chips plus years), **allergies** (multi-select chips: chicken, beef, grains, dairy, none) and **activity** (couch potato / normal / zoomies).
- As the parent answers, the passport card grows a new "Nutrition" section, using the same live-filling animation as Page 1.
- Submitting saves these to Bruno's passport (see Backend) and shows: "Saved to Bruno's passport ✓. Your nutritionist will use this in the app." Then show the Smart Download button.
- **No portions, calories or prices are calculated on the website.** The nutritionist sets those in the app.

### 5. Inside the app: a sticky phone
- On desktop: a phone frame stays pinned on the right while the left column scrolls through **six benefit blocks**, one per screenshot. As each block scrolls into view, the phone's screen cross-fades or slides to the matching screenshot. (Example blocks: personalised plan, daily delivery and subscription control, one-time trial order, live kitchen-to-door tracking, quick reorder, multiple pets.) Write the captions to match what each screenshot really shows.
- On mobile: a swipeable phone carousel with the caption under each phone.

### 5b. Show many screens, not one (revision 1)
- **Hero phone fan:** three phones fanned out (−12°, 0°, 12°) behind the bowl builder. They float with slow parallax, spread wider on hover, and the middle one cycles through screens.
- **Sticky phone becomes a 3D coverflow:** the active screen is in front, with the previous and next screens peeking behind it (tilted ±25°, scaled to 0.85, 60% opacity). As the visitor scrolls, the whole stack rotates. Entry animation: the phone tilts in from `rotateX(25deg)` to flat.
- **Floating benefit stickers** orbit the active phone ("Pause anytime", "Live tracking", "Nutritionist plan"), each pinned to a screen and popping in with `spring.bouncy`.
- **App wall:** after §5, add a full-width band with two rows of all six screens on a tilted 3D plane (`rotateX(20deg) rotateZ(-8deg)`), scrolling as a marquee in opposite directions. It pauses on hover. Tapping a screen opens a lightbox carousel.
- **Reduced motion:** a static grid of all six screens.

### 6. Kitchen to door: a route animation
A line-draw route moves from a **kitchen** (pot icon, "cooked fresh") to a **chilled van** ("kept chilled, never frozen") to a **door** ("on time, portioned & labelled"). A small van icon drives along the path as it scrolls into view. It mirrors the live tracking in the app.

### 7. Switching from kibble
A gentle 7-day transition strip (Days 1–2, 3–4, 5–6, 7+), with small bowls showing fresh food gradually replacing kibble. Label it "general guide — your nutritionist will tailor it". **Abhiyash and the nutritionist must confirm the ratios before launch**, so keep them in config.

### 8. Fresh Food reviews, FAQ and footer
- **Testimonials:** the same component and rules as Explore. Show only entries tagged `fresh-food`, and hide the section if there are no real entries.
- **FAQ:** the same accordion and JSON-LD. Use food-specific questions, all marked draft until confirmed: what's in the meals, who formulates them, chilled or frozen and how to store it, how long it keeps in the fridge, the trial order vs the subscription, pause or skip, delivery areas and timings, switching from kibble, allergies, and whether it's available for cats.
- **Guide band:** "Get the Doggzi Fresh Food guide" with a **Download PDF** button pointing to `/brand/downloads/doggzi-fresh-food-guide.pdf` (the instruction manual). Track the click as an analytics event.
- **SiteFooter.**

### 9. Smart Download (a new design-system component: `AppDownload`)
- It detects the device. **iPhone** gets an App Store button. **Android** gets a Google Play button. **Desktop** gets both official badges plus a **QR code** that sends a phone to a `/app` redirect, which then picks the right store.
- Use the official Apple and Google badge artwork, unchanged, as their brand rules require.
- Bonus: a "Send link to my phone" field that hands off to WhatsApp, so the phone number goes through WhatsApp and isn't stored on our side.
- At the bottom of the page on mobile, add a **sticky bottom bar**: "Get Doggzi app", the pet's avatar and the store button. It hides while §3 or the hero CTA is on screen.

### 10. Cat behaviour (decision needed)
The Play Store listing mentions dogs and cats, but the App Store listing and the PDF talk about dogs. Add a config flag, `freshFood.catsSupported`.
- `true`: show cat ingredients and copy.
- `false`: for a cat passport, show "Fresh meals for Mishti are coming soon" with a **Notify me** button (it saves `notify_fresh_food=true` on the pet), and push Services and Marketplace instead.

## Backend: `services/pet-profile`, an additive migration only (no drops)
- New columns on `pets`: `weight_kg numeric(5,2) null`, `life_stage text null` (puppy/kitten/adult/senior), `age_years numeric(4,1) null`, `allergies text[] default '{}'`, `activity_level text null`, `notify_fresh_food bool default false`. `updated_at` is bumped on every change.
- `PATCH /api/pet-profile/v1/pets/{id}/nutrition` with validation: weight between 0.5 and 100, and allergies from an allowed list.
- Later, the mobile app reads the same pet-profile service, so the plan is prefilled. This is the bridge between the website and the app.
- `GET /app`: a redirect endpoint (handled in nginx or the gateway) that reads the User-Agent and sends visitors to the right store, with the UTM tags kept. Desktop visitors go to `/fresh-food#download`.

## Done when
- The CLAUDE.md definition of done is met.
- The Smart Download button behaves correctly on iOS, Android and desktop, including the QR code.
- Every price, ratio and FAQ answer is either in config and marked as a draft, or confirmed.
- The page still makes sense with reduced motion on (slider, bowl and phone all static).
