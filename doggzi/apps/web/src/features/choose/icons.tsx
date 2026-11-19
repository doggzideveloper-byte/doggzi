/** Line-art icons in the pets-trio style (cream fill, 2.4px ink, round caps). No emoji. */
const base = { viewBox: "0 0 120 100", "aria-hidden": true, fill: "var(--dz-cream)", stroke: "var(--dz-ink)", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round", style: { height: "100%", maxHeight: 140, width: "auto", overflow: "visible" } } as const;

export const BowlIcon = () => (
  <svg {...base}>
    <path d="M50 26c-4-5 4-8 0-14M62 24c-4-5 4-8 0-14M74 26c-4-5 4-8 0-14" fill="none" />
    <path d="M30 50c4-14 18-20 30-20s26 6 30 20" />
    <path d="M44 40c3-3 7-4 10-2M64 37c4-1 8 0 11 3" fill="none" />
    <path d="M42 84l-2 7h40l-2-7" />
    <path d="M20 52c2 20 18 32 40 32s38-12 40-32" />
    <ellipse cx="60" cy="52" rx="40" ry="7" />
    <path d="M50 66c1.5 3 4 4.5 6 3M64 69c2 1.5 4.5 0 6-3" fill="none" />
  </svg>
);
export const BrushIcon = () => (
  <svg {...base}>
    <path d="M77 44l26-12c3-1.5 6.5 0 7.5 3s-.5 6-3.5 7L81 54" />
    <rect x="16" y="34" width="66" height="26" rx="12" transform="rotate(-12 49 47)" />
    <path d="M24 64l-1 12M33 62l-1 13M42 60l-1 14M51 58l-1 14M60 56l-1 14M69 54l-1 13" fill="none" transform="rotate(-12 49 47)" />
    <path d="M30 22l2 6M24 26l5 3M38 20l0 6" fill="none" />
    <path d="M92 70c0-3 2.5-5 5-5s5 2 5 5c0 4-5 8-5 8s-5-4-5-8z" />
  </svg>
);
export const BagIcon = () => (
  <svg {...base}>
    <path d="M47 38c0-12 6-20 13-20s13 8 13 20" fill="none" />
    <path d="M30 36h60l-5 54H35z" />
    <path d="M47 38v4M73 38v4" fill="none" />
    <ellipse cx="60" cy="72" rx="8" ry="6.5" />
    <ellipse cx="49" cy="61" rx="3.6" ry="4.6" />
    <ellipse cx="56" cy="56" rx="3.6" ry="4.6" />
    <ellipse cx="64" cy="56" rx="3.6" ry="4.6" />
    <ellipse cx="71" cy="61" rx="3.6" ry="4.6" />
  </svg>
);
