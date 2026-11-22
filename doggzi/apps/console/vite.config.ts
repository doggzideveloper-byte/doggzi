import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Served under /console through the gateway (same origin as the website, so /api and /brand are shared).
const gateway = process.env.VITE_GATEWAY_URL || "http://localhost:8080";

export default defineConfig({
  base: "/console/",
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5174,
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
    host: true,
    proxy: { "/api": { target: gateway, changeOrigin: true }, "/brand": { target: gateway, changeOrigin: true } },
  },
});
