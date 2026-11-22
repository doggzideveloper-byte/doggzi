// Doggzi Console service worker: makes the panel installable ("Add to home screen") and shows web-push alerts.
// No offline caching of API data (jobs and offers must always be live).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Doggzi", { body: d.body || "You have a new update.", icon: "/console/icon-192.png", badge: "/console/icon-192.png", tag: d.tag || "doggzi", data: { url: d.url || "/console/provider" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((ws) => (ws[0] ? ws[0].focus() : self.clients.openWindow(e.notification.data.url))));
});
