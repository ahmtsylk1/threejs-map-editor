#!/usr/bin/env node
/**
 * tools/fetch-transcoder.mjs
 * ===========================================================================
 * KHR_texture_basisu (KTX2) dokularını çözebilmek için gereken iki dosyayı
 * indirir:
 *
 *   public/vendor/basis/basis_transcoder.wasm
 *   public/vendor/basis/basis_transcoder.js
 *
 * NEDEN GEREKLİ?
 * ---------------
 * Taranan model kitaplığının 1190 modeli `KHR_texture_basisu` eklentisini
 * `extensionsRequired` içinde bildiriyor. three.js `GLTFLoader` bu eklentiyi
 * tanır ama çözümleyiciyi KTX2Loader üzerinden bekler; KTX2Loader da
 * transcoder'ı KENDİSİ yükler. Transcoder dosyaları CDN'den gelirse:
 *   - çevrimdışı çalışmaz,
 *   - sürüm three.js ile eşleşmediğinde sessizce bozuk doku üretir.
 * Bu yüzden sürümü three.js ile birlikte kilitleyip projeye indiriyoruz.
 *
 * KULLANIM
 * --------
 *   node tools/fetch-transcoder.mjs
 *   node tools/fetch-transcoder.mjs --force     # yeniden indir
 *
 * Sürüm kaynağı: index.html içindeki importmap (`three@0.160.0`).
 * ===========================================================================
 */

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJE_KOKU = resolve(__dirname, '..');
const HEDEF = join(PROJE_KOKU, 'public', 'vendor', 'basis');

/** three.js sürümünü index.html'deki importmap'ten okur (sürümü kilitlemek için). */
async function threeSurumu() {
  const html = await readFile(join(PROJE_KOKU, 'index.html'), 'utf8');
  const m = html.match(/three@([\d.]+)/);
  if (!m) {
    throw new Error('index.html içinde "three@x.y.z" bulunamadı — sürüm kilidi bozuk.');
  }
  return m[1];
}

const DOSYALAR = [
  { ad: 'basis_transcoder.wasm', url: (v) => `https://unpkg.com/three@${v}/examples/jsm/libs/basis/basis_transcoder.wasm` },
  { ad: 'basis_transcoder.js', url: (v) => `https://unpkg.com/three@${v}/examples/jsm/libs/basis/basis_transcoder.js` },
];

const force = process.argv.includes('--force');

console.log('');
console.log('  KTX2 transcoder indiriliyor…');
console.log('');

const surum = await threeSurumu();
console.log('  three.js sürümü (importmap): ' + surum);
console.log('  hedef klasör            : ' + HEDEF);
console.log('');

await mkdir(HEDEF, { recursive: true });

let indirilen = 0, atlanan = 0;
const hatalar = [];

for (const d of DOSYALAR) {
  const yol = join(HEDEF, d.ad);

  if (!force && existsSync(yol)) {
    const s = await stat(yol);
    if (s.size > 0) {
      console.log(`  · ${d.ad.padEnd(26)} zaten var (${(s.size / 1024).toFixed(0)} KB) — atlandı`);
      atlanan++;
      continue;
    }
  }

  const url = d.url(surum);
  try {
    const cevap = await fetch(url);
    if (!cevap.ok) {
      throw new Error(`HTTP ${cevap.status} ${cevap.statusText}`);
    }
    const arabellek = Buffer.from(await cevap.arrayBuffer());
    if (arabellek.length === 0) throw new Error('boş dosya indirildi');

    await writeFile(yol, arabellek);
    console.log(`  ✓ ${d.ad.padEnd(26)} ${(arabellek.length / 1024).toFixed(0).padStart(6)} KB   ← ${url}`);
    indirilen++;
  } catch (e) {
    console.log(`  ✗ ${d.ad.padEnd(26)} BAŞARISIZ: ${e.message}`);
    console.log(`      ${url}`);
    hatalar.push({ ad: d.ad, neden: e.message });
  }
}

console.log('');
if (hatalar.length) {
  console.log('  ⚠ Bazı dosyalar indirilemedi. KTX2 dokulu modeller yüklenmeyecek.');
  console.log('    (MeshoptDecoder hâlâ çalışır; sadece dokular bozuk/eksik görünür.)');
  console.log('');
  process.exit(1);
}

console.log(`  ✓ hazır: ${indirilen} indirildi, ${atlanan} zaten vardı`);
console.log('');
console.log('  Editör KTX2Loader.detectSupport(this.renderer) ile bunları kullanır.');
console.log('  Artık <model>.glb dosyalarını doğrudan sürükleyip bırakabilirsiniz.');
console.log('');

// --- doğrulama: wasm gerçekten wasm mi? --------------------------------
const wasmYolu = join(HEDEF, 'basis_transcoder.wasm');
if (existsSync(wasmYolu)) {
  const b = await readFile(wasmYolu);
  const sihirli = Buffer.from([0x00, 0x61, 0x73, 0x6d]);       // \0asm
  if (b.subarray(0, 4).equals(sihirli)) {
    console.log('  doğrulama: .wasm dosyası geçerli WebAssembly ✓');
  } else {
    console.log('  ✗ doğrulama: .wasm dosyası WebAssembly imzası taşımıyor!');
    console.log('    CDN bir HTML hata sayfası döndürmüş olabilir (ağ engeli / sürüm yok).');
    process.exit(1);
  }
  console.log('');
}
