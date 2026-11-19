import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AppDownload, Badge, ButtonA, FAQ, Header, PassportChip, PetAvatar, SiteFooter, Sweep, Testimonials, useSectionReveals, useToast } from "@/design-system/components";
import { css, ms } from "@/design-system/motion";
import { FRESH_FOOD } from "@/content/fresh-food";
import { track } from "@/lib/analytics";
import { isUnreachable } from "@/lib/api/client";
import { petProfile } from "@/lib/api/petProfile";
import { useDevice, useNarrow } from "@/lib/device";
import { passportStore, useFrom, usePet } from "@/lib/passport";
import { isReduced, useReduced } from "@/lib/reducedMotion";
import { useTweaks } from "@/lib/tweaks";
import { Hero } from "./Hero";
import { AppWall, InsideApp, Lightbox } from "./InsideApp";
import { KibbleSlider, type SliderHandle } from "./KibbleSlider";
import { KitchenRoute } from "./KitchenRoute";
import { PlanPreview } from "./PlanPreview";
import { Plans } from "./Plans";
import { Switching } from "./Switching";
import s from "./ff.module.css";

/** Page 3 (/fresh-food): makes the parent want fresh food, then sends them to the app (ordering happens there). */
export default function FreshFoodPage() {
  const { pet, isDemo } = usePet();
  const tweaks = useTweaks();
  const reduced = useReduced();
  const dev = useDevice();
  const toast = useToast();
  const narrow = useNarrow(720, 720);
  const cameFrom = useFrom();
  const root = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const plansRef = useRef<HTMLElement>(null);
  const slider = useRef<SliderHandle>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const wiggled = useRef(false);
  const [heroVis, setHeroVis] = useState(true);
  const [plansVis, setPlansVis] = useState(false);
  const [lb, setLb] = useState<number | null>(null);
  const [notifiedLocal, setNotifiedLocal] = useState(false);

  const catsOn = tweaks.catsSupported ?? FRESH_FOOD.catsSupported;
  const soon = !!pet && pet.type === "cat" && !catsOn;
  const notified = notifiedLocal || !!pet?.notify_fresh_food;

  useSectionReveals(root, { narrow, deps: [soon, reduced], onReveal: (sec) => sec.id === "kibble-vs-fresh" && slider.current?.hint() });

  // The page opens in orange, continuing the card that expanded on Choose.
  useEffect(() => {
    const el = overlay.current;
    if (!el) return;
    if (cameFrom !== "choose") return void (el.style.display = "none");
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: isReduced() ? ms.reduced : 600, delay: isReduced() ? 0 : 120, easing: css.easeOut, fill: "forwards" }).onfinish = () => (el.style.display = "none");
  }, [cameFrom]);

  // The sticky mobile bar hides while the hero or the plan cards are on screen.
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.target === heroRef.current) setHeroVis(e.intersectionRatio > 0);
      else if (e.target === plansRef.current) setPlansVis(e.intersectionRatio > 0);
    }));
    [heroRef.current, plansRef.current].forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [soon]);

  const barMounted = dev !== "Desktop" && !soon;
  const barShow = barMounted && !heroVis && !plansVis;
  useEffect(() => {
    if (!barShow || wiggled.current || !bar.current) return;
    wiggled.current = true;
    if (!isReduced()) bar.current.animate([{ rotate: "0deg" }, { rotate: "-1.6deg", offset: 0.25 }, { rotate: "1.2deg", offset: 0.5 }, { rotate: "-0.6deg", offset: 0.75 }, { rotate: "0deg" }], { duration: 520, delay: 400, easing: "ease-in-out" });
  }, [barShow]);

  if (!pet) return <Navigate to="/" replace />;

  const notify = async () => {
    track("fresh_food_notify", {});
    setNotifiedLocal(true);
    if (isDemo) return;
    passportStore.set((p) => (p ? { ...p, notify_fresh_food: true } : p));
    const cur = passportStore.get();
    if (cur?.pet_id && cur.guest_token)
      petProfile.preferences(cur.pet_id, cur.guest_token, { notify_fresh_food: true }).catch((e) => {
        if (!isUnreachable(e)) toast("We couldn't save that just now. Try again later.", "error");
      });
  };

  return (
    <div ref={root} className={`${s.root} ${narrow ? s.narrow : ""}`}>
      <div ref={overlay} aria-hidden="true" className={s.overlay} />
      <Header right={<PassportChip pet={pet} pop={false} />} />
      <main>
        <Hero ref={heroRef} pet={pet} soon={soon} notified={notified} onNotify={notify} visible={heroVis} />

        {soon && (
          <section data-reveal="" className={`${s.wrap} ${s.sec}`} style={{ paddingTop: "clamp(48px,7vw,80px)", paddingBottom: "clamp(48px,7vw,80px)", gap: 24 }}>
            <h2 data-ri="" className="dz-display" style={{ fontSize: "clamp(1.8rem,4.5vw,2.8rem)" }}>Meanwhile, for <Sweep>{pet.name}</Sweep></h2>
            <div className={s.altCards}>
              <Link data-ri="" to="/services" className={s.altCard} style={{ background: "var(--section-services)", color: "var(--dz-paper)" }}>
                <span className={s.altTitle}>Services →</span><span style={{ fontSize: 16, fontWeight: 500 }}>Grooming, boarding and vet visits for cats, at home</span>
              </Link>
              <Link data-ri="" to="/marketplace" className={s.altCard} style={{ background: "var(--section-market)", color: "var(--dz-ink)" }}>
                <span className={s.altTitle}>Marketplace →</span><span style={{ fontSize: 16, fontWeight: 500 }}>Treats, litter and toys from stores near you</span>
              </Link>
            </div>
          </section>
        )}

        <section id="kibble-vs-fresh" data-reveal="" className={`${s.wrap} ${s.sec}`} style={{ gap: "clamp(24px,4vw,36px)" }}>
          <div data-ri="" className={s.head}>
            <Badge>Kibble vs fresh</Badge>
            <h2 className="dz-h2">{reduced ? "Kibble vs fresh, side by side" : "Drag to see the difference"}</h2>
          </div>
          <div data-ri=""><KibbleSlider ref={slider} narrow={narrow} /></div>
          <p data-ri="" className={s.aafco}>
            <strong style={{ fontFamily: "var(--font-accent)", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>Nutritional adequacy · </strong>
            Doggzi Fresh Food recipes are formulated and reviewed by certified pet nutritionists to meet the nutritional levels established by AAFCO Dog Food Nutrient Profiles for all life stages, including the growth of large-size dogs (70 lbs or more as an adult).
          </p>
        </section>

        {!soon && (
          <>
            <Plans ref={plansRef} name={pet.name} />
            <PlanPreview pet={pet} isDemo={isDemo} />
          </>
        )}

        <InsideApp onOpen={setLb} />
        {!reduced && <AppWall onOpen={setLb} />}
        <KitchenRoute />
        {!soon && <Switching />}

        <section id="download" data-reveal="" className={`${s.wrap} ${s.dlGrid}`}>
          <div data-ri="" className={s.head} style={{ gap: 12 }}>
            <Badge>Get the app</Badge>
            <h2 className="dz-h2">Get the app for <Sweep>{pet.name}</Sweep></h2>
            <p style={{ margin: 0, maxWidth: "40ch", fontSize: 17, lineHeight: 1.6 }}>Trial orders, daily plans, live tracking and quick reorders all live in the Doggzi app.</p>
          </div>
          <div data-ri=""><AppDownload layout="full" source="fresh_food_download" /></div>
        </section>

        <Testimonials tag="fresh-food" heading="Happy bowls" />
        <FAQ set="freshFood" heading="Fresh food questions" />

        <section data-reveal="" className={s.guide}>
          <div className={`${s.wrap} ${s.guideInner}`}>
            <div data-ri="" style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 620 }}>
              <h2 className="dz-display" style={{ fontSize: "clamp(1.9rem,4.5vw,3rem)" }}>Get the Doggzi Fresh Food guide</h2>
              <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55 }}>Everything about the meals and how to serve them, in one PDF.</p>
            </div>
            <ButtonA data-ri="" variant="ink" size="lg" href={FRESH_FOOD.guidePdf} download onClick={() => track("fresh_food_guide_download", { source: "guide_band" })}>Download PDF <span aria-hidden="true">↓</span></ButtonA>
          </div>
        </section>
      </main>
      <SiteFooter />

      {lb != null && <Lightbox index={lb} onNav={(d) => setLb((i) => ((i ?? 0) + d + 6) % 6)} onClose={() => setLb(null)} />}

      {barMounted && (
        <div ref={bar} aria-hidden={!barShow} className={s.bar} style={{ transform: barShow ? "none" : "translateY(110%)", visibility: barShow ? "visible" : "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <PetAvatar type={pet.type} breed={pet.breed} size={40} />
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 0 }}>
              <span style={{ fontFamily: "var(--font-accent)", fontWeight: 700, fontSize: 16, letterSpacing: ".06em", textTransform: "uppercase" }}>Get Doggzi app</span>
              <span style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Fresh meals for {pet.name}</span>
            </span>
          </div>
          <div style={{ flex: "none", transform: "scale(.82)", transformOrigin: "right center" }}>
            <AppDownload layout="badge" source="fresh_food_bar" />
          </div>
        </div>
      )}
    </div>
  );
}
