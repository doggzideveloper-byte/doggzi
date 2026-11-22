import type { HTMLAttributes } from "react";
import s from "./Badge.module.css";

export type BadgeTone = "paper" | "cream" | "pink" | "green" | "orange" | "ink" | "draft" | "onDark";
/** Atma uppercase sticker label. `draft` marks copy that still needs sign-off. */
export function Badge({ tone = "paper", size, className, ...rest }: { tone?: BadgeTone; size?: "sm" | "xs" } & HTMLAttributes<HTMLSpanElement>) {
  return <span className={[s.badge, tone !== "paper" && s[tone], size && s[size], className].filter(Boolean).join(" ")} {...rest} />;
}
