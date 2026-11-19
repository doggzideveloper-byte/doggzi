import { forwardRef, type ReactNode, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { isReduced } from "@/lib/reducedMotion";
import { css, keyframes } from "../motion";
import s from "./Header.module.css";

const wobble = (e: MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => {
  if (isReduced()) return;
  const a = e.currentTarget as HTMLElement & { _w?: Animation };
  if (a._w && a._w.playState === "running") return;
  a._w = a.animate(keyframes.wobble, { duration: 480, easing: css.bouncy });
};

interface Props {
  /** Right side. The 190px slot is always reserved so nothing shifts when the passport chip lands. */
  right?: ReactNode;
  onLogoClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  /** Header background, e.g. the section colour while a handoff fades out. */
  bg?: string;
}

/** Logo mark on a sticker disc (the mark's cream badge disappears on cream otherwise), passport chip slot right. */
export const Header = forwardRef<HTMLDivElement, Props>(function Header({ right, onLogoClick, bg }, slotRef) {
  return (
    <header className={s.header} style={bg ? ({ ["--hdr-bg" as string]: bg } as React.CSSProperties) : undefined}>
      <div className={s.inner}>
        <Link to="/" aria-label="Doggzi home" className={s.logo} onMouseEnter={wobble} onFocus={wobble} onClick={onLogoClick}>
          <img src="/brand/logo/doggzi-mark.svg" alt="" />
        </Link>
        <div ref={slotRef} className={s.right}>
          {right}
        </div>
      </div>
    </header>
  );
});
