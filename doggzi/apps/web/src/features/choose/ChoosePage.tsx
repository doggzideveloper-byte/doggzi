import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Badge, Button, FlipCard, Header, HighlightName, PassportChip, SiteFooter } from "@/design-system/components";
import { css, ms } from "@/design-system/motion";
import { inr, possessive } from "@/lib/format";
import { from, useFrom, usePet } from "@/lib/passport";
import { isReduced, useReduced } from "@/lib/reducedMotion";
import { useNarrow } from "@/lib/device";
import { BagIcon, BowlIcon, BrushIcon } from "./icons";
import { FRESH_FROM_PRICE, FRESH_POINTS, STORE_COUNT_LINE, TEASERS } from "./teasers";
import s from "./ChoosePage.module.css";

type Key = "fresh" | "svc" | "mkt";
const CARDS: { key: Key; title: string; route: string; bg: string; fg: string; tilt: number; badge: string }[] = [
  { key: "fresh", title: "Fresh Food", route: "/fresh-food", bg: "var(--section-food)", fg: "var(--dz-paper)", tilt: -4, badge: "Premium" },
  { key: "svc", title: "Services", route: "/services", bg: "var(--section-services)", fg: "var(--dz-paper)", tilt: 0, badge: "Dogs & cats" },
  { key: "mkt", title: "Marketplace", route: "/marketplace", bg: "var(--section-market)", fg: "var(--dz-ink)", tilt: 4, badge: "Local stores" },
];

/** Page 2 (/choose): three flip cards personalised with the pet's name. */
export default function ChoosePage() {
  const { pet } = usePet();
  const nav = useNavigate();
  const reduced = useReduced();
  const mobile = useNarrow(640, 660);
  const [flipped, setFlipped] = useState<Key | null>(null);
  const [handoff, setHandoff] = useState<{ key: Key; rect: DOMRect } | null>(null);
  const returning = useFrom() !== "passport";
  const wraps = useRef<Partial<Record<Key, HTMLDivElement | null>>>({});
  const handoffRef = useRef<HTMLDivElement>(null);

  // Deal: cards rise from below, tilted −4°, 0°, 4°, landing on a soft spring 0.08s apart.
  useEffect(() => {
    CARDS.forEach((c, i) => {
      const el = wraps.current[c.key];
      if (!el) return;
      if (isReduced()) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms.reduced, fill: "backwards" });
      else el.animate([{ transform: `translateY(140px) rotate(${c.tilt}deg)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 750, delay: 120 + i * 80, easing: css.soft, fill: "backwards" });
    });
  }, []);

  // Continue: the card scales up to fill the screen in its section colour, then we route.
  useEffect(() => {
    const el = handoffRef.current;
    if (!handoff || !el) return;
    const c = CARDS.find((x) => x.key === handoff.key)!;
    const go = () => {
      from.set(c.key === "fresh" ? "choose" : c.key === "svc" ? "choose-services" : "choose-market");
      nav(c.route);
    };
    if (isReduced()) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms.reduced, fill: "forwards" }).onfinish = go;
      return;
    }
    const r = handoff.rect, W = window.innerWidth, H = window.innerHeight;
    el.animate(
      [
        { transform: `translate(${r.left}px,${r.top}px) scale(${r.width / W},${r.height / H})`, borderRadius: `${(28 * W) / r.width}px / ${(28 * H) / r.height}px` },
        { transform: "none", borderRadius: "0" },
      ],
      { duration: 600, easing: css.inOut, fill: "forwards" },
    ).onfinish = go;
  }, [handoff, nav]);

  if (!pet) return <Navigate to="/" replace />;
  const t = TEASERS[pet.type] || TEASERS.dog;

  const toggle = (key: Key) => {
    const next = flipped === key ? null : key;
    setFlipped(next);
    const w = wraps.current[key];
    setTimeout(() => {
      if (!w || !w.contains(document.activeElement)) return;
      const target = next ? w.querySelector<HTMLElement>("[data-continue]") : w.querySelector<HTMLElement>("button");
      target?.focus({ preventScroll: true });
    }, isReduced() ? 0 : 320);
  };
  const cont = (key: Key) => {
    const w = wraps.current[key];
    if (w) setHandoff({ key, rect: (w.firstElementChild as HTMLElement).getBoundingClientRect() });
  };

  const back = (c: (typeof CARDS)[number]) => {
    const bar = <div className={s.backBar} style={{ background: c.bg, color: c.fg }}><span>{c.title}</span><span>for {pet.name}</span></div>;
    let body: React.ReactNode;
    if (c.key === "fresh")
      body = (
        <>
          <p className={s.lead}>Meals portioned for {possessive(pet.name)} size</p>
          <ul className={s.dotList}>{FRESH_POINTS.map((p) => <li key={p}><span aria-hidden="true" className={s.dot} />{p}</li>)}</ul>
          <p className={s.foot}>Starts at <strong style={{ fontWeight: 600 }}>{inr(FRESH_FROM_PRICE)}</strong> / week</p>
        </>
      );
    else if (c.key === "svc")
      body = (
        <>
          <p className={s.lead}>What we can do for {pet.name}</p>
          <ul className={s.pills}>{t.services.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className={s.foot} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><span aria-hidden="true" className={s.dot} style={{ marginTop: 0 }} />Booked &amp; tracked end to end</p>
        </>
      );
    else
      body = (
        <>
          <ul className={s.prices}>{t.market.map(([n, a, b]) => <li key={n}><span style={{ fontWeight: 600 }}>{n}</span><span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{inr(a)} – {inr(b)}</span></li>)}</ul>
          <p className={s.foot}>{STORE_COUNT_LINE}</p>
        </>
      );
    return (
      <>
        {bar}
        <div className={s.backBody}>{body}</div>
        <div className={s.cta}>
          <Button data-continue="" block variant={c.key === "fresh" ? "primary" : c.key === "svc" ? "green" : "pink"} tabIndex={flipped === c.key ? 0 : -1} style={{ height: "3.125rem", fontSize: "1.0625rem" }}
            onClick={(e) => { e.stopPropagation(); cont(c.key); }}>
            Continue →
          </Button>
        </div>
      </>
    );
  };

  const desc: Record<Key, string> = { fresh: `Chef-cooked meals for ${pet.name}`, svc: t.svcDesc, mkt: "Food, toys and gear from stores near you" };
  const icon: Record<Key, JSX.Element> = { fresh: <BowlIcon />, svc: <BrushIcon />, mkt: <BagIcon /> };
  const hc = handoff && CARDS.find((c) => c.key === handoff.key);

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header right={<PassportChip pet={pet} />} />
      <main className={s.main}>
        <div className={s.intro}>
          {returning && <Badge>Welcome back, {pet.name}</Badge>}
          <h1 className={`dz-display ${s.h1}`}>What does <HighlightName>{pet.name}</HighlightName> need today?</h1>
          <p className={s.sub}>Pick one. You can always come back.</p>
        </div>
        <div className={s.cards}>
          {CARDS.map((c) => (
            <FlipCard
              key={c.key}
              ref={(el) => (wraps.current[c.key] = el)}
              className={s.card}
              style={mobile && flipped === c.key ? { height: "25rem" } : undefined}
              flipped={flipped === c.key}
              dimmed={!!flipped && flipped !== c.key}
              reduced={reduced}
              onToggle={() => toggle(c.key)}
              label={`${c.title}: ${desc[c.key]}. Flip for details`}
              frontStyle={{ background: c.bg, color: c.fg }}
              front={
                <span className={s.front} style={{ position: "absolute", inset: 0 }}>
                  <Badge size="sm" style={{ alignSelf: "flex-start", fontSize: "0.8125rem" }}>{c.badge}</Badge>
                  <span className={s.icon}>{icon[c.key]}</span>
                  <span className={s.title}>{c.title}</span>
                  <span className={s.desc}>{desc[c.key]}</span>
                </span>
              }
              back={back(c)}
            />
          ))}
        </div>
      </main>
      <SiteFooter />
      {hc && <div ref={handoffRef} role="presentation" className={s.handoff} style={{ background: hc.bg }} />}
    </div>
  );
}
