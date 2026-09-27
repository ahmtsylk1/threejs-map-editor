/**
 * AssetPanel.js
 * ---------------------------------------------------------------------------
 * Sol üst panel: kategorilere ayrılmış asset ızgarası + arama kutusu.
 *
 * İKİ KAYNAK:
 *  1. Statik katalog (`ASSETS`) — kutu, ağaç, koni, NPC… her zaman var.
 *  2. Dış model kitaplığı (`ImportedAssetLibrary`) — `scan-assets.mjs` ile
 *     taranan glTF/GLB/OBJ modelleri. ASENKRON yüklenir; panel hazır
 *     olduğunda `render()` yeniden çağrılır ve kategori eklenir.
 *
 * İkisi tek arama kutusunda, tek ızgara düzeninde görünür — kullanıcı
 * ayrım yapmaz, sadece arar ve sürükler.
 *
 * Etkileşim:
 *  - TIKLAMA  -> asset'i kameranın hedef noktasına (Odakla) ekler
 *  - SÜRÜKLE  -> HTML5 dragstart ile viewport'a bırakılır (dünya konumu fareye düşer)
 *  - Çift tık -> hızlı ekleme
 */
import { el, qs, setDragPayload } from '../utils/dom.js';
import {
  ASSETS, CATEGORIES, getAssetIcon, getAssetColor, getCategoryLabel,
} from '../assets/catalog.js';
import { IMPORT_PREFIX, THUMB_VARSAYILAN } from '../io/ImportedAssetLibrary.js';
import { i18n, I18N_EVENT } from '../core/I18nManager.js';
import { n } from '../i18n/format.js';

/** Dış kitaplık kategorisinin başlığı. */
const KUTUPHANE_BASLIGI = 'World of Claudecraft';

export class AssetPanel {
  /**
   * @param {import('../core/Store.js').Store} store
   * @param {Object} handlers
   *   onAdd(assetId, position)  → nesne ekle
   *   library                   → ImportedAssetLibrary (isteğe bağlı)
   */
  constructor(store, handlers = {}) {
    this.store = store;
    this.handlers = handlers;
    this.library = handlers.library || null;
    this.root = qs('#assetCategories');
    this.search = qs('#assetSearch');
    this.countChip = qs('#assetCountChip');
    this._filter = '';

    // Kütüphane hazır olduğunda panel kendini yeniler
    if (this.library) {
      this.library.init().then((s) => {
        if (s.status === 'ready') this.render();
      }).catch(() => { /* kütüphane yoksa panel statik assetlerle çalışır */ });
    }

    this._bindSearch();
    // Dil değişince kart etiketleri, kategori başlıkları, sayaç ve ipuçları
    // yeniden üretilir. Kayıt, tarama yerine geçer: bu panelin metinleri
    // canlı veriye (kategori adı, model sayısı, dosya boyutu) bağlı.
    i18n.register('assetPanel', () => this.render());
    this.render();          // panel ilk açılışta bir kez çizilir
  }

  _bindSearch() {
    this.search.addEventListener('input', () => {
      this._filter = this.search.value.trim().toLocaleLowerCase('tr');
      this.render();
    });
    // '/' ile arama kutusuna odaklan
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        this.search.focus();
        this.search.select();
      }
    });
  }

  /**
   * Paneli yeniden çizer.
   *
   * 1390 modeli tek seferde DOM'a basmak performansı öldürür (~4000 düğüm).
   * Bu yüzden:
   *   - arama BOŞSA kategori başına en fazla `GOSTERIM_LIMITI` kart,
   *   - arama DOLUYSA eşleşenlerin tamamı (en fazla `ARAMA_LIMITI`).
   */
  render() {
    if (!this.root) return;
    this.root.innerHTML = '';

    const statik = ASSETS.filter((a) => !a.hidden && this._matchesStatik(a));
    const dis = this._disAssetler();
    const toplam = statik.length + dis.length;

    // Sayaç: "158 asset · 12 kitaplık"
    this.countChip.textContent = !toplam
      ? i18n.t('asset.count.zero')
      : (this.library?.ready
        ? i18n.t('asset.count.library', { count: n(toplam), kitap: n(this.library.categories.length) })
        : i18n.t('asset.count', { count: n(toplam) }));

    if (!toplam) {
      this.root.append(el('div.empty', { i18n: 'asset.empty' }));
      return;
    }

    // --- statik kategoriler ------------------------------------------------
    for (const category of CATEGORIES) {
      const items = statik.filter((a) => a.category === category.id);
      if (!items.length) continue;
      this.root.append(el('div', {}, [
        el('div.asset-cat-title', { text: i18n.t('asset.cat.count', { label: getCategoryLabel(category.id), count: n(items.length) }) }),
        el('div.asset-grid', {}, items.map((a) => this._createCard(a))),
      ]));
    }

    // --- dış kitaplık ------------------------------------------------------
    for (const kategori of this.library?.categories || []) {
      const items = dis.filter((e) => e.kategori === kategori.id);
      if (!items.length) continue;

      const aramaVar = this._filter.length > 0;
      const gosterilecek = aramaVar ? items : items.slice(0, GOSTERIM_LIMITI);
      // Arama boşken liste kırpılır; kaç tanesinin gizlendiğini dürüstçe söyle.
      const baslik = !aramaVar && gosterilecek.length < items.length
        ? i18n.t('asset.cat.first', {
          label: kategori.etiket,
          count: n(items.length),
          gosterilen: n(gosterilecek.length),
        })
        : i18n.t('asset.cat.count', { label: kategori.etiket, count: n(items.length) });

      const blok = el('div', {}, [
        el('div.asset-cat-title', { text: baslik }),
        el('div.asset-grid', {}, gosterilecek.map((e) => this._createImportedCard(e))),
      ]);

      // Kesilen gösterimde "tümünü göster" düğmesi
      if (gosterilecek.length < items.length) {
        const daha = el('button.asset-more', {
          type: 'button',
          i18n: 'asset.more',
          i18nArgs: { count: n(items.length - gosterilecek.length) },
        });
        daha.addEventListener('click', () => {
          this._filter = this._filter || kategori.id;   // arama ile daralt
          this.search.value = this._filter;
          this.render();
        });
        blok.append(daha);
      }
      this.root.append(blok);
    }
  }

  /** Statik katalogda arama eşleşmesi. */
  _matchesStatik(asset) {
    if (asset.hidden) return false;
    if (!this._filter) return true;
    const haystack = `${asset.name} ${asset.id} ${asset.category}`.toLocaleLowerCase('tr');
    return haystack.includes(this._filter);
  }

  /** Dış kitaplıkta arama eşleşmesi (+ sonuç sınırı). */
  _disAssetler() {
    if (!this.library?.ready) return [];
    const hepsi = this.library.list();
    if (!this._filter) return hepsi.slice(0, GOSTERIM_LIMITI * 2);
    return hepsi
      .filter((e) => this.library.searchMetni(e.id).includes(this._filter))
      .slice(0, ARAMA_LIMITI);
  }

  /* -----------------------------------------------------------------------
     Kartlar
     --------------------------------------------------------------------- */

  _createCard(asset) {
    const card = el('div.asset-card', {
      i18nAttr: { title: 'asset.tip.static' },
      draggable: 'true',
      dataset: { assetId: asset.id },
    }, [
      el('div', { html: getAssetIcon(asset.id), style: { color: getAssetColor(asset.id) } }),
      el('i', { i18n: asset.nameKey }),
    ]);

    // İpucu canlı veriye bağlı (ad + ölçü) → `i18n` değil elle yazılır.
    // `el()` önce anahtarla çözdü; şimdi dili hesaba katan tam metni koyuyoruz.
    card.title = i18n.t('asset.tip.static', {
      ad: i18n.t(asset.nameKey),
      olcu: asset.footprint.join(' × '),
    });

    card.addEventListener('click', () => this.handlers.onAdd?.(asset.id, null));

    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      setDragPayload(e, { assetId: asset.id });
      e.dataTransfer.setDragImage(card, 40, 40);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.handlers.onAdd?.(asset.id, null);
    });

    return card;
  }

  /**
   * Dış kitaplık modeli için kart.
   *
   * GÖRSEL ÖNCİLEME
   * ----------------
   * `entry.thumb` varsa `<img>` yerleştirilir. Üç performans kuralı:
   *
   *  1. `loading="lazy"`   — görsel yalnızca kadraja GİRDİĞİNDE indirilir.
   *     12 kategoride yüzlerce kart olsa bile yalnızca görünen ~20 tanesi
   *     ağ isteği yapar. IntersectionObserver ile elle "src atama" yerine
   *     yerleşik `loading="lazy"` kullanılır: aynı sonucu verir ama panele
   *     ek kod ve ek bir gözlemci maliyeti getirmez.
   *  2. `decoding="async"` — PNG decode'u ana iş parçacığını bloklamaz.
   *  3. `width`/`height`  — görsel yüklenmeden önce yer ayrılır; yüzlerce
   *     kartın "layout thrash" yapmasını (her yüklemede 400 kez yeniden
   *     yerleşim) engeller.
   *
   * Kartın TOOLTIP'i modelin gerçek teknik bilgisini gösterir; kullanıcı
   * sahneye sürüklemeden önce "bunun 12k üçgeni mi var, animasyonu mu var"
   * sorusunu cevaplayabilmelidir.
   */
  _createImportedCard(entry) {
    const KB = entry.boyut >= 1048576
      ? i18n.t('asset.unit.mb', { size: (entry.boyut / 1048576).toFixed(1) })
      : i18n.t('asset.unit.kb', { size: n(Math.max(1, Math.round(entry.boyut / 1024))) });

    // Tooltip çok satırlı; her satır bir sözlük anahtarı. Sıra TEKNİK BİLGİ
    // (kategori/üçgen/…) sonra EYLEM ipucu — çünkü eylem ipucu en sonda
    // görünür kalsın.
    const satirlar = [
      entry.ad,
      `${i18n.t('asset.tip.kat')} : ${entry.kategori}`,
      `${i18n.t('asset.tip.ucgen')} : ${n(entry.ucgen)}`,
      `${i18n.t('asset.tip.kose')} : ${n(entry.kose)}`,
      `${i18n.t('asset.tip.mesh')} : ${entry.mesh}`,
      `${i18n.t('asset.tip.boyut')} : ${KB}`,
    ];
    if (entry.doku) satirlar.push(`${i18n.t('asset.tip.doku')} : ${entry.doku}`);
    if (entry.animasyon) satirlar.push(`${i18n.t('asset.tip.animasyon')} : ${entry.animasyon}`);
    if (entry.kemik) satirlar.push(`${i18n.t('asset.tip.kemik')} : ${entry.kemik}`);
    if (entry.ktx2) satirlar.push(i18n.t('asset.tip.ktx2'));
    if (entry.meshopt) satirlar.push(i18n.t('asset.tip.meshopt'));
    if (!entry.thumb) satirlar.push(i18n.t('asset.tip.nothumb'));
    if (entry.not) satirlar.push(i18n.t('asset.tip.warn', { not: entry.not }));
    satirlar.push('', i18n.t('asset.tip.action'));

    const gorsel = this._createThumb(entry);

    const card = el('div.asset-card.imported.has-thumb', {
      title: satirlar.join('\n'),
      draggable: 'true',
      dataset: { assetId: entry.id },
    }, [
      gorsel,
      el('i', { text: entry.ad }),
      el('span.badge', {
        text: entry.ucgen > 0 ? fmtKisa(entry.ucgen) : '—',
        title: i18n.t('asset.tip.triangles', { count: n(entry.ucgen) }),
      }),
    ]);

    card.addEventListener('click', () => this.handlers.onAdd?.(entry.id, null));

    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      // Editor bu payload'ı okuyup addAsset() çağırır
      setDragPayload(e, { assetId: entry.id });
      e.dataTransfer.setDragImage(card, 40, 40);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.handlers.onAdd?.(entry.id, null);
    });

    return card;
  }

  /**
   * Thumbnail düğümü üretir; görsel yoksa fallback ikon döner.
   *
   * @param {Object} entry kütüphane kaydı
   * @returns {HTMLElement} `.thumb` kapsayıcısı
   */
  _createThumb(entry) {
    const tur = this.library?.thumbSize || THUMB_VARSAYILAN;

    const zemin = el('div.thumb', {
      style: { aspectRatio: '1 / 1' },
    });

    // --- thumbnail yok: doğrudan fallback ---------------------------
    if (!entry.thumb) {
      zemin.classList.add('is-fallback');
      zemin.append(el('div.thumb-fallback', { html: IMPORT_ICON }));
      return zemin;
    }

    zemin.classList.add('is-loading');

    const img = el('img', {
      src: entry.thumb,
      alt: '',                 // dekoratif: ad zaten kartta yazıyor
      loading: 'lazy',
      decoding: 'async',
      width: tur,
      height: tur,
      draggable: 'false',     // kart sürüklemesi bozulmasın
    });

    img.addEventListener('load', () => {
      zemin.classList.remove('is-loading');
      zemin.classList.add('is-ready');
    }, { once: true });

    // 404 / bozuk PNG → sessizce fallback'e düş
    img.addEventListener('error', () => {
      zemin.classList.remove('is-loading');
      zemin.classList.add('is-fallback');
      zemin.append(el('div.thumb-fallback', { html: IMPORT_ICON }));
      img.remove();
    }, { once: true });

    zemin.append(img);
    return zemin;
  }
}

/* -------------------------------------------------------------------------
   Sabitler / yardımcılar
   ------------------------------------------------------------------------- */

/** Arama boşken kategori başına gösterilecek kart sayısı. */
const GOSTERIM_LIMITI = 60;

/** Arama yaparken en fazla gösterilecek model sayısı. */
const ARAMA_LIMITI = 300;

/**
 * Küp ikonu (fallback).
 *
 * DİKKAT — `<svg>` SARMAYICI ZORUNLUDUR. Katalogdaki `I()` kurucusu
 * (`catalog.js:19`) sarmalayıcıyı kendisi ekler; burada elle yazıldığı için
 * atlanırsa tarayıcı `<path>` öğelerini HTML bağlamında geçersiz sayar ve
 * HİÇBİR ŞEY ÇİZMEZ. Bu hata önceden de vardı (ikon hiç görünmüyordu),
 * thumbnail fallback'ine taşınırken fark edildi.
 */
const IMPORT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 2.8 20.5 7.4v9.2L12 21.2 3.5 16.6V7.4L12 2.8Z"/>' +
  '<path d="M12 12 20.5 7.4M12 12v9.2M12 12 3.5 7.4" opacity=".6"/>' +
  '<path d="M9 10.4 15.5 7M9 13.6 15.5 17" opacity=".45"/>' +
  '</svg>';

/** 12345 → "12k" */
function fmtKisa(n) {
  if (n < 1000) return String(n);
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1000000).toFixed(1)}M`;
}
