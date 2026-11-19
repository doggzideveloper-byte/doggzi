import { createStore } from "./store";
import type { User } from "./api/auth";
import type { Address } from "./api/booking";

/** Logged-in user after OTP. Phase 1 keeps the JWT in localStorage. */
export const sessionStore = createStore<{ token: string; user: User } | null>("dz.session", null);
export const useSession = () => sessionStore.use();
export const addressesStore = createStore<Address[]>("dz.addresses", []);
