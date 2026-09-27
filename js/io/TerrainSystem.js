/**
 * TerrainSystem.js
 * ===========================================================================
 * `.npy` yükseklik haritasını (heightmap) three.js arazi geometrisine
 * dönüştürür — yani "displacement map" mantığı.
 *
 * ---------------------------------------------------------------------------
 * NEDEN AYRI BİR ARAZI NESNESİ?
 * ---------------------------------------------------------------------------
 * Editörde düz zemin (`GridSystem`) harita tabanıdır ve statiktir. Yükseklik
 * haritası ise düzenlenebilir bir NESNE olmalıdır: seçilebilir, gizmo ile
 * taşınabilir, ölçeklenebilir, görünürlüğü kapatılabilir ve JSON'a
 * yazılabilir. Bu yüzden `terrain` adlı ayrı bir asset catalog'a eklenmiştir.
 *
 * ---------------------------------------------------------------------------
 * ALGORİTMA
 * ---------------------------------------------------------------------------
 * 1. Düz bir ızgara düzlemi kurulur:
 *      PlaneGeometry(size, size, segments, segments) -> rotateX(-90°)
 *    Böylece düzlem XZ düzlemine oturur ve Y yukarı bakar.
 *
 * 2. Her KÖŞE için yükseklik alanından iki DEĞERLİ (bilinear) örnek alınır.
 *    Bilinear örnekleme, heightmap çözünürlüğü ile mesh bölüm sayısı
 *    birbirinden bağımsız olduğu için 257×257'lik klasik Source heightmap'i
 *    de 2048 birimlik 512 bölümlü araziye de sorunsuz uyar.
 *
 * 3. Yükseklik `0..1` aralığına normalize edilir, `heightScale` ile dünya
 *    birimine çevrilir ve köşenin Y'sine yazılır.
 *
 * 4. Normaller yeniden hesaplanır (computeVertexNormals).
 *
 * 5. Köşe renkleri yüksekliğe göre boyanır (low/mid/high ramp) ve isteğe
 *    bağlı eş yükselti (contour) çizgileri eklenir — topografik görünüm.
 * ===========================================================================
 */
import * as THREE from 'three';
import { clamp, clean } from '../utils/math.js';
import { findFirstMesh } from '../assets/AssetFactory.js';
import { computeStats } from './NPYParser.js';

/** Arazi mesh'inin maksimum bölüm sayısı (başına eksen). 513 = klasik Source ızgara çözünürlüğü. */
export const MAX_TERRAIN_SEGMENTS = 513;

/** Varsayılan görsel ayarlar. */
export const TERRAIN_DEFAULTS = Object.freeze({
  // --- YÜKSEKLİK MODU ---
  // 'absolute'   : ham .npy değerleri dünya birimidir  ->  y = (v - base) * scale
  //                (Knight Online / Source tarzı "gerçek" heightmap'ler için)
  // 'normalized' : veri 0..1'e sıkıştırılır            ->  y = (v-min)/(max-min) * scale
  //                (0-255 LUT, keyfi aralıklı veri için)
  heightMode: 'absolute',
  heightBase: 0,          // absolute modda referans düzlem (genelde 0)
  heightScale: 1,         // 1 = heightmap birebir dünya yüksekliği

  // --- SU / KIYI ---
  // waterLevel: null = OTOMATİK. Ham veride negatif değer varsa 0 (deniz
  // seviyesi), yoksa alanın en alçak noktası. Böylece gerçek dünya
  // heightmap'lerinde vadiler doğal olarak su görünür, ama tamamen pozitif
  // veride (ör. 0..255 LUT) hiçbir alan gereksiz yere su boyanmaz.
  waterLevel: null,
  beachWidth: 2,          // su üstündeki kum bandının Y GENİŞLİĞİ (dünya birimi)
  waterColor: '#2c4a63',  // su
  sandColor: '#b9a678',   // kıyı / su üstü kum bandı

  lowColor: '#3d5a43',
  midColor: '#6b8a52',
  highColor: '#8a8570',
  peakColor: '#d8dce0',
  contourStep: 0,         // 0 = kapalı; >0 ise yükseklik bandı aralığı (dünya birimi)
  contourStrength: 0.55,
  wireframe: false,
  flatShading: false,
  flipRows: false,
  invert: false,
  gamma: 1,
});

/**
 * Etkin su seviyesini hesaplar.
 *
 * `props.waterLevel` açıkça verilmişse o kullanılır. Verilmemişse:
 *   - ham veride negatif değer varsa 0 (deniz seviyesi) → vadiler su olur
 *   - yoksa alanın en alçak noktası → hiçbir alan su boyanmaz
 *
 * @param {Object|undefined} props
 * @param {{min:number,max:number}} stats ham alan istatistiği
 * @returns {number}
 */
export function resolveWaterLevel(props, stats) {
  if (Number.isFinite(props?.waterLevel)) return props.waterLevel;
  return stats && stats.min < 0 ? 0 : (stats ? stats.min : 0);
}

/**
 * Normalize edilmiş 0..1 değerden DÜNYA Y'sine projeksiyon.
 * Tüm yükseklik hesabı burada toplanır; böylece "absolute" ve "normalized"
 * modları her yerde aynı sonucu verir.
 *
 * @param {number} a01 0..1 normalize değer
 * @param {{min:number,max:number}} stats ham alan istatistiği
 * @param {Object} props { heightMode, heightBase, heightScale }
 * @returns {number} dünya biriminde Y
 */
export function projectHeight(a01, stats, props) {
  const scale = Number.isFinite(props.heightScale) ? props.heightScale : 1;
  if (props.heightMode === 'normalized') return a01 * scale;
  const raw = stats.min + a01 * (stats.max - stats.min);   // ham dünya değeri
  return (raw - (Number.isFinite(props.heightBase) ? props.heightBase : 0)) * scale;
}

/** Bir ham heightmap değerini doğrudan dünya Y'sine çevirir (yürüyüş sorgusu). */
export function rawToWorld(v, stats, props) {
  return projectHeight(stats.max === stats.min ? 0.5 : (v - stats.min) / (stats.max - stats.min), stats, props);
}

/**
 * Bilinear örnek alma.
 * @param {{width:number,height:number,data:Float32Array}} field
 * @param {number} u 0..1 (sol -> sağ)
 * @param {number} v 0..1 (üst -> alt)
 * @returns {number}
 */
export function sampleBilinear(field, u, v) {
  const { width: w, height: h, data } = field;
  if (w <= 0 || h <= 0) return 0;

  const fx = clamp(u, 0, 1) * (w - 1);
  const fy = clamp(v, 0, 1) * (h - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const tx = fx - x0, ty = fy - y0;

  const a = data[y0 * w + x0];
  const b = data[y0 * w + x1];
  const c = data[y1 * w + x0];
  const d = data[y1 * w + x1];

  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/**
 * Yükseklik alanını 0..1 aralığına normalize eder (NaN/Inf temizlenerek).
 * @param {{width:number,height:number,data:Float32Array}} field
 * @param {Object} [opts] { invert, gamma }
 * @returns {{width:number,height:number,data:Float32Array,min:number,max:number}}
 */
export function normalizeHeightField(field, opts = {}) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < field.data.length; i++) {
    const v = field.data[i];
    if (Number.isNaN(v)) { field.data[i] = 0; continue; }
    if (!Number.isFinite(v)) { field.data[i] = 0; continue; }
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) { min = 0; max = 1; }
  const span = max - min;
  const invert = opts.invert === true;
  const gamma = Number.isFinite(opts.gamma) && opts.gamma > 0 ? opts.gamma : 1;

  const out = new Float32Array(field.data.length);
  if (span <= 0) {
    out.fill(invert ? 1 : 0);
  } else {
    for (let i = 0; i < out.length; i++) {
      let t = (field.data[i] - min) / span;
      if (invert) t = 1 - t;
      if (gamma !== 1) t = Math.pow(t, gamma);
      out[i] = t;
    }
  }
  return { width: field.width, height: field.height, data: out, min, max };
}

/** Mesh bölüm sayısını yükseklik alanı çözünürlüğünden türetir. */
export function deriveSegments(field, mapSize, cellSize) {
  const byField = Math.max(field?.width || 0, field?.height || 0);
  const byCell = cellSize > 0 ? Math.round(mapSize / cellSize) : 0;
  const raw = Math.max(byField, byCell, 2);
  return clamp(Math.round(raw), 2, MAX_TERRAIN_SEGMENTS);
}

/**
 * Düz arazi düzlemi üretir (yükseklik uygulanmadan önceki temel geometri).
 * @param {number} size dünya genişliği
 * @param {number} segments bölüm sayısı (eksen başına)
 * @returns {THREE.BufferGeometry}
 */
export function buildBaseGeometry(size, segments) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);       // XY düzlemi -> XZ düzlemi (Y yukarı)
  geo.computeVertexNormals();
  return geo;
}

/**
 * Yükseklik alanını bir geometriye uygular (vertex displacement).
 *
 * Ek olarak `aHeight` adlı bir nitelik yazar: **0..1 normalize** yükseklik.
 * Bu, props değişikliklerini yeniden ÖRNEKLEME yapmadan uygulamayı sağlar:
 *   - `heightScale`  → `rescaleGeometry`   (Y oran çarpımı)
 *   - `heightMode` / `heightBase` → `reprojectGeometry` (aHeight'dan yeniden hesap)
 * Sadece `segments` / `terrainSize` / `flipRows` / `invert` / `gamma` değişiminde
 * tam yeniden örnekleme gerekir.
 *
 * @param {THREE.BufferGeometry} geometry buildBaseGeometry'den gelen düzlem
 * @param {{width:number,height:number,data:Float32Array}} field HAM alan (normalize EDİLMEMİŞ)
 * @param {Object} opts
 *   size, segments
 *   props   → { heightMode, heightBase, heightScale }  (yükseklik projeksiyonu)
 *   stats   → { min, max }
 *   flipRows, flipColumns
 * @returns {Object} uygulama istatistikleri
 */
export function displaceGeometry(geometry, field, opts) {
  const { size, segments } = opts;
  const flipRows = opts.flipRows === true;
  const flipCols = opts.flipColumns === true;
  const stats = opts.stats || computeStats(field.data);
  const span = stats.max - stats.min;

  // Yükseklik projeksiyonu kaydın PROPS'ından okunur.
  // DİKKAT: `opts.props` kullanılır, `opts.heightScale` DEĞİL. Çağıran taraf
  // geometri ayarlarını (size/segments) ve props'u aynı pakette gönderir;
  // düz `opts.heightScale` okumak her zaman undefined verir ve ölçeği sessizce
  // 1'e düşürürdü — hata yalnızca heightScale ≠ 1 olduğunda görünür.
  const props = opts.props || opts;

  const position = geometry.getAttribute('position');
  const a01 = new Float32Array(position.count);

  for (let i = 0; i < position.count; i++) {
    const ix = i % (segments + 1);
    const iz = Math.floor(i / (segments + 1));

    let u = segments === 0 ? 0 : ix / segments;
    let v = iz / segments;
    if (flipCols) u = 1 - u;
    if (flipRows) v = 1 - v;

    const raw = sampleBilinear(field, u, v);
    const t = span > 0 ? (raw - stats.min) / span : 0.5;
    a01[i] = Number.isFinite(t) ? clamp(t, 0, 1) : 0.5;
    position.setY(i, projectHeight(a01[i], stats, props));
  }

  position.needsUpdate = true;
  geometry.setAttribute('aHeight', new THREE.BufferAttribute(a01, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return { vertices: position.count, size, span };
}

/**
 * HIZLI YOL: yalnızca yükseklik ölçeği değişti (oran çarpımı).
 * @returns {boolean} uygulandı mı
 */
export function rescaleGeometry(geometry, oldScale, newScale) {
  const position = geometry.getAttribute('position');
  if (!geometry.getAttribute('aHeight')) return false;
  if (!Number.isFinite(oldScale) || oldScale === 0) return false;
  const k = newScale / oldScale;
  if (k === 1) return true;
  for (let i = 0; i < position.count; i++) position.setY(i, position.getY(i) * k);
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return true;
}

/**
 * HIZLI YOL: `heightMode` / `heightBase` değişti. Yeniden örnekleme YAPMAZ;
 * `aHeight` (0..1) üzerinden Y yeniden hesaplanır.
 * @returns {boolean}
 */
export function reprojectGeometry(geometry, stats, props) {
  const position = geometry.getAttribute('position');
  const a = geometry.getAttribute('aHeight');
  if (!a) return false;
  for (let i = 0; i < position.count; i++) {
    position.setY(i, projectHeight(a.getX(i), stats, props));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return true;
}

/* ==========================================================================
   Renklendirme (köşe renkleri + eş yükselti)
   ========================================================================== */

const _cLow = new THREE.Color();
const _cMid = new THREE.Color();
const _cHigh = new THREE.Color();
const _cPeak = new THREE.Color();
const _cSand = new THREE.Color();
const _cWater = new THREE.Color();
const _cTmp = new THREE.Color();

/**
 * Yüksekliğe göre köşe renklerini hesaplar.
 *
 * Renk katmanları (aşağıdan yukarıya):
 *
 *   y ≤ su            → SU       (deniz seviyesinin altı)
 *   y < su + kumul    → KUM      (kıyı bandı)
 *   y < orta          → ALÇAK → ORTA  (yeşil)
 *   y < yüksek        → ORTA → YÜKSEK (kayalık)
 *   geri kalan        → YÜKSEK → ZİRVE (kayalık / kar)
 *
 * Böylece Knight Online / Source tarzı haritalarda suyun nerede bittiği
 * tek bakışta okunur — ham veride negatif Y yoksa otomatik mod su üretmez.
 *
 * @param {THREE.BufferGeometry} geometry (deplasman SONRASı çağrılmalı)
 * @param {Object} opts { lowColor, midColor, highColor, peakColor,
 *                        waterColor, sandColor, waterLevel, beachWidth,
 *                        contourStep, contourStrength }
 * @param {{min:number,max:number}} [sourceStats] ham alan aralığı (absolute mod)
 * @returns {THREE.BufferGeometry}
 */
export function colorizeTerrain(geometry, opts = {}, sourceStats = null) {
  const position = geometry.getAttribute('position');
  const count = position.count;

  _cLow.set(opts.lowColor || TERRAIN_DEFAULTS.lowColor);
  _cMid.set(opts.midColor || TERRAIN_DEFAULTS.midColor);
  _cHigh.set(opts.highColor || TERRAIN_DEFAULTS.highColor);
  _cPeak.set(opts.peakColor || TERRAIN_DEFAULTS.peakColor);
  _cSand.set(opts.sandColor || TERRAIN_DEFAULTS.sandColor);
  _cWater.set(opts.waterColor || TERRAIN_DEFAULTS.waterColor);

  const step = opts.contourStep > 0 ? opts.contourStep : 0;
  const strength = opts.contourStrength ?? TERRAIN_DEFAULTS.contourStrength;

  // Gerçek yükseklik aralığı geometriden al
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const y = position.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = maxY - minY;

  const water = resolveWaterLevel(opts, sourceStats);
  // Kum bandı Y BİRİMİ cinsinden genişliktir (oransal değil): kıyı çizgisi
  // ince olmalıdır, aksi halde haritanın bütün alçak kesimleri kum olur.
  const beach = Math.max(opts.beachWidth ?? TERRAIN_DEFAULTS.beachWidth, 0);

  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const y = position.getY(i);
    const t = span > 0 ? clamp((y - minY) / span, 0, 1) : 0;

    if (y <= water) {
      _cTmp.copy(_cWater);                                   // su
    } else if (y <= water + beach) {
      _cTmp.copy(_cSand);                                     // kıyı / kum
    } else if (t < 0.5) {
      _cTmp.copy(_cLow).lerp(_cMid, t / 0.5);
    } else if (t < 0.85) {
      _cTmp.copy(_cMid).lerp(_cHigh, (t - 0.5) / 0.35);
    } else {
      _cTmp.copy(_cHigh).lerp(_cPeak, (t - 0.85) / 0.15);
    }

    // Eş yükselti (contour) bantları — dünya biriminde adımlanır
    if (step > 0 && span > 0) {
      const band = (y - minY) / step;
      const frac = band - Math.floor(band);
      // 0.5'e yakınsa koyulaştır -> ince çizgi görünümü
      const line = 1 - clamp(Math.abs(frac - 0.5) * 14, 0, 1);
      _cTmp.multiplyScalar(1 - line * strength * 0.55);
    }

    colors[i * 3] = _cTmp.r;
    colors[i * 3 + 1] = _cTmp.g;
    colors[i * 3 + 2] = _cTmp.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/* ==========================================================================
   YÜKSEK YÜZEY SINIFI
   ========================================================================== */

/**
 * Arazi nesnelerini üretir/günceller.
 *
 * Bu sınıf `Editor`'e bağımlı DEĞİLDİR; ihtiyacı olanı metod parametresi
 * olarak alır (registry, store, cache). Böylece test edilebilir ve
 * Editor'dan ayrışık kalır.
 */
export class TerrainSystem {
  /**
   * @param {import('../core/Store.js').Store} store
   * @param {import('../core/ObjectRegistry.js').ObjectRegistry} registry
   * @param {import('./ExternalAssets.js').ExternalAssetCache} cache
   */
  constructor(store, registry, cache) {
    this.store = store;
    this.registry = registry;
    this.cache = cache;
    /** @type {Map<string, number>} son uygulanan heightScale (oran çarpımı için) */
    this._lastScale = new Map();
    /** @type {Map<string, Object>} son uygulanan props anlık görüntüsü */
    this._applied = new Map();
  }

  /**
   * NPY sonucundan bir arazi kaydı oluşturur (Store'a eklemez).
   *
   * @param {Object} npy parseNpy çıktısı
   * @param {Object} [opts]
   *   size        : arazi genişliği (varsayılan harita boyutu)
   *   segments    : bölüm sayısı (verilmezse türetilir)
   *   heightScale : dünya birimi yükseklik (0 = otomatik)
   *   name        : nesne adı
   *   invert, gamma, flipRows
   * @returns {Object} oluşturulan Store kaydı
   */
  buildRecord(npy, opts = {}) {
    if (!npy?.field?.data?.length) {
      throw new Error('Geçersiz yükseklik alanı (veri boş).');
    }
    const mapSize = this.store.map.size;
    const size = opts.size || mapSize;
    const segments = clamp(
      opts.segments || deriveSegments(npy.field, size, this.store.map.cellSize),
      2, MAX_TERRAIN_SEGMENTS
    );

    const source = npy.name || 'heightmap.npy';
    const st = npy.stats || { min: 0, max: 0, mean: 0, rms: 0, nan: 0, inf: 0 };

    // Ters çevirme / gamma SADECE normalize edilmiş alana uygulanabilir.
    // Ham veriyi bozmamak için alanı burada normalize EDİLMEZ; istatistik
    // saklanır, projeksiyon build sırasında yapılır.
    const needsPreprocess = opts.invert === true || (Number.isFinite(opts.gamma) && opts.gamma > 0 && opts.gamma !== 1);
    let field = npy.field;
    let stats = { ...st };

    if (needsPreprocess) {
      const n = normalizeHeightField(field, { invert: opts.invert === true, gamma: opts.gamma });
      // normalizeHeightField 0..1 üretir; ham istatistiği de sakla ki
      // 'absolute' modunda gerçek değerler kaybolmasın
      const raw = new Float32Array(n.data.length);
      const span = stats.max - stats.min;
      for (let i = 0; i < raw.length; i++) {
        raw[i] = opts.invert === true
          ? stats.max - n.data[i] * span
          : Math.pow((field.data[i] - stats.min) / (span || 1), opts.gamma || 1) * span + stats.min;
      }
      field = { width: n.width, height: n.height, data: raw };
      if (opts.invert === true) stats = { ...stats, min: stats.max - (stats.max - stats.min), max: stats.max };
    }

    const record = {
      id: opts.id,
      name: opts.name || `Arazi · ${source.replace(/\.npy$/i, '')}`,
      assetId: 'terrain',
      category: 'imported',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      locked: false,
      color: '#ffffff',
      castShadow: true,
      receiveShadow: true,
      tag: opts.tag || 'terrain',
      props: {
        source,
        dtype: npy.dtype?.descr || null,
        sourceWidth: npy.field.width,
        sourceHeight: npy.field.height,
        segments,
        terrainSize: size,
        // --- yükseklik modu ---
        heightMode: opts.heightMode || TERRAIN_DEFAULTS.heightMode,
        heightBase: opts.heightBase ?? TERRAIN_DEFAULTS.heightBase,
        heightScale: opts.heightScale > 0 ? opts.heightScale : TERRAIN_DEFAULTS.heightScale,
        // null = OTOMATİK: negatif veri varsa 0 (deniz seviyesi).
        // Inspector'da bu alan boş bırakılırsa "Otomatik" seçili demektir.
        waterLevel: Number.isFinite(opts.waterLevel) ? opts.waterLevel : null,
        beachWidth: Number.isFinite(opts.beachWidth) ? opts.beachWidth : TERRAIN_DEFAULTS.beachWidth,
        waterColor: TERRAIN_DEFAULTS.waterColor,
        sandColor: TERRAIN_DEFAULTS.sandColor,
        invert: false, flipRows: opts.flipRows === true,
        lowColor: TERRAIN_DEFAULTS.lowColor,
        midColor: TERRAIN_DEFAULTS.midColor,
        highColor: TERRAIN_DEFAULTS.highColor,
        peakColor: TERRAIN_DEFAULTS.peakColor,
        contourStep: TERRAIN_DEFAULTS.contourStep,
        contourStrength: TERRAIN_DEFAULTS.contourStrength,
        wireframe: false,
        flatShading: false,
        // --- kaynak istatistikleri (bilgi amaçlı) ---
        minHeight: clean(stats.min, 4),
        maxHeight: clean(stats.max, 4),
        meanHeight: clean(stats.mean ?? 0, 4),
        rmsHeight: clean(stats.rms ?? 0, 4),
        nanCount: stats.nan ?? 0,
      },
    };

    // HAM alan saklanır — projeksiyon build sırasında yapılır, böylece
    // heightMode/heightBase/heightScale değişiklikleri veri kaybı olmadan
    // (ve yeniden örnekleme olmadan) uygulanabilir.
    this.cache.set(record.id, 'terrain', {
      field,
      stats,
      meta: {
        name: source,
        dtype: record.props.dtype,
        rawMin: stats.min, rawMax: stats.max,
      },
    }, { name: source, bytes: field.data.byteLength });

    return record;
  }

  /**
   * Bir arazi nesnesinin geometrisini (yeniden) üretir.
   *
   * @param {string} objectId
   * @param {Object} [overrideProps] sadece değişen alanlar (kısmi güncelleme)
   * @returns {THREE.Mesh|null}
   */
  rebuild(objectId, overrideProps = null) {
    const entry = this.registry.get(objectId);
    const record = this.store.getRecord(objectId);
    if (!entry || !record) return null;

    const object = entry.object;
    const props = { ...record.props, ...(overrideProps || {}) };
    const payload = this.cache.payload(objectId);
    const field = payload?.field || null;
    const stats = payload?.stats || { min: 0, max: 0 };

    const size = clamp(props.terrainSize || this.store.map.size, 1, 1e6);
    const segments = clamp(props.segments || 128, 2, MAX_TERRAIN_SEGMENTS);

    // 1) temel geometri
    const geometry = buildBaseGeometry(size, segments);

    // 2) yer değiştirme (ham alan -> aHeight 0..1 -> dünya Y)
    if (field) {
      displaceGeometry(geometry, field, {
        size, segments, stats, props,
        flipRows: props.flipRows === true,
      });
    }

    // 3) renklendirme
    colorizeTerrain(geometry, props, stats);

    // 4) geometriyi değiştir
    //    DİKKAT: asset builder'ı bir GRUP + tek Mesh üretir. Geometri mesh'e
    //    yazılmalı; `object.geometry` bir Group üzerinde three.js tarafından
    //    YOK sayılır ve mesh yer tutucusu ekranda kalır.
    const mesh = findFirstMesh(object);
    if (!mesh) return null;
    if (mesh.geometry && mesh.geometry !== geometry) mesh.geometry.dispose();
    mesh.geometry = geometry;

    // 5) malzeme
    this._applyMaterial(object, props);

    // Arazi gölge ALMALI: tepe/çukur gölgeleri ancak böyle görünür
    mesh.castShadow = record.castShadow !== false;
    mesh.receiveShadow = true;
    mesh.userData.tintable = false;        // görsel köşe renklerinden geliyor

    object.userData.terrain = {
      size, segments,
      heightMode: props.heightMode,
      heightScale: props.heightScale,
      hasHeightmap: !!field,
      fieldSize: field ? `${field.width}×${field.height}` : null,
      // Yalnızca JSON önizlemesinden geri geldiyse çözünürlük düşüktür
      degraded: payload?.degraded === true,
      sourceRange: [stats.min, stats.max],
      minY: geometry.boundingBox?.min.y ?? 0,
      maxY: geometry.boundingBox?.max.y ?? 0,
    };

    // Yeniden kurulumdan sonra hızlı yolların referansı güncellenir
    this._applied.set(objectId, { ...props });
    this._lastScale.set(objectId, props.heightScale);

    return mesh;
  }

  /**
   * Yalnızca görsel/malzeme ayarlarını günceller (geometri yeniden kurulmaz).
   * @param {string} objectId
   * @param {Object} props
   */
  refreshMaterial(objectId, props) {
    const object = this.registry.getObject(objectId);
    if (!object) return;
    this._applyMaterial(object, props);
    const geo = findFirstMesh(object)?.geometry;
    if (geo) colorizeTerrain(geo, props, this.cache.payload(objectId)?.stats);
  }

  /**
   * Inspector'dan gelen props değişikliğini EN UCUZ yolla uygular.
   *
   * ÖNEMLİ: `Store.patchRecord` props nesnesinin TAMAMINI yollar, bu yüzden
   * "hangi alan değişti" bilgisi kaybolur. Burada son uygulanan props'un bir
   * anlık görüntüsü tutulur ve GERÇEK fark alınır — aksi halde `heightScale`
   * dalı her seferinde çalışır ve `heightMode`/`heightBase` değişiklikleri
   * hiçbir zaman uygulanmaz.
   *
   * Maliyet sınıflandırması (2048 harita / 257 bölüm = 66k köşe):
   *   heightMode / heightBase -> reproject  : aHeight'dan Y yeniden hesap (~hızlı)
   *   heightScale             -> rescale    : Y oran çarpımı           (~çok hızlı)
   *   renk / eş yükselti     -> recolor    : yalnızca color niteliği  (~hızlı)
   *   tel kafes / düz gölge   -> material   : malzeme bayrağı          (anlık)
   *   segments / boyut /
   *   satır ters çevirme      -> rebuild    : yeniden örnekleme        (pahalı)
   *
   * @returns {'reproject'|'rescale'|'recolor'|'material'|'rebuild'|null}
   */
  syncProps(objectId, changed) {
    const record = this.store.getRecord(objectId);
    const object = this.registry.getObject(objectId);
    if (!record || !object) return null;

    const props = record.props || {};
    const keys = this._diffProps(objectId, props, changed);
    const has = (k) => keys.has(k);
    const geo = () => findFirstMesh(object)?.geometry;
    const stats = this.cache.payload(objectId)?.stats || { min: 0, max: 0 };

    // --- pahalı: geometriyi yeniden kur ---
    if (has('terrainSize') || has('segments') || has('flipRows')) {
      this.rebuild(objectId);
      return 'rebuild';
    }

    // --- hızlı: yükseklik modu / referans düzlem (yeni heightScale'ı da kapsar,
    //     çünkü projeksiyon güncel props'u kullanır) ---
    if (has('heightMode') || has('heightBase')) {
      const g = geo();
      const ok = g ? reprojectGeometry(g, stats, props) : false;
      if (!ok) { this.rebuild(objectId); return 'rebuild'; }
      if (g) colorizeTerrain(g, props, stats);
      this._stampUserData(object, props);
      return 'reproject';
    }

    // --- hızlı: yalnızca yükseklik ölçeği (oran çarpımı) ---
    if (has('heightScale')) {
      const g = geo();
      const prev = this._lastScale.get(objectId);
      const ok = g ? rescaleGeometry(g, prev ?? props.heightScale, props.heightScale) : false;
      if (!ok) { this.rebuild(objectId); return 'rebuild'; }
      this._lastScale.set(objectId, props.heightScale);
      if (g) colorizeTerrain(g, props, stats);
      this._stampUserData(object, props);
      return 'rescale';
    }

    // --- ucuz: renk / eş yükselti / su seviyesi ---
    if (has('contourStep') || has('contourStrength') || has('waterLevel') ||
        has('beachWidth') || has('lowColor') || has('midColor') ||
        has('highColor') || has('peakColor') || has('sandColor') ||
        has('waterColor')) {
      const g = geo();
      if (g) colorizeTerrain(g, props, stats);
      return 'recolor';
    }

    // --- anlık: malzeme bayrakları ---
    if (has('wireframe') || has('flatShading') || has('color')) {
      this._applyMaterial(object, props);
      return 'material';
    }

    return null;
  }

  /**
   * Son uygulanan props'a göre GERÇEK değişen anahtarları döndürür.
   *
   * `explicit` yalnızca anlık görüntü HENÜZ YOKSA kullanılır (ilk çağrı).
   * Anlık görüntü varsa sadece hesaplanan fark kullanılır — aksi halde
   * "tüm anahtarları geç" bilgisi, her dalı eşzamanlı tetikler ve hızlı
   * yollar yine de çalışmaz.
   *
   * @returns {Set<string>}
   */
  _diffProps(objectId, props, explicit) {
    const prev = this._applied.get(objectId);
    if (!prev) {
      this._applied.set(objectId, { ...props });
      return new Set(explicit || []);
    }
    const changed = new Set();
    for (const k of Object.keys(props)) {
      if (prev[k] !== props[k]) changed.add(k);
    }
    this._applied.set(objectId, { ...props });
    return changed;
  }

  /** Kullanıcı verisini güncel tutar (teşhis / Inspector için). */
  _stampUserData(object, props) {
    const geo = findFirstMesh(object)?.geometry;
    object.userData.terrain = {
      ...(object.userData.terrain || {}),
      heightMode: props.heightMode,
      heightScale: props.heightScale,
      heightBase: props.heightBase,
      terrainSize: props.terrainSize,
      segments: props.segments,
      minY: geo?.boundingBox?.min.y ?? 0,
      maxY: geo?.boundingBox?.max.y ?? 0,
    };
  }

  /** İçe aktarılan SMD mesh'ine varsayılan malzemeyi uygular. */
  _applyMaterial(object, props) {
    let mesh = findFirstMesh(object);
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.BufferGeometry(), defaultTerrainMaterial());
      object.add(mesh);
    }

    const wire = props.wireframe === true;
    const flat = props.flatShading === true;

    if (!mesh.material) mesh.material = defaultTerrainMaterial();
    const mat = mesh.material;

    mat.vertexColors = true;
    mat.wireframe = wire;
    mat.flatShading = flat;
    mat.needsUpdate = true;

    // Arazi rengi yerine "tohum" rengi tutulur; asıl görsel köşe renklerinden gelir
    if (!mat.color) mat.color = new THREE.Color(0xffffff);
    mat.color.set(props.color || '#ffffff');
    mat.roughness = props.roughness ?? 0.92;
    mat.metalness = props.metalness ?? 0.0;
  }

  /**
   * Yükseklik alanından yürüyülebilirlik / yerleştirme sorgusu.
   * Aynı `projectHeight` projeksiyonunu kullanır; böylece Inspector'daki
   * değerle sahnedeki gerçek yükseklik her zaman tutarlıdır.
   *
   * @param {string} objectId
   * @param {number} x dünya X
   * @param {number} z dünya Z
   * @returns {{height:number, inside:boolean, raw:number}|null}
   */
  sampleWorld(objectId, x, z) {
    const record = this.store.getRecord(objectId);
    const object = this.registry.getObject(objectId);
    const payload = this.cache.payload(objectId);
    if (!record || !object || !payload?.field) return null;

    const size = record.props?.terrainSize || this.store.map.size;
    const stats = payload.stats || { min: 0, max: 0 };
    const flipRows = record.props?.flipRows === true;

    // Dünya -> yerel (arazi nesnesi döndürülmüş/ölçeklenmiş olabilir)
    const local = object.worldToLocal(_tmpVec.set(x, 0, z));
    let u = (local.x + size / 2) / size;
    let v = (local.z + size / 2) / size;
    if (flipRows) v = 1 - v;

    const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
    const raw = sampleBilinear(payload.field, u, v);
    return {
      raw,
      height: rawToWorld(raw, stats, record.props || {}),
      inside,
    };
  }
}

/* ==========================================================================
   Yardımcılar
   ========================================================================== */

function defaultTerrainMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.0,
    flatShading: false,
  });
}

const _tmpVec = new THREE.Vector3();

/** Yükseklik alanını hızlıca ASCII önizlemeye çevirir (hata ayıklama / konsol). */
export function fieldToAscii(field, rows = 16) {
  const chars = ' .:-=+*#%@';
  const lines = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < rows * 2; x++) {
      const v = sampleBilinear(field, x / (rows * 2 - 1), y / (rows - 1));
      const idx = clamp(Math.round(v * (chars.length - 1)), 0, chars.length - 1);
      line += chars[idx];
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/** Yükseklik alanı için "kolay okunur" özet metni. */
export function describeField(field, stats) {
  return [
    `boyut   : ${field.width} × ${field.height}`,
    `eleman  : ${field.data.length.toLocaleString('tr-TR')}`,
    `min/max : ${clean(stats?.min ?? 0, 4)} / ${clean(stats?.max ?? 0, 4)}`,
    `ortalama: ${clean(stats?.mean ?? 0, 4)}  RMS: ${clean(stats?.rms ?? 0, 4)}`,
    `NaN/Inf : ${stats?.nan ?? 0} / ${stats?.inf ?? 0}`,
  ].join('\n');
}
