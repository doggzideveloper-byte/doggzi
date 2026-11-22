import { useEffect, useRef, type CSSProperties } from "react";
import { avatarVariant, type AvatarVariant, type PetType } from "../lib/pet";
import { isReduced } from "../lib/reducedMotion";
import { css, ms } from "../motion";
import { AVATAR_VIEWBOX, SPRITE_ID } from "./petArt";
import s from "./PetAvatar.module.css";

interface Props {
  type?: PetType | null;
  breed?: string | null;
  variant?: AvatarVariant | null;
  /** Diameter in CSS px at the default root size (rendered in rem so it follows --root-scale). */
  size: number;
  border?: number;
  bg?: string;
  /** Cross-fade when the variant changes (Page 1 breed picker). */
  animate?: boolean;
  placeholder?: string;
  style?: CSSProperties;
  className?: string;
}

/** PetAvatar: photo → breed default → generic dog/cat. Breed art isn't drawn yet, so it crops pets-trio. */
export function PetAvatar({ type, breed, variant, size, border = 2, bg = "var(--dz-cream)", animate, placeholder, style, className }: Props) {
  const v = variant ?? avatarVariant(type, breed);
  const svgRef = useRef<SVGSVGElement>(null);
  const prev = useRef(v);
  useEffect(() => {
    if (animate && prev.current !== v && svgRef.current) {
      svgRef.current.animate([{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "none" }], {
        duration: isReduced() ? ms.reduced : ms.base,
        easing: css.easeOut,
      });
    }
    prev.current = v;
  }, [v, animate]);
  return (
    <span className={`${s.frame} ${className || ""}`} style={{ width: `${size / 16}rem`, height: `${size / 16}rem`, borderWidth: border, background: bg, ...style }}>
      {v ? (
        <svg ref={svgRef} viewBox={AVATAR_VIEWBOX[v]} className={s.art} aria-hidden="true">
          <use href={`#${SPRITE_ID[v]}`} />
        </svg>
      ) : (
        placeholder && <span className={s.ph} style={{ fontSize: `${(size * 0.42) / 16}rem` }}>{placeholder}</span>
      )}
    </span>
  );
}
