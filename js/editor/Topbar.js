/**
 * Topbar.js
 * ---------------------------------------------------------------------------
 * Üst çubuk: harita boyutu, görünüm anahtarları, geri/ileri, önizleme,
 * dosya işlemleri, viewport üstü transform araçları ve dil seçici.
 *
 * i18n NOTU
 * ---------
 * Bu bileşende iki tür metin vardır ve İKİSİ DE yeniden çizilir:
 *   - `sync()` her Store olayında çağrıldığı için, dil değişiminde yeniden
 *     yazılması gereken TOOLTIP'ler (`Geri al: …`) burada üretilir.
 *   - Düğme etiketleri `index.html`'de `data-i18n` ile işaretlidir; I18nManager
 *     tarayarak halleder. Topbar yalnızca JS ile üretilen DİL düğmelerini
 *     `register()` ile bildirir.
 */
import { qs, qsa, el } from '../utils/dom.js';
import { EVENT, MAP_SIZES, CELL_SIZES } from '../core/Store.js';
import { i18n, I18N_EVENT } from '../core/I18nManager.js';

export class Topbar {
  /**
   * @param {import('../core/Store.js').Store} store
   * @param {Object} handlers
   */
  constructor(store, handlers = {}) {
    this.store = store;
    this.handlers = handlers;
    this._bindMapSize();
    this._bindCellSize();
    this._bindViewToggles();
    this._bindModeGroups();
    this._bindButtons();
    this._buildLanguagePicker();
    this._bindStore();
    // Dil değişince yalnızca JS üretimi metinler tazelenir (etiketler tarama ile)
    i18n.on(I18N_EVENT.CHANGE, () => this.sync());
    this.sync();
  }

  /* =======================================================================
     Harita boyutu
     ======================================================================= */
  _bindMapSize() {
    const group = qs('#mapSizeGroup');
    for (const btn of qsa('.seg', group)) {
      btn.addEventListener('click', () => {
        const size = Number(btn.dataset.size);
        if (size === this.store.map.size) return;
        this.handlers.onMapSize?.(size);
      });
    }
  }

  _bindCellSize() {
    const select = qs('#cellSizeSelect');
    for (const c of CELL_SIZES) {
      if (![...select.options].some((o) => o.value === String(c))) {
        select.append(el('option', { value: String(c), text: String(c) }));
      }
    }
    select.addEventListener('change', () => {
      this.handlers.onCellSize?.(Number(select.value));
    });
  }

  /* =======================================================================
     Görünüm anahtarları
     ======================================================================= */
  _bindViewToggles() {
    for (const btn of qsa('#viewToggles .toggle')) {
      btn.addEventListener('click', () => {
        const key = btn.dataset.toggle;
        this.handlers.onToggle?.(key);
      });
    }
  }

  /* =======================================================================
     Transform araçları (viewport köşesi)
     ======================================================================= */
  _bindModeGroups() {
    for (const btn of qsa('#modeGroup .seg')) {
      btn.addEventListener('click', () => this.handlers.onMode?.(btn.dataset.mode));
    }
    for (const btn of qsa('#spaceGroup .seg')) {
      btn.addEventListener('click', () => this.handlers.onSpace?.(btn.dataset.space));
    }
    const rotSnap = qs('#rotSnapToggle');
    rotSnap.addEventListener('change', () => this.handlers.onRotationSnap?.(rotSnap.checked));
  }

  /* =======================================================================
     Butonlar
     ======================================================================= */
  _bindButtons() {
    qs('#btnUndo').addEventListener('click', () => this.handlers.onUndo?.());
    qs('#btnRedo').addEventListener('click', () => this.handlers.onRedo?.());
    qs('#btnPlay').addEventListener('click', () => this.handlers.onPlay?.());
    qs('#btnNew').addEventListener('click', () => this.handlers.onNew?.());
    qs('#btnSave').addEventListener('click', () => this.handlers.onSave?.());
    qs('#btnLoad').addEventListener('click', () => this.handlers.onLoad?.());
    qs('#btnExport').addEventListener('click', () => this.handlers.onExport?.());
    qs('#btnImport').addEventListener('click', () => this.handlers.onImport?.());
    qs('#btnHelp').addEventListener('click', () => this.handlers.onHelp?.());
    qs('#btnFocus').addEventListener('click', () => this.handlers.onFocus?.());
    qs('#btnFrameAll').addEventListener('click', () => this.handlers.onFrameAll?.());
    qs('#btnTopView').addEventListener('click', () => this.handlers.onTopView?.());
  }

  /* =======================================================================
     DİL SEÇİCİ
     ======================================================================= */
  /**
   * TR / EN segmentli düğmelerini üretir.
   *
   * Erişilebilirlik: `role="radiogroup"` + her düğmede `role="radio"` ve
   * `aria-checked`. Çoklu düğmeli `toggle` grubu yerine radiogroup kullanılır
   * çünkü seçim karşılıklı dışlayandır (bir dil aynı anda seçilemez).
   *
   * Etiketler `lang.short.*` anahtarlarından gelir; TAM adı `title`
   * özniteliğinde ve `aria-label`'da taşınır, böylece "TR" kısaltması
   * ekran okuyucuya "Türkçe" olarak duyurulur.
   */
  _buildLanguagePicker() {
    const group = qs('#langGroup');
    if (!group) return;
    group.innerHTML = '';

    for (const { kod, ad } of i18n.languages) {
      const btn = el('button.seg', {
        type: 'button',
        role: 'radio',
        dataset: { lang: kod },
        i18n: `lang.short.${kod}`,
        i18nAttr: { title: `lang.${kod}`, 'aria-label': `lang.${kod}` },
        // Kısa kod etiketi dil adı olsa da "TR" harfleri aynı kalır; yine de
        // her dil değişiminde tazelenmeleri doğru olur.
        onclick: () => i18n.setLanguage(kod),
      });
      btn.title = ad;
      btn.setAttribute('aria-label', ad);
      group.append(btn);
    }
    this._syncLanguagePicker();
  }

  /** Aktif dil düğmesini işaretler. */
  _syncLanguagePicker() {
    const group = qs('#langGroup');
    if (!group) return;
    for (const btn of qsa('.seg', group)) {
      const aktif = btn.dataset.lang === i18n.language;
      btn.classList.toggle('is-active', aktif);
      btn.setAttribute('aria-checked', String(aktif));
    }
  }

  /* =======================================================================
     Store dinleme
     ======================================================================= */
  _bindStore() {
    this.store.on(EVENT.MAP_CHANGE, () => this.sync());
    this.store.on(EVENT.MODE_CHANGE, () => this.sync());
    this.store.on(EVENT.HISTORY_CHANGE, () => this.sync());
    this.store.on(EVENT.PLAY_CHANGE, () => this.sync());
    this.store.on(EVENT.TOAST, ({ message, kind }) => this.handlers.onToast?.(message, kind));
  }

  /* =======================================================================
     Görsel senkronizasyon
     ======================================================================= */
  sync() {
    const map = this.store.map;

    // Harita boyutu
    for (const btn of qsa('#mapSizeGroup .seg')) {
      btn.classList.toggle('is-active', Number(btn.dataset.size) === map.size);
    }
    // Desteklenmeyen boyutlar için segmenti temizle
    if (!MAP_SIZES.includes(map.size)) {
      for (const btn of qsa('#mapSizeGroup .seg')) btn.classList.remove('is-active');
    }

    // Hücre boyutu
    const cellSelect = qs('#cellSizeSelect');
    if (cellSelect && Number(cellSelect.value) !== map.cellSize) cellSelect.value = String(map.cellSize);

    // Görünüm anahtarları
    for (const btn of qsa('#viewToggles .toggle')) {
      btn.classList.toggle('is-active', !!map[btn.dataset.toggle]);
    }

    // Mod / uzay
    for (const btn of qsa('#modeGroup .seg')) {
      btn.classList.toggle('is-active', btn.dataset.mode === this.store.mode);
    }
    for (const btn of qsa('#spaceGroup .seg')) {
      btn.classList.toggle('is-active', btn.dataset.space === this.store.space);
    }
    const rotSnap = qs('#rotSnapToggle');
    if (rotSnap) rotSnap.checked = !!this.store.rotationSnap;

    // Geri / ileri
    const undoBtn = qs('#btnUndo');
    const redoBtn = qs('#btnRedo');
    undoBtn.disabled = !this.handlers.canUndo?.();
    redoBtn.disabled = !this.handlers.canRedo?.();
    undoBtn.title = this.handlers.undoLabel?.()
      ? i18n.t('topbar.undo.with', { ad: this.handlers.undoLabel() })
      : i18n.t('topbar.btn.undo.title');
    redoBtn.title = this.handlers.redoLabel?.()
      ? i18n.t('topbar.redo.with', { ad: this.handlers.redoLabel() })
      : i18n.t('topbar.btn.redo.title');

    // Önizleme
    const playBtn = qs('#btnPlay');
    playBtn.classList.toggle('is-playing', this.store.playing);
    playBtn.title = this.store.playing
      ? i18n.t('topbar.btn.play.stop.title')
      : i18n.t('topbar.btn.play.title');

    // Dil seçici
    this._syncLanguagePicker();
  }
}
