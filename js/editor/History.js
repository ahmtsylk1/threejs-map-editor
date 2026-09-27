/**
 * History.js
 * ---------------------------------------------------------------------------
 * Geri al / ileri al (undo-redo) yığını.
 *
 * Yöntem: SNAPSHOT. Değişiklikten hemen önce (begin) tüm nesne koleksiyonu
 * JSON metnine serileştirilir; değişiklik bittiğinde (commit) bu metin
 * yığına eklenir. Geri alma, bir önceki metni yeniden yükler.
 *
 *  - Gizmo sürüklemesi: pointerdown'da begin, pointerup'ta commit
 *    (TransformTool bunu otomatik çağırır).
 *  - Inspector alan düzenlemesi: input:focus -> begin, input:blur -> commit.
 *  - Toplu işlemler (silme, içe aktarma, harita boyutu): tek begin/commit.
 */
import { EVENT } from '../core/Store.js';

const LIMIT = 120;

export class History {
  /** @param {import('../core/Store.js').Store} store */
  constructor(store) {
    this.store = store;
    /** @type {{label:string, state:string}[]} */
    this._undo = [];
    /** @type {{label:string, state:string}[]} */
    this._redo = [];
    this._pending = null;      // { label, state }
    this._applying = false;
  }

  /* =======================================================================
     Serileştirme
     ======================================================================= */

  _snapshot() {
    return JSON.stringify({
      objects: this.store.objects,
      selection: this.store.selection,
      map: { size: this.store.map.size, cellSize: this.store.map.cellSize },
    });
  }

  /**
   * @param {import('../core/Store.js').Store} store
   * @param {string} state
   * @param {string} label
   */
  _restore(state, label) {
    this._applying = true;
    try {
      const data = JSON.parse(state);
      this.store.replaceObjects(data.objects, data.selection || []);
      const sizeChanged = data.map && data.map.size !== this.store.map.size;
      if (sizeChanged) this.store.setMap({ size: data.map.size, cellSize: data.map.cellSize });
      this._notify(label);
    } catch (err) {
      console.error('[History] geri yükleme hatası:', err);
      this.store.toast('Geçmiş geri yüklenemedi', 'error');
    } finally {
      this._applying = false;
    }
  }

  _notify(label) {
    this.store.emit(EVENT.HISTORY_CHANGE, {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoLabel: this.undoLabel,
      redoLabel: this.redoLabel,
      applying: this._applying,
    });
  }

  /* =======================================================================
     Genel API
     ======================================================================= */

  /**
   * Değişiklikten ÖNCE çağrılır. İç içe çağrılarda ilk çağrı geçerlidir.
   * @param {string} label
   */
  begin(label = 'değişiklik') {
    if (this._pending || this._applying) return;
    this._pending = { label, state: this._snapshot() };
  }

  /**
   * Değişiklikten SONRA çağrılır. Gerçekte bir fark yoksa yığın bozulmaz.
   */
  commit() {
    if (!this._pending) return false;
    const { label, state: before } = this._pending;
    this._pending = null;
    const after = this._snapshot();
    if (before === after) { this._notify(); return false; }

    this._undo.push({ label, state: before });
    if (this._undo.length > LIMIT) this._undo.shift();
    this._redo.length = 0;
    this._notify();
    return true;
  }

  /** İç içe kullanım için: begin + commit tek adımda. */
  run(label, fn) {
    this.begin(label);
    const result = fn();
    this.commit();
    return result;
  }

  /** @returns {boolean} işlem yapıldıysa true */
  undo() {
    if (this._applying) return false;
    if (this._pending) {
      // Henüz commit edilmemiş bir değişiklik var: önce onu geri al
      const label = this._pending.label;
      const before = this._pending.state;
      this._pending = null;
      this._redo.push({ label, state: this._snapshot() });
      this._restore(before, label);
      this._notify(label);
      return true;
    }
    const entry = this._undo.pop();
    if (!entry) return false;
    this._redo.push({ label: entry.label, state: this._snapshot() });
    this._restore(entry.state, entry.label);
    this._notify(entry.label);
    return true;
  }

  /** @returns {boolean} */
  redo() {
    if (this._applying || this._pending) return false;
    const entry = this._redo.pop();
    if (!entry) return false;
    this._undo.push({ label: entry.label, state: this._snapshot() });
    this._restore(entry.state, entry.label);
    this._notify(entry.label);
    return true;
  }

  /** Geçmişi temizler (yeni harita). */
  clear() {
    this._undo.length = 0;
    this._redo.length = 0;
    this._pending = null;
    this._notify();
  }

  get canUndo() { return !!this._pending || this._undo.length > 0; }
  get canRedo() { return !this._pending && this._redo.length > 0; }
  get undoLabel() { return this._pending ? this._pending.label : (this._undo.at(-1)?.label ?? null); }
  get redoLabel() { return this._redo.at(-1)?.label ?? null; }
  get isApplying() { return this._applying; }
}
