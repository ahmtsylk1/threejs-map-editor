/**
 * tools/shot-modal.js — yardım modalının ekran görüntüsünü Puppeteer ile alır.
 *
 * Neden var?  `browser.screenshot` aracı sayfa durumunu bozuyor (modalı
 * kapatıyor) ve bayat kare döndürebiliyor. Burada yakalama tamamen
 * betikle kontrol ediliyor: modal açılır, kare alınır, dosya yazılır.
 *
 * Kullanım:
 *   python dev_server.py 5174
 *   node tools/shot-modal.js [genislik] [yukseklik] [scrollTop] [cikti.png]
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer';

const [g = 1280, y = 760, kaydir = 0, cikti = 'tools/_shot-modal.png'] = process.argv.slice(2);

const tarayici = await puppeteer.launch({
  executablePath: process.env.CHROME_YOL ||
    'C:\\Users\\Admin\\.cache\\puppeteer\\chrome\\win64-154.0.8037.57\\chrome-win64\\chrome.exe',
  headless: 'shell',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--disable-dev-shm-usage', '--no-sandbox', '--force-device-scale-factor=1'],
});

const sayfa = await tarayici.newPage();
await sayfa.setViewport({ width: +g, height: +y, deviceScaleFactor: 1 });
await sayfa.goto(`http://localhost:5174/tools/viewport-harness.html?w=${g}&h=${y}`, { waitUntil: 'load' });
await sayfa.evaluate(() => window.__ready);

await sayfa.evaluate(async (kaydir) => {
  const f = document.querySelector('iframe');
  f.contentWindow.editor.showHelp();
  await new Promise((r) => setTimeout(r, 400));
  f.contentDocument.querySelector('.modal-body').scrollTop = kaydir;
  await new Promise((r) => setTimeout(r, 400));
}, +kaydir);

fs.writeFileSync(cikti, await sayfa.screenshot({ type: 'png' }));
console.log('yazildi:', cikti);
await tarayici.close();
