#!/usr/bin/env node
/**
 * tools/scan-assets.mjs
 * ===========================================================================
 * Dış bir projedeki 3B varlıkları (glTF / GLB / OBJ) tarar, editörün sunduğu
 * klasöre kopyalar ve bir MANIFEST üretir.
 *
 * NEDEN AYRI BİR ADIM?
 * --------------------
 * Editör tarayıcıda çalışan statik bir uygulamadır; dosya sistemine erişemez.
 * Yani "C:\...\public\models" altındaki 1390 modeli tarayıcı listeleyemez.
 * Bu yüzden taraMA + kopyalama + manifest üretimi derleme zamanı bir iş
 * olmalıdır; editör yalnızca üretilen manifesti okur.
 *
 * KULLANIM
 * --------
 *   node tools/scan-assets.mjs                       # varsayılan kaynak
 *   node tools/scan-assets.mjs --src "C:\proj"       # kaynak dizin
 *   node tools/scan-assets.mjs --dry-run             # kopyalamadan sadece rapor
 *   node tools/scan-assets.mjs --max-mb 2            # 2 MB üstünü atla
 *   node tools/scan-assets.mjs --limit 200            # en fazla 200 model
 *   node tools/scan-assets.mjs --include "dungeon,props"  # sadece bu klasörler
 *   node tools/scan-assets.mjs --clean                # çıktı klasörünü boşalt
 *
 * ÇIKIŞ
 * -----
 *   public/assets/imported/
 *     ├── imported-assets.json      ← manifest (editörün okuduğu dosya)
 *     ├── <kategori>/<ad>.glb        ← kopyalanan modeller
 *     └── ...
 * ===========================================================================
 */

import { readdir, stat, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname, relative, extname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJE_KOKU = resolve(__dirname, '..');

/* ==========================================================================
   1. VARSAYILANLAR
   ========================================================================== */

const VARSAYILAN = {
  src: 'C:\\worldofclaudecraft\\world-of-claudecraft-main',
  out: join(PROJE_KOKU, 'public', 'assets', 'imported'),

  /** glTF çift sayı (container). Ayrı dosyadaki doku/buffer referansları var. */
  gltf: true,
  /** Wavefront OBJ (+ .mtl ve yanındaki dokular). */
  obj: true,

  /** Boyut sınırları. 0 = sınırsız. */
  minKb: 0,
  maxMb: 8,

  /** En fazla kaç model kopyalınsın (0 = sınırsız). */
  limit: 400,

  /** Yalnızca bu kaynak-klasör adlarını kabul et (virgülle ayrılmış). Boş = hepsi. */
  include: '',
  /** Bu adları atla. */
  exclude: 'test,tests,node_modules,.git,dist,build,.cache,source_meshes',

  /** Kategori adını nereden alacağız. */
  categoryDepth: 1,        // 1 = "models/<kategori>/x.glb" → <kategori>

  /** Üst üste binen adlarda son ek. */
  collisionSuffix: '_2',

  dryRun: false,
  clean: false,
  verbose: false,
};

const UZANTI = {
  MODEL: ['.glb', '.gltf', '.obj'],
  DOKU: ['.png', '.jpg', '.jpeg', '.webp', '.ktx2', '.tga', '.bmp', '.gif'],
  YAN: ['.mtl'],
};

/* ==========================================================================
   2. KOMUT SATIRI AYRIŞTIRMA
   ========================================================================== */

function arglariCoz(argv) {
  const o = { ...VARSAYILAN };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const sonraki = () => argv[++i];
    switch (a) {
      case '--src': o.src = sonraki(); break;
      case '--out': o.out = resolve(sonraki()); break;
      case '--limit': o.limit = parseInt(sonraki(), 10) || 0; break;
      case '--min-kb': o.minKb = parseFloat(sonraki()) || 0; break;
      case '--max-mb': o.maxMb = parseFloat(sonraki()) || 0; break;
      case '--include': o.include = sonraki(); break;
      case '--exclude': o.exclude = sonraki(); break;
      case '--category-depth': o.categoryDepth = parseInt(sonraki(), 10) || 1; break;
      case '--no-gltf': o.gltf = false; break;
      case '--no-obj': o.obj = false; break;
      case '--dry-run': o.dryRun = true; break;
      case '--clean': o.clean = true; break;
      case '--verbose': case '-v': o.verbose = true; break;
      case '--help': case '-h': yardim(); process.exit(0); break;
      default:
        if (a.startsWith('--')) {
          console.error(`Bilinmeyen seçenek: ${a}`);
          yardim();
          process.exit(2);
        }
    }
  }
  return o;
}

function yardim() {
  console.log(`
tools/scan-assets.mjs — dış projeden 3B varlık taraması / kopyalama / manifest

  --src <yol>         Kaynak kök dizin
  --out <yol>         Çıktı klasörü (varsayılan: public/assets/imported)
  --limit <n>         En fazla n model        (0 = sınırsız)
  --min-kb <n>        Bu boyuttan küçükleri atla
  --max-mb <n>        Bu boyuttan büyükleri atla (0 = sınırsız)
  --include "a,b"     Yalnızca bu kaynak klasörlerini tara
  --exclude "a,b"     Bu klasörleri atla
  --category-depth n  Kategoriyi kaç klasör derinlikten al (1 = doğrudan alt klasör)
  --no-gltf           .gltf / .glb taramasını kapat
  --no-obj            .obj taramasını kapat
  --clean             Çıktı klasörünü önce boşalt
  --dry-run           Kopyalama yapmadan yalnızca rapor üret
  -v, --verbose       Her dosya için satır yaz
  -h, --help          Bu yardım
`);
}

/* ==========================================================================
   3. GLB BAŞLIK ÇÖZÜMLEYİCİ
   --------------------------------------------------------------------------
   GLB ikili biçimdir:
     [0..3]  "glTF"           sihirli dizi
     [4..7]  version (uint32)  2
     [8..11] length  (uint32)  dosyanın tamamı
     [12..]  chunk0: [len][type=0x4E4F534A "JSON"][veri]

   Bu çözümleyici dosyanın TAMAMINI okumaz; yalnızca ilk JSON chunk'ını
   (pratikte < 1 MB) alır. Böylece 4 MB'lık modelleri de hızlı tarar.
   ========================================================================== */

/**
 * @param {Buffer} buf
 * @returns {{ok:true, json:Object}|{ok:false, reason:string}}
 */
function glbOku(buf) {
  if (buf.length < 20) return { ok: false, reason: 'dosya GLB başlığından kısa' };

  const magic = buf.toString('latin1', 0, 4);
  if (magic !== 'glTF') return { ok: false, reason: `sihirli dizi "glTF" değil, "${magic}" bulundu` };

  const version = buf.readUInt32LE(4);
  if (version !== 2) return { ok: false, reason: `GLB sürümü ${version} (yalnızca 2 desteklenir)` };

  const total = buf.readUInt32LE(8);
  if (total > buf.length) {
    return { ok: false, reason: `başlık boyutu ${total}, dosya ${buf.length} bayt` };
  }

  const chunkLen = buf.readUInt32LE(12);
  const chunkType = buf.readUInt32LE(16);
  if (chunkType !== 0x4E4F534A) return { ok: false, reason: 'ilk chunk JSON değil' };
  if (20 + chunkLen > buf.length) return { ok: false, reason: 'JSON chunk taşma yapıyor' };

  let json;
  try {
    json = JSON.parse(buf.toString('utf8', 20, 20 + chunkLen));
  } catch (e) {
    return { ok: false, reason: `JSON chunk çözümlenemedi: ${e.message}` };
  }
  return { ok: true, json };
}

/**
 * glTF JSON'undan editörün işine yarayacak özet çıkarır.
 *
 * Özellikle `POSITION` accessor'larının `count` ve `min/max` değerleri
 * verilir; bunlar üçgensiz vertex sayısını ve ham sınır kutusunu verir.
 *
 * @param {Object} gltf
 * @returns {Object} özet
 */
function gltfOzet(gltf) {
  const accessors = gltf.accessors || [];
  const meshes = gltf.meshes || [];
  const materials = gltf.materials || [];

  let vertex = 0, triangles = 0, primitives = 0, morphed = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  const accessorBilgi = (idx) => {
    const a = accessors[idx];
    if (!a) return null;
    // Kuantize edilmiş (KHR_mesh_quantization) accessor'larda min/max
    // normalize edilmiş olabilir; yine de sınır için en iyi tahmindir.
    return a;
  };

  for (const mesh of meshes) {
    for (const prim of mesh.primitives || []) {
      primitives++;
      const pos = accessorBilgi(prim.attributes?.POSITION);
      if (pos) {
        vertex += pos.count || 0;
        if (Array.isArray(pos.min)) {
          for (let i = 0; i < 3; i++) {
            if (pos.min[i] < min[i]) min[i] = pos.min[i];
            if (pos.max[i] > max[i]) max[i] = pos.max[i];
          }
        }
      }
      if (prim.indices != null) {
        const idx = accessors[prim.indices];
        if (idx) triangles += Math.floor((idx.count || 0) / 3);
      } else if (pos) {
        triangles += Math.floor((pos.count || 0) / 3);   // indekssiz
      }
      if (prim.targets?.length) morphed += prim.targets.length;
    }
  }

  const finite = (a) => a.map((n) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0));
  const boyut = [
    max[0] - min[0], max[1] - min[1], max[2] - min[2],
  ].map((n) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0));

  const required = gltf.extensionsRequired || [];
  const used = gltf.extensionsUsed || [];

  /*
   * ÖNEMLİ — sınır kutusu güvenilirliği:
   * `KHR_mesh_quantization` kullanılıyorsa accessor `min`/`max` değerleri
   * KUANTİZE UZAYDADIR, dünya biriminde değildir. Blender'dan "Mesh →
   * Quantize" ile dışa aktarılmış modellerde tipik olarak 65535 / 65534 gibi
   * anlamsız sayılar çıkar. Bu değerler nesne yerleşiminde kullanılırsa
   * model havada uçar ya da yerin altına gömülür.
   *
   * Bu yüzden kuantizasyon varsa sınır "GÜVENSİZ" işaretlenir ve editör
   * gerçek sınırı modeli YÜKLENDİKTEN SONRA hesaplar.
   */
  const kuantize = used.includes('KHR_mesh_quantization') || required.includes('KHR_mesh_quantization');

  return {
    vertexCount: vertex,
    triangleCount: triangles,
    primitiveCount: primitives,
    meshCount: meshes.length,
    materialCount: materials.length,
    textureCount: (gltf.textures || []).length,
    imageCount: (gltf.images || []).length,
    animationCount: (gltf.animations || []).length,
    skinCount: (gltf.skins || []).length,
    morphTargetCount: morphed,
    hasMorph: morphed > 0,
    hasMesh: vertex > 0,
    boundsMin: finite(min),
    boundsMax: finite(max),
    boundsSize: finite(boyut),
    /** false ise `bounds*` değerleri dünya birimi DEĞİLDİR — çalışma zamanında hesaplanmalı */
    boundsReliable: !kuantize,
    extensionsRequired: required,
    extensionsUsed: used,
    // editörün yükleyicilerinin destekleyip desteklemediği
    needsMeshopt: required.includes('EXT_meshopt_compression'),
    needsKTX2: required.includes('KHR_texture_basisu'),
  };
}

/** OBJ için çok hafif bir tarama (üçgen / köşe sayısı). */
function objOzet(text) {
  let vertex = 0, triangles = 0, faces = 0, usemtl = 0;
  // tüm dosyayı satır satır saymak yerine hızlı sayaç kullan
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 118 /* v */ && i + 1 < text.length) {
      const sonraki = text.charCodeAt(i + 1);
      if (sonraki === 32 || sonraki === 9) { vertex++; i += 1; continue; }
    }
    if (c === 102 /* f */ && i + 1 < text.length) {
      const sonraki = text.charCodeAt(i + 1);
      if (sonraki === 32 || sonraki === 9) { faces++; i += 1; continue; }
    }
    if (c === 117 /* u */ && i + 1 < text.length) {
      if (text.charCodeAt(i + 1) === 115 /* s */ && text.charCodeAt(i + 2) === 101) usemtl++;
    }
  }
  // çokgenleri üçgene indirgüyoruz (kabaca)
  triangles = faces * 2;              // çoğu üçgen/quad karışımı
  return { vertexCount: vertex, triangleCount: triangles, faceCount: faces, materialSlots: usemtl };
}

/* ==========================================================================
   4. DİZİN TARAMA
   ========================================================================== */

/**
 * Özyinelemeli dizin yürüyüşü. Sembolik bağ ve döngü koruması içerir.
 * @returns {Promise<Array<{yol:string, ad:string, uzunluk:number, mtime:number}>>}
 */
async function tara(kok, secenekler) {
  const cikti = [];
  const atlanacak = new Set(
    secenekler.exclude.split(',').map((s) => s.trim().toLocaleLowerCase('tr')).filter(Boolean)
  );
  const izinli = new Set(
    secenekler.include.split(',').map((s) => s.trim().toLocaleLowerCase('tr')).filter(Boolean)
  );
  const gecerli = new Set(
    [...(secenekler.gltf ? ['.glb', '.gltf'] : []), ...(secenekler.obj ? ['.obj'] : [])]
  );

  /** @type {Set<string>} */
  const gezilen = new Set();

  async function adim(dizin, derinlik) {
    // sembolik bağ / döngü koruması
    let gercek;
    try {
      gercek = await realpath(dizin);
    } catch {
      return;
    }
    if (gezilen.has(gercek)) return;
    gezilen.add(gercek);

    let girisler;
    try {
      girisler = await readdir(dizin, { withFileTypes: true });
    } catch (e) {
      if (secenekler.verbose) console.warn(`  ! okunamadı: ${dizin} (${e.code})`);
      return;
    }

    for (const g of girisler) {
      const tam = join(dizin, g.name);

      if (g.isDirectory()) {
        const ad = g.name.toLocaleLowerCase('tr');
        if (atlanacak.has(ad) || ad.startsWith('.')) continue;
        // --include verildiyse yalnızca o klasörün içine gir
        if (izinli.size && derinlik === 0 && !izinli.has(ad)) continue;
        await adim(tam, derinlik + 1);
        continue;
      }

      if (!g.isFile()) continue;
      const uzanti = extname(g.name).toLowerCase();
      if (!gecerli.has(uzanti)) continue;

      // --include verildiyse dosya yolunda izinli klasör geçmeli
      if (izinli.size) {
        const yol = relative(kok, tam).toLocaleLowerCase('tr');
        const uygun = [...izinli].some((k) => yol.includes(`/${k}/`) || yol.startsWith(`${k}/`));
        if (!uygun) continue;
      }

      try {
        const s = await stat(tam);
        cikti.push({ yol: tam, ad: g.name, uzunluk: s.size, mtime: s.mtimeMs });
      } catch { /* dosya tarama sırasında kaybolmuş olabilir */ }
    }
  }

  await adim(kok, 0);
  return cikti;
}

/** Node 20+ `fs.promises.realpath`; eski sürümlerde çalışmazsa dosya adı döner. */
async function realpath(p) {
  try {
    const { realpath: rp } = await import('node:fs/promises');
    return await rp(p);
  } catch {
    return p;
  }
}

/* ==========================================================================
   5. AD ÇAKIŞMASI ÇÖZÜMÜ
   ========================================================================== */

/**
 * Aynı adı taşıyan dosyaları ayırt eder:  `fence.glb`, `fence_2.glb`, …
 *
 * Önce var olan dosya adreslenmezse kaynak proje bozulur; bu yüzden
 * yalnızca ÇIKTI klasöründe yeniden adlandırma yapılır ve orijinal kaynak
 * yolu manifest'te saklanır.
 *
 * @param {string} ad
 * @param {Set<string>} kullanilan
 * @param {string} sonEk
 * @returns {string}
 */
function cakismaCoz(ad, kullanilan, sonEk = '_2') {
  if (!kullanilan.has(ad.toLocaleLowerCase('tr'))) {
    kullanilan.add(ad.toLocaleLowerCase('tr'));
    return ad;
  }
  const temel = basename(ad, extname(ad));
  const uzanti = extname(ad);
  let i = 2;
  let aday = `${temel}${sonEk}${uzanti}`;
  while (kullanilan.has(aday.toLocaleLowerCase('tr'))) {
    i++;
    aday = `${temel}${sonEk}${i > 3 ? i : ''}${uzanti}`;
  }
  kullanilan.add(aday.toLocaleLowerCase('tr'));
  return aday;
}

/** Benzersiz asset kimliği üretir: `dungeon/fence_2.glb` → `dungeon__fence_2` */
function kimlikUret(kategori, dosyaAdi) {
  const temel = basename(dosyaAdi, extname(dosyaAdi));
  const ham = `${kategori}__${temel}`;
  return ham
    .toLocaleLowerCase('tr')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64) || 'asset';
}

/**
 * Kaynak yoldan AssetPanel kategorisi türetir.
 *
 * SORUN: kaynak ağacın kökü genelde anlamlı değildir:
 *   public/models/props/fence.glb  →  "public/models/props"  (anlamsız)
 *                                   →  "props"                (doğru)
 *
 * KURAL:
 *  1) Yolda `models` / `model` / `assets` / `3d` gibi bir KÖK klasör adı
 *     varsa, kategori o klasörden sonraki kısımdır (üst klasörler atılır).
 *  2) Yoksa `categoryDepth` kadar üst klasör birleştirilir.
 *  3) Hiçbir şey kalmazsa `genel`.
 *
 * @param {string[]} parcalar relative(yol) parçaları, dosya adı dahil
 * @param {number} derinlik
 * @returns {string}
 */
const KOK_KLASORLER = new Set(['models', 'model', 'assets', 'asset', '3d', 'meshes', 'gfx']);

function kategoriTuret(parcalar, derinlik = 1) {
  // dosya adını at
  const dizinler = parcalar.slice(0, -1).filter((p) => p && p !== '.');

  // 1) anlamlı bir kök klasör ara (en derindeki eşleşmeyi seç)
  let kesme = -1;
  for (let i = 0; i < dizinler.length; i++) {
    if (KOK_KLASORLER.has(dizinler[i].toLocaleLowerCase('tr'))) kesme = i;
  }

  let parca;
  if (kesme >= 0 && kesme < dizinler.length - 1) {
    parca = dizinler.slice(kesme + 1);
  } else {
    parca = dizinler.slice(Math.max(0, dizinler.length - Math.max(1, derinlik)));
  }

  const ham = (parca.join('/') || 'genel')
    .toLocaleLowerCase('tr')
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '');

  return ham || 'genel';
}

/* ==========================================================================
   6. ANA AKIŞ
   ========================================================================== */

async function main() {
  const o = arglariCoz(process.argv);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  3B VARLIK TARAMA  ·  scan-assets.mjs                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('  kaynak : ' + o.src);
  console.log('  çıktı  : ' + o.out);
  if (o.dryRun) console.log('  KURUŞ  : --dry-run (hiçbir dosya yazılmayacak)');
  console.log('');

  // --- kaynak doğrulama -------------------------------------------------
  if (!existsSync(o.src)) {
    console.error(`✗ Kaynak dizin bulunamadı: ${o.src}`);
    console.error('  --src ile doğru yolu verin.');
    process.exit(1);
  }
  const kaynakStat = await stat(o.src);
  if (!kaynakStat.isDirectory()) {
    console.error(`✗ Kaynak bir dizin değil: ${o.src}`);
    process.exit(1);
  }

  // --- tarama -----------------------------------------------------------
  process.stdout.write('  taranıyor');
  const t0 = Date.now();
  const dosyalar = await tara(o.src, o);
  const taramaSuresi = Date.now() - t0;
  process.stdout.write(` ${dosyalar.length} model (${(taramaSuresi / 1000).toFixed(1)} sn)\n`);

  if (!dosyalar.length) {
    console.error('\n✗ Hiç model bulunamadı. --include / --exclude filtrelerini gözden geçirin.');
    process.exit(1);
  }

  // --- biçim bazlı gruplama ---------------------------------------------
  const gruplar = { '.glb': [], '.gltf': [], '.obj': [] };
  for (const d of dosyalar) gruplar[extname(d.ad).toLowerCase()].push(d);

  console.log('');
  console.log('  biçim dağılımı:');
  for (const [uzanti, liste] of Object.entries(gruplar)) {
    const toplam = liste.reduce((a, d) => a + d.uzunluk, 0);
    console.log(`    ${uzanti.padEnd(7)} ${String(liste.length).padStart(5)} dosya  ${(toplam / 1048576).toFixed(1).padStart(8)} MB`);
  }

  // --- boyut filtreleri -------------------------------------------------
  const minBayt = o.minKb * 1024;
  const maksBayt = o.maxMb > 0 ? o.maxMb * 1048576 : Infinity;
  let elenenBoyut = 0, elenenByte = 0;
  const uygun = [];
  for (const [uzanti, liste] of Object.entries(gruplar)) {
    for (const d of liste) {
      if (d.uzunluk < minBayt) { elenenBoyut++; elenenByte += d.uzunluk; continue; }
      if (d.uzunluk > maksBayt) { elenenBoyut++; elenenByte += d.uzunluk; continue; }
      uygun.push({ ...d, uzanti });
    }
  }
  if (elenenBoyut) {
    console.log('');
    console.log(`  boyut filtresi: ${elenenBoyut} dosya elendi ` +
      `(${(elenenByte / 1048576).toFixed(1)} MB), kalan ${uygun.length}`);
  }

  // --- kategori türetme ve sıralama ------------------------------------
  // Küçükten büyüğe: en fazla model, en az yer kaplar.
  uygun.sort((a, b) => a.uzunluk - b.uzunluk);
  if (o.limit > 0 && uygun.length > o.limit) {
    console.log(`  sınır: ${uygun.length} → ${o.limit} model (en küçük ${o.limit} tanesi)`);
    uygun.length = o.limit;
  }

  // --- çıktı klasörünü hazırla -----------------------------------------
  if (o.clean && !o.dryRun && existsSync(o.out)) {
    console.log('');
    console.log('  --clean: çıktı klasörü boşaltılıyor…');
    await rm(o.out, { recursive: true, force: true });
  }
  if (!o.dryRun) await mkdir(o.out, { recursive: true });

  // --- kopyalama döngüsü ------------------------------------------------
  const kayitlar = [];
  const kategoriler = new Map();      // id -> { id, etiket, adet, bayt }
  const hatalar = [];
  const atlanan = [];
  /**
   * Çıktı klasöründe kullanılmış dosya adları.
   *
   * Çakışma çözümü BUNUN üzerinde çalışır. Ayrı bir Set tutulmasının nedeni:
   * aynı ad iki farklı kaynak klasörden geldiğinde ikincisi yeniden adlandırılır
   * ama kaynak yolunun kaydı korunur.
   */
  const kullanilanAdlar = new Set();

  if (!o.dryRun) {
    process.stdout.write('  kopyalanıyor');
  }

  for (let i = 0; i < uygun.length; i++) {
    const d = uygun[i];
    if (!o.dryRun && i % 50 === 0) process.stdout.write('.');

    // --- kategori -------------------------------------------------------
    const rel = relative(o.src, d.yol);
    const parcalar = rel.split(sep);
    const kategori = kategoriTuret(parcalar, o.categoryDepth);

    // --- meta veri ------------------------------------------------------
    let ozet = null;
    let not = null;
    try {
      if (d.uzanti === '.glb') {
        // yalnızca başlık + JSON chunk
        const baslik = Buffer.alloc(Math.min(1024 * 1024, d.uzunluk));
        const fh = await import('node:fs/promises').then((fs) => fs.open(d.yol, 'r'));
        try {
          await fh.read(baslik, 0, baslik.length, 0);
        } finally {
          await fh.close();
        }
        const sonuc = glbOku(baslik);
        if (!sonuc.ok) {
          atlanan.push({ ad: d.ad, neden: sonuc.reason });
          continue;
        }
        ozet = gltfOzet(sonuc.json);
      } else if (d.uzanti === '.gltf') {
        const ham = await readFile(d.yol, 'utf8');
        const g = JSON.parse(ham);
        ozet = gltfOzet(g);
        if (uzantiReferanslari(ham)) {
          not = 'Bu .gltf dış dosya (doku/buffer) referansı içeriyor; ' +
            'yalnızca .glb güvenilir şekilde taşınabilir.';
        }
      } else if (d.uzanti === '.obj') {
        const ham = await readFile(d.yol, 'utf8');
        ozet = objOzet(ham);
      }
    } catch (e) {
      atlanan.push({ ad: d.ad, neden: `çözümlenemedi: ${e.message}` });
      continue;
    }

    // --- kopyalama ------------------------------------------------------
    const hedefDizin = join(o.out, ...kategori.split('/'));
    const hedefAd = cakismaCoz(d.ad, kullanilanAdlar, o.collisionSuffix);

    if (!o.dryRun) {
      try {
        await mkdir(hedefDizin, { recursive: true });
        await copyFile(d.yol, join(hedefDizin, hedefAd));
      } catch (e) {
        hatalar.push({ ad: d.ad, neden: `kopyalanamadı: ${e.message}` });
        continue;
      }
    }

    // --- manifest kaydı -------------------------------------------------
    const id = kimlikUret(kategori, hedefAd);
    const goreliYol = `public/assets/imported/${kategori}/${hedefAd}`.replace(/\\/g, '/');

    kayitlar.push({
      id,
      ad: basename(d.ad, extname(d.ad)),
      dosya: hedefAd,
      kategori,
      yol: goreliYol,
      boyut: d.uzunluk,
      bicim: d.uzanti.slice(1),                    // "glb" | "gltf" | "obj"
      // editörün işine yarayan özet
      ucgen: ozet?.triangleCount ?? 0,
      kose: ozet?.vertexCount ?? 0,
      mesh: ozet?.meshCount ?? 0,
      primitif: ozet?.primitiveCount ?? 0,
      malzeme: ozet?.materialCount ?? 0,
      doku: ozet?.textureCount ?? 0,
      animasyon: ozet?.animationCount ?? 0,
      kemik: ozet?.skinCount ?? 0,
      morph: ozet?.hasMorph === true,
      // true ise bu modelde çizilecek geometri yok (ör. yalnızca animasyon)
      meshVar: ozet?.hasMesh !== false,
      sinirBoyut: ozet?.boundsSize ?? [0, 0, 0],
      // false ise sinirBoyut dünya birimi DEĞİLDİR (kuantize) — çalışma
      // zamanında gerçek sınır hesaplanmalıdır
      sinirGuvenilir: ozet?.boundsReliable !== false,
      gerekliEklentiler: ozet?.extensionsRequired ?? [],
      meshopt: ozet?.needsMeshopt === true,
      ktx2: ozet?.needsKTX2 === true,
      not: not || (ozet?.hasMesh === false
        ? 'Bu dosyada mesh yok (yalnızca animasyon/iskelet verisi). Sahneye eklendiğinde görünmez.'
        : undefined),
      kaynak: d.yol,                              // izlenebilirlik için
      kaynakMtime: new Date(d.mtime).toISOString(),
    });

    // --- kategori istatistiği -------------------------------------------
    if (!kategoriler.has(kategori)) {
      kategoriler.set(kategori, {
        id: kategori,
        etiket: kategori.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toLocaleUpperCase('tr')),
        adet: 0, bayt: 0,
      });
    }
    const k = kategoriler.get(kategori);
    k.adet++;
    k.bayt += d.uzunluk;
  }

  if (!o.dryRun) process.stdout.write(' ✓\n');
  console.log('');

  // --- OBJ için yan dosyaları kopyala ----------------------------------
  if (!o.dryRun && gruplar['.obj'].length) {
    // OBJ dış referans kullanır; .mtl ve dokuları modelle birlikte taşı.
    const kopyalanan = kayitlar.filter((k) => k.bicim === 'obj');
    if (kopyalanan.length) {
      process.stdout.write('  OBJ yan dosyaları (.mtl + doku) taranıyor');
      for (const k of kopyalanan) {
        const kaynakDizin = dirname(k.kaynak);
        const hedefDizin = dirname(join(PROJE_KOKU, k.yol));
        try {
          const yanlar = await readdir(kaynakDizin);
          for (const y of yanlar) {
            const uz = extname(y).toLowerCase();
            if (!UZANTI.YAN.includes(uz) && !UZANTI.DOKU.includes(uz)) continue;
            const adayDoku = new RegExp('^' +
              basename(k.dosya, extname(k.dosya)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
              '(_albedo|_normal|_diffuse|_roughness|_metallic|_ao|_emissive|_normalmap|_specular)?\\.[a-z0-9]+$', 'i');
            if (!adayDoku.test(y) && !UZANTI.YAN.includes(uz)) continue;
            const yHedef = cakismaCoz(y, kullanilanAdlar, o.collisionSuffix);
            await copyFile(join(kaynakDizin, y), join(hedefDizin, yHedef));
            k.yanDosyalar = k.yanDosyalar || [];
            k.yanDosyalar.push(yHedef);
          }
        } catch { /* tek model hatası tüm işi durdurmamalı */ }
      }
      process.stdout.write(' ✓\n');
    }
  }

  // --- manifest ---------------------------------------------------------
  const manifest = {
    bicim: 'threejs-map-editor/imported-assets',
    surum: 1,
    uretimZamani: new Date().toISOString(),
    kaynak: o.src,
    uretici: 'tools/scan-assets.mjs',
    istatistik: {
      taranan: dosyalar.length,
      kabulEdilen: kayitlar.length,
      atlanan: atlanan.length,
      hatali: hatalar.length,
      toplamBayt: kayitlar.reduce((a, k) => a + k.boyut, 0),
      kategoriler: kategoriler.size,
    },
    kategoriler: [...kategoriler.values()]
      .sort((a, b) => b.adet - a.adet)
      .map((k) => ({ ...k, bayt: Math.round(k.bayt) })),
    assets: kayitlar,
    sorunlar: { atlanan, hatalar },
  };

  const manifestYolu = join(o.out, 'imported-assets.json');
  if (!o.dryRun) {
    await writeFile(manifestYolu, JSON.stringify(manifest, null, 2), 'utf8');
  }

  // --- rapor ------------------------------------------------------------
  const toplamMB = manifest.istatistik.toplamBayt / 1048576;
  console.log('  ─────────────────────────────────────────────────────────');
  console.log(`  kabul edilen : ${kayitlar.length}`);
  console.log(`  kategori     : ${kategoriler.size}`);
  console.log(`  toplam boyut : ${toplamMB.toFixed(1)} MB`);
  if (atlanan.length) console.log(`  atlanan      : ${atlanan.length}  (bozuk/okunamayan)`);
  if (hatalar.length) console.log(`  hatalı       : ${hatalar.length}`);
  console.log('  ─────────────────────────────────────────────────────────');

  // --- uzantı gereksinimleri -------------------------------------------
  const meshopt = kayitlar.filter((k) => k.meshopt).length;
  const ktx2 = kayitlar.filter((k) => k.ktx2).length;
  const anim = kayitlar.filter((k) => k.animasyon > 0).length;
  const kemik = kayitlar.filter((k) => k.kemik > 0).length;
  const meshSiz = kayitlar.filter((k) => !k.meshVar).length;
  const kuantize = kayitlar.filter((k) => k.sinirGuvenilir === false).length;
  console.log('');
  console.log('  yükleyici gereksinimleri:');
  console.log(`    MeshoptDecoder gerekli : ${meshopt} model  ${meshopt ? '⚠ zorunlu' : '—'}`);
  console.log(`    KTX2Loader gerekli     : ${ktx2} model  ${ktx2 ? '⚠ zorunlu' : '—'}`);
  console.log(`    animasyon içeren       : ${anim} model`);
  console.log(`    iskelet (skin) içeren  : ${kemik} model`);
  if (meshSiz) {
    console.log(`    ⚠ mesh içermeyen        : ${meshSiz} model  (yalnızca animasyon — görünmez)`);
  }
  if (kuantize) {
    console.log(`    ℹ kuantize (mesh_quant): ${kuantize} model  ` +
      `(sınır kutusu çalışma zamanında hesaplanacak)`);
  }

  if (kategoriler.size) {
    console.log('');
    console.log('  kategoriler:');
    for (const k of [...kategoriler.values()].sort((a, b) => b.adet - a.adet)) {
      console.log(`    ${String(k.adet).padStart(4)}  ${(k.bayt / 1048576).toFixed(1).padStart(7)} MB  ${k.id}`);
    }
  }

  if (atlanan.length) {
    console.log('');
    console.log('  atlanan dosyalar (ilk 10):');
    for (const a of atlanan.slice(0, 10)) console.log(`    ${a.ad}  →  ${a.neden}`);
    if (atlanan.length > 10) console.log(`    … ve ${atlanan.length - 10} tane daha`);
  }
  if (hatalar.length) {
    console.log('');
    console.log('  hatalar (ilk 10):');
    for (const h of hatalar.slice(0, 10)) console.log(`    ${h.ad}  →  ${h.neden}`);
  }

  console.log('');
  if (o.dryRun) {
    console.log('  (kuru çalışma — manifest yazılmadı)');
    console.log('');
  } else {
    console.log('  ✓ manifest : ' + relative(PROJE_KOKU, manifestYolu));
    console.log('  ✓ modeller : ' + relative(PROJE_KOKU, o.out));
    console.log('');
    console.log('  Şimdi editörü açın:  http://localhost:5174');
    console.log('  Asset panelinde "World of Claudecraft" kategorisi görünecek.');
    if (ktx2) {
      console.log('');
      console.log('  ⚠ KTX2 dokuları var. Transcoder dosyaları gerekli:');
      console.log('    node tools/fetch-transcoder.mjs');
    }
    console.log('');
  }

  // manifest özetini üstelik olarak yazdır
  if (!o.dryRun) {
    const ozetHash = createHash('sha1')
      .update(kayitlar.map((k) => k.id).join('|'))
      .digest('hex').slice(0, 12);
    console.log(`  (benzersiz kimlik sayısı: ${new Set(kayitlar.map((k) => k.id)).size}/${kayitlar.length}, özet ${ozetHash})`);
    console.log('');
  }
}

/** .gltf içinde dış dosya referansı var mı? */
function uzantiReferanslari(jsonMetni) {
  return /"(uri|buffer)"\s*:\s*"(?!data:)[^"]+/i.test(jsonMetni);
}

main().catch((e) => {
  console.error('');
  console.error('✗ Beklenmeyen hata:', e.stack || e.message);
  process.exit(1);
});
