/**
 * ExternalAssets.js
 * ===========================================================================
 * Store DIŞINDA ağır ikili veri deposu.
 *
 * NEDEN GEREKLİ?
 * --------------
 * Editörde kalıcı veri `Store`'da tutulur (bkz. README "Mimari: Store ⇄ Sahne").
 * Ama içe aktarılan iki veri türü JSON'a sığmaz:
 *
 *   - .npy yükseklik haritası : 2048×2048 float32 = 16 MB (base64 ≈ 22 MB)
 *   - .smd model metni         : yüzlerce KB – birkaç MB
 *
 * Bunları `store.objects` içine koyarsak her `History` anlık görüntüsü (JSON
 * metni) devasa olur ve undo/redo kullanılamaz hale gelir.
 *
 * ÇÖZÜM
 * -----
 * Ağır veri burada, nesne `id`siyle eşlenerek saklanır. `Store` kaydında ise
 * yalnızca METADATA bulunur (boyut, min/max, kaynak dosya adı, küçük önizleme).
 * Sahne yeniden kurulduğunda (undo/redo, JSON import, harita boyutu değişimi)
 * `_rebuildScene` bu depodan veriyi geri bağlar.
 *
 * JSON dışa aktarımda:
 *   - varsayılan  : metadata + 64×64 önizleme (kayıp yok, boyut ~25 KB)
 *   - includeData : tam veri base64 olarak gömülür (bilinçli seçim)
 *
 * Bu modül kasıtlı olarak three.js ve Store'dan BAĞIMSIZDIR; sadece veri
 * tutar. Geometri/alan üretimi ilgili modüllerde (TerrainSystem, Editor)
 * yapılır.
 */

/** Desteklenen dış veri türleri. */
export const EXT = Object.freeze({
  TERRAIN: 'terrain',
  SMD: 'smd',
});

/**
 * JSON'a gömülecek en büyük .smd metni (karakter cinsinden).
 * Bu sınırın amacı patolojik dosyaları (hatalı üretilmiş 100 MB'lık metin)
 * JSON'u kullanılamaz hale getirmekten korumaktır.
 */
export const SMD_TEXT_LIMIT = 4 * 1024 * 1024; // 4M karakter ≈ 8 MB

export class ExternalAssetCache {
  constructor() {
    /** @type {Map<string, {id:string, kind:string, payload:any, bytes:number, name:string, addedAt:number}>} */
    this._entries = new Map();
  }

  /* ---------------------------------------------------------------------
     Erişim
     --------------------------------------------------------------------- */

  /**
   * @param {string} id nesne id'si
   * @param {string} kind EXT.TERRAIN | EXT.SMD
   * @param {any} payload
   * @param {{name?:string, bytes?:number}} [meta]
   */
  set(id, kind, payload, meta = {}) {
    this._entries.set(id, {
      id,
      kind,
      payload,
      bytes: meta.bytes ?? estimateBytes(payload),
      name: meta.name || '',
      addedAt: Date.now(),
      missCount: 0,          // geri alma penceresi sayacı (bkz. gc)
    });
    return this;
  }

  get ids() {
    return [...this._entries.keys()];
  }

  get(id) {
    return this._entries.get(id) || null;
  }

  /** Yalnızca veri (payload) döndürür — en sık kullanılan yol. */
  payload(id) {
    return this._entries.get(id)?.payload ?? null;
  }

  kind(id) {
    return this._entries.get(id)?.kind ?? null;
  }

  has(id) {
    return this._entries.has(id);
  }

  delete(id) {
    return this._entries.delete(id);
  }

  get size() {
    return this._entries.size;
  }

  /**
   * Artık (orphan) kayıtları süpürür.
   *
   * NEDEN `maxMisses` EŞİĞİ VAR?
   * ----------------------
   * Bir nesne SİLİNDİĞİNDE cache kaydı anında silinmez! Çünkü geri alma
   * (undo) kaydı aynı `id` ile yeniden oluşturur; veri silinmiş olsaydı
   * geri alınan arazi DÜZ bir düzleme dönerdi (yükseklik haritası kaybolurdu).
   *
   * Bunun yerine kayıt "ölü" sayılır ve her `gc()` çağrısında `missCount`
   * artar. `maxMisses` kez görülmezse (yani geri alma penceresi geçtiyse)
   * gerçekten silinir. Böylece bellek, yaklaşık olarak
   * "geri alma derinliği × içerik sayısı" ile sınırlı kalır.
   *
   * @param {string[]|Set<string>} aliveIds
   * @param {number} [maxMisses]
   * @returns {number} silinen kayıt sayısı
   */
  gc(aliveIds, maxMisses = 64) {
    const alive = aliveIds instanceof Set ? aliveIds : new Set(aliveIds);
    let removed = 0;
    for (const [id, entry] of [...this._entries]) {
      if (alive.has(id)) { entry.missCount = 0; continue; }
      entry.missCount = (entry.missCount || 0) + 1;
      if (entry.missCount > maxMisses) {
        this._entries.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /** Tümünü anında siler (yeni harita / proje değişimi). */
  clear() {
    this._entries.clear();
    return this;
  }

  /* ---------------------------------------------------------------------
     Serileştirme (JSON dışa aktarım için)
     --------------------------------------------------------------------- */

  /**
   * Bir kayıt için JSON'a eklenecek dış veri parçasını üretir.
   * @param {string} id
   * @param {boolean} includeData tam veri gömülsün mü
   * @returns {Object|null}
   */
  serialize(id, includeData = false) {
    const entry = this._entries.get(id);
    if (!entry) return null;

    if (entry.kind === EXT.TERRAIN) {
      const { field, stats, meta } = entry.payload;
      const out = {
        kind: EXT.TERRAIN,
        source: meta?.name || entry.name,
        width: field.width,
        height: field.height,
        dtype: meta?.dtype || null,
        min: stats?.min ?? null,
        max: stats?.max ?? null,
        mean: stats?.mean ?? null,
        rms: stats?.rms ?? null,
        nan: stats?.nan ?? 0,
        full: false,
      };
      if (includeData) {
        out.full = true;
        out.data = float32ToBase64(field.data);
      } else {
        out.preview = previewField(field, 64);
      }
      return out;
    }

    if (entry.kind === EXT.SMD) {
      const { model, text } = entry.payload;
      const out = {
        kind: EXT.SMD,
        source: entry.name,
        modelName: model?.name || '',
        triangles: model?.triangleCount ?? 0,
        vertices: model?.vertexCount ?? 0,
        groups: (model?.groups || []).map((g) => ({ id: g.id, name: g.name })),
        full: false,
      };
      // SMD metni DÜZ METİNDİR ve zaten kaynağın kendisidir; base64'e
      // çevrildiği için şişmez. Bu yüzden varsayılan export'ta DAIMA
      // gömülür — mesh'lerin JSON round-trip'i kayıpsız olur.
      // (Yükseklik haritasının aksine: 2048² float32 base64 = ~22 MB.)
      if (typeof text === 'string' && text.length <= SMD_TEXT_LIMIT) {
        out.full = true;
        out.smd = text;
      } else {
        out.omitted = true;
        out.omittedReason = typeof text === 'string'
          ? 'Model metni ' + SMD_TEXT_LIMIT + ' karakteri aşıyor.'
          : 'Kaynak metin yok.';
      }
      return out;
    }

    return null;
  }

  /**
   * JSON'dan dış veri parçasını geri yükler (içe aktarım).
   * @param {string} id
   * @param {Object|null} data
   * @returns {boolean} başarılı mı
   */
  deserialize(id, data) {
    if (!data || typeof data !== 'object') return false;

    if (data.kind === EXT.TERRAIN) {
      let field = null;
      let degraded = false;

      if (data.full && typeof data.data === 'string') {
        // Ham veri gömülmüş: kayıpsız
        field = fieldFromBase64(data.data, data.width, data.height);
      } else if (data.preview) {
        // Yalnızca önizleme: küçük çözünürlükte de olsa arazi yeniden kurulabilir
        const p = data.preview;
        const values = Array.isArray(p) ? p : p.data;
        const pw = Number(p.width ?? data.width);
        const ph = Number(p.height ?? data.height);
        if (Array.isArray(values) && values.length > 0) {
          field = {
            width: Number.isInteger(pw) && pw > 0 ? pw : Math.round(Math.sqrt(values.length)),
            height: Number.isInteger(ph) && ph > 0 ? ph : Math.round(Math.sqrt(values.length)),
            data: Float32Array.from(values),
          };
          degraded = true;
        }
      }

      if (!field) return false;

      this.set(id, EXT.TERRAIN, {
        field,
        degraded,
        stats: {
          min: data.min ?? 0, max: data.max ?? 1,
          mean: data.mean ?? 0, rms: data.rms ?? 0,
          nan: data.nan ?? 0, inf: 0, finite: field.data.length,
        },
        meta: {
          name: data.source,
          dtype: data.dtype,
          originalWidth: data.width,
          originalHeight: data.height,
        },
      }, { name: data.source, bytes: field.data.byteLength });
      return true;
    }

    if (data.kind === EXT.SMD) {
      if (typeof data.smd !== 'string') return false;   // tam metin yoksa yeniden üretilemez
      this.set(id, EXT.SMD, { text: data.smd, model: null }, { name: data.source, bytes: data.smd.length });
      return true;
    }

    return false;
  }

  /** Durum çubuğu / teşhis için özet. */
  summary() {
    let bytes = 0;
    const byKind = {};
    for (const e of this._entries.values()) {
      bytes += e.bytes;
      byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    }
    return { count: this._entries.size, bytes, byKind };
  }
}

/* ==========================================================================
   Yardımcılar
   ========================================================================== */

/** Float32Array -> base64 (tarayıcıda küçük ve taşınabilir kod). */
export function float32ToBase64(arr) {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let binary = '';
  const CHUNK = 0x8000;                      // String.fromCharCode yığın taşmasını önler
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** base64 -> Float32Array. */
export function base64ToFloat32(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Uzunluk 4'ün katı değilse veri bozuk
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4));
}

/** Yükseklik alanını küçük bir diziye indirger (JSON önizlemesi). */
function previewField(field, maxDim) {
  const w = field.width, h = field.height;
  const tw = Math.max(1, Math.min(w, maxDim));
  const th = Math.max(1, Math.min(h, maxDim));
  const out = new Array(tw * th);
  for (let y = 0; y < th; y++) {
    const sy = Math.min(h - 1, Math.floor((y + 0.5) * h / th));
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(w - 1, Math.floor((x + 0.5) * w / tw));
      const v = field.data[sy * w + sx];
      // JSON boyutunu 4 haneye indir
      out[y * tw + x] = Math.round(v * 10000) / 10000;
    }
  }
  return { width: tw, height: th, data: out };
}

/** base64'ten yükseklik alanı üret. */
function fieldFromBase64(b64, width, height) {
  const data = base64ToFloat32(b64);
  const expected = width * height;
  if (Number.isInteger(width) && Number.isInteger(height) && data.length >= expected) {
    return { width, height, data: data.slice(0, expected) };
  }
  // Boyut bilgisi eksik/bozuk: kare varsay
  const side = Math.max(1, Math.round(Math.sqrt(data.length)));
  return { width: side, height: side, data: data.slice(0, side * side) };
}

/** Yaklaşık bellek boyutu tahmini. */
function estimateBytes(payload) {
  if (!payload) return 0;
  let total = 0;
  const visit = (v, depth) => {
    if (depth > 6 || v == null) return;
    if (ArrayBuffer.isView(v)) { total += v.byteLength; return; }
    if (typeof v === 'string') { total += v.length * 2; return; }
    if (Array.isArray(v)) { v.forEach((x) => visit(x, depth + 1)); return; }
    if (typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (k === 'payload') continue;
        visit(v[k], depth + 1);
      }
    }
  };
  visit(payload, 0);
  return total;
}
