import { useState } from "react";
import { setTweak, useTweaks, type DemoPet, type Device } from "@/lib/tweaks";
import { FRESH_FOOD } from "@/content/fresh-food";

/** Preview switches carried over from the Claude Design prototypes. Dev builds, or ?tweaks=1. */
export function Tweaks() {
  const t = useTweaks();
  const [open, setOpen] = useState(false);
  const row = { display: "flex", flexDirection: "column" as const, gap: "0.25rem", fontSize: "0.8125rem" };
  const sel = { height: "2rem", borderRadius: "0.5rem", border: "2px solid var(--dz-ink)", background: "var(--dz-paper)", font: "500 13px var(--font-body)" };
  return (
    <div style={{ position: "fixed", left: "0.75rem", bottom: "0.75rem", zIndex: 90, fontFamily: "var(--font-body)" }}>
      {open && (
        <div role="dialog" aria-label="Preview tweaks" style={{ marginBottom: "0.5rem", width: "14.375rem", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.625rem", background: "var(--dz-paper)", border: "var(--stroke)", borderRadius: "0.875rem", boxShadow: "var(--shadow-sticker)" }}>
          <label style={row}>Demo pet
            <select style={sel} value={t.demoPet} onChange={(e) => setTweak("demoPet", e.target.value as DemoPet)}>
              <option value="saved">Saved passport</option><option value="dog">Dog (Bruno)</option><option value="cat">Cat (Mishti)</option>
            </select>
          </label>
          <label style={row}>Device (Smart Download)
            <select style={sel} value={t.device} onChange={(e) => setTweak("device", e.target.value as Device)}>
              {["Auto", "iOS", "Android", "Desktop"].map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label style={{ ...row, flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" checked={t.catsSupported ?? FRESH_FOOD.catsSupported} onChange={(e) => setTweak("catsSupported", e.target.checked)} /> Fresh food: cats supported
          </label>
          <label style={{ ...row, flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" checked={t.forceReducedMotion} onChange={(e) => setTweak("forceReducedMotion", e.target.checked)} /> Force reduced motion
          </label>
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ height: "2.25rem", padding: "0 0.875rem", font: "600 13px var(--font-body)", background: "var(--dz-ink)", color: "var(--dz-cream)", border: "2px solid var(--dz-ink)", borderRadius: "62.4375rem", cursor: "pointer", opacity: 0.85 }}>
        Tweaks
      </button>
    </div>
  );
}
