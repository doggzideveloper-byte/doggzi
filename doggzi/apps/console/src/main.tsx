import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PetSprite } from "@doggzi/ui/components/PetSprite";
import "@doggzi/ui/global.css";
import "@doggzi/ui/console.css";
import App from "./app/App";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 5_000 } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter basename="/console">
        <PetSprite />
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

// Installable PWA + web-push display (no offline API caching: jobs and offers must be live).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/console/sw.js", { scope: "/console/" }).catch(() => undefined);
}
