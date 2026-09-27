/**
 * TransformTool.js
 * ---------------------------------------------------------------------------
 * TransformControls sarmalayıcısı.
 *
 * Özellikler:
 *  - translate / rotate / scale modları, world/local uzay
 *  - Izgaraya yapışma (translationSnap) ve 15° dönüş adımı
 *  - TEK seçimde nesnenin kendisine, ÇOKLU seçimde bir "pivot" grubuna bağlanır.
 *    Pivot kullanıldığında seçili nesneler pivot'un altına dünya konumu
 *    korunarak taşınır; gizmo bırakılınca tekrar sahneye bağlanır.
 *  - Sürükleme sırasında Store kayıtları canlı güncellenir (Inspector anında
 *    değerleri gösterir), bırakılınca history'ye yazılır.
 *
 * Not: TransformControls sürümden sürüme göre ya Object3D olarak koku köküne
 * eklenir ya da getHelper() ile eklenir; ikisini de destekliyoruz.
 */
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { DEG2RAD } from '../utils/math.js';

export class TransformTool {
  /**
   * @param {import('./Viewport.js').Viewport} viewport
   * @param {import('../core/Store.js').Store} store
   * @param {import('../editor/History.js').History} history
   * @param {import('../core/ObjectRegistry.js').ObjectRegistry} registry
   */
  constructor(viewport, store, history, registry) {
    this.viewport = viewport;
    this.store = store;
    this.history = history;
    this.registry = registry;

    this.controls = new TransformControls(viewport.camera, viewport.renderer.domElement);
    this.controls.setSize(0.85);
    this.controls.setTranslationSnap(null);
    this.controls.setRotationSnap(null);
    this.controls.setScaleSnap(0.1);

    // Kontrolü sahneye ekle (sürüm bağımsız)
    if (typeof this.controls.getHelper === 'function') {
      this._helper = this.controls.getHelper();
      viewport.scene.add(this._helper);
    } else {
      this._helper = this.controls;
      viewport.scene.add(this.controls);
    }

    /** Çoklu seçim için boş pivot. */
    this.pivot = new THREE.Object3D();
    this.pivot.name = '__pivot__';
    this.pivot.visible = false;
    viewport.scene.add(this.pivot);

    /** @type {THREE.Object3D[]} pivot'a bağlanmış çocuklar */
    this._attached = [];
    this._dragging = false;
    this._enabled = true;

    this._bind();
  }

  /* =======================================================================
     Olaylar
     ======================================================================= */
  _bind() {
    const c = this.controls;

    // Gizmo sürüklenirken yörünge kontrollerini kilitle
    c.addEventListener('dragging-changed', (e) => {
      this.viewport.controls.enabled = !e.value;
      this._dragging = e.value;
      if (e.value) {
        // Sürükleme başladı: geçmiş anını al
        this.history.begin('dönüşüm');
      } else {
        // 1) Pivot çocuklarını sahneye geri koy (dünya dönüşümü korunur)
        this.detach();
        // 2) Son dünya dönüşümlerini kayda yaz
        this._finish();
        // 3) Geçmişe yaz
        this.history.commit();
      }
    });

    c.addEventListener('objectChange', () => this._onObjectChange());

    c.addEventListener('change', () => this._markDirty());
  }

  _markDirty() {
    this._needsRender = true;
    // Dışarıdan bir kare zorla (kendi animasyon döngümüz var, no-op)
  }

  /**
   * Gizmo nesneyi hareket ettirdiğinde:
   *  - TEK seçim: nesnenin yerel dönüşümünü kayda yaz.
   *  - ÇOKLU seçim: pivot altındaki çocukların DÜNYA dönüşümünü kayda yaz.
   */
  _onObjectChange() {
    const ids = this.store.selection;
    if (!ids.length) return;

    if (!this._isMulti(ids)) {
      const record = this.store.getRecord(ids[0]);
      const obj = this._objectOf(ids[0]);
      if (!record || !obj) return;
      this._writeTransform(record, obj);
    } else {
      for (const id of ids) {
        const record = this.store.getRecord(id);
        const obj = this._objectOf(id);
        if (!record || !obj) continue;
        this._writeTransform(record, obj, true);
      }
    }
  }

  /** Kaydın (veya dünya dönüşümünün) değerlerini Store'a yazar. */
  _writeTransform(record, object, worldSpace = false) {
    let p, q;
    if (worldSpace) {
      p = new THREE.Vector3();
      q = new THREE.Quaternion();
      object.getWorldPosition(p);
      object.getWorldQuaternion(q);
    } else {
      p = object.position;
      q = object.quaternion;
    }
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    this.store.patchRecord(record.id, {
      position: [p.x, p.y, p.z],
      rotation: [e.x / DEG2RAD, e.y / DEG2RAD, e.z / DEG2RAD],
      scale: [object.scale.x, object.scale.y, object.scale.z],
    }, { source: 'gizmo' });
  }

  _isMulti(ids) {
    return ids.length > 1;
  }

  _objectOf(id) {
    return this.registry.getObject(id);
  }

  /* =======================================================================
     Bağlama / ayırma
     ======================================================================= */

  /**
   * Geçerli seçime göre gizmo hedefini günceller.
   * @param {string[]} [ids]
   */
  attach(ids = this.store.selection) {
    this.detach();

    if (!ids.length || !this._enabled) {
      this.controls.detach();
      this._helper.visible = false;
      return;
    }

    this._helper.visible = true;

    if (ids.length === 1) {
      const obj = this._objectOf(ids[0]);
      if (!obj) { this.controls.detach(); this._helper.visible = false; return; }
      this.controls.attach(obj);
      return;
    }

    // Çoklu seçim: pivot
    const box = new THREE.Box3();
    for (const id of ids) {
      const obj = this._objectOf(id);
      if (obj) box.expandByObject(obj);
    }
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());

    this.pivot.position.copy(center);
    this.pivot.quaternion.identity();
    this.pivot.scale.set(1, 1, 1);
    this.pivot.visible = true;

    for (const id of ids) {
      const obj = this._objectOf(id);
      if (!obj) continue;
      this.pivot.attach(obj);        // dünya konumu korunarak yeniden ebeveyn
      this._attached.push(obj);
    }
    this.controls.attach(this.pivot);
  }

  /**
   * Pivot'taki çocukları içerik grubuna geri koyar ve gizmo'yu ayırır.
   *
   * ÖNEMLİ: Hedef `viewport.scene` DEĞİL, `viewport.content` olmalıdır.
   * Raycast yalnızca content'in çocuklarını tarar; sahneye bırakılan
   * nesneler seçilemez, `viewport.clear()` tarafından da temizlenmez ve
   * sahne yeniden kurulurken kopya nesneler geride kalır.
   */
  detach() {
    if (this._attached.length) {
      for (const child of this._attached) {
        this.viewport.content.attach(child);   // dünya dönüşümü korunur
      }
      this._attached.length = 0;
    }
    this.pivot.visible = false;
    this.controls.detach();
  }

  /** Sürükleme bitti: dünya dönüşümlerini son kez kayda yaz. */
  _finish() {
    if (!this._attached.length) {
      // tekil nesne: yerel dönüşüm kayda zaten yazıldı
      this._dragging = false;
      return;
    }
    for (const child of this._attached) {
      const id = child.userData.editorId;
      const record = this.store.getRecord(id);
      if (record) this._writeTransform(record, child, true);
    }
  }

  /* =======================================================================
     Ayarlar
     ======================================================================= */
  setMode(mode) {
    this.controls.setMode(mode);
    // Ölçeklemede dünya uzayı anlamsız -> otomatik yerel
    if (mode === 'scale') this.controls.setSpace('local');
  }

  setSpace(space) {
    this.controls.setSpace(space);
  }

  /** Izgaraya yapışma: null = kapalı. */
  setSnap(step) {
    this.controls.setTranslationSnap(step);
  }

  setRotationSnap(enabled) {
    this.controls.setRotationSnap(enabled ? 15 * DEG2RAD : null);
  }

  setEnabled(enabled) {
    this._enabled = enabled;
    this.controls.enabled = enabled;
    if (!enabled) {
      this.detach();
      this._helper.visible = false;
    }
  }

  get dragging() {
    return this._dragging;
  }

  /**
   * Bir nesneye DÜNYA dönüşümü yazar.
   *
   * Kritik: Çoklu seçimde nesneler `pivot`'un altına taşınır ve kayıttaki
   * konum DÜNYA uzayındadır; `object.position` ise YERELDİR. Doğrudan
   * yazarsak değer iki kez uygulanır (nesne iki kat öte gider). Bu yüzden
   * pivot'a bağlı nesnelerde dünya dönüşümü, pivot'un ters matrisiyle
   * yerel uzaya çevrilerek yazılır.
   *
   * @param {THREE.Object3D} object
   * @param {THREE.Vector3} position dünya konumu
   * @param {THREE.Quaternion} quaternion dünya rotasyonu
   * @param {THREE.Vector3} scale dünya ölçeği
   */
  setWorldTransform(object, position, quaternion, scale) {
    const pivot = this.pivot;
    if (object.parent !== pivot) {
      object.position.copy(position);
      object.quaternion.copy(quaternion);
      object.scale.copy(scale);
      return;
    }
    pivot.updateWorldMatrix(true, false);
    const m = _tmpMatrix.compose(position, quaternion, scale);
    m.premultiply(_tmpMatrix2.copy(pivot.matrixWorld).invert());
    m.decompose(object.position, object.quaternion, object.scale);
  }

  /** Nesnenin yürürlükteki DÜNYA dönüşümünü okur. */
  getWorldTransform(object, out) {
    const target = out || { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3() };
    object.updateWorldMatrix(true, false);
    object.getWorldPosition(target.position);
    object.getWorldQuaternion(target.quaternion);
    object.getWorldScale(target.scale);
    return target;
  }

  /** Yardımcı nesne görünürlüğü (hiçbir şey seçili değilken). */
  setHelperVisible(v) {
    this._helper.visible = v && this._enabled && this.store.selection.length > 0;
  }

  dispose() {
    this.detach();
    if (typeof this.controls.dispose === 'function') this.controls.dispose();
  }
}

/** Geçici matrisler (sıcak yolda GC baskısını önler). */
const _tmpMatrix = new THREE.Matrix4();
const _tmpMatrix2 = new THREE.Matrix4();
