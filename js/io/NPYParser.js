/**
 * NPYParser.js
 * ===========================================================================
 * `.npy` (NumPy Binary Matrix) dosyası için BAĞIMSIZ (saf JS) parser.
 *
 * Neden saf JS? Projede numpy benzeri bir kütüphane yok ve editör tarayıcıda
 * çalışıyor. Bu dosya hiçbir three.js veya dış bağımlılığı olmadan çalışır;
 * yalnızca `ArrayBuffer` üzerinde çalışır (Web Worker'da da kullanılabilir).
 *
 * ---------------------------------------------------------------------------
 * BİÇİM (numpy/lib/format.py)
 * ---------------------------------------------------------------------------
 *   offset  içerik
 *   ------  ---------------------------------------------------------------
 *    0..5   magic  : 0x93 'N' 'U' 'M' 'P' 'Y'
 *    6      major version   (1 | 2 | 3)
 *    7      minor version
 *    8..    header uzunluğu : v1 -> uint16 LE, v2/v3 -> uint32 LE
 *    ...    header          : Python dict literali (v1/v2 latin1, v3 UTF-8)
 *    ...    ham veri        : C (satır-öncelikli) veya Fortran (sütun-öncelikli)
 *
 * Header örnekleri:
 *   v1 : {'descr': '<f4', 'fortran_order': False, 'shape': (2, 3), }
 *   v3 : {'descr': '<f4', 'fortran_order': False, 'shape': (2, 3, 4), }
 *
 * `descr` (dtype) sözleşmesi:
 *   <  little-endian | >  big-endian | |  sırasız (1 bayt) | =  native (LE varsayılır)
 *   f  float  | i  int  | u  uint  | b/?  bool  | c  complex  | S bytes  | U unicode
 *   sayı = bayt cinsinden eleman boyutu
 *
 * ---------------------------------------------------------------------------
 * DESTEKLENEN DTYPE'LAR
 * ---------------------------------------------------------------------------
 *   bool (|b1), int8/16/32/64, uint8/16/32/64, float16/32/64
 *
 * Desteklenmeyenler HATA VERMEZ; `dtype.supported === false` olarak işaretlenir
 * ve `parseNpy()` çağıran tarafa açıklayıcı bir mesajla döner. Böylece
 * "bu dosya bir terrain değil" durumunda sessizce bozuk veri üretmeyiz.
 * ---------------------------------------------------------------------------
 */

/** NPY sihirli dizisi (0x93 + "NUMPY"). */
export const NPY_MAGIC = Object.freeze([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]);

/** Güvenlik üst sınırı: bu eleman sayısını aşan dizi reddedilir. */
export const MAX_ELEMENTS = 64 * 1024 * 1024; // 64M eleman (256 MB float32)

/** Parsing hatası — kullanıcıya gösterilebilir mesaj taşır. */
export class NpyError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'NpyError';
    this.code = detail.code || 'E_NPY';
    this.detail = detail;
  }
}

/* ==========================================================================
   1. dtype ÇÖZÜMLEME
   --------------------------------------------------------------------------
   ÖNEMLİ: numpy'de tip HARFİ tek başına boyutu belirlemez.
     'f' -> f2 (float16) | f4 (float32) | f8 (float64) | f16 (longdouble)
     'i' -> i1 | i2 | i4 | i8
     'u' -> u1 | u2 | u4 | u8
   Bu yüzden önce harften KİND, sonra sayıdan BOYUT türetilir ve ikisinin
   geçerli bir eşleşme oluşturduğu doğrulanır.
   ========================================================================== */

/** Tip harfi -> tür. */
const KIND_BY_CHAR = {
  f: 'float',     // f2 / f4 / f8
  i: 'int',       // i1 / i2 / i4 / i8
  u: 'uint',      // u1 / u2 / u4 / u8
  b: 'bool',      // |b1  (numpy .descr bool için 'b1' yazar)
  '?': 'bool',    // eski numpy gösterimi
  c: 'complex',   // c8 / c16
  C: 'complex',   // c32
  S: 'bytes',     // |S10
  U: 'unicode',   // <U10
  V: 'void',      // <V24 (ham bayt)
};

/** Sayısal türler için geçerli bayt boyutları. */
const NUMERIC_SIZES = {
  bool: new Set([1]),
  int: new Set([1, 2, 4, 8]),
  uint: new Set([1, 2, 4, 8]),
  float: new Set([2, 4, 8]),      // 16 = longdouble -> tarayıcıda yok
};

/** Tip harfi verilmeden varsayılan boyut (sayısız sayısal tipler). */
const DEFAULT_SIZE = { float: 4, int: 4, uint: 4, bool: 1, complex: 8 };

/**
 * `descr` dizesini çözer.
 * @param {string} descr ör. '<f4', '>i8', '|b1', '|S16', '<U5', "[('x','f4'),('y','f4')]"
 * @returns {{descr:string, kind:string, byteOrder:string, itemsize:number,
 *            supported:boolean, signed:boolean, reason:string|undefined}}
 */
export function parseDtype(descr) {
  if (typeof descr !== 'string' || !descr.length) {
    throw new NpyError('dtype (descr) boş veya geçersiz.', { code: 'E_DTYPE' });
  }
  const raw = descr.trim();

  // Yapılandırılmış (structured) dtype
  if (raw.startsWith('[')) {
    return {
      descr: raw, kind: 'record', byteOrder: '|', itemsize: 0, supported: false, signed: false,
      reason: 'Yapılandırılmış (structured) dtype desteklenmiyor.',
    };
  }

  const order = raw[0];
  if (!'<>=|'.includes(order)) {
    throw new NpyError('Geçersiz bayt sırası: "' + raw + '". Beklenen <, >, = veya |', { code: 'E_DTYPE' });
  }
  const byteOrder = order === '=' ? '<' : order;      // native -> LE kabul

  const typeChar = raw[1];
  const kind = KIND_BY_CHAR[typeChar];
  if (!kind) {
    return {
      descr: raw, kind: 'unknown', byteOrder, itemsize: 0, supported: false, signed: false,
      reason: 'Bilinmeyen dtype kodu: "' + typeChar + '".',
    };
  }

  // ---- boyut ----
  const sizeText = raw.slice(2);
  let itemsize;

  if (sizeText.length) {
    const n = Number(sizeText);
    if (!Number.isInteger(n) || n <= 0) {
      throw new NpyError('Geçersiz dtype boyutu: "' + raw + '"', { code: 'E_DTYPE' });
    }
    // Unicode (U) eleman başına 4 bayt kod noktası saklar
    itemsize = kind === 'unicode' ? n * 4 : n;
  } else if (kind === 'bytes' || kind === 'unicode' || kind === 'void') {
    throw new NpyError('dtype boyutu eksik: "' + raw + '"', { code: 'E_DTYPE' });
  } else {
    itemsize = DEFAULT_SIZE[kind] ?? 0;
  }

  // ---- doğrulama ----
  let supported = false;
  let reason;

  if (kind === 'float' && itemsize === 16) {
    reason = 'float128 (longdouble) tarayıcıda karşılığı yok.';
  } else if (NUMERIC_SIZES[kind] && !NUMERIC_SIZES[kind].has(itemsize)) {
    reason = '"' + raw + '" geçersiz (' + kind + ' için izin verilen bayt: ' +
      [...NUMERIC_SIZES[kind]].join(', ') + ').';
  } else if (kind === 'complex' || kind === 'bytes' || kind === 'unicode' || kind === 'void') {
    reason = '"' + raw + '" sayısal yükseklik değerine dönüştürülemez.';
  } else {
    supported = true;
  }

  return { descr: raw, kind, byteOrder, itemsize, supported, signed: kind === 'int', reason };
}

/* ==========================================================================
   2. PYTHON LITERAL PARSER (header sözlüğü)
   --------------------------------------------------------------------------
   `eval()` KULLANILMAZ: dosya içeriği dışarıdan gelen veridir ve güvenlik
   riski oluşturur. Aşağıdaki küçük özyinelemeli çözümleyici yalnızca numpy
   header'larında görülen biçimleri kabul eder:
       dict  : { 'anahtar': değer, ... }
       tuple : ( a, b, c )      list: [ a, b ]
       string: '...'  "..."
       sayı  : 12  -3.5  1e-4
       sabit : True False None
   ========================================================================== */

/**
 * Python literal dizesini çözer.
 * @param {string} src
 * @returns {any}
 */
export function parsePyLiteral(src) {
  let i = 0;
  const s = src;
  const n = s.length;

  function fail(msg) {
    throw new NpyError('Header ayrıştırma hatası: ' + msg + ' (konum ' + i + ')', { code: 'E_HEADER_SYNTAX' });
  }

  function skip() {
    while (i < n) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }
      break;
    }
  }

  /** Sözlük anahtarı tırnak içinde olmak zorunda (numpy böyle yazar). */
  function parseKey() {
    skip();
    const c = s[i];
    if (c !== "'" && c !== '"') fail('sözlük anahtarı tırnak içinde olmalı');
    return parseString();
  }

  function parseString() {
    const quote = s[i++];
    let out = '';
    while (i < n) {
      const c = s[i];
      if (c === '\\') {
        const next = s[++i];
        const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '0': '\0' };
        out += Object.prototype.hasOwnProperty.call(map, next) ? map[next] : next;
        i++;
        continue;
      }
      if (c === quote) { i++; return out; }
      out += c; i++;
    }
    fail('kapanmamış tırnak');
    return out;
  }

  function parseNumber() {
    const start = i;
    if (s[i] === '+' || s[i] === '-') i++;
    while (i < n && /[0-9]/.test(s[i])) i++;
    if (s[i] === '.') { i++; while (i < n && /[0-9]/.test(s[i])) i++; }
    if (s[i] === 'e' || s[i] === 'E') {
      i++;
      if (s[i] === '+' || s[i] === '-') i++;
      while (i < n && /[0-9]/.test(s[i])) i++;
    }
    const text = s.slice(start, i);
    if (!text || text === '-' || text === '+') fail('geçersiz sayı "' + text + '"');
    const value = Number(text);
    if (!Number.isFinite(value)) fail('geçersiz sayı "' + text + '"');
    return value;
  }

  function parseValue() {
    skip();
    if (i >= n) fail('değer bekleniyordu');
    const c = s[i];

    if (c === '{') {
      i++;
      const obj = {};
      skip();
      if (s[i] === '}') { i++; return obj; }
      for (;;) {
        const key = parseKey();
        skip();
        if (s[i] !== ':') fail('":" bekleniyordu');
        i++;
        obj[key] = parseValue();
        skip();
        if (s[i] === ',') { i++; skip(); if (s[i] === '}') { i++; break; } continue; }
        if (s[i] === '}') { i++; break; }
        fail('"," veya "}" bekleniyordu');
      }
      return obj;
    }

    if (c === '(' || c === '[') {
      const close = c === '(' ? ')' : ']';
      i++;
      const arr = [];
      skip();
      if (s[i] === close) { i++; return arr; }
      for (;;) {
        arr.push(parseValue());
        skip();
        if (s[i] === ',') {
          i++;
          skip();
          if (s[i] === close) { i++; break; }   // sondaki virgül (trailing comma)
          continue;
        }
        if (s[i] === close) { i++; break; }
        fail('"," veya "' + close + '" bekleniyordu');
      }
      return arr;
    }

    if (c === "'" || c === '"') return parseString();

    if (s.startsWith('True', i))  { i += 4; return true; }
    if (s.startsWith('False', i)) { i += 5; return false; }
    if (s.startsWith('None', i))  { i += 4; return null; }

    if (/[-+0-9.]/.test(c)) return parseNumber();

    fail('tanınmayan değer "' + c + '"');
    return null;
  }

  const result = parseValue();
  skip();
  return result;
}

/* ==========================================================================
   3. HEADER PARSER
   ========================================================================== */

/**
 * Yalnızca header'ı çözer (veriyi okumaz) — hızlı doğrulama için.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Object} başlık bilgisi
 */
export function parseNpyHeader(input) {
  const bytes = toBytes(input);

  if (bytes.length < 10) {
    throw new NpyError('Dosya çok kısa (10 bayttan az) — geçerli bir .npy değil.', { code: 'E_TRUNCATED' });
  }

  // --- magic ---
  for (let i = 0; i < 6; i++) {
    if (bytes[i] !== NPY_MAGIC[i]) {
      throw new NpyError(
        'Geçersiz .npy imzası (0x93NUMPY bulunamadı). Dosya .npy değil ya da bozuk.',
        { code: 'E_MAGIC', got: Array.from(bytes.slice(0, 6)) }
      );
    }
  }

  // --- sürüm ---
  const major = bytes[6];
  const minor = bytes[7];
  if (major < 1 || major > 3) {
    throw new NpyError(
      'Desteklenmeyen .npy sürümü: ' + major + '.' + minor + ' (1, 2 veya 3 bekleniyor).',
      { code: 'E_VERSION' }
    );
  }

  // --- header uzunluğu ---
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let headerLength;
  let headerStart;
  if (major === 1) {
    headerLength = view.getUint16(8, true);
    headerStart = 10;
  } else {
    if (bytes.length < 12) {
      throw new NpyError('Header uzunluğu okunamadı (dosya kısa).', { code: 'E_TRUNCATED' });
    }
    headerLength = view.getUint32(8, true);
    headerStart = 12;
  }

  if (headerLength === 0) {
    throw new NpyError('Header uzunluğu 0 — bozuk dosya.', { code: 'E_HEADER_LEN' });
  }
  const dataOffset = headerStart + headerLength;
  if (dataOffset > bytes.length) {
    throw new NpyError(
      'Header veri sınırını aşıyor (beklenen ' + dataOffset + ' bayt, dosya ' + bytes.length + ' bayt).',
      { code: 'E_TRUNCATED' }
    );
  }

  // --- header metni (v3'ten itibaren UTF-8) ---
  const raw = bytes.subarray(headerStart, dataOffset);
  const headerText = major >= 3
    ? new TextDecoder('utf-8').decode(raw)
    : new TextDecoder('latin1').decode(raw);

  let dict;
  try {
    dict = parsePyLiteral(headerText);
  } catch (err) {
    throw new NpyError('Header çözümlenemedi: ' + err.message, {
      code: 'E_HEADER', header: headerText.slice(0, 200),
    });
  }

  if (!dict || typeof dict !== 'object' || Array.isArray(dict)) {
    throw new NpyError('Header bir sözlük değil.', { code: 'E_HEADER' });
  }
  if (!('descr' in dict) || !('shape' in dict)) {
    throw new NpyError('Header "descr" veya "shape" alanını içermiyor.', { code: 'E_HEADER' });
  }

  // --- shape ---
  const rawShape = Array.isArray(dict.shape) ? dict.shape : [dict.shape];
  const shape = rawShape.map((v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      throw new NpyError('Geçersiz shape öğesi: ' + v, { code: 'E_SHAPE' });
    }
    return n;
  });

  // --- dtype ---
  const dtype = parseDtype(dict.descr);

  // --- eleman sayısı ---
  const count = shape.reduce((a, b) => a * b, 1);
  if (count > MAX_ELEMENTS) {
    throw new NpyError(
      'Dizi çok büyük: ' + count.toLocaleString('tr-TR') + ' eleman (sınır ' +
      MAX_ELEMENTS.toLocaleString('tr-TR') + ').',
      { code: 'E_TOO_LARGE' }
    );
  }

  // --- veri boyutu tutarlılığı ---
  const available = bytes.length - dataOffset;
  const required = count * dtype.itemsize;
  if (dtype.itemsize > 0 && available < required) {
    throw new NpyError(
      'Veri eksik: ' + required + ' bayt gerekli, ' + available + ' bayt mevcut. ' +
      'Dosya yarım kopyalanmış olabilir.',
      { code: 'E_TRUNCATED', required, available }
    );
  }

  return {
    major, minor, headerLength, dataOffset, headerText, dict, dtype, shape, count,
    fortranOrder: dict.fortran_order === true,
    byteLength: bytes.length,
    available,
    required,
  };
}

/* ==========================================================================
   4. VERİ ÇÖZÜMLEME
   ========================================================================== */

/** Platformun küçük bayt sırası mı? (sıfır kopyalı yol için gerekli) */
const PLATFORM_LITTLE_ENDIAN = (() => {
  const probe = new ArrayBuffer(2);
  new Uint16Array(probe)[0] = 1;
  return new Uint8Array(probe)[0] === 1;
})();

/**
 * Ham baytları istenen tipe çevirir.
 * @param {ArrayBuffer|Uint8Array} input
 * @param {Object} header parseNpyHeader çıktısı
 * @param {'float32'|'int32'|'uint32'} target
 * @returns {TypedArray}
 */
function readData(input, header, target) {
  const { dtype, count, dataOffset } = header;
  const bytes = toBytes(input);
  const little = dtype.byteOrder !== '>';
  const isz = dtype.itemsize;

  // --- SIFIR KOPYALI YOL ---
  // Kaynak tip hedefle birebir aynıysa ve makine bayt sırası uyuşuyorsa
  // paylaşımlı kopya üretilir (büyük heightmap'larda belirgin hız kazancı).
  const srcIsTarget =
    (target === 'float32' && dtype.kind === 'float' && isz === 4) ||
    (target === 'int32' && dtype.kind === 'int' && isz === 4) ||
    (target === 'uint32' && dtype.kind === 'uint' && isz === 4) ||
    (target === 'int32' && dtype.kind === 'bool');

  if (srcIsTarget && little === PLATFORM_LITTLE_ENDIAN && dataOffset % isz === 0) {
    const start = bytes.byteOffset + dataOffset;
    const end = start + count * isz;
    if (end <= bytes.buffer.byteLength) {
      try {
        if (target === 'float32') return new Float32Array(bytes.buffer.slice(start, end));
        if (target === 'uint32') return new Uint32Array(bytes.buffer.slice(start, end));
        if (dtype.kind === 'bool') {
          const raw8 = new Uint8Array(bytes.buffer, start, count);
          const out = new Int32Array(count);
          for (let i = 0; i < count; i++) out[i] = raw8[i] ? 1 : 0;
          return out;
        }
        return new Int32Array(bytes.buffer.slice(start, end));
      } catch { /* paylaşım başarısız -> dönüştürme yoluna düş */ }
    }
  }

  // --- DÖNÜŞTÜRME YOLU ---
  // DataView veri bölgesine OFSETLİ açılır; böylece getFloat32(i*isz)
  // doğrudan eleman adresini verir.
  const view = new DataView(bytes.buffer, bytes.byteOffset + dataOffset, count * isz);
  const Ctor = target === 'int32' ? Int32Array : target === 'uint32' ? Uint32Array : Float32Array;
  const out = new Ctor(count);

  switch (dtype.kind) {
    case 'float': {
      if (isz === 2) {
        const tmp = new Uint16Array(count);
        for (let i = 0; i < count; i++) tmp[i] = view.getUint16(i * 2, little);
        return float16ToFloat32(tmp);
      }
      for (let i = 0; i < count; i++) {
        const v = isz === 4 ? view.getFloat32(i * 4, little) : view.getFloat64(i * 8, little);
        if (target === 'float32') out[i] = v;
        else if (target === 'int32') out[i] = Math.trunc(v) | 0;
        else out[i] = v < 0 ? 0 : Math.trunc(v) >>> 0;
      }
      return out;
    }

    case 'int': {
      for (let i = 0; i < count; i++) {
        const o = i * isz;
        let v;
        if (isz === 1) v = view.getInt8(o);
        else if (isz === 2) v = view.getInt16(o, little);
        else if (isz === 4) v = view.getInt32(o, little);
        else v = Number(view.getBigInt64(o, little));
        if (target === 'int32') out[i] = v | 0;
        else if (target === 'uint32') out[i] = v >>> 0;
        else out[i] = v;
      }
      return out;
    }

    case 'uint': {
      for (let i = 0; i < count; i++) {
        const o = i * isz;
        let v;
        if (isz === 1) v = view.getUint8(o);
        else if (isz === 2) v = view.getUint16(o, little);
        else if (isz === 4) v = view.getUint32(o, little);
        else v = Number(view.getBigUint64(o, little));
        if (target === 'int32') out[i] = v | 0;
        else if (target === 'uint32') out[i] = v >>> 0;
        else out[i] = v;
      }
      return out;
    }

    case 'bool': {
      for (let i = 0; i < count; i++) {
        const b = view.getUint8(i) ? 1 : 0;
        if (target === 'float32') out[i] = b;
        else out[i] = b;
      }
      return out;
    }

    default:
      throw new NpyError('"' + dtype.descr + '" verisi sayısala çevrilemiyor.', { code: 'E_DTYPE' });
  }
}

/* ==========================================================================
   5. FLOAT16 <-> FLOAT32
   ========================================================================== */

/**
 * IEEE 754 half (float16) -> float32 dönüşümü.
 * @param {Uint16Array} src
 * @returns {Float32Array}
 */
export function float16ToFloat32(src) {
  const out = new Float32Array(src.length);
  const buf = new ArrayBuffer(4);
  const f32 = new Float32Array(buf);
  const u32 = new Uint32Array(buf);

  for (let i = 0; i < src.length; i++) {
    const h = src[i];
    const sign = (h & 0x8000) >> 15;
    const exp = (h & 0x7c00) >> 10;
    const frac = h & 0x03ff;

    if (exp === 0) {
      if (frac === 0) {
        u32[0] = sign << 31;                        // ±0
      } else {                                      // subnormal -> normalize
        let e = -1;
        let f = frac;
        do { f <<= 1; e++; } while ((f & 0x400) === 0);
        f &= 0x3ff;
        u32[0] = (sign << 31) | ((127 - 15 - e) << 23) | (f << 13);
      }
    } else if (exp === 0x1f) {
      u32[0] = (sign << 31) | (0xff << 23) | (frac << 13);   // Inf / NaN
    } else {
      u32[0] = (sign << 31) | ((exp - 15 + 127) << 23) | (frac << 13);
    }
    out[i] = f32[0];
  }
  return out;
}

/** float32 -> float16 (yeniden örnekleme / önizleme üretimi için). */
export function float32ToFloat16(src) {
  const out = new Uint16Array(src.length);
  const buf = new ArrayBuffer(4);
  const f32 = new Float32Array(buf);
  const u32 = new Uint32Array(buf);

  for (let i = 0; i < src.length; i++) {
    f32[0] = src[i];
    const x = u32[0];
    const sign = (x >>> 16) & 0x8000;
    let exp = ((x >>> 23) & 0xff) - 127 + 15;
    let frac = x & 0x7fffff;

    if (exp <= 0) { out[i] = sign; continue; }              // underflow
    if (exp >= 0x1f) { out[i] = sign | 0x7c00; continue; }  // overflow

    frac += 0x1000;                                          // yuvarlama
    if (frac & 0x800000) {
      frac = 0;
      exp++;
      if (exp >= 0x1f) { out[i] = sign | 0x7c00; continue; }
    }
    out[i] = sign | (exp << 10) | (frac >> 13);
  }
  return out;
}

/* ==========================================================================
   6. İSTATİSTİK + YENİDEN ŞEKİLLENDİRME
   ========================================================================== */

/**
 * Dizinin min/max/ortalama/RMS ve NaN/Inf sayısını hesaplar.
 * @param {TypedArray} data
 * @returns {Object}
 */
export function computeStats(data) {
  let min = Infinity, max = -Infinity, sum = 0, sumSq = 0;
  let nan = 0, inf = 0, finite = 0;

  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (Number.isNaN(v)) { nan++; continue; }
    if (!Number.isFinite(v)) { inf++; continue; }
    finite++;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sumSq += v * v;
  }

  if (!finite) return { min: 0, max: 0, mean: 0, rms: 0, span: 0, nan, inf, finite: 0 };
  const mean = sum / finite;
  return { min, max, mean, rms: Math.sqrt(sumSq / finite), span: max - min, nan, inf, finite };
}

/**
 * Çok boyutlu diziyi 2B yükseklik alanına indirger.
 *   1D (N)        -> 1 × N
 *   2D (H, W)     -> H × W
 *   3D (D, H, W)  -> kanal seçilir (varsayılan 0) veya ortalanır
 *   4D+           -> kalan eksenler ortalanır
 *
 * @param {TypedArray} data
 * @param {number[]} shape
 * @param {Object} [opts] { channel, fortranOrder, average }
 * @returns {{width:number, height:number, data:Float32Array}}
 */
export function reshapeToHeightmap(data, shape, opts = {}) {
  let dims = shape.slice();
  let src = data;

  // 0-d (skaler) dizi: numpy shape = ()  ->  1 × 1 alan
  if (dims.length === 0) dims = [1, 1];

  if (dims.length >= 3) {
    const d0 = dims[0];
    const h = dims[dims.length - 2];
    const w = dims[dims.length - 1];
    const channel = opts.channel ?? 0;
    const useAverage = opts.average === true;

    if (channel >= d0 && !useAverage) {
      throw new NpyError('Kanal indeksi ' + channel + ' geçersiz (derinlik ' + d0 + ').', { code: 'E_CHANNEL' });
    }
    const planes = h * w;
    const out = new Float32Array(planes);
    for (let p = 0; p < planes; p++) {
      if (useAverage) {
        let acc = 0;
        for (let c = 0; c < d0; c++) acc += src[c * planes + p];
        out[p] = acc / d0;
      } else {
        out[p] = src[channel * planes + p];
      }
    }
    src = out;
    dims = [h, w];
  }

  if (dims.length === 1) dims = [1, dims[0]];

  const height = dims[dims.length - 2];
  const width = dims[dims.length - 1];
  const out = new Float32Array(width * height);

  if (dims.length === 2) {
    if (opts.fortranOrder) {
      // Fortran (sütun-öncelikli) -> transpoze ederek C order'a getir
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) out[r * width + c] = src[c * height + r];
      }
    } else {
      const n = Math.min(out.length, src.length);
      for (let i = 0; i < n; i++) out[i] = src[i];
    }
  } else {
    const depth = dims.slice(0, dims.length - 2).reduce((a, b) => a * b, 1);
    const planes = width * height;
    for (let d = 0; d < depth; d++) {
      for (let p = 0; p < planes; p++) out[p] += src[d * planes + p];
    }
    if (depth > 1) for (let p = 0; p < planes; p++) out[p] /= depth;
  }

  return { width, height, data: out };
}

/**
 * Yükseklik alanını 0..1 aralığına normalize eder.
 * @param {Object} field
 * @param {Object} [opts] { min, max, invert, gamma }
 * @returns {{width:number, height:number, data:Float32Array, min:number, max:number}}
 */
export function normalizeField(field, opts = {}) {
  const hasRange = Number.isFinite(opts.min) && Number.isFinite(opts.max);
  const stats = hasRange ? { min: opts.min, max: opts.max } : computeStats(field.data);
  const { min, max } = stats;
  const span = max - min;
  const invert = opts.invert === true;
  const gamma = Number.isFinite(opts.gamma) && opts.gamma > 0 ? opts.gamma : 1;

  const out = new Float32Array(field.data.length);
  if (span <= 0) {
    out.fill(invert ? 1 : 0);
  } else {
    for (let i = 0; i < out.length; i++) {
      let t = (field.data[i] - min) / span;
      if (!Number.isFinite(t)) t = 0;
      if (invert) t = 1 - t;
      if (gamma !== 1) t = Math.pow(t, gamma);
      out[i] = t;
    }
  }
  return { width: field.width, height: field.height, data: out, min, max };
}

/**
 * Yükseklik alanını indirger (nearest) — JSON'a gömmek için.
 * @param {Object} field
 * @param {number} target en fazla bu genişlik/yükseklik
 * @returns {{width:number, height:number, data:Float32Array}}
 */
export function downsampleField(field, target) {
  const w = field.width, h = field.height;
  const tw = Math.max(1, Math.min(w, Math.round(target)));
  const th = Math.max(1, Math.min(h, Math.round(target)));
  if (tw === w && th === h) {
    return { width: w, height: h, data: Float32Array.from(field.data) };
  }
  const out = new Float32Array(tw * th);
  for (let y = 0; y < th; y++) {
    const sy = Math.min(h - 1, Math.floor((y + 0.5) * h / th));
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(w - 1, Math.floor((x + 0.5) * w / tw));
      out[y * tw + x] = field.data[sy * w + sx];
    }
  }
  return { width: tw, height: th, data: out };
}

/* ==========================================================================
   7. ANA API
   ========================================================================== */

/**
 * .npy dosyasını (veya ham buffer'ı) çözer.
 *
 * @param {ArrayBuffer|Uint8Array} input
 * @param {Object} [opts]
 *   target : 'float32' | 'int32' | 'uint32'  (varsayılan: dtype'a göre doğal)
 *   channel: 3B dizilerde hangi kanal (varsayılan 0)
 *   average: 3B dizilerde kanalların ortalamasını al
 *   stats  : istatistik hesaplansın mı (varsayılan true)
 * @returns {Object} ayrıştırılmış dizi
 */
export function parseNpy(input, opts = {}) {
  const header = parseNpyHeader(input);

  if (!header.dtype.supported) {
    throw new NpyError(
      'Desteklenmeyen veri tipi: ' + header.dtype.descr + '. ' + (header.dtype.reason || ''),
      { code: 'E_DTYPE', dtype: header.dtype, shape: header.shape }
    );
  }

  const target = opts.target || naturalKind(header.dtype);
  let data = readData(input, header, target);

  // Veri fazlalığı varsa kırp
  const truncated = data.length > header.count;
  if (truncated) data = data.slice(0, header.count);

  // Yükseklik işi daima float32 üzerinden yürür
  let values = data;
  if (target !== 'float32') {
    values = new Float32Array(header.count);
    for (let i = 0; i < header.count; i++) values[i] = data[i];
  }

  const field = reshapeToHeightmap(values, header.shape, {
    channel: opts.channel,
    average: opts.average,
    fortranOrder: header.fortranOrder,
  });

  return {
    version: { major: header.major, minor: header.minor },
    headerText: header.headerText,
    dtype: header.dtype,
    shape: header.shape,
    count: header.count,
    fortranOrder: header.fortranOrder,
    data: values,
    field,
    stats: opts.stats === false ? null : computeStats(values),
    byteLength: header.byteLength,
    truncated,
    dataOffset: header.dataOffset,
  };
}

/**
 * .npy dosyasını okuyup çözer (File / Blob / ArrayBuffer).
 * @param {File|Blob|ArrayBuffer} source
 * @param {Object} [opts] parseNpy seçenekleri
 * @returns {Promise<Object>} parseNpy çıktısı + { name, size }
 */
export async function parseNpyFile(source, opts = {}) {
  const buffer = await toArrayBuffer(source);
  const name = (source && source.name) || 'veri.npy';
  try {
    const result = parseNpy(buffer, opts);
    return { ...result, name, size: buffer.byteLength };
  } catch (err) {
    err.message = name + ': ' + err.message;
    throw err;
  }
}

/* ==========================================================================
   8. YARDIMCILAR
   ========================================================================== */

function naturalKind(dtype) {
  if (dtype.kind === 'float') return 'float32';
  if (dtype.kind === 'int' || dtype.kind === 'bool') return 'int32';
  return 'uint32';
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new NpyError('Geçersiz girdi: ArrayBuffer veya TypedArray bekleniyor.', { code: 'E_INPUT' });
}

async function toArrayBuffer(source) {
  if (source instanceof ArrayBuffer) return source;
  if (ArrayBuffer.isView(source)) {
    return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  }
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new NpyError('Dosya okunamadı.', { code: 'E_READ' }));
      fr.readAsArrayBuffer(source);
    });
  }
  throw new NpyError('Geçersiz kaynak: ArrayBuffer, TypedArray veya Blob bekleniyor.', { code: 'E_INPUT' });
}

/** Dosya adına göre .npy mi? */
export function isNpyFile(name) {
  return /\.npy$/i.test(String(name || ''));
}

/**
 * Diziyi .npy buffer'ına çevirir (test/fiyat üretimi için).
 * Yalnızca float32/int32 ve C-order desteklenir.
 * @param {ArrayLike<number>} data
 * @param {number[]} shape
 * @param {{descr?:'float32'|'int32'}} [opts]
 * @returns {Uint8Array}
 */
export function encodeNpy(data, shape, opts = {}) {
  const descr = opts.descr === 'int32' ? '<i4' : '<f4';
  const itemsize = 4;
  const dict = "{'descr': '" + descr + "', 'fortran_order': False, 'shape': (" + shape.join(', ') + '), }';

  // numpy ile aynı hizalama: (10 + headerLength) 64'ün katı olmalı
  const PREFIX = 10;
  const target = Math.ceil((PREFIX + dict.length + 1) / 64) * 64;
  const headerText = dict + ' '.repeat(Math.max(0, target - PREFIX - dict.length - 1)) + '\n';
  const headerBytes = new TextEncoder().encode(headerText);

  const out = new Uint8Array(PREFIX + headerBytes.length + data.length * itemsize);
  out.set(NPY_MAGIC, 0);
  out[6] = 1;
  out[7] = 0;
  new DataView(out.buffer).setUint16(8, headerBytes.length, true);
  out.set(headerBytes, PREFIX);

  const dv = new DataView(out.buffer, PREFIX + headerBytes.length);
  for (let i = 0; i < data.length; i++) {
    if (descr === '<i4') dv.setInt32(i * 4, data[i] | 0, true);
    else dv.setFloat32(i * 4, data[i], true);
  }
  return out;
}
