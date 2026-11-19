import { useEffect, useSyncExternalStore } from "react";
import { tweaksStore, DEFAULT_TWEAKS } from "./tweaks";

const mq = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

/** Non-hook check for imperative animation code (WAAPI callbacks, observers). */
export function isReduced(): boolean {
  const t = { ...DEFAULT_TWEAKS, ...tweaksStore.get() };
  return !!t.forceReducedMotion || !!mq?.matches;
}

const subscribe = (cb: () => void) => {
  mq?.addEventListener("change", cb);
  const un = tweaksStore.subscribe(cb);
  return () => {
    mq?.removeEventListener("change", cb);
    un();
  };
};

/** True when the OS asks for reduced motion or the Tweaks panel forces it. */
export function useReduced(): boolean {
  const r = useSyncExternalStore(subscribe, isReduced, () => false);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(r);
  }, [r]);
  return r;
}
