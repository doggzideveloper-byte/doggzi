import { forwardRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import s from "./FlipCard.module.css";

interface Props {
  flipped: boolean;
  /** Another card is flipped: dim to 50% and shrink slightly. */
  dimmed: boolean;
  reduced: boolean;
  onToggle: () => void;
  front: ReactNode;
  back: ReactNode;
  frontStyle?: CSSProperties;
  className?: string;
  style?: CSSProperties;
  label?: string;
}

/**
 * Signature move 4: 3D rotateY flip (perspective 1200px, 0.6s), with a pointer tilt (≤6°) on desktop.
 * The front is a real button (Enter/Space flips); Escape flips back. Reduced motion cross-fades in place.
 */
export const FlipCard = forwardRef<HTMLDivElement, Props>(function FlipCard({ flipped, dimmed, reduced, onToggle, front, back, frontStyle, className, style, label }, ref) {
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || flipped || e.pointerType !== "mouse") return;
    const el = e.currentTarget, b = el.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width - 0.5, py = (e.clientY - b.top) / b.height - 0.5;
    el.style.transform = `translateY(-2px) rotateX(${(-py * 12).toFixed(2)}deg) rotateY(${(px * 12).toFixed(2)}deg)`;
    el.style.setProperty("--sh", "6px 6px 0 var(--dz-ink)");
  };
  const onLeave = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = "";
    e.currentTarget.style.removeProperty("--sh");
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && flipped) {
      e.stopPropagation();
      onToggle();
    }
  };
  return (
    <div ref={ref} className={`${s.wrap} ${reduced ? s.reduced : ""} ${className || ""}`} onKeyDown={onKey}
      style={{ opacity: dimmed ? 0.5 : 1, transform: `scale(${dimmed && !reduced ? 0.95 : 1})`, ...style }}>
      <div className={s.tilt} onPointerMove={onMove} onPointerLeave={onLeave} style={flipped ? { transform: "" } : undefined}>
        <div className={s.flip} style={{ transform: flipped && !reduced ? "rotateY(180deg)" : "none" }}>
          <button type="button" className={`${s.face} ${s.front}`} onClick={onToggle} aria-expanded={flipped} aria-label={label} tabIndex={flipped ? -1 : 0}
            style={{ opacity: reduced && flipped ? 0 : 1, pointerEvents: flipped ? "none" : "auto", ...frontStyle }}>
            {front}
          </button>
          <div className={`${s.face} ${s.back}`} aria-hidden={!flipped} onClick={(e) => { if (!(e.target as Element).closest("[data-continue]")) onToggle(); }}
            style={{ opacity: reduced ? (flipped ? 1 : 0) : 1, pointerEvents: flipped ? "auto" : "none" }}>
            {back}
          </div>
        </div>
      </div>
    </div>
  );
});
