// Push: sayfa kapalıyken / ekran kilitliyken "sıra size geldi" bildirimi. Sunucu çağırma anında gönderir (src/push.js).
self.addEventListener("push", (e) => {
  const m = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(m.title ?? "Sıra size geldi!", {
    body: m.body, tag: m.tag, data: { url: m.url ?? "/" },
    icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
    vibrate: [500, 200, 500, 200, 500], requireInteraction: true, renotify: !!m.tag,
  }));
});

// Bildirime dokununca açık sıra sayfasına geç (başka sıradaysa bildirimin sırasına götür), yoksa sıra sayfasını aç
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url ?? "/", self.location.origin);
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
    const open = list.find((c) => new URL(c.url).pathname === "/join");
    if (!open) return clients.openWindow(url.href);
    const r = new URL(open.url).searchParams.get("r"), want = url.searchParams.get("r");
    const c = await open.focus();
    if (url.pathname === "/join" && want && r !== want) await c.navigate(url.href).catch(() => {});
  }));
});
