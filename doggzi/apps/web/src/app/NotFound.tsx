import { Badge, ButtonLink, Header, PassportChip, SiteFooter } from "@/design-system/components";
import { usePet } from "@/lib/passport";

export default function NotFound() {
  const { pet } = usePet();
  return (
    <div style={{ minHeight: "100vh" }}>
      <Header right={pet && <PassportChip pet={pet} pop={false} />} />
      <main className="dz-container" style={{ maxWidth: 760, padding: "72px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
        <Badge>404</Badge>
        <h1 className="dz-display" style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)" }}>This page went for a walk</h1>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6 }}>Let's get you back to somewhere useful.</p>
        <ButtonLink to={pet ? "/choose" : "/"} variant="secondary">← {pet ? "Back to choices" : "Make a passport"}</ButtonLink>
      </main>
      <SiteFooter />
    </div>
  );
}
