import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; text: string; tone: "info" | "error" | "success" };
const Ctx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(Ctx);

/** Small sticker toasts, bottom-centre, polite live region. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, text, tone }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" style={{ position: "fixed", left: 0, right: 0, bottom: "1.25rem", zIndex: 80, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", pointerEvents: "none", padding: "0 1rem" }}>
        {list.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"} style={{ pointerEvents: "auto", maxWidth: "27.5rem", padding: "0.625rem 1.125rem", font: "500 15px var(--font-body)", background: t.tone === "error" ? "var(--dz-orange)" : t.tone === "success" ? "var(--dz-green)" : "var(--dz-paper)", color: t.tone === "info" ? "var(--dz-ink)" : "var(--dz-paper)", border: "var(--stroke)", borderRadius: "var(--r-md)", boxShadow: "var(--shadow-sticker)", animation: "dzFade 180ms both" }}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
