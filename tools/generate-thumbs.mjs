#!/usr/bin/env node
/**
 * tools/generate-thumbs.mjs
 * ===========================================================================
 * `imported-assets.json` manifestindeki her GLB/GLTFi/OBJ modeli için 128×128
 * PNG thumbnail üretir ve yolları MANIFESTE yazar.
 *
 * NEDEN PUPPETEER?
 * ---------------
 * Taranan kitaplık `EXT_meshopt_compression` (vertex buffer sıkıştırma) ve
 * `KHR_texture_basisu` (Basis/KTX2 doku) eklentilerini ZORUNLU kılıyor.
 * Bu iki çözücüyü Node tarafında saf yazılımla yazmak (meshopt + basis
 * transcoder) hem çok büyük hem de three.js'teki uygulamayla birebir aynı
 * olmayan bir iş. Gerçek bir tarayıcı motoru ise üç şeyi birden bedavaya
 * getirir:
 *   - three.js GLTFLoader'ın tam sürümü (sıkıştırma çözümü dâhil),
 *   - gerçek WebGL (KTX2 dokuların GPU'ya yüklenmesi),
 *   - Basis transcoder'ın WebAssembly'i.
 *
 * KULLANIM
 * --------
 *   node tools/generate-thumbs.mjs                     # tümü
 *   node tools/generate-thumbs.mjs --limit 20          # ilk 20 model
 *   node tools/generate-thumbs.mjs --include dungeon    # tek kategori
 *   node tools/generate-thumbs.mjs --yeniden            # var olanları atla (varsayılan)
 *   node tools/generate-thumbs.mjs --yeniden --par 4    # daha hızlı
 *   node tools/generate-thumbs.mjs --azimut 45 --egim 30 # farklı kamera açısı
 *   node tools/generate-thumbs.mjs --size 256          # büyük thumbnail
 *
 * ÇIKIŞ
 * -----
 *   public/assets/thumbs/<kategori>/<ad>.png
 *   public/assets/imported/imported-assets.json  → her kayda "thumb" alanı
 *
 * GEREKLİ
 * --------
 *   npm install            (puppeteer + Chromium)
 *   node tools/fetch-transcoder.mjs   (KTX2 dokuları için)
 * ===========================================================================
 */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJE_KOKU = resolve(__dirname, '..');

/* ==========================================================================
   VARSAYILANLAR
   ========================================================================== */
const VARSAYILAN = {
  /** Boyut (kare). 128 = panel kartı için yeterli, 4× küçük dosya. */
  size: 128,
  /** three.js taban adresi. Boşsa index.html importmap'inden okunur. */
  three: '',
  /** KTX2 transcoder klasörü (yol web köküne göre). */
  basisPath: '/public/vendor/basis/',
  /** Üretilecek çıktı klasörü (web köküne göre yol). */
  outDir: 'public/assets/thumbs',
  /** Manifest yolu. */
  manifest: 'public/assets/imported/imported-assets.json',
  /** Varlıkların web köküne göre yolu. */
  assetRoot: 'public/assets/imported',

  limit: 0,
  include: '',
  exclude: '',
  /** Var olan thumbnail'ları ATLA (yeniden üretme). */
  yeniden: true,
  /** Eşzamanlı tarayıcı sayfa sayısı. */
  par: Math.max(1, Math.min(3, (cpus().length || 4) - 1)),

  /** Kamera: 3/4 görünüm. */
  azimut: 35,
  egim: 22,
  /** Kadraj doluluğu (0..1). */
  doluluk: 0.82,
  /** Normal haritası ters çözülüyorsa. */
  tersNormal: false,

  /** Puppeteer'ı çalıştıracak Chrome yolu (boşsa otomatik). */
  chrome: '',
  /** Ek tarayıcı bayrakları. */
  extraArgs: [],
  keepOpen: false,
  timeout: 30000,
  verbose: false,
};

/* ==========================================================================
   YARDIMCILAR
   ========================================================================== */

/** Sihirli karakterlerden arındırılmış, güvenli dosya adı. */
function guvenliAd(ad) {
  return String(ad)
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')          // harf/rakam dışı at
    .replace(/\s+/g, '_')
    .replace(/-{2,}/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 80) || 'model';
}

function bayt(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function sure(n) {
  return n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} sn`;
}

/** data:image/png;base64,… → Buffer */
function pngBuffer(dataUrl) {
  const virgül = dataUrl.indexOf(',');
  return Buffer.from(dataUrl.slice(virgül + 1), 'base64');
}

/** "1.5 sn" gibi süreyi biçimlendirir */
function ilerleme(n, toplam, baslangic) {
  const yuzde = toplam ? Math.round((n / toplam) * 100) : 0;
  const gecen = (Date.now() - baslangic) / 1000;
  const kalan = gecen > 0 && n > 0 ? (gecen / n) * (toplam - n) : 0;
  const bar = Math.round((yuzde / 100) * 24);
  return `[${'#'.repeat(bar)}${'.'.repeat(24 - bar)}] ${String(yuzde).padStart(3)}%  ` +
    `${n}/${toplam}  kalan ~${kalan < 60 ? Math.round(kalan) + ' sn' : (kalan / 60).toFixed(1) + ' dk'}`;
}

/** PNG imzasını doğrula (yanlış dosya yazmayı önler). */
function pngGecerli(buf) {
  return buf.length > 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

/* ==========================================================================
   MİME TİPİ
   ========================================================================== */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ktx2': 'image/ktx2',
  '.bin': 'application/octet-stream',
  '.basis': 'application/octet-stream',
};

/* ==========================================================================
   1. ÜÇ SÜRÜMÜNÜ KİLİTLE
   --------------------------------------------------------------------------
   KTX2 transcoder three.js sürümüyle BİREBİR aynı olmak zorundadır; sürüm
   tutmazsa doku sessizce bozuk çıkar. Bu yüzden sürümü index.html'deki
   importmap'ten okuyoruz — tek doğru kaynak orası.
   ========================================================================== */
async function threeSurumu(pozisyonArg) {
  if (pozisyonArg) return pozisyonArg.replace(/\/+$/, '');
  const html = await readFile(join(PROJE_KOKU, 'index.html'), 'utf8');
  const m = html.match(/three@([\d.]+)/);
  if (!m) {
    throw new Error(
      'index.html içinde "three@x.y.z" bulunamadı.\n' +
      '  three.js sürümünü --three ile verin:  --three https://unpkg.com/three@0.160.0'
    );
  }
  return `https://unpkg.com/three@${m[1]}`;
}

/* ==========================================================================
   2. KENDİ SUNUCUMUZ
   --------------------------------------------------------------------------
   `file://` üzerinden çalıştırmak importmap + fetch + WASM için güvenilmez
   (CORS). Bu yüzden proje kökünü servis eden minik bir HTTP sunucusu
   kuruyoruz: harici bağımlılık yok, port çakışması yok.
   ========================================================================== */
function sunucuBaslat(threeBase, basisPath) {
  const harnessYolu = join(__dirname, 'thumbnail-harness.html');

  return new Promise((coz, reddetle) => {
    const sunucu = createServer(async (istek, cevap) => {
      try {
        let yol = decodeURIComponent((istek.url || '/').split('?')[0]);

        if (yol === '/__harness') {
          let html = await readFile(harnessYolu, 'utf8');
          // Yer tutucuları gerçek adreslerle değiştir
          html = html
            .replaceAll('__THREE_BASE__', threeBase)
            .replaceAll('__BASIS_PATH__', basisPath);
          cevap.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
          cevap.end(html);
          return;
        }

        if (yol === '/__health') {
          cevap.writeHead(200, { 'Content-Type': 'text/plain' });
          cevap.end('ok');
          return;
        }

        // proje kökü içinde kalsın (yol kaçışı koruması)
        const tam = resolve(PROJE_KOKU, '.' + yol);
        if (!tam.startsWith(PROJE_KOKU)) {
          cevap.writeHead(403); cevap.end('yol izni yok'); return;
        }
        if (!existsSync(tam)) { cevap.writeHead(404); cevap.end('bulunamadı'); return; }

        const veri = await readFile(tam);
        cevap.writeHead(200, {
          'Content-Type': MIME[extname(tam).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
          // WASM/KTX2 için gerekli
          'Access-Control-Allow-Origin': '*',
        });
        cevap.end(veri);
      } catch (e) {
        cevap.writeHead(500, { 'Content-Type': 'text/plain' });
        cevap.end(String(e.message || e));
      }
    });

    sunucu.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        reddetle(new Error('Port meşgul. --port ile farklı bir port verin.'));
      } else reddetle(e);
    });

    // 0 = işletim sistemi boş port seçsin (çakışma imkânsız)
    sunucu.listen(0, '127.0.0.1', () => {
      coz({ sunucu, port: sunucu.address().port });
    });
  });
}

/* ==========================================================================
   3. BROWSER AÇILIŞI
   --------------------------------------------------------------------------
   Headless Chrome'da WebGL YAZILIMSAL (SwiftShader) olarak çalışır. Chrome
   120+ software WebGL'i varsayılan olarak ENGELLER; bu yüzden bayraklar
   ZORUNLUDUR. Üçünden biri eksikse KTX2 dokular sessizce siyah kalır.
   ========================================================================== */
async function browserAc(o) {
  let puppeteer;
  try {
    ({ default: puppeteer } = await import('puppeteer'));
  } catch {
    console.error('');
    console.error('✗ puppeteer bulunamadı.');
    console.error('  Kurulum:  npm install');
    console.error('  (Paket zaten package.json devDependencies içinde tanımlı)');
    console.error('');
    process.exit(1);
  }

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    // --- WebGL (yazılımsal) ---
    '--enable-unsafe-swiftshader',   // Chrome 120+ software WebGL izni
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--ignore-gpu-blocklist',
    ...o.extraArgs,
  ];

  return puppeteer.launch({
    headless: o.keepOpen ? false : 'new',
    args,
    ...(o.chrome ? { executablePath: o.chrome } : {}),
    protocolTimeout: o.timeout + 10000,
  });
}

/* ==========================================================================
   4. SAYFA HAZIRLIĞI
   ========================================================================== */
async function sayfaHazirla(tarayici, taban, o) {
  const sayfa = await tarayici.newPage();
  await sayfa.setViewport({ width: 256, height: 256, deviceScaleFactor: 1 });

  // Konsol hatalarını topla (KTX2/meshopt uyarıları buraya düşer)
  sayfa.__hatalar = [];
  sayfa.on('pageerror', (e) => sayfa.__hatalar.push(String(e.message || e)));
  sayfa.on('console', (m) => {
    if (m.type() === 'error') sayfa.__hatalar.push(m.text());
  });

  await sayfa.goto(`${taban}/__harness`, { waitUntil: 'domcontentloaded' });

  // three.js + loader'lar hazır olana kadar bekle
  try {
    await sayfa.waitForFunction('window.__THUMB_READY__ === true', { timeout: o.timeout });
  } catch {
    const tani = await sayfa.evaluate(() => ({
      var: typeof window.THUMB,
      three: window.THUMB?.threeSurumu ?? null,
    })).catch(() => ({}));
    throw new Error(
      'Harness yüklenemedi.\n' +
      `  three.js: ${dogrula(tani.three) ? 'yüklendi' : 'YÜKLENEMEDİ (ağ/CDN?)'}\n` +
      `  konsol  : ${sayfa.__hatalar.slice(0, 3).join(' | ') || '(boş)'}\n` +
      '  Çevrimdışıysanız --three ile yerel three.js kopyası verin.'
    );
  }

  const surum = await sayfa.evaluate(() => window.THUMB.threeSurumu);
  return { sayfa, threeSurumu: surum };
}

function dogrula(v) { return v !== null && v !== undefined; }

/* ==========================================================================
   5. ANA AKIŞ
   ========================================================================== */
async function main() {
  const o = { ...VARSAYILAN, ...arglariCoz(process.argv) };

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  THUMBNAIL ÜRETİMİ  ·  generate-thumbs.mjs                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // --- manifest ---------------------------------------------------------
  const manifestYolu = join(PROJE_KOKU, o.manifest);
  if (!existsSync(manifestYolu)) {
    console.error('');
    console.error(`✗ Manifest bulunamadı: ${o.manifest}`);
    console.error('  Önce model taraması yapın:  node tools/scan-assets.mjs');
    console.error('');
    process.exit(1);
  }

  const manifest = JSON.parse(await readFile(manifestYolu, 'utf8'));
  const hepsi = Array.isArray(manifest.assets) ? manifest.assets : [];
  if (!hepsi.length) {
    console.error('\n✗ Manifest boş — taranmış model yok.');
    process.exit(1);
  }

  // --- filtrele ---------------------------------------------------------
  const izinli = new Set(o.include.split(',').map((s) => s.trim().toLocaleLowerCase('tr')).filter(Boolean));
  const yasak = new Set(o.exclude.split(',').map((s) => s.trim().toLocaleLowerCase('tr')).filter(Boolean));

  let adaylar = hepsi.filter((a) => {
    if (izinli.size && !izinli.has(String(a.kategori).toLocaleLowerCase('tr'))) return false;
    if (yasak.size && yasak.has(String(a.kategori).toLocaleLowerCase('tr'))) return false;
    return true;
  });

  console.log('  manifest    : ' + o.manifest);
  console.log('  çıktı       : ' + o.outDir);
  console.log(`  boyut/açı   : ${o.size}×${o.size}  azimut ${o.azimut}°  eğim ${o.egim}°`);
  console.log(`  eşzamanlılık: ${o.par}`);
  console.log(`  modeller    : ${adaylar.length} / ${hepsi.length}`);
  console.log('');

  if (o.limit > 0 && adaylar.length > o.limit) {
    console.log(`  sınır: ilk ${o.limit} model`);
    adaylar = adaylar.slice(0, o.limit);
  }

  // --- boyut değişmiş mi? -----------------------------------------------
  /*
   * Manifest `thumbnail.boyut` alanını saklar. İstenen boyut bununla
   * uyuşmuyorsa mevcut PNG'ler FARKLI boyuttadır (ör. `--size 256` ile
   * 128'lik görsellerin yolunu korumak). "Yeniden üretme" kararı yalnızca
   * dosya tarihine baktığı için bu durumda sessizce YANLIŞ BOYUTLU görseller
   * kabul edilirdi — panel `thumbSize`ı 256 sanıp 128'lik görseli ölçeklerdi.
   */
  const kayitliBoyut = Number(manifest.thumbnail?.boyut) || 0;
  if (kayitliBoyut && kayitliBoyut !== o.size) {
    o.yeniden = false;
    console.log(`  ⚠ boyut değişmiş: ${kayitliBoyut}px → ${o.size}px  (TÜMÜ yeniden üretilecek)`);
    console.log('');
  }

  // --- KTX2 transcoder gerekli mi? -------------------------------------
  const ktx2Gereken = adaylar.some((a) => a.ktx2 === true);
  if (ktx2Gereken) {
    const basisYer = join(PROJE_KOKU, o.basisPath.replace(/^\/+/, ''));
    if (!existsSync(join(basisYer, 'basis_transcoder.wasm'))) {
      console.error('');
      console.error('✗ KTX2 transcoder bulunamadı ama modeller KHR_texture_basisu kullanıyor.');
      console.error('  Çalıştırın:  node tools/fetch-transcoder.mjs');
      console.error(`  Aranan     : ${join(basisYer, 'basis_transcoder.wasm')}`);
      console.error('');
      process.exit(1);
    }
    console.log('  ✓ KTX2 transcoder bulundu');
  }

  // --- çıktı klasörleri -------------------------------------------------
  for (const k of [...new Set(adaylar.map((a) => a.kategori))]) {
    await mkdir(join(PROJE_KOKU, o.outDir, ...k.split('/')), { recursive: true });
  }

  // --- three.js sürümü ---------------------------------------------------
  const threeBase = await threeSurumu(o.three);
  console.log('  three.js    : ' + threeBase);

  // --- sunucu + tarayıcı ------------------------------------------------
  const { sunucu, port } = await sunucuBaslat(threeBase, o.basisPath);
  const taban = `http://127.0.0.1:${port}`;
  console.log('  sunucu      : ' + taban + '  (geçici)');
  console.log('');

  const tarayici = await browserAc(o);
  const isler = [];
  const sonuc = {
    uretilen: 0, atlanan: 0, hatali: 0,
    bayt: 0, hatalar: [], sure: 0,
  };
  const baslangic = Date.now();

  try {
    // --- işçi havuzu -----------------------------------------------------
    let sira = 0;
    let tamamlanan = 0;

    const isci = async (no) => {
      const { sayfa, threeSurumu: surum } = await sayfaHazirla(tarayici, taban, o);
      if (no === 0) {
        console.log(`  tarayıcı hazır · three r${surum} · SwiftShader WebGL`);
        console.log('');
      }

      while (true) {
        const indeks = sira++;
        if (indeks >= adaylar.length) break;
        const a = adaylar[indeks];

        const sonucYol = join(PROJE_KOKU, o.outDir, ...a.kategori.split('/'), guvenliAd(a.dosya) + '.png');
        const kaynakYol = join(PROJE_KOKU, a.yol);

        // --- yeniden üretme kararı ------------------------------------
        if (o.yeniden && existsSync(sonucYol) && existsSync(kaynakYol)) {
          try {
            const [ps, ks] = await Promise.all([stat(sonucYol), stat(kaynakYol)]);
            if (ps.mtimeMs >= ks.mtimeMs) {
              a.thumb = webYol(sonucYol, o.outDir);
              a.thumbBayt = ps.size;
              // Önceki koşudan kalan kayıt `meshVar:false` taşıyor olabilir;
              // yeniden yüklemeden bu bilgi KAYBOLMAMALI.
              if (a.thumbDurum !== 'mesh-yok') a.thumbDurum = 'ok';
              sonuc.atlanan++;
              tamamlanan++;
              yazdir(adaylar.length, baslangic);
              continue;
            }
          } catch { /* yeniden üret */ }
        }

        // --- render ---------------------------------------------------
        let png = null, hata = null, bilgi = null;
        try {
          if (!existsSync(kaynakYol)) throw new Error('kaynak dosya bulunamadı');
          const url = '/' + String(a.yol).replace(/\\/g, '/');
          const r = await sayfa.evaluate(
            (u, opt) => window.THUMB.render(u, opt),
            url,
            { doluluk: o.doluluk, azimut: o.azimut, egim: o.egim, tersNormal: o.tersNormal },
          );
          if (!r.ok) throw new Error(r.hata);
          png = pngBuffer(r.png);
          bilgi = r.bilgi;
        } catch (e) {
          hata = (e && e.message) || String(e);
        }

        if (png && pngGecerli(png)) {
          await writeFile(sonucYol, png);
          a.thumb = webYol(sonucYol, o.outDir);
          a.thumbBayt = png.length;
          if (bilgi?.ucgen) a.thumbUcken = bilgi.ucgen;
          a.thumbDurum = 'ok';
          sonuc.uretilen++;
          sonuc.bayt += png.length;
        } else {
          a.thumb = null;                 // açıkça "görsel yok" bırak
          /*
           * Neden `meshVar` / `not` de güncelleniyor?
           * -------------------------------------
           * Bu betik modeli GERÇEK bir GLTFLoader ile yüklediği için
           * "bu dosyada mesh var mı" sorusunun en güvenilir cevabı vericisidir.
           * Tarama betiği yalnızca JSON başlığını okur ve mesh sayımı
           * `extensionsRequired` yüzünden boş çıkabilir.
           *
           * Düzeltme buraya yazılmazsa düzenleyici bu dosyaları "mesh'li"
           * sanar; kullanıcı sahneye ekler ve BOŞ BİR NESNE görür.
           */
          if (/mesh yok/i.test(hata || '')) {
            a.meshVar = false;
            a.mesh = 0;
            a.not = 'Bu dosyada mesh yok (yalnızca animasyon/iskelet verisi) — ' +
                    'sahneye eklenir ama görünmez.';
            a.thumbDurum = 'mesh-yok';
          } else {
            a.thumbDurum = 'hata';
          }
          sonuc.hatali++;
          sonuc.hatalar.push({ id: a.id, hata: hata || 'geçersiz PNG' });
        }

        tamamlanan++;
        yazdir(adaylar.length, baslangic);

        if (o.verbose) {
          const durum = png ? `${bayt(png.length)}` : `✗ ${hata}`;
          console.log(`    ${a.id.padEnd(38)} ${durum}`);
        }
      }
      await sayfa.close();
    };

    const yazdir = (toplam, bas) => {
      process.stdout.write('\r  ' + ilerleme(tamamlanan, toplam, bas) + '   ');
    };

    for (let i = 0; i < Math.min(o.par, Math.max(1, adaylar.length)); i++) isler.push(isci(i));
    await Promise.all(isler);

    process.stdout.write('\r' + ' '.repeat(78) + '\r');
  } finally {
    await tarayici.close().catch(() => {});
    await new Promise((r) => sunucu.close(r));
  }

  sonuc.sure = Date.now() - baslangic;

  // --- manifest + rapor --------------------------------------------------
  manifest.uretimZamani = new Date().toISOString();
  manifest.thumbnail = {
    uretimZamani: manifest.uretimZamani,
    boyut: o.size,
    azimut: o.azimut,
    egim: o.egim,
    doluluk: o.doluluk,
    klasor: o.outDir,
    uretilen: sonuc.uretilen,
    atlanan: sonuc.atlanan,
    hatali: sonuc.hatali,
  };
  // Üretilemeyenler "thumbnail sorunu" olarak kaydedilir
  manifest.sorunlar = manifest.sorunlar || { atlanan: [], hatalar: [] };
  manifest.sorunlar.thumbnail = sonuc.hatalar;

  await writeFile(manifestYolu, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('  ─────────────────────────────────────────────────────────');
  console.log(`  üretilen   : ${sonuc.uretilen}`);
  console.log(`  atlanan    : ${sonuc.atlanan}  (zaten güncel)`);
  console.log(`  hatalı     : ${sonuc.hatali}`);
  console.log(`  toplam     : ${bayt(sonuc.bayt)}  ·  ${sure(sonuc.sure)}`);
  if (sonuc.uretilen) {
    console.log(`  ortalama   : ${sure(sonuc.sure / (sonuc.uretilen + sonuc.atlanan))} / model`);
  }
  console.log('  ─────────────────────────────────────────────────────────');

  if (sonuc.hatalar.length) {
    console.log('');
    console.log('  üretilemeyenler (ilk 10):');
    for (const h of sonuc.hatalar.slice(0, 10)) {
      console.log(`    ${h.id.padEnd(38)} ${h.hata}`);
    }
    if (sonuc.hatalar.length > 10) {
      console.log(`    … ve ${sonuc.hatalar.length - 10} tane daha (manifest.sorunlar.thumbnail)`);
    }
  }

  console.log('');
  console.log('  ✓ manifest güncellendi: ' + o.manifest);
  console.log('  Editörü yenileyin (Ctrl+F5) — thumbnail görselleri panelde belirir.');
  console.log('');
  // Hatalı model olsa da üretim başarılı sayılır: 400 modelin 1-2 tanesi
  // bozuk olabilir ve bu tüm işi çöpe atmak için bir neden değildir.
  process.exit(0);
}

/** Mutlak yolu web köküne göre "/public/..." biçimine çevirir. */
function webYol(tamYol, outDir) {
  const goreli = relative(PROJE_KOKU, tamYol).split(sep).join('/');
  return '/' + goreli.replace(/^assets\//, 'assets/');
}

/* ==========================================================================
   KOMUT SATIRI
   ========================================================================== */
function arglariCoz(argv) {
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const s = () => argv[++i];
    switch (a) {
      case '--size': o.size = Math.max(32, Math.min(1024, parseInt(s(), 10) || 128)); break;
      case '--out': o.outDir = s().replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''); break;
      case '--manifest': o.manifest = s().replace(/\\/g, '/'); break;
      case '--three': o.three = s(); break;
      case '--basis': o.basisPath = '/' + s().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') + '/'; break;
      case '--limit': o.limit = Math.max(0, parseInt(s(), 10) || 0); break;
      case '--include': o.include = s(); break;
      case '--exclude': o.exclude = s(); break;
      case '--par': o.par = Math.max(1, Math.min(16, parseInt(s(), 10) || 1)); break;
      case '--azimut': o.azimut = sayiCoz(s(), o.azimut); break;
      case '--egim': o.egim = sayiCoz(s(), o.egim); break;
      case '--doluluk': o.doluluk = Math.min(0.98, Math.max(0.2, sayiCoz(s(), o.doluluk))); break;
      case '--chrome': o.chrome = s(); break;
      case '--timeout': o.timeout = Math.max(5000, parseInt(s(), 10) || 30000); break;
      case '--ters-normal': o.tersNormal = true; break;
      case '--yeniden': o.yeniden = true; break;
      case '--hepsini': o.yeniden = false; break;
      case '--acik-tut': o.keepOpen = true; break;
      case '-v': case '--verbose': o.verbose = true; break;
      case '-h': case '--help': yardim(); process.exit(0); break;
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

function sayiCoz(v, yedek) {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : yedek;
}

function yardim() {
  console.log(`
tools/generate-thumbs.mjs — 3B varlık thumbnail üretici

  --size <n>        Kare boyutu            (varsayılan 128)
  --out <yol>       Çıktı klasörü         (public/assets/thumbs)
  --manifest <yol>  Manifest dosyası
  --three <url>     three.js taban adresi (boşsa index.html'den okunur)
  --basis <yol>     KTX2 transcoder klasörü
  --limit <n>       En fazla n model
  --include "a,b"   Yalnızca bu kategoriler
  --exclude "a,b"   Bu kategorileri atla
  --par <n>         Eşzamanlı tarayıcı sayfası
  --azimut <deg>    Kamera yatay açısı     (varsayılan 35)
  --egim <deg>      Kamera dikey açısı     (varsayılan 22)
  --doluluk <0-1>   Kadraj doluluğu        (varsayılan 0.82)
  --ters-normal     Normal haritasını ters çevir
  --chrome <yol>    Kendi Chrome/Edge yolun
  --timeout <ms>    Sayfa hazır olma süresi
  --yeniden         (varsayılan) var olanları atla
  --hepsini         Tümünü yeniden üret
  --acik-tut        Tarayıcıyı açık bırak (hata ayıklama)
  -v, --verbose     Model bazlı çıktı
  -h, --help        Bu yardım
`);
}

main().catch((e) => {
  console.error('');
  console.error('✗ Beklenmeyen hata:', e.stack || e.message);
  process.exit(1);
});
