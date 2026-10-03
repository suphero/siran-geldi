// QR Wait'in ana ekran uygulaması nereden eklenirse eklensin aynı çalışsın: uygulama olarak açılan sayfa sıra sayfasına
// (/join) geçer; bilet, bildirim ve QR okuyucu orada. Başlangıç adresini ve cihaz bağlama kodunu sunucu sayfaya özel
// manifest'e koyar (src/index.js appManifest).

export const standalone: boolean = (navigator as any).standalone || matchMedia("(display-mode: standalone)").matches;
export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Uygulama olarak açıldıysa uygulamanın sayfasına geçer (sonuç true: sayfa değişiyor, gerisi çalışmasın)
export function toApp(params: Record<string, string> = {}) {
  if (!standalone) return false;
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  location.replace(`/join?${p}`);
  return true;
}
