import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SITE, waLink } from "@/content/site-config";
import { useNarrow } from "@/lib/device";
import { isReduced } from "@/lib/reducedMotion";
import { css, keyframes } from "../motion";
import { PetsTrio, type TrioParts } from "./PetsTrio";
import s from "./SiteFooter.module.css";

const COLS: { key: string; title: string; links: [string, string][] }[] = [
  { key: "explore", title: "Explore", links: [["Fresh Food", "/fresh-food"], ["Services", "/services"], ["Marketplace", "/marketplace"], ["How it works", "/explore#how-it-works"], ["FAQ", "/explore#faq"]] },
  // TODO: About, Careers, Partner with us and Contact pages don't exist yet.
  { key: "company", title: "Company", links: [["About", "#"], ["Careers", "#"], ["Partner with us", "#"], ["Contact", "#"]] },
  { key: "help", title: "Get help", links: [] },
];

/** Ink block with a scalloped top; the trio peeks over the edge and pops up when the footer scrolls in. */
export function SiteFooter() {
  const root = useRef<HTMLElement>(null);
  const peek = useRef<HTMLDivElement>(null);
  const narrow = useNarrow(740, 780);
  const [open, setOpen] = useState<string | null>(null);
  const [parts, setParts] = useState<TrioParts | null>(null);

  useEffect(() => {
    if (!parts) return;
    const cleanups: (() => void)[] = [];
    (["puppy", "lab"] as const).forEach((k) => {
      const g = parts[k] as SVGGElement & { _h?: Animation };
      g.style.cursor = "pointer";
      const hop = () => {
        if (isReduced() || (g._h && g._h.playState === "running")) return;
        g._h = g.animate([{ transform: "none" }, { transform: "translateY(-14px)", offset: 0.4 }, { transform: "none", offset: 0.75 }, { transform: "translateY(-3px)", offset: 0.88 }, { transform: "none" }], { duration: 520, easing: "ease-out" });
      };
      g.addEventListener("pointerenter", hop);
      g.addEventListener("pointerdown", hop);
      cleanups.push(() => {
        g.removeEventListener("pointerenter", hop);
        g.removeEventListener("pointerdown", hop);
      });
    });
    const host = peek.current;
    if (host && root.current && !isReduced()) {
      host.style.transform = "translateY(42%)";
      const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        host.animate([{ transform: "translateY(42%)" }, { transform: "none" }], { duration: 700, easing: css.bouncy, fill: "forwards" }).onfinish = () => (host.style.transform = "");
        parts.tail.animate(keyframes.tailSwish, { duration: 900, delay: 500, easing: "ease-in-out" });
      }, { threshold: 0.15 });
      io.observe(root.current);
      cleanups.push(() => io.disconnect());
    }
    return () => cleanups.forEach((c) => c());
  }, [parts]);

  return (
    <footer ref={root} className={`${s.footer} ${narrow ? s.narrow : ""}`}>
      <div ref={peek} className={s.peek}>
        <PetsTrio onReady={setParts} />
      </div>
      <div className={s.body}>
        <div aria-hidden="true" className={s.scallop} />
        <div className={s.ink}>
          <div className={s.grid}>
            <div className={s.brand}>
              <Link to="/" aria-label="Doggzi home">
                <img src="/brand/logo/doggzi-wordmark.svg" alt="Doggzi" width={230} height={75} loading="lazy" />
              </Link>
              <p className={s.tag}>Not just food. Their food.</p>
              <p className={s.area}>{SITE.serviceArea}</p>
            </div>
            {COLS.map((c) => {
              const isOpen = !narrow || open === c.key;
              return (
                <div key={c.key} className={s.col}>
                  <button type="button" className={s.colHead} aria-expanded={isOpen} disabled={!narrow} onClick={() => narrow && setOpen((o) => (o === c.key ? null : c.key))}>
                    <span>{c.title}</span>
                    <span aria-hidden="true" className={s.chev} style={{ transform: `rotate(${open === c.key ? 45 : 0}deg)` }}>+</span>
                  </button>
                  {isOpen && (
                    <ul className={s.list}>
                      {c.links.map(([label, href]) => (
                        <li key={label}>
                          {href.startsWith("/") ? <Link className={s.link} to={href}>{label}</Link> : <a className={s.link} href={href}>{label}</a>}
                        </li>
                      ))}
                      {c.key === "help" && (
                        <li style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <a className={s.wa} href={waLink()} target="_blank" rel="noopener noreferrer">
                            <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19.2z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8c-1-.4-1.9-1.3-2.3-2.3l.8-1-1-2z" /></svg>
                            WhatsApp us
                          </a>
                          <a className={s.link} href={`mailto:${SITE.email}`}>{SITE.email}</a>
                          <a className={s.link} href={`tel:${SITE.phone.replace(/\s/g, "")}`}>{SITE.phone}</a>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          <div className={s.bottom}>
            <div className={s.bar}>
              <div className={s.legal}>
                <span>© {new Date().getFullYear()} {SITE.company}</span>
                <span>{SITE.city}</span>
                {/* TODO: legal pages */}
                <a className={s.link} href="#">Privacy</a>
                <a className={s.link} href="#">Terms</a>
                <a className={s.link} href="#">Refunds</a>
                {SITE.fssai && <span>FSSAI Lic. No. {SITE.fssai}</span>}
              </div>
              <div className={s.social}>
                <a href={SITE.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Doggzi on Instagram">
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--dz-cream)" strokeWidth="2" strokeLinecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".6" fill="var(--dz-cream)" /></svg>
                </a>
                <a href={SITE.social.youtube} target="_blank" rel="noopener noreferrer" aria-label="Doggzi on YouTube">
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--dz-cream)" strokeWidth="2" strokeLinejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="M10 9.2v5.6l4.8-2.8z" fill="var(--dz-cream)" /></svg>
                </a>
                <a href={SITE.social.linkedin} target="_blank" rel="noopener noreferrer" aria-label="Doggzi on LinkedIn">
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--dz-cream)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8 10.5V16M8 7.8v.1M11.5 16v-5.5M11.5 13c0-1.5 1-2.5 2.3-2.5S16 11.3 16 13v3" /></svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
