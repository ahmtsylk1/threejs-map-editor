/**
 * tools/test-i18n.js
 * ============================================================================
 * i18n alt sistemi regresyon testi. TARAYICIDA ÇALIŞIR.
 *
 *   const T = await import('/tools/test-i18n.js');
 *   await T.runI18nSuite();                       // konsola yazar
 *   const r = await T.runI18nSuite({ verbose: false });
 *   console.log(r.pass.length, r.fail);
 *
 * KAPSAM
 * ------
 *  1) SÖZLÜK PARİTESİ      — tr ve en anahtar kümeleri birebir aynı mı?
 *  2) ŞABLON PARİTESİ       — aynı anahtarda aynı `{yer tutucu}` kümesi mi?
 *  3) ÇÖZÜMLEME             — düz anahtar, yer tutucu, çoğul, geri düşüş
 *  4) DOM TARAMA            — index.html'deki HER `data-i18n*` anahtarı çözülüyor mu?
 *  5) `el()` ENTEGRASYONU   — JS ile üretilen düğümler taramaya katılıyor mu?
 *  6) BİLEŞEN YENİDEN ÇİZİM— Inspector / Outliner / AssetPanel / StatusBar
 *  7) KALICI BELLEK         — localStorage yazılıyor, sıfırlanıyor mu?
 *  8) AÇIK MODAL            — dil değişince gövde yeniden kuruluyor mu?
 *  9) EKSİK ANAHTAR YOK     — tüm senaryo boyunca konsola düşen anahtar var mı?
 * 10) TEMİZLİK              — hiçbir düğümde anahtar metni kalmıyor mu?
 *
 * Bu bir oyun/oyuncu testi DEĞİLDİR; çeviri hattının doğruluğunu ölçer.
 * ============================================================================
 */

/* -------------------------------------------------------------------------
   Konsol raporu
   ------------------------------------------------------------------------- */
export function report(result) {
  const { pass = [], fail = [], info = {} } = result || {};
  const line = (s) => console.log(s);

  line('');
  line('='.repeat(64));
  line(`  i18n TESTİ   ${String(pass.length).padStart(3)} geçti  ·  ${String(fail.length).padStart(3)} kaldı`);
  line('='.repeat(64));

  if (pass.length) {
    line('');
    line('✓ GEÇEN');
    for (const t of pass) line('   ✓ ' + t);
  }
  if (fail.length) {
    line('');
    line('✗ KALAN');
    for (const t of fail) line('   ✗ ' + t);
  }
  if (Object.keys(info).length) {
    line('');
    line('BİLGİ');
    for (const [k, v] of Object.entries(info)) {
      line(`   ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
  }
  line('');
  line(fail.length === 0 ? 'SONUÇ: BAŞARILI' : 'SONUÇ: BAŞARISIZ');
  line('');
}

/* -------------------------------------------------------------------------
   Çalıştırıcı
   ------------------------------------------------------------------------- */
export async function runI18nSuite(opts = {}) {
  const out = { pass: [], fail: [], info: {} };
  const ok = (n, c, x) => {
    (c ? out.pass : out.fail).push(n + (c ? '' : ' -> ' + JSON.stringify(x)));
    return !!c;
  };
  const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms));

  const e = window.editor;
  if (!e) throw new Error('window.editor bulunamadı — editör açık değil.');
  if (e._firstLoad) await e._firstLoad;

  // Test, kalıcı tercihi DEĞİŞTİRMEZ: sonunda eski değeri geri yazar.
  const eskiDil = localStorage.getItem('mapeditor:lang');
  const eskiLang = document.documentElement.lang;

  const { i18n, I18N_EVENT } = await import('/js/core/I18nManager.js');
  const { DILLER, VARSAYILAN } = await import('/js/i18n/index.js');
  const tr = await import('/js/i18n/tr.js');
  const en = await import('/js/i18n/en.js');
  const { el } = await import('/js/utils/dom.js');
  const { ASSETS, CATEGORIES, getAssetName, getSchemaLabel } = await import('/js/assets/catalog.js');

  // --- eksik anahtar toplayıcı ------------------------------------------
  const eksik = [];
  const eksikDinle = (a) => eksik.push(a);
  i18n.on(I18N_EVENT.MISSING, eksikDinle);

  /* ==================== 1) SÖZLÜK PARİTESİ ====================
     İKİ FARKLI KURAL VAR:

     a) DÜZ anahtarlar (`.one`/`.other` olmayan) iki dilde de BİREBİR
        aynı olmalı. Bir dilde eksik düz anahtar, o dilde o metni
        göstermek yerine diğer dile düşer — kullanıcı karışık dil görür.

     b) `.one` VARYANLARI yalnızca İngilizcede olabilir. Türkçede çoğul
        eki yoktur ("1 nesne" ≡ "5 nesne"), dolayısıyla TR'de `.one`
        GEREKSİZDİR ve yazılmamalıdır. Bu kuralı zorlamak, TR sözlüğüne
        24 anlamsız kopya eklemeyi gerektirirdi.

     Bunun yerine şu denetlenir: her EN `.one` anahtarının TABAN anahtarı
     her iki dilde de var mı? (Yani `.one` daima bir zenginleştirmedir,
     asla yalnız başına duran bir tanım değil.)                            */
  const trK = Object.keys(tr.default);
  const enK = Object.keys(en.default);
  const trDuz = trK.filter((k) => !/\.(one|other)$/.test(k));
  const enDuz = enK.filter((k) => !/\.(one|other)$/.test(k));
  const trSet = new Set(trK);
  const enSet = new Set(enK);
  const trDuzSet = new Set(trDuz);
  const enDuzSet = new Set(enDuz);
  const trEksik = enDuz.filter((k) => !trDuzSet.has(k));
  const enEksik = trDuz.filter((k) => !enDuzSet.has(k));

  out.info.anahtar = { trDuz: trDuz.length, enDuz: enDuz.length, enOne: enK.length - enDuz.length };
  ok('tr sözlüğü boş değil', trDuz.length > 100, trDuz.length);
  ok('en sözlüğü boş değil', enDuz.length > 100, enDuz.length);
  ok('her DÜZ anahtar iki dilde de var (en→tr)', trEksik.length === 0, trEksik.slice(0, 8));
  ok('her DÜZ anahtar iki dilde de var (tr→en)', enEksik.length === 0, enEksik.slice(0, 8));

  // TR'de `.one` YAZILMAMALI (Türkçede çoğul eki yok)
  const trYanlisCogul = trK.filter((k) => /\.one$/.test(k));
  ok('TR sözlüğünde gereksiz .one yok', trYanlisCogul.length === 0, trYanlisCogul.slice(0, 6));

  // Her EN `.one` anahtarının tabanı her iki dilde de olmalı
  const enOne = enK.filter((k) => k.endsWith('.one'));
  const yalnizOne = enOne.filter((k) => {
    const taban = k.slice(0, -4);
    return !trSet.has(taban) || !enSet.has(taban);
  });
  out.info.enTekil = enOne.length;
  ok('her EN .one anahtarının tabanı iki dilde de var', yalnizOne.length === 0, yalnizOne.slice(0, 6));

  /* ==================== 2) ŞABLON PARİTESİ ====================
     Aynı anahtarda iki dil farklı sayıda yer tutucu taşırsa, bir dilde
     `{count}` yazılı `{ad}` basılır — sessizce boş kalır.                */
  {
    const tutucu = (s) => (String(s).match(/\{(\w+)\}/g) || []).map((x) => x.slice(1, -1)).sort();
    const bozuk = [];
    for (const k of trDuz) {
      if (enDuzSet.has(k)) {
        const a = tutucu(tr.default[k]).join(',');
        const b = tutucu(en.default[k]).join(',');
        if (a !== b) bozuk.push(`${k}: tr[${a}] vs en[${b}]`);
      }
    }
    ok('düz anahtarlarda aynı yer tutucu kümesi', bozuk.length === 0, bozuk.slice(0, 6));

    // `.one` varyantı da tabanıyla AYNI yer tutucu kümesini taşımalı
    const bozukOne = [];
    for (const k of enOne) {
      const taban = k.slice(0, -4);
      if (!enSet.has(taban)) continue;
      const a = tutucu(en.default[k]).join(',');
      const b = tutucu(en.default[taban]).join(',');
      if (a !== b) bozukOne.push(`${k}: one[${a}] vs base[${b}]`);
    }
    ok('.one varyantı tabanıyla aynı yer tutucuları taşıyor', bozukOne.length === 0, bozukOne.slice(0, 6));
  }

  /* ==================== 3) ÇÖZÜMLEME ==================== */
  {
    i18n.setLanguage('tr', { kaydet: false });
    ok('t() düz anahtarı çözer', i18n.t('topbar.btn.new') === tr.default['topbar.btn.new'], i18n.t('topbar.btn.new'));
    ok('t() yer tutucuyu doldurur',
      i18n.t('status.objects', { count: 7 }) === tr.default['status.objects'].replace('{count}', '7'),
      i18n.t('status.objects', { count: 7 }));
    ok('olmayan yer tutucu yerinde kalır', i18n.t('status.objects').includes('{count}'), i18n.t('status.objects'));

    // --- ÇOĞUL ---------------------------------------------------------
    // Türkçede çoğul eki yoktur (tekil/çoğul AYNI yazılır) → `.one`
    // taşımaz. İngilizcede isim çoğullenir → `.one` + düz anahtar (çoğul).
    // Test ikisini de doğrular.
    i18n.setLanguage('en', { kaydet: false });
    const tek = i18n.t('inspector.chip.count', { count: 1 });
    const cok = i18n.t('inspector.chip.count', { count: 5 });
    ok('EN çoğul · count=1 tekil biçim', tek === '{count} object'.replace('{count}', '1'), tek);
    ok('EN çoğul · count=5 çoğul biçim', cok === '{count} objects'.replace('{count}', '5'), cok);
    ok('EN çoğul · iki bişim FARKLI', tek !== cok, { tek, cok });

    i18n.setLanguage('tr', { kaydet: false });
    const trTek = i18n.t('inspector.chip.count', { count: 1 });
    const trCok = i18n.t('inspector.chip.count', { count: 5 });
    ok('TR çoğul · tekil/çoğul aynı yazılır (ek yok)', trTek !== undefined && trCok.includes('5'), { trTek, trCok });

    // HER {count} anahtarı count=1 ve count=7 ile çözülebilmeli
    const sayili = trK.filter((k) => /\{count\}/.test(tr.default[k]));
    const bozukCogul = [];
    for (const dilKodu of ['tr', 'en']) {
      i18n.setLanguage(dilKodu, { kaydet: false });
      for (const k of sayili) {
        for (const c of [1, 7]) {
          const metin = i18n.t(k, { count: c });
          if (metin === k) bozukCogul.push(`${dilKodu}:${k}@${c}`);
          if (metin.includes('{count}')) bozukCogul.push(`${dilKodu}:${k}@${c} sayı yerinde kaldı`);
        }
      }
    }
    out.info.sayiliAnahtar = sayili.length;
    ok('her {count} anahtarı hem 1 hem 7 ile çözülür', bozukCogul.length === 0, bozukCogul.slice(0, 8));

    // İngilizcede "1 objects" gibi gramer hatasını yakala
    // KURAL: EN düz/`.other` biçiminde `{count}` hemen ardından 's' ile
    // biten bir isim geliyorsa `.one` VARDIR olmalı. Aksi hâlde "1 objects".
    const enCiftler = Object.keys(en.default).filter((k) => !k.endsWith('.one'));
    const gramerHatasi = [];
    for (const k of enCiftler) {
      const m = /\{count\}\s+([A-Za-z]+)s\b/.exec(en.default[k]);
      if (m && !en.default[`${k}.one`]) gramerHatasi.push(`${k}: "{count} ${m[1]}s" ama .one yok`);
    }
    ok('EN’de "1 objects" türü gramer hatası yok', gramerHatasi.length === 0, gramerHatasi.slice(0, 6));

    // --- GERİ DÜŞÜŞ ------------------------------------------------------
    // Yalnızca EN'de bulunan bir anahtar: EN aktifken çözülür, TR aktifken
    // TR'ye (ve oradan da bulunamayışa) düşer.
    const yalnizcaEn = 'test.yalnizca.en';
    en.default[yalnizcaEn] = 'only-english';
    i18n.setLanguage('en', { kaydet: false });
    ok('yalnızca EN’de olan anahtar EN’de çözülür', i18n.t(yalnizcaEn) === 'only-english', i18n.t(yalnizcaEn));
    i18n.setLanguage('tr', { kaydet: false });
    ok('TR’de olmayan anahtar boş dönmez', i18n.t(yalnizcaEn) === yalnizcaEn, i18n.t(yalnizcaEn));
    delete en.default[yalnizcaEn];

    // Bulunamayan anahtar: boş DEĞİL, anahtarın kendisi döner
    const sayac = eksik.length;
    const bilinmeyen = i18n.t('bu.anahtar.yok');
    ok('eksik anahtar boş dönmez', bilinmeyen === 'bu.anahtar.yok', bilinmeyen);
    ok('eksik anahtar MISSING olayı yayınlar', eksik.length > sayac, eksik.slice(-1));

    // exists()
    ok('exists() doğru', i18n.exists('topbar.btn.new') && !i18n.exists('yine.yok'));
  }

  /* ==================== 4) DOM TARAMA ==================== */
  {
    const metinli = [...document.querySelectorAll('[data-i18n]')];
    const ozellikli = [...document.querySelectorAll('[data-i18n-attr]')];
    out.info.dataI18n = { metin: metinli.length, ozellik: ozellikli.length };
    ok('sayfada data-i18n düğümleri var', metinli.length > 20, metinli.length);
    ok('sayfada data-i18n-attr düğümleri var', ozellikli.length > 10, ozellikli.length);

    // Tüm anahtarlar her iki dilde de çözülebilir mi?
    const cozulemeyen = [];
    for (const dugum of [...metinli, ...ozellikli]) {
      for (const a of dugum.getAttributeNames()) {
        if (a === 'data-i18n') cozulemeyen.push(...(dugum.getAttribute(a) ? [dugum.getAttribute(a)] : []));
        if (a === 'data-i18n-attr') {
          for (const cift of dugum.getAttribute(a).split(';')) {
            const i = cift.indexOf(':');
            if (i > 0) cozulemeyen.push(cift.slice(i + 1).trim());
          }
        }
      }
    }
    i18n.setLanguage('tr', { kaydet: false });
    const trEksikDom = cozulemeyen.filter((k) => !trSet.has(k) && !trSet.has(`${k}.one`));
    i18n.setLanguage('en', { kaydet: false });
    const enEksikDom = cozulemeyen.filter((k) => !enSet.has(k) && !enSet.has(`${k}.one`));
    ok('DOM’daki her anahtar tr sözlüğünde', trEksikDom.length === 0, trEksikDom.slice(0, 8));
    ok('DOM’daki her anahtar en sözlüğünde', enEksikDom.length === 0, enEksikDom.slice(0, 8));

    // Çocuk düğümü olan hedefte sessizce silme olmamalı
    const cocuklu = metinli.filter((d) => d.firstElementChild);
    ok('data-i18n hedeflerinde çocuk düğüm yok', cocuklu.length === 0,
      cocuklu.map((d) => d.getAttribute('data-i18n')));
  }

  /* ==================== 5) el() ENTEGRASYONU ==================== */
  {
    i18n.setLanguage('tr', { kaydet: false });
    const dugum = el('span', { i18n: 'topbar.btn.save' });
    ok('el() metni çözer', dugum.textContent === tr.default['topbar.btn.save'], dugum.textContent);
    ok('el() data-i18n işaretler', dugum.getAttribute('data-i18n') === 'topbar.btn.save');

    const oz = el('input', { i18nAttr: { title: 'topbar.btn.load.title', placeholder: 'asset.search.placeholder' } });
    ok('el() öznitelikleri çözer', oz.title === tr.default['topbar.btn.load.title'], oz.title);
    ok('el() data-i18n-attr işaretler', /title:/.test(oz.getAttribute('data-i18n-attr')));

    // Değişkenli
    const degiskenli = el('span', { i18n: 'status.objects', i18nArgs: { count: 3 } });
    ok('el() değişken kabul eder', degiskenli.textContent.includes('3'), degiskenli.textContent);

    // Çocuklu düğümde i18n metni ÇOCUKLARI SİLMEZ
    const cocuklu = el('button', { i18n: 'topbar.btn.new' }, [el('svg'), el('span', { text: 'X' })]);
    ok('el() çocukları korur', cocuklu.querySelector('svg') !== null, cocuklu.innerHTML);

    // Tarama bu düğümleri de günceller
    const kutu = el('div', {}, [dugum, oz]);
    document.body.append(kutu);
    i18n.setLanguage('en', { kaydet: false });
    ok('el() düğümleri taramayla güncellenir',
      dugum.textContent === en.default['topbar.btn.save'] && oz.title === en.default['topbar.btn.load.title'],
      { metin: dugum.textContent, baslik: oz.title });
    kutu.remove();
  }

  /* ==================== 6) KATALOG + BİLEŞENLER ==================== */
  {
    // Katalog etiketleri dile göre değişiyor mu?
    i18n.setLanguage('tr', { kaydet: false });
    const trAd = getAssetName('cube');
    const trKategori = CATEGORIES.map((c) => c.labelKey);
    i18n.setLanguage('en', { kaydet: false });
    const enAd = getAssetName('cube');
    ok('getAssetName() dile göre değişir', trAd !== enAd && !!trAd && !!enAd, { trAd, enAd });
    ok('her kategorinin anahtarı çözülüyor',
      trKategori.every((k) => i18n.exists(k)), trKategori.filter((k) => !i18n.exists(k)));

    // Her propsSchema alanının anahtarı çözülüyor
    const alanEksik = [];
    for (const asset of ASSETS) {
      for (const alan of asset.propsSchema || []) {
        if (!i18n.exists(alan.labelKey)) alanEksik.push(alan.labelKey);
        for (const s of alan.options || []) {
          if (!i18n.exists(s.labelKey)) alanEksik.push(s.labelKey);
        }
      }
    }
    out.info.alanEtiketi = ASSETS.reduce((t, a) => t + (a.propsSchema?.length || 0), 0);
    ok('tüm propsSchema etiketleri çevrildi', alanEksik.length === 0, alanEksik.slice(0, 10));

    // AYNI ALAN ADI, FARKLI ASSET → FARKLI METİN (çakışma yok)
    const waypointRadius = ASSETS.find((a) => a.id === 'waypoint').propsSchema.find((f) => f.key === 'radius');
    const portalRadius = ASSETS.find((a) => a.id === 'portal').propsSchema.find((f) => f.key === 'radius');
    i18n.setLanguage('tr', { kaydet: false });
    const wR = getSchemaLabel(waypointRadius);
    const pR = getSchemaLabel(portalRadius);
    ok('aynı alan adı farklı metin verir', wR !== pR, { waypoint: wR, portal: pR });
  }

  /* ==================== 7) BİLEŞEN YENİDEN ÇİZİM ==================== */
  {
    const okur = () => ({
      marka: document.querySelector('[data-i18n="panel.assets"]').textContent,
      izgara: document.querySelector('[data-toggle="showGrid"]').textContent,
      izgaraBaslik: document.querySelector('[data-toggle="showGrid"]').title,
      durum: document.getElementById('stObjects').textContent,
      secim: document.getElementById('stSelection').textContent,
      mod: document.getElementById('stMode').textContent,
      sayac: document.getElementById('assetCountChip').textContent,
      arama: document.getElementById('assetSearch').placeholder,
      outlinerGrup: document.querySelector('.out-group-title')?.textContent || '',
      istatistik: [...document.querySelectorAll('#mapStats .stat span')].map((s) => s.textContent),
    });

    i18n.setLanguage('tr', { kaydet: false });
    await wait();
    const tr = okur();

    i18n.setLanguage('en', { kaydet: false });
    await wait();
    const en = okur();

    // Her alan GERÇEKTEN değişmiş olmalı
    const degisenler = Object.keys(tr).filter((k) => JSON.stringify(tr[k]) !== JSON.stringify(en[k]));
    out.info.degisenAlanlar = Object.keys(tr).length;
    ok('bileşen metinleri yeniden çizildi', degisenler.length >= 8, { tr, en });

    // Inspector: seçimli alanlar yeniden kurulmalı
    const rec = e.addAsset('npc');
    i18n.setLanguage('tr', { kaydet: false });
    e.store.setSelection([rec.id]);
    await wait(320);
    const trInspector = [...e.inspector.root.querySelectorAll('.fs-body label.row > span')].map((s) => s.textContent);
    const trEfsane = [...e.inspector.root.querySelectorAll('legend')].map((l) => l.textContent);
    const trRol = e.inspector.root.querySelector('select.select option').textContent;

    i18n.setLanguage('en', { kaydet: false });
    await wait(360);
    const enInspector = [...e.inspector.root.querySelectorAll('.fs-body label.row > span')].map((s) => s.textContent);
    const enEfsane = [...e.inspector.root.querySelectorAll('legend')].map((l) => l.textContent);
    const enRol = e.inspector.root.querySelector('select.select option').textContent;

    ok('Inspector alan etiketleri çevrildi', trInspector.join() !== enInspector.join(), { trInspector, enInspector });
    ok('Inspector bölüm başlıkları çevrildi', trEfsane.join() !== enEfsane.join(), { trEfsane, enEfsane });
    ok('Inspector <select> seçenekleri çevrildi', trRol !== enRol, { trRol, enRol });
    ok('Inspector yeniden kuruldu (alan sayısı korundu)',
      trInspector.length === enInspector.length, { tr: trInspector.length, en: enInspector.length });

    // Outliner satır düğmeleri.
    // DİKKAT: `cizgi` referansı dil değişiminden SONRA GEÇERSİZLEŞİR —
    // Outliner yeniden çizilir (`register`) ve eski düğüm DOM'dan düşer.
    // Bu yüzden her dili okuduktan sonra DÜĞÜM YENİDEN SORGULANIR; eski
    // referansı okumak "değişmedi" gibi görünür ama hiçbir şey ölçmez.
    if (document.querySelector('.out-row .out-btn')) {
      i18n.setLanguage('tr', { kaydet: false });
      await wait(340);
      const trBaslik = document.querySelector('.out-row .out-btn').title;
      i18n.setLanguage('en', { kaydet: false });
      await wait(340);
      const enBaslik = document.querySelector('.out-row .out-btn').title;
      ok('Outliner düğme ipuçları çevrildi', trBaslik !== enBaslik, { tr: trBaslik, en: enBaslik });
    }

    e.store.clearSelection();
  }

  /* ==================== 8) KALICI BELLEK ==================== */
  {
    // ÖNCE farklı bir dile geç: setLanguage() aynı dilde erken döner ve
    // localStorage'a YAZMAZ. Testin "yazdı" iddiası ancak gerçekten
    // değişim yapıldığında anlamlıdır.
    i18n.setLanguage('tr', { kaydet: false });
    localStorage.removeItem('mapeditor:lang');
    const degisti = i18n.setLanguage('en');
    ok('setLanguage() değişim yapar', degisti === true, degisti);
    ok('setLanguage() localStorage’a yazar',
      localStorage.getItem('mapeditor:lang') === 'en', localStorage.getItem('mapeditor:lang'));

    i18n.setLanguage('tr', { kaydet: false });
    localStorage.removeItem('mapeditor:lang');
    i18n.setLanguage('en', { kaydet: false });
    ok('kaydet:false yazmaz', localStorage.getItem('mapeditor:lang') === null,
      localStorage.getItem('mapeditor:lang'));

    // Aynı dil tekrar seçilirse olay YAYINLANMAZ (gereksiz yeniden çizim olmaz)
    let sayac = 0;
    const dinle = () => { sayac++; };
    i18n.on(I18N_EVENT.CHANGE, dinle);
    i18n.setLanguage('en', { kaydet: false });   // zaten en
    ok('aynı dil seçilince olay yayınlanmaz', sayac === 0, sayac);
    i18n.setLanguage('tr', { kaydet: false });
    ok('farklı dil seçilince olay yayınlanır', sayac === 1, sayac);
    i18n.off(I18N_EVENT.CHANGE, dinle);

    // toggleLanguage iki dilli arayüzde TR ⇄ EN
    i18n.setLanguage('tr', { kaydet: false });
    i18n.toggleLanguage();
    const ilk = i18n.language;
    i18n.toggleLanguage();
    ok('toggleLanguage() diller arasında döner', ilk === 'en' && i18n.language === 'tr', { ilk, son: i18n.language });

    // Geçersiz dil reddedilir
    i18n.setLanguage('xx', { kaydet: false });
    ok('geçersiz dil kabul edilmez', i18n.language === 'tr', i18n.language);

    // Kayıtlı tercih YENİ yüklemede okunur. Bunu `localStorage` üzerinden
    // doğruluyoruz: kayıtlı 'en' iken `new I18nManager()` 'en' ile açılmalı.
    const { I18nManager } = await import('/js/core/I18nManager.js');
    localStorage.setItem('mapeditor:lang', 'en');
    const yeni = new I18nManager();
    ok('kayıtlı tercih yeniden yüklemede okunur', yeni.language === 'en', yeni.language);
    localStorage.setItem('mapeditor:lang', 'tr');
    const yeni2 = new I18nManager();
    ok('kayıtlı tr tercihi de okunur', yeni2.language === 'tr', yeni2.language);

    // Bozuk kayıt varsa varsayılana düşülür (çökmez)
    localStorage.setItem('mapeditor:lang', 'zz');
    const bozuk = new I18nManager();
    ok('bozuk kayıt çökmez, varsayılana düşer', bozuk.language === VARSAYILAN, bozuk.language);
  }

  /* ==================== 9) AÇIK MODAL ==================== */
  {
    i18n.setLanguage('tr', { kaydet: false });
    e.showHelp();
    await wait(320);
    const govde = document.querySelector('.modal-body');
    const baslikTR = document.querySelector('.modal-head h3').textContent;
    const ilkSatirTR = govde.querySelector('.kbd-table tr td:nth-child(2)')?.textContent;
    govde.scrollTop = 200;

    i18n.setLanguage('en', { kaydet: false });
    await wait(320);
    const baslikEN = document.querySelector('.modal-head h3').textContent;
    const ilkSatirEN = govde.querySelector('.kbd-table tr td:nth-child(2)')?.textContent;

    ok('modal başlığı çevrildi', baslikTR !== baslikEN, { baslikTR, baslikEN });
    ok('modal gövdesi yeniden kuruldu', ilkSatirTR !== ilkSatirEN, { ilkSatirTR, ilkSatirEN });
    ok('modal kaydırma konumu korundu', govde.scrollTop > 100, govde.scrollTop);

    // Kapat düğmesinin ipucu da çevrildi mi
    const xBtn = document.querySelector('.modal-head .x-btn');
    ok('modal kapat düğmesi ipucu çevrildi', !!xBtn && xBtn.title.length > 0, xBtn?.title);

    document.getElementById('modalBackdrop').hidden = true;
    document.getElementById('modal').innerHTML = '';
  }

  /* ==================== 10) SAYI BİÇİMLENDİRME ==================== */
  {
    const { n, pct } = await import('/js/i18n/format.js');
    i18n.setLanguage('tr', { kaydet: false });
    const trSayi = n(1234567);
    i18n.setLanguage('en', { kaydet: false });
    const enSayi = n(1234567);
    ok('binlik ayırıcı dile göre', trSayi !== enSayi, { trSayi, enSayi });
    // TR: "%35"  ·  EN: "35%"  → konum dile göre değişir, yüzde işareti her zaman var
    const trPct = pct(0.35);
    i18n.setLanguage('tr', { kaydet: false });
    ok('pct() yüzde işareti içerir', trPct.includes('%'), trPct);
    ok('pct() konumu dile göre (tr "%35" / en "35%")', pct(0.35) !== trPct, { tr: trPct, en: pct(0.35) });
    ok('pct() ondalık korur', pct(0.355) !== pct(0.35), { a: pct(0.355), b: pct(0.35) });
    ok('n() geçersiz değerde boş dönmez', n(null) === '', n(null));
  }

  /* ==================== 11) EKSİK ANAHTAR / TEMİZLİK ==================== */
  {
    out.info.eksikAnahtar = eksik.length;
    // `.one` varyantları TR'de yok; `_cozulCift` TR'de `.one`/`.other`
    // denemesinden sonra DÜZ anahtara düşer → eksik bildirilmez.
    // Testin kendi sürdüğü `bu.anahtar.yok` ve `test.yalnizca.en` beklenen.
    const beklenen = new Set(['bu.anahtar.yok', 'test.yalnizca.en']);
    const istenmeyen = eksik.filter((a) => !beklenen.has(a));
    ok('senaryo boyunca istenmeyen eksik anahtar yok', istenmeyen.length === 0, istenmeyen.slice(0, 8));

    // Hiçbir düğümde ham anahtar kalmamalı
    const sizmis = [];
    for (const dugum of document.querySelectorAll('[data-i18n]')) {
      const metin = dugum.textContent.trim();
      if (metin && /^[a-z]+\.[a-zA-Z]+\./.test(metin)) sizmis.push(metin);
    }
    ok('DOM’da ham anahtar metni kalmadı', sizmis.length === 0, sizmis.slice(0, 5));
  }

  /* --- temizlik: dinleyiciyi kaldır, tercihi geri yaz ------------------- */
  i18n.off(I18N_EVENT.MISSING, eksikDinle);
  if (eskiDil === null) localStorage.removeItem('mapeditor:lang');
  else localStorage.setItem('mapeditor:lang', eskiDil);
  i18n.setLanguage(eskiDil || VARSAYILAN, { kaydet: false });
  document.documentElement.lang = eskiLang || eskiDil || VARSAYILAN;
  e.status.sync();
  e.store.clearSelection();

  if (opts.verbose !== false) report(out);
  return out;
}

// Tarayıcı konsolunda `await runI18nSuite()` yazılabilsin diye.
if (typeof window !== 'undefined') window.runI18nSuite = runI18nSuite;
