// Doggzi motion tokens: import from here, never inline timings in feature code.
import type { Transition, Variants } from "motion/react";

export const ease = { out: [0.22, 1, 0.36, 1] as const };
export const dur = { fast: 0.18, base: 0.35, slow: 0.7 };
export const stagger = 0.06;

export const spring: Record<"bouncy" | "soft", Transition> = {
  bouncy: { type: "spring", stiffness: 420, damping: 22 },
  soft: { type: "spring", stiffness: 160, damping: 24 },
};

/** 1. Line-draw reveal for line-art SVG paths */
export const lineDraw: Variants = {
  hidden: { pathLength: 0, fillOpacity: 0 },
  show: (i: number = 0) => ({
    pathLength: 1,
    fillOpacity: 1,
    transition: {
      pathLength: { duration: 1.1, ease: ease.out, delay: i * 0.04 },
      fillOpacity: { duration: dur.base, delay: 0.9 + i * 0.04 },
    },
  }),
};

/** 2. Sticker press: spread onto a motion.button */
export const stickerPress = {
  whileHover: { y: -2, boxShadow: "6px 6px 0 var(--dz-ink)" },
  whileTap: { y: 4, x: 4, boxShadow: "0px 0px 0 var(--dz-ink)" },
  transition: spring.bouncy,
};

/** 3. Stamp for confirmations */
export const stamp: Variants = {
  hidden: { scale: 1.4, rotate: -8, opacity: 0 },
  show: { scale: 1, rotate: -3, opacity: 1, transition: spring.bouncy },
};

/** 6. Page transition */
export const page: Variants = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: spring.soft },
  exit: { opacity: 0, y: -12, transition: { duration: dur.fast, ease: ease.out } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { ...spring.soft, delay: i * stagger } }),
};
