/**
 * tools/test-terrain.js
 * ===========================================================================
 * Arazi hattının (terrain pipeline) regresyon testi. TARAYICIDA ÇALIŞIR.
 *
 * Kullanım — tarayıcı konsolundan veya otomasyondan:
 *
 *   const T = await import('/tools/test-terrain.js');
 *   console.table(await T.runTerrainSuite());   // ayrıntılı
 *   await T.runTerrainSuite({ verbose: true });  // konsola da yazar
 *
 * Bu bir oyun/oyuncu testi DEĞİLDİR; editörün arazi hattının doğruluğunu ölçer.
 * Özellikle "sessizce yanlış hesaplanan" durumları yakalamak için yazıldı:
 *   - normalize / mutlak mod karışıklığı (veri kaybı)
 *   - yeniden kurulumda (rebuild) heightScale'ın sessizce 1'e düşmesi
 *   - undo/redo sonrası arazi geometrisinin eski kalması
 *   - sampleWorld ile mesh Y'sinin ayrışması
 *   - içerik yönlendirmesinin uzantı yerine dosya içeriğine bakmaması
 *
 * Test verisi `testdata/` altındadır; `testdata/user/` gerçek dünya dosyalarını
 * (Moradon.npy vb.) içerir ve isteğe bağlıdır — yoksa ilgili testler atlanır.
 * ===========================================================================
 */

/** Sonuçları konsol biçiminde yazdırır. */
export function report(result) {
  const { pass = [], fail = [], info = {} } = result || {};
  const line = (s) => console.log(s);

  line('');
  line('╔══════════════════════════════════════════════════════════╗');
  line(`║  ARAZİ TESTİ   ${String(pass.length).padStart(3)} geçti · ${String(fail.length).padStart(3)} kaldı   ║`);
  line('╚══════════════════════════════════════════════════════════╝');

  if (pass.length) {
    line('');
    line('✔ GEÇEN');
    for (const t of pass) line('   ✓ ' + t);
  }
  if (fail.length) {
    line('');
    line('✘ KALAN');
    for (const t of fail) line('   ✗ ' + t);
  }
  if (info.boyut) {
    line('');
    line('ℹ JSON dışa aktarım: ' + JSON.stringify(info.boyut));
  }
  if (info.rota) {
    line('');
    line('ℹ Dosya yönlendirme');
    for (const r of info.rota) {
      line('   ' + (r.ok ? '✓' : '✗') + ' ' + String(r.ad).padEnd(22) +
           'tespit=' + String(r.tespit).padEnd(12) + 'yol=' + String(r.yol));
    }
  }
  line('');
  line(fail.length ? `SONUÇ: ${fail.length} test başarısız` : `SONUÇ: ${pass.length}/${pass.length} test geçti`);
  line('');
  return fail.length === 0;
}

/**
 * Testleri çalıştırır.
 * @param {Object} [opts]
 *   verbose : true ise konsola da yazar
 * @returns {Promise<{pass:string[], fail:string[], info:Object}>}
 */
export async function runTerrainSuite(opts = {}) {
  const e = window.editor;
  if (!e) throw new Error('window.editor bulunamadı — editör açık değil.');

  const out = { pass: [], fail: [], info: {} };
  const ok = (n, c, x) => { (c ? out.pass : out.fail).push(n + (c ? '' : ' -> ' + JSON.stringify(x))); return !!c; };
  const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));

  /**
   * Koşul gerçekleşene kadar bekler.
   *
   * NEDEN SABİT `wait()` YETMEZ?
   * --------------------------
   * Arazi props güncellemesi rAF ile birleştirilir (`_flushTerrainSync`) ve
   * `store` olayları da kare döngüsünde işlenir. Sabit bir gecikme, tarayıcı
   * kare üretmezse (400 thumbnail indirilirken, ağır sahnede, kısıtlı
   * donanımda) testi yanlışlıkla BAŞARISIZ gösterir — oysa kod doğrudur.
   *
   * Bu yardımcı ölçümü koşula bağlar: "değişiklik uygulandı mı?" sorusu
   * doğrudan sorulur. `timeout` aşılırsa son değerle döner ve test gerçekten
   * başarısız olur.
   *
   * @param {() => boolean} kosul
   * @param {number} [timeout=2000]
   * @returns {Promise<boolean>} koşul sağlandı mı
   */
  const waitFor = async (kosul, timeout = 2500) => {
    const t0 = performance.now();
    while (performance.now() - t0 < timeout) {
      if (kosul()) return true;
      await wait(40);
    }
    return kosul();
  };

  const yukle = async (yol, ad) => new File([await (await fetch(yol)).blob()], ad || yol.split('/').pop());

  /** Test verisi dosyası sunucuda var mı? (testdata/user opsiyoneldir) */
  const varMi = async (yol) => (await fetch(yol, { method: 'HEAD' })).ok;

  /*
   * TAM SIFIRLAMA — test paketi IDEMPOTENT olmalı.
   *
   * Aynı sayfada üst üste çalıştırıldığında önceki koşudan kalan durum
   * sonraki koşuyu bozuyordu:
   *   - `TerrainSystem._applied` / `_lastScale` anlık görüntüleri eski nesne
   *     kimliklerini tutuyor (yeni kimlikler çakışmıyor ama bellek birikir),
   *   - `_terrainDirty` kuyruğunda bekleyen istekler bir sonraki koşunun
   *     arazisine uygulanabiliyor,
   *   - `_importedYuklemeler` uçuşları ve kütüphane önbelleği eski kayıtları
   *     taşıyor.
   * Bu yüzden tüm modül durumu açıkça sıfırlanır.
   */
  const sifirla = () => {
    e.terrain._applied?.clear();
    e.terrain._lastScale?.clear();
    if (e._terrainDirty) e._terrainDirty.clear?.();
    if (e._terrainDirty instanceof Set) e._terrainDirty.clear();
    e._importedYuklemeler?.clear?.();
    e._importedIlkBaglama?.clear?.();
    e._importedBaglanan?.clear?.();
    e.importedLib?.clearCache?.();
    e.external?.clear?.();
  };

  // Önce editörün İLK YÜKLEMESİ tamamlansın.
  // `Editor.start()` kütüphane manifest'ini bekler, SONRA bootstrap (otomatik
  // kayıt geri yükleme) çalışır. Testler store'u kendileri kurduğu için bu
  // sırayı beklemek zorunlu; yoksa bootstrap harita ayarlarını ezer.
  if (e._firstLoad) await e._firstLoad;

  // önceki koşudan kalan asenkron işlerin oturmasına izin ver
  await wait(60);
  sifirla();

  localStorage.clear();
  e.history.clear();
  e.store.setMap({ size: 2048, cellSize: 8, snap: false });
  e.store.replaceObjects([], []);
  e.external.clear();

  const IR = await import('/js/io/ImportRouter.js');

  /* ==================== 1) YÜKSEKLİK MODU ==================== */
  const ter = await e.importHeightmap(await yukle('/testdata/user/Moradon.npy', 'Moradon.npy'), {});
  const GEO = () => e.registry.getObject(ter.id).children[0].geometry;
  const Y = () => {
    const p = GEO().getAttribute('position');
    let a = Infinity, z = -Infinity;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < a) a = y; if (y > z) z = y; }
    return [+a.toFixed(2), +z.toFixed(2)];
  };
  const patch = (p) => {
    e.history.begin('test');
    e.store.patchRecord(ter.id, { props: { ...e.store.getRecord(ter.id).props, ...p } });
    e.history.commit();
  };

  ok('mutlak mod: ham yükseklikler korunur', Math.abs(Y()[0] + 34.6) < 1 && Math.abs(Y()[1] - 50.9) < 1, Y());
  ok('mutlak mod: negatif vadiler korunur', Y()[0] < -1, Y()[0]);

  patch({ heightMode: 'normalized', heightScale: 40 });
  await waitFor(() => Math.abs(Y()[0]) < 0.2 && Math.abs(Y()[1] - 40) < 0.2);
  ok('normalize mod: 0..40 aralığı', Math.abs(Y()[0]) < 0.1 && Math.abs(Y()[1] - 40) < 0.1, Y());

  patch({ heightMode: 'absolute', heightScale: 2 });
  await waitFor(() => Math.abs(Y()[0] + 69.2) < 3);
  ok('mutlak + ölçek 2', Math.abs(Y()[0] + 69.2) < 2 && Math.abs(Y()[1] - 101.9) < 2, Y());

  patch({ heightScale: 1, heightBase: -34.7387 });
  await waitFor(() => Math.abs(Y()[0]) < 0.5 && Math.abs(Y()[1] - 85.9) < 1.5);
  ok('referans düzlem: min → 0', Math.abs(Y()[0]) < 0.3 && Math.abs(Y()[1] - 85.9) < 1, Y());

  patch({ heightBase: 0 });
  await waitFor(() => Math.abs(Y()[0] + 34.6) < 1);
  ok('referans düzlem sıfırlanınca geri döner', Math.abs(Y()[0] + 34.6) < 1, Y());

  /* === 2) REBUILD ÖLÇEĞİ KAYBETMEMELİ (kritik regresyon) ===
     `rebuild` her bölüm/çevirme değişiminde yeniden örnekleme yapar.
     Yükseklik projeksiyonu yanlış paketten okunursa (opts.heightScale yerine
     opts.props.heightScale) ölçek 1'e düşer. Bu hata YALNIZCA heightScale ≠ 1
     iken görünür ve kullanıcı "ölçeğim çalışmıyor" sanır. */
  patch({ heightScale: 3 });
  await waitFor(() => Math.abs(Y()[0] + 103.8) < 5);
  ok('ölçek 3 uygulandı', Math.abs(Y()[0] + 103.8) < 4, Y());
  patch({ segments: 200 });
  await waitFor(() => GEO().getAttribute('position').count === 201 * 201);   // yeniden kurma
  ok('REBUILD ölçeği korudu (sessiz hata regresyonu)', Y()[1] > 100, Y());
  patch({ segments: 257, heightScale: 1 });
  await waitFor(() => GEO().getAttribute('position').count === 258 * 258 && Math.abs(Y()[0] + 34.6) < 1);
  ok('bölüm/ölçek birlikte geri alındı', Math.abs(Y()[0] + 34.6) < 1, Y());

  /* ==================== 3) UNDO / REDO ==================== */
  patch({ heightScale: 3 });
  await waitFor(() => Math.abs(Y()[0] + 103.8) < 5);
  const y3 = Y();
  e.history.undo();
  await waitFor(() => Math.abs(Y()[0] + 34.6) < 1);
  ok('undo ölçeği geri aldı, heightmap korundu', Math.abs(Y()[0] + 34.6) < 1, Y());
  e.history.redo();
  await waitFor(() => Y()[0] === y3[0]);
  ok('REDO ölçeği yeniden uyguladı', Y()[0] === y3[0], { simdi: Y(), beklenen: y3 });
  e.history.undo();
  await waitFor(() => Math.abs(Y()[0] + 34.6) < 1);

  /* ==================== 4) sampleWorld TUTARLILIĞI ==================== */
  {
    const P = GEO().getAttribute('position');
    const seg = 257;
    let maxErr = 0;
    for (let ix = 0; ix <= seg; ix += 8) {
      for (let iz = 0; iz <= seg; iz += 8) {
        const s = e.terrain.sampleWorld(ter.id, (ix / seg - 0.5) * 2048, (iz / seg - 0.5) * 2048);
        maxErr = Math.max(maxErr, Math.abs(s.height - P.getY(iz * (seg + 1) + ix)));
      }
    }
    ok('sampleWorld mesh ile birebir aynı', maxErr < 0.01, maxErr);
  }

  /* ==================== 5) SU / KIYI ==================== */
  const suSay = () => {
    const c = GEO().getAttribute('color');
    let n = 0;
    for (let i = 0; i < c.count; i++) if (c.getZ(i) > c.getX(i) + 0.05) n++;
    return n;
  };
  const su0 = suSay();
  ok('otomatik su seviyesi (negatif veri → 0)', ter.props.waterLevel === null, ter.props.waterLevel);
  ok('vadiler su rengine boyandı', su0 > 100, su0);
  patch({ waterLevel: -20 });
  await waitFor(() => suSay() > 0 && suSay() < su0);
  ok('su seviyesi -20 → daha az su', suSay() < su0 && suSay() > 0, { su0, yeni: suSay() });
  patch({ waterLevel: null });
  await waitFor(() => suSay() === su0);
  ok('null → otomatik moda dönüş', suSay() === su0, { su0, yeni: suSay() });

  /* ==================== 6) DOSYA YÖNLENDİRME ==================== */
  const rota = [];
  const bekle = async (ad, yol) => {
    const f = await yukle(yol, ad);
    const s = await IR.sniffContent(f).catch(() => ({ kind: '?' }));
    const r = await e.importer.handle(f, {});
    rota.push({ ad, tespit: s.kind, yol: r.id, ok: r.ok });
    return r;
  };
  for (const ad of ['plane.smd', 'cube.smd', 'crlf_bom.smd', 'boned.smd']) {
    const r = await bekle(ad, '/testdata/' + ad);
    ok('ASCII SMD → smd: ' + ad, r.id === 'smd' && r.ok, r.error);
  }
  for (const ad of ['bad_group.smd', 'truncated.smd', 'nan.smd', 'bad_index.smd']) {
    const r = await bekle(ad, '/testdata/' + ad);
    ok('bozuk SMD reddedildi: ' + ad, r.ok === false);
  }
  for (const ad of ['Moradon', 'Elmorad', 'Luferson']) {
    const r = await bekle(ad + '.npy', '/testdata/user/' + ad + '.npy');
    ok('npy → npy: ' + ad, r.id === 'npy' && r.ok, r.error);
  }
  if (await varMi('/testdata/user/moradon.smd')) {
    const r = await bekle('moradon.smd', '/testdata/user/moradon.smd');
    ok('ikili .smd → bgrid (GERÇEK DOSYA)', r.id === 'bgrid' && r.ok, r.error);
    const f = await yukle('/testdata/user/moradon.smd', 'moradon.map');
    const r2 = await e.importer.handle(f, {});
    ok('uzantı yanıltıcı: içerik yönlendirdi', r2.id === 'bgrid' && r2.ok, r2.error);
  }
  {
    const f = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'x.vmdl');
    const r = await e.importer.handle(f, {});
    ok('tanınmayan uzantı açıklamayla reddedildi', r.ok === false && /vmdl/.test(r.error || ''), r.error);
  }
  {
    const n = 250, buf = new ArrayBuffer(4 + n * n * 4), dv = new DataView(buf);
    dv.setUint32(0, n, true);
    for (let i = 0; i < n * n; i++) dv.setFloat32(4 + i * 4, i % 977, true);
    const r = await e.importer.handle(new File([buf], 'sahte.bin'), {});
    ok('sentetik ızgara (format doğru) kabul edildi', r.ok === true, r.error);
  }
  {
    const buf = new ArrayBuffer(4096), dv = new DataView(buf);
    dv.setUint32(0, 3, true);
    for (let i = 0; i < 1023; i++) dv.setUint8(4 + i, (i * 7919) % 251);
    const r = await e.importer.handle(new File([buf], 'gurultu.dat'), {});
    ok('gürültü dosyası reddedildi', r.ok === false, r.error);
  }
  out.info.rota = rota;

  /* ==================== 7) JSON GİDİŞ-DÖNÜŞ ==================== */
  const PJ = await import('/js/io/ProjectIO.js');
  const onizleme = PJ.buildProject(e.store, { includeExternalData: false, external: e.external });
  const kayipsiz = PJ.buildProject(e.store, { includeExternalData: true, external: e.external });
  const k1 = JSON.stringify(onizleme).length / 1024;
  const k2 = JSON.stringify(kayipsiz).length / 1024;
  out.info.boyut = { onizlemeKB: +k1.toFixed(1), kayipsizKB: +k2.toFixed(1) };
  const t1 = onizleme.objects.find((o) => o.assetId === 'terrain');
  const t2 = kayipsiz.objects.find((o) => o.assetId === 'terrain');
  ok('önizleme modu küçük', k1 < 400, +k1.toFixed(1));
  ok('kayıpsız mod ham veriyi gömer', k2 > k1 * 2, { k1: +k1.toFixed(1), k2: +k2.toFixed(1) });
  ok('önizlemede yalnızca preview', !!(t1 && t1.external && t1.external.preview && !t1.external.data));
  ok('kayıpsızda ham veri var', !!(t2 && t2.external && t2.external.data));
  ok('yükseklik modu JSON’da korunuyor', !!(t1 && t1.props.heightMode === 'absolute' && t1.props.waterLevel === null));

  /* ==================== 8) INSPECTOR ALAN BAĞLARI ====================
     Regresyon kaydı — bu bölüm üç ayrı hatayı kilitler:
       a) `_buildProps` alanları `schema.def` (varsayılan DEĞER) ile arıyordu,
          `schema.key` (alan ADI) ile değil → her alan boş/0 gösteriyordu ve
          kullanıcı alana dokunup bırakınca YANLIŞ değer kaydediliyordu.
       b) `_syncValues` metin alanlarını da formatValue'dan geçiriyordu
          ("Moradon.npy" → NaN → "0").
       c) checkbox alanlarında `_fields` Sarmalayıcı <label>'ı tutuyordu,
          `.checked` bir <label> üzerinde ayarlanınca canlı güncelleme
          sessizce kayboluyordu. */
  {
    e.store.setSelection([ter.id]);
    await waitFor(() => e.inspector.records[0]?.id === ter.id);

    const alan = (key) => e.inspector._fields.find((f) => f.key === 'prop:' + key);
    const deger = (key) => {
      const f = alan(key);
      if (!f) return 'YOK';
      const el = f.stateEl || f.input;
      return f.kind === 'checkbox' ? el.checked : el.value;
    };

    ok('Inspector: metin alanı ham yazılır (sayıya çevrilmez)', deger('source') === 'Moradon.npy', deger('source'));
    ok('Inspector: sayı alanları doğru', deger('terrainSize') === '2048' && deger('segments') === '257',
       { boyut: deger('terrainSize'), bolum: deger('segments') });
    ok('Inspector: dropdown doğru', deger('heightMode') === 'absolute', deger('heightMode'));
    ok('Inspector: renk alanları doğru', deger('lowColor') === '#3d5a43' && deger('waterColor') === '#2c4a63',
       { alcak: deger('lowColor'), su: deger('waterColor') });
    ok('Inspector: checkbox doğru', deger('flipRows') === false, deger('flipRows'));
    ok('Inspector: nullable alan boş', deger('waterLevel') === '', deger('waterLevel'));

    // DIŞARIDAN değişim -> alan canlı güncellenmeli
    e.store.patchRecord(ter.id, { props: { ...e.store.getRecord(ter.id).props, flipRows: true, terrainSize: 1024 } });
    await waitFor(() => deger('flipRows') === true && deger('terrainSize') === '1024');
    ok('Inspector: dış değişim checkbox’a yansıdı', deger('flipRows') === true, deger('flipRows'));
    ok('Inspector: dış değişim sayıya yansıdı', deger('terrainSize') === '1024', deger('terrainSize'));
    e.history.undo();
    await waitFor(() => deger('flipRows') === false);
  }

  /* ==================== 9) TÜM VARLIK ALANLARI ====================
     Her asset türünün props alanları kayıt değerlerini göstermeli.
     Bu, (a) hatasının düzeldiğinin ve checkbox canlı senkronunun kanıtıdır. */
  {
    const CAT = await import('/js/assets/catalog.js');

    /** Inspector gerçekten bu kaydı gösterene kadar bekle (rAF yarışı olmasın). */
    const secimiBekle = (id) => waitFor(() => e.inspector.records.length > 0 && e.inspector.records[0].id === id);

    let alanSayisi = 0, bozuk = [];
    for (const meta of CAT.ASSETS) {
      if (!meta.propsSchema?.length) continue;
      const r = e.addAsset(meta.id);
      if (!r) continue;
      e.store.setSelection([r.id]);
      if (!await secimiBekle(r.id)) {
        bozuk.push(meta.id + ': Inspector seçimi güncellemedi');
        continue;
      }
      for (const f of e.inspector._fields.filter((x) => x.key.startsWith('prop:'))) {
        alanSayisi++;
        const s = f.schema, el = f.stateEl || f.input;
        const beklenen = r.props[s.key];
        let uygun;
        if (f.kind === 'checkbox') uygun = el.checked === (beklenen === true);
        else if (f.kind === 'select') uygun = el.value === String(beklenen ?? s.def);
        else if (f.kind === 'color') uygun = el.value === (beklenen || '#ffffff');
        else if (f.kind === 'number') {
          const b = (beklenen === null || beklenen === undefined) ? s.def : beklenen;
          const got = el.value === '' ? null : parseFloat(String(el.value).replace(',', '.'));
          uygun = s.nullable ? (got === null || Math.abs(got - b) < 1e-3) : Math.abs(got - b) < 1e-3;
        } else uygun = el.value === String(beklenen ?? '');
        if (!uygun) bozuk.push(meta.id + '.' + s.key + ' gösterilen=' +
          (f.kind === 'checkbox' ? el.checked : el.value) + ' kayıt=' + beklenen);
      }
    }
    out.info.alanBaglari = alanSayisi;
    ok('tüm asset alanları kayıt değerlerini gösteriyor (' + alanSayisi + ' alan)', bozuk.length === 0, bozuk.slice(0, 5));
  }

  /* ==================== 10) DIŞ MODEL KÜTÜPHANESİ ====================
     `tools/scan-assets.mjs` çalıştırılmışsa test edilir; çalıştırılmamışsa
     "normal durum" olarak atlanır (kütüphük olmaması bir hata değildir).  */
  {
    const tani = await e._loadImportedLibrary();
    out.info.kutuphane = tani;

    if (tani.status !== 'ready') {
      out.pass.push('dış kütüphane yok (normal) — test atlandı');
      return out;
    }

    ok('manifest okundu', tani.model > 0 && tani.kategori > 0, tani);

    // --- panel entegrasyonu -------------------------------------------
    const kartlar = [...e.assetPanel.root.querySelectorAll('.asset-card.imported')];
    ok('AssetPanel dış model kartlarını gösteriyor', kartlar.length > 0, kartlar.length);
    const basliklar = [...e.assetPanel.root.querySelectorAll('.asset-cat-title')].map((x) => x.textContent);
    ok('dış kategoriler panel başlıklarında', basliklar.length > 0, basliklar.slice(-3));
    ok('importedLib şeması panelde görünmüyor (yalnızca Inspector)',
       ![...e.assetPanel.root.querySelectorAll('.asset-card')].some((c) => c.textContent.includes('Dış Model')));

    // --- arama ----------------------------------------------------------
    const arama = document.getElementById('assetSearch');
    const fence = e.importedLib.list().find((x) => /fence/.test(x.ad)) ||
                  e.importedLib.list()[0];
    arama.value = fence.ad.split('_')[0];
    arama.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(150);
    const daraltilmis = e.assetPanel.root.querySelectorAll('.asset-card.imported').length;
    ok('arama dış modelleri daraltıyor', daraltilmis > 0 && daraltilmis < 200, daraltilmis);
    arama.value = '';
    arama.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(150);

    // --- sahneye ekleme + asenkron yükleme ------------------------------
    const ucgenli = e.importedLib.list().find((x) => x.ucgen > 100) || fence;
    const rec = e.addAsset(ucgenli.id, { x: 120, y: 0, z: 120 });
    ok('dış model kaydı oluştu', !!rec && rec.assetId === ucgenli.id, rec && rec.assetId);
    ok('registry nesneyi kaydetti', !!e.registry.getObject(rec.id));

    const yuklendi = await e._applyImportedModel(rec.id);
    await waitFor(() => e.registry.getObject(rec.id)?.userData.importedReady === true);
    ok('model yüklendi (meshopt/KTX2 çözüldü)', yuklendi === true, yuklendi);

    const obj = e.registry.getObject(rec.id);
    ok('yer tutucu "hazır" işaretlendi', obj?.userData.importedReady === true);
    ok('asıl model nesneye bağlandı', obj?.children[0]?.type === 'Group', obj?.children[0]?.type);
    ok('boş yer tutucu sahneden kaldırıldı (NaN uyarısını önler)',
       !obj?.children.some((c) => c.isMesh && !c.geometry?.getAttribute('position')));
    ok('asıl mesh hâlâ bulunabiliyor', (() => {
      let n = 0; obj?.traverse((x) => { if (x.isMesh) n++; });
      return n > 0;
    })());
    ok('taban zemine oturdu', e.store.getRecord(rec.id).position[1] === 0, e.store.getRecord(rec.id).position);
    const dogalY = e.store.getRecord(rec.id).props.yukseklik;
    ok('ölçülen yükseklik kaydedildi', dogalY > 0, dogalY);

    // --- sıkıştırma gerçekten çözülüyor mu? ----------------------------
    const ktx2Model = e.importedLib.list().find((x) => x.ktx2 && x.meshopt);
    if (ktx2Model) {
      const { stats } = await e.importedLib.load(ktx2Model.id);
      ok('KTX2 transcoder etkin', e.importedLib.ktx2Hazir === true);
      ok('KTX2 model yüklendi ve doku taşıyor', stats.mesh > 0 && stats.ucgen > 0, stats);
    }

    // --- hedef yüksekliğe sığdırma --------------------------------------
    e.store.patchRecord(rec.id, { props: { ...e.store.getRecord(rec.id).props, hedefYukseklik: 3 } });
    await waitFor(() => Math.abs(e.store.getRecord(rec.id).props.yukseklik - 3) < 0.05);
    const olcekli = e.store.getRecord(rec.id);
    ok('hedef yüksekliğe sığdırdı', Math.abs(olcekli.props.yukseklik - 3) < 0.05, olcekli.props.yukseklik);
    ok('scale kayda yazıldı', olcekli.scale[0] !== 1, olcekli.scale);

    e.store.patchRecord(rec.id, { props: { ...olcekli.props, hedefYukseklik: 0 } });
    await waitFor(() => e.store.getRecord(rec.id).scale[0] === 1);
    ok('hedef 0 → 1:1 ölçeğe döndü', e.store.getRecord(rec.id).scale[0] === 1, e.store.getRecord(rec.id).scale);
    ok('ölçülen yükseklik geri geldi',
       Math.abs(e.store.getRecord(rec.id).props.yukseklik - dogalY) < 0.05);

    // --- KONUM KAYMASI YOK (regresyon) ---------------------------------
    // Normalizasyon (X/Z ortala, tabanı 0'a getir) model sahneye eklenmeden
    // önce yapılmalı ve TEK SEFER uygulanmalıdır. Aksi halde:
    //   a) `setFromObject` bayat matrixWorld üzerinden ölçer → yanlış konum,
    //   b) her props değişiminde model kendine göre biraz daha kayar.
    {
      const THREE = await import('three');
      const merkez = (id) => {
        const b = new THREE.Box3().setFromObject(e.registry.getObject(id));
        return [(b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2];
      };
      const r0 = e.store.getRecord(rec.id);
      const [x0, z0] = merkez(rec.id);
      ok('model kayıt konumunda duruyor',
         Math.abs(x0 - r0.position[0]) < 0.2 && Math.abs(z0 - r0.position[2]) < 0.2,
         { merkez: [x0, z0], kayit: r0.position });

      // 6 kez props dokun → kayma olmamalı
      for (let t = 0; t < 6; t++) {
        const cur = e.store.getRecord(rec.id);
        e.store.patchRecord(rec.id, { props: { ...cur.props, not: `test${t}` } });
        await wait(60);
      }
      const [x1, z1] = merkez(rec.id);
      ok('props değişimlerinde model KAYMADI',
         Math.abs(x1 - x0) < 0.01 && Math.abs(z1 - z0) < 0.01,
         { once: [x0, z0], son: [x1, z1] });
      ok('kayma sonrası hâlâ kayıt konumunda',
         Math.abs(x1 - r0.position[0]) < 0.2 && Math.abs(z1 - r0.position[2]) < 0.2);
    }

    // --- undo modeli KAYBETMEMELİ --------------------------------------
    e.history.begin('ölçek');
    e.store.patchRecord(rec.id, { props: { ...e.store.getRecord(rec.id).props, hedefYukseklik: 5 } });
    e.history.commit();
    await waitFor(() => Math.abs(e.store.getRecord(rec.id).props.yukseklik - 5) < 0.05);
    e.history.undo();
    // Undo → `replaceObjects` → `_rebuildScene` → YER TUTUCULAR yeniden kurulur
    // ve model ASENKRON yeniden yüklenir. Ölçek hemen döner ama
    // `importedReady` ancak indirme bitince true olur; ikisini de bekle.
    await waitFor(() => e.store.getRecord(rec.id).scale[0] === 1);
    await waitFor(() => e.registry.getObject(rec.id)?.userData.importedReady === true);
    ok('undo sonrası model bağlı kalmış',
       e.registry.getObject(rec.id)?.userData.importedReady === true);
    ok('undo sonrası ölçek geri geldi', e.store.getRecord(rec.id).scale[0] === 1);

    // --- örnekler geometriyi PAYLAŞMALI ---------------------------------
    const ikinci = e.addAsset(ucgenli.id, { x: 220, y: 0, z: 220 });
    await e._applyImportedModel(ikinci.id);
    await waitFor(() => e.registry.getObject(ikinci.id)?.userData.importedReady === true);
    const ilkMesh = (id) => { let m = null; e.registry.getObject(id)?.traverse((x) => { if (x.isMesh && !m) m = x; }); return m; };
    const m1 = ilkMesh(rec.id);
    const m2 = ilkMesh(ikinci.id);
    ok('iki örnek geometriyi paylaşıyor (bellek)', m1?.geometry === m2?.geometry);
    ok('ama ayrı nesneler', m1 !== m2);

    // --- JSON gidiş-dönüş ----------------------------------------------
    const PJ2 = await import('/js/io/ProjectIO.js');
    const proje = PJ2.buildProject(e.store, { includeExternalData: false, external: e.external });
    const disKayitlar = proje.objects.filter((o) => String(o.assetId).startsWith('imp:'));
    ok('dış modeller JSON’a yazıldı', disKayitlar.length === 2, disKayitlar.length);

    // validateProject NESNE bekler (metin değil)
    const dogr = PJ2.validateProject(JSON.parse(JSON.stringify(proje)));
    ok('proje doğrulaması geçti', dogr.ok, dogr.errors);
    const donen = dogr.project.objects.filter((o) => String(o.assetId).startsWith('imp:'));
    ok('dış modiller sessizce düşmüyor', donen.length === 2, { kaybolan: 2 - donen.length });
    ok('model props şeması korundu',
       donen[0]?.props?.yukseklik >= 0 && donen[0]?.props?.bicim, donen[0]?.props);

    // --- YENİ OTURUM: geçici (bırakılan) dosya çözülemez ---------------
    for (const k of [...e.importedLib.entries.keys()]) {
      if (k.includes('serbest_')) { e.importedLib.entries.delete(k); e.importedLib._cache.delete(k); }
    }
    e.importedLib.categories = e.importedLib.categories.filter((c) => c.id !== 'serbest');
    await e._loadProject(dogr.project, false);
    await wait(800);
    const durum = e.store.objects
      .filter((o) => String(o.assetId).startsWith('imp:'))
      .map((o) => ({ a: o.assetId, hazir: e.registry.getObject(o.id)?.userData.importedReady === true,
                     not: o.props?.not || '' }));
    ok('kitaplık modeli geri yüklemede çözüldü',
       durum.filter((d) => !d.a.includes('serbest')).every((d) => d.hazir), durum);
    ok('geçici model çözülemedi ama kayıt KAYBOLMADI', durum.length === 2, durum.length);
  }

  /* ==================== 11) THUMBNAIL'LAR ====================
     `tools/generate-thumbs.mjs` tarafından üretilen görseller. Üretilmemişse
     bölüm atlanır (thumbnail üretimi isteğe bağlı bir adımdır).           */
  {
    const thumblu = e.importedLib.list().filter((x) => x.thumb);
    out.info.thumbnail = {
      uretilen: thumblu.length,
      toplam: e.importedLib.count,
      boyut: e.importedLib.thumbSize,
    };
    if (!thumblu.length) {
      out.pass.push('thumbnail üretilmemiş (normal) — test atlandı');
      return out;
    }

    // --- manifest tutarlılığı -----------------------------------------
    ok('thumb yolları kök ile başlıyor', thumblu.every((x) => x.thumb.startsWith('/')), thumblu[0].thumb);
    ok('thumb boyutu manifestten okundu', e.importedLib.thumbSize > 0, e.importedLib.thumbSize);
    ok('thumbDurum "ok" olanların hepsi thumb taşıyor',
       e.importedLib.list().filter((x) => x.thumbDurum === 'ok').every((x) => !!x.thumb));
    ok('thumbDurum "mesh-yok" olanların hiçbiri thumb taşımıyor',
       e.importedLib.list().filter((x) => x.thumbDurum === 'mesh-yok').every((x) => !x.thumb));

    // --- DOM: kart görsel kullanıyor mu? -------------------------------
    const gorselli = [...e.assetPanel.root.querySelectorAll('.asset-card.imported.has-thumb .thumb img')];
    const fallbacklu = [...e.assetPanel.root.querySelectorAll('.asset-card.imported .thumb.is-fallback')];
    ok('kartlarda <img> var', gorselli.length > 0, gorselli.length);
    ok('her <img> loading="lazy"', gorselli.every((i) => i.getAttribute('loading') === 'lazy'));
    ok('her <img> decoding="async"', gorselli.every((i) => i.getAttribute('decoding') === 'async'));
    ok('her <img> width/height tanımlı (layout shift yok)',
       gorselli.every((i) => Number(i.getAttribute('width')) > 0 && Number(i.getAttribute('height')) > 0));
    ok('her <img> src manifest yoluna işaret ediyor',
       gorselli.every((i) => i.getAttribute('src').startsWith('/public/assets/thumbs/')));
    ok('sürükle-bırak görseli seçmesin', gorselli.every((i) => i.getAttribute('draggable') === 'false'));
    ok('görsel olmayan kartlar fallback kullanıyor', fallbacklu.length > 0, fallbacklu.length);

    // --- gerçek yükleme (görünür olanlar) -------------------------------
    // Not: `loading="lazy"` yüzünden DOM'daki görsellerin TAMAMI indirilmez;
    // yalnızca kadraja girenler. Bu, performans için istenen davranıştır.
    e.assetPanel.render();
    await wait(120);
    const ilkKart = e.assetPanel.root.querySelector('.asset-card.imported.has-thumb');
    ilkKart?.scrollIntoView({ block: 'center' });
    await wait(900);
    const yuklenen = [...e.assetPanel.root.querySelectorAll('.thumb img')]
      .filter((i) => i.complete && i.naturalWidth > 0);
    const bozuk = [...e.assetPanel.root.querySelectorAll('.thumb img')]
      .filter((i) => i.complete && i.naturalWidth === 0);
    ok('görünür thumbnail yüklendi', yuklenen.length > 0, yuklenen.length);
    ok('yüklenen görsel 128×128', yuklenen.every((i) => i.naturalWidth === 128 && i.naturalHeight === 128),
       yuklenen[0] && [yuklenen[0].naturalWidth, yuklenen[0].naturalHeight]);
    ok('bozuk görsel yok', bozuk.length === 0, bozuk.map((i) => i.getAttribute('src')));

    // --- 404 → fallback -------------------------------------------------
    {
      const sahte = document.createElement('div');
      sahte.className = 'asset-card imported';
      const kutu = e.assetPanel._createThumb({
        ad: 'yok', thumb: '/public/assets/thumbs/__yok_boyle_bir_dosya__.png', ucgen: 0,
      });
      sahte.append(kutu);
      document.body.append(sahte);
      const img = kutu.querySelector('img');
      img.dispatchEvent(new Event('error'));   // 404'ü taklit et
      await wait(80);
      ok('404 görseli fallback’e düştü', kutu.classList.contains('is-fallback'), kutu.className);
      ok('fallback ikonu eklendi', !!kutu.querySelector('.thumb-fallback svg'));
      ok('hatalı <img> DOM’dan kaldırıldı', !kutu.querySelector('img'));
      sahte.remove();
    }

    // --- boş thumbnail → fallback --------------------------------------
    {
      const kutu = e.assetPanel._createThumb({ ad: 'yok', thumb: null, ucgen: 0 });
      ok('thumb=null ise doğrudan fallback', kutu.classList.contains('is-fallback'));
      ok('fallback <img> içermez', !kutu.querySelector('img'));
    }
  }

  if (opts.verbose !== false) report(out);
  // Sonraki koşuyu kirletmemek için uçuşta kalan işleri bekle
  await wait(80);
  sifirla();
  return out;
}

// Tarayıcı konsolunda `await runTerrainSuite()` yazılabilsin diye.
if (typeof window !== 'undefined') window.runTerrainSuite = runTerrainSuite;
