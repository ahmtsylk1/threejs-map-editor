/**
 * ImportRouter.js
 * ===========================================================================
 * Sürükle-bırak / dosya seçici ile gelen dosyaları UZANTIYA GÖRE doğru
 * parser'a yönlendirir.
 *
 *   .json  →  ProjectIO (harita projesi)
 *   .npy   →  NPYParser  (yükseklik haritası → arazi)
 *   .smd   →  SMDParser  (Valve Source modeli → mesh)
 *              …veya içerik denetimiyle: BinaryGridParser (ikincil biçim)
 *
 * Router'ın kendisi DOM/three.js bilmez; sadece uzantı sınıflandırır ve
 * verilen `handlers` geri çağrılarını tetikler. Bu sayede hem masaüstü
 * sürükle-bırak hem de `<input type="file">` aynı yolu kullanır ve
 * `Editor` içinde iki ayrı yükleme kodu bakımı gerekmez.
 *
 * UZANTI YANILTICI OLABİLİR
 * -------------------------
 * Gerçek dünyada `.smd` adı verilmiş dosyaların bir kısmı Valve ASCII SMD
 * DEĞİLDİR; üçüncü parti araçların ürettiği ikili harita dökümleridir.
 * Bu dosyaları doğrudan metin parser'ına sokmak "sözdizimi hatası" gibi
 * anlamsız bir mesaj üretir. Bu yüzden şüpheli uzantılarda önce İÇERİK
 * denetimi yapılır (bkz. `sniffContent`).
 *
 * Desteklenmeyen uzantılarda kullanıcıya HANGİ formatların kabul edildiğini
 * söyleyen net bir hata verilir (sessizce yoksaymak yanıltıcı olurdu).
 * ===========================================================================
 */

import { sniffBinaryGrid } from './BinaryGridParser.js';

/** Tanımlı içe aktarıcılar. */
export const IMPORTERS = Object.freeze({
  json: {
    id: 'json',
    ext: ['.json'],
    label: 'Map Editor projesi',
    description: 'Sahne kayıtları, harita ayarları ve nesne verileri',
    multiple: false,          // sahneyi tamamen değiştirir -> tek dosya
    replaces: true,
  },
  npy: {
    id: 'npy',
    ext: ['.npy'],
    label: 'NumPy yükseklik haritası',
    description: 'Terrain (arazi) mesh üretir',
    multiple: true,
    replaces: false,
  },
  smd: {
    id: 'smd',
    ext: ['.smd'],
    label: 'Valve Source modeli (.smd)',
    description: 'BufferGeometry üretip sahneye ekler',
    multiple: true,
    replaces: false,
    // İçerik denetimi gerekir: uzantı tek başına anlam taşımıyor
    sniff: true,
  },
  /* -----------------------------------------------------------------------
   * İkili ızgara dosyaları.
   *
   * Bu uzantılar belirsizdir: `.map` bir harita dökümü olabilir, `.bin`
   * model olabilir. Bu yüzden HİÇBİRİ doğrudan bir parser'a bağlanmaz;
   * hepsi içerik denetiminden geçer ve ne olduklarına göre yönlendirilir.
   * --------------------------------------------------------------------- */
  binary: {
    id: 'binary',
    ext: ['.bin', '.raw', '.grid', '.map', '.dat'],
    label: 'İkili ızgara / harita dökümü',
    description: 'İçeriğe göre Valve modeli veya yükseklik ızgarası olarak okunur',
    multiple: true,
    replaces: false,
    sniff: true,
  },

  /* -----------------------------------------------------------------------
   * glTF / GLB / OBJ — dış model biçimleri.
   *
   * `scan-assets.mjs` ile taranan modeller kitaplık üzerinden gelir; bu
   * giriş ise kullanıcının BİRAKTIĞI tekil dosyalar içindir.
   * --------------------------------------------------------------------- */
  model3d: {
    id: 'model3d',
    ext: ['.glb', '.gltf', '.obj'],
    label: 'glTF / GLB / OBJ modeli',
    description: 'Meshopt + KTX2 çözülür, sahneye model olarak eklenir',
    multiple: true,
    replaces: false,
  },
});

/** `<input type="file">` için accept niteliği. */
export const ACCEPT_ATTRIBUTE = Object.values(IMPORTERS).flatMap((i) => i.ext).join(',');

/**
 * Bu uzantıda içerik denetimi yapılmalı mı?
 *
 * Dosya uzantıları tek başına yeterli bilgi vermediği durumlar (`.smd` adını
 * taşıyan bir ikili döküm, `.map` adını taşıyan bir model...) için kullanılır.
 */
export function needsContentSniff(name) {
  const ext = extensionOf(name);
  if (!ext) return false;
  for (const imp of Object.values(IMPORTERS)) {
    if (imp.ext.includes(ext)) return imp.sniff === true;
  }
  return false;
}

/** Sürükle-bırak ipucu metni. */
export const DROP_HINT =
  'Bırakın: .npy arazi · .smd / .glb model · .json proje';

/**
 * Dosya adından uzantıyı çıkarır (yol, sorgu dizesi, nokta sayısı korunur).
 * @param {string} name
 * @returns {string} ör. '.npy'
 */
export function extensionOf(name) {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

/**
 * Dosyayı sınıflandırır.
 *
 * `.smd` ve benzeri uzantılarda ÖNCE içerik denetlenir: dosya gerçekten Valve
 * ASCII SMD mi, yoksa ikili bir ızgara mı? Yanlış parser'a göndermek yerine
 * doğru teşhis mesajını vermek, kullanıcıyı saatlerce yanlış yönde aramaktan
 * kurtarır.
 *
 * @param {string|File} source
 * @returns {{id:string, ext:string, sniff?:string}|{id:null, ext:string, reason:string}}
 */
export function classify(source) {
  const name = typeof source === 'string' ? source : source?.name || '';
  const ext = extensionOf(name);

  if (!ext) {
    return { id: null, ext, reason: 'Dosya adında uzantı yok.' };
  }
  for (const imp of Object.values(IMPORTERS)) {
    if (imp.ext.includes(ext)) return { id: imp.id, ext };
  }

  // Bilinen ama desteklenmeyen formatlar için açıklama
  const NOTES = {
    '.npz': '.npz sıkıştırılmış bir ZIP arşividir; numpy içinde `np.save("x.npy", arr)` ile .npy olarak dışa aktarın.',
    '.npy.gz': 'Sıkıştırılmış .npy desteklenmiyor; dosyayı açıp .npy olarak kaydedin.',
    '.obj': '.OBJ doğrudan desteklenmiyor (SMD dışındaki mesh formatları kapsam dışı).',
    '.fbx': '.FBX kapsam dışı.',
    '.gltf': '.glTF/GLB kapsam dışı.',
    '.vmdl': '.vmdl (Valve 2) metin değil, özel ikili formatta.',
    '.vtf': '.vtf (Valve doku) kapsam dışı; bu editör yalnızca geometri okur.',
    '.mdl': '.mdl (Quake) kapsam dışı.',
    '.ms3d': '.ms3d kapsam dışı.',
  };

  return {
    id: null,
    ext,
    reason: NOTES[ext] || `"${ext}" desteklenmiyor. Desteklenen: ${ACCEPT_ATTRIBUTE}`,
  };
}

/**
 * İçerik denetimi: uzantıya bakmadan dosyanın ne olduğunu anlamaya çalışır.
 * Yalnızca ikili ızgara şüphesi olan uzantılarda çağrılır.
 *
 * @param {File|Blob} file
 * @returns {Promise<{kind:'ascii-smd'|'binary-grid'|'unknown', reason:string, detail?:Object}>}
 */
export async function sniffContent(file) {
  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return { kind: 'unknown', reason: 'Dosya okunamadı.' };
  }

  // ASCII SMD imzası: ilk satır "version"
  //
  // DİKKAT: UTF-8 BOM (EF BB BF) `latin1` ile çözülünce "ï»¿" olur ve
  // `^\s*version` eşleşmez. Gerçek SMD dosyalarında BOM yaygındır, bu yüzden
  // hem bayt hem de metin olarak temizlenir.
  let head = new TextDecoder('latin1').decode(new Uint8Array(buffer, 0, Math.min(64, buffer.byteLength)));
  if (head.charCodeAt(0) === 0xFEFF || head.startsWith('ï»¿')) head = head.replace(/^ï»¿/, '');
  if (/^\s*version\s+\d/i.test(head)) {
    return { kind: 'ascii-smd', reason: 'Valve ASCII SMD imzası bulundu.' };
  }

  const sniff = sniffBinaryGrid(buffer);
  if (sniff.isGrid) {
    return {
      kind: 'binary-grid',
      reason: sniff.reason,
      detail: sniff,
    };
  }

  return {
    kind: 'unknown',
    reason: sniff.reason,
  };
}

/** İnsan okunur açıklama (toast / ipucu için). */
export function describe(name) {
  const c = classify(name);
  if (!c.id) return { ok: false, text: c.reason };
  const imp = IMPORTERS[c.id];
  return { ok: true, id: imp.id, text: `${imp.label} · ${imp.description}` };
}

/**
 * Dosya yönlendirici.
 *
 * @param {Object} handlers
 *   loadJson(file)                 → Promise
 *   loadNpy(file, context)         → Promise
 *   loadSmd(file, context)         → Promise
 *   loadModel3d(file, context)     → Promise  (glTF/GLB/OBJ)
 *   loadBinaryGrid(file, ctx, sniff) → Promise  (ikili ızgara; opsiyonel)
 *   onProgress({done, total, name, id})
 *   onError({file, message, code})
 */
export class ImportRouter {
  constructor(handlers = {}) {
    this.handlers = handlers;
  }

  /**
   * Tek dosyayı içe aktarır.
   *
   * Akış:
   *   1. uzantı sınıflandırma
   *   2. şüpheli uzantılarda İÇERİK denetimi (ASCII SMD mi, ikili ızgara mı?)
   *   3. uygun işleyiciye yönlendirme
   *
   * @param {File} file
   * @param {Object} [context] örneğin { position: Vector3, options: {...} }
   * @returns {Promise<{ok:boolean, id?:string, result?:any, error?:string}>}
   */
  async handle(file, context = {}) {
    if (!file) return { ok: false, error: 'Dosya yok.' };

    const cls = classify(file);
    if (!cls.id) {
      const error = cls.reason;
      this.handlers.onError?.({ file, message: error, code: 'E_EXT' });
      return { ok: false, error };
    }

    const imp = IMPORTERS[cls.id];
    let sniffed = null;

    // --- İÇERİK DENETİMİ --------------------------------------------------
    // Uzantı tek başına yeterli değil. Örnek: `.smd` adını taşıyan bir dosya
    // ya Valve ASCII SMD'dir ya da üçüncü parti bir ikili harita dökümü.
    // Denetim hangisi olduğunu söyler ve dosya oraya yönlendirilir.
    if (imp.sniff) {
      sniffed = await sniffContent(file);

      if (sniffed.kind === 'binary-grid') {
        return this._run('bgrid', file, context, () =>
          this.handlers.loadBinaryGrid?.(file, context, sniffed));
      }

      if (sniffed.kind === 'ascii-smd') {
        return this._run('smd', file, context, () =>
          this.handlers.loadSmd?.(file, context));
      }

      // kind === 'unknown' → ne biri ne diğeri: en açıklayıcı mesajı ver.
      // Mesaj uzantıya göre değişir; ".dat dosyası Valve ASCII SMD değil"
      // demek anlamsız olurdu.
      const error = imp.id === 'smd'
        ? 'Bu dosya Valve ASCII SMD değil. Beklenen imza: ilk satır "version 1". ' +
          `Tespit: ${sniffed.reason}`
        : `"${cls.ext}" tanındı ama ne Valve ASCII SMD ne ikili yükseklik ızgarası. ` +
          `Tespit: ${sniffed.reason}`;
      this.handlers.onError?.({ file, message: error, code: 'E_SMD_FORMAT' });
      return { ok: false, error };
    }

    return this._run(imp.id, file, context, () => {
      switch (imp.id) {
        case 'json':   return this.handlers.loadJson?.(file, context);
        case 'npy':    return this.handlers.loadNpy?.(file, context);
        case 'smd':    return this.handlers.loadSmd?.(file, context);
        case 'model3d': return this.handlers.loadModel3d?.(file, context);
        default: throw new Error(`İşleyici yok: ${imp.id}`);
      }
    });
  }

  /**
   * Tek bir yükleme yolunu çalıştırır: ilerleme bildirimi + hata yakalama.
   * @private
   */
  async _run(routeId, file, context, fn) {
    this.handlers.onProgress?.({ done: 0, total: 1, name: file.name, id: routeId });
    try {
      const result = await fn();
      if (result === undefined) {
        throw new Error(`"${routeId}" işleyicisi tanımlı değil (ImportRouter handlers).`);
      }
      this.handlers.onProgress?.({ done: 1, total: 1, name: file.name, id: routeId });
      return { ok: true, id: routeId, result };
    } catch (err) {
      this.handlers.onError?.({ file, message: err.message, code: err.code || 'E_IMPORT' });
      return { ok: false, error: err.message };
    }
  }

  /**
   * Birden çok dosyayı sırayla içe aktarır.
   *
   * NOT: `json` sahneyi tamamen değiştirdiği için dosyalar arasında EN SON
   * çalıştırılır; aksi halde proje yüklemesi kendinden önce eklenen .npy/.smd
   * nesnelerini silerdi.
   *
   * @param {File[]} files
   * @param {Object} [context]
   * @returns {Promise<{imported:number, failed:Array<{name:string,error:string}>, results:Array}>}
   */
  async handleMany(files, context = {}) {
    const list = [...(files || [])];
    const ordered = [
      ...list.filter((f) => classify(f).id !== 'json'),
      ...list.filter((f) => classify(f).id === 'json'),
    ];

    const results = [];
    const failed = [];
    let done = 0;

    for (const file of ordered) {
      this.handlers.onProgress?.({ done, total: ordered.length, name: file.name, id: classify(file).id });
      const r = await this.handle(file, context);
      done++;
      if (r.ok) results.push(r);
      else failed.push({ name: file.name, error: r.error });
    }

    this.handlers.onProgress?.({ done: ordered.length, total: ordered.length, name: '', id: null });
    return { imported: results.length, failed, results };
  }
}
