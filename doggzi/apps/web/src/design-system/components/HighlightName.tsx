import { useEffect, useRef } from "react";
import { isReduced } from "@/lib/reducedMotion";
import { css, ms } from "../motion";

/**
 * The pet's name with a pink highlight that sweeps in from the left (Choose heading, reused on later pages).
 * `onView` waits until it scrolls into view.
 */
export function HighlightName({ children, delay = 380, onView = false, color = "var(--dz-pink)" }: { children: React.ReactNode; delay?: number; onView?: boolean; color?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const run = () =>
      isReduced()
        ? el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms.reduced, fill: "backwards" })
        : el.animate([{ transform: "rotate(-1.5deg) scaleX(0)" }, { transform: "rotate(-1.5deg) scaleX(1)" }], { duration: 520, delay, easing: css.easeOut, fill: "backwards" });
    if (!onView) {
      run();
      return;
    }
    el.style.opacity = "0";
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      el.style.opacity = "";
      run();
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [delay, onView]);
  return (
    <span style={{ position: "relative", display: "inline-block", padding: "0 .14em" }}>
      <span ref={ref} aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: ".12em", bottom: ".06em", background: color, borderRadius: 10, transformOrigin: "left center", transform: "rotate(-1.5deg)" }} />
      <span style={{ position: "relative" }}>{children}</span>
    </span>
  );
}
