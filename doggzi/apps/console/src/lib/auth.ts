import { api } from "./api";
import type { ConsoleUser } from "./session";

export const authApi = {
  request: (phone: string) => api<{ sent: boolean; expires_in: number; dev_code: string | null }>("auth", "/console/otp/request", { body: { phone }, auth: false }),
  verify: (phone: string, code: string) => api<{ access_token: string; expires_in: number; user: ConsoleUser }>("auth", "/console/otp/verify", { body: { phone, code }, auth: false }),
  me: () => api<ConsoleUser>("auth", "/console/me"),
  logoutAll: () => api<null>("auth", "/console/logout-all", { method: "POST" }),
};
