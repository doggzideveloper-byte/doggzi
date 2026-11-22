import { useEffect, useId, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { SITE } from "@/content/site-config";
import { track } from "@/lib/analytics";
import { useDevice } from "@/lib/device";
import { Button } from "./Button";
import s from "./AppDownload.module.css";

export const appRedirectUrl = () => new URL(SITE.appRedirectPath, window.location.origin).href;

function Qr({ url }: { url: string }) {
  const d = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    let path = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { n, path };
  }, [url]);
  return (
    <svg viewBox={`0 0 ${d.n + 4} ${d.n + 4}`} width="100%" height="100%" shapeRendering="crispEdges" style={{ display: "block" }}>
      <path d={d.path} fill="var(--dz-ink)" />
    </svg>
  );
}

interface Props {
  /** compact: badges + QR. full: adds "send link to my phone". badge: badges in a row, no QR. */
  layout?: "compact" | "full" | "badge";
  align?: "start" | "center";
  source?: string;
}

/**
 * Smart Download. iPhone → App Store, Android → Google Play, desktop → both official badges + a QR code
 * to /app (which picks the right store) and an optional WhatsApp hand-off. Badges are used unchanged.
 */
export function AppDownload({ layout = "compact", align = "start", source = "fresh_food" }: Props) {
  const dev = useDevice();
  const mobile = dev !== "Desktop";
  const id = useId();
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const url = useRef("");
  const [redirect, setRedirect] = useState("");
  useEffect(() => {
    url.current = appRedirectUrl();
    setRedirect(url.current);
  }, []);
  const t = (store: string) => track("app_download_click", { store, source });

  return (
    <div className={s.root} style={{ alignItems: align === "center" ? "center" : "flex-start" }}>
      {mobile ? (
        <a className={s.badgeLink} href={dev === "iOS" ? SITE.appStoreUrl : SITE.playStoreUrl} target="_blank" rel="noopener noreferrer" onClick={() => t(dev === "iOS" ? "app_store" : "play_store")} aria-label={dev === "iOS" ? "Download Doggzi on the App Store" : "Get Doggzi on Google Play"}>
          <img src={dev === "iOS" ? SITE.appStoreBadge : SITE.playStoreBadge} alt="" style={{ height: "3.25rem" }} />
        </a>
      ) : (
        <div className={s.desk}>
          <div className={s.badges} style={{ flexDirection: layout === "badge" ? "row" : "column" }}>
            <a className={s.badgeLink} href={SITE.appStoreUrl} target="_blank" rel="noopener noreferrer" onClick={() => t("app_store")}>
              <img src={SITE.appStoreBadge} alt="Download on the App Store" style={{ height: "3rem" }} />
            </a>
            <a className={s.badgeLink} href={SITE.playStoreUrl} target="_blank" rel="noopener noreferrer" onClick={() => t("play_store")}>
              <img src={SITE.playStoreBadge} alt="Get it on Google Play" style={{ height: "3rem" }} />
            </a>
          </div>
          {layout !== "badge" && redirect && (
            <div className={s.qrBox}>
              <div className={s.qr} role="img" aria-label="QR code to get the Doggzi app on your phone"><Qr url={redirect} /></div>
              <span style={{ display: "flex", flexDirection: "column", gap: "0.125rem", maxWidth: "7.5rem" }}>
                <span className={s.scan}>Scan me</span>
                <span style={{ fontSize: "0.8125rem", lineHeight: 1.35 }}>Opens the right store on your phone</span>
              </span>
            </div>
          )}
        </div>
      )}
      {!mobile && layout === "full" && (
        <form
          className={s.form}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const digits = phone.replace(/\D/g, "");
            if (!/^[6-9]\d{9}$/.test(digits)) return setErr("Enter a 10-digit Indian mobile number.");
            track("app_link_whatsapp", { source });
            // The number goes to WhatsApp only; we never store it.
            window.open(`https://wa.me/91${digits}?text=${encodeURIComponent(`Get the Doggzi app: ${url.current}`)}`, "_blank", "noopener");
          }}
        >
          <label htmlFor={id} style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Send the link to my phone</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem" }}>
            <div className={s.field}>
              <span aria-hidden="true" style={{ padding: "0 0.25rem 0 1rem", fontWeight: 600 }}>+91</span>
              <input id={id} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={11} value={phone} placeholder="98765 43210" aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined}
                onChange={(e) => { setPhone(e.target.value.replace(/[^\d ]/g, "")); setErr(null); }} />
            </div>
            <Button type="submit" variant="greenInk" size="sm" style={{ height: "3rem" }}>Send via WhatsApp</Button>
          </div>
          {err && <p id={`${id}-err`} role="alert" className={s.err}>{err}</p>}
          <p className={s.note}>Opens WhatsApp with the download link. We never store your number.</p>
        </form>
      )}
    </div>
  );
}
