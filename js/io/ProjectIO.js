/**
 * ProjectIO.js
 * ---------------------------------------------------------------------------
 * JSON dışa/içe aktarma ve doğrulama.
 *
 * DOSYA FORMATI
 * -------------
 * {
 *   "format": "threejs-map-editor",
 *   "version": 1,
 *   "createdAt": "2026-09-27T12:00:00.000Z",
 *   "map": { "size": 2048, "cellSize": 8, "groundColor": "#1b212b", ... },
 *   "objects": [
 *     {
 *       "id": "obj_abc123",
 *       "name": "Ağaç 1",
 *       "assetId": "tree",
 *       "category": "nature",
 *       "position": [12.5, 0, -40],
 *       "rotation": [0, 90, 0],          // DEREECE
 *       "scale":    [1, 1, 1],
 *       "visible": true,
 *       "locked": false,
 *       "color": "#4a9d5a",
 *       "castShadow": true,
 *       "receiveShadow": true,
 *       "tag": "",
 *       "props": { "health": 100, "autoPatrol": true }
 *     }
 *   ]
 * }
 *
 * `rotation` derece cinsindendir (insan okunabilirliği için); içe aktarımda
 * normalize edilir ve modül toleranslı (eksik alanlar tamamlanır).
 */
import { defaultMapState, MAP_SIZES } from '../core/Store.js';
import { getAsset, getDefaultProps } from '../assets/catalog.js';
import { clean, clamp } from '../utils/math.js';
import { IMPORT_PREFIX } from './ImportedAssetLibrary.js';

/** Dış kitaplık modelleri için paylaşılan Inspector şeması. */
const IMPORTED_LIB_ASSET = 'importedLib';

export const FORMAT_ID = 'threejs-map-editor';
export const FORMAT_VERSION = 1;
const STORAGE_KEY = 'map-editor:autosave';

/* -------------------------------------------------------------------------
   Dışa aktarma
   ------------------------------------------------------------------------- */

/**
 * Store durumundan proje dosyası nesnesi üretir.
 *
 * @param {import('../core/Store.js').Store} store
 * @param {Object} [opts]
 *   includeExternalData : .npy yükseklik haritaları ve .smd metinleri
 *                         JSON'a gömülsün mü. Varsayılan HAYIR: 2048² float32
 *                         tabanlı bir harita base64 ile ~22 MB'a çıkar ve
 *                         dosya kullanılamaz hale gelir.
 *   external            : ExternalAssetCache (Editor'dan geçilir)
 * @returns {Object}
 */
export function buildProject(store, opts = {}) {
  const includeExternalData = opts.includeExternalData === true;
  const external = opts.external || null;

  const objects = store.objects.map((o) => {
    const base = {
      id: o.id,
      name: o.name,
      assetId: o.assetId,
      category: o.category,
      position: o.position.map((n) => clean(n, 4)),
      rotation: o.rotation.map((n) => clean(n, 3)),
      scale: o.scale.map((n) => clean(n, 4)),
      visible: o.visible,
      locked: o.locked,
      color: o.color,
      castShadow: o.castShadow,
      receiveShadow: o.receiveShadow,
      tag: o.tag || '',
      props: o.props || {},
    };
    // İçe aktarılmış içerik (arazi yükseklik haritası / SMD modeli)
    const data = external?.serialize(o.id, includeExternalData);
    if (data) base.external = data;
    return base;
  });

  return {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    app: { name: 'Three.js Map Editor', units: 'birim (unit)' },
    map: { ...store.map },
    objects,
  };
}

/**
 * JSON dosyası indirir.
 * @param {Object} project
 * @param {string} [filename]
 */
export function downloadProject(project, filename) {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = filename || `harita_${project.map?.size || 0}_${stamp}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return json;
}

/* -------------------------------------------------------------------------
   İçe aktarma / doğrulama
   ------------------------------------------------------------------------- */

/**
 * Ham JSON'u doğrular ve normalize eder.
 * @param {any} raw
 * @returns {{ok:boolean, errors:string[], warnings:string[], project:Object|null}}
 */
export function validateProject(raw) {
  const errors = [];
  const warnings = [];

  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Dosya içeriği JSON nesnesi değil.'], warnings, project: null };
  }
  if (raw.format && raw.format !== FORMAT_ID) {
    warnings.push(`Bilinmeyen format etiketi: "${raw.format}". Yine de okunmaya çalışılıyor.`);
  }
  if (!Array.isArray(raw.objects)) {
    errors.push('"objects" dizisi bulunamadı.');
    return { ok: false, errors, warnings, project: null };
  }
  if (raw.version && raw.version > FORMAT_VERSION) {
    warnings.push(`Dosya sürümü ${raw.version}, editör sürümü ${FORMAT_VERSION}. Bilinmeyen alanlar yok sayılacak.`);
  }

  /* ---- map ---- */
  const map = { ...defaultMapState(2048), ...(raw.map || {}) };
  let size = Number(map.size);
  if (!Number.isFinite(size) || size <= 0) {
    warnings.push('Geçersiz harita boyutu, 2048 varsayılan olarak kullanıldı.');
    size = 2048;
  }
  // En yakın desteklenen boyuta yuvarla (kullanıcı 1500 girdiyse 1024/2048'e)
  if (!MAP_SIZES.includes(size)) {
    const nearest = MAP_SIZES.reduce((a, b) => (Math.abs(b - size) < Math.abs(a - size) ? b : a));
    warnings.push(`Harita boyutu ${size} desteklenmiyor; ${nearest} olarak yuvarlanıyor.`);
    size = nearest;
  }
  map.size = size;
  map.cellSize = Number(map.cellSize) > 0 ? Number(map.cellSize) : defaultMapState(size).cellSize;

  /* ---- objects ---- */
  const seen = new Set();
  let skipped = 0;
  const objects = [];

  for (const [i, item] of raw.objects.entries()) {
    const rec = normalizeObject(item, i, seen);
    if (!rec) { skipped++; continue; }
    objects.push(rec);
  }

  if (skipped) warnings.push(`${skipped} nesne geçersiz olduğu için atlandı.`);

  return {
    ok: true,
    errors,
    warnings,
    project: { format: FORMAT_ID, version: FORMAT_VERSION, map, objects },
  };
}

/**
 * Tek bir ham nesne kaydını normalize eder.
 * @returns {Object|null}
 */
function normalizeObject(item, index, seenIds) {
  if (!item || typeof item !== 'object') return null;

  const assetId = String(item.assetId || item.type || 'cube');

  /*
   * Dış kitaplık modelleri (`imp:…`) statik katalogda YOKTUR.
   *
   * Burada "bilinmeyen asset → atlanır" kuralı uygulansaydı, proje dosyasındaki
   * TÜM dış modeller sessizce kaybolurdu ve kullanıcı nedenini anlamazdı.
   * Bu yüzden `imp:` önekli kimlikler kabul edilir ve alan şemaları ortak
   * `importedLib` tanımından gelir.
   */
  const gercekMeta = getAsset(assetId);
  const disModel = !gercekMeta && assetId.startsWith(IMPORT_PREFIX);
  if (!gercekMeta && !disModel) return null;   // bilinmeyen asset -> atlanır

  const meta = gercekMeta || getAsset(IMPORTED_LIB_ASSET);
  const schemaId = gercekMeta ? assetId : IMPORTED_LIB_ASSET;

  let id = String(item.id || `obj_import_${index}`);
  if (seenIds.has(id)) id = `${id}_${index}`;
  seenIds.add(id);

  const num3 = (v, fallback = [0, 0, 0]) =>
    Array.isArray(v) && v.length >= 3
      ? [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0]
      : fallback;

  // Eski/sayısal formatları da kabul et
  const position = Array.isArray(item.position) ? num3(item.position)
    : num3([item.x, item.y, item.z]);
  const rotation = Array.isArray(item.rotation) ? num3(item.rotation)
    : num3([item.rx, item.ry, item.rz]);
  const scale = Array.isArray(item.scale) ? num3(item.scale, [1, 1, 1])
    : num3([item.sx, item.sy, item.sz], [1, 1, 1]);

  return {
    id,
    name: String(item.name || `${meta.name} ${index + 1}`).slice(0, 120),
    assetId,
    category: meta.category,
    position: position.map((n) => clamp(n, -1e6, 1e6)),
    rotation: rotation.map((n) => ((n % 360) + 360) % 360),   // 0..360 normalize
    scale: scale.map((n) => (Math.abs(n) < 1e-4 ? 1e-4 : clamp(n, 0.0001, 1e4))),
    visible: item.visible !== false,
    locked: item.locked === true,
    color: typeof item.color === 'string' ? item.color : meta.color,
    castShadow: item.castShadow !== false,
    receiveShadow: item.receiveShadow !== false,
    tag: typeof item.tag === 'string' ? item.tag : '',
    props: { ...getDefaultProps(schemaId), ...(item.props && typeof item.props === 'object' ? item.props : {}) },
    // İçe aktarılmış içerik bloğu (yükseklik haritası / SMD metni).
    // Editor bu bloğu ExternalAssetCache'e yazar; geometry orada üretilir.
    // Dış kütüphane modelinde `external` yoktur: dosya sunucudan URL ile gelir.
    ...(item.external && typeof item.external === 'object' ? { external: item.external } : {}),
  };
}

/**
 * Dosya okur.
 * @param {File} file
 * @returns {Promise<Object>} ham JSON
 */
export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch (err) {
        reject(new Error(`JSON ayrıştırılamadı: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.readAsText(file, 'utf-8');
  });
}

/* -------------------------------------------------------------------------
   Tarayıcı otomatik kaydı (localStorage)
   ------------------------------------------------------------------------- */

export function saveToStorage(project) {
  try {
    const json = JSON.stringify(project);
    localStorage.setItem(STORAGE_KEY, json);
    return { ok: true, bytes: json.length };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export function loadFromStorage() {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function clearStorage() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* yoksay */ }
}

export function hasStorageSave() {
  try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; }
}
