import { useEffect, useRef, type CSSProperties } from "react";
import { isReduced } from "@/lib/reducedMotion";
import { css, ms } from "../motion";
import { parseTrio, wrapG } from "./petArt";

export interface TrioParts {
  svg: SVGSVGElement;
  puppy: SVGGElement;
  lab: SVGGElement;
  cat: SVGGElement;
  tail: SVGGElement;
}

interface Props {
  /** Signature move 1: paths draw themselves, then the cream fill fades in. */
  lineDraw?: boolean;
  lineDrawDelay?: number;
  onReady?: (parts: TrioParts) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * pets-trio inlined as live SVG (not <img>) with named groups: puppy, lab and cat, plus the cat's tail (#path70).
 * Groups are wrapped so they can hop / dim / swish without touching the artwork itself.
 */
export function PetsTrio({ lineDraw, lineDrawDelay = 200, onReady, className, style }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.replaceChildren();
    const svg = parseTrio();
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("aria-hidden", "true");
    svg.style.display = "block";
    svg.style.overflow = "visible";
    el.appendChild(svg);
    svg.querySelectorAll("[id]").forEach((n) => {
      n.setAttribute("data-id", n.id);
      n.removeAttribute("id");
    });
    const g = (k: string, o: string) => wrapG(svg.querySelector(`[data-id="${k}"]`)!, o);
    const parts: TrioParts = { svg, puppy: g("puppy", "50% 100%"), lab: g("lab", "50% 100%"), cat: g("cat", "50% 100%"), tail: g("path70", "0% 100%") };
    [parts.puppy, parts.lab, parts.cat].forEach((w) => (w.style.transition = `opacity ${ms.base}ms ${css.easeOut}`));

    const anims: Animation[] = [];
    if (lineDraw) {
      if (isReduced()) anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms.reduced }));
      else
        svg.querySelectorAll<SVGGeometryElement>("path,ellipse").forEach((p, i) => {
          const len = p.getTotalLength ? p.getTotalLength() : 0;
          p.style.strokeDasharray = String(len);
          p.style.strokeDashoffset = String(len);
          p.style.fillOpacity = "0";
          const a = p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 950, delay: lineDrawDelay + i * 3, easing: css.easeOut, fill: "forwards" });
          const f = p.animate([{ fillOpacity: 0 }, { fillOpacity: 1 }], { duration: ms.base, delay: lineDrawDelay + 700 + i * 2, easing: css.easeOut, fill: "forwards" });
          f.onfinish = () => {
            p.style.strokeDasharray = "";
            p.style.strokeDashoffset = "";
            p.style.fillOpacity = "";
            a.cancel();
            f.cancel();
          };
          anims.push(a, f);
        });
    }
    ready.current?.(parts);
    return () => anims.forEach((a) => a.cancel());
  }, [lineDraw, lineDrawDelay]);

  return <div ref={host} aria-hidden="true" className={className} style={{ aspectRatio: "864 / 492", ...style }} />;
}
