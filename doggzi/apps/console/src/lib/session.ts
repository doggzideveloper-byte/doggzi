import { useSyncExternalStore } from "react";

/** Console session (12 hours). The app reads `user.id`, never `sub`. */
export type Role = "ADMIN" | "OPS" | "PROVIDER" | "VENDOR";
export interface ConsoleUser { id: string; phone: string; name: string; roles: Role[] }
export interface Session { token: string; user: ConsoleUser; role: Role; expires_at: number }

const KEY = "dz.console.session";
const subs = new Set<() => void>();
let cache: Session | null | undefined;

function read(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null") as Session | null;
    if (!s || !s.token || !s.expires_at || s.expires_at < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export const session = {
  get(): Session | null {
    if (cache === undefined) cache = read();
    if (cache && cache.expires_at < Date.now()) cache = null;
    return cache;
  },
  set(s: Session | null) {
    cache = s;
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch {
      /* private mode: session lives in memory only */
    }
    subs.forEach((f) => f());
  },
  setRole(role: Role) {
    const s = session.get();
    if (s && s.user.roles.includes(role)) session.set({ ...s, role });
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
};

export const useSession = () => useSyncExternalStore(session.subscribe, session.get, session.get);

export const PANELS: Record<Role, { path: string; label: string; color: string }> = {
  PROVIDER: { path: "/provider", label: "Provider", color: "var(--dz-green)" },
  VENDOR: { path: "/vendor", label: "Vendor", color: "var(--dz-pink)" },
  ADMIN: { path: "/admin", label: "Admin", color: "var(--dz-ink)" },
  OPS: { path: "/admin", label: "Ops", color: "var(--dz-ink)" },
};

/** One entry per distinct panel (ADMIN and OPS share the Admin panel). */
export function panelsFor(roles: Role[]) {
  const out: { role: Role; path: string; label: string; color: string }[] = [];
  roles.forEach((r) => {
    const p = PANELS[r];
    if (p && !out.some((x) => x.path === p.path)) out.push({ role: r, ...p });
  });
  return out;
}
