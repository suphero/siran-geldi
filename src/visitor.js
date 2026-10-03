// Ziyaretçi cihazı: çerezdeki rastgele kimlik ("d", alan adının tamamında geçerli) başına bir nesne.
// iPhone'da ana ekran uygulaması Safari'den ayrı depolama ve çerez kullanır; uygulama bağlama koduyla Safari'deki
// cihaz kimliğini alır, böylece uygulamada verilen bildirim izni Safari'de alınan biletlere de bağlanır.
import { DurableObject } from "cloudflare:workers";
import { enc, randomHex } from "./util.js";

const TTL = 30 * 864e5; // kullanılmayan cihaz kaydı (abonelik, bilet listesi) bu kadar sonra silinir
const LINK_TTL = 864e5; // sayfa açık kaldıkça kod yenilenir; ana ekrana eklenen uygulama genelde hemen açılır
const MAX_ROOMS = 20;

// Cihaz kimliği: crypto.randomUUID() (eski sayfalarda localStorage'dan)
export const DEVICE_RE = /^[\w-]{16,64}$/;

// Bağlama kodu: cihaz kimliği sunucu anahtarıyla şifrelenir (AES-GCM). Adreste kimlik görünmez, kod üretmek için kayıt
// tutulmaz (iPhone'da sıra ve durum sayfaları her açılışta kod alır). Anahtar LINK_SECRET'tan, yoksa VAPID özel
// anahtarından türetilir (HKDF); üretimde ayrı secret gerekmez, test ortamında VAPID olmadan da çalışır.
// Kod LINK_TTL boyunca geçerli, tek kullanımlık (Visitor.claim).
const b64u = (b) => btoa(String.fromCharCode(...b)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));

export const linkSecret = (env) => env.LINK_SECRET ?? env.VAPID_PRIVATE_KEY;

async function linkKey(env) {
  const ikm = await crypto.subtle.importKey("raw", enc(linkSecret(env)), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc("qrwait"), info: enc("device-link") }, ikm,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function sealLink(env, device) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await linkKey(env), enc(JSON.stringify({ d: device, n: randomHex(8), x: Date.now() + LINK_TTL })));
  return b64u(new Uint8Array([...iv, ...new Uint8Array(data)]));
}

// Geçerliyse { d: cihaz, n: tek kullanımlık numara }, değilse null
export async function openLink(env, code) {
  try {
    const b = unb64u(code);
    const p = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, await linkKey(env), b.slice(12))));
    return p.x > Date.now() && DEVICE_RE.test(p.d) ? p : null;
  } catch { return null; }
}

export class Visitor extends DurableObject {
  // v: { sub?, rooms: { <oda id>: { id: <bilet>, at } }, at: son kullanım }
  async load() {
    return (await this.ctx.storage.get("v")) ?? { rooms: {} };
  }

  async store(v) {
    v.at = Date.now();
    await this.ctx.storage.put("v", v);
    await this.ctx.storage.setAlarm(v.at + TTL);
  }

  // Sıraya girildi: bilet kaydedilir, varsa bildirim aboneliği döner (odadaki bilete bağlanır)
  async joined(room, id) {
    const v = await this.load();
    delete v.rooms[room]; // en son girilen sona
    v.rooms[room] = { id, at: Date.now() };
    const keys = Object.keys(v.rooms);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ROOMS))) delete v.rooms[k];
    await this.store(v);
    return v.sub ?? null;
  }

  async subscribe(sub) {
    const v = await this.load();
    v.sub = sub;
    await this.store(v);
  }

  // Gönderim başarısız: abonelik artık geçersiz (uygulama silindi / izin geri alındı)
  async unsubscribe(endpoint) {
    const v = await this.ctx.storage.get("v");
    if (v?.sub?.endpoint !== endpoint) return;
    delete v.sub;
    await this.store(v);
  }

  // En son girilen en sonda; bitmiş biletler çağıran tarafından forget ile temizlenir
  async tickets() {
    const v = await this.ctx.storage.get("v");
    return Object.entries(v?.rooms ?? {}).map(([room, t]) => ({ room, id: t.id }));
  }

  async forget(rooms) {
    const v = await this.ctx.storage.get("v");
    if (!v) return;
    for (const r of rooms) delete v.rooms[r];
    await this.store(v);
  }

  // Bağlama kodu kullanıldı: aynı kod ikinci kez kabul edilmez (adres paylaşılırsa başkası bu cihaz olamaz)
  async claim(n) {
    const v = await this.load();
    if (v.used?.includes(n)) return false;
    v.used = [...(v.used ?? []), n].slice(-20);
    await this.store(v);
    return true;
  }

  async clear() {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async alarm() {
    const v = await this.ctx.storage.get("v");
    if (v && Date.now() - v.at < TTL) await this.ctx.storage.setAlarm(v.at + TTL);
    else await this.clear();
  }
}
