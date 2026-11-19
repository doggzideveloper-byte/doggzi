import { useState } from "react";
import { setTweak, useTweaks, type DemoPet, type Device } from "@/lib/tweaks";
import { FRESH_FOOD } from "@/content/fresh-food";

/** Preview switches carried over from the Claude Design prototypes. Dev builds, or ?tweaks=1. */
export function Tweaks() {
  const t = useTweaks();
  const [open, setOpen] = useState(false);
  const row = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 13 };
  const sel = { height: 32, borderRadius: 8, border: "2px solid var(--dz-ink)", background: "var(--dz-paper)", font: "500 13px var(--font-body)" };
  return (
    <div style={{ position: "fixed", left: 12, bottom: 12, zIndex: 90, fontFamily: "var(--font-body)" }}>
      {open && (
        <div role="dialog" aria-label="Preview tweaks" style={{ marginBottom: 8, width: 230, padding: 12, display: "flex", flexDirection: "column", gap: 10, background: "var(--dz-paper)", border: "var(--stroke)", borderRadius: 14, boxShadow: "var(--shadow-sticker)" }}>
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
          <label style={{ ...row, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={t.catsSupported ?? FRESH_FOOD.catsSupported} onChange={(e) => setTweak("catsSupported", e.target.checked)} /> Fresh food: cats supported
          </label>
          <label style={{ ...row, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={t.forceReducedMotion} onChange={(e) => setTweak("forceReducedMotion", e.target.checked)} /> Force reduced motion
          </label>
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ height: 36, padding: "0 14px", font: "600 13px var(--font-body)", background: "var(--dz-ink)", color: "var(--dz-cream)", border: "2px solid var(--dz-ink)", borderRadius: 999, cursor: "pointer", opacity: 0.85 }}>
        Tweaks
      </button>
    </div>
  );
}
