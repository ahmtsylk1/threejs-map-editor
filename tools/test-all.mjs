/**
 * tools/test-all.mjs — tarayıcı test paketlerini komut satırından çalıştırır.
 *
 * NEDEN VAR?
 * ----------
 * `test-terrain.js` ve `test-i18n.js` tarayıcı modülüdür (DOM, localStorage,
 * WebGL gerektirir). Bugüne kadar yalnızca konsoldan
 * `await import('/tools/test-terrain.js')` ile çalışıyordu; bu, bir testi
 * çalıştırmak için 4 adımlık elle işlem demek ve "geçti mi geçmedi mi"
 * sorusunu gözle cevaplamak demekti.
 *
 * Bu betik her paketi SOĞUK bir sayfada (yeni sekme, boş localStorage) çalıştırır
 * ve konsol hatalarını da toplar. Böylece:
 *   - soğuk başlangıç durumu ("ilk koşu bozuk") yakalanır,
 *   - konsola sızan hata görünür olur,
 *   - CI'da tek komutla doğrulanabilir.
 *
 * Kullanım:
 *   python dev_server.py 5174
 *   node tools/test-all.mjs
 */
import puppeteer from 'puppeteer';

const KOK = process.env.KOK || 'http://localhost:5174';

const PAKETLER = [
  { dosya: '/tools/test-terrain.js', fonksiyon: 'runTerrainSuite', ad: 'ARAZI + KÜTÜPHANE + THUMBNAIL' },
  { dosya: '/tools/test-i18n.js', fonksiyon: 'runI18nSuite', ad: 'i18n' },
];

/**
 * `ERR_ABORTED` bir HATA DEĞİLDİR — ayrı sayılır.
 *
 * Uygulama içerik yönlendirmesi (content sniffing) için dosyaların YALNIZCA
 * ilk baytlarını okuyup `ReadableStream` okuyucusunu `cancel()` ile kapatır;
 * 2.6 MB'lik bir .smd'yi tamamen indirmeye gerek yoktur. Tarayıcı bunu
 * "istek iptal edildi" olarak bildirir. Bu, tasarımın bir parçasıdır ve
 * sessizce göz ardı edilirse aynı zamanda gerçek bir iptal hatası da
 * gizlenir — bu yüzden `notlar` içine ayrı bir kovaya yazılır ve sonuçta
 * SAYIMINI gösterir.
 */
const IPTAL_EDILEN = new Set(['net::ERR_ABORTED']);

const hatayiSiniflandir = (metin) => {
  for (const desen of IPTAL_EDILEN) {
    if (metin.includes(desen)) return 'iptal';
  }
  return 'hata';
};

const tarayici = await puppeteer.launch({
  executablePath: process.env.CHROME_YOL ||
    'C:\\Users\\Admin\\.cache\\puppeteer\\chrome\\win64-154.0.8037.57\\chrome-win64\\chrome.exe',
  headless: 'shell',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--disable-dev-shm-usage', '--no-sandbox'],
});

let toplamGecen = 0;
let toplamKalan = 0;
const tumHatalar = [];
const tumIptaller = [];
let basarisiz = 0;

for (const paket of PAKETLER) {
  // Her paket için YENİ sayfa: önceki paketin bıraktığı localStorage ve
  // DOM durumu ikincisini kirletmesin.
  const sayfa = await tarayici.newPage();
  const hatalar = [];
  sayfa.on('console', (m) => { if (m.type() === 'error') hatalar.push(`[console] ${m.text()}`); });
  sayfa.on('pageerror', (e) => hatalar.push(`[pageerror] ${e.message}`));
  sayfa.on('requestfailed', (rq) => hatalar.push(`[net] ${rq.url()} — ${rq.failure()?.errorText}`));

  await sayfa.goto(KOK + '/', { waitUntil: 'load' });
  await sayfa.evaluate(() => new Promise((r) => setTimeout(r, 1500)));

  const editorVar = await sayfa.evaluate(() => !!window.editor);
  if (!editorVar) {
    console.log(`\n[${paket.ad}] EDITÖR YÜKLENMEDİ — paket atlandı`);
    for (const h of hatalar.slice(0, 6)) console.log('   ' + h);
    basarisiz++;
    await sayfa.close();
    continue;
  }

  const sonuc = await sayfa.evaluate(async (dosya, fonksiyon) => {
    const T = await import(dosya);
    const out = await T[fonksiyon]({ verbose: false });
    return { pass: out.pass, fail: out.fail, info: out.info };
  }, paket.dosya, paket.fonksiyon);

  toplamGecen += sonuc.pass.length;
  toplamKalan += sonuc.fail.length;
  const gercekHatalar = hatalar.filter((h) => hatayiSiniflandir(h) === 'hata');
  const iptaller = hatalar.filter((h) => hatayiSiniflandir(h) === 'iptal');
  const durum = sonuc.fail.length === 0 && gercekHatalar.length === 0 ? 'GECTI' : 'KALDI';

  console.log(`\n${'='.repeat(62)}`);
  console.log(`  ${paket.ad.padEnd(34)} ${String(sonuc.pass.length).padStart(3)} gecti · ${String(sonuc.fail.length).padStart(2)} kaldi   ${durum}`);
  console.log('='.repeat(62));
  if (Object.keys(sonuc.info).length) {
    for (const [k, v] of Object.entries(sonuc.info)) {
      const deger = typeof v === 'object' ? JSON.stringify(v) : v;
      if (typeof deger === 'string' && deger.length > 150) continue;
      console.log(`   ${k}: ${deger}`);
    }
  }
  for (const f of sonuc.fail) console.log('   ✗ ' + f);
  if (gercekHatalar.length) {
    console.log(`   konsol/ağ hataları (${gercekHatalar.length}):`);
    for (const h of [...new Set(gercekHatalar)].slice(0, 6)) console.log('     ' + h);
  }
  if (iptaller.length) {
    const benzersiz = [...new Set(iptaller)];
    console.log(`   not: ${benzersiz.length} istek tarayıcı tarafından iptal edildi `
      + '(içerik yönlendirmesi akışı yarıda kapatıyor — beklenen)');
  }
  tumHatalar.push(...gercekHatalar);
  tumIptaller.push(...iptaller);
  if (sonuc.fail.length || gercekHatalar.length) basarisiz++;

  await sayfa.close();
}

await tarayici.close();

console.log(`\n${'#'.repeat(62)}`);
console.log(`  TOPLAM: ${toplamGecen} gecti · ${toplamKalan} kaldi`);
console.log(`  Gerçek konsol/ağ hataları: ${tumHatalar.length}`);
console.log(`  Beklenen iptal (ERR_ABORTED): ${tumIptaller.length}`);
console.log(basarisiz === 0
  ? '  SONUÇ: BAŞARILI'
  : '  SONUÇ: BAŞARISIZ');
console.log(`${'#'.repeat(62)}`);

process.exit(basarisiz === 0 ? 0 : 1);
