/** Typed fetch wrapper. Every call goes through the gateway at /api/<service>/v1. */
export class ApiError extends Error {
  constructor(public status: number, public detail: unknown, message?: string) {
    super(message || `Request failed (${status})`);
  }
}

export interface RequestOpts {
  method?: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function api<T>(service: string, path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(`/api/${service}/v1${path}`, {
      method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    throw new ApiError(0, e, "We couldn't reach Doggzi. Check your connection and try again.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = (data as { detail?: unknown })?.detail ?? data;
    const msg = typeof detail === "string" ? detail : Array.isArray(detail) ? (detail[0] as { msg?: string })?.msg : undefined;
    throw new ApiError(res.status, detail, msg);
  }
  return data as T;
}

/** True when the error means the backend isn't there at all (dev without docker compose, offline). */
export const isUnreachable = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504 || (e.status === 404 && typeof e.detail === "string" && /<html/i.test(e.detail)));
