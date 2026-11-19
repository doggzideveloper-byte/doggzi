import { useEffect, useRef, type RefObject } from "react";
import { isReduced } from "@/lib/reducedMotion";
import { css } from "../motion";

/**
 * Page-level scroll reveal: each `[data-reveal]` section fades its `[data-ri]` children up (staggered, once),
 * sweeps any `[data-sweep]` pink highlight and draws a `[data-line]` connector. `onReveal(section)` lets a page
 * start section-specific motion (e.g. the kibble slider hint). Pass `deps` when sections mount conditionally.
 */
export function useSectionReveals(root: RefObject<HTMLElement>, opts: { narrow?: boolean; onReveal?: (sec: Element) => void; deps?: unknown[] } = {}) {
  const narrow = useRef(!!opts.narrow);
  narrow.current = !!opts.narrow;
  const onReveal = useRef(opts.onReveal);
  onReveal.current = opts.onReveal;
  useEffect(() => {
    const r = root.current;
    if (!r || isReduced()) return;
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          e.target.querySelectorAll<HTMLElement>("[data-ri]").forEach((el, i) => {
            el.style.opacity = "";
            el.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 550, delay: Math.min(i, 8) * 60, easing: css.easeOut, fill: "backwards" });
          });
          e.target.querySelectorAll<HTMLElement>("[data-sweep]").forEach((el) =>
            el.animate([{ transform: "rotate(-1.5deg) scaleX(0)" }, { transform: "rotate(-1.5deg) scaleX(1)" }], { duration: 520, delay: 380, easing: css.easeOut, fill: "backwards" }),
          );
          const line = e.target.querySelector<HTMLElement>("[data-line]");
          if (line) {
            const ax = narrow.current ? "scaleY" : "scaleX";
            line.style.transform = "";
            line.animate([{ transform: `${ax}(0)` }, { transform: `${ax}(1)` }], { duration: 1100, delay: 200, easing: css.easeOut, fill: "backwards" });
          }
          onReveal.current?.(e.target);
        }),
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" },
    );
    const secs = [...r.querySelectorAll<HTMLElement>("[data-reveal]")].filter((s) => !s.dataset.revealed);
    secs.forEach((sec) => {
      sec.dataset.revealed = "1";
      sec.querySelectorAll<HTMLElement>("[data-ri]").forEach((el) => (el.style.opacity = "0"));
      const line = sec.querySelector<HTMLElement>("[data-line]");
      if (line) line.style.transform = narrow.current ? "scaleY(0)" : "scaleX(0)";
      io.observe(sec);
    });
    return () => {
      io.disconnect();
      // Anything not yet revealed becomes visible again if we re-run (deps change / unmount).
      secs.forEach((sec) => {
        delete sec.dataset.revealed;
        sec.querySelectorAll<HTMLElement>("[data-ri]").forEach((el) => (el.style.opacity = ""));
        const line = sec.querySelector<HTMLElement>("[data-line]");
        if (line) line.style.transform = "";
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, opts.deps ?? []);
}

/** Pink highlight behind a word, swept in by useSectionReveals. */
export function Sweep({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ position: "relative", display: "inline-block", padding: "0 .14em" }}>
      <span data-sweep="" aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: ".12em", bottom: ".06em", background: "var(--dz-pink)", borderRadius: 10, transformOrigin: "left center", transform: "rotate(-1.5deg)" }} />
      <span style={{ position: "relative" }}>{children}</span>
    </span>
  );
}
