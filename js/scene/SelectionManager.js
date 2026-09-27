/**
 * SelectionManager.js
 * ---------------------------------------------------------------------------
 * Fare ile nesne seçimi, hover algılama ve seçim görselleştirmesinden sorumludur.
 *
 *  - Raycast, kök gruplara (userData.editorId) eşlenir.
 *  - Tıklama vs. yörünge sürüklemesi "tıklamak için 5px" eşiğiyle ayrılır.
 *  - Shift+Sol tık çoklu seçim, Ctrl/Cmd+A tümünü seçer.
 *  - Kilitli nesneler seçilemez.
 *  - Her seçili nesne için sarı bir BoxHelper (kutu) gösterilir.
 */
import * as THREE from 'three';
import { EVENT } from '../core/Store.js';

const SEL_COLOR = 0xffd479;
const HOVER_COLOR = 0xffffff;

export class SelectionManager {
  /**
   * @param {import('./Viewport.js').Viewport} viewport
   * @param {import('../core/Store.js').Store} store
   * @param {import('../core/ObjectRegistry.js').ObjectRegistry} registry
   */
  constructor(viewport, store, registry) {
    this.viewport = viewport;
    this.store = store;
    this.registry = registry;

    /** Seçim görselleri için havuz: id -> THREE.BoxHelper */
    this._helpers = new Map();
    this._hoveredId = null;
    this._hoverHelper = null;
    this._raycastPending = false;

    this._bindStore();
    this._bindPointer();
  }

  /* =======================================================================
     Kurulum
     ======================================================================= */
  _bindStore() {
    // Seçim değişince görselleri güncelle
    this.store.on(EVENT.SELECTION_CHANGE, () => this.refreshVisuals());
    // Nesne eklendi/silindi/replace -> havuzu temizle
    this.store.on(EVENT.OBJECT_ADD, () => this.refreshVisuals());
    this.store.on(EVENT.OBJECT_REMOVE, () => this.refreshVisuals());
    this.store.on(EVENT.OBJECTS_REPLACE, () => this.refreshVisuals());
    this.store.on(EVENT.OBJECT_UPDATE, ({ record }) => this.refreshVisual(record.id));
  }

  _bindPointer() {
    this.viewport.on('pointermove', (info) => {
      // Hover raycast'ini kare başına bir kez çalıştır (maliyet kontrolü)
      if (this._raycastPending) return;
      this._raycastPending = true;
      requestAnimationFrame(() => {
        this._raycastPending = false;
        this._updateHover(info);
      });
    });

    this.viewport.on('pointerleave', () => this.setHovered(null));

    this.viewport.on('pointerup', (info) => {
      if (!info.isClick) return;
      if (info.button === 2) return;                   // sağ tuş: kamera
      const hit = this._pick(info);
      const id = hit?.id || null;

      if (info.shift) {
        if (id) this.store.toggleSelection(id);
        else this.store.clearSelection();
      } else {
        this.store.setSelection(id ? [id] : []);
      }
    });
  }

  /* =======================================================================
     Raycast
     ======================================================================= */

  /**
   * Fare altındaki nesneyi bulur.
   * @returns {{id:string, object:THREE.Object3D, point:THREE.Vector3, distance:number}|null}
   */
  _pick(info) {
    const roots = this.viewport.content.children.filter((c) => c.visible);
    if (!roots.length) return null;
    const hits = this.viewport.raycast(roots);
    for (const hit of hits) {
      const resolved = this._resolve(hit.object);
      if (resolved) return { ...resolved, point: hit.point, distance: hit.distance };
    }
    return null;
  }

  /** Bir mesh'ten yukarı doğru yürüyerek editör kaydına ulaşır. */
  _resolve(object) {
    let node = object;
    while (node) {
      const id = node.userData?.editorId;
      if (id) {
        const record = this.store.getRecord(id);
        if (record && !record.locked) return { id, object: node };
        return null;   // kilitli -> seçilemez
      }
      node = node.parent;
    }
    return null;
  }

  /* =======================================================================
     Hover
     ======================================================================= */
  _updateHover(info) {
    if (this.store.playing) return;             // önizlemede hover kapalı
    const hit = this._pick(info);
    this.setHovered(hit ? hit.id : null, hit?.object);
  }

  /**
   * @param {string|null} id
   * @param {THREE.Object3D} [object]
   */
  setHovered(id, object = null) {
    if (this._hoveredId === id) return;
    this._hoveredId = id;

    if (this._hoverHelper) {
      this.viewport.scene.remove(this._hoverHelper);
      this._hoverHelper.geometry.dispose();
      this._hoverHelper.material.dispose();
      this._hoverHelper = null;
    }
    if (id) {
      const obj = object || this.registry.getObject(id);
      if (obj) this._hoverHelper = this._makeHelper(obj, HOVER_COLOR, 0.9, 0.55);
    }
    this.store.emit('hover:change', id);
  }

  get hoveredId() {
    return this._hoveredId;
  }

  /* =======================================================================
     Görselleştirme
     ======================================================================= */
  _makeHelper(object, color, opacity = 1, inflate = 0) {
    const helper = new THREE.BoxHelper(object, new THREE.Color(color));
    helper.material.transparent = true;
    helper.material.opacity = opacity;
    helper.material.depthTest = true;
    helper.renderOrder = 998;
    if (inflate) helper.scale.multiplyScalar(1 + inflate);
    this.viewport.scene.add(helper);
    return helper;
  }

  /** Tüm seçim kutularını günceller. */
  refreshVisuals() {
    const wanted = new Set(this.store.selection);
    // Artık seçili olmayanları kaldır
    for (const [id, helper] of [...this._helpers]) {
      if (!wanted.has(id)) {
        this.viewport.scene.remove(helper);
        helper.geometry.dispose();
        helper.material.dispose();
        this._helpers.delete(id);
      }
    }
    for (const id of wanted) this.refreshVisual(id);
  }

  /** Tek bir kaydın kutusunu günceller (yoksa oluşturur). */
  refreshVisual(id) {
    const record = this.store.getRecord(id);
    const object = this.registry.getObject(id);

    if (!object) {
      const existing = this._helpers.get(id);
      if (existing) {
        this.viewport.scene.remove(existing);
        existing.geometry.dispose();
        existing.material.dispose();
        this._helpers.delete(id);
      }
      return;
    }
    let helper = this._helpers.get(id);
    if (!helper) {
      helper = this._makeHelper(object, SEL_COLOR, 1, 0.03);
      this._helpers.set(id, helper);
    }
    helper.object = object;
    helper.update();
  }

  /** Her karede çağrılır: gizmo/transform sonrası kutuları güncel tutar. */
  update() {
    for (const helper of this._helpers.values()) helper.update();
    if (this._hoverHelper) this._hoverHelper.update();
  }

  /** Tüm seçim kutularını siler (sahne yeniden kurulurken). */
  clearVisuals() {
    for (const [, helper] of this._helpers) {
      this.viewport.scene.remove(helper);
      helper.geometry.dispose();
      helper.material.dispose();
    }
    this._helpers.clear();
    if (this._hoverHelper) {
      this.viewport.scene.remove(this._hoverHelper);
      this._hoverHelper.geometry.dispose();
      this._hoverHelper.material.dispose();
      this._hoverHelper = null;
    }
  }

  /* =======================================================================
     Seçim komutları
     ======================================================================= */
  selectAll() {
    this.store.setSelection(this.store.objects.filter((o) => !o.locked).map((o) => o.id));
  }

  clear() {
    this.store.clearSelection();
  }

  /** Seçili nesnelerden oluşan bir çevreleyen kutu (odaklama için). */
  getSelectionBox() {
    const box = new THREE.Box3();
    let any = false;
    for (const record of this.store.getSelectedRecords()) {
      const obj = this.registry.getObject(record.id);
      if (!obj) continue;
      box.expandByObject(obj);
      any = true;
    }
    return any ? box : null;
  }

  /** Tüm nesneleri kapsayan kutu. */
  getSceneBox() {
    const box = new THREE.Box3();
    for (const child of this.viewport.content.children) box.expandByObject(child);
    if (box.isEmpty()) box.set(new THREE.Vector3(-50, 0, -50), new THREE.Vector3(50, 10, 50));
    return box;
  }
}
