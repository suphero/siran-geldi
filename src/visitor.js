// Ziyaretçi cihazı: çerezdeki rastgele kimlik ("d", alan adının tamamında geçerli) başına bir nesne.
// iPhone'da ana ekran uygulaması Safari'den ayrı depolama ve çerez kullanır; uygulama bağlama koduyla Safari'deki
// cihaz kimliğini alır, böylece uygulamada verilen bildirim izni Safari'de alınan biletlere de bağlanır.
// "l:<kod>" adlı nesneler bağlama kodudur: tek kullanımlık, LINK_TTL içinde geçerli.
import { DurableObject } from "cloudflare:workers";

const TTL = 30 * 864e5; // kullanılmayan cihaz kaydı (abonelik, bilet listesi) bu kadar sonra silinir
const LINK_TTL = 864e5; // ana ekrana ekleme genelde hemen yapılır; ertesi güne kalırsa yeni kod alınır
const MAX_ROOMS = 20;

// Bağlama kodu: 32 karakter onaltılık. Cihaz kimliği: crypto.randomUUID() (eski sayfalarda localStorage'dan)
export const CODE_RE = /^[a-f0-9]{32}$/;
export const DEVICE_RE = /^[\w-]{16,64}$/;

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

  // Bağlama kodu nesnesi
  async hold(device) {
    const exp = Date.now() + LINK_TTL;
    await this.ctx.storage.put("l", { device, exp });
    await this.ctx.storage.setAlarm(exp);
  }

  async redeem() {
    const l = await this.ctx.storage.get("l");
    await this.clear();
    return l && l.exp > Date.now() ? l.device : null;
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
