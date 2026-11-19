import { useEffect, type RefObject } from "react";
import { isReduced } from "@/lib/reducedMotion";
import { css } from "../motion";

/**
 * Scroll reveal (listItem, staggered, once): every `[data-ri]` inside `ref` rises 16px and fades in
 * the first time the section is on screen.
 */
export function useReveal(ref: RefObject<HTMLElement>, opts: { threshold?: number; maxStagger?: number; deps?: unknown[] } = {}) {
  const { threshold = 0.12, maxStagger = 8, deps = [] } = opts;
  useEffect(() => {
    const sec = ref.current;
    if (!sec || isReduced()) return;
    const els = [...sec.querySelectorAll<HTMLElement>("[data-ri]")];
    els.forEach((el) => (el.style.opacity = "0"));
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        els.forEach((el, i) => {
          el.style.opacity = "";
          el.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "translateY(0)" }], {
            duration: 550,
            delay: Math.min(i, maxStagger) * 60,
            easing: css.easeOut,
            fill: "backwards",
          });
        });
      },
      { threshold },
    );
    io.observe(sec);
    return () => {
      io.disconnect();
      els.forEach((el) => (el.style.opacity = ""));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
