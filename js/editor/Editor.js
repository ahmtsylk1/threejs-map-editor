/**
 * Editor.js
 * ---------------------------------------------------------------------------
 * UYGULAMA ORKESTRATÖRÜ.
 *
 * Tüm modülleri birbirine bağlar:
 *
 *   Store ──(olaylar)──> Topbar / Outliner / Inspector / StatusBar
 *     │
 *     ├── ObjectRegistry : id -> Object3D
 *     ├── Viewport       : renderer, kamera, ışık, yörünge kontrolleri
 *     ├── GridSystem     : zemin, ızgara, sınır (harita boyutuna duyarlı)
 *     ├── SelectionManager : raycast, hover, seçim kutuları
 *     ├── TransformTool  : gizmo (taşı/döndür/ölçek, çoklu seçim pivotu)
 *     ├── History        : geri al / ileri al
 *     ├── NPCSystem      : önizleme simülasyonu
 *     └── ProjectIO      : JSON dışa/içe aktarma, tarayıcı kaydı
 *
 * Temel kural: kalıcı veri Store'dadır; sahne nesneleri bu verinin bir
 * GÖRÜNTÜSÜdür. Bu yüzden "kayıt güncelle" ile "sahne nesnesi güncelle"
 * işlemleri ayrıdır (aşağıdaki _syncRecordToObject / _syncObjectToRecord).
 */
import * as THREE from 'three';

import { Store, EVENT, CELL_SIZES } from '../core/Store.js';
import { ObjectRegistry } from '../core/ObjectRegistry.js';
import { Viewport, disposeObject } from '../scene/Viewport.js';
import { GridSystem } from '../scene/GridSystem.js';
import { SelectionManager } from '../scene/SelectionManager.js';
import { TransformTool } from '../scene/TransformTool.js';
import { History } from './History.js';
import { AssetPanel } from './AssetPanel.js';
import { Outliner } from './Outliner.js';
import { Inspector } from './Inspector.js';
import { Topbar } from './Topbar.js';
import { StatusBar } from './StatusBar.js';
import { NPCSystem } from '../game/NPCSystem.js';

import {
  createAssetObject, createImportedPlaceholder,
  applyColor, applyShadows, applyProps, findFirstMesh, attachGeometry,
} from '../assets/AssetFactory.js';
import { getAsset, getAssetName, getAssetColor, getDefaultProps } from '../assets/catalog.js';

import {
  buildProject, downloadProject, validateProject, readFile,
  saveToStorage, loadFromStorage, clearStorage, hasStorageSave,
} from '../io/ProjectIO.js';

/* ---- Dosya içe aktarma: .npy (heightmap) ve .smd (Valve modeli) ---- */
import { ExternalAssetCache, EXT } from '../io/ExternalAssets.js';
import { TerrainSystem, describeField, fieldToAscii, MAX_TERRAIN_SEGMENTS } from '../io/TerrainSystem.js';
import { ImportRouter, classify, describe, ACCEPT_ATTRIBUTE, DROP_HINT, IMPORTERS } from '../io/ImportRouter.js';
import { parseNpyFile } from '../io/NPYParser.js';
import { importSmdGeometry, parseSmd, smdToBufferGeometry, validateSmdModel } from '../io/SMDParser.js';
import { parseBinaryGridFile, describeGrid } from '../io/BinaryGridParser.js';
import {
  ImportedAssetLibrary, isImportedId, toRuntimeId, IMPORT_PREFIX, MANIFEST_URL,
} from '../io/ImportedAssetLibrary.js';

import { qs, toast, toastKey, openModal, uid, ICONS } from '../utils/dom.js';
import { i18n } from '../core/I18nManager.js';
import { n } from '../i18n/format.js';
import { DEG2RAD, clamp, snapTo, clean } from '../utils/math.js';

const AUTOSAVE_DELAY = 2500;

/**
 * Dış model kitaplığının yüklenmesi için üst sınır (ms).
 *
 * Manifest normalde ~15 ms'de gelir. Bu sınır yalnızca ağ takılırsa /
 * sunucu cevap vermezse ilk yüklemeyi kilitlememek içindir; süre dolunca
 * `_bootstrap()` ZORLA çalışır ve kitaplık olmadan da editör açılır.
 */
const KUTUPHANE_ZAMAN_ASIMI = 3000;

/**
 * Arazi prop güncellemesi için emniyet gecikmesi (ms).
 *
 * Toplama birincil olarak rAF ile yapılır; bu değer yalnızca kare üretimi
 * durduğunda devreye giren yedek yoldur. Bir kare ~16 ms sürdüğü için 90 ms,
 * görünür sekmede hiç işletilmezken bile "kullanıcı değişikliği gördü" eşiğinin
 * çok üstünde değildir. Daha kısa seçilirse toplama zayıflar (her sürükleme
 * olayı ayrı bir yeniden hesaplama tetikler), daha uzun seçilirse güncelleme
 * gözle görülür biçimde gecikmiş görünür.
 *
 * Ayrıntılı gerekçe: `_requestTerrainSync()` yorumu.
 */
const TERRAIN_SYNC_EMNIYET_MS = 90;

/** Geçici matrisler (sıcak yolda allocation yapmamak için). */
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _box = new THREE.Box3();

/** HTML kaçışı (yardım penceresindeki kod örnekleri için). */
function escapeHtml(text) {
  return String(text).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

export class Editor {
  constructor() {
    /* ---------------- Çekirdek ---------------- */
    this.store = new Store();
    this.registry = new ObjectRegistry();
    this.viewport = new Viewport(qs('#scene-canvas'));
    this.grid = new GridSystem(this.viewport.scene, this.store.map.size, this.store.map.cellSize);
    this.grid.setRenderer(this.viewport.renderer);
    this.history = new History(this.store);
    this.selection = new SelectionManager(this.viewport, this.store, this.registry);
    this.transform = new TransformTool(this.viewport, this.store, this.history, this.registry);
    this.npcs = new NPCSystem(this.store, this.registry);

    /* ---------------- Dosya içe aktarma (.npy / .smd / .json) ----------------
         Ağır ikili veri Store DIŞINDA tutulur (bkz. ExternalAssets.js).
         Böylece History anlık görüntüleri küçük kalır, JSON şişmez.        */
    this.external = new ExternalAssetCache();
    this.terrain = new TerrainSystem(this.store, this.registry, this.external);
    this.importer = new ImportRouter({
      loadJson: (file) => this._handleJsonFile(file),
      loadNpy: (file, ctx) => this.importHeightmap(file, ctx),
      loadSmd: (file, ctx) => this.importSmdModel(file, ctx),
      loadModel3d: (file, ctx) => this.importModel3d(file, ctx),
      loadBinaryGrid: (file, ctx, sniff) => this.importBinaryGrid(file, ctx, sniff),
      onProgress: (p) => this._onImportProgress(p),
    });

    /* ---------------- Dış model kitaplığı (imported-assets.json) ----------
       Dış projelerden taranan glTF/GLB/OBJ modelleri. Yükleme ASENKRON
       olduğu için editör çalışmaya devam eder; panel hazır olunca kendini
       yeniler. Kütüphane yoksa da sorun değildir — kategori boş kalır.    */
    this.importedLib = new ImportedAssetLibrary(this.viewport.renderer);

    /* ---------------- Arayüz ---------------- */
    this.topbar = new Topbar(this.store, this._topbarHandlers());
    this.assetPanel = new AssetPanel(this.store, {
      onAdd: (id, pos) => this.addAsset(id, pos),
      library: this.importedLib,
    });
    this.outliner = new Outliner(this.store, this._outlinerHandlers());
    this.inspector = new Inspector(this.store, this.history, this._inspectorHandlers());
    this.status = new StatusBar(this.store, this.viewport);
    this._bindMapPanel();

    /* ---------------- Başlangıç durumu ---------------- */
    this._autosaveTimer = null;
    this._dropPreview = null;
    /** @type {Map<string, Promise>} nesne kimliği → paylaşılan model veri sözü */
    this._importedYuklemeler = new Map();
    /** @type {Set<string>} şu anda bağlanan düğümler (özyineleme kilidi) */
    this._importedBaglanan = new Set();

    this._bindStore();
    this._bindViewport();
    this._bindDropZone();
    this._bindKeys();
    this._bindResizers();
    this._bindImportInput();

    // NOT: `_bootstrap()` `start()` içinden, kütüphane YÜKLENDİKTEN SONRA
    // çağrılır. Nedeni aşağıda `start()` yorumunda.
  }

  /* =======================================================================
     BAŞLATMA
     ======================================================================= */
  start() {
    this.viewport.start();
    this.status.sync();

    /*
     * SIRA ÖNEMLİ: önce kütüphane, sonra ilk yükleme (bootstrap).
     *
     * `_bootstrap()` otomatik kaydı geri yükler. Kayıt `imp:` kimlikli dış
     * modeller içerebilir ve bunlar manifest'ten çözülür. Kütüphane
     * yüklenmeden önce geri yükleme yapılırsa `entries` boş olduğu için
     * her dış model "Kitaplıkta bu model yok" hatası verir — kullanıcı
     * sayfayı yenilediğinde kaybettiği modelleri görürdü.
     *
     * Render döngüsü hemen başlar (beyaz ekran olmaz); yalnızca veri
     * kurulumu manifest'i bekler. Manifest yoksa `init()` 404'te hemen
     * çözülür, yani editör yine anında açılır. Ağ takılırsa da `_bootstrap`
     * `KUTUPHANE_ZAMAN_ASIMI` sonunda ZORLA çalışır.
     */
    const hazir = this._loadImportedLibrary()
      .catch((e) => {
        console.warn('[IMPORT] kitaplık yüklenemedi, normal devam:', e.message);
        return null;
      })
      .then(() => this._bootstrap());

    this._firstLoad = Promise.race([
      hazir,
      new Promise((r) => setTimeout(r, KUTUPHANE_ZAMAN_ASIMI)),
    ]);
    return this;
  }

  /**
   * Dış model kitaplığını yükler ve AssetPanel'i tazeler.
   *
   * Hata TOLERANSLI: manifest yoksa (kullanıcı `scan-assets.mjs`
   * çalıştırmamışsa) veya okunamazsa editör NORMAL şekilde çalışmaya
   * devam eder. Bir asset kitaplığı eksikliği editörü kullanılamaz hale
   * getirmemelidir.
   *
   * @returns {Promise<Object>} kütüphane tanısı
   */
  async _loadImportedLibrary() {
    const sonuc = await this.importedLib.init({ manifestUrl: MANIFEST_URL });

    if (sonuc.status === 'ready') {
      this.assetPanel.render();
      console.info(
        `[IMPORT] "${this.importedLib.manifest?.kaynak || 'kitaplık'}" → ` +
        `${sonuc.count} model, ${this.importedLib.categories.length} kategori` +
        (this.importedLib.ktx2Hazir ? '' : '  ·  ⚠ KTX2 dokuları yüklenemeyecek')
      );
    } else if (sonuc.status === 'empty') {
      console.info('[IMPORT] Dış model kitaplığı bulunamadı (normal). Yüklemek için: node tools/scan-assets.mjs');
    } else {
      console.warn('[IMPORT] Kitaplık okunamadı:', sonuc.error);
    }
    return this.importedLib.tani();
  }

  _bootstrap() {
    // Son kaydı geri yükle
    if (hasStorageSave()) {
      const raw = loadFromStorage();
      if (raw) {
        const result = validateProject(raw);
        if (result.ok) {
          this.store.setMap(result.project.map);
          this._loadProject(result.project, true);
          this.status.sync();
          toastKey('load.restored', 'ok');
          return;
        }
      }
      clearStorage();
    }

    this.store.setMap({});
    this.viewport.frameMap(this.store.map.size, true);
    this.transform.attach([]);
    this.status.sync();
  }

  /* =======================================================================
     STORE -> UI
     ======================================================================= */
  _bindStore() {
    const s = this.store;

    // Kayıt güncellendiğinde sahne nesnesini tazele (gizmo hariç: o zaten taşındı)
    s.on(EVENT.OBJECT_UPDATE, ({ record, patch, source }) => {
      if (source !== 'gizmo') this._syncRecordToObject(record, Object.keys(patch || {}));
    });

    // Toplu değişimler: sahneyi yeniden kur
    s.on(EVENT.OBJECT_ADD, (record) => this._createObjectFor(record));
    s.on(EVENT.OBJECT_REMOVE, (records) => {
      for (const record of records) this._removeObjectFor(record.id);
    });
    s.on(EVENT.OBJECTS_REPLACE, () => this._rebuildScene());

    // Seçim -> gizmo bağla
    s.on(EVENT.SELECTION_CHANGE, () => {
      this.transform.attach();
      this.outliner.reveal(s.selection[0]);
    });

    // Harita ayarı -> grid + kamera
    s.on(EVENT.MAP_CHANGE, (map) => {
      this.grid.applyMap(map);
      this.transform.setSnap(map.snap ? map.cellSize : null);
      this._syncMapPanel();
      this._scheduleAutosave();
    });

    // Önizleme
    s.on(EVENT.PLAY_CHANGE, (playing) => this._setPlaying(playing));

    // Toast yönlendirmesi
    s.on(EVENT.TOAST, ({ message, kind }) => toast(message, kind));

    this._scheduleAutosave();
  }

  /* =======================================================================
     KAYIT <-> SAHNE NESNESİ
     ======================================================================= */

  /**
   * Yeni bir kayıt için sahne nesnesi üretir ve sahneye ekler.
   *
   * İçe aktarılan içerik için (terrain / importedMesh) üretilen yer tutucu
   * asset hemen ardından gerçek veriyle değiştirilir.
   */
  _createObjectFor(record) {
    // Dış kitaplık modeli: statik katalogda yok, kendi yer tutucusunu kurar
    const object = isImportedId(record.assetId)
      ? createImportedPlaceholder()
      : createAssetObject(record.assetId);
    this.registry.set(record.id, object);
    this.viewport.content.add(object);
    this._syncRecordToObject(record);
    this._reapplyExternalData(record);
    return object;
  }

  /**
   * `ExternalAssetCache` içindeki ağır veriyi sahne nesnesine bağlar.
   * Undo/redo, JSON import ve harita boyutu değişiminden sonra çağrılır.
   * @param {Object} record
   */
  _reapplyExternalData(record) {
    if (record.assetId === 'terrain') {
      const has = !!this.external.payload(record.id);
      this.terrain.rebuild(record.id);
      if (!has) {
        // Veri yoksa (ör. JSON'dan yalnızca önizlemeyle geldi) kullanıcı bilgilendirilir
        this.store.emit('terrain:placeholder', record.id);
      }
      return;
    }
    if (record.assetId === 'importedMesh') {
      this._applyImportedMesh(record.id);
      return;
    }
    if (isImportedId(record.assetId)) {
      this._applyImportedModel(record.id);
    }
  }

  /**
   * Dış kitaplık modelinin GEOMETRİSİNİ sahne nesnesine bağlar.
   *
   * Yükleme asenkrondur; çağıran yol (undo/redo, JSON import, panel sürükle)
   * senkron kalmaya devam eder. Yükleme bitince:
   *   - yer tutucu kaldırılır, asıl model `object`'e eklenir,
   *   - taban zemine oturtulur (`tabanDuzelt`),
   *   - gerçek ölçüler kayda yazılır (Inspector'da görünür).
   *
   * Aynı nesne için tekrar çağrılırsa (undo/redo) yalnızca mevcut yükleme
   * kullanılır — dosya ikinci kez indirilmez.
   *
   * YARIŞ KORUMASI
   * --------------
   * Uçuş halindeki yükleme bir PAYLAŞILAN veri sözü döndürür; düğüme bağlama
   * işlemi söz çözülünce ve O ANDA registry'de bulunan nesneye yapılır.
   * Böylece yükleme sürerken sahne yeniden kurulursa (`_rebuildScene`)
   * sonuğu kopmuş/ekrandan kaldırılmış bir düğüme bağlamak yerine geçerli
   * nesneye gider. (Kaydı yakalayıp doğrudan bağlamak bu hataya yol açar.)
   *
   * @param {string} objectId
   * @returns {Promise<boolean>} yerleştirildi mi
   */
  async _applyImportedModel(objectId) {
    const record = this.store.getRecord(objectId);
    const object = this.registry.getObject(objectId);
    if (!record || !object) return false;

    const assetId = record.assetId;

    // Zaten yüklenmişse yalnızca yeniden bağla (ölçek/ölçü değişimi)
    if (object.userData.importedReady && object.userData.importedPayload) {
      this._bindImportedGeometry(object, object.userData.importedPayload, this.store.getRecord(objectId));
      return true;
    }

    if (!this._importedYuklemeler) this._importedYuklemeler = new Map();

    // 1) veri sözü: uçuşta varsa paylaş, yoksa başlat
    let veriSozu = this._importedYuklemeler.get(objectId);
    if (!veriSozu) {
      veriSozu = this.importedLib
        .instantiate(assetId)
        .finally(() => this._importedYuklemeler.delete(objectId));
      this._importedYuklemeler.set(objectId, veriSozu);
    }

    // 2) çözüldüğünde GÜNCEL düğüme bağla
    let payload;
    try {
      payload = await veriSozu;
    } catch (err) {
      // Bu kayıt hâlâ sahnede mi? Yoksa (silinmiş/geri alınmış) sessiz çık.
      const canli = this.registry.getObject(objectId);
      if (!canli) return false;
      console.error('[IMPORT] model yüklenemedi:', err);
      toastKey('msg.model.failed', 'error', { ad: this.store.getRecord(objectId)?.name || 'Model', hata: err.message }, 7000);
      canli.userData.importedError = err.message;
      const mevcut = this.store.getRecord(objectId);
      if (mevcut) {
        this.store.patchRecord(objectId, {
          props: { ...mevcut.props, not: `Yüklenemedi: ${err.message}` },
        });
      }
      return false;
    }

    // Sahne bu arada yeniden kurulmuş olabilir → güncel düğümü kullan
    const canli = this.registry.getObject(objectId);
    if (!canli) return false;
    if (canli.userData.importedReady) return true;

    const mesh = findFirstMesh(canli);
    const kok = payload.root;

    /*
     * NORMALİZASYON — model SAHNEDEN ÖNCE, saf yerel uzayda.
     *
     * Modeli önce `canli`'ye eklersek `Box3.setFromObject(kok)` DÜNYA
     * kutusunu döndürür (bayat/eskimiş `matrixWorld` üzerinden) ama biz yerel
     * `kok.position` ile düzeltme yapıyoruz — sonuç yanlış yerleşim olur.
     * Parent'ı olmayan bir düğümde ölçmek yerel uzayı verir ve `kok.position`
     * doğrudan doğru kaydırmadır.
     *
     * Ayrıca ZATEN kaydırılmış bir model üzerinde tekrar ölçmek kendine göre
     * kaydırma demektir; bu yüzden işlem yalnızca bir kez yapılır.
     */
    if (this.store.getRecord(objectId)?.props?.tabanDuzelt !== false && !payload.normalizeEdildi) {
      kok.updateMatrixWorld(true);
      const icBox = new THREE.Box3().setFromObject(kok);
      if (!icBox.isEmpty()) {
        kok.position.x -= (icBox.min.x + icBox.max.x) / 2;
        kok.position.z -= (icBox.min.z + icBox.max.z) / 2;
        kok.position.y -= icBox.min.y;
        payload.normalizeEdildi = true;
      }
    }

    /*
     * Yer tutucuyu SAHNEDEN KALDIR, asıl modeli doğrudan `object`'e ekle.
     *
     * Neden gizlemek yetmez: three.js'te `visible = false` bir düğümün
     * TÜM çocuklarını da gizler; model yer tutucunun çocuğu olduğu için
     * görünmez olurdu.
     *
     * Neden kaldırmak gerekir: yer tutucunun geometrisi BOŞTUR (`position`
     * niteliği yok). three.js frustum culling her karede
     * `geometry.computeBoundingSphere()` çağırır; boş geometride
     * min=+Inf / max=-Inf olduğundan merkez NaN olur ve tarayıcı saniyede
     * yüzlerce kez "Computed radius is NaN" uyarısı basar. Sahneden
     * çıkarmak hem uyarıyı hem de boş geometriyi de ortadan kaldırır.
     *
     * `findFirstMesh(object)` artık asıl modelin mesh'ini döndürür; ölçüm,
     * gölge ve Inspector yolları değişmeden çalışır.
     */
    if (mesh) {
      mesh.geometry?.dispose();
      mesh.removeFromParent();
    }
    canli.add(kok);
    canli.userData.importedPayload = payload;
    canli.userData.importedReady = true;

    this._bindImportedGeometry(canli, payload, this.store.getRecord(objectId));
    return true;
  }

  /**
   * Yüklenen modeli kayda bağlar: ölçek, taban oturtma, ölçü yazma, gölge.
   *
   * ÖLÇEK POLİTİKASI
   * ----------------
   * Kitaplık modelleri YARD/metre ölçeğinde yazılmıştır (ölçülen medyan
   * ~1.2 birim: bir kalkan 0.88, bir sütun 1.5×4×1.5). Bu haritada 1 birim
   * bir ızgara hücresidir; kullanıcı "Hedef Yükseklik" alanına sayı girerek
   * modeli istediği ölçeğe getirir. `0` (varsayılan) = 1:1, hiçbir şey
   * değiştirilmez.
   *
   * Sessizce ölçeklemek SEÇİLMEDİ: kullanıcı "modelim neden 3 kat büyük?"
   * sorusunu sormadan ölçek değiştirmek, ölçeğe duyarlı yerleşim yapan
   * projelerde (düşman çarpışma kutuları, kapı boşlukları) hataya yol açar.
   *
   * @private
   */
  _bindImportedGeometry(object, payload, record) {
    if (!payload?.root) return;
    const { stats } = payload;

    /*
     * ÖZYİNELEME KORUMASI
     * -------------------
     * Bu fonksiyon `store.patchRecord()` çağırır; o da `OBJECT_UPDATE`
     * yayar; o da `_syncRecordToObject` → `_refreshImportedFit` →
     * yine bu fonksiyona döner. `patchRecord` props nesnesinin tamamını
     * gönderdiği için "değişiklik var mı" sorusu nesne kimliğiyle
     * yanıtlanamaz. Bu yüzden:
     *   1) bağlama sırasında nesne KİLİTLENİR (yeniden giriş engellenir),
     *   2) yazma yalnızca değer GERÇEKTEN farklıysa yapılır.
     * İkisi birlikte hem döngüyü kırar hem de gereksiz olay üretmez.
     */
    if (!this._importedBaglanan) this._importedBaglanan = new Set();
    if (this._importedBaglanan.has(object.uuid)) return;
    this._importedBaglanan.add(object.uuid);

    try {
      /*
       * 1) Normalizasyon `_applyImportedModel` içinde, model sahneye
       *    EKLENMEDEN ÖNCE yapılır (saf yerel uzayda ölçmek için).
       *    Burada yalnızca ölçek ve ölçü güncellenir; konum KAYDIRILMAZ —
       *    yoksa model her props değişiminde biraz daha öte gider.
       */

      // 2) hedef yüksekliğe sığdır (kaydın scale'ini günceller)
      const mevcut = this.store.getRecord(record?.id);
      if (mevcut) {
        const hedef = Number(mevcut.props?.hedefYukseklik) || 0;
        const k = (hedef > 0 && stats.yukseklik > 0) ? hedef / stats.yukseklik : null;

        /*
         * Hangi ölçek kime ait?
         * ---------------------
         * `payload.hedefCarpan`, bu öZELLİĞİN uyguladığı son çarpandır.
         *   - hedef > 0        → çarpanı uygula, hatırla
         *   - hedef 0, çarpan vardı → yalnızca BU çarpanı geri al (1:1)
         *   - hedef 0, çarpan yok → kullanıcının ELLE verdiği ölçeğe dokunma
         *
         * Basit bir "ilk bağlamada mıydı" bayrağı kullanmak YANLIŞ olurdu:
         * kullanıcı Scale alanından elle 2× yaptıktan sonra başka bir props
         * alanı değiştirdiğinde ölçeği 1:1'e sıfırlardı.
         */
        let yeniOlcek;
        if (k !== null) {
          payload.hedefCarpan = k;
          yeniOlcek = [k, k, k];
        } else if (payload.hedefCarpan !== null && payload.hedefCarpan !== undefined) {
          yeniOlcek = [1, 1, 1];
          payload.hedefCarpan = null;
        } else {
          yeniOlcek = mevcut.scale;
        }

        // 3) ölçülen (ölçeklenmiş) yüksekliği kaydet + tabanı zemine oturt
        const olcek = yeniOlcek[0] || 1;
        const gercekYukseklik = Math.round((stats.yukseklik || 0) * olcek * 100) / 100;
        const hedefY = mevcut.props?.tabanDuzelt !== false ? 0 : mevcut.position[1];

        // yalnızca gerçekten değiştiyse yaz
        const olcekDegisti = mevcut.scale[0] !== yeniOlcek[0] ||
          mevcut.scale[1] !== yeniOlcek[1] || mevcut.scale[2] !== yeniOlcek[2];
        const yukseklikDegisti = mevcut.props?.yukseklik !== gercekYukseklik;
        const yDegisti = mevcut.position[1] !== hedefY;

        if (olcekDegisti || yukseklikDegisti || yDegisti) {
          this.store.patchRecord(mevcut.id, {
            ...(yDegisti ? { position: [mevcut.position[0], hedefY, mevcut.position[2]] } : {}),
            ...(olcekDegisti ? { scale: yeniOlcek } : {}),
            ...(yukseklikDegisti
              ? { props: { ...mevcut.props, yukseklik: gercekYukseklik } }
              : {}),
          });
        }
      }

      // 4) gölge + malzeme
      applyShadows(object, true, true);

      // 5) tanılayıcı bilgi
      object.userData.imported = {
        ...(object.userData.imported || {}),
        stats,
        yukseklik: stats.yukseklik,
      };
    } finally {
      this._importedBaglanan.delete(object.uuid);
    }
  }

  /**
   * Yalnızca ölçek/ölçü değiştiğinde yeniden uygular (model tekrar İNDİRİLMEZ).
   * @private
   */
  _refreshImportedFit(record) {
    const object = this.registry.getObject(record?.id);
    const payload = object?.userData.importedPayload;
    if (!object || !payload) return false;
    this._bindImportedGeometry(object, payload, record);
    return true;
  }

  /**
   * Cache'teki SMD BufferGeometry'sini nesneye bağlar.
   * @param {string} objectId
   * @returns {boolean} bağlandı mı
   */
  _applyImportedMesh(objectId) {
    const record = this.store.getRecord(objectId);
    const object = this.registry.getObject(objectId);
    if (!record || !object) return false;

    const payload = this.external.payload(objectId);
    if (!payload) return false;

    // JSON'dan yalnızca metin gelmiş olabilir -> yeniden ayrıştır
    let geometry = payload.geometry;
    if (!geometry && typeof payload.text === 'string') {
      try {
        geometry = smdToBufferGeometry(parseSmd(payload.text, { convert: record.props?.convertSource ? 'source' : 'none' }), {
          convert: record.props?.convertSource ? 'source' : 'none',
        });
        payload.geometry = geometry;
        payload.model = parseSmd(payload.text);
      } catch (err) {
        console.error('[SMD] yeniden ayrıştırma başarısız:', err);
        return false;
      }
    }
    if (!geometry) return false;

    attachGeometry(object, geometry, { disposePrevious: true });
    this._fitImportedMesh(object, record);
    return true;
  }

  /**
   * İçe aktarılan mesh'i yer tabanına oturtur ve makul boyuta getirir.
   * Kayıt dönüşümü DÜNYA uzayındadır; geometri yerel olduğu için ofset
   * mesh'in kendi AABB'sine göre hesaplanır.
   */
  _fitImportedMesh(object, record) {
    const mesh = findFirstMesh(object);
    if (!mesh?.geometry) return;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    // Merkez kaydırma: mesh'in alt-orta noktasını kayıt konumuna getir
    const center = box.getCenter(new THREE.Vector3());
    mesh.geometry.translate(-center.x, -box.min.y, -center.z);
  }

  _removeObjectFor(id) {
    const entry = this.registry.get(id);
    if (!entry) return;
    // Silinen nesne gizmoya bağlıysa önce bırak: nesne sahneden çıkarılınca
    // (parent === null) TransformControls her karede uyarı basar.
    if (this.transform.controls.object === entry.object) this.transform.detach();
    this.viewport.content.remove(entry.object);
    disposeObject(entry.object);
    this.registry.remove(id);
    // DİKKAT: `this.external.delete(id)` BURADA ÇAĞRILMAZ.
    // Geri alma (undo) aynı id'li kaydı yeniden oluşturur; veri silinmiş
    // olsaydı geri alınan arazi düz bir düzleme dönerdi. Süpürme işi
    // `_rebuildScene` içindeki `external.gc()` ile, geri alma penceresi
    // dolduktan sonra yapılır. Bkz. ExternalAssets.js.
    this.npcs.forget(id);
    this.selection.refreshVisual(id);
  }

  /** Tüm sahne nesnelerini kayıtlardan yeniden üretir. */
  _rebuildScene() {
    this.transform.detach();
    this.selection.clearVisuals();
    this.registry.clear();
    this.npcs.reset();
    this.viewport.clear();
    for (const record of this.store.objects) this._createObjectFor(record);
    // Artık dış veriyi silme (undo penceresi kapatıldıysa temizlenir)
    this.external.gc(this.store.objects.map((r) => r.id));
    this.transform.attach();
  }

  /**
   * Kayıttaki değerleri sahne nesnesine yazar.
   * @param {Object} record
   * @param {string[]} [keys] Değişen alan adları. Boşsa tam senkronizasyon yapılır.
   *
   * NOT: Gizmo sürüklemesi sırasında konum kare kare güncellenir; her seferinde
   * tüm ağacı gezip renk/gölük/ışık yeniden uygulamak pahalı olurdu. Bu yüzden
   * yalnızca GERÇEKTEN değişen alanlar sahne nesnesine yansıtılır.
   */
  _syncRecordToObject(record, keys) {
    const object = this.registry.getObject(record.id);
    if (!object) return;

    if (!keys || !keys.length) {
      this._writeTransform(object, record);
      applyColor(object, record.color);
      applyShadows(object, record.castShadow !== false, record.receiveShadow !== false);
      applyProps(object, record.props || {});
      object.visible = record.visible;
      return;
    }

    if (keys.includes('position') || keys.includes('rotation') || keys.includes('scale')) {
      this._writeTransform(object, record);
    }
    if (keys.includes('color')) applyColor(object, record.color);
    if (keys.includes('castShadow') || keys.includes('receiveShadow')) {
      applyShadows(object, record.castShadow !== false, record.receiveShadow !== false);
    }
    if (keys.includes('props')) {
      applyProps(object, record.props || {});
      // Arazi özel alanları geometriyi etkiler. HANGİ alanın değiştiğini
      // TerrainSystem kendi anlık görüntüsüyle hesaplar (props nesnesi
      // her seferinde tamamen yeniden oluşturulduğu için buradan güvenilir
      // bir fark üretilemez) — bu yüzden anahtar listesi GÖNDERİLMEZ.
      if (record.assetId === 'terrain') this._requestTerrainSync(record.id);
      // Dış model: hedef yükseklik / taban oturtma değişiklikleri ölçeği
      // ve yerleşimi etkiler. Model YÜKLÜYSE yalnızca yeniden ölçülür;
      // dosya ikinci kez indirilmez.
      if (isImportedId(record.assetId)) this._refreshImportedFit(record);
    }
    if (keys.includes('visible')) object.visible = record.visible;
  }

  /**
   * Arazi props güncellemesini bir sonraki kareye toplar.
   *
   * NEDEN? Inspector'da etiket kaydırılarak `heightScale` değiştirilirken her
   * `pointermove` bir `OBJECT_UPDATE` üretir. 257 bölümlü (66k köşe) bir
   * arazide normalleri yeniden hesaplamak kare başına onlarca ms sürer ve
   * sürüklemeyi akıcı olmaktan çıkarır. Bu yüzden istekler bir karede birleşir.
   *
   * Hangi alanın değiştiği TerrainSystem tarafından kendi anlık görüntüsüyle
   * hesaplanır; burada yalnızca "bu nesne güncellendi" sinyali taşınır.
   *
   * ---------------------------------------------------------------------------
   * GÜVENLİK AĞI — neden `setTimeout` da var?
   * ---------------------------------------------------------------------------
   * Toplama (batching) rAF'e bağlıydı. rAF ise YALNIZCA tarayıcı kare
   * üretirse tetiklenir. Kare üretimi şu durumlarda durur veya çok yavaşlar:
   *   - sekme arka planda (rAF tamamen durur),
   *   - kompozitör boşta (görünür sekmede bile kare üretimi kısıtlanabilir),
   *   - headless/dolguluk yazıcı ortamı (gerçek kare döngüsü hiç işlemez).
   *
   * Bu durumda güncelleme KUYRUĞDA kalır ve kullanıcı "kontrolüm çalışmıyor"
   * görür — oysa kontrol düzgün, sadece uygulanmamıştır. Daha kötüsü,
   * kullanıcı başka bir şeye dokununca kare gelir ve değişiklik ANIDEN
   * belirir. Bu, sessiz bir "kayıp güncelleme" hatasıdır.
   *
   * Çözüm: rAF birincil yol, `TERRAIN_SYNC_EMNIYET_MS` gecikmeli yedek yol.
   * Görünür sekmede rAF ~16 ms'de gelir ve yedeğe hiç uzanılmaz; sürükleme
   * sırasında da toplama bozulmaz. Kare üretimi durduğunda ise yedek
   * devreye girer ve güncelleme en geç ~90 ms'da uygulanır.
   */
  _requestTerrainSync(objectId) {
    if (!this._terrainDirty) this._terrainDirty = new Set();
    this._terrainDirty.add(objectId);
    if (this._terrainSyncTimer == null) {
      this._terrainSyncTimer = setTimeout(() => {
        this._terrainSyncTimer = null;
        this._flushTerrainSync();
      }, TERRAIN_SYNC_EMNIYET_MS);
    }
  }

  /**
   * Biriken arazi isteklerini uygular.
   *
   * Hem render döngüsünden (`frame` olayı) hem de emniyet zamanlayıcısından
   * çağrılabilir. İkinci çağrıda küme zaten boş olduğu için erken döner.
   */
  _flushTerrainSync() {
    if (!this._terrainDirty || this._terrainDirty.size === 0) return;
    for (const id of this._terrainDirty) this.terrain.syncProps(id);
    this._terrainDirty.clear();
    // rAF yolu geldiyse bekleyen emniyet zamanlayıcısını iptal et: gereksiz
    // kare ve boşuna bir `setTimeout` kalmasın.
    if (this._terrainSyncTimer != null) {
      clearTimeout(this._terrainSyncTimer);
      this._terrainSyncTimer = null;
    }
  }

  /**
   * Kayıt dönüşümünü sahne nesnesine yazar.
   *
   * Kayıttaki konum/rotasyon DAİMA dünya uzayındadır. Çoklu seçimde nesne
   * pivot'a bağlı olduğu için `TransformTool.setWorldTransform` üzerinden
   * yazılır; aksi halde dünya değeri yerel kutuya yazılır ve nesne iki kat
   * öte gider.
   */
  _writeTransform(object, record) {
    const e = new THREE.Euler(
      record.rotation[0] * DEG2RAD,
      record.rotation[1] * DEG2RAD,
      record.rotation[2] * DEG2RAD,
      'YXZ'
    );
    this.transform.setWorldTransform(
      object,
      _v.set(record.position[0], record.position[1], record.position[2]),
      _q.setFromEuler(e),
      _s.set(record.scale[0], record.scale[1], record.scale[2])
    );
  }

  /* =======================================================================
     NESNE EKLEME / SİLME
     ======================================================================= */

  /**
   * Asset listesinden nesne ekler.
   * @param {string} assetId
   * @param {THREE.Vector3|{x:number,y:number,z:number}|null} position
   *        null verilirse kameranın hedef noktası (Odakla) kullanılır.
   * @param {Object} [opts] { select, scale, color }
   * @returns {Object|null} oluşturulan kayıt
   */
  addAsset(assetId, position = null, opts = {}) {
    // Dış model kitaplığından gelen kimlikler ayrı yoldan geçer:
    // statik katalogda tanımlı değillerdir.
    if (isImportedId(assetId)) return this._addImportedAsset(assetId, position, opts);

    const meta = getAsset(assetId);
    if (!meta) {
      toastKey('msg.asset.unknown', 'error', { id: assetId });
      return null;
    }

    const pos = position
      ? new THREE.Vector3(position.x || 0, position.y || 0, position.z || 0)
      : this._dropAnchor();

    if (this.store.map.snap) {
      const step = this.store.map.cellSize;
      pos.set(snapTo(pos.x, step), Math.round(pos.y), snapTo(pos.z, step));
    }
    pos.y = Math.max(0, clean(pos.y, 3));

    const record = {
      id: uid('obj'),
      name: this._uniqueName(meta.name),
      assetId,
      category: meta.category,
      position: [clean(pos.x, 4), clean(pos.y, 4), clean(pos.z, 4)],
      rotation: [0, 0, 0],
      scale: opts.scale ? [opts.scale, opts.scale, opts.scale] : [1, 1, 1],
      visible: true,
      locked: false,
      color: opts.color || getAssetColor(assetId),
      castShadow: true,
      receiveShadow: true,
      tag: '',
      props: getDefaultProps(assetId),
    };

    this.history.begin(`${meta.name} ekle`);
    this.store.addRecord(record);
    this.history.commit();

    if (opts.select !== false) this.store.setSelection([record.id]);
    this.npcs.forget(record.id);
    return record;
  }

  /**
   * Sürükle-bırakla gelen glTF / GLB / OBJ dosyasını sahneye ekler.
   *
   * AYRI BİR YOL NEDEN?
   * `scan-assets.mjs` ile kopyalanmış modeller sunucudan URL ile yüklenir
   * ve projede kalıcıdır. Bırakılan dosya ise diskte durur, sunucuda karşılığı
   * YOKTUR. Bu yüzden:
   *   - `File` nesnesi doğrudan `loadFile()` ile çözülür,
   *   - sonuç kütüphaneye `imp:serbest_<ad>` olarak yazılır (tek yol kalır),
   *   - proje JSON'unda bu kimlik taşınır ama başka oturumda çözülemez;
   *     bu durum `_loadProject` içinde net bir mesajla karşılanır.
   *
   * @param {File} file
   * @param {Object} [context] { position }
   * @returns {Promise<Object>} oluşturulan kayıt
   */
  async importModel3d(file, context = {}) {
    // Önce dosyayı çöz: başarısızsa kayıt hiç oluşturulmaz.
    const yuklendi = await this.importedLib.loadFile(file);
    const assetId = yuklendi.object.userData.imported?.id;
    if (!assetId) {
      throw new Error('Model yüklendi ancak kimlik atanamadı.');
    }

    const kayit = this.importedLib.get(assetId);
    const stats = yuklendi.stats;

    const pos = context.position
      ? (context.position.isVector3 ? context.position : new THREE.Vector3(
          context.position.x || 0, context.position.y || 0, context.position.z || 0))
      : this._dropAnchor();

    if (this.store.map.snap) {
      const step = this.store.map.cellSize;
      pos.set(snapTo(pos.x, step), Math.round(pos.y), snapTo(pos.z, step));
    }

    const record = {
      id: uid('obj'),
      name: this._uniqueName(kayit?.ad || file.name),
      assetId,
      category: 'imported',
      position: [clean(pos.x, 4), clean(pos.y, 4), clean(pos.z, 4)],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      locked: false,
      color: '#ffffff',
      castShadow: true,
      receiveShadow: true,
      tag: 'imported',
      props: {
        source: file.name,
        url: null,
        kitapKategori: 'serbest',
        bicim: kayit?.bicim || 'glb',
        boyut: file.size,
        ucgen: stats.ucgen,
        kose: stats.kose,
        doku: stats.doku,
        animasyon: stats.animasyon,
        yukseklik: stats.yukseklik,
        tabanDuzelt: true,
        not: 'Bu dosya yalnızca bu oturumda geçerli (sunucuya kopyalanmadı).',
      },
    };

    this.history.begin(`${record.name} ekle`);
    this.store.addRecord(record);
    this.history.commit();
    this.store.setSelection([record.id]);

    toast(
      i18n.t('msg.gltf.loaded', {
        ad: file.name, ucgen: n(stats.ucgen), mesh: n(stats.mesh),
        kb: (file.size / 1024).toFixed(0),
      }) + (stats.animasyon ? i18n.t('msg.gltf.anim', { count: n(stats.animasyon) }) : ''),
      'ok', 5500
    );
    console.info(
      `[IMPORT3D] ${file.name}\n` +
      `  üçgen/köşe : ${stats.ucgen} / ${stats.kose}\n` +
      `  mesh       : ${stats.mesh}  malzeme: ${stats.malzeme}  doku: ${stats.doku}\n` +
      `  ölçü       : ${stats.boyut.join(' × ')}\n` +
      `  animasyon  : ${stats.animasyon}  kemik: ${stats.kemik}` +
      (stats.animasyonAdlari.length ? `\n  anim adları: ${stats.animasyonAdlari.join(', ')}` : '')
    );

    return record;
  }

  /**
   * Dış kitaplıktaki bir modeli sahneye ekler.
   *
   * AYRIM NEDEN GEREKLİ?
   * Model dosyası ASENKRON indirilir (bazıları 5 MB'a kadar ve sıkıştırılmış
   * çözümleme gerektirir). Bu yüzden:
   *   1. kayıt HEMEN oluşturulur (Store senkron kaldırılır, geri alma çalışır),
   *   2. `_createObjectFor` yer tutucu bir mesh koyar,
   *   3. yükleme bitince asıl geometri yerine geçer.
   * Bu desen `terrain` ve `importedMesh` ile aynıdır.
   *
   * @param {string} runtimeId "imp:dungeon_fence"
   * @returns {Object|null} kayıt (model henüz yüklenmemiş olabilir)
   */
  _addImportedAsset(runtimeId, position = null, opts = {}) {
    const kayit = this.importedLib.get(runtimeId);
    if (!kayit) {
      toastKey('msg.library.missing', 'error', { id: runtimeId.replace(IMPORT_PREFIX, '') });
      return null;
    }

    const pos = position
      ? new THREE.Vector3(position.x || 0, position.y || 0, position.z || 0)
      : this._dropAnchor();

    if (this.store.map.snap) {
      const step = this.store.map.cellSize;
      pos.set(snapTo(pos.x, step), Math.round(pos.y), snapTo(pos.z, step));
    }

    // Kuantize modellerde manifest sınırı anlamsız; gerçek yükseltik ancak
    // yükleme sonrası belli olur. Bu yüzden ilk konum 0'dan başlar ve
    // model yüklendiğinde tabanı zemine oturtulur.
    const record = {
      id: uid('obj'),
      name: this._uniqueName(kayit.ad),
      assetId: runtimeId,
      category: 'imported',
      position: [clean(pos.x, 4), clean(pos.y, 4), clean(pos.z, 4)],
      rotation: [0, 0, 0],
      scale: opts.scale ? [opts.scale, opts.scale, opts.scale] : [1, 1, 1],
      visible: true,
      locked: false,
      color: '#ffffff',
      castShadow: true,
      receiveShadow: true,
      tag: 'imported',
      props: {
        source: kayit.manifestId,
        url: kayit.url,
        kitapKategori: kayit.kategori,
        bicim: kayit.bicim,
        boyut: kayit.boyut,
        ucgen: kayit.ucgen,
        kose: kayit.kose,
        doku: kayit.doku,
        animasyon: kayit.animasyon,
        // gerçek ölçüler yükleme sonrası dolar
        yukseklik: 0,
        tabanDuzelt: opts.ground !== false,
        not: kayit.not || '',
      },
    };

    this.history.begin(`${kayit.ad} ekle`);
    this.store.addRecord(record);
    this.history.commit();

    if (opts.select !== false) this.store.setSelection([record.id]);
    this.npcs.forget(record.id);

    if (!kayit.meshVar) {
      toastKey('msg.library.nomesh', 'warn', { ad: kayit.ad }, 6000);
    }
    return record;
  }

  /** Yeni kayıt için benzersiz ad üretir: "Ağaç", "Ağaç 2", "Ağaç 3"... */
  _uniqueName(base) {
    const names = new Set(this.store.objects.map((o) => o.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  /** Ekleme noktası: kamera hedefi (fare ile sürükle-bırak hariç). */
  _dropAnchor() {
    const t = this.viewport.controls.target;
    return new THREE.Vector3(t.x, Math.max(0, t.y), t.z);
  }

  /** Seçili nesneleri siler. */
  removeSelected() {
    const list = this.records();
    if (!list.length) return;
    const locked = list.filter((r) => r.locked);
    const deletable = list.filter((r) => !r.locked);
    if (!deletable.length) {
      toastKey('msg.locked.delete', 'warn');
      return;
    }
    this.history.begin('sil');
    this.store.removeRecords(deletable.map((r) => r.id));
    this.history.commit();
    // `count` HER iki dalda da geçmeli: `.one`/çoğul seçimi `count`'a bakar,
    // değişken verilmezse düz anahtara düşülür ve "1 objects" gibi hatalı
    // bir biçim üretilebilirdi.
    this.store.toast(locked.length
      ? i18n.t('msg.deleted', { count: n(deletable.length) }) + ' · '
        + i18n.t('msg.deleted.locked', { count: n(locked.length) })
      : i18n.t('msg.deleted', { count: n(deletable.length) }), 'ok');
  }

  /** Seçili nesneleri çoğaltır (konum bir miktar kaydırılır). */
  duplicateSelected() {
    const list = this.records();
    if (!list.length) return;
    this.history.begin('çoğalt');
    const created = [];
    for (const record of list) {
      const clone = {
        ...record,
        id: uid('obj'),
        name: this._uniqueName(record.name.replace(/\s\d+$/, '')),
        position: [
          clean(record.position[0] + this.store.map.cellSize, 4),
          record.position[1],
          clean(record.position[2] + this.store.map.cellSize, 4),
        ],
        props: { ...(record.props || {}) },
      };
      this.store.addRecord(clone);
      created.push(clone);
    }
    this.history.commit();
    this.store.setSelection(created.map((r) => r.id));
    this.status.sync();
  }

  /** Görünürlüğü tersine çevirir. */
  toggleVisible(ids = this.store.selection) {
    if (!ids.length) return;
    this.history.begin('görünürlük');
    for (const id of ids) {
      const record = this.store.getRecord(id);
      if (record) this.store.patchRecord(id, { visible: !record.visible });
    }
    this.history.commit();
  }

  /** Kilidi tersine çevirir. */
  toggleLock(ids = this.store.selection) {
    if (!ids.length) return;
    this.history.begin('kilit');
    for (const id of ids) {
      const record = this.store.getRecord(id);
      if (record) this.store.patchRecord(id, { locked: !record.locked });
    }
    this.history.commit();
  }

  records() {
    return this.store.getSelectedRecords();
  }

  /* =======================================================================
     DÖNÜŞÜM YARDIMCILARI
     ======================================================================= */

  onResetTransform() {
    const list = this.records();
    if (!list.length) return;
    this.history.begin('dönüşüm sıfırla');
    for (const record of list) {
      this.store.patchRecord(record.id, { rotation: [0, 0, 0], scale: [1, 1, 1] });
    }
    this.history.commit();
  }

  /**
   * Seçili nesneleri zeminin üzerine oturtur.
   *
   * Doğru formül: `yeniY = mevcutY - box.min.y`
   * Kutu DÜNYA koordinatındadır ve alt sınırı (bottom) verir. Mevcut Y'den
   * alt sınırı çıkarırsak nesnenin altı tam olarak zemine (y=0) oturur.
   *
   * NOT: `object.position` YERELDİR; çoklu seçimde pivot'a bağlı olduğu için
   * pivot'a göre kaymalıdır. Bu yüzden yerel `object.position` KULLANILMAZ —
   * kayıttaki DÜNYA konumu esas alınır.
   */
  onSnapToGround() {
    const list = this.records();
    if (!list.length) return;
    this.history.begin('yere indir');
    for (const record of list) {
      const object = this.registry.getObject(record.id);
      let newY = record.position[1];
      if (object) {
        _box.setFromObject(object);
        if (!_box.isEmpty() && Number.isFinite(_box.min.y)) {
          newY = record.position[1] - _box.min.y;
        }
      }
      const next = [...record.position];
      next[1] = clean(newY, 4);
      this.store.patchRecord(record.id, { position: next });
    }
    this.history.commit();
  }

  /* =======================================================================
     KAMERA
     ======================================================================= */
  onFocusSelected() {
    const box = this.selection.getSelectionBox();
    if (!box) { this.onFrameAll(); return; }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.viewport.focusOn(center, Math.max(6, size * 1.4));
  }

  onFrameAll() {
    const box = this.selection.getSceneBox();
    const half = this.store.map.size / 2;
    // Harita sınırını da hesaba kat
    box.expandByPoint(new THREE.Vector3(-half, 0, -half));
    box.expandByPoint(new THREE.Vector3(half, 0, half));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.viewport.focusOn(center, Math.max(20, size * 0.7));
  }

  onTopView() {
    this.viewport.topView(this.store.map.size);
  }

  /* =======================================================================
     HARİTA BOYUTU
     ======================================================================= */

  /**
   * Harita boyutunu değiştirir.
   * @param {number} size 2048 | 1024 | 512
   * @param {'keep'|'scale'|'clear'} mode mevcut yerleşime ne olacağı
   */
  async setMapSize(size, mode = 'keep') {
    if (!Number.isFinite(size) || size <= 0) return;
    const oldSize = this.store.map.size;
    if (size === oldSize) return;

    this.history.begin('harita boyutu');
    const ratio = size / oldSize;
    const defaultCell = size >= 2048 ? 8 : size >= 1024 ? 4 : 2;

    if (mode === 'scale' && this.store.objects.length) {
      for (const record of this.store.objects) {
        this.store.patchRecord(record.id, {
          position: [
            clean(record.position[0] * ratio, 4),
            record.position[1],
            clean(record.position[2] * ratio, 4),
          ],
          scale: record.scale.map((n) => clean(n * ratio, 4)),
        });
      }
    } else if (mode === 'clear') {
      this.store.removeRecords(this.store.objects.map((r) => r.id));
    }

    const cellSize = this.store.map.cellSize > size ? defaultCell : this.store.map.cellSize;
    this.store.setMap({ size, cellSize });
    this.viewport.frameMap(size);
    this.history.commit();

    const label = i18n.t(`mapsize.result.${mode}`);
    toastKey('mapsize.toast', 'ok', { size, etiket: label });
  }

  /** Boyut değişikliğinde kullanıcıya seçenek sunar. */
  async askMapSize(size) {
    const count = this.store.objects.length;
    const choice = await openModal({
      titleKey: 'mapsize.title',
      titleArgs: { size },
      messageKey: count ? 'mapsize.body.count' : 'mapsize.body.empty',
      messageArgs: count ? { count: n(count) } : null,
      cancelKey: 'modal.cancel',
      options: count ? [
        { id: 'keep', labelKey: 'mapsize.label.keep', descKey: 'mapsize.desc.keep', icon: ICONS.lock(16) },
        { id: 'scale', labelKey: 'mapsize.label.scale', descKey: 'mapsize.desc.scale',
          descArgs: { oran: (size / this.store.map.size).toFixed(2) }, icon: ICONS.up(16) },
        { id: 'clear', labelKey: 'mapsize.label.clear', descKey: 'mapsize.desc.clear', icon: ICONS.trash(16) },
      ] : [{ id: 'keep', labelKey: 'mapsize.label.change', descKey: 'mapsize.desc.change',
               descArgs: { size }, icon: ICONS.ok(16) }],
    });
    if (choice) this.setMapSize(size, choice);
  }

  /* =======================================================================
     DOSYA İÇE AKTARMA — .npy (yükseklik haritası) / .smd (Valve modeli)
     =======================================================================
     Akış:
       dosya → ImportRouter (uzantı sınıflandırma)
            → NPYParser / SMDParser / ProjectIO
            → yeni Store kaydı + ExternalAssetCache
            → sahne nesnesi (ObjectRegistry)
     ======================================================================= */

  /**
   * .npy yükseklik haritasını arazi nesnesine dönüştürür.
   *
   * @param {File} file
   * @param {Object} [context]
   *   position : THREE.Vector3|{x,y,z}  (varsayılan: imleç/kamera hedefi)
   *   invert, gamma, flipRows, size, segments, heightScale
   * @returns {Promise<Object>} oluşturulan kayıt
   */
  async importHeightmap(file, context = {}) {
    const npy = await parseNpyFile(file, { stats: true });

    // Kanal / derinlik ekseni olan dizilerde hangi kanalın kullanılacağı
    if (npy.shape.length >= 3) {
      const depth = npy.shape[0];
      const channel = Math.min(context.channel ?? 0, depth - 1);
      if (npy.shape.length >= 3) {
        const reshaped = await parseNpyFile(file, { stats: false, channel });
        npy.field = reshaped.field;
      }
    }

    // Yükseklik haritası olmayan veri (ör. 1×1, hepsi aynı) -> kullanıcıyı uyar
    const stats = npy.stats;
    if (stats && stats.span === 0) {
      toastKey('msg.terrain.flat', 'warn', null, 5000);
    }
    if (stats && (stats.nan > 0 || stats.inf > 0)) {
      toastKey('msg.terrain.nan', 'warn', { count: n(stats.nan + stats.inf) }, 5000);
    }

    const pos = context.position
      ? (context.position.isVector3 ? context.position : new THREE.Vector3(
          context.position.x || 0, context.position.y || 0, context.position.z || 0))
      : this._dropAnchor();

    this.history.begin('arazi içe aktar');

    const record = this.terrain.buildRecord(npy, {
      id: uid('terrain'),
      name: context.name || `Arazi · ${file.name.replace(/\.npy$/i, '')}`,
      size: context.size,
      segments: context.segments,
      heightScale: context.heightScale,
      invert: context.invert,
      gamma: context.gamma,
      flipRows: context.flipRows,
    });
    record.position = [clean(pos.x, 4), 0, clean(pos.z, 4)];

    this.store.addRecord(record);
    this.history.commit();
    this.store.setSelection([record.id]);

    const info = this.external.summary();
    toast(
      i18n.t('msg.terrain.created', {
        genislik: n(npy.field.width), yukseklik: n(npy.field.height),
        bolum: n(record.props.segments),
      }),
      'ok', 5000
    );
    console.info('[NPY] heightmap yüklendi\n' + describeField(npy.field, stats) +
      `\nbölüm: ${record.props.segments} | dünya: ${record.props.terrainSize} | ` +
      `dış veri: ${(info.bytes / 1048576).toFixed(2)} MB\n` + fieldToAscii(npy.field, 14));

    this.onFrameAll();
    return record;
  }

  /**
   * Valve .smd modelini mesh nesnesine dönüştürür.
   *
   * @param {File} file
   * @param {Object} [context]
   *   convert : 'none' | 'source'   (Source Z-yukarı -> Three Y-yukarı)
   *   position, scale
   * @returns {Promise<Object>} oluşturulan kayıt
   */
  async importSmdModel(file, context = {}) {
    const convert = context.convert || 'none';
    const { geometry, model, text, size } = await importSmdGeometry(file, { convert, mode: context.mode || 'auto' });

    const issues = validateSmdModel(model);
    for (const w of model.warnings) toast(w, 'warn', 5000);

    const pos = context.position
      ? (context.position.isVector3 ? context.position : new THREE.Vector3(
          context.position.x || 0, context.position.y || 0, context.position.z || 0))
      : this._dropAnchor();

    const meta = getAsset('importedMesh');
    const baseName = model.name || file.name.replace(/\.smd$/i, '');

    this.history.begin('model içe aktar');

    const record = {
      id: uid('smd'),
      name: this._uniqueName(baseName),
      assetId: 'importedMesh',
      category: meta.category,
      position: [clean(pos.x, 4), 0, clean(pos.z, 4)],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      locked: false,
      color: '#b8c4d4',
      castShadow: true,
      receiveShadow: true,
      tag: 'imported',
      props: {
        ...getDefaultProps('importedMesh'),
        source: file.name,
        modelName: baseName,
        triangles: model.triangleCount,
        vertexCount: model.vertexCount,
        groupCount: model.groups.length,
        boneCount: model.boneWeights.length,
        convertSource: convert === 'source',
      },
    };

    // Geometri + KAYNAK METNİ cache'e yazılır.
    // Neden metin de saklanıyor? JSON dışa aktarımda tam yeniden üretilebilsin;
    // BufferGeometry'yi JSON'a yazmak yerine (çok büyük) metni saklamak çok
    // daha küçük ve kayıpsız.
    this.external.set(record.id, EXT.SMD, { geometry, model, text }, {
      name: file.name, bytes: size,
    });

    this.store.addRecord(record);      // -> _createObjectFor -> _applyImportedMesh
    this.history.commit();
    this.store.setSelection([record.id]);

    // Kaydedilen geometriyi (varsa) arazi olmayanlar için düzleştir
    this._applyImportedMesh(record.id);

    toast(
      i18n.t('msg.smd.loaded', {
        ad: baseName, ucgen: n(model.triangleCount), kose: n(model.vertexCount),
        grup: n(model.groups.length),
      }) + (issues.length ? i18n.t('msg.warn.count', { count: n(issues.length) }) : ''),
      issues.length ? 'warn' : 'ok', 5000
    );
    console.info('[SMD] model yüklendi\n' + issues.map((s) => '  • ' + s).join('\n') +
      `\nboyut: ${model.bounds.size.map((n) => n.toFixed(2)).join(' × ')}` +
      `\ngruplar: ${model.groups.map((g) => g.id + ':' + (g.name || '-')).join(', ') || '-'}` +
      `\nmod: ${geometry.userData.smd?.mode} | dönüşüm: ${convert}`);

    return record;
  }

  /**
   * İkili yükseklik ızgarasını arazi nesnesine dönüştürür.
   *
   * BU YOL SEZGİSELDİR — dosyanın tamamı değil, yalnızca başındaki
   * `[uint32 N][N×N float32]` bloğu okunur. Kalan baytlar (varsa) atlanır.
   * Bu yüzden kullanıcıya neyin okunduğu ve neyin ATLANDIĞI açıkça söylenir;
   * sessizce kısmi veri yüklenmiş gibi davranmak yanlış geometriye yol açar.
   *
   * @param {File} file
   * @param {Object} [context] importHeightmap ile aynı seçenekler
   * @param {Object} [sniff] sniffContent sonucu (raporlama için)
   * @returns {Promise<Object>} oluşturulan kayıt
   */
  async importBinaryGrid(file, context = {}, sniff = null) {
    const grid = await parseBinaryGridFile(file, { flipRows: context.flipRows === true });

    // Aynı "veri bozuk / düz / NaN" uyarıları .npy ile aynı mantıkta
    if (grid.stats.span === 0) {
      toastKey('msg.grid.flat', 'warn', null, 5000);
    }
    if (grid.stats.nan > 0) {
      toastKey('msg.grid.nan', 'warn', { count: n(grid.stats.nan) }, 5000);
    }

    const pos = context.position
      ? (context.position.isVector3 ? context.position : new THREE.Vector3(
          context.position.x || 0, context.position.y || 0, context.position.z || 0))
      : this._dropAnchor();

    this.history.begin('ızgara içe aktar');

    // NPYParser çıktısıyla AYNI sözleşme -> aynı arazi üretim yolu kullanılır
    const record = this.terrain.buildRecord({
      name: file.name,
      field: grid.field,
      stats: grid.stats,
      dtype: { descr: '<f4 (ikili)' },
    }, {
      id: uid('terrain'),
      name: context.name || `Arazi · ${file.name.replace(/\.[^.]+$/i, '')}`,
      size: context.size,
      segments: context.segments,
      heightScale: context.heightScale,
      heightMode: context.heightMode,
      heightBase: context.heightBase,
      invert: context.invert,
      gamma: context.gamma,
      flipRows: context.flipRows,
    });
    record.position = [clean(pos.x, 4), 0, clean(pos.z, 4)];

    this.store.addRecord(record);
    this.history.commit();
    this.store.setSelection([record.id]);

    // --- dürüst raporlama ------------------------------------------------
    const skipped = grid.trailingBytes;
    toast(
      i18n.t('msg.bgrid.read', { coz: n(grid.resolution), bolum: n(record.props.segments) }) +
      (skipped > 0 ? i18n.t('msg.bgrid.skipped', { mb: (skipped / 1048576).toFixed(2) }) : ''),
      'warn', 7000
    );
    console.info('[BGRID] ikili ızgara yüklendi (SEZGİSEL — yalnızca ilk bölüm okundu)\n' +
      describeGrid(grid) +
      `\ntespit: ${sniff?.reason || '—'}` +
      `\nbölüm: ${record.props.segments} | dünya: ${record.props.terrainSize} | ` +
      `yükseklik: ${record.props.minHeight} … ${record.props.maxHeight}` +
      (skipped > 0
        ? `\nUYARI: dosyanın ${skipped.toLocaleString('tr-TR')} baytı bu okuyucu tarafından ` +
          `İŞLENMEDİ. Dosya Valve SMD değil; tamamı için çıktığı aracın format açıklaması gerekir.`
        : '\nnot: dosyanın tamamı okundu'));

    this.onFrameAll();
    return record;
  }

  /** .json proje dosyasını doğrular ve yükler (mevcut sahne korunur/yenilenir). */
  async _handleJsonFile(file) {    const raw = await readFile(file);
    const result = validateProject(raw);
    if (!result.ok) {
      toast(result.errors[0] || i18n.t('msg.file.unreadable'), 'error');
      const err = new Error(result.errors[0] || i18n.t('msg.project.invalid'));
      err.code = 'E_JSON';
      throw err;
    }
    for (const w of result.warnings) toast(w, 'warn', 6000);
    await this._confirmLoad(result.project, file.name);
    return result.project;
  }

  /** İçe aktarma ilerleme bildirimi (durum çubuğu). */
  _onImportProgress({ done, total, name, id }) {
    if (!name) { this.status.sync(); return; }
    const label = id ? IMPORTERS[id]?.label || id : 'Dosya';
    this.status.setStatus(`${label}: ${name}${total > 1 ? ` (${done + 1}/${total})` : ''}`);
  }

  /** Drop alanındaki ipucunu yükleme türüne göre günceller. */
  _updateDropHint(name) {
    const hint = qs('#dropHint');
    if (!hint) return;
    if (!name) { hint.textContent = DROP_HINT; return; }
    const d = describe(name);
    hint.textContent = d.ok
      ? `Bırakın → ${d.text}`
      : `Bırakın: ${name} — ${d.text}`;
  }

  /** Sürükleme sırasında bırakılacak dosyanın türünü döndürür. */
  _droppedFiles(event) {
    const dt = event.dataTransfer;
    if (!dt) return null;
    if (dt.files && dt.files.length) return [...dt.files];
    if (dt.items) {
      return [...dt.items]
        .filter((i) => i.kind === 'file')
        .map((i) => i.getAsFile())
        .filter(Boolean);
    }
    return null;
  }

  setCellSize(value) {
    if (!CELL_SIZES.includes(value) && value > 0) return;
    this.store.setMap({ cellSize: value });
  }


  /** Görünüm anahtarı (grid/axes/bounds/checker/snap). */
  toggle(key) {
    if (key === 'snap') {
      this.store.setMap({ snap: !this.store.map.snap });
      this.transform.setSnap(this.store.map.snap ? this.store.map.cellSize : null);
      this.status.sync();
      return;
    }
    this.store.setMap({ [key]: !this.store.map[key] });
  }

  setMode(mode) {
    this.store.setMode(mode);
    this.transform.setMode(mode);
  }

  setSpace(space) {
    this.store.setSpace(space);
    this.transform.setSpace(space);
  }

  /* =======================================================================
     ÖNİZLEME (PLAY)
     ======================================================================= */

  /**
   * Önizleme modu: gizmo ve düzenleme kilitlenir, NPC'ler devriye simülasyonuna
   * geçer. Moddan çıkarken nesnelerin dönüşümleri simülasyon öncesi hâline
   * geri döndürülür; böylece "deneme" veri kaybına yol açmaz.
   */
  _setPlaying(playing) {
    this.npcs.setEnabled(playing);
    this.transform.setEnabled(!playing);
    this.selection.setHovered(null);
    this.status.sync(playing);

    if (playing) {
      this._snapshotBeforePlay = this._snapshotTransforms();
      this.viewport.content.traverse((o) => {
        if (o.userData.role === 'zone') o.visible = true;
      });
    } else {
      this._restoreTransforms();
      this.transform.attach();       // gizmo tekrar seçime bağlansın
    }
  }

  _snapshotTransforms() {
    const map = new Map();
    for (const record of this.store.objects) {
      map.set(record.id, { p: [...record.position], r: [...record.rotation] });
    }
    return map;
  }

  _restoreTransforms() {
    if (!this._snapshotBeforePlay) return;
    for (const record of this.store.objects) {
      const saved = this._snapshotBeforePlay.get(record.id);
      if (!saved) continue;
      this.store.patchRecord(record.id, { position: saved.p, rotation: saved.r });
    }
    this._snapshotBeforePlay = null;
  }

  /* =======================================================================
     DOSYA İŞLEMLERİ
     ======================================================================= */
  /**
   * Projeyi JSON olarak dışa aktarır.
   * @param {Object} [opts]
   *   includeExternalData : arazi yükseklik haritaları ve .smd metinleri
   *                        JSON'a gömülsün mü (varsayılan: HAYIR — dosya şişer)
   */
  exportJson(opts = {}) {
    const includeExternalData = opts.includeExternalData === true;
    const project = buildProject(this.store, { includeExternalData, external: this.external });

    const extCount = this.external.size;
    if (extCount > 0 && !includeExternalData) {
      project.externalNote =
        `${extCount} içe aktarılmış içerik (arazi/mesh) yalnızca önizleme/metadata olarak yazıldı. ` +
        `Tam veri için Export seçeneklerinden "Ham yükseklik haritalarını göm" seçilmelidir.`;
    }

    downloadProject(project);
    const kb = (JSON.stringify(project).length / 1024).toFixed(1);
    toast(
      i18n.t('msg.exported', { count: n(project.objects.length), kb }) +
      (extCount
        ? i18n.t(includeExternalData ? 'msg.exported.embedded' : 'msg.exported.preview', { count: n(extCount) })
        : ''),
      'ok', 4500
    );
  }

  /** Dışa aktarma seçeneklerini soran modal. */
  async exportJsonWithOptions() {
    const ext = this.external.summary();
    if (ext.count === 0) { this.exportJson(); return; }

    const choice = await openModal({
      titleKey: 'export.title',
      message:
        `${ext.count} içe aktarılmış içerik var (toplam ${(ext.bytes / 1048576).toFixed(2)} MB): ` +
        `${ext.byKind.terrain || 0} arazi, ${ext.byKind.smd || 0} model. ` +
        `Yükseklik haritalarının tamamı JSON'a gömülürse dosya çok büyüyebilir.`,
      cancelKey: 'modal.cancel',
      options: [
        {
          id: 'meta',
          labelKey: 'export.opt.compact',
          descKey: 'export.opt.compact.desc',
          icon: ICONS.info(16),
        },
        {
          id: 'full',
          labelKey: 'export.opt.full',
          descKey: 'export.opt.full.desc',
          icon: ICONS.warn(16),
        },
      ],
    });

    if (choice === 'meta') this.exportJson({ includeExternalData: false });
    else if (choice === 'full') this.exportJson({ includeExternalData: true });
  }

  importJson() {
    qs('#fileInput').click();
  }

  /**
   * Dosya giriş noktası. Uzantıya göre yönlendirilir (json / npy / smd).
   * @param {File|File[]} file
   * @param {Object} [context]
   */
  async _handleFile(file, context = {}) {
    if (!file) return;
    const files = Array.isArray(file) ? file : [file];
    if (!files.length) return;

    // Kontekst konumu: sürükle-bırak imlecinin dünya noktası
    const ctx = { ...context };
    if (ctx.position == null && this._dropPreview) {
      ctx.position = this._dropPreview.position.clone();
    }

    if (files.length === 1) {
      await this.importer.handle(files[0], ctx);
    } else {
      const r = await this.importer.handleMany(files, ctx);
      if (r.failed.length) {
        toastKey('import.failed', 'error', { count: n(r.failed.length), adlar: r.failed.map((f) => f.name).join(', ') }, 6000);
      }
      if (r.imported) this.status.sync();
    }
  }

  /** Yükleme onayı: mevcut sahne silincekse uyar. */
  async _confirmLoad(project, label) {
    if (this.store.objects.length) {
      const choice = await openModal({
        titleKey: 'import.title',
        messageKey: 'import.confirm.body',
        messageArgs: {
          ad: label,
          count: n(project.objects.length),
          boyut: n(project.map.size),
          mevcut: n(this.store.objects.length),
        },
        cancelKey: 'modal.cancel',
        confirmKey: 'import.confirm',
      });
      if (choice !== '__confirm') return;
    }
    this._loadProject(project, false);
    toastKey('import.ok', 'ok', { count: n(project.objects.length) });
  }

  /**
   * Projeyi Store'a ve sahneye uygular.
   *
   * ÖNEMLİ SIRA: `store.replaceObjects()` önce `ExternalAssetCache` beslenir,
   * sonra sahne kurulur. Aksi halde `_createObjectFor` cache boş bulur ve
   * içe aktarılmış arazi/mesh'ler boş kalır.
   *
   * @param {Object} project
   * @param {boolean} isHistory geri yükleme mi
   */
  _loadProject(project, isHistory) {
    // 1) Kayıttaki dış veri bloklarını cache'e yaz
    let restored = 0;
    let degraded = 0;
    for (const record of project.objects || []) {
      const data = record.external;
      if (!data) continue;
      if (this.external.deserialize(record.id, data)) restored++;
      else degraded++;
    }

    // 2) Store + sahne
    if (!isHistory) this.store.setMap(project.map);
    this.store.replaceObjects(project.objects, []);    if (isHistory && project.map) {
      this.store.setMap({ size: project.map.size, cellSize: project.map.cellSize });
    }
    this.viewport.frameMap(this.store.map.size);
    this.selection.clear();
    if (isHistory) this.transform.detach();
    if (!isHistory) this.history.clear();
    this.status.sync();
    this._syncMapPanel();

    if (restored) {
      toast(degraded
        ? i18n.t('import.restore', { count: n(restored) }) + ' · ' + i18n.t('import.restore.degraded', { count: n(degraded) })
        : i18n.t('import.restore', { count: n(restored) }),
        degraded ? 'warn' : 'ok', 5000);
    }
    if (degraded) {
      console.warn('[Import] Dış veri bloğu okunamadı:', degraded);
    }

    // 3) Dış kütüphane modellerinin durumunu denetle
    this._raporlaEksikModeller();
    return project;
  }

  /**
   * Projede referans verilen ama BU KİTAPLIKTA bulunmayan dış modelleri raporlar.
   *
   * İki ayrı durum vardır ve ikisi de sessizce geçmemelidir:
   *
   *  a) `imp:serbest_*` — kullanıcının bıraktığı yerel dosya. Sunucuda
   *     karşılığı YOKTUR; proje başka bir oturumda açıldığında çözülemez.
   *     Düzeltme: dosyayı yeniden sürükle-bırak yapmak.
   *
   *  b) `imp:<manifestId>` — kitaplık kaydı. `scan-assets.mjs` yeniden
   *     çalıştırılmalı veya kitaplık yüklemesi beklenmelidir.
   *
   * Kullanıcı bunu bilmezse "kaybettiğim model nerede?" diye arar.
   */
  _raporlaEksikModeller() {
    const disModeller = this.store.objects.filter((r) => isImportedId(r.assetId));
    if (!disModeller.length) return;

    const eksikSerbest = [];
    const eksikKitaplık = [];
    for (const r of disModeller) {
      if (this.importedLib.get(r.assetId)) continue;
      if (r.assetId.startsWith(`${IMPORT_PREFIX}serbest_`)) eksikSerbest.push(r);
      else eksikKitaplık.push(r);
    }

    if (eksikKitaplık.length) {
      toastKey('msg.library.missingManifest', 'warn', { count: n(eksikKitaplık.length) }, 8000);
      console.warn('[IMPORT] Kitaplıkta bulunmayan modeller:',
        eksikKitaplık.map((r) => r.assetId.replace(IMPORT_PREFIX, '')));
    }
    if (eksikSerbest.length) {
      toastKey('msg.library.sessionOnly', 'warn', { count: n(eksikSerbest.length) }, 9000);
      console.warn('[IMPORT] Geçici (serbest bırakılmış) modeller:',
        eksikSerbest.map((r) => r.props?.source || r.name));
    }
  }

  saveLocal() {
    const project = buildProject(this.store, { includeExternalData: false, external: this.external });
    const result = saveToStorage(project);
    if (result.ok) {
      const ext = this.external.summary();
      toast(
        i18n.t('msg.saved.withSize', { kb: (result.bytes / 1024).toFixed(1) }) +
        (ext.count ? i18n.t('msg.saved.previewOnly', { count: n(ext.count) }) : ''),
        'ok', 4500
      );
    } else {
      toastKey('save.fail', 'error');
    }
  }

  loadLocal() {
    const raw = loadFromStorage();
    if (!raw) { toastKey('load.notFound', 'warn'); return; }
    const result = validateProject(raw);
    if (!result.ok) { toastKey('load.corrupt', 'error'); return; }
    this._loadProject(result.project, false);
    toastKey('load.ok', 'ok');
  }

  async newMap() {
    const choice = await openModal({
      titleKey: 'new.title',
      messageKey: 'new.body',
      cancelKey: 'modal.cancel',
      confirmKey: 'new.confirm',
    });
    if (choice !== '__confirm') return;
    clearStorage();
    this.external.clear();            // arazi/mesh verilerini de bırak
    this.store.setMap({ size: 2048, cellSize: 8 });
    this.store.replaceObjects([], []);
    this.history.clear();
    this.viewport.frameMap(2048);
    this.status.sync();
    toastKey('new.ok', 'ok');
  }

  /* =======================================================================
     HAYATTA KALMA
     ======================================================================= */
  _scheduleAutosave() {
    clearTimeout(this._autosaveTimer);
    this._autosaveTimer = setTimeout(() => {
      if (!this.store.objects.length) return;
      // Otomatik kayıt daima "hafif" modda: localStorage kotalı (~5 MB)
      saveToStorage(buildProject(this.store, { includeExternalData: false, external: this.external }));
    }, AUTOSAVE_DELAY);
  }

  /* =======================================================================
     VIEWPORT OLAYLARI
     ======================================================================= */
  _bindViewport() {
    this.viewport.on('frame', ({ dt, elapsed }) => {
      this.selection.update();
      this._flushTerrainSync();     // biriken arazi prop güncellemeleri
      this.npcs.update(dt, elapsed);
    });
  }

  /* =======================================================================
     SÜRÜKLE-BIRAK
     ------------------------------------------------------------------------
     Viewport iki farklı bırakma türünü kabul eder:
       1) ASSET sürüklemesi  → dataTransfer 'application/json' taşır
       2) DOSYA sürüklemesi  → dataTransfer.files doludur (.npy / .smd / .json)
     Ayırt etme `files` listesine bakılarak yapılır.
     ======================================================================= */
  _bindDropZone() {
    const zone = qs('#viewport');

    zone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (this._droppedFiles(e)?.length) {
        zone.classList.add('is-dropping');
        this._updateDropHint(this._droppedFiles(e)[0].name);
      }
    });

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';

      const files = this._droppedFiles(e);
      if (files?.length) {
        // Dosya bırakılıyor -> tür ipucunu güncelle + konum göstergesi
        zone.classList.add('is-dropping');
        this._updateDropHint(files[0].name);
        const p = this.viewport.screenToGround(e.clientX, e.clientY);
        if (p) {
          this._ensureDropPreview();
          this._dropPreview.position.set(p.x, p.y, p.z);
          this._dropPreview.visible = true;
        }
        return;
      }

      // Asset sürüklemesi -> eski davranış
      if (!zone.classList.contains('is-dropping')) {
        zone.classList.add('is-dropping');
        this._updateDropHint(null);
      }
      const p = this.viewport.screenToGround(e.clientX, e.clientY);
      if (p) {
        this._ensureDropPreview();
        this._dropPreview.position.set(p.x, p.y, p.z);
        this._dropPreview.visible = true;
      }
    });

    zone.addEventListener('dragleave', (e) => {
      if (e.relatedTarget && zone.contains(e.relatedTarget)) return;
      zone.classList.remove('is-dropping');
      this._clearDropPreview();
      this._updateDropHint(null);
    });

    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('is-dropping');
      this._updateDropHint(null);

      const dropPoint = this.viewport.screenToGround(e.clientX, e.clientY);
      const files = this._droppedFiles(e);

      // --- 1) DOSYA bırakma (.npy / .smd / .json) ---
      if (files?.length) {
        this._clearDropPreview();
        await this._handleFile(files, { position: dropPoint });
        return;
      }

      // --- 2) ASSET bırakma ---
      let payload = null;
      try {
        payload = JSON.parse(e.dataTransfer.getData('application/json'));
      } catch {
        payload = { assetId: e.dataTransfer.getData('text/plain') };
      }
      this._clearDropPreview();
      if (!payload?.assetId) return;
      const record = this.addAsset(payload.assetId, dropPoint);
      if (record) toastKey('msg.asset.added', 'ok',
        { ad: getAssetName(record.assetId), x: record.position[0], z: record.position[2] }, 2200);
    });
  }

  /** Bırakma gölgesi: yarı saydam daire. */
  _ensureDropPreview() {
    if (this._dropPreview) return;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.2, 40),
      new THREE.MeshBasicMaterial({ color: 0x4d8dff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 999;
    this.viewport.scene.add(mesh);
    this._dropPreview = mesh;
  }

  _clearDropPreview() {
    if (!this._dropPreview) return;
    this.viewport.scene.remove(this._dropPreview);
    this._dropPreview.geometry.dispose();
    this._dropPreview.material.dispose();
    this._dropPreview = null;
  }

  /* =======================================================================
     KLAVYE KISAYOLLARI
     ======================================================================= */
  _bindKeys() {
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable;
      const ctrl = e.ctrlKey || e.metaKey;

      // --- her zaman çalışanlar ---
      if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); this.saveLocal(); return; }
      if (ctrl && e.key.toLowerCase() === 'e') { e.preventDefault(); this.exportJson(); return; }
      if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); this.importJson(); return; }
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); this.showHelp(); return; }

      if (typing) return;

      // --- geri / ileri ---
      if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); this._undo(); return; }
      if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); this._redo(); return; }

      if (ctrl) return;   // diğer ctrl kombinasyonları tarayıcıya

      switch (e.key) {
        case 'g': case 'G': case 'w': case 'W': this.setMode('translate'); break;
        case 'r': case 'R': case 'e': case 'E': this.setMode('rotate'); break;
        case 't': case 'T': case 's': case 'S': this.setMode('scale'); break;

        case 'q': case 'Q': this.setSpace(this.store.space === 'world' ? 'local' : 'world'); break;
        case 'x': case 'X': this.toggle('snap'); break;
        case 'a': case 'A': this.toggle('showAxes'); break;
        case 'b': case 'B': this.toggle('showBounds'); break;
        case 'h': case 'H': this._togglePanels(); break;

        case 'f': case 'F': e.preventDefault(); this.onFocusSelected(); break;
        case 'Home': e.preventDefault(); this.onFrameAll(); break;
        case '7': e.preventDefault(); this.onTopView(); break;

        case ' ': e.preventDefault(); this._togglePlay(); break;
        case 'Escape': this.store.clearSelection(); break;
        case 'Delete': case 'Backspace': e.preventDefault(); this.removeSelected(); break;
        default: break;
      }
    });

    // Ctrl+D / Ctrl+A
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'd') { e.preventDefault(); this.duplicateSelected(); }
      if (key === 'a') { e.preventDefault(); this.selection.selectAll(); }
    });
  }

  _undo() {
    if (this.history.undo()) this.status.sync();
  }

  _redo() {
    if (this.history.redo()) this.status.sync();
  }

  _togglePlay() {
    if (this.store.playing) {
      this.store.setPlaying(false);
    } else {
      if (!this.store.objects.some((o) => o.assetId === 'npc')) {
        toastKey('msg.preview.noNpc', 'warn');
      }
      this.store.setPlaying(true);
    }
  }

  _togglePanels() {
    const ws = qs('.workspace');
    ws.classList.toggle('no-left');
    ws.classList.toggle('no-right');
    requestAnimationFrame(() => this.viewport.resize());
  }

  /* =======================================================================
     PANEL BOYUTLANDIRMA
     ======================================================================= */
  _bindResizers() {
    for (const handle of document.querySelectorAll('.resizer')) {
      const side = handle.dataset.resize;
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        handle.classList.add('is-dragging');
        const workspace = qs('.workspace');
        const startX = e.clientX;
        const startWidth = side === 'left'
          ? qs('#leftSidebar').getBoundingClientRect().width
          : qs('#rightSidebar').getBoundingClientRect().width;

        const onMove = (ev) => {
          const delta = side === 'left' ? ev.clientX - startX : startX - ev.clientX;
          const width = clamp(startWidth + delta, 200, 560);
          workspace.style.setProperty(side === 'left' ? '--left-w' : '--right-w', `${width}px`);
          this.viewport.resize();
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          handle.classList.remove('is-dragging');
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    }
  }

  /* =======================================================================
     HARİTA AYARLARI PANELİ (sağ alt)
     ======================================================================= */
  _bindMapPanel() {
    const sizeInput = qs('#mapSizeNumber');
    const groundColor = qs('#groundColor');
    const gridColor = qs('#gridColor');
    const fogRange = qs('#fogRange');

    sizeInput.addEventListener('change', () => {
      const value = Number(sizeInput.value);
      if (value > 0 && value !== this.store.map.size) this.askMapSize(value);
      else sizeInput.value = this.store.map.size;
    });

    groundColor.addEventListener('input', () => this.store.setMap({ groundColor: groundColor.value }));
    gridColor.addEventListener('input', () => this.store.setMap({ gridColor: gridColor.value }));
    fogRange.addEventListener('input', () => {
      const v = Number(fogRange.value);
      // Doğrudan atanır: her sürükleme adımında olay yayılmaması için
      this.store.map.fog = v;
      const f = this.viewport.scene.fog;
      const near = this.store.map.size * (0.2 + v * 0.9);
      f.near = near;
      f.far = near + this.store.map.size * 2.4;
      fogRange.title = `Sis: ${Math.round(v * 100)}%`;
    });

    // Akordiyon başlıkları
    for (const head of document.querySelectorAll('.panel-head.collapsible')) {
      head.addEventListener('click', () => {
        head.classList.toggle('is-open');
        const body = qs(`#${head.dataset.collapse}`);
        if (body) body.style.display = head.classList.contains('is-open') ? '' : 'none';
        this.viewport.resize();
      });
    }

    this._syncMapPanel();
  }

  _syncMapPanel() {
    const map = this.store.map;
    const sizeInput = qs('#mapSizeNumber');
    const groundColor = qs('#groundColor');
    const gridColor = qs('#gridColor');
    const fogRange = qs('#fogRange');

    if (sizeInput && document.activeElement !== sizeInput) sizeInput.value = map.size;
    if (groundColor) groundColor.value = map.groundColor;
    if (gridColor) gridColor.value = map.gridColor;
    if (fogRange) {
      const v = clamp((map.fog ?? 0.35), 0, 1);
      if (document.activeElement !== fogRange) fogRange.value = String(v);
    }

    // Hücre seçim listesini geçerli değerle eşle
    const cellSelect = qs('#cellSizeSelect');
    if (cellSelect && Number(cellSelect.value) !== map.cellSize) cellSelect.value = String(map.cellSize);
  }

  /* =======================================================================
     DOSYA GİRİŞİ
     ======================================================================= */
  _bindImportInput() {
    const input = qs('#fileInput');
    // Yeni desteklenen biçimleri dosya seçiciye ekle
    input.accept = ACCEPT_ATTRIBUTE;
    input.multiple = true;

    input.addEventListener('change', async () => {
      const files = [...(input.files || [])];
      input.value = '';
      if (files.length) await this._handleFile(files);
    });

    // Sayfa genelinde dosya bırakma (viewport dışı alanlara da düşebilir)
    document.addEventListener('dragover', (e) => {
      if (this._droppedFiles(e)?.length) e.preventDefault();
    });
    document.addEventListener('drop', (e) => {
      const files = this._droppedFiles(e);
      if (!files?.length) return;
      if (qs('#viewport').contains(e.target)) return;   // viewport kendi işleyicisinde
      e.preventDefault();
      this._handleFile(files);
    });

    // Esc ile dosya seçici iptal edilirse durum çubuğu takılı kalmasın
    window.addEventListener('blur', () => this.status.sync());
  }

  /* =======================================================================
     YARDIM PENCERESİ
     ======================================================================= */
  showHelp() {
    openModal({
      titleKey: 'help.title',
      wide: true,   // iki sütunlu doküman için geniş yerleşim
      // FONKSİYON olarak veriliyor: dil değişirse `refreshOpenModal()`
      // yeniden çağırır, gövde güncel metinle kurulur. (Kullanıcı modal
      // açıkken üst çubuğa ulaşamaz, ama konsoldan setLanguage() çağrısı
      // mümkündür; bu yol o durumu da kapatır.)
      html: () => this._helpHtml(),
      cancelKey: 'modal.close',
    });
  }

  /** Yardım modalının gövdesi — dil değişiminde yeniden üretilir. */
  _helpHtml() {
    // Kısayol satırları: [tuş (HTML), sözlük anahtarı]. Tuş kısmı HTML'dir
    // (`<kbd>` etiketleri) ve çevrilmez; AÇIKLAMA kısmı çevrilir.
    const shortcuts = [
      ['<kbd>G</kbd> / <kbd>W</kbd>', 'help.key.g'],
      ['<kbd>R</kbd> / <kbd>E</kbd>', 'help.key.r'],
      ['<kbd>T</kbd> / <kbd>S</kbd>', 'help.key.t'],
      ['<kbd>Q</kbd>', 'help.key.q'],
      ['<kbd>X</kbd>', 'help.key.x'],
      ['<kbd>F</kbd>', 'help.key.f'],
      ['<kbd>Home</kbd>', 'help.key.home'],
      ['<kbd>7</kbd>', 'help.key.7'],
      ['<kbd>H</kbd>', 'help.key.h'],
      ['<kbd>Space</kbd>', 'help.key.space'],
      ['<kbd>Del</kbd>', 'help.key.del'],
      ['<kbd>Ctrl</kbd>+<kbd>D</kbd>', 'help.key.ctrld'],
      ['<kbd>Ctrl</kbd>+<kbd>A</kbd>', 'help.key.ctrla'],
      ['<kbd>Ctrl</kbd>+<kbd>Z</kbd>', 'help.key.ctrlz'],
      ['<kbd>Ctrl</kbd>+<kbd>Y</kbd>', 'help.key.ctrly'],
      ['<kbd>Ctrl</kbd>+<kbd>S</kbd>', 'help.key.ctrls'],
      ['<kbd>Ctrl</kbd>+<kbd>E</kbd>', 'help.key.ctrle'],
      ['<kbd>Ctrl</kbd>+<kbd>O</kbd>', 'help.key.ctrlo'],
      ['<kbd>Esc</kbd>', 'help.key.esc'],
      ['<kbd>/</kbd>', 'help.key.slash'],
    ];

    const satir = ([sol, sag]) => `<tr><td>${sol}</td><td>${sag}</td></tr>`;
    const tablo = (listeler) => `<table class="kbd-table">${listeler.map(satir).join('')}</table>`;

    const fare = [
      ['Sol tık', i18n.t('help.mouse.left')],
      ['Shift + Sol tık', i18n.t('help.mouse.shift')],
      ['Sağ tık sürükle', i18n.t('help.mouse.orbit')],
      ['Orta tık / Shift+Sağ', i18n.t('help.mouse.pan')],
      ['Tekerlek', i18n.t('help.mouse.zoom')],
      ['Etiket sürükle', i18n.t('help.mouse.scrub')],
      ['Asset sürükle', i18n.t('help.mouse.assetDrag')],
      ['Dosya sürükle', i18n.t('help.mouse.fileDrag')],
    ];

    const bicimler = [
      ['<b>.json</b>', i18n.t('help.fmt.json')],
      ['<b>.npy</b>', i18n.t('help.fmt.npy')],
      ['<b>.smd</b>', i18n.t('help.fmt.smd')],
      ['<b>.glb / .gltf</b>', i18n.t('help.fmt.glb')],
    ];

    const ext = this.external.summary();
    const disVeri = [
      [i18n.t('help.ext.cached'), `${n(ext.count)} · ${(ext.bytes / 1048576).toFixed(2)} MB`],
      [i18n.t('help.ext.terrain'), String(ext.byKind.terrain || 0)],
      [i18n.t('help.ext.model'), String(ext.byKind.smd || 0)],
    ];

    return `
        <div class="help-grid">
          <div>
            <h4>${i18n.t('help.sec.keys')}</h4>
            ${tablo(shortcuts.map(([tus, anahtar]) => [tus, i18n.t(anahtar)]))}
            <h4>${i18n.t('help.sec.mouse')}</h4>
            ${tablo(fare)}
          </div>
          <div>
            <h4>${i18n.t('help.sec.formats')}</h4>
            ${tablo(bicimler)}

            <h4>${i18n.t('help.sec.terrain')}</h4>
            <p class="help-note">${i18n.t('help.terrain.body')}</p>

            <h4>${i18n.t('help.sec.model')}</h4>
            <p class="help-note">${i18n.t('help.model.body')}</p>

            <h4>${i18n.t('help.sec.external')}</h4>
            ${tablo(disVeri)}

            <h4>${i18n.t('help.sec.json')}</h4>
            <pre>${escapeHtml(JSON.stringify({
              format: 'threejs-map-editor',
              version: 1,
              map: { size: 2048, cellSize: 8 },
              objects: [{
                id: 'obj_1', name: 'Ağaç', assetId: 'tree',
                position: [0, 0, 0], rotation: [0, 90, 0], scale: [1, 1, 1],
                visible: true, locked: false, color: '#4a9d5a',
                props: {},
              }, {
                id: 'terrain_1', name: 'Arazi', assetId: 'terrain',
                position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
                visible: true, locked: false, color: '#ffffff',
                props: { terrainSize: 2048, segments: 256, heightScale: 30 },
                external: {
                  kind: 'terrain', source: 'harita.npy',
                  width: 257, height: 257,
                  min: -64, max: 512, mean: 120.4,
                  full: false, preview: [ /* 64×64 önizleme */ ],
                },
              }],
            }, null, 2))}</pre>
          </div>
        </div>`;
  }

  /* =======================================================================
     UI HANDLER BAĞLANTILARI
     ======================================================================= */
  _topbarHandlers() {
    return {
      onMapSize: (size) => this.askMapSize(size),
      onCellSize: (v) => this.setCellSize(v),
      onToggle: (key) => this.toggle(key),
      onMode: (mode) => this.setMode(mode),
      onSpace: (space) => this.setSpace(space),
      onRotationSnap: (v) => {
        this.store.rotationSnap = v;
        this.transform.setRotationSnap(v);
        this.topbar.sync();
      },
      onUndo: () => this._undo(),
      onRedo: () => this._redo(),
      canUndo: () => this.history.canUndo,
      canRedo: () => this.history.canRedo,
      undoLabel: () => this.history.undoLabel,
      redoLabel: () => this.history.redoLabel,
      onPlay: () => this._togglePlay(),
      onNew: () => this.newMap(),
      onSave: () => this.saveLocal(),
      onLoad: () => this.loadLocal(),
      onExport: () => this.exportJsonWithOptions(),
      onImport: () => this.importJson(),
      onHelp: () => this.showHelp(),
      onFocus: () => this.onFocusSelected(),
      onFrameAll: () => this.onFrameAll(),
      onTopView: () => this.onTopView(),
      onToast: (message, kind) => toast(message, kind),
    };
  }

  _outlinerHandlers() {
    return {
      onSelect: (id, e) => {
        if (e.shiftKey) this.store.toggleSelection(id);
        else this.store.setSelection([id]);
      },
      onSelectAll: () => this.selection.selectAll(),
      onDelete: () => this.removeSelected(),
      onToggleVisible: (id) => this.toggleVisible([id]),
      onToggleLock: (id) => this.toggleLock([id]),
      onRename: (id, name) => {
        this.history.begin('ad');
        this.store.patchRecord(id, { name });
        this.history.commit();
      },
    };
  }

  _inspectorHandlers() {
    return {
      onResetTransform: () => this.onResetTransform(),
      onSnapToGround: () => this.onSnapToGround(),
      onFocus: () => this.onFocusSelected(),
      onDuplicate: () => this.duplicateSelected(),
      onDelete: () => this.removeSelected(),
      onToggleVisible: () => this.toggleVisible(),
      onToggleLock: () => this.toggleLock(),
      onNpcJump: () => {
        const record = this._singleRecord();
        if (record && this.npcs.teleportToNearestWaypoint(record)) {
          toastKey('msg.npc.moved', 'ok', { ad: record.name });
        } else {
          toastKey('msg.npc.noWaypoint', 'warn');
        }
      },
    };
  }

  _singleRecord() {
    const list = this.records();
    return list.length === 1 ? list[0] : null;
  }
}
