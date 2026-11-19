import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, ButtonLink, FAQ, Header, PassportChip, SiteFooter, Testimonials, useSectionReveals } from "@/design-system/components";
import { VIDEOS } from "@/content/explore-content";
import { useNarrow } from "@/lib/device";
import { possessive } from "@/lib/format";
import { usePet } from "@/lib/passport";
import { BagIcon, BowlIcon, BrushIcon } from "@/features/choose/icons";
import { COMPARE } from "./compare";
import s from "./ExplorePage.module.css";

/** /explore: for visitors who want to look around before making a passport. */
export default function ExplorePage() {
  const { pet } = usePet();
  const narrow = useNarrow(720, 720);
  const root = useRef<HTMLDivElement>(null);
  const finalRef = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState<Record<string, boolean>>({});
  const [scrolled, setScrolled] = useState(false);
  const [finalInView, setFinalInView] = useState(false);
  useSectionReveals(root, { narrow });

  // Sticky CTA appears after 40% scroll and hides while the orange closing band is on screen.
  useEffect(() => {
    let raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setScrolled(max > 0 && window.scrollY / max > 0.4);
      });
    };
    window.addEventListener("scroll", on, { passive: true });
    const io = new IntersectionObserver(([e]) => setFinalInView(e.isIntersecting));
    if (finalRef.current) io.observe(finalRef.current);
    return () => {
      window.removeEventListener("scroll", on);
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const petRef = pet ? pet.name : "your pet";
  const showCta = scrolled && !finalInView;
  const minis = [
    { title: "Fresh Food", desc: "Chef-cooked meals, delivered chilled", to: "/fresh-food", bg: "var(--section-food)", fg: "var(--dz-paper)", rot: "-1deg", icon: <BowlIcon /> },
    { title: "Services", desc: "Grooming, walks and vets, at home", to: "/services", bg: "var(--section-services)", fg: "var(--dz-paper)", rot: "0deg", icon: <BrushIcon /> },
    { title: "Marketplace", desc: "Food, toys and gear from stores near you", to: "/marketplace", bg: "var(--section-market)", fg: "var(--dz-ink)", rot: "1deg", icon: <BagIcon /> },
  ];
  const steps = [
    { n: 1, bg: "var(--dz-orange)", fg: "var(--dz-paper)", t: "Make a passport", b: "Name, dog or cat, and breed. About ten seconds." },
    { n: 2, bg: "var(--dz-green)", fg: "var(--dz-paper)", t: "Pick what they need", b: "Fresh meals, a groomer, a vet, or something from a local store." },
    { n: 3, bg: "var(--dz-pink)", fg: "var(--dz-ink)", t: "We deliver or come home", b: "Meals arrive chilled and on time. Groomers and vets come to you." },
  ];

  return (
    <div ref={root} className={`${s.root} ${narrow ? s.narrow : ""}`}>
      <Header right={pet && <PassportChip pet={pet} />} />
      <main>
        <section data-reveal="" className={s.hero}>
          <Badge data-ri="">Dogs &amp; cats · Delhi NCR</Badge>
          <h1 data-ri="" className={`dz-display ${s.h1}`}>Meet Doggzi</h1>
          <p data-ri="" className={s.tagline}>Not just food. Their food.</p>
          <p data-ri="" className={s.lede}>Fresh meals, at-home grooming and vet visits, and local pet stores. Everything your dog or cat needs, in one place.</p>
          <img data-ri="" src="/brand/illustrations/pets-trio.svg" alt="" aria-hidden="true" className={s.heroTrio} width={320} height={182} />
        </section>

        <section id="what-we-do" data-reveal="" className={s.band}>
          <div className={s.inner}>
            <div data-ri="" className={s.secHead}>
              <Badge tone="cream">What we do</Badge>
              <h2 className="dz-h2">Three ways we look after {petRef}</h2>
            </div>
            <div className={s.minis}>
              {minis.map((m) => (
                <Link key={m.title} data-ri="" to={pet ? m.to : "/"} className={s.mini} style={{ background: m.bg, color: m.fg, ["--rot" as string]: m.rot }}>
                  {m.icon}
                  <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className={s.miniTitle}>{m.title}</span>
                    <span className={s.miniDesc}>{m.desc}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" data-reveal="" className={s.how}>
          <div data-ri="" className={s.secHead}>
            <Badge>How it works</Badge>
            <h2 className="dz-h2">Three steps. That's it.</h2>
          </div>
          <ol className={s.steps}>
            <span data-line="" aria-hidden="true" className={s.line} />
            {steps.map((st) => (
              <li key={st.n} data-ri="" className={s.step}>
                <span className={s.num} style={{ background: st.bg, color: st.fg }}>{st.n}</span>
                <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span className={s.stepTitle}>{st.t}</span>
                  <span className={s.stepBody}>{st.b}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section id="why-fresh" data-reveal="" className={s.band} style={{ zIndex: 0 }}>
          <div className={`${s.inner} ${s.innerTall}`}>
            <div data-ri="" className={s.secHead}>
              <Badge tone="cream">Why fresh food</Badge>
              <h2 className="dz-h2">Fresh food vs kibble</h2>
              <p className={s.muted}>Recipes are formulated and reviewed by certified pet nutritionists to meet AAFCO nutrient profiles for all life stages, then tailored to age, breed, weight and activity.</p>
            </div>
            <div className={s.rail}>
              {COMPARE.map((c) => (
                <article key={c.label} data-ri="" className={s.cmp}>
                  <h3>{c.label}</h3>
                  <div className={s.cmpGood}>
                    <span className={s.cmpLabel} style={{ color: "var(--dz-green-700)" }}><span aria-hidden="true" className={s.dot} style={{ background: "var(--dz-green)" }} />Doggzi fresh</span>
                    <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>{c.doggzi}</span>
                  </div>
                  <div className={s.cmpBad}>
                    <span className={s.cmpLabel} style={{ color: "rgba(20,18,16,.7)" }}><span aria-hidden="true" className={s.dot} style={{ borderColor: "rgba(20,18,16,.7)" }} />Commercial kibble</span>
                    <span style={{ fontSize: 15, lineHeight: 1.45, color: "rgba(20,18,16,.8)" }}>{c.kibble}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {VIDEOS.length > 0 && (
          <section id="watch" data-reveal="" className={s.how}>
            <div data-ri="" className={s.secHead}>
              <Badge>Watch</Badge>
              <h2 className="dz-h2">See it in action</h2>
            </div>
            <div className={s.videos}>
              {VIDEOS.map((v) => (
                <div key={v.id} data-ri="" className={s.video}>
                  {/* Click-to-play facade: no YouTube iframe loads until the visitor taps play. */}
                  {playing[v.id] ? (
                    <iframe src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&playsinline=1&rel=0`} title={v.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  ) : (
                    <button type="button" className={s.play} aria-label={`Play video: ${v.title}`} onClick={() => setPlaying((p) => ({ ...p, [v.id]: true }))}>
                      <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" />
                      <span aria-hidden="true" className={s.playBtn}>
                        <svg viewBox="0 0 24 24" style={{ width: 30, height: 30, marginLeft: 4 }}><path d="M7 4.5v15l12-7.5z" fill="var(--dz-paper)" stroke="var(--dz-ink)" strokeWidth="2" strokeLinejoin="round" /></svg>
                      </span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <Testimonials />
        <FAQ set="explore" />

        <section ref={finalRef} data-reveal="" className={s.final}>
          <div className={s.finalInner}>
            <h2 data-ri="" className={`dz-display ${s.finalH}`}>Ready when {petRef} is</h2>
            <ButtonLink data-ri="" to="/" variant="secondary" size="lg" style={{ padding: "0 32px" }}>Make a passport <span aria-hidden="true">→</span></ButtonLink>
          </div>
        </section>
      </main>
      <SiteFooter />
      <div className={s.floatWrap}>
        <ButtonLink to="/" className={s.float} tabIndex={showCta ? 0 : -1} aria-hidden={!showCta}
          style={{ pointerEvents: showCta ? "auto" : "none", opacity: showCta ? 1 : 0, transform: showCta ? "none" : "translateY(24px)" }}>
          {pet ? `Make ${possessive(pet.name)} passport →` : "Make a passport →"}
        </ButtonLink>
      </div>
    </div>
  );
}
