/**
 * SMDParser.js
 * ===========================================================================
 * Valve Source Engine `.smd` (Source Model Data) ASCII parser.
 *
 * .smd düz metindir ve blok blok (section) düzenindedir. Sıralama şöyledir:
 *
 *   version 1
 *   <triangleSayisi>
 *   <3 × (px py pz  nx ny nz  u v)>   // her satır bir üçgen, 20 sayı
 *   <vertexSayisi>
 *   <px py pz>                        // köşe konumu
 *   <normalSayisi>
 *   <nx ny nz>                        // köşe normali  (0 ise üçgenlerden alınır)
 *   <texcoordSayisi>
 *   <u v>                             // doku koordinatı (0 ise üçgenlerden alınır)
 *   <skinWeightSayisi>                // legacy, opsiyonel
 *   <boneWeightSayisi>                // modern, opsiyonel
 *   <grupSayisi>
 *   {
 *   <grupId> <grupAdi>
 *   }
 *
 * NOTLAR
 *  - `//` ile başlayan / içinde geçen her şey yorumdur.
 *  - Boş satırlar yok sayılır.
 *  - `numVertices === 0` ise üçgen bloğundaki konumlar doğrudan kullanılır
 *    (bastırılmış vertex listesi olan dosyalar).
 *  - Grup adı boş olabilir ve boşluk içerebilir.
 *
 * ---------------------------------------------------------------------------
 * KOORDİNAT SİSTEMİ
 * ---------------------------------------------------------------------------
 * Source : Z yukarı, sol el sistemi  (X ileri, Y sol, Z yukarı)
 * Three  : Y yukarı, sağ el sistemi (X sağ,  Y yukarı, Z ekrana doğru)
 *
 * `opts.convert: 'source'` ile klasik dönüşüm uygulanır:
 *      three.x = -source.y ,  three.y = source.z ,  three.z = source.x
 * Bu eşleme (x,y,z) -> (-y,z,x), yani (1,1,1) ekseni etrafında 120° dönmedir;
 * determinant +1 olduğu için üçgen sarımı (winding) korunur, `flipWinding`
 * gerekmez. Varsayılan davranış `none` (ham koordinatlar) olup editörde
 * otomatik sığdırma/ölçekleme ile telafî edilir.
 * ===========================================================================
 */
import * as THREE from 'three';

/** Parser hatası — kullanıcıya gösterilebilir. */
export class SmdError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'SmdError';
    this.code = detail.code || 'E_SMD';
    this.detail = detail;
  }
}

/** Üç sınır: dosyanın şişirilmiş/çöp içerikle kapatılmasını engeller. */
const MAX_TRIANGLES = 2_000_000;
const MAX_VERTICES = 2_000_000;
const MAX_LINE_LENGTH = 8192;

/* ==========================================================================
   1. SATIR TARAYICI
   ========================================================================== */

/**
 * Metni temizlenmiş satırlara böler.
 * @param {string} text
 * @returns {{text:string, line:number}[]}
 */
function scanLines(text) {
  // BOM temizle
  let src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const lines = [];
  const rawLines = src.split(/\r\n|\r|\n/);

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (raw.length > MAX_LINE_LENGTH) {
      throw new SmdError(`Satır ${i + 1} aşırı uzun (${raw.length} karakter). Dosya bozuk olabilir.`, {
        code: 'E_SMD_LINE', line: i + 1,
      });
    }
    // yorumu kes
    const c = raw.indexOf('//');
    const body = (c >= 0 ? raw.slice(0, c) : raw).trim();
    if (body.length === 0) continue;
    lines.push({ text: body, line: i + 1 });
  }
  return lines;
}

/** Bir satırdaki tüm sayıları (NaN kontrolü ile) çıkarır. */
function numbersOf(entry, expected, what) {
  const parts = entry.text.split(/[\s,]+/).filter(Boolean);
  if (parts.length < expected) {
    throw new SmdError(
      `Satır ${entry.line}: ${what} için ${expected} sayı bekleniyordu, ${parts.length} bulundu.`,
      { code: 'E_SMD_COUNT', line: entry.line }
    );
  }
  const out = new Float64Array(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const v = Number(parts[i]);
    if (!Number.isFinite(v)) {
      throw new SmdError(`Satır ${entry.line}: geçersiz sayı "${parts[i]}" (${what}).`, {
        code: 'E_SMD_NUMBER', line: entry.line,
      });
    }
    out[i] = v;
  }
  return out;
}

/** Beklenen tek sayı (blok başlıkları). */
function countOf(entry, what) {
  const first = entry.text.split(/[\s,]+/)[0];
  const n = Number(first);
  if (!Number.isInteger(n) || n < 0) {
    throw new SmdError(`Satır ${entry.line}: ${what} sayısı geçersiz ("${first}").`, {
      code: 'E_SMD_COUNT', line: entry.line,
    });
  }
  return n;
}

/* ==========================================================================
   2. ANA PARSER
   ========================================================================== */

/**
 * .smd metnini model nesnesine çözer.
 *
 * @param {string} text
 * @param {Object} [opts]
 *   convert    : 'none' | 'source'   (varsayılan 'none')
 *   flipU      : boolean             (varsayılan: convert==='source' iken true)
 * @returns {{
 *   name:string, version:number|null,
 *   triangles:Array<Array<{vertex:number, position:number[], normal:number[], uv:number[]}>>,
 *   vertices:Array<{position:number[]}>,
 *   vertexNormals:Array<{normal:number[]}>,
 *   texCoords:Array<{uv:number[]}>,
 *   boneWeights:Array<{bone:number,weight:number,vertex:number}>,
 *   groups:Array<{id:number, name:string}>,
 *   bounds:{min:number[], max:number[], size:number[], center:number[]},
 *   warnings:string[],
 *   triangleCount:number, vertexCount:number
 * }}
 */
export function parseSmd(text, opts = {}) {
  if (typeof text !== 'string') {
    throw new SmdError('SMD içeriği metin olmalı.', { code: 'E_SMD_INPUT' });
  }
  if (!text.trim()) {
    throw new SmdError('Dosya boş.', { code: 'E_SMD_EMPTY' });
  }

  const lines = scanLines(text);
  const warnings = [];
  let cursor = 0;

  /** Sonraki anlamlı satırı tüketir. */
  const next = (what) => {
    if (cursor >= lines.length) {
      throw new SmdError(`Beklenen blok bulunamadı: ${what} (dosya yarım kalmış olabilir).`, {
        code: 'E_SMD_TRUNCATED', what,
      });
    }
    return lines[cursor++];
  };
  const peek = () => (cursor < lines.length ? lines[cursor] : null);

  /* ---------------- version ---------------- */
  let version = null;
  let modelName = '';
  const head = lines[0];
  if (head && /^version\b/i.test(head.text)) {
    const v = Number(head.text.split(/\s+/)[1]);
    if (Number.isInteger(v)) {
      version = v;
      if (v > 2) warnings.push(`SMD sürümü ${v} (beklenen 1 veya 2) — yorumlanmaya çalışılıyor.`);
    }
    cursor = 1;
  } else {
    warnings.push('Dosya "version" satırıyla başlamıyor; sürüm bilinmiyor.');
  }
  // Opsiyonel model adı (version'dan hemen sonraki yorum olmayan satır).
  if (cursor < lines.length && /^[^0-9\-.\s]/.test(lines[cursor].text)) {
    modelName = lines[cursor].text;
    cursor++;
  }

  /* ---------------- triangles ---------------- */
  const triHeader = next('triangles sayısı');
  const triangleCount = countOf(triHeader, 'triangle');
  if (triangleCount > MAX_TRIANGLES) {
    throw new SmdError(`Üçgen sayısı aşırı yüksek (${triangleCount.toLocaleString('tr-TR')}).`, {
      code: 'E_SMD_HUGE',
    });
  }

  const triangles = new Array(triangleCount);
  let cornerHasIndex = true;      // 27 sayılık kanonik biçim mi, 24 sayılık türev mi?
  let indexMode = 'explicit';     // 'explicit' | 'sequential'

  for (let t = 0; t < triangleCount; t++) {
    const entry = next('triangle #' + t);
    const n = numbersOf(entry, 20, 'triangle #' + t);

    // ------------------------------------------------------------------------
    // SAYI SAYISINA GÖRE ÜÇGEN SATIRI BİÇİMİNİ BELİRLE
    //
    //  KANONİK (Valve / 27 sayı): her köşede 9 sayı
    //      vertexIndex  px py pz  nx ny nz  u v
    //    Köşe listesiyle bağlantı yalnızca bu indeks sayesinde kurulabilir
    //    (örn. küp: 12 üçgen = 36 köşe, ama sadece 8 köşe tanımlı).
    //
    //  TÜREV (24 sayı): indeks yok
    //      px py pz  nx ny nz  u v   (her köşede 8 sayı)
    //    Burada indeks yalnızca SIRAYA göre türetilebilir:
    //    vertexIndex = triangleIndex*3 + corner -> yalnızca
    //    numVertices === numTriangles × 3 olduğunda tutarlıdır.
    // ------------------------------------------------------------------------
    if (t === 0) {
      if (n.length >= 27) {
        cornerHasIndex = true;
        indexMode = 'explicit';
      } else if (n.length >= 24) {
        cornerHasIndex = false;
        indexMode = 'sequential';
        warnings.push(
          'Üçgen satırları indeks içermiyor (24 sayı). Köşe indeksleri sıraya göre türetildi.'
        );
      }
    }

    const stride = cornerHasIndex ? 9 : 8;
    const minCount = stride * 3;
    if (n.length < minCount) {
      throw new SmdError(
        'Satır ' + entry.line + ': üçgen #' + t + ' için en az ' + minCount +
        ' sayı bekleniyordu, ' + n.length + ' bulundu.',
        { code: 'E_SMD_COUNT', line: entry.line }
      );
    }

    const tri = new Array(3);
    for (let v = 0; v < 3; v++) {
      const b = v * stride;
      const hasIdx = cornerHasIndex;
      tri[v] = {
        vertex: hasIdx ? n[b] : t * 3 + v,
        position: hasIdx ? [n[b + 1], n[b + 2], n[b + 3]] : [n[b], n[b + 1], n[b + 2]],
        normal: hasIdx ? [n[b + 4], n[b + 5], n[b + 6]] : [n[b + 3], n[b + 4], n[b + 5]],
        uv: hasIdx ? [n[b + 7], n[b + 8]] : [n[b + 6], n[b + 7]],
      };
    }
    triangles[t] = tri;
  }

  /* ---------------- vertices ---------------- */
  const vertexCount = countOf(next('vertex sayısı'), 'vertex');
  if (vertexCount > MAX_VERTICES) {
    throw new SmdError(`Köşe sayısı aşırı yüksek (${vertexCount.toLocaleString('tr-TR')}).`, {
      code: 'E_SMD_HUGE',
    });
  }
  const vertices = new Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    const n = numbersOf(next(`vertex #${v}`), 3, `vertex #${v}`);
    vertices[v] = { position: [n[0], n[1], n[2]] };
  }

  // Sıraya göre türetilen indeksler ancak köşe sayısı tutarlıysa anlamlıdır
  if (indexMode === 'sequential' && vertexCount > 0 && vertexCount !== triangleCount * 3) {
    warnings.push(
      'Köşe sayısı (' + vertexCount + ') üçgen sayısının üç katı (' + triangleCount * 3 +
      ') değil; sıraya göre türetilen indeksler büyük olasılıkla hatalı. ' +
      'Model yine de üçgen bloğundaki konumlarla çizilecek.'
    );
  }

  /* ---------------- vertex normals ---------------- */
  const normalCount = countOf(next('normal sayısı'), 'vertex normal');
  if (normalCount > MAX_VERTICES) {
    throw new SmdError('Normal sayısı aşırı yüksek.', { code: 'E_SMD_HUGE' });
  }
  const vertexNormals = new Array(normalCount);
  for (let i = 0; i < normalCount; i++) {
    const n = numbersOf(next(`normal #${i}`), 3, `normal #${i}`);
    vertexNormals[i] = { normal: [n[0], n[1], n[2]] };
  }
  if (normalCount > 0 && normalCount !== vertexCount && vertexCount > 0) {
    warnings.push(
      `Normal sayısı (${normalCount}) köşe sayısıyla (${vertexCount}) eşleşmiyor; üçgen bloklarındaki normaller kullanılıyor.`
    );
  }

  /* ---------------- texture coordinates ---------------- */
  const uvCount = countOf(next('texcoord sayısı'), 'texcoord');
  if (uvCount > MAX_VERTICES) {
    throw new SmdError('Texcoord sayısı aşırı yüksek.', { code: 'E_SMD_HUGE' });
  }
  const texCoords = new Array(uvCount);
  for (let i = 0; i < uvCount; i++) {
    const n = numbersOf(next(`texcoord #${i}`), 2, `texcoord #${i}`);
    texCoords[i] = { uv: [n[0], n[1]] };
  }
  if (uvCount > 0 && uvCount !== vertexCount && vertexCount > 0) {
    warnings.push(
      `Texcoord sayısı (${uvCount}) köşe sayısıyla (${vertexCount}) eşleşmiyor; üçgen bloğundaki UV'ler kullanılıyor.`
    );
  }

  /* ---------------- skin / bone weights (opsiyonel) ----------------
     Bu iki blok pratikte seyrek bulunur ve çoğu dosyada tamamen yoktur.
     Kalan sayılar grup sayısı olabileceği için SAYI TAHMİNİ YAPMIYORUZ:
       1) sayı 0 ise ve SONRAKİ satır '{' veya '}' ise -> bu grup sayısıdır, dur
       2) sayı > 0 ise sonraki N satırın gerçekten sayı içerdiğine BAKILIR
          (ileriye dönük doğrulama); değilse blok yok sayılır
     --------------------------------------------------------------------- */
  const boneWeights = [];
  for (const label of ['skin weight', 'bone weight']) {
    const header = peek();
    if (!header) break;
    if (header.text === '{' || header.text === '}') break;      // grup bloğu başladı

    const first = header.text.split(/[\s,]+/)[0];
    if (!/^\d+$/.test(first)) break;                             // sayı değil -> ana akışa dön

    const n = countOf(header, label);

    if (n === 0) {
      const after = lines[cursor + 1];
      if (after && (after.text === '{' || after.text === '}')) break;
    } else if (n > MAX_VERTICES) {
      warnings.push(label + ' bloğu atlandı (sayı çok büyük).');
      break;
    } else {
      // İleriye dönük doğrulama: sonraki n satır gerçekten 3 sayı içeriyor mu?
      let plausible = true;
      for (let k = 1; k <= n; k++) {
        const line = lines[cursor + k];
        if (!line) { plausible = false; break; }
        const parts = line.text.split(/[\s,]+/);
        if (parts.length < 3) { plausible = false; break; }
        for (let p = 0; p < 3; p++) {
          if (!Number.isFinite(Number(parts[p]))) { plausible = false; break; }
        }
        if (!plausible) break;
      }
      if (!plausible) break;    // bu blok değil -> ana akışa dön
    }

    cursor++;
    for (let i = 0; i < n; i++) {
      const entry = next(label + ' #' + i);
      const v = numbersOf(entry, 3, label + ' #' + i);
      boneWeights.push({ bone: v[0] | 0, weight: v[1], vertex: v[2] | 0 });
    }
  }

  /* ---------------- groups ----------------
     Grup bloğu SMD spesifikasyonunda zorunludur; ancak birçok araç çıktısında
     eksik olur. Bu durumda hata vermek yerine uyarı üretip devam ediyoruz:
     model tek malzemeyle kullanılabilir olur.                                */
  const groups = [];
  if (!peek()) {
    warnings.push('Grup (material) bloğu yok — model tek malzemeyle kullanılacak.');
  } else {
  const groupHeader = next('grup sayısı');
  const groupCount = countOf(groupHeader, 'grup');
  if (groupCount > 0) {
    const open = next('grup bloğu başlangıcı "{"');
    if (open.text !== '{') {
      throw new SmdError(`Satır ${open.line}: grup bloğu "{" ile başlamalıydı, "${open.text}" bulundu.`, {
        code: 'E_SMD_GROUP', line: open.line,
      });
    }
    for (let g = 0; g < groupCount; g++) {
      const entry = next(`grup #${g}`);
      if (entry.text === '}') {
        throw new SmdError(`Satır ${entry.line}: grup sayısı ${groupCount} deniyor ama blok erken kapandı.`, {
          code: 'E_SMD_GROUP', line: entry.line,
        });
      }
      const m = entry.text.match(/^(-?\d+)\s*(.*)$/);
      if (!m) {
        throw new SmdError(`Satır ${entry.line}: grup tanımı geçersiz ("${entry.text}").`, {
          code: 'E_SMD_GROUP', line: entry.line,
        });
      }
      groups.push({ id: Number(m[1]), name: m[2].trim() });
    }
    const close = next('grup bloğu sonu "}"');
    if (close.text !== '}') {
      throw new SmdError(`Satır ${close.line}: grup bloğu "}" ile kapanmalıydı, "${close.text}" bulundu.`, {
        code: 'E_SMD_GROUP', line: close.line,
      });
    }
  }
  }   // groups bloğu (yukarıda else ile açıldı)

  /* ---------------- sınırlar ---------------- */
  const bounds = computeBounds(triangles, vertices, triangleCount, vertexCount);

  return {
    name: modelName || '',
    version,
    triangles,
    vertices,
    vertexNormals,
    texCoords,
    boneWeights,
    groups,
    bounds,
    warnings,
    triangleCount,
    vertexCount,
  };
}

/** Modelin AABB sınırları (dünya, ham koordinatlarda). */
function computeBounds(triangles, vertices, triangleCount, vertexCount) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const grow = (x, y, z) => {
    if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
    if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
    if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
  };

  if (vertexCount > 0) {
    for (const v of vertices) grow(v.position[0], v.position[1], v.position[2]);
  } else {
    for (const tri of triangles) {
      for (const c of tri) grow(c.position[0], c.position[1], c.position[2]);
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0], center: [0, 0, 0] };

  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  return { min, max, size, center };
}

/* ==========================================================================
   3. BUFFERGEOMETRY DÖNÜŞÜMÜ
   ========================================================================== */

/**
 * Ayrıştırılmış modeli three.js BufferGeometry'ye çevirir.
 *
 * İki kurulum desteklenir:
 *  - 'indexed' : `numVertices > 0` ise paylaşımlı köşeler + index tamponu
 *  - 'flat'    : her üçgen 3 bağımsız köşe (normaller/UV'ler kesin doğru kalır)
 *
 * @param {Object} model parseSmd çıktısı
 * @param {Object} [opts]
 *   mode     : 'auto' | 'indexed' | 'flat'   (varsayılan 'auto')
 *   convert  : 'none' | 'source'
 *   flipU    : boolean
 *   flipV    : boolean
 *   withBoneWeights : boolean (varsayılan true)
 * @returns {THREE.BufferGeometry}
 */
export function smdToBufferGeometry(model, opts = {}) {
  const mode = opts.mode || 'auto';
  const convert = opts.convert || 'none';
  const flipU = opts.flipU ?? (convert === 'source');
  const flipV = opts.flipV === true;

  const hasSharedVertices = model.vertexCount > 0;
  const normalsMatch = model.vertexNormals.length === model.vertexCount && model.vertexCount > 0;
  const uvsMatch = model.texCoords.length === model.vertexCount && model.vertexCount > 0;

  // `auto`: köşe listesi varsa INDEXED tercih edilir. Üçgen bloklarındaki indeks
  // zaten bu listeyi referanslar, dolayısıyla indeks her zaman geçerlidir.
  // Normaller/UV'ler sayıca eşleşmiyorsa smooth normal + sıfır UV ile devam
  // edilir (flat'e düşmekten daha doğru sonuç verir: geometri küçük kalır).
  // Mismatch durumunda uyarı üretilir.
  if (mode === 'auto' && hasSharedVertices) {
    if (!normalsMatch && model.triangleCount > 0) {
      model.warnings.push(
        'Köşe normali sayısı köşe sayısıyla eşleşmiyor; yumuşatılmış (smooth) normaller kullanılacak.'
      );
    }
    if (!uvsMatch && model.triangleCount > 0) {
      model.warnings.push('Doku koordinatı bulunamadı; tüm köşeler (0,0) UV alacak.');
    }
  }

  const useIndexed = mode === 'indexed' || (mode === 'auto' && hasSharedVertices);

  const geometry = useIndexed
    ? buildIndexed(model, { convert, flipU, flipV })
    : buildFlat(model, { convert, flipU, flipV });

  // --- kemik ağırlıkları ---
  if (opts.withBoneWeights !== false && model.boneWeights.length) {
    attachBoneWeights(geometry, model, useIndexed);
  }

  // --- aabb + merkez ---
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();      // eksik normalleri tamamla (mevcut olanlar korunur)
  geometry.name = model.name || 'smd';

  // Boş modelde bounding box Infinity/-Infinity verir; sıfır kutu ile değiştir
  // (Box3.setFromObject ve raycast sonsuz değerlerden bozulmasın).
  if (geometry.getAttribute('position').count === 0) {
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0);
  }

  geometry.userData.smd = {
    name: model.name,
    version: model.version,
    groups: model.groups,
    triangleCount: model.triangleCount,
    vertexCount: model.vertexCount,
    boneWeightCount: model.boneWeights.length,
    mode: useIndexed ? 'indexed' : 'flat',
    converted: convert === 'source',
  };

  return geometry;
}

/** Kaynak -> three koordinat dönüşümü. */
function convertPoint(x, y, z, convert) {
  if (convert === 'source') return [-y, z, x];
  return [x, y, z];
}
function convertNormal(x, y, z, convert) {
  if (convert === 'source') return [-y, z, x];
  return [x, y, z];
}

/** Paylaşımlı köşeler + index tamponu. */
function buildIndexed(model, { convert, flipU, flipV }) {
  const vCount = model.vertexCount;
  const tCount = model.triangleCount;

  const position = new Float32Array(vCount * 3);
  const normal = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);

  for (let i = 0; i < vCount; i++) {
    const p = model.vertices[i].position;
    const c = convertPoint(p[0], p[1], p[2], convert);
    position[i * 3] = c[0]; position[i * 3 + 1] = c[1]; position[i * 3 + 2] = c[2];

    const nSrc = model.vertexNormals[i]?.normal;
    const n = nSrc ? convertNormal(nSrc[0], nSrc[1], nSrc[2], convert) : [0, 1, 0];
    normal[i * 3] = n[0]; normal[i * 3 + 1] = n[1]; normal[i * 3 + 2] = n[2];

    const uvSrc = model.texCoords[i]?.uv;
    const u = uvSrc ? (flipU ? 1 - uvSrc[0] : uvSrc[0]) : 0;
    const v = uvSrc ? (flipV ? 1 - uvSrc[1] : uvSrc[1]) : 0;
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }

  const index = new Uint32Array(tCount * 3);
  for (let t = 0; t < tCount; t++) {
    const tri = model.triangles[t];
    for (let v = 0; v < 3; v++) {
      const idx = tri[v].vertex;
      if (idx < 0 || idx >= vCount) {
        throw new SmdError(
          `Üçgen #${t} köşe indeksi ${idx} sınır dışı (0..${vCount - 1}). Dosya bozuk.`,
          { code: 'E_SMD_INDEX', triangle: t }
        );
      }
      index[t * 3 + v] = idx;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return geometry;
}

/** Her üçgen için 3 bağımsız köşe (normaller/UV'ler üçgen bloğundan). */
function buildFlat(model, { convert, flipU, flipV }) {
  const tCount = model.triangleCount;
  const vCount = tCount * 3;

  const position = new Float32Array(vCount * 3);
  const normal = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);

  for (let t = 0; t < tCount; t++) {
    for (let v = 0; v < 3; v++) {
      const c = model.triangles[t][v];
      const i = t * 3 + v;

      // Paylaşımlı köşe listesi varsa onun konumunu tercih et
      const shared = model.vertices[c.vertex]?.position;
      const raw = shared || c.position;
      const p = convertPoint(raw[0], raw[1], raw[2], convert);
      position[i * 3] = p[0]; position[i * 3 + 1] = p[1]; position[i * 3 + 2] = p[2];

      const n = convertNormal(c.normal[0], c.normal[1], c.normal[2], convert);
      normal[i * 3] = n[0]; normal[i * 3 + 1] = n[1]; normal[i * 3 + 2] = n[2];

      uv[i * 2] = flipU ? 1 - c.uv[0] : c.uv[0];
      uv[i * 2 + 1] = flipV ? 1 - c.uv[1] : c.uv[1];
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** skinIndex / skinWeight niteliklerini üretir (en fazla 4 kemik/köşe). */
function attachBoneWeights(geometry, model, indexed) {
  const positionCount = geometry.getAttribute('position').count;
  const map = new Map();          // "triangle:corner" veya vertexIndex -> ağırlıklar

  for (const bw of model.boneWeights) {
    const key = indexed ? `v${bw.vertex}` : null;
    // flat modda vertex -> tüm üçgen köşeleri eşlenir; basit yaklaşım:
    if (key) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(bw);
    }
  }

  const skinIndex = new Uint16Array(positionCount * 4).fill(0);
  const skinWeight = new Float32Array(positionCount * 4);
  let any = false;

  if (indexed) {
    for (const [key, list] of map) {
      const idx = Number(key.slice(1));
      if (idx < 0 || idx >= positionCount) continue;
      let total = 0;
      for (let i = 0; i < Math.min(4, list.length); i++) {
        skinIndex[idx * 4 + i] = list[i].bone;
        skinWeight[idx * 4 + i] = list[i].weight;
        total += list[i].weight;
      }
      if (total > 0) for (let i = 0; i < 4; i++) skinWeight[idx * 4 + i] /= total;
      any = true;
    }
  }

  if (any) {
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  }
}

/* ==========================================================================
   4. YÜKLEME YARDIMCILARI
   ========================================================================== */

/**
 * File / Blob / string kaynağını okuyup parseSmd uygular.
 * @param {File|Blob|string} source
 * @param {Object} [opts]
 * @returns {Promise<{model:Object, name:string, size:number}>}
 */
export async function parseSmdFile(source, opts = {}) {
  let text;
  let name = 'model.smd';
  let size = 0;

  if (typeof source === 'string') {
    text = source;
    size = text.length;
  } else if (source && typeof source.name === 'string') {
    name = source.name;
    text = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new SmdError('Dosya okunamadı.', { code: 'E_SMD_READ' }));
      fr.readAsText(source, 'utf-8');
    });
    size = source.size ?? text.length;
  } else {
    throw new SmdError('Geçersiz kaynak: File, Blob veya metin bekleniyor.', { code: 'E_SMD_INPUT' });
  }

  try {
    const model = parseSmd(text, opts);
    return { model, text, name, size };
  } catch (err) {
    err.message = `${name}: ${err.message}`;
    throw err;
  }
}

/** Dosya adına göre .smd mi? */
export function isSmdFile(name) {
  return /\.smd$/i.test(String(name || ''));
}

/**
 * Modeli tek seferde parse + geometry'ye çevirir.
 * @param {File|Blob|string} source
 * @param {Object} [opts] parseSmd + smdToBufferGeometry seçenekleri
 * @returns {Promise<{geometry:THREE.BufferGeometry, model:Object, name:string, size:number}>}
 */
export async function importSmdGeometry(source, opts = {}) {
  const { model, text, name, size } = await parseSmdFile(source, opts);
  const geometry = smdToBufferGeometry(model, opts);
  return { geometry, model, text, name, size };
}

/**
 * SMD sıfır üçgen / sıfır köşe kontrolü — bozuk dosya erken yakalansın.
 * @param {Object} model
 * @returns {string[]} sorunlar (boş ise sağlıklı)
 */
export function validateSmdModel(model) {
  const issues = [];
  if (model.triangleCount === 0) issues.push('Modelde üçgen yok (boş bir .smd?).');
  if (model.vertexCount === 0 && model.triangleCount > 0) {
    issues.push('Köşe listesi yok; üçgen verisinden yeniden üretilecek.');
  }
  if (model.triangleCount > 0 && model.vertexCount > 0) {
    let maxIndex = 0;
    for (const tri of model.triangles) {
      for (const c of tri) if (c.vertex > maxIndex) maxIndex = c.vertex;
    }
    if (maxIndex >= model.vertexCount) {
      issues.push(`Üçgenlerdeki en yüksek köşe indeksi (${maxIndex}) köşe sayısını (${model.vertexCount}) aşıyor.`);
    }
  }
  if (model.groups.length === 0) {
    issues.push('Grup (material) tanımı yok; tek malzeme kullanılacak.');
  }
  return issues;
}
