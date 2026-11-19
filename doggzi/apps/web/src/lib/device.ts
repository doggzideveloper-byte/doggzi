import { useEffect, useState } from "react";
import { useTweaks, type Device } from "./tweaks";

export function detectDevice(): Exclude<Device, "Auto"> {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  return "Desktop";
}
export function useDevice(): Exclude<Device, "Auto"> {
  const t = useTweaks();
  return t.device === "Auto" ? detectDevice() : t.device;
}

/** Width switch with hysteresis so scrollbars appearing can't flip a layout back and forth. */
export function useNarrow(below: number, above: number): boolean {
  const [narrow, setNarrow] = useState(() => (typeof window === "undefined" ? false : window.innerWidth < below));
  useEffect(() => {
    const on = () =>
      setNarrow((cur) => {
        const w = window.innerWidth;
        return cur ? w < above : w < below;
      });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [below, above]);
  return narrow;
}
