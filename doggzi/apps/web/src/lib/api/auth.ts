import { api } from "./client";

export interface User { id: string; phone: string; role: "USER" | "ADMIN" }
const S = "auth";
export const auth = {
  /** dev_code is only returned when the server runs with OTP_DEV_ECHO=true (console provider). */
  requestOtp: (phone: string) => api<{ sent: boolean; expires_in: number; dev_code?: string }>(S, "/otp/request", { body: { phone } }),
  verifyOtp: (phone: string, code: string) => api<{ access_token: string; token_type: string; user: User }>(S, "/otp/verify", { body: { phone, code } }),
  me: (token: string) => api<User>(S, "/me", { token }),
};
