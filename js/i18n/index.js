/**
 * i18n/index.js
 * ============================================================================
 * Dil sözlüklerinin kaydı ve ortak yardımcılar.
 *
 * Sözlükler tembel (lazy) içe aktarılır: kullanıcı TR'yi hiç seçmemişse
 * `en.js` hiç yüklenmez. Küçük bir kazanç, ama `I18nManager` modülü
 * `Store`'dan önce yüklendiği için başlangıç maliyeti önemlidir.
 *
 * `VARSAYILAN` her zaman YÜKLÜ olan dildir: eksik anahtarlarda geri düşülecek
 * dil budur (bkz. tr.js başlığı).
 */
import tr from './tr.js';
import en from './en.js';

/**
 * @typedef {Object} Sozluk
 * @property {string} kod        BCP-47 kodu (`tr`, `en`)
 * @property {string} ad         Kendi dilinde adı (Türkçe, English…)
 * @property {Object} metin      Anahtar → metin
 * @property {string} [bayrak]   Seçicide gösterilecek bayrak/rozet
 */

/** @type {Sozluk[]} Uygulamanın bildiği diller — sıra seçicideki sıradır. */
export const DILLER = [
  { kod: 'tr', ad: 'Türkçe', metin: tr, bayrak: '🇹🇷' },
  { kod: 'en', ad: 'English', metin: en, bayrak: '🇬🇧' },
];

/** Geri düşülecek dil: eksik anahtarlarda aranacak sözlük. */
export const VARSAYILAN = 'tr';

/** Tarayıcı dilinden makul bir başlangıç dili önerir (yoksa varsayılan). */
export function tarayiciDiliniÖner(diller = DILLER) {
  const tercihler = [
    ...(navigator.languages || [navigator.language || '']),
  ].map((s) => String(s).toLowerCase().slice(0, 2));

  for (const tercih of tercihler) {
    const eslesen = diller.find((d) => d.kod === tercih);
    if (eslesen) return eslesen.kod;
  }
  return VARSAYILAN;
}

/** Sözlük kodunu doğrular; geçersizse `yedek` döner. */
export function dogrulaDil(kod, yedek = VARSAYILAN) {
  return DILLER.some((d) => d.kod === kod) ? kod : yedek;
}
