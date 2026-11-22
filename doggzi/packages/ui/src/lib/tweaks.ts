import { createStore } from "./store";

/**
 * Preview switches from the Claude Design prototypes ("Tweaks" panel).
 * Shown in dev, or in any build with ?tweaks=1. They never change what a real visitor sees by default.
 */
export type DemoPet = "saved" | "dog" | "cat";
export type Device = "Auto" | "iOS" | "Android" | "Desktop";
export interface Tweaks {
  forceReducedMotion: boolean;
  demoPet: DemoPet;
  /** null = use content/fresh-food.ts */
  catsSupported: boolean | null;
  device: Device;
}
export const DEFAULT_TWEAKS: Tweaks = { forceReducedMotion: false, demoPet: "saved", catsSupported: null, device: "Auto" };
export const tweaksStore = createStore<Tweaks>("dz.tweaks", DEFAULT_TWEAKS);
export const useTweaks = (): Tweaks => ({ ...DEFAULT_TWEAKS, ...tweaksStore.use() });
export const setTweak = <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => tweaksStore.set((t) => ({ ...DEFAULT_TWEAKS, ...t, [k]: v }));

export function tweaksEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    if (new URLSearchParams(window.location.search).get("tweaks") === "1") sessionStorage.setItem("dz.tweaksOn", "1");
    return sessionStorage.getItem("dz.tweaksOn") === "1";
  } catch {
    return false;
  }
}
