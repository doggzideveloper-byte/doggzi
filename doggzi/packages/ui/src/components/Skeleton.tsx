import type { CSSProperties } from "react";
import s from "./Skeleton.module.css";

/** A grey placeholder block with a soft shimmer (static under reduced motion). Purely decorative. */
export function Skeleton({ w = "100%", h = "1rem", r, style, className }: { w?: string; h?: string; r?: string; style?: CSSProperties; className?: string }) {
  return <span aria-hidden="true" className={`${s.sk} ${className || ""}`} style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/** Card-shaped placeholder: a tile, two text lines and a button, matching product / service cards. */
export function SkeletonCard({ tile = "6 / 5", style }: { tile?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden="true" className={s.card} style={style}>
      <Skeleton h="auto" style={{ aspectRatio: tile }} r="var(--r-md)" />
      <Skeleton w="85%" h="0.875rem" />
      <Skeleton w="55%" h="0.875rem" />
      <Skeleton w="40%" h="1.25rem" />
      <Skeleton h="2.5rem" r="var(--r-pill)" />
    </div>
  );
}

/** Screen-reader text + a set of placeholders, so a loading region is announced once. */
export function Loading({ label, children, style, className }: { label: string; children: React.ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={className} style={style}>
      <span className="dz-sr-only">{label}</span>
      {children}
    </div>
  );
}
