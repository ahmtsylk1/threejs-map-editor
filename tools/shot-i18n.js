/**
 * tools/shot-i18n.js — dil değişiminin ekran görüntüsünü alır.
 *
 * `browser.screenshot` aracı sayfa durumunu bozduğu (modalı kapattığı) ve
 * bayat kare döndürdüğü için yakalama burada tamamen betikle kontrol edilir.
 *
 * Kullanım:
 *   python dev_server.py 5174
 *   node tools/shot-i18n.js
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer';

const CIKTI = 'tools';
const OLCULER = [
  { ad: 'tr', dil: 'tr', w: 1440, h: 860 },
  { ad: 'en', dil: 'en', w: 1440, h: 860 },
  { ad: 'dar-tr', dil: 'tr', w: 900, h: 620 },
];

const tarayici = await puppeteer.launch({
  executablePath: process.env.CHROME_YOL ||
    'C:\\Users\\Admin\\.cache\\puppeteer\\chrome\\win64-154.0.8037.57\\chrome-win64\\chrome.exe',
  headless: 'shell',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--disable-dev-shm-usage', '--no-sandbox', '--force-device-scale-factor=1'],
});

for (const o of OLCULER) {
  const sayfa = await tarayici.newPage();
  await sayfa.setViewport({ width: o.w, height: o.h, deviceScaleFactor: 1 });
  await sayfa.goto('http://localhost:5174/', { waitUntil: 'load' });
  await sayfa.evaluate(async (dil) => {
    await new Promise((r) => setTimeout(r, 900));
    // Dili TIKLAYARAK seç: gerçek kullanıcı yolunu sınar.
    const dugme = document.querySelector(`#langGroup .seg[data-lang="${dil}"]`);
    if (!dugme) throw new Error(`dil düğmesi yok: ${dil}`);
    dugme.click();
    await new Promise((r) => setTimeout(r, 550));
  }, o.dil);
  const yol = `${CIKTI}/_shot-i18n-${o.ad}.png`;
  fs.writeFileSync(yol, await sayfa.screenshot({ type: 'png' }));
  console.log('yazildi:', yol);
  await sayfa.close();
}

await tarayici.close();
