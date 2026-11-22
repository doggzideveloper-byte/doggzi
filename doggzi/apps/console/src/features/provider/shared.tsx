import { avatarVariant, type AvatarVariant } from "@doggzi/ui/lib/pet";
import type { Pet, Step } from "./api";

export const petKey = (p: Pet): AvatarVariant => avatarVariant(p.type === "cat" ? "cat" : "dog", p.breed) || "dog";

/** Status chip label + kind per job step (PANELS_00_SHARED: new orange, accepted green outline, in progress green, done ink). */
export const STATUS: Record<Step, [string, "new" | "acc" | "prog" | "done"]> = {
  accepted: ["Accepted", "acc"], travel: ["En route", "prog"], arrived: ["Arrived", "prog"], in_service: ["In service", "prog"], completed: ["Collect payment", "new"], done: ["Done", "done"],
};
/** What the customer's WhatsApp says after each step (sent by the server). */
export const WA: Partial<Record<Step, string>> = { travel: "is on the way", arrived: "has arrived", in_service: "started the service", completed: "finished the service", done: "marked payment collected" };

export { Chip, MuteButton, Switch, UiProvider, useUi } from "../common/ui";
