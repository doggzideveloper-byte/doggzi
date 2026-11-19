import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// The frontend never calls a service directly: everything goes through the gateway at /api/<service>/v1.
const gateway = process.env.VITE_GATEWAY_URL || "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    host: true,
    proxy: { "/api": { target: gateway, changeOrigin: true }, "/app": { target: gateway, changeOrigin: true } },
  },
});
