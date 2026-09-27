/**
 * Modal dikey sığma / yapışkan başlık test koşumu.
 *
 * Gerçek viewport'u iframe ile taklit eder (headless'ta pencere boyutu
 * değiştirilemediği için). Her boyutta ölçer:
 *   - modal ekrana sığıyor mu, taşıyor mu
 *   - başlık + altbilgi kaydırma sırasında görünür kalıyor mu
 *   - gövde tek başına kaydırılabiliyor mu
 *   - yapışkan bölüm başlıkları çalışıyor mu
 *   - sütun sayısı dar ekranda düşüyor mu
 *   - Escape ile kapanma korunmuş mu
 *
 * Çalıştırma:  node tools/test-modal-fit.js
 * (http://localhost:5174 üzerinde çalışan dev sunucu gerekir)
 */
import puppeteer from 'puppeteer';

const BOYUTLAR = [
  { w: 1600, h: 1000, ad: 'masaustu (genis)' },
  { w: 1280, h: 720, ad: 'dizustu' },
  { w: 1000, h: 700, ad: 'orta' },
  { w: 900, h: 600, ad: 'dar dizustu' },
  { w: 700, h: 560, ad: 'tablet' },
  { w: 560, h: 460, ad: 'kucuk / mobil' },
  { w: 1440, h: 380, ad: 'COK KISA (yatay telefon)' },
];

const KOK = 'http://localhost:5174';
const HATALAR = [];

const tarayici = await puppeteer.launch({
  executablePath: process.env.CHROME_YOL ||
    'C:\\Users\\Admin\\.cache\\puppeteer\\chrome\\win64-154.0.8037.57\\chrome-win64\\chrome.exe',
  headless: 'shell',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--disable-dev-shm-usage', '--no-sandbox'],
});

const sayfa = await tarayici.newPage();
let boyutHatalari = [];
sayfa.on('console', (m) => { if (m.type() === 'error') boyutHatalari.push(`[console] ${m.text()}`); });
sayfa.on('pageerror', (e) => boyutHatalari.push(`[pageerror] ${e.message}`));
sayfa.on('requestfailed', (rq) => boyutHatalari.push(`[net] ${rq.url()} — ${rq.failure()?.errorText}`));
sayfa.on('response', (rs) => { if (rs.status() >= 400) boyutHatalari.push(`[http ${rs.status()}] ${rs.url()}`); });

let gecen = 0, toplam = 0, atlandi = 0;

function ok(ad, kosul, ayrinti = '') {
  toplam++;
  if (kosul) gecen++;
  return (kosul ? '  [GECTI] ' : '  [KALDI] ') + ad + (ayrinti ? ' — ' + ayrinti : '');
}

for (const b of BOYUTLAR) {
  boyutHatalari = [];
  await sayfa.setViewport({ width: b.w, height: b.h, deviceScaleFactor: 1 });
  await sayfa.goto(`${KOK}/tools/viewport-harness.html?w=${b.w}&h=${b.h}`, { waitUntil: 'load' });
  const hazir = await sayfa.evaluate(() => window.__ready);

  console.log(`\n== ${b.ad}  (${b.w}x${b.h}) ${'='.repeat(Math.max(0, 32 - String(b.w).length))}`);

  if (!hazir || !hazir.editorVar) {
    atlandi++;
    console.log('  [ATLANDI] editor bu boyutta yuklenmedi');
    for (const h of [...new Set(boyutHatalari)].slice(0, 6)) console.log('     ' + h);
    HATALAR.push(...boyutHatalari);
    continue;
  }

  const r = await sayfa.evaluate(async () => {
    const f = document.querySelector('iframe');
    const d = f.contentDocument, w = f.contentWindow;
    w.editor.showHelp();
    await new Promise((res) => setTimeout(res, 220));

    const modal = d.getElementById('modal');
    const head = modal.querySelector('.modal-head');
    const body = modal.querySelector('.modal-body');
    const foot = modal.querySelector('.modal-foot');
    const grid = modal.querySelector('.help-grid');
    const cols = [...grid.children].map((c) => Math.round(c.getBoundingClientRect().left));
    const h4ler = [...modal.querySelectorAll('.help-grid h4')];

    const br = body.getBoundingClientRect();
    const govdeUst = Math.round(br.top);
    const css = getComputedStyle(modal);
    const m0 = modal.getBoundingClientRect();

    const taban = {
      modalH: Math.round(m0.height),
      modalUst: Math.round(m0.top),
      modalAlt: Math.round(m0.bottom),
      genislik: Math.round(m0.width),
      maxH: css.maxHeight,
      flexDir: css.flexDirection,
      modalOverflow: css.overflow,
      bodyOverflow: getComputedStyle(body).overflowY,
      bodyScrollH: body.scrollHeight,
      bodyClientH: body.clientHeight,
      modalScrollH: modal.scrollHeight,
      modalClientH: modal.clientHeight,
      sutun: new Set(cols).size,
      h4Sayisi: h4ler.length,
      h4Poz: getComputedStyle(h4ler[0]).position,
      baslik: modal.querySelector('.modal-head h3').textContent,
    };

    // --- 1) Yapışkan bölüm başlıkları: gövde ORTA konumundayken
    //        en az bir başlık üst kenara oturmalı ve arkası opak olmalı.
    body.scrollTop = Math.round((body.scrollHeight - body.clientHeight) / 2);
    await new Promise((res) => setTimeout(res, 120));
    const ortada = h4ler
      .map((h) => ({ baslik: h.textContent, ust: Math.round(h.getBoundingClientRect().top) }))
      .filter((x) => Math.abs(x.ust - govdeUst) < 3);
    const h4Opak = ortada.length
      ? getComputedStyle(h4ler.find((h) => Math.abs(Math.round(h.getBoundingClientRect().top) - govdeUst) < 3))
          .backgroundColor
      : 'yok';
    const opakMi = h4Opak.startsWith('rgba') ? !h4Opak.includes(', 0)') : true;
    const sticky = { tutulan: ortada.length, baslik: ortada[0]?.baslik || '-', opak: h4Opak, opakMi };

    // --- 2) Gövde sonuna kaydır → başlık/altbilgi yerinde kalmalı
    body.scrollTop = body.scrollHeight;
    await new Promise((res) => setTimeout(res, 140));
    const m1 = modal.getBoundingClientRect();
    const hb = head.getBoundingClientRect();
    const fb = foot.getBoundingClientRect();
    const yerde = {
      scrollTop: Math.round(body.scrollTop),
      headUst: Math.round(hb.top),
      footAlt: Math.round(fb.bottom),
      modalUst: Math.round(m1.top),
      modalAlt: Math.round(m1.bottom),
    };
    const ustBasSabit = Math.abs(yerde.headUst - yerde.modalUst) < 1.5;
    const altBasSabit = Math.abs(yerde.modalAlt - yerde.footAlt) < 1.5;
    const kutuSabit = Math.abs(yerde.modalUst - taban.modalUst) < 1.5;

    // --- 3) Kapat düğmesi modal kutusunun içinde mi
    const x = modal.querySelector('.modal-head .x-btn').getBoundingClientRect();
    const butonGorunur = x.top >= m1.top - 1 && x.bottom <= m1.bottom + 1;

    // --- 4) Kaydırma çubuğu gerçekten çiziliyor mu (overflow: overlay değil)
    const cubukVar = body.offsetWidth - body.clientWidth > 0;

    body.scrollTop = 0;
    return { taban, yerde, ustBasSabit, altBasSabit, kutuSabit, sticky, butonGorunur, cubukVar };
  });

  // --- 5) Escape GERÇEK klavye olayı ile (synthetic değil)
  await sayfa.evaluate(() => document.querySelector('iframe').contentWindow.focus());
  await sayfa.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 120));
  const escKapatir = await sayfa.evaluate(() =>
    document.querySelector('iframe').contentDocument.getElementById('modalBackdrop').hidden === true);

  const t = r.taban;
  const vh = b.h;
  const sinir = Math.round(vh * 0.85);

  console.log(`   modal ${t.genislik}x${t.modalH}px  (max-h=${t.maxH} ~ ${sinir}px)  flex=${t.flexDir} overflow=${t.modalOverflow}`);
  console.log(`   govde ${t.bodyOverflow}  icerik ${t.bodyScrollH}px / alan ${t.bodyClientH}px  .  sutun ${t.sutun}  .  h4 ${t.h4Sayisi}  .  "${t.baslik}"`);

  console.log(ok('modal ekrana siGAR (tasma yok)', t.modalUst >= -0.5 && t.modalAlt <= vh + 0.5,
    `ust=${t.modalUst} alt=${t.modalAlt} pencere=${vh}`));
  console.log(ok('max-height uygulanmis (85vh siniri)', t.modalH <= sinir + 1, `${t.modalH} <= ${sinir}`));
  console.log(ok('modal kendisi kaydirilmiyor', t.modalScrollH <= t.modalClientH + 1,
    `scrollH=${t.modalScrollH} clientH=${t.modalClientH}`));
  console.log(ok('flex sutun + gizli tasma', t.flexDir === 'column' && t.modalOverflow === 'hidden'));
  console.log(ok('govde kaydirilabilir (flex:1 + min-height:0)',
    t.bodyScrollH > t.bodyClientH && t.bodyOverflow === 'auto', `${t.bodyScrollH} > ${t.bodyClientH}`));
  console.log(ok('kaydirma cubugu gercekten ciziliyor', r.cubukVar));
  console.log(ok('kutu kaydirmada yerinde', r.kutuSabit, `${t.modalUst} -> ${r.yerde.modalUst}`));
  console.log(ok('baslik KAYDIRINCA sabit kalir', r.ustBasSabit, `head=${r.yerde.headUst} modal=${r.yerde.modalUst}`));
  console.log(ok('altbilgi KAYDIRINCA sabit kalir', r.altBasSabit, `modal=${r.yerde.modalAlt} foot=${r.yerde.footAlt}`));
  console.log(ok('Kapat dugmesi her zaman gorunur', r.butonGorunur));
  console.log(ok('bolum basligi ortada yapiskanda', t.h4Poz === 'sticky' && r.sticky.tutulan >= 1,
    `${t.h4Poz}, ${r.sticky.tutulan} baslik kenara yapisti ("${r.sticky.baslik}")`));
  console.log(ok('yapiskan basligin zemini opak', r.sticky.opakMi, r.sticky.opak));
  console.log(ok('sutun sayisi genislige uygun', b.w >= 900 ? t.sutun === 2 : t.sutun >= 1, `${t.sutun} sutun`));
  console.log(ok('Escape hala kapatir', escKapatir));

  if (boyutHatalari.length) {
    console.log(`   konsol/ags hatalari (${boyutHatalari.length}):`);
    for (const h of [...new Set(boyutHatalari)].slice(0, 5)) console.log('     ' + h);
    HATALAR.push(...boyutHatalari);
  }
}

await tarayici.close();

console.log(`\n${'='.repeat(62)}`);
console.log(`SONUC: ${gecen}/${toplam} gecti` + (atlandi ? `  (${atlandi} boyut atlandi)` : ''));
console.log(HATALAR.length ? `Ag hatasi: ${HATALAR.length} (yukariya bakin)` : 'Ag hatasi yok.');
process.exit(gecen === toplam && HATALAR.length === 0 ? 0 : 1);
