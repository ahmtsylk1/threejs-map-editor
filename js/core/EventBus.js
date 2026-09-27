/**
 * EventBus.js
 * ---------------------------------------------------------------------------
 * Uygulama genelinde kullanılan minik yayın/abone (pub-sub) altyapısı.
 * Görünümler (panel/UI) ile çekirdek (sahne/objeler) arasındaki tek yönlü
 * iletişimi sağlar; katmanlar birbirine doğrudan bağımlı olmaz.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._channels = new Map();
  }

  /**
   * Olaya abone olur.
   * @param {string} type Olay adı
   * @param {Function} fn  Çağrılacak fonksiyon
   * @returns {() => void} Aboneliği iptal eden fonksiyon
   */
  on(type, fn) {
    if (!this._channels.has(type)) this._channels.set(type, new Set());
    this._channels.get(type).add(fn);
    return () => this.off(type, fn);
  }

  /** Bir kez tetiklenip kendini silen abonelik. */
  once(type, fn) {
    const wrapper = (payload) => {
      this.off(type, wrapper);
      fn(payload);
    };
    return this.on(type, wrapper);
  }

  /** Aboneliği kaldırır. */
  off(type, fn) {
    const set = this._channels.get(type);
    if (set) {
      set.delete(fn);
      if (set.size === 0) this._channels.delete(type);
    }
  }

  /** Olayı tetikler. Abone hataları diğerlerini engellemez. */
  emit(type, payload) {
    const set = this._channels.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[EventBus] "${type}" aboneliğinde hata:`, err);
      }
    }
  }

  /** Tüm kanalları veya belirli bir kanalı temizler. */
  clear(type) {
    if (type) this._channels.delete(type);
    else this._channels.clear();
  }
}
