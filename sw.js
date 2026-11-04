// 서비스 워커: 웹앱이 닫혀 있어도 새 상담 신청 푸시 알림을 띄움
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "새 상담 신청", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "새 상담 신청", {
    body: d.body || "",
    tag: d.tag || "cs-request",
    renotify: true,
    requireInteraction: !!d.urgent,
    vibrate: d.urgent ? [300, 150, 300, 150, 300] : [200, 100, 200],
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) { if (w.url.startsWith(self.location.origin)) { await w.focus(); w.postMessage({ type: "open-requests" }); return; } }
    await self.clients.openWindow(url);
  })());
});
