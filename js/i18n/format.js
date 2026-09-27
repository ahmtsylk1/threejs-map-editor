/**
 * i18n/format.js
 * ============================================================================
 * Yerelleştirilmiş sayı / yüzde biçimlendirme.
 *
 * NEDEN AYRI BİR MODÜL?
 * ---------------------
 * Sözlüklere sayı BİÇİMİ gömülmez. Gömülürse her yeni dil için yüzlerce
 * şablonu elle düzenlemek gerekir ve "{count}" içindeki sayı yine dile
 * göre biçimlenmez — "1.234" ile "1,234" karışır.
 *
 * Bunun yerine biçimlendirme tek yerde, aktif dilin yerel ayarlarıyla
 * yapılır:
 *     t('status.objects', { count: n(1234) })   →  "Nesne: 1.234"
 *     t('status.objects', { count: n(1234) })   →  "Objects: 1,234"
 *
 * `n()` çıktısı zaten string olduğu için ikinci değişken olarak geçer.
 */
import { i18n } from '../core/I18nManager.js';

/**
 * Aktif dil için `Intl.NumberFormat` önbelleği.
 *
 * Önbellek DİLLE ANAHTARLANIR (`say:tr`, `say:en`), bu yüzden dil
 * değişince GEÇERSİZLEŞTİRMEK GEREKMEZ — doğru biçimlendirici zaten
 * ayrı bir girdidir. Elle temizleme yerine bu yaklaşım seçildi; aksi halde
 * `format.js → I18nManager → format.js` import döngüsü oluşurdu.
 *
 * Önbellek doğal olarak sınırlıdır: dil sayısı × biçimlendirici sayısı.
 */
const _say = new Map();

function bicimlendirici(tip) {
  const dil = i18n?.language || 'tr';
  const anahtar = `${tip}:${dil}`;
  if (!_say.has(anahtar)) {
    // Maksimum 2 ondalık: "1.5" okunur, "1.5000000000001" değil.
    _say.set(anahtar, new Intl.NumberFormat(dil, { maximumFractionDigits: 2 }));
  }
  return _say.get(anahtar);
}

/** @param {number} deger @returns {string} dile göre binlik/ondalık ayrımlı */
export function n(deger) {
  if (deger == null || !Number.isFinite(Number(deger))) return String(deger ?? '');
  return bicimlendirici('say').format(Number(deger));
}

/**
 * Yüzde biçimi.
 *
 * `style: 'percent'` BİLEREK kullanılıyor; elle `'%' + n(deger*100)` yazmak
 * yanlış olurdu, çünkü yüzde işaretinin YERİ dille değişir:
 *     tr → "%35"      ·      en → "35%"
 * Elle birleştirilen değer İngilizcede de "%35" kalır ve yerelleştirme
 * yarım yapılmış olur.
 *
 * @param {number} deger 0..1
 * @returns {string} "%35" · "35%" · "35,5%"
 */
export function pct(deger) {
  if (deger == null || !Number.isFinite(Number(deger))) return '';
  const dil = i18n?.language || 'tr';
  const anahtar = `pct:${dil}`;
  if (!_say.has(anahtar)) {
    _say.set(anahtar, new Intl.NumberFormat(dil, { style: 'percent', maximumFractionDigits: 1 }));
  }
  return _say.get(anahtar).format(Number(deger));
}
