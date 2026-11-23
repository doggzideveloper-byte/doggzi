/** Anonymous "live visitors" ping for the Admin panel (no visual change, no personal data).

Every 30 s while the tab is visible, send {random per-tab id, path, mobile|desktop} to /api/admin/v1/live/heartbeat.
The id lives in sessionStorage only, so it is new for every tab and forgotten when the tab closes.
Nothing is sent while the tab is hidden; a ping goes out as soon as it becomes visible again or the page changes. */
const EVERY = 30_000;
let sid = "";
let path = "/";
let timer: number | undefined;

function id(): string {
  if (sid) return sid;
  try {
    sid = sessionStorage.getItem("dz.live") || "";
    if (!sid) {
      sid = crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      sessionStorage.setItem("dz.live", sid);
    }
  } catch {
    sid = sid || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
  return sid;
}

function send() {
  if (document.visibilityState !== "visible") return;
  const body = JSON.stringify({ sid: id(), page: path, device: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop" });
  try {
    // keepalive: survives navigation; failures are ignored (analytics must never affect the page).
    fetch("/api/admin/v1/live/heartbeat", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}

function schedule() {
  window.clearInterval(timer);
  timer = window.setInterval(send, EVERY);
}

/** Call on every route change. Starts the 30 s loop the first time. */
export function heartbeat(pathname: string) {
  const first = timer === undefined;
  path = pathname;
  send();
  schedule();
  if (first) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") { send(); schedule(); }
    });
  }
}
