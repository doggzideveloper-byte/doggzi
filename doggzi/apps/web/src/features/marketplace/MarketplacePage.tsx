import { useEffect, useRef } from "react";
import { Badge, ButtonLink, Header, PassportChip, SiteFooter } from "@/design-system/components";
import { useFrom, usePet } from "@/lib/passport";
import { isReduced } from "@/lib/reducedMotion";
import { css, ms } from "@/design-system/motion";

/** /marketplace is the next page to be specced (Page 05). Until then it's a pink holding page. Also the 404. */
export default function MarketplacePage({ notFound = false }: { notFound?: boolean }) {
  const { pet } = usePet();
  const cover = useRef<HTMLDivElement>(null);
  const cameFrom = useFrom();
  useEffect(() => {
    const el = cover.current;
    if (!el) return;
    if (cameFrom !== "choose-market") return void (el.style.display = "none");
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: isReduced() ? ms.reduced : 600, delay: isReduced() ? 0 : 150, easing: css.easeOut, fill: "forwards" }).onfinish = () => (el.style.display = "none");
  }, [cameFrom]);
  return (
    <div style={{ minHeight: "100vh", background: notFound ? undefined : "var(--section-market)" }}>
      <Header bg={notFound ? undefined : "var(--section-market)"} right={pet && <PassportChip pet={pet} pop={false} />} />
      <main className="dz-container" style={{ maxWidth: 760, padding: "72px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
        <Badge>{notFound ? "404" : "Coming soon"}</Badge>
        <h1 className="dz-display" style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)" }}>
          {notFound ? "This page went for a walk" : pet ? `Shop for ${pet.name}` : "Marketplace"}
        </h1>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6, maxWidth: "36ch" }}>
          {notFound ? "Let's get you back to somewhere useful." : "Food, toys and gear from verified local stores near you. We're stocking the shelves."}
        </p>
        <ButtonLink to={pet ? "/choose" : "/"} variant="secondary">← {pet ? "Back to choices" : "Make a passport"}</ButtonLink>
      </main>
      <SiteFooter />
      <div ref={cover} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 40, background: "var(--section-market)", pointerEvents: "none" }} />
    </div>
  );
}
