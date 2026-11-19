import { useSyncExternalStore } from "react";

/** Tiny localStorage-backed store with cross-tab sync. Reads/writes never throw. */
export function createStore<T>(key: string, fallback: T, storage: () => Storage = () => localStorage) {
  let cache: T | undefined;
  const listeners = new Set<() => void>();
  const read = (): T => {
    if (cache !== undefined) return cache;
    try {
      const raw = storage().getItem(key);
      cache = raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      cache = fallback;
    }
    return cache;
  };
  const emit = () => listeners.forEach((l) => l());
  const set = (next: T | ((prev: T) => T)) => {
    const value = typeof next === "function" ? (next as (p: T) => T)(read()) : next;
    cache = value;
    try {
      if (value === null || value === undefined) storage().removeItem(key);
      else storage().setItem(key, JSON.stringify(value));
    } catch {
      /* private mode: keep the in-memory copy */
    }
    emit();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === key) {
        cache = undefined;
        emit();
      }
    });
  }
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const use = () => useSyncExternalStore(subscribe, read, () => fallback);
  return { get: read, set, use, subscribe };
}
