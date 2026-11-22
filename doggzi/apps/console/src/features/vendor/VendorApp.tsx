import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errMsg } from "@/lib/api";
import { beep, istTime } from "@/lib/format";
import { panelsFor, session, useSession, type Role } from "@/lib/session";
import { MuteButton, UiProvider, useUi } from "../common/ui";
import { vendor } from "./api";
import { Help } from "./Help";
import { Orders } from "./Orders";
import { Payouts } from "./Payouts";
import { Products } from "./Products";
import { Store } from "./Store";
import s from "./vd.module.css";

type Tab = "orders" | "products" | "payouts" | "store" | "help";
const TABS: [Tab, string, string][] = [
  ["orders", "Orders", "M5 8h14l-1.5 12h-11zM9 8a3 3 0 0 1 6 0"],
  ["products", "Products", "M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10"],
  ["payouts", "Payouts", "M4 7h16v11H4zM4 11h16M8 15h3"],
  ["store", "Store profile", "M3 10l2-6h14l2 6M4 10h16v10H4zM10 20v-5h4v5"],
  ["help", "Help", "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"],
];

function Panel() {
  const ses = useSession()!;
  const nav = useNavigate();
  const { flash, muted } = useUi();
  const params = useParams();
  const tab = (TABS.some(([k]) => k === params.tab) ? params.tab : "orders") as Tab;
  const go = (t: Tab) => { nav(`/vendor/${t}`, { replace: true }); window.scrollTo(0, 0); };
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const store = useQuery({ queryKey: ["vd", "store"], queryFn: vendor.store });
  const orders = useQuery({ queryKey: ["vd", "orders"], queryFn: vendor.orders, refetchInterval: 10_000, refetchIntervalInBackground: true });
  const listings = useQuery({ queryKey: ["vd", "listings"], queryFn: vendor.listings, enabled: tab !== "products" });

  // New order: ring once, wiggle the card (Orders), toast; system notification if the tab is in the background.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const list = orders.data;
    if (!list) return;
    const placed = list.filter((o) => o.status === "placed");
    if (seen.current) {
      const nw = placed.filter((o) => !seen.current!.has(o.id));
      if (nw.length) {
        beep(muted);
        setFresh(new Set(nw.map((o) => o.id)));
        flash(`New order ${nw[0].ref}${nw[0].pet ? ` for ${nw[0].pet.name}` : ""}.`);
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          navigator.serviceWorker?.getRegistration("/console/").then((r) => r?.showNotification("New Doggzi order", { body: `${nw[0].ref} · ${nw[0].items.length} item(s)`, tag: "order", icon: "/console/icon-192.png" }));
        }
      }
    }
    seen.current = new Set(list.map((o) => o.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.data]);

  const panels = panelsFor(ses.user.roles);
  const st = store.data;
  const newCount = orders.data?.filter((o) => o.status === "placed").length || 0;
  const lowCount = (listings.data || []).filter((l) => l.stock_qty < (st?.low_stock_threshold ?? 5)).length;
  const counts: Partial<Record<Tab, [number, boolean]>> = { orders: [newCount, newCount > 0], products: [lowCount, false] };

  return (
    <div className={`${s.root} wm-root wm-pink`}>
      <header className={s.header}>
        <div className={s.bar}>
          <Link to="/" aria-label="Doggzi Console home" className={s.logo} />
          <div className={s.brandBlock}>
            <span className={s.storeName}>{st?.name || "Your store"}</span>
            <span className={s.sub}>Vendor console · {istTime(new Date(now))} IST</span>
          </div>
          <div className={s.ctrls}>
            <span className={s.who}>{ses.user.name}<span className={`wm-chip ${s.roleChip}`}>Vendor</span></span>
            {panels.length > 1 && (
              <label style={{ display: "flex" }}>
                <span className="dz-sr-only">Switch panel</span>
                <select className={s.switcher} value="VENDOR" onChange={(e) => { const p = panels.find((x) => x.role === e.target.value); if (p) { session.setRole(p.role as Role); nav(p.path); } }}>
                  {[...panels].sort((a, b) => Number(b.role === "VENDOR") - Number(a.role === "VENDOR")).map((p) => <option key={p.role} value={p.role}>{p.label} panel</option>)}
                </select>
              </label>
            )}
            <MuteButton className={s.iconBtn} />
            <button type="button" className={s.pillBtn} onClick={() => { session.set(null); nav("/login", { replace: true }); }}>Log out</button>
          </div>
        </div>
        {st?.holiday_mode && <p role="status" className={s.holiday}>Holiday mode is on. Your listings are hidden from the Marketplace.</p>}
      </header>
      <div className={s.shell}>
        <nav aria-label="Vendor sections" className={s.nav}>
          {TABS.map(([k, label, icon]) => {
            const c = counts[k];
            return (
              <button key={k} type="button" className={s.tab} aria-current={tab === k ? "page" : undefined} onClick={() => go(k)}>
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--dz-ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
                <span>{label}</span>
                {c && c[0] > 0 && <span className={s.count} data-hot={c[1]} aria-label={`${c[0]} ${k === "orders" ? "new" : "low stock"}`}>{c[0]}</span>}
              </button>
            );
          })}
        </nav>
        <main className={s.main}>
          {(store.isError || orders.isError) && <p role="alert" className={s.err}>{errMsg(store.error || orders.error, "We couldn't load your store. Try again.")}</p>}
          {tab === "orders" && <Orders orders={orders.data} acceptMinutes={st?.accept_minutes ?? 10} fresh={fresh} demo={!!st?.demo} />}
          {tab === "products" && <Products store={st} holiday={!!st?.holiday_mode} />}
          {tab === "payouts" && <Payouts />}
          {tab === "store" && <Store store={st} />}
          {tab === "help" && <Help whatsapp={st?.help_whatsapp} />}
        </main>
      </div>
    </div>
  );
}

export default function VendorApp() {
  return <UiProvider><Panel /></UiProvider>;
}
