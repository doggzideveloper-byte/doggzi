import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errMsg } from "@/lib/api";
import { beep } from "@/lib/format";
import { panelsFor, session, useSession, type Role } from "@/lib/session";
import { provider } from "./api";
import { Earnings } from "./Earnings";
import { Hours } from "./Hours";
import { Offers } from "./Offers";
import { Profile } from "./Profile";
import { Today } from "./Today";
import { MuteButton, Switch, UiProvider, useUi } from "./shared";
import s from "./pv.module.css";

type Tab = "offers" | "today" | "hours" | "earnings" | "profile";
const TABS: [Tab, string, string][] = [
  ["offers", "Offers", "M4 8h16v12H4zM8 8V5h8v3M12 12v4M10 14h4"],
  ["today", "Today", "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"],
  ["hours", "Hours", "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 8v4l3 2"],
  ["earnings", "Earnings", "M4 7h16v11H4zM4 11h16M8 15h3"],
  ["profile", "Profile", "M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8M5 20c1-4 4-6 7-6s6 2 7 6"],
];

function Panel() {
  const ses = useSession()!;
  const nav = useNavigate();
  const qc = useQueryClient();
  const { flash, muted } = useUi();
  const params = useParams();
  const tab = (TABS.some(([k]) => k === params.tab) ? params.tab : "today") as Tab;
  const go = (t: Tab) => { nav(`/provider/${t}`, { replace: true }); window.scrollTo(0, 0); };

  const me = useQuery({ queryKey: ["pv", "me"], queryFn: provider.me });
  const offers = useQuery({ queryKey: ["pv", "offers"], queryFn: provider.offers, refetchInterval: 10_000, refetchIntervalInBackground: true });
  const jobs = useQuery({ queryKey: ["pv", "jobs"], queryFn: () => provider.jobs(), refetchInterval: 30_000 });
  const online = me.data?.is_online ?? true;
  const setOnline = useMutation({
    mutationFn: (v: boolean) => provider.patch({ is_online: v }),
    onSuccess: (p) => { qc.setQueryData(["pv", "me"], p); qc.invalidateQueries({ queryKey: ["pv", "offers"] }); flash(p.is_online ? "You're online for offers." : "You're offline. Dispatch won't send offers."); },
    onError: (e) => flash(errMsg(e)),
  });

  // A new offer: ring, buzz, jump to Offers (and a system notification if the panel is in the background).
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const list = offers.data;
    if (!list) return;
    const ids = new Set(list.map((o) => o.id));
    if (seen.current) {
      const fresh = list.filter((o) => !seen.current!.has(o.id));
      if (fresh.length) {
        beep(muted);
        try { navigator.vibrate?.([120, 60, 120]); } catch { /* not supported */ }
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          navigator.serviceWorker?.getRegistration("/console/").then((r) => r?.showNotification("New Doggzi offer", { body: `${fresh[0].pet.name} · ${fresh[0].area}`, tag: "offer", icon: "/console/icon-192.png" }));
        }
        go("offers");
      }
    }
    seen.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers.data]);

  const panels = panelsFor(ses.user.roles);
  const first = ses.user.name.split(" ")[0];
  const help = `https://wa.me/${me.data?.help_whatsapp || ""}?text=${encodeURIComponent("Hi OPS, I need help with a job.")}`;
  const hasOffer = !!offers.data?.length;

  return (
    <div className={`${s.outer} wm-root`}>
      <div className={s.frame}>
        <header className={s.header}>
          <Link to="/" aria-label="Doggzi Console home" className={s.logo} />
          <div className={s.who}>
            <span className={s.name}>{ses.user.name}</span>
            <span className={`wm-chip ${s.roleChip}`}>Provider</span>
          </div>
          {panels.length > 1 && (
            <label style={{ display: "flex" }}>
              <span className="dz-sr-only">Switch panel</span>
              <select className={s.switcher} value="PROVIDER" onChange={(e) => { const p = panels.find((x) => x.role === e.target.value); if (p) { session.setRole(p.role as Role); nav(p.path); } }}>
                {[...panels].sort((a, b) => Number(b.role === "PROVIDER") - Number(a.role === "PROVIDER")).map((p) => <option key={p.role} value={p.role}>{p.label} panel</option>)}
              </select>
            </label>
          )}
          <MuteButton className={s.iconBtn} />
          <button type="button" className={s.pillBtn} onClick={() => { session.set(null); nav("/login", { replace: true }); }}>Log out</button>
        </header>

        <div className={s.avail} data-off={!online}>
          <span className={s.availText}><span aria-hidden="true" className={s.availDot} />{online ? "Online · receiving offers" : "Offline · no new offers"}</span>
          <span className={s.switchLbl}>
            <span id="go-offline">Go offline now</span>
            <Switch checked={!online} onChange={() => setOnline.mutate(!online)} label="Go offline now" />
          </span>
        </div>

        <main className={s.main}>
          {(me.isError || jobs.isError) && <p role="alert" className={s.err}>{errMsg(me.error || jobs.error, "We couldn't load your panel. Pull to refresh or try again.")}</p>}
          {tab === "offers" && <Offers offers={offers.data} online={online} demo={!!me.data?.demo} onAccepted={() => go("today")} />}
          {tab === "today" && <Today jobs={jobs.data} firstName={first} help={help} />}
          {tab === "hours" && <Hours />}
          {tab === "earnings" && <Earnings />}
          {tab === "profile" && <Profile me={me.data} />}
        </main>

        <nav aria-label="Provider sections" className={s.nav}>
          {TABS.map(([k, label, icon]) => (
            <button key={k} type="button" className={s.tab} aria-current={tab === k ? "page" : undefined} onClick={() => go(k)}>
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--dz-ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
              {label}
              {k === "offers" && hasOffer && tab !== "offers" && <span aria-hidden="true" className={s.badge} />}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default function ProviderApp() {
  return <UiProvider toastBottom="5rem"><Panel /></UiProvider>;
}
