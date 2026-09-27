/**
 * ObjectRegistry.js
 * ---------------------------------------------------------------------------
 * Kimlik -> sahne nesnesi eşlemesi.
 *
 * Raycast sonrası "hangi kayda ait?" sorusunu O(1) yanıtlamak için her yerde
 * sahne ağacında arama (getObjectByProperty) yapmamak adına kullanılır.
 */
export class ObjectRegistry {
  constructor() {
    /** @type {Map<string, {id:string, object:THREE.Object3D}>} */
    this._map = new Map();
  }

  set(id, object) {
    this._map.set(id, { id, object });
    object.userData.editorId = id;      // raycast eşlemesi için
    return this;
  }

  get(id) {
    return this._map.get(id) || null;
  }

  getObject(id) {
    return this._map.get(id)?.object || null;
  }

  has(id) {
    return this._map.has(id);
  }

  remove(id) {
    this._map.delete(id);
    return this;
  }

  clear() {
    this._map.clear();
    return this;
  }

  get size() {
    return this._map.size;
  }

  get ids() {
    return [...this._map.keys()];
  }

  get objects() {
    return [...this._map.values()].map((v) => v.object);
  }

  /** Kayıt -> sahne nesnesi yazma (Inspector düzenlemelerinde kullanılır). */
  forEach(fn) {
    for (const entry of this._map.values()) fn(entry.object, entry.id);
  }
}
