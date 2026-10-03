// QR Wait'in ana ekran uygulaması nereden eklenirse eklensin aynı çalışsın.
// - Uygulama olarak açılan sayfa sıra sayfasına (/join) geçer: bilet, bildirim ve QR okuyucu orada (toApp).
// - iPhone'da ana ekran uygulaması tarayıcıdan ayrı çerez ve depolama kullanır; ana ekrana ekleme o anki adresi kaydeder.
//   Bu yüzden sıra ve durum sayfalarının adresinde her zaman cihaz bağlama kodu (l) bulunur; uygulama ilk açılışta
//   tarayıcıdaki cihaz olur ve orada alınan biletler, bildirim izni uygulamayla paylaşılır (linkAddress).
import { api } from "@/lib/api";

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

let code = "", at = 0;

// Geçerli kodu adrese yazar; sayfa kendi adresini değiştirdikten sonra da çağrılır (kod kaybolmasın)
export function keepLink() {
  if (!code) return;
  const p = new URLSearchParams(location.search);
  if (p.get("l") === code) return;
  p.set("l", code);
  history.replaceState(history.state, "", `${location.pathname}?${p}${location.hash}`);
}

// Kod 24 saat geçerli: sayfa uzun süre açık kaldıysa ekrana dönünce yenilenir
async function refreshLink() {
  if (Date.now() - at < 3600e3) return;
  at = Date.now();
  const r = await api<{ code: string | null }>("/api/v/link", { device: localStorage.getItem("device") }).catch(() => null);
  if (r?.code) { code = r.code; keepLink(); }
}

export function linkAddress() {
  if (standalone || !isIOS) return;
  refreshLink();
  document.addEventListener("visibilitychange", () => !document.hidden && refreshLink());
}
