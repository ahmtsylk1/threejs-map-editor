/**
 * BinaryGridParser.js
 * ===========================================================================
 * "[uint32 N][N×N float32]" biçimindeki BINARY yükseklik ızgaralarını okur.
 *
 * NEDEN VAR?
 * ---------
 * Bazı ".smd" dosyaları Valve Source ASCII SMD DEĞİLDİR; üçüncü parti araçların
 * ürettiği ikili (binary) harita dökümleridir. Bu tür dosyalarda ASCII SMD
 * ayracı (`version 1`, `//` yorumları, metin blokları) bulunmaz.
 *
 * Bu modül bilinçli olarak SEZGİSELDİR ve bunu saklamaz:
 *   - Yalnızca dosyanın başında `[uint32 N]` + `N²` sonlu float32 bloğu varsa
 *     kabul eder.
 *   - N bulmacaya uygun aralıkta mı, değerler makul mü diye doğrular.
 *   - Bulduğu şeyi "tahmin" olarak bildirir; kullanıcı doğrulayabilsin diye
 *     istatistikleri (min/max/mean, grid çözünürlüğü) döndürür.
 *
 * Tam bir biçim UYGULAMASI DEĞİLDİR. Emin olunamayan durumda hata verir; asla
 * uydurma geometri üretmez.
 * ===========================================================================
 */

/** Parser hatası. */
export class BinaryGridError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'BinaryGridError';
    this.code = detail.code || 'E_BINGRID';
    this.detail = detail;
  }
}

/** Kabul edilen ızgara çözünürlükleri (N). */
export const MIN_RES = 8;
export const MAX_RES = 4096;

/** Değerlerin makul sayılması için mutlak üst sınır. */
const MAX_ABS_VALUE = 1e7;

/* ==========================================================================
   1. KEŞİF (sniff) — dosya bu biçimde mi?
   ========================================================================== */

/**
 * Bir dosyanın ikili ızgara biçimine uyup uymadığını inceler.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{ isGrid:boolean, reason:string, resolution?:number, min?:number, max?:number, mean?:number }}
 */
export function sniffBinaryGrid(input) {
  const bytes = toBytes(input);
  if (bytes.length < 8) {
    return { isGrid: false, reason: 'Dosya çok kısa.' };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = view.getUint32(0, true);

  if (!Number.isInteger(n) || n < MIN_RES || n > MAX_RES) {
    return {
      isGrid: false,
      reason: `Baştaki sayı ızgara çözünürlüğü değil (${n}; ${MIN_RES}–${MAX_RES} bekleniyordu).`,
    };
  }

  const count = n * n;
  const need = 4 + count * 4;
  if (bytes.length < need) {
    return {
      isGrid: false,
      reason: `${n}×${n} ızgara için ${need.toLocaleString('tr-TR')} bayt gerekli, dosyada ${bytes.length.toLocaleString('tr-TR')} var.`,
    };
  }

  // İlk 4096 değeri tara: sonlu ve makul olmalı
  const probe = Math.min(count, 4096);
  let finite = 0;
  for (let i = 0; i < probe; i++) {
    const v = view.getFloat32(4 + i * 4, true);
    if (Number.isFinite(v) && Math.abs(v) <= MAX_ABS_VALUE) finite++;
  }
  if (finite / probe < 0.98) {
    return { isGrid: false, reason: 'Değerler float32 olarak okunabilir değil (muhtemelen metin/karma veri).' };
  }

  const stats = readStats(view, count, 4);
  if (stats.span === 0) {
    return { isGrid: false, reason: 'Tüm değerler aynı — yükseklik ızgarası değil.' };
  }

  return {
    isGrid: true,
    reason: `[uint32 ${n}] + ${n}×${n} float32 ızgara bulundu.`,
    resolution: n,
    min: stats.min,
    max: stats.max,
    mean: stats.mean,
  };
}

/* ==========================================================================
   2. AYRIŞTIRMA
   ========================================================================== */

/**
 * İkili ızgarayı yükseklik alanına çevirir.
 *
 * @param {ArrayBuffer|Uint8Array} input
 * @param {Object} [opts]
 *   headerSize : başlıktan sonraki veri ofseti (varsayılan 4)
 *   flipRows   : satır yönünü ters çevir (bazı araçlar Z'yi yukarı yazar)
 *   channel    : çok kanallıysa kanal indeksi (ileride)
 * @returns {{
 *   field: {width:number, height:number, data:Float32Array},
 *   stats: {min:number,max:number,mean:number,rms:number,span:number},
 *   resolution:number, dataOffset:number, trailingBytes:number
 * }}
 */
export function parseBinaryGrid(input, opts = {}) {
  const bytes = toBytes(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const headerSize = opts.headerSize ?? 4;
  const n = view.getUint32(0, true);

  if (!Number.isInteger(n) || n < MIN_RES || n > MAX_RES) {
    throw new BinaryGridError(
      `Geçersiz ızgara çözünürlüğü: ${n} (${MIN_RES}–${MAX_RES} bekleniyor).`,
      { code: 'E_BGRID_RES', resolution: n }
    );
  }

  const count = n * n;
  const need = headerSize + count * 4;
  if (bytes.length < need) {
    throw new BinaryGridError(
      `Veri eksik: ${need.toLocaleString('tr-TR')} bayt gerekli, ${bytes.length.toLocaleString('tr-TR')} mevcut.`,
      { code: 'E_BGRID_TRUNC', required: need, available: bytes.length }
    );
  }

  const data = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const v = view.getFloat32(headerSize + i * 4, true);
    data[i] = Number.isFinite(v) ? v : 0;     // NaN/Inf -> 0
  }

  const stats = readStats({ getFloat32: (o) => view.getFloat32(o, true) }, count, headerSize);

  // Satır ters çevirme: ızgara satır bazlı düz dizi olduğu için satır bloklarını ters çevir
  let out = data;
  if (opts.flipRows) {
    out = new Float32Array(count);
    for (let r = 0; r < n; r++) {
      out.set(data.subarray(r * n, (r + 1) * n), (n - 1 - r) * n);
    }
  }

  return {
    field: { width: n, height: n, data: out },
    stats,
    resolution: n,
    dataOffset: headerSize,
    trailingBytes: bytes.length - need,
  };
}

/**
 * Dosyayı okuyup ayrıştırır.
 * @param {File|Blob|ArrayBuffer} source
 * @param {Object} [opts] parseBinaryGrid seçenekleri
 */
export async function parseBinaryGridFile(source, opts = {}) {
  const buffer = await toArrayBuffer(source);
  const name = (source && source.name) || 'grid.bin';
  try {
    const result = parseBinaryGrid(buffer, opts);
    return { ...result, name, size: buffer.byteLength };
  } catch (err) {
    err.message = name + ': ' + err.message;
    throw err;
  }
}

/* ==========================================================================
   3. Yardımcılar
   ========================================================================== */

function readStats(view, count, offset) {
  let min = Infinity, max = -Infinity, sum = 0, sumSq = 0, nan = 0;
  for (let i = 0; i < count; i++) {
    const v = view.getFloat32(offset + i * 4, true);
    if (!Number.isFinite(v)) { nan++; continue; }
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sumSq += v * v;
  }
  const finite = count - nan;
  if (!finite) return { min: 0, max: 0, mean: 0, rms: 0, span: 0, nan };
  return {
    min, max,
    mean: sum / finite,
    rms: Math.sqrt(sumSq / finite),
    span: max - min,
    nan,
  };
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new BinaryGridError('Geçersiz girdi: ArrayBuffer veya TypedArray bekleniyor.', { code: 'E_BGRID_INPUT' });
}

async function toArrayBuffer(source) {
  if (source instanceof ArrayBuffer) return source;
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new BinaryGridError('Dosya okunamadı.', { code: 'E_BGRID_READ' }));
      fr.readAsArrayBuffer(source);
    });
  }
  throw new BinaryGridError('Geçersiz kaynak: File, Blob veya ArrayBuffer bekleniyor.', { code: 'E_BGRID_INPUT' });
}

/** Dosya adına göre ikili ızgara olabilir mi? */
export function isBinaryGridFile(name) {
  return /\.(smd|bin|raw|grid|map|dat)$/i.test(String(name || ''));
}

/** Sonuç özetini konsol/toast için okunur hale getirir. */
export function describeGrid(result) {
  const s = result.stats;
  return [
    `çözünürlük : ${result.resolution}×${result.resolution}`,
    `değer     : ${s.min.toFixed(2)} … ${s.max.toFixed(2)} (ortalama ${s.mean.toFixed(2)})`,
    `artık     : ${result.trailingBytes.toLocaleString('tr-TR')} bayt (okunmayan bölüm)`,
  ].join('\n');
}
