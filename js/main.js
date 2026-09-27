/**
 * main.js
 * ---------------------------------------------------------------------------
 * Uygulama giriş noktası.
 *
 * Yalnızca üç iş yapar:
 *   1. Aktif dili hazırlar ve statik HTML'i (`data-i18n`) çevirir.
 *   2. Editörü oluşturur ve render döngüsünü başlatır.
 *   3. Global hata yakalar (özellikle WebGL bağlam kaybı) kullanıcıya bildirir.
 *
 * DİL SIRA ÖNEMLİ: `belgeyiHazirla()` Editör'den ÖNCE çağrılır. Aksi halde
 * bileşenler `i18n.t()` ile Türkçe metin kurar, sonra tarama İngilizceye
 * çevirir — gereksiz bir tur ve kısa süreli yanlış metin.
 *
 * Hata ayıklamak için `window.editor` üzerinden tüm modüllere erişilebilir.
 */
import { Editor } from './editor/Editor.js';
import { toast, refreshOpenModal } from './utils/dom.js';
import { i18n, I18N_EVENT } from './core/I18nManager.js';

function boot() {
  // 1) Dil: <html lang>, <title> ve index.html'deki data-i18n düğümleri
  i18n.belgeyiHazirla();
  i18n.apply(document);

  // Açık modal varsa gövdesi de yeniden üretilsin. `openModal`'a `html` bir
  // fonksiyon olarak verildiyse (`Editor._helpHtml`) bu çağrı güncel metni
  // kurar; başlık/altbilgi zaten `data-i18n` taramasıyla tazelendi.
  i18n.on(I18N_EVENT.CHANGE, () => refreshOpenModal());

  // WebGL desteği kontrolü
  const canvas = document.createElement('canvas');
  const hasWebGL = !!(window.WebGLRenderingContext &&
    (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  if (!hasWebGL) {
    document.body.innerHTML = `
      <div style="display:grid;place-items:center;height:100vh;font-family:system-ui;color:#9aa8bd;text-align:center;padding:24px">
        <div>
          <h2 style="color:#dbe3ee;margin:0 0 8px">${i18n.t('app.webgl.missing.title')}</h2>
          <p style="max-width:420px;line-height:1.6">${i18n.t('app.webgl.missing.body')}</p>
        </div>
      </div>`;
    return;
  }

  const editor = new Editor();
  editor.start();

  // Hata ayıklama / konsol erişimi
  window.editor = editor;

  // Başlangıç bilgisi
  console.info(
    '%cMap Editor%c  ' + i18n.t('app.boot.info'),
    'background:#4d8dff;color:#061024;font-weight:700;border-radius:3px 0 0 3px;padding:2px 6px',
    'color:#6c7a90;padding:2px 6px;border-radius:0 3px 3px 0'
  );
}

/* -------------------------------------------------------------------------
   Global hata yönetimi
   ------------------------------------------------------------------------- */
window.addEventListener('error', (e) => {
  console.error('[MapEditor]', e.error || e.message);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[MapEditor] promise reddedildi:', e.reason);
});

// Bağlam kaybı (uzun süreli sekme arka planı) kullanıcıyı bilgilendirir
document.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  toast(i18n.t('msg.webgl.lost'), 'error', 8000);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
