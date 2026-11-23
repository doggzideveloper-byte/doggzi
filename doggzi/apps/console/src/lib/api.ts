import { session } from "./session";

export class ApiError extends Error {
  constructor(public status: number, public detail: unknown, message?: string) {
    super(message || `Request failed (${status})`);
  }
}

interface Opts { method?: string; body?: unknown; form?: FormData; auth?: boolean; signal?: AbortSignal }

/** Every call goes through the gateway (/api/<service>/v1). A 401 ends the session and returns to the login. */
export async function api<T>(service: string, path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const s = session.get();
  if (opts.auth !== false && s) headers.Authorization = `Bearer ${s.token}`;
  let res: Response;
  try {
    res = await fetch(`/api/${service}/v1${path}`, {
      method: opts.method || (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
    });
  } catch (e) {
    throw new ApiError(0, e, "We couldn't reach Doggzi. Check your connection.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.status === 401 && opts.auth !== false) {
    session.set(null);
    const back = encodeURIComponent(location.pathname.replace(/^\/console/, ""));
    location.assign(`/console/login?reason=signin&next=${back}`);
  }
  if (!res.ok) {
    const detail = (data as { detail?: unknown })?.detail ?? data;
    const msg = typeof detail === "string" ? detail : Array.isArray(detail) ? (detail[0] as { msg?: string })?.msg : undefined;
    throw new ApiError(res.status, detail, msg);
  }
  return data as T;
}

export const errMsg = (e: unknown, fallback = "Something went wrong. Try again.") => (e instanceof ApiError && e.message && !/^Request failed/.test(e.message) ? e.message : fallback);

/** Authenticated file download (CSV exports): fetch with the session token, then save as `filename`. */
export async function download(service: string, path: string, filename: string) {
  const s = session.get();
  const res = await fetch(`/api/${service}/v1${path}`, { headers: s ? { Authorization: `Bearer ${s.token}` } : {} });
  if (res.status === 401) { session.set(null); location.assign("/console/login?reason=signin"); return; }
  if (!res.ok) {
    let msg = "Couldn't download the file. Try again.";
    try { const d = (await res.json())?.detail; if (typeof d === "string") msg = d; } catch { /* not JSON */ }
    throw new ApiError(res.status, null, msg);
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await res.blob());
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
