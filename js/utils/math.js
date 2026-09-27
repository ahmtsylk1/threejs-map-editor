/**
 * math.js
 * ---------------------------------------------------------------------------
 * Sayısal yardımcılar. Dönüşler kayıtlarda DERECE cinsinden saklanır
 * (JSON'ı insan tarafından okunabilir tutmak için), Three.js ise radyan
 * kullanır; dönüşümler bu dosyada toplanır.
 */

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

/** Yuvarlama hatasını temizler: -0 -> 0, 1e-13 -> 0 */
export function clean(n, precision = 6) {
  if (!Number.isFinite(n)) return 0;
  const r = Number(n.toFixed(precision));
  return Object.is(r, -0) ? 0 : r;
}

/** Basit lineer interpolasyon (LERP). */
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Frame-rate bağımsız yumuşatma ("exponential smoothing").
 * @param {number} current
 * @param {number} target
 * @param {number} lambda  ne kadar büyük, o kadar hızlı
 * @param {number} dt      saniye
 */
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Değeri ızgaraya yuvarlar (snap). */
export function snapTo(value, step) {
  if (!step || step <= 0) return value;
  return Math.round(value / step) * step;
}

/** İki ondalık basamağa yuvarlar. */
export const round2 = (n) => Math.round(n * 100) / 100;

/** Ölçü metni: 1.234,5 */
export function fmt(n, digits = 2) {
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** Kısa sayı biçimi: 1500 -> "1.5b", 25 -> "25" */
export function fmtCompact(n) {
  if (Math.abs(n) >= 1e9) return `${round2(n / 1e9)}b`;
  if (Math.abs(n) >= 1e6) return `${round2(n / 1e6)}M`;
  if (Math.abs(n) >= 1e3) return `${round2(n / 1e3)}b`;
  return String(Math.round(n));
}

/** 0..1 aralığına normalize eder. */
export const norm01 = (v) => clamp(v, 0, 1);

/** Yaklaşık eşitlik (float karşılaştırma). */
export const nearly = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
