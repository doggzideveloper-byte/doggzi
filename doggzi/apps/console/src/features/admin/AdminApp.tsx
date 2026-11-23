import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { istTime } from "@/lib/format";
import { panelsFor, session, useSession, type Role } from "@/lib/session";
import { MuteButton, UiProvider } from "../common/ui";
import { adm } from "./api";
import { Bookings, Pipeline } from "./Boards";
import { Content } from "./Content";
import { AdminKit } from "./kit";
import { Overview } from "./Overview";
import { Audit, Catalog, Customers, Orders, Payments, Team } from "./Tables";
import s from "./adm.module.css";

type Mod = "today" | "bookings" | "orders" | "catalog" | "vendors" | "providers" | "customers" | "payments" | "content" | "team" | "audit";
/** [key, label, swatch, OPS can open]. OPS sees Vendors / Providers read-only (PANEL_ADMIN: "ADMIN full, OPS view"). */
const MODULES: [Mod, string, string, boolean][] = [
  ["today", "Overview", "var(--dz-cream)", true], ["bookings", "Bookings", "var(--dz-green)", true], ["orders", "Orders", "var(--dz-pink)", true],
  ["catalog", "Catalog", "var(--dz-ink)", false], ["vendors", "Vendors", "var(--dz-pink)", true], ["providers", "Providers", "var(--dz-green)", true],
  ["customers", "Customers", "var(--dz-cream)", true], ["payments", "Payments", "var(--dz-ink)", false], ["content", "Content", "var(--dz-orange)", false],
  ["team", "Team", "var(--dz-ink)", false], ["audit", "Audit log", "var(--dz-ink)", false],
];

function Panel() {
  const ses = useSession()!;
  const nav = useNavigate();
  const params = useParams();
  const isAdmin = ses.user.roles.includes("ADMIN");
  const allowed = MODULES.filter((m) => isAdmin || m[3]);
  const mod = (allowed.some(([k]) => k === params.mod) ? params.mod : "today") as Mod;
  const [menu, setMenu] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!menu) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [menu]);
  const go = (k: string) => { nav(`/admin/${k}`); setMenu(false); window.scrollTo(0, 0); };
  // Overdue badge on Overview (shares the Overview query cache when it is open).
  const od = useQuery({ queryKey: ["ad", "overdue-badge"], queryFn: () => adm.overview({ key: "today" }), refetchInterval: 60_000, enabled: mod !== "today", select: (d) => d.overdue.length });
  const role: Role = isAdmin ? "ADMIN" : "OPS";
  const panels = panelsFor(ses.user.roles);
  const title = MODULES.find((m) => m[0] === mod)![1];
  const nav_ = (
    <>
      {allowed.map(([k, l, c]) => (
        <button key={k} type="button" className={s.mod} aria-current={mod === k ? "page" : undefined} onClick={() => go(k)}>
          <span className={s.swatch} style={{ background: c }} aria-hidden="true" /><span>{l}</span>
          {k === "today" && !!od.data && <span className={s.badge} aria-label={`${od.data} overdue`}>{od.data}</span>}
        </button>
      ))}
      <span className={s.scope}>{isAdmin ? "ADMIN · every write is recorded in the audit log." : "OPS · operations modules; Vendors and Providers are view only. Customer phones are masked."}</span>
    </>
  );

  return (
    <AdminKit isAdmin={isAdmin}>
      <div className={`${s.root} wm-root`}>
        <header className={s.header}>
          <div className={s.bar}>
            <button type="button" className={s.menuBtn} aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--dz-ink)" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
            <Link to="/" aria-label="Doggzi Console home" className={s.logo} />
            <div className={s.brandBlock}>
              <span className={s.title}>{title}</span>
              <span className={s.sub}>Doggzi Console · {istTime(new Date(now))} IST</span>
            </div>
            <div className={s.ctrls}>
              <span className={s.who}>{ses.user.name}<span className={`wm-chip ${s.roleChip}`}>{role}</span></span>
              {panels.length > 1 && (
                <label style={{ display: "flex" }}>
                  <span className="dz-sr-only">Switch panel</span>
                  <select className={s.switcher} value={role} onChange={(e) => { const p = panels.find((x) => x.role === e.target.value); if (p && p.path !== "/admin") { session.setRole(p.role as Role); nav(p.path); } }}>
                    {[...panels].sort((a, b) => Number(b.path === "/admin") - Number(a.path === "/admin")).map((p) => <option key={p.role} value={p.path === "/admin" ? role : p.role}>{p.label} panel</option>)}
                  </select>
                </label>
              )}
              <MuteButton className={s.iconBtn} />
              <button type="button" className={s.pillBtn} onClick={() => { session.set(null); nav("/login", { replace: true }); }}>Log out</button>
            </div>
          </div>
        </header>
        <div className={s.shell}>
          <nav aria-label="Admin modules" className={s.nav}>{nav_}</nav>
          <main className={s.main}>
            {mod === "today" && <Overview go={go} />}
            {mod === "bookings" && <Bookings />}
            {mod === "orders" && <Orders />}
            {mod === "catalog" && <Catalog />}
            {mod === "vendors" && <Pipeline key="v" kind="vendors" />}
            {mod === "providers" && <Pipeline key="p" kind="providers" />}
            {mod === "customers" && <Customers />}
            {mod === "payments" && <Payments />}
            {mod === "content" && <Content />}
            {mod === "team" && <Team />}
            {mod === "audit" && <Audit />}
          </main>
        </div>
        {menu && (
          <div className={s.sheetBg} onClick={(e) => e.target === e.currentTarget && setMenu(false)}>
            <nav aria-label="Admin modules" className={s.sheetNav}>{nav_}</nav>
          </div>
        )}
      </div>
    </AdminKit>
  );
}

export default function AdminApp() {
  return <UiProvider><Panel /></UiProvider>;
}
