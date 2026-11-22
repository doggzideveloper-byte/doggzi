import { useEffect } from "react";
import { SITE } from "@/content/site-config";
import { detectDevice } from "@/lib/device";

/**
 * Client-side fallback for /app. In production nginx handles /app by User-Agent before the SPA loads
 * (infra/nginx/gateway.conf); this covers `vite dev` and static hosting.
 */
export default function AppRedirect() {
  useEffect(() => {
    const d = detectDevice();
    const target = d === "iOS" ? SITE.appStoreUrl : d === "Android" ? SITE.playStoreUrl : "/fresh-food#download";
    window.location.replace(target);
  }, []);
  return <p style={{ padding: "1.5rem" }}>Taking you to the Doggzi app…</p>;
}
