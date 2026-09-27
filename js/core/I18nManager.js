/**
 * I18nManager.js
 * ============================================================================
 * Dil yönetimi: aktif dil, çeviri çözümleme, kalıcılık ve DOM yenileme.
 *
 * ---------------------------------------------------------------------------
 * 1) DİL NEDEN Store'DA DEĞİL?
 * ---------------------------------------------------------------------------
 * `Store` HARİTANIN durumudur ve `ProjectIO` ile JSON'a yazılır. Arayüz
 * dili bir kullanıcı TERCIHİDİR, proje verisi değildir: bir haritayı
 * İngilizce okuyan birine "Türkçe görünümünde açıldı" demek yanlış olur.
 * Bu yüzden dil ayrı bir kaynakta, `localStorage`'da tutulur ve JSON'a
 * GİRMEZ. (Harita ayarlarının aksine — ızgara rengi, hücre boyutu — bunlar
 * projenin parçasıdır ve Store'da kalır.)
 *
 * ---------------------------------------------------------------------------
 * 2) İKİ KATMANLI YENİLEME
 * ---------------------------------------------------------------------------
 * Dil değişince arayüzü tazelemek iki farklı yol gerektirir:
 *
 *   (a) TARAMA (declarative) — `data-i18n` / `data-i18n-attr` taşıyan
 *       düğümler. Statik HTML'i (index.html) ve `el()` ile üretilen
 *       düğümleri kapsar. Metin CANLI VERİYE BAĞLI DEĞİLDİR.
 *
 *   (b) YENİDEN ÇİZİM (imperative) — metin hesaplanmış metindir
 *       ("Nesne: 12", "Kategori: biyom", "3 kilitli atlandı"). Bunlar
 *       bileşenlerin `register()` ile kaydettiği geri çağrımlarla
 *       yeniden üretilir.
 *
 *   Neden sadece tarama yetmez? "Nesne: {count}" gibi bir metnin `count`
 *   değeri DOM'da değil, Store'dadır. Tarama onu yeniden üretemez.
 *   Neden sadece yeniden çizim yetmez? `title`/`placeholder` gibi öznitelik
 *   metinleri ve düğmelerin içindeki kısa etiketler bileşen yeniden
 *   çizilmeden değişmeli — üstelik yeniden çizim, o an kullanıcının
 *   odakladığı bir <input> değerini sıfırlayabilir. İkisi birlikte
 *   gerekiyor.
 *
 * ---------------------------------------------------------------------------
 * 3) EKSİK ANAHTAR DAVRANIŞI
 * ---------------------------------------------------------------------------
 * Bulunamayan anahtar BOŞ DÖNMEZ — anahtarın kendisini döner ve `MISSING`
 * olayı yayınlar. Boş string, "arayüz bozuk" ile "çeviri eksik" ayrımını
 * imkânsız kılar; `topbar.btn.export` yazan bir kutu, hatayı kendi
 * kendine ele verir. Eksik anahtarlar ayrıca konsola TEK SEFER yazılır.
 */
import { EventBus } from './EventBus.js';
import { DILLER, VARSAYILAN, dogrulaDil, tarayiciDiliniÖner } from '../i18n/index.js';

/** I18nManager'ın kendi olay adları. */
export const I18N_EVENT = {
  CHANGE: 'i18n:change',     // dil değişti (temizlikten SONRA)
  MISSING: 'i18n:missing',   // çeviri bulunamadı
};

/** Tercih localStorage anahtarı. Sürümlü: biçim değişirse eski kayıt ıskalanır. */
const KAYIT_ANAHTARI = 'mapeditor:lang';

/** `data-i18n-attr` ayırıcısı ve öznitelik eşlemesi biçimi. */
const AYIRICI = ';';

/**
 * `{count}` / `{ad}` / `{0}` biçimindeki yer tutucuları doldurur.
 *
 * @param {string} sablon
 * @param {Object} degiskenler
 * @returns {string}
 */
function degistir(sablon, degiskenler) {
  if (!degiskenler) return sablon;
  return sablon.replace(/\{(\w+)\}/g, (tam, ad) => {
    if (!(ad in degiskenler)) return tam;      // tanımsızsa yerinde bırak
    const deger = degiskenler[ad];
    return deger == null ? '' : String(deger);
  });
}

/**
 * Aktif dili yöneten basit, olay tabanlı servis.
 *
 * @example
 *   i18n.t('topbar.btn.export');                       // "Export JSON"
 *   i18n.t('status.objects', { count: 12 });           // "Nesne: 12"
 *   i18n.setLanguage('en');                            // EVENT.CHANGE yayınlanır
 *   i18n.on(I18N_EVENT.CHANGE, () => panel.render());
 */
export class I18nManager extends EventBus {
  /**
   * @param {Object} [opts]
   *   diller     : Sozluk[]  (varsayılan: i18n/index.js → DILLER)
   *   varsayilan : string     geri düşülecek dil kodu
   *   sakla      : boolean    localStorage kullanılsın mı
   *   anahtar    : string     localStorage anahtarı
   *   dokuman    : Document   <html lang> ve tarama kökü
   */
  constructor(opts = {}) {
    super();
    this.diller = opts.diller || DILLER;
    this.varsayilan = opts.varsayilan || VARSAYILAN;
    this.kayitAnahtari = opts.anahtar ?? KAYIT_ANAHTARI;
    this.sakla = opts.sakla !== false;
    this.doc = opts.dokuman || document;

    /** Kayıtlı yeniden çizim geri çağrıları: ad → fn */
    this._yenidenCiz = new Map();
    /** Zaten uyarıldığımız eksik anahtarlar (tekrar tekrar loglamamak için) */
    this._eksikUyarildi = new Set();

    this._language = this._baslangicDili();
    this._sozluk = this._sozlukBul(this._language);
  }

  /* =======================================================================
     Dil
     ======================================================================= */

  /** @returns {string} Aktif dil kodu (`tr` | `en`) */
  get language() {
    return this._language;
  }

  /** @returns {Array<{kod,ad,bayrak}>} Dil seçici için seçenekler */
  get languages() {
    return this.diller.map(({ kod, ad, bayrak }) => ({ kod, ad, bayrak }));
  }

  /**
   * Dili değiştirir.
   *
   * @param {string} kod
   * @param {Object} [opts]
   *   kaydet : false ise localStorage'a yazılmaz (geçici önizleme için)
   *   uygula : false ise DOM taranmaz / yeniden çizim tetiklenmez
   * @returns {boolean} dil gerçekten değiştiyse true
   */
  setLanguage(kod, opts = {}) {
    const yeni = dogrulaDil(kod, this._language);
    if (yeni === this._language) return false;

    this._language = yeni;
    this._sozluk = this._sozlukBul(yeni);

    if (this.sakla && opts.kaydet !== false) this._kaydet(yeni);

    // Erişilebilirlik: ekran okuyucular dil değişimini bildirir.
    this.doc.documentElement?.setAttribute('lang', yeni);
    this.doc.title = this.t('app.title');

    if (opts.uygula !== false) this._uygula();
    this.emit(I18N_EVENT.CHANGE, { language: yeni, manager: this });
    return true;
  }

  /**
   * Bir sonraki/önceki dile geçer (iki dilli arayüzde "TR ⇄ EN" için).
   * @returns {boolean}
   */
  toggleLanguage() {
    const siradaki = this.diller[(this.diller.findIndex((d) => d.kod === this._language) + 1) % this.diller.length];
    return this.setLanguage(siradaki.kod);
  }

  /* =======================================================================
     Çeviri çözümleme
     ======================================================================= */

  /**
   * Anahtarı çözer.
   *
   * ÇÖZÜMLEME SIRASI
   *   1. aktif dil · `<anahtar>.one`  (yalnızca `count` değişkeni varsa)
   *   2. aktif dil · `<anahtar>.other` (aynı koşul)
   *   3. aktif dil · `<anahtar>`
   *   4. GERİ DÜŞÜLÜR · `<varsayılan>.<anahtar>`  (aynı .one/.other denemesi)
   *   5. anahtarın kendisi  +  MISSING olayı
   *
   * @param {string} anahtar
   * @param {Object} [degiskenler] `{ ad: deger }` — `count` özel: çoğul seçer
   * @returns {string}
   */
  t(anahtar, degiskenler) {
    if (!anahtar) return '';
    const cift = this._cozulCift(anahtar, degiskenler);
    if (cift !== null) return degistir(cift, degiskenler);

    this._eksikBildir(anahtar);
    return anahtar;
  }

  /**
   * HTML döndüren anahtar çözümleyici.
   *
   * DİKKAT: sözlükteki değer güvenilir kabul edilir (kodun kendisi yazar).
   * Değişkenler yine de kaçırılır — kullanıcı adı gibi bir değer
   * `i18n.html()` ile HTML'e girdiğinde enjeksiyon olmamalı.
   */
  html(anahtar, degiskenler) {
    return this.t(anahtar, degiskenler);
  }

  /** @returns {boolean} Anahtar herhangi bir sözlükte var mı? */
  exists(anahtar) {
    return this._cozulCift(anahtar, null) !== null;
  }

  /**
   * Çoğul seçimiyle birlikte ham şablonu çözer.
   * @returns {string|null} Bulunamadıysa null (t() uyarıyı o basar).
   */
  _cozulCift(anahtar, degiskenler) {
    const say = degiskenler && 'count' in degiskenler ? Number(degiskenler.count) : null;
    // `count` 1 ise "one", değilse "other". Türkçe ve İngilizcede tam sayı
    // çoğul kuralı aynı olduğu için iki biçim yeterlidir.
    const varyant = say !== null && !Number.isNaN(say)
      ? (Math.abs(say) === 1 ? ['one'] : ['other'])
      : [];

    for (const taban of [this._sozluk, this._sozlukBul(this.varsayilan)]) {
      for (const son of varyant) {
        const dene = taban[`${anahtar}.${son}`];
        if (typeof dene === 'string') return dene;
      }
      const dogrudan = taban[anahtar];
      if (typeof dogrudan === 'string') return dogrudan;
    }
    return null;
  }

  _sozlukBul(kod) {
    return this.diller.find((d) => d.kod === kod)?.metin || {};
  }

  _eksikBildir(anahtar) {
    if (this._eksikUyarildi.has(anahtar)) return;
    this._eksikUyarildi.add(anahtar);
    console.warn(`[i18n] eksik anahtar: "${anahtar}"`);
    this.emit(I18N_EVENT.MISSING, anahtar);
  }

  /** Test/araçlar için: bu anahtar için tekrar uyarılmaya izin verir. */
  eksikUyarilariniSifirla() {
    this._eksikUyarildi.clear();
  }

  /* =======================================================================
     Kalıcılık
     ======================================================================= */

  _baslangicDili() {
    if (this.sakla) {
      const kayitli = this._oku();
      if (kayitli) return kayitli;
    }
    return tarayiciDiliniÖner(this.diller);
  }

  _oku() {
    try {
      return dogrulaDil(localStorage.getItem(this.kayitAnahtari), null);
    } catch {
      return null;   // Gizli sekme / kotalı depolama → sessizce varsayılana düş
    }
  }

  _kaydet(kod) {
    try {
      localStorage.setItem(this.kayitAnahtari, kod);
    } catch {
      // Kota dolu olabilir. Dil değişmiştir, yalnızca hatırlanamaz.
      console.warn('[i18n] dil tercihi kaydedilemedi (depolama dolu olabilir)');
    }
  }

  /* =======================================================================
     DOM yenileme
     ======================================================================= */

  /**
   * Yeniden çizim geri çağrısı kaydeder.
   *
   * Bileşenler kendi metinlerini HESAPLAYAN yer (Inspector alan etiketleri,
   * AssetPanel kart ipuçları, durum çubuğu sayaçları) buradan bildirilir.
   *
   * @param {string} ad  benzersiz (bileşen adı) — ikinci kayıt üstüne yazar
   * @param {Function} fn
   * @returns {() => void} kaydı silen fonksiyon
   */
  register(ad, fn) {
    this._yenidenCiz.set(ad, fn);
    return () => { if (this._yenidenCiz.get(ad) === fn) this._yenidenCiz.delete(ad); };
  }

  /** @param {string} ad */
  unregister(ad) {
    this._yenidenCiz.delete(ad);
  }

  /**
   * Aktif dili DOM'a uygular: önce tara, sonra yeniden çiz.
   *
   * SIRA ÖNEMLİ: tarama `index.html`'deki statik metinleri ve buton
   * etiketlerini halleder; yeniden çizim bileşenlerin kendi ağacını kurar.
   * Ters sırada, tarama bileşenin yeni düğümlerini göremez.
   */
  apply(kok = this.doc) {
    this._tara(kok);
    for (const fn of [...this._yenidenCiz.values()]) {
      try {
        fn(this._language);
      } catch (err) {
        console.error('[i18n] yeniden çizim hatası:', err);
      }
    }
  }

  /** @private dil değişiminde çağrılır */
  _uygula() {
    this.apply(this.doc);
  }

  /**
   * `data-i18n` ve `data-i18n-attr` taşıyan düğümleri günceller.
   *
   * data-i18n        : düğümün metnini çözer
   * data-i18n-args   : JSON değişken nesnesi (isteğe bağlı)
   * data-i18n-attr   : `title:anahtar;placeholder:anahtar` — öznitelikleri çözer
   *
   * GÜVENLİK: metin yazılırken düğümün ÇOCUK ÖĞESİ varsa atlanır ve
   * uyarılır. `textContent = ...` onları da silerdi; bir düğme
   * `<svg><span>Etiket</span></svg>` yapıyorsa (üst çubuktaki sekmeler)
   * sessizce ikonu yok ederdik.
   *
   * @param {ParentNode} kok
   * @returns {number} güncellenen düğüm sayısı
   */
  _tara(kok) {
    if (!kok?.querySelectorAll) return 0;
    let sayac = 0;

    for (const dugum of kok.querySelectorAll('[data-i18n]')) {
      const anahtar = dugum.getAttribute('data-i18n');
      if (!anahtar) continue;
      if (dugum.firstElementChild) {
        console.warn(`[i18n] "${anahtar}" elemanında çocuk düğüm var; metin yazılmadı ` +
          '(içine gömülü etiketlerde data-i18n kullanmayın)');
        continue;
      }
      dugum.textContent = this._dizinleCoz(dugum, anahtar);
      sayac++;
    }

    for (const dugum of kok.querySelectorAll('[data-i18n-attr]')) {
      const ciftler = dugum.getAttribute('data-i18n-attr');
      if (!ciftler) continue;
      const args = this._argOku(dugum);
      for (const cift of ciftler.split(AYIRICI)) {
        const ayirac = cift.indexOf(':');
        if (ayirac < 0) continue;
        const ozellik = cift.slice(0, ayirac).trim();
        const anahtar = cift.slice(ayirac + 1).trim();
        if (!ozellik || !anahtar) continue;
        dugum.setAttribute(ozellik, this._tekCoz(anahtar, args));
        sayac++;
      }
    }
    return sayac;
  }

  /** data-i18n düğümü: argümanları oku, çöz. */
  _dizinleCoz(dugum, anahtar) {
    return this._tekCoz(anahtar, this._argOku(dugum));
  }

  /** data-i18n-args JSON'unu güvenle ayrıştırır. */
  _argOku(dugum) {
    const ham = dugum.getAttribute('data-i18n-args');
    if (!ham) return null;
    try {
      return JSON.parse(ham);
    } catch {
      console.warn(`[i18n] data-i18n-args JSON değil: "${ham}"`);
      return null;
    }
  }

  /**
   * Anahtarı çözer, YALNIZCA eksikse uyarır.
   * (t() uyarıyı zaten basıyor; burada tekrar basmamak için ayrı yol.)
   */
  _tekCoz(anahtar, args) {
    const cift = this._cozulCift(anahtar, args);
    if (cift !== null) return degistir(cift, args);
    this._eksikBildir(anahtar);
    return anahtar;
  }

  /* =======================================================================
     HTML <title> ve belge dili
     ======================================================================= */

  /** Uygulama açılışında çağrılır: <title> ve <html lang> senkronlanır. */
  belgeyiHazirla() {
    this.doc.documentElement?.setAttribute('lang', this._language);
    this.doc.title = this.t('app.title');
  }
}

/**
 * Uygulama genelinde tek örnek.
 *
 * Neden `Store` DEĞİL de ayrı? Bkz. dosya başlığı: dil proje verisi
 * değildir. Bu tekil, `dom.js` gibi alttaki yardımcıların sözlüğe
 * bağımlı olabilmesini sağlar (import döngüsü oluşmaz).
 */
export const i18n = new I18nManager();

/** Kısa yol — `import { t } from '.../I18nManager.js'`. */
export const t = (anahtar, degiskenler) => i18n.t(anahtar, degiskenler);
