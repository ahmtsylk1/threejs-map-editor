/**
 * dom.js
 * ---------------------------------------------------------------------------
 * Minik DOM yardımcıları: element üretimi, ikonlar, toast bildirimleri ve
 * promise tabanlı modal pencereler. Harici bir UI kütüphanesi kullanılmaz.
 *
 * i18n: `el()` üzerinde `i18n` / `i18nAttr` özellikleri desteklenir; üretilen
 * düğümler `data-i18n` ile işaretlenir ve `I18nManager.apply()` tarafından
 * otomatik taranır. JS'in ürettiği metinlerin çeviriye girmesini sağlamanın
 * en ucuz yolu budur — ayrıca `data-i18n` elle yazmaya gerek kalmaz.
 */
import { i18n } from '../core/I18nManager.js';

/** Kısa benzersiz kimlik üretir. */
let _uid = 0;
export function uid(prefix = 'id') {
  _uid += 1;
  return `${prefix}_${Date.now().toString(36)}${_uid.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Eleman oluşturur.
 * @param {string} tag  'div.class#id' biçiminde de olabilir
 * @param {Object} [props] attribute / property / event map
 *   ÖZEL: `i18n: 'anahtar'`          → metni çözer + data-i18n işaretler
 *         `i18nAttr: { title: 'k' }` → öznitelikleri çözer + data-i18n-attr
 *         `i18nArgs: { count: 3 }`  → ikisine birden değişken verir
 * @param {Array|Node|string} [children]
 */
export function el(tag, props = {}, children = []) {
  const m = tag.match(/^([a-zA-Z0-9-]+)?(#[\w-]+)?((?:\.[\w-]+)*)$/);
  const node = document.createElement(m?.[1] || 'div');
  if (m?.[2]) node.id = m[2].slice(1);
  if (m?.[3]) node.className = m[3].split('.').filter(Boolean).join(' ');

  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = node.className ? `${node.className} ${value}` : value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'i18n' || key === 'i18nAttr' || key === 'i18nArgs') continue;  // aşağıda işlenir
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }

  // --- i18n: metin ------------------------------------------------------
  if (props.i18n) {
    node.setAttribute('data-i18n', props.i18n);
    if (props.i18nArgs) node.setAttribute('data-i18n-args', JSON.stringify(props.i18nArgs));
    // Çocuklar eklendikten SONRA yazılır; aşağıda uygulanır.
  }
  // --- i18n: öznitelikler ------------------------------------------------
  if (props.i18nAttr) {
    const ciftler = Object.entries(props.i18nAttr)
      .map(([oz, anahtar]) => `${oz}:${anahtar}`).join(';');
    node.setAttribute('data-i18n-attr', ciftler);
    if (props.i18nArgs) node.setAttribute('data-i18n-args', JSON.stringify(props.i18nArgs));
  }

  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  // Metin, çocuklar yerleştikten sonra çözülür: `el('div', { i18n: 'k' }, [icon])`
  // deseninde çocuk korunur ve uyarı üretilmez (i18n metni varsa çocuk
  // kullanılmamalıdır; yine de sessizce silmek yerine burada duruyoruz).
  if (props.i18n && !node.firstElementChild) {
    node.textContent = i18n.t(props.i18n, props.i18nArgs);
  }
  if (props.i18nAttr) {
    for (const [oz, anahtar] of Object.entries(props.i18nAttr)) {
      node.setAttribute(oz, i18n.t(anahtar, props.i18nArgs));
    }
  }
  return node;
}

/** SVG dizesinden element üretir. */
export function svg(markup) {
  const wrap = document.createElement('div');
  wrap.innerHTML = markup.trim();
  return wrap.firstElementChild;
}

/* -------------------------------------------------------------------------
   Hazır ikonlar (satır içi SVG)
   ------------------------------------------------------------------------- */
const wrap = (body, size = 16) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  info:  (s) => wrap('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none"/>', s),
  ok:    (s) => wrap('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.6 2.6L16 9.6"/>', s),
  warn:  (s) => wrap('<path d="M12 3.5 21.5 20h-19L12 3.5Z"/><path d="M12 10v4"/><circle cx="12" cy="16.8" r="1" fill="currentColor" stroke="none"/>', s),
  error: (s) => wrap('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>', s),
  eye:   (s) => wrap('<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/>', s),
  eyeOff:(s) => wrap('<path d="M4 4l16 16"/><path d="M9.6 5.9A9.9 9.9 0 0 1 12 5.8c6 0 9.5 6.2 9.5 6.2a17 17 0 0 1-3.3 4.1M6.5 7.9A16.6 16.6 0 0 0 2.5 12S6 18.2 12 18.2a9.6 9.6 0 0 0 3.3-.6"/>', s),
  lock:  (s) => wrap('<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7"/>', s),
  unlock:(s) => wrap('<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.2-1.5"/>', s),
  trash: (s) => wrap('<path d="M4.5 7h15M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7M6.5 7l.9 11.4A1.6 1.6 0 0 0 9 20h6a1.6 1.6 0 0 0 1.6-1.6L17.5 7"/>', s),
  copy:  (s) => wrap('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 6.5V5.6A1.6 1.6 0 0 0 13.4 4H5.6A1.6 1.6 0 0 0 4 5.6v7.8A1.6 1.6 0 0 0 5.6 15h.9"/>', s),
  focus: (s) => wrap('<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>', s),
  cube:  (s) => wrap('<path d="M12 2.8 20.5 7.4v9.2L12 21.2 3.5 16.6V7.4L12 2.8Z"/><path d="M12 12 20.5 7.4M12 12v9.2M12 12 3.5 7.4"/>', s),
  down:  (s) => wrap('<path d="M12 3.5v11m0 0 4-4m-4 4-4-4"/><path d="M4 17.5v1.4A2.1 2.1 0 0 0 6.1 21h11.8a2.1 2.1 0 0 0 2.1-2.1v-1.4"/>', s),
  up:    (s) => wrap('<path d="M12 15.5v-11m0 0 4 4m-4-4-4 4"/><path d="M4 6.5V5.1A2.1 2.1 0 0 1 6.1 3h11.8A2.1 2.1 0 0 1 20 5.1v1.4"/>', s),
  ground:(s) => wrap('<path d="M3 17h18"/><path d="M12 14V6m0 0-2.4 2.4M12 6l2.4 2.4"/>', s),
  reset: (s) => wrap('<path d="M4 4v6h6"/><path d="M4.6 10a8 8 0 1 1 .9 6.6"/>', s),
  close: (s) => wrap('<path d="m6 6 12 12M18 6 6 18"/>', s),
  cursor:(s) => wrap('<path d="m5 3 5.5 16 2.6-6.2L19 10 5 3Z"/>', s),
};

/* -------------------------------------------------------------------------
   Toast bildirimleri
   ------------------------------------------------------------------------- */
const ICON_FOR = { ok: 'ok', warn: 'warn', error: 'error', info: 'info' };

export function toast(message, kind = 'info', duration = 3200) {
  const host = qs('#toasts');
  if (!host) return;
  const node = el('div.toast', { class: kind }, [svg(ICONS[ICON_FOR[kind] || 'info'](15)), el('span', { text: message })]);
  host.append(node);
  const kill = () => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 220);
  };
  const timer = setTimeout(kill, duration);
  node.addEventListener('click', () => { clearTimeout(timer); kill(); });
}

/**
 * Bildirim metnini sözlükten üretip gösterir.
 *
 * `toast(t('msg.locked.delete'), 'warn')` yazmak yerine:
 *     toastKey('msg.locked.delete', 'warn')
 * Böylece çağıran taraf metni unutsa bile derleyici değil, i18n testi
 * yakalar; ayrıca aynı mesajın iki yerde farklı yazılması engellenir.
 *
 * @param {string} anahtar
 * @param {'info'|'ok'|'warn'|'error'} [kind]
 * @param {Object} [degiskenler]
 * @param {number} [sure] ms
 */
export function toastKey(anahtar, kind = 'info', degiskenler, sure = 3200) {
  toast(i18n.t(anahtar, degiskenler), kind, sure);
}

/* -------------------------------------------------------------------------
   Modal pencere
   ------------------------------------------------------------------------- */
let modalCloser = null;
/** Açık modalın son `opts`'ı — dil değişiminde yeniden kurmak için. */
let modalLastOpts = null;

/**
 * Açık modalın gövdesini yeniden kurar (dil değişiminde kullanılır).
 *
 * NEDEN GEREKLİ?
 * --------------
 * `openModal` bir kez çağrılıp HTML'i bir STRING olarak üretir. Dil
 * değiştiğinde `I18nManager.apply()` yalnızca `data-i18n` taşıyan düğümleri
 * tarar; gövdedeki elle kurulmuş tablo/kısayol listesi eski dilde kalırdı.
 *
 * Bu yüzden `opts.html` bir FONKSİYON olarak da verilebilir: dil değişiminde
 * yeniden çağrılır ve güncel metni üretir.
 *
 * @returns {boolean} yeniden kurulduysa true
 */
export function refreshOpenModal() {
  if (!modalCloser || !modalLastOpts) return false;
  const opts = modalLastOpts;
  const kutu = qs('#modal');
  const govde = kutu.querySelector('.modal-body');
  if (!govde || typeof opts.html !== 'function') return false;

  const eskiKaydirma = govde.scrollTop;
  govde.innerHTML = '';
  govde.append(el('div', { html: opts.html() }));
  govde.scrollTop = eskiKaydirma;   // kullanıcı neredeyse orada kalsın
  return true;
}

/**
 * Modal pencere açar.
 *
 * YAPI (CSS ile eşleşir)
 * ---------------------
 *   .modal            flex sütun · ASLA kendisi kaydırılmaz
 *   ├── .modal-head    SABİT  (başlık + kapat)
 *   ├── .modal-body    KAYDIR (tek kaydırma alanı)
 *   └── .modal-foot    SABİT
 *
 * Kaydırma yalnızca gövdededir; başlık ve altbilgi her zaman görünür kalır.
 *
 * @param {Object} opts
 *   title, message, html,
 *   options: [{ id, label, icon, desc }],
 *   cancelText, confirmLabel,
 *   wide      : true → geniş yerleşim (Yardım/Kısayollar gibi dokümanlar)
 *   className : ek sınıf adı
 *   html      : string VEYA () => string. Fonksiyon verilirse dil
 *               değişiminde `refreshOpenModal()` ile yeniden üretilir.
 *
 *   i18n karşılıkları (metin yerine anahtar verilirse çeviri kullanılır):
 *   titleKey/titleArgs · cancelKey/cancelArgs
 *   confirmKey/confirmArgs · messageKey/messageArgs
 *   options[]: labelKey/labelArgs · descKey/descArgs
 * @returns {Promise<string|null>} Seçilen seçenek id'si veya null
 */
export function openModal(opts) {
  const backdrop = qs('#modalBackdrop');
  const box = qs('#modal');
  backdrop.hidden = false;
  box.innerHTML = '';
  // Yeniden kullanılan düğüm üzerinde önceki kaydırma konumu kalmasın
  box.scrollTop = 0;
  modalLastOpts = opts;

  let resolve;
  const promise = new Promise((r) => { resolve = r; });

  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(null); }
  };
  const onBackdropDown = (e) => {
    if (e.target === backdrop) close(null);
  };

  function close(value) {
    if (!modalCloser) return;
    modalCloser = null;
    backdrop.hidden = true;
    box.innerHTML = '';
    box.className = 'modal';          // genişlik/ek sınıfları sıfırla
    modalLastOpts = null;            // bayat opts tutulmasın
    document.removeEventListener('keydown', onKey, true);
    backdrop.removeEventListener('mousedown', onBackdropDown);
    resolve(value);
  }
  modalCloser = close;

  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('mousedown', onBackdropDown);

  if (opts.wide) box.classList.add('modal-wide');
  if (opts.className) box.classList.add(opts.className);

  const body = el('div.modal-body');
  if (opts.messageKey) body.append(el('p', { i18n: opts.messageKey, i18nArgs: opts.messageArgs, style: { margin: 0 } }));
  else if (opts.message) body.append(el('p', { text: opts.message, style: { margin: 0 } }));
  if (opts.html) body.append(el('div', { html: typeof opts.html === 'function' ? opts.html() : opts.html }));

  if (opts.options?.length) {
    const list = el('div.opt-list');
    for (const opt of opts.options) {
      list.append(el('button.opt', { type: 'button', onclick: () => close(opt.id) }, [
        opt.icon ? el('span.opt-ic', { html: opt.icon }) : null,
        el('span', {}, [
          opt.labelKey
            ? el('b', { i18n: opt.labelKey, i18nArgs: opt.labelArgs })
            : el('b', { text: opt.label }),
          opt.descKey
            ? el('span', { i18n: opt.descKey, i18nArgs: opt.descArgs })
            : (opt.desc ? el('span', { text: opt.desc }) : null),
        ]),
      ]));
    }
    body.append(list);
  }
  if (!opts.message && !opts.messageKey && !opts.html) body.style.display = 'none';

  box.append(
    el('div.modal-head', {}, [
      opts.titleKey
        ? el('h3', { i18n: opts.titleKey, i18nArgs: opts.titleArgs })
        : el('h3', { text: opts.title || '' }),
      el('button.x-btn', {
        type: 'button',
        i18nAttr: { title: 'modal.close.title' },
        html: ICONS.close(15),
        onclick: () => close(null),
      }),
    ]),
    body,
    el('div.modal-foot', {}, [
      opts.cancelText !== null
        ? (opts.cancelKey
          ? el('button.btn', { type: 'button', i18n: opts.cancelKey, i18nArgs: opts.cancelArgs, onclick: () => close(null) })
          : el('button.btn', { type: 'button', text: opts.cancelText || i18n.t('modal.cancel'), onclick: () => close(null) }))
        : null,
      opts.confirmKey
        ? el('button.btn.primary', { type: 'button', i18n: opts.confirmKey, i18nArgs: opts.confirmArgs, onclick: () => close('__confirm') })
        : (opts.confirmLabel
          ? el('button.btn.primary', { type: 'button', text: opts.confirmLabel, onclick: () => close('__confirm') })
          : null),
    ])
  );

  return promise;
}

export function closeModal(value = null) {
  modalCloser?.(value);
}

/* -------------------------------------------------------------------------
   Sürükle-bırak yardımcısı
   ------------------------------------------------------------------------- */
/** Bir veriyi dataTransfer'a yazar; Firefox için payload önceden set edilir. */
export function setDragPayload(event, payload) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', payload.assetId || '');
    event.dataTransfer.effectAllowed = 'copy';
  }
}
