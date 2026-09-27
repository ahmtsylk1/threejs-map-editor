/**
 * ImportedAssetLibrary.js
 * ===========================================================================
 * Dış projelerden taranan 3B modelleri (glTF/GLB/OBJ) runtime'da yönetir.
 *
 * SORUMLULUKLAR
 * -------------
 *  1. `imported-assets.json` manifestini okur (AssetPanel'in veri kaynağı).
 *  2. Model dosyalarını **tembel** (lazy) yükler — 1390 model belleğe
 *     birden sokulamaz, yalnızca sahneye eklenenler indirilir.
 *  3. Sıkıştırılmış biçimleri çözer:
 *       EXT_meshopt_compression → MeshoptDecoder   (buffer sıkıştırma)
 *       KHR_texture_basisu      → KTX2Loader        (Basis/KTX2 dokular)
 *     Bu ikisi OLMADAN model kitaplığındaki 1390 modelin çoğu yüklenemez.
 *  4. Yüklenen modelleri LRU önbellekte tutar; aynı model 100 kez
 *     eklense bile dosya bir kez indirilir, geometri/malzeme paylaşılır.
 *  5. Gerçek dünya sınır kutusunu yükleme SONRASI hesaplar (kuantize
 *     modellerde manifest'teki değerler anlamsızdır).
 *
 * KİMLİK KURALLARI
 * ----------------
 * Dahili asset kimlikleri (`cube`, `tree`…) ile çakışmamak için dış
 * modeller `imp:` önekiyle adlandırılır:
 *
 *     manifest id : dungeon_fence
 *     runtime id  : imp:dungeon_fence
 *     temiz assetId (`dungeon_fence`) çalışma zamanında kullanılmaz.
 *
 * Bu ayrım ProjectIO'da da korunur; JSON'a yazılan `assetId` her zaman
 * `imp:` önekli olur, böylece proje başka bir makinede açıldığında
 * kütüphane aynı kaydı bulabilir.
 * ===========================================================================
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

/** Runtime kimliği öneki. */
export const IMPORT_PREFIX = 'imp:';

/** Manifestin sunucudaki yolu. `tools/scan-assets.mjs` buraya yazar. */
export const MANIFEST_URL = '/public/assets/imported/imported-assets.json';

/**
 * KTX2 transcoder dosyalarının bulunduğu klasör.
 * `tools/fetch-transcoder.mjs` indirir; three.js sürümüyle aynı olmalıdır.
 */
export const KTX2_TRANSCODER_PATH = '/public/vendor/basis/';

/** Bellekte tutulacak model sayısı (LRU). */
const VARSAYILAN_CACHE = 24;

/**
 * Thumbnail kare boyutu (px) — manifest'te yoksa kullanılır.
 * `generate-thumbs.mjs --size` ile üretilmiş boyuttan okunur.
 */
export const THUMB_VARSAYILAN = 128;

/** Bu kimlik bir dış model mi? */
export function isImportedId(assetId) {
  return typeof assetId === 'string' && assetId.startsWith(IMPORT_PREFIX);
}

/** Manifest kimliğini runtime kimliğine çevirir. */
export function toRuntimeId(manifestId) {
  return manifestId.startsWith(IMPORT_PREFIX) ? manifestId : IMPORT_PREFIX + manifestId;
}

/** Runtime kimliğini manifest kimliğine çevirir. */
export function toManifestId(runtimeId) {
  return runtimeId.startsWith(IMPORT_PREFIX) ? runtimeId.slice(IMPORT_PREFIX.length) : runtimeId;
}

/* ==========================================================================
   LIBRARY
   ========================================================================== */

/** @typedef {Object} ImportedEntry
 * @property {string} id        runtime kimliği ("imp:dungeon_fence")
 * @property {string} manifestId
 * @property {string} ad        görünen ad
 * @property {string} kategori
 * @property {string} url       sunucu yolu ("/public/assets/imported/…")
 * @property {number} boyut
 * @property {number} ucgen
 * @property {number} kose
 * @property {boolean} meshVar
 * @property {string} [not]
 */

export class ImportedAssetLibrary {
  /**
   * @param {THREE.WebGLRenderer} renderer KTX2Loader.detectSupport() için gerekli
   */
  constructor(renderer) {
    this.renderer = renderer || null;

    /** @type {Map<string, ImportedEntry>} */
    this.entries = new Map();
    /** @type {Array<{id:string,etiket:string,adet:number,bayt:number}>} */
    this.categories = [];
    this.manifest = null;
    this.status = 'idle';       // idle | loading | ready | empty | error
    this.error = null;
    /** Thumbnail kare boyutu (manifestin `thumbnail.boyut` alanından okunur). */
    this.thumbSize = THUMB_VARSAYILAN;

    /** @type {Map<string, {object:THREE.Object3D, box:THREE.Box3, stats:Object, boyut:number}>} */
    this._cache = new Map();
    this._cacheLimit = VARSAYILAN_CACHE;
    /** @type {Map<string, Promise>} eşzamanlı istekleri birleştirir */
    this._pending = new Map();

    this._loader = null;
    this._ktx2 = null;
    this._hazirPromise = null;
  }

  /* -----------------------------------------------------------------------
     YÜKLEME
     --------------------------------------------------------------------- */

  /**
   * Manifesti okur ve yükleyicileri hazırlar.
   *
   * HATA TOLERANSLI: manifest yoksa veya bozuksa editör ÇALIŞMAYA DEVAM EDER;
   * yalnızca dış model kategorisi boş kalır ve `status = 'error'` olur.
   * Bir asset kitaplığı eksikliği editörü kullanılamaz hale getirmemelidir.
   *
   * @returns {Promise<{ok:boolean, status:string, count:number, error?:string}>}
   */
  async init(opts = {}) {
    if (this.status === 'ready' || this.status === 'error' || this.status === 'empty') {
      return { ok: this.status === 'ready', status: this.status, count: this.entries.size };
    }
    if (this._hazirPromise) return this._hazirPromise;

    this.status = 'loading';
    this._hazirPromise = (async () => {
      try {
        const url = opts.manifestUrl || MANIFEST_URL;
        const cevap = await fetch(url, { cache: 'no-store' });
        if (!cevap.ok) {
          // 404 = kitaplık hiç taranmamış; bu bir hata değil, normal durum.
          if (cevap.status === 404) {
            this.status = 'empty';
            return { ok: false, status: 'empty', count: 0 };
          }
          throw new Error(`HTTP ${cevap.status} ${cevap.statusText}`);
        }
        const json = await cevap.json();
        this._manifestiUygula(json);
        this.status = this.entries.size ? 'ready' : 'empty';
        return { ok: this.status === 'ready', status: this.status, count: this.entries.size };
      } catch (e) {
        this.status = 'error';
        this.error = e.message;
        console.warn('[IMPORT] asset kitaplığı okunamadı:', e.message);
        return { ok: false, status: 'error', count: 0, error: e.message };
      } finally {
        this._hazirPromise = null;
      }
    })();

    return this._hazirPromise;
  }

  /** Manifest JSON'unu iç belleğe alır ve indeksler. */
  _manifestiUygula(json) {
    this.manifest = json;
    this.entries.clear();
    this.categories = [];

    const liste = Array.isArray(json?.assets) ? json.assets : [];
    const kategoriSayaci = new Map();

    for (const k of liste) {
      if (!k?.id || !k?.yol) continue;

      const runtimeId = toRuntimeId(k.id);
      const yol = String(k.yol).replace(/^\/+/, '');        // "public/…"

      const kayit = {
        id: runtimeId,
        manifestId: k.id,
        ad: k.ad || k.id,
        dosya: k.dosya || '',
        kategori: k.kategori || 'genel',
        url: '/' + yol,
        boyut: k.boyut || 0,
        bicim: k.bicim || 'glb',
        ucgen: k.ucgen || 0,
        kose: k.kose || 0,
        mesh: k.mesh || 0,
        primitif: k.primitif || 0,
        malzeme: k.malzeme || 0,
        doku: k.doku || 0,
        animasyon: k.animasyon || 0,
        kemik: k.kemik || 0,
        morph: k.morph === true,
        meshVar: k.meshVar !== false,
        sinirGuvenilir: k.sinirGuvenilir !== false,
        sinirBoyut: Array.isArray(k.sinirBoyut) ? k.sinirBoyut : [0, 0, 0],
        eklentiler: Array.isArray(k.gerekliEklentiler) ? k.gerekliEklentiler : [],
        meshopt: k.meshopt === true,
        ktx2: k.ktx2 === true,
        not: k.not || null,
        kaynak: k.kaynak || null,

        // --- THUMBNAIL -------------------------------------------------
        // `tools/generate-thumbs.mjs` üretir ve manifeste `thumb` alanı olarak
        // yazar. Üretilmemişse null → AssetPanel fallback ikon gösterir.
        thumb: k.thumb || null,
        thumbBayt: k.thumbBayt || 0,
        thumbDurum: k.thumbDurum || null,   // 'ok' | 'mesh-yok' | 'hata'
      };

      this.entries.set(runtimeId, kayit);

      if (!kategoriSayaci.has(kayit.kategori)) {
        kategoriSayaci.set(kayit.kategori, { id: kayit.kategori, etiket: '', adet: 0, bayt: 0, thumblu: 0 });
      }
      const c = kategoriSayaci.get(kayit.kategori);
      c.adet++;
      c.bayt += kayit.boyut;
      if (kayit.thumb) c.thumblu++;
    }

    // Thumbnail üretim parametreleri (varsa) — panel bunu `thumbSize` ile okur
    this.thumbSize = Number(json?.thumbnail?.boyut) || THUMB_VARSAYILAN;

    // Kategori etiketlerini manifest'ten al, yoksa isimden türet.
    const etiketler = new Map((json?.kategoriler || []).map((k) => [k.id, k.etiket]));
    this.categories = [...kategoriSayaci.values()]
      .map((c) => ({
        ...c,
        etiket: etiketler.get(c.id) || c.id
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (ch) => ch.toLocaleUpperCase('tr')),
      }))
      .sort((a, b) => b.adet - a.adet);

    console.info(
      `[IMPORT] asset kitaplığı: ${this.entries.size} model / ${this.categories.length} kategori` +
      (this._ktx2 ? '  ·  KTX2 hazır' : '') + '  ·  Meshopt hazır'
    );
  }

  /* -----------------------------------------------------------------------
     ERİŞİM
     --------------------------------------------------------------------- */

  get ready() { return this.status === 'ready'; }
  get count() { return this.entries.size; }

  /** @returns {ImportedEntry|null} */
  get(assetId) {
    return this.entries.get(assetId) || null;
  }

  /** @returns {ImportedEntry[]} */
  list(kategori = null) {
    const hepsi = [...this.entries.values()];
    return kategori ? hepsi.filter((e) => e.kategori === kategori) : hepsi;
  }

  /** Kısayolarda ve arama kutusunu doldurmak için düz metin dizisi. */
  searchMetni(assetId) {
    const e = this.entries.get(assetId);
    if (!e) return '';
    return `${e.ad} ${e.kategori} ${e.manifestId}`.toLocaleLowerCase('tr');
  }

  /* -----------------------------------------------------------------------
     MODEL YÜKLEME
     --------------------------------------------------------------------- */

  /**
   * GLTFLoader'ı kurar. Meshopt ve KTX2 çözücüler takılır.
   * @private
   */
  _loaderKur() {
    if (this._loader) return this._loader;

    this._loader = new GLTFLoader();
    this._loader.setMeshoptDecoder(MeshoptDecoder);

    if (this.renderer) {
      try {
        this._ktx2 = new KTX2Loader()
          .setTranscoderPath(KTX2_TRANSCODER_PATH)
          .detectSupport(this.renderer);
        this._loader.setKTX2Loader(this._ktx2);
      } catch (e) {
        // KTX2 kurulamazsa KHR_texture_basisu'lu modeller yüklenemez.
        // Bu bir HATA DEĞİLDİR — diğer tüm modeller çalışmaya devam eder.
        this._ktx2 = null;
        console.warn('[IMPORT] KTX2Loader kurulamadı, KTX2 dokulu modeller yüklenemeyecek:', e.message);
      }
    }

    return this._loader;
  }

  /**
   * Bir modeli yükler (önbellekli).
   *
   * Aynı model için eşzamanlı istekler tek PROMISE'e birleştirilir; 100 adet
   * ağaç yerleştirirken "fence" dosyası 100 kez indirilmez.
   *
   * @param {string} assetId runtime kimliği ("imp:…")
   * @returns {Promise<{object:THREE.Object3D, box:THREE.Box3, stats:Object}>}
   * @throws manifestte yoksa veya dosya bozuksa
   */
  async load(assetId) {
    const kayit = this.entries.get(assetId);
    if (!kayit) {
      // Proje JSON'unda kalmış ama bu oturumda yüklenmemiş bir serbest model:
      // dosya sunucuda yoktur, yeniden sürüklenmelidir.
      if (assetId.startsWith(`${IMPORT_PREFIX}serbest_`)) {
        const e = new Error(
          `"${assetId.slice(IMPORT_PREFIX.length).replace(/^serbest_/, '')}" ` +
          'bu oturumda yüklü değil — dosyayı viewport’a yeniden sürükleyin.'
        );
        e.code = 'E_IMPORT_TRANSIENT';
        throw e;
      }
      const e = new Error(`Kitaplıkta bu model yok: ${assetId.replace(IMPORT_PREFIX, '')}`);
      e.code = 'E_IMPORT_NOT_FOUND';
      throw e;
    }
    return this._yukle(kayit);
  }

  /**
   * Kütüphanede olmayan bir GLB'yi doğrudan yükler (sürükle-bırak).
   * @param {string} url
   * @param {string} anahtar önbellek anahtarı
   */
  async loadUrl(url, anahtar) {
    const kayit = this.entries.get(anahtar) || {
      id: anahtar, manifestId: anahtar, ad: anahtar, url,
      kategori: 'serbest', boyut: 0, meshVar: true, ktx2: true, meshopt: true,
    };
    return this._yukle(kayit);
  }

  /**
   * Kullanıcının sürükleyip bıraktığı DOSYAYI yükler (kütüphane dışı).
   *
   * Neden ayrı bir yol? `load()` bir URL üzerinden çalışır ve önbelleklenir.
   * Sürüklenen dosya diskte durur, URL'i yoktur ve her bırakmada yeniden
   * okunmalıdır (aynı dosya iki kez bırakılırsa iki AYRI nesne beklenir —
   * bu yüzden kayıt `imp:serbest_<ad>` altında tutulur, kütüphane kaydına
   * karışmaz).
   *
   * Desteklenen biçimler:
   *   .glb  → GLTFLoader.parse()  (tam sıkıştırma desteği)
   *   .gltf → GLTFLoader.parse()  ⚠ dış dosya referansları çözülemez
   *   .obj  → OBJLoader           ⚠ .mtl ve doku dosyaları yüklenmez
   *
   * @param {File} file
   * @returns {Promise<{object:THREE.Object3D, box:THREE.Box3, stats:Object}>}
   */
  async loadFile(file) {
    const ad = (file.name || 'model').replace(/\.[^.]+$/, '');
    const uzanti = (file.name || '').toLowerCase().split('.').pop();
    const anahtar = `${IMPORT_PREFIX}serbest_${ad}`;

    const kayit = {
      id: anahtar,
      manifestId: anahtar,
      ad,
      dosya: file.name,
      kategori: 'serbest',
      url: null,                    // diskte bir dosya, sunucuda yol yok
      boyut: file.size || 0,
      bicim: uzanti || 'glb',
      ucgen: 0, kose: 0, mesh: 0, primitif: 0,
      malzeme: 0, doku: 0, animasyon: 0, kemik: 0,
      morph: false, meshVar: true,
      sinirGuvenilir: false,
      sinirBoyut: [0, 0, 0],
      eklentiler: [], meshopt: true, ktx2: true,
      not: null,
      /**
       * Sürüklenen dosya GEÇİCİDİR: sunucuda karşılığı yoktur. Proje JSON'u
       * bu kimliği taşısa bile başka bir oturumda/sunucuda dosya bulunamaz.
       * Bu yüzden işaretlenir; proje yüklenirken kullanıcıya net mesaj verilir.
       */
      gecici: true,
    };

    // Zaten bu içerik yüklendiyse (aynı dosya tekrar bırakıldı) yeniden kullan
    const varolan = this._cache.get(anahtar);
    if (varolan && varolan.dosyaBoyutu === file.size) {
      this._serbestKayit(kayit);
      return varolan;
    }

    const buf = await file.arrayBuffer();

    if (uzanti === 'obj') {
      const metin = new TextDecoder('utf-8').decode(buf);
      const obj = new OBJLoader().parse(metin);
      obj.name = ad;
      const sonuc = this._hazirla(obj, kayit, { animations: [], skins: [] });
      sonuc.dosyaBoyutu = file.size;
      this._serbestKayit(kayit);
      this._cache.set(anahtar, sonuc);
      this._cacheTemizle();
      return sonuc;
    }

    // .glb / .gltf — parse() dış dosya yolunu ikinci argüman olarak alır
    const loader = this._loaderKur();
    const gltf = await new Promise((coz, reddetle) => {
      loader.parse(buf, '', coz, (e) => reddetle(
        new Error(e.message || 'glTF çözümlenemedi')
      ));
    });

    const kok = gltf.scene || gltf.scenes?.[0];
    if (!kok) throw new Error('glTF içinde sahne (scene) bulunamadı.');
    kok.name = ad;

    const sonuc = this._hazirla(kok, kayit, gltf);
    sonuc.dosyaBoyutu = file.size;
    this._serbestKayit(kayit);
    this._cache.set(anahtar, sonuc);
    this._cacheTemizle();
    return sonuc;
  }

  /**
   * Sürüklenen dosyayı kütüphane dizinine de yazar.
   *
   * Böylece `addAsset('imp:serbest_x')`, `instantiate()` ve JSON dışa aktarım
   * tam olarak kitaplık modelleriyle AYNI yolu izler — özel bir dal gerekmez.
   * @private
   */
  _serbestKayit(kayit) {
    this.entries.set(kayit.id, kayit);
    if (!this.categories.some((c) => c.id === 'serbest')) {
      this.categories.unshift({ id: 'serbest', etiket: 'Serbest (bırakılan dosyalar)', adet: 0, bayt: 0 });
    }
    const c = this.categories.find((x) => x.id === 'serbest');
    c.adet = this.list('serbest').length;
  }

  /** @private */
  async _yukle(kayit) {
    // 1) önbellek
    const varolan = this._cache.get(kayit.id);
    if (varolan) {
      // LRU: en son kullanılan en başa
      this._cache.delete(kayit.id);
      this._cache.set(kayit.id, varolan);
      return varolan;
    }

    // 1b) sunucuda karşılığı olmayan geçici kayıt
    if (!kayit.url) {
      const e = new Error(`"${kayit.ad}" yalnızca bu oturumda geçerli — dosyayı yeniden bırakın.`);
      e.code = 'E_IMPORT_TRANSIENT';
      throw e;
    }

    // 2) uçuştaki istek
    const bekleyen = this._pending.get(kayit.id);
    if (bekleyen) return bekleyen;

    const istek = (async () => {
      const loader = this._loaderKur();
      try {
        const gltf = await loader.loadAsync(kayit.url);
        const kok = gltf.scene || gltf.scenes?.[0];
        if (!kok) {
          const e = new Error('GLB içinde sahne (scene) bulunamadı — dosya bozuk olabilir.');
          e.code = 'E_GLB_NO_SCENE';
          throw e;
        }

        const sonuc = this._hazirla(kok, kayit, gltf);
        this._cache.set(kayit.id, sonuc);
        this._cacheTemizle();
        return sonuc;
      } catch (err) {
        // Hata mesajını eklenti adına zenginleştir: kullanıcı bunu görür.
        const e = new Error(`${kayit.ad}: ${err.message || 'yükleme başarısız'}`);
        e.code = err.code || 'E_GLB_LOAD';
        e.cause = err;
        throw e;
      } finally {
        this._pending.delete(kayit.id);
      }
    })();

    this._pending.set(kayit.id, istek);
    return istek;
  }

  /**
   * Yüklenen sahneyi editörün beklediği biçime hazırlar.
   *
   * - Geometri/malzeme PAYLAŞILIR (klonlanmaz): 100 adet ağaç = 1 dosya.
   * - Gölge bayrakları ayarlanır.
   * - `tintable` yalnızca dokusuz modellerde açılır; dokulu modeli renklendirmek
   *   texture'ı çamurlu bir renge bozar.
   * - Gerçek sınır kutusu hesaplanır (kuantize modellerde manifest yanıltır).
   * @private
   */
  _hazirla(kok, kayit, gltf) {
    // three.js yükleme sonrası düğüm adlarını ve morph/anim verisini koru
    kok.name = kok.name || kayit.ad;

    let ucgen = 0, meshSayisi = 0, malzemeSayisi = 0;
    const malzemeler = new Set();

    kok.traverse((n) => {
      if (!n.isMesh) return;
      meshSayisi++;
      n.castShadow = true;
      n.receiveShadow = true;

      const g = n.geometry;
      if (g) {
        g.computeBoundingBox();
        g.computeBoundingSphere();
        const idx = g.index ? g.index.count : (g.attributes?.position?.count || 0);
        ucgen += Math.floor(idx / 3);
      }

      const m = n.material;
      if (m) {
        const liste = Array.isArray(m) ? m : [m];
        for (const mm of liste) {
          malzemeler.add(mm);
          // Doku varsa renklendirme uygulanmamalı
          const dokulu = !!(mm.map || mm.normalMap || mm.emissiveMap || mm.aoMap ||
            mm.roughnessMap || mm.metalnessMap);
          mm.userData = mm.userData || {};
          mm.userData.tintable = !dokulu;
        }
      }
      n.userData.tintable = !malzemeSayisi || (malzemeSayisi === 0 && !malzemeler.size);
      // mesh düğümünde tintable'ı doku durumuna göre ayarla
      const ilkMalzeme = Array.isArray(m) ? m[0] : m;
      const dokulu = ilkMalzeme && !!(ilkMalzeme.map || ilkMalzeme.normalMap);
      n.userData.tintable = !dokulu;
      malzemeSayisi = Math.max(malzemeSayisi, Array.isArray(m) ? m.length : (m ? 1 : 0));
    });

    // --- gerçek sınır kutusu -------------------------------------------
    // Kuantize modellerde manifest'teki min/max dünya birimi DEĞİLDİR;
    // bu yüzden daima modeli ölçerek hesaplanır.
    const box = new THREE.Box3().setFromObject(kok);
    if (box.isEmpty()) {
      box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
    }
    const size = new THREE.Vector3();
    const merkez = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(merkez);

    const stats = {
      ucgen: kayit.sinirGuvenilir && kayit.ucgen ? kayit.ucgen : ucgen,
      kose: kayit.kose || 0,
      mesh: meshSayisi,
      malzeme: malzemeler.size,
      doku: kayit.doku || 0,
      animasyon: (gltf.animations || []).length,
      kemik: (gltf.skins || []).length,
      boyut: [size.x, size.y, size.z].map((n) => Math.round(n * 1000) / 1000),
      merkez: [merkez.x, merkez.y, merkez.z].map((n) => Math.round(n * 1000) / 1000),
      yukseklik: Math.round(size.y * 1000) / 1000,
      // Animasyonlar editörde oynatılmaz ama kayıtta bilgi olarak durur
      animasyonAdlari: (gltf.animations || []).map((a) => a.name).filter(Boolean).slice(0, 8),
    };

    kok.userData.imported = {
      id: kayit.id,
      ad: kayit.ad,
      kategori: kayit.kategori,
      url: kayit.url,
      stats,
      boyut: kayit.boyut,
    };

    return { object: kok, box, stats, boyut: kayit.boyut };
  }

  /**
   * Yeni nesne örneği üretir.
   *
   * Geometri ve malzemeler ÖRNEKLER ARASI PAYLAŞILIR. Bu bilinçli bir
   * seçimdir: 1390 modelden 200 tanesini sahneye koyduğunuzda bellek
   * 200 dosya değil 200 model değil, model başına 1 kopya olur.
   * @param {string} assetId
   * @returns {Promise<{root:THREE.Group, box:THREE.Box3, stats:Object}>}
   */
  async instantiate(assetId) {
    const { object, box, stats } = await this.load(assetId);
    const kok = object.clone(true);

    // clone() materyalleri de klonlar; biz paylaşmak istiyoruz.
    kok.traverse((n) => {
      if (!n.isMesh) return;
      const kaynak = object.getObjectByName(n.name);
      if (kaynak?.material) n.material = kaynak.material;
      n.userData.tintable = kaynak?.userData?.tintable;
    });

    const root = new THREE.Group();
    root.name = object.name || assetId;
    root.add(kok);
    root.userData.grounded = true;
    root.userData.imported = { ...object.userData.imported, box: box.clone() };
    return { root, box, stats };
  }

  /** LRU taşmasını temizler. */
  _cacheTemizle() {
    while (this._cache.size > this._cacheLimit) {
      const enEski = this._cache.keys().next().value;
      const kayit = this._cache.get(enEski);
      this._cache.delete(enEski);
      // Geometri paylaşıldığı için burada dispose ETMEYİZ: sahnede başka
      // örnekler kullanıyor olabilir. Yalnızca referansı bırakıyoruz.
      void kayit;
    }
  }

  /** Bir modeli önbellekten düşürür. */
  evict(assetId) {
    this._cache.delete(assetId);
  }

  /** Tüm önbelleği boşaltır. */
  clearCache() {
    this._cache.clear();
  }

  /** KTX2 çözücü hazır mı? (KTX2 dokulu modeller yüklenebilir mi?) */
  get ktx2Hazir() {
    return !!this._ktx2;
  }

  /** Tanılama bilgisi. */
  tani() {
    return {
      status: this.status,
      error: this.error,
      model: this.entries.size,
      kategori: this.categories.length,
      onbellek: this._cache.size,
      ktx2: this.ktx2Hazir,
      kaynak: this.manifest?.kaynak || null,
      uretim: this.manifest?.uretimZamani || null,
    };
  }
}
