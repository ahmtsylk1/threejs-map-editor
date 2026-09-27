/**
 * Store.js
 * ---------------------------------------------------------------------------
 * Editörün TEK DOĞRU KAYNAĞI (single source of truth).
 *
 * Sahnedeki Object3D'ler sadece "görünüm" katmanıdır; kalıcı veri (position /
 * rotation / scale / görünürlük / özel alanlar) burada, düz (plain) kayıt
 * nesneleri halinde tutulur. Bu sayede:
 *   - JSON dışa/içe aktarma çok basit,
 *   - geri al/yinele (undo/redo) anlık görüntü (snapshot) ile yapılabilir,
 *   - Inspector yalnızca veriyi okur/yazar, sahne nesnesine dokunmaz.
 *
 * EventBus'ı genişletir: tüm değişimler ilgili EVENT kodlarıyla yayınlanır.
 */
import { EventBus } from './EventBus.js';

/** Uygulama genelinde kullanılan olay adları. */
export const EVENT = {
  MAP_CHANGE: 'map:change',           // harita ayarları değişti
  OBJECT_ADD: 'object:add',           // tek nesne eklendi
  OBJECT_REMOVE: 'object:remove',     // nesne(ler) silindi
  OBJECT_UPDATE: 'object:update',     // tek nesne güncellendi
  OBJECTS_REPLACE: 'objects:replace', // tüm koleksiyon değişti (undo/import/clear)
  SELECTION_CHANGE: 'selection:change',
  HISTORY_CHANGE: 'history:change',
  MODE_CHANGE: 'mode:change',
  PLAY_CHANGE: 'play:change',
  TOAST: 'toast',
};

/** Desteklenen harita boyutları (birim). */
export const MAP_SIZES = [2048, 1024, 512];

/** Izgara hücre boyutu adayları. */
export const CELL_SIZES = [1, 2, 4, 8, 16, 32, 64];

/** Varsayılan harita ayarları. */
export function defaultMapState(size = 2048) {
  return {
    size,                                   // dünya genişliği/derinliği (birim)
    cellSize: size >= 2048 ? 8 : size >= 1024 ? 4 : 2,
    showGrid: true,
    showAxes: true,
    showBounds: true,
    showChecker: true,
    snap: true,                             // ızgaraya yapışma
    groundColor: '#1e242f',
    gridColor: '#3a4658',
    accentGridColor: '#5b83c2',
    fog: 0.35,                              // 0..1
  };
}

/**
 * Editör durumu.
 */
export class Store extends EventBus {
  constructor() {
    super();
    this.map = defaultMapState(2048);
    /** @type {Array<Object>} Sahnedeki tüm nesne kayıtları */
    this.objects = [];
    /** @type {string[]} Seçili nesne id'leri */
    this.selection = [];
    this.mode = 'translate';   // translate | rotate | scale
    this.space = 'world';      // world | local
    this.rotationSnap = false;
    this.playing = false;
  }

  /* ---------------- Nesne kayıtları ---------------- */

  getRecord(id) {
    return this.objects.find((o) => o.id === id) || null;
  }

  getSelectedRecords() {
    const set = new Set(this.selection);
    return this.objects.filter((o) => set.has(o.id));
  }

  addRecord(record) {
    this.objects.push(record);
    this.emit(EVENT.OBJECT_ADD, record);
    return record;
  }

  /**
   * Kayıtları siler.
   *
   * ÖNEMLİ: Silme, seçimi de ETKİLİYORSA `SELECTION_CHANGE` YAYINLANMALIDIR.
   * Aksi halde TransformControls, sahneden çıkarılmış (parent === null) bir
   * nesneye bağlı kalır ve three.js her karede
   * "The attached 3D object must be a part of the scene graph" uyarısı basar.
   */
  removeRecords(ids) {
    const set = new Set(ids);
    const removed = this.objects.filter((o) => set.has(o.id));
    if (!removed.length) return [];

    this.objects = this.objects.filter((o) => !set.has(o.id));
    const prevSelection = this.selection;
    this.selection = this.selection.filter((id) => !set.has(id));

    this.emit(EVENT.OBJECT_REMOVE, removed);
    if (prevSelection.length !== this.selection.length) {
      this.emit(EVENT.SELECTION_CHANGE, this.selection);
    }
    return removed;
  }

  /**
   * Bir kaydın alanlarını günceller ve OBJECT_UPDATE yayınlar.
   * @param {string} id
   * @param {Object} patch Değiştirilecek alanlar
   * @param {Object} [meta] { source: 'ui'|'gizmo'|'history' }
   */
  patchRecord(id, patch, meta = {}) {
    const rec = this.getRecord(id);
    if (!rec) return null;
    Object.assign(rec, patch);
    this.emit(EVENT.OBJECT_UPDATE, { record: rec, patch, source: meta.source || 'ui' });
    return rec;
  }

  /** Tüm kayıtları değiştirir (import / undo / clear). */
  replaceObjects(records, selection = []) {
    this.objects = records;
    this.selection = selection.filter((id) => records.some((r) => r.id === id));
    this.emit(EVENT.OBJECTS_REPLACE, { objects: this.objects, selection: this.selection });
    // Gizmo/Inspector/outliner seçim değişimini dinler; her zaman yayınla.
    this.emit(EVENT.SELECTION_CHANGE, this.selection);
  }

  /* ---------------- Seçim ---------------- */

  setSelection(ids) {
    const next = [...new Set(ids)];
    if (next.length === this.selection.length && next.every((v, i) => v === this.selection[i])) return;
    this.selection = next;
    this.emit(EVENT.SELECTION_CHANGE, this.selection);
  }

  toggleSelection(id) {
    const next = this.selection.includes(id)
      ? this.selection.filter((v) => v !== id)
      : [...this.selection, id];
    this.selection = next;
    this.emit(EVENT.SELECTION_CHANGE, this.selection);
  }

  clearSelection() {
    if (!this.selection.length) return;
    this.selection = [];
    this.emit(EVENT.SELECTION_CHANGE, this.selection);
  }

  /* ---------------- Harita ayarları ---------------- */

  setMap(patch) {
    Object.assign(this.map, patch);
    this.emit(EVENT.MAP_CHANGE, this.map);
  }

  /* ---------------- Editör modu ---------------- */

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.emit(EVENT.MODE_CHANGE, { mode, space: this.space });
  }

  setSpace(space) {
    if (this.space === space) return;
    this.space = space;
    this.emit(EVENT.MODE_CHANGE, { mode: this.mode, space });
  }

  setPlaying(playing) {
    if (this.playing === playing) return;
    this.playing = playing;
    this.emit(EVENT.PLAY_CHANGE, playing);
  }

  toast(message, kind = 'info') {
    this.emit(EVENT.TOAST, { message, kind });
  }
}
