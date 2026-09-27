/**
 * Outliner.js
 * ---------------------------------------------------------------------------
 * Sol alt panel: sahne ağacı listesi.
 *
 * Satır içi özellikler:
 *  - Görünürlük (göz) ve kilit (asma kilit) düğmeleri
 *  - Çift tık ile yeniden adlandırma
 *  - Seçili satır vurgusu, hover satır vurgusu
 *  - Kategorilere göre gruplama
 */
import { el, qs, ICONS, svg } from '../utils/dom.js';
import { EVENT } from '../core/Store.js';
import { getAssetIcon, getAssetName, getCategoryLabel } from '../assets/catalog.js';
import { CATEGORIES } from '../assets/catalog.js';
import { fmt } from '../utils/math.js';
import { i18n } from '../core/I18nManager.js';

export class Outliner {
  /**
   * @param {import('../core/Store.js').Store} store
   * @param {{ onSelect:(id, e)=>void, onToggleVisible:(id)=>void,
   *           onToggleLock:(id)=>void, onRename:(id, name)=>void }} handlers
   */
  constructor(store, handlers) {
    this.store = store;
    this.handlers = handlers;
    this.root = qs('#outlinerList');
    this._rows = new Map();      // id -> {row, nameEl, visBtn, lockBtn, metaEl}

    this._bindStore();
    this._bindToolbar();
    // Grup başlıkları ve boş durum metni dile bağlı → yeniden çizim gerekli.
    i18n.register('outliner', () => this.render());
    this.render();
  }

  _bindStore() {
    this.store.on(EVENT.OBJECTS_REPLACE, () => this.render());
    this.store.on(EVENT.OBJECT_ADD, () => this.render());
    this.store.on(EVENT.OBJECT_REMOVE, () => this.render());
    this.store.on(EVENT.SELECTION_CHANGE, () => this._syncSelection());
    // Sıcak yol: yalnızca değişen satırın konum bilgisini tazele
    this.store.on(EVENT.OBJECT_UPDATE, ({ record }) => {
      this._syncMeta(record);
      if (this._builtFor === record.id) this._syncRow(record);
    });
    this.store.on('hover:change', (id) => this._syncHover(id));
  }

  _bindToolbar() {
    qs('#btnSelectAll')?.addEventListener('click', () => this.handlers.onSelectAll?.());
    qs('#btnDeleteSel')?.addEventListener('click', () => this.handlers.onDelete?.());
  }

  /* =======================================================================
     Çizim
     ======================================================================= */
  render() {
    if (!this.root) return;
    this.root.innerHTML = '';
    this._rows.clear();

    if (!this.store.objects.length) {
      this.root.append(el('div.empty', {}, [
        svg(ICONS.cube(30)),
        el('b', { i18n: 'outliner.empty.title' }),
        el('p', { i18n: 'outliner.empty.body' }),
      ]));
      return;
    }

    for (const category of CATEGORIES) {
      const items = this.store.objects.filter((o) => o.category === category.id);
      if (!items.length) continue;
      this.root.append(el('div.out-group-title', {
        text: i18n.t('asset.cat.count', { label: getCategoryLabel(category.id), count: items.length }),
      }));
      for (const record of items) this.root.append(this._createRow(record));
    }

    this._syncSelection();
  }

  _createRow(record) {
    const nameEl = el('span.out-name', {
      text: record.name,
      title: `${record.name}\n${getAssetName(record.assetId)}`,
    });
    const metaEl = el('span.out-meta', { text: '' });
    const visBtn = el('button.out-btn', { type: 'button', i18nAttr: { title: 'outliner.btn.visible.title' } });
    const lockBtn = el('button.out-btn', { type: 'button', i18nAttr: { title: 'outliner.btn.lock' } });

    const row = el('div.out-row', { dataset: { id: record.id } }, [
      el('span.out-ic', { html: getAssetIcon(record.assetId) }),
      nameEl,
      metaEl,
      visBtn,
      lockBtn,
    ]);

    // Seçim
    row.addEventListener('click', (e) => {
      if (e.target.closest('.out-btn') || e.target.closest('input')) return;
      this.handlers.onSelect?.(record.id, e);
    });

    // Yeniden adlandırma
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this._startRename(record, nameEl);
    });

    // Görünürlük
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlers.onToggleVisible?.(record.id);
    });

    // Kilit
    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlers.onToggleLock?.(record.id);
    });

    this._rows.set(record.id, { row, nameEl, visBtn, lockBtn, metaEl });
    this._syncRow(record);
    return row;
  }

  _startRename(record, nameEl) {
    const input = el('input', { type: 'text', value: record.name });
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const finish = (commit) => {
      const value = input.value.trim();
      if (commit && value && value !== record.name) this.handlers.onRename?.(record.id, value);
      this.render();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
  }

  /* =======================================================================
     Senkronizasyon
     ======================================================================= */
  _syncRow(record) {
    const entry = this._rows.get(record.id);
    if (!entry) return;
    const { row, nameEl, visBtn, lockBtn } = entry;

    if (nameEl.tagName !== 'INPUT') nameEl.textContent = record.name;

    row.classList.toggle('is-hidden', !record.visible);
    visBtn.innerHTML = record.visible ? ICONS.eye(13) : ICONS.eyeOff(13);
    visBtn.classList.toggle('on', !record.visible);
    // `_syncRow` gizmo sürüklemesinde de çağrılır (sıcak yol); metin
    // değiştiğinde yeniden kurulmasın diye doğrudan yazılır, `data-i18n`
    // taraması dil değişiminde zaten bu düğmeleri güncelleyecek.
    visBtn.title = i18n.t(record.visible ? 'outliner.btn.hide' : 'outliner.btn.show');

    lockBtn.innerHTML = record.locked ? ICONS.lock(13) : ICONS.unlock(13);
    lockBtn.classList.toggle('on', record.locked);
    lockBtn.title = i18n.t(record.locked ? 'outliner.btn.unlock' : 'outliner.btn.lock');

    this._syncMeta(record);
  }

  /** Yalnızca koordinat etiketini günceller (gizmo sürüklemesinde sıcak yol). */
  _syncMeta(record) {
    const entry = this._rows.get(record?.id);
    if (!entry) return;
    entry.metaEl.textContent = `${fmt(record.position[0], 0)}, ${fmt(record.position[2], 0)}`;
  }

  _syncSelection() {
    const selected = new Set(this.store.selection);
    for (const [id, entry] of this._rows) {
      entry.row.classList.toggle('is-sel', selected.has(id));
    }
  }

  _syncHover(id) {
    for (const [rid, entry] of this._rows) {
      entry.row.classList.toggle('is-hover', rid === id);
    }
  }

  /** Seçili kaydı görünür alana kaydırır (klavye ile gezinirken). */
  reveal(id) {
    const entry = this._rows.get(id);
    entry?.row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
