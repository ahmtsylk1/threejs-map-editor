/**
 * i18n/tr.js
 * ============================================================================
 * TÜRKÇE DİL SÖZLÜĞÜ — kaynak dil.
 *
 * NEDEN BU DOSYA "KAYNAK"?
 * -----------------------
 * Eksik anahtarlarda geri düşülecek (fallback) dil budur: `I18nManager`
 * önce seçili dili, sonra bu dili, en son anahtarın kendisini dener. Yeni
 * bir metin eklerken İngilizce karşılığını unutursanız arayüz İngilizce
 * olduğunda boşluk değil, Türkçe metin görünür — sessiz bir boşluktan
 * çok daha iyidir.
 *
 * ANAHTAR ADLANDIRMA
 * ------------------
 *   - Nokta ile hiyerarşi: `topbar.btn.export`
 *   - Hepsi küçük harf, ASCII, tire yok (`bedefYukseklik` gibi camelCase
 *     alan adları hariç — bunlar JSON'daki gerçek alan adlarıdır)
 *   - Metin DEĞİL anlam taşır: `btn.save` = "Kaydet". Bir çeviri güncellenirse
 *     kod değişmez.
 *
 * ÇOĞUL (PLURAL)
 * --------------
 * `{count}` değişkeni geçen anahtarlarda `.one` / `.other` biçimi kullanılır:
 *   `msg.objects.one  = '1 nesne'`
 *   `msg.objects.other = '{count} nesne'`
 * Türkçede ve İngilizcede tam sayı çoğul kuralı aynıdır (1 → one, diğer →
 * other), iki biçim yeterlidir.
 *
 * YERELLEŞTİRİLEBİLİR DEĞERLER (sayı/ tarih biçimi vb.)
 * ---------------------------------------------------
 * Biçimlendirme sözlüğe GİRMEZ; `format.js` tarafından `n()` ve `pct()`
 * yardımcılarıyla yapılır. Böylece `toLocaleString('tr')` gibi çağrılar
 * arayüzün geri kalanıyla aynı dili kullanır ve yerelleştirme tek yerde
 * yaşar.
 */

export default {
  /* =======================================================================
     UYGULAMA
     ======================================================================= */
  'app.title': 'Three.js Map Editor — 3D Harita Editörü',
  'app.brand.title': 'Map Editor',
  'app.brand.sub': 'Three.js Level Studio',
  'app.noscript': 'Bu editör JavaScript gerektirir.',
  'app.webgl.missing.title': 'WebGL desteklenmiyor',
  'app.webgl.missing.body':
    'Bu editör three.js (WebGL) kullanır. Lütfen güncel bir tarayıcıyla ' +
    've donanım hızlandırma açık olarak yeniden deneyin.',
  'app.boot.info': 'three.js ile 3D harita düzenleyici  ·  JSON dışa/içe aktarma  ·  "?" ile yardım',

  /* =======================================================================
     DİL SEÇİCİ
     ======================================================================= */
  'lang.label': 'Dil',
  'lang.tr': 'Türkçe',
  'lang.en': 'English',
  'lang.short.tr': 'TR',
  'lang.short.en': 'EN',

  /* =======================================================================
     ÜST ÇUBUK
     ======================================================================= */
  'topbar.group.mapsize': 'Harita Boyutu',
  'topbar.group.cell': 'Hücre',
  'topbar.group.view': 'Görünüm',
  'topbar.cell.title': 'Izgara hücre boyutu (birim)',
  'topbar.aria.mapsize': 'Harita boyutu',
  'topbar.aria.mode': 'Transform modu',
  'topbar.aria.space': 'Uzay',

  'topbar.view.grid': 'Izgara',
  'topbar.view.grid.title': 'Izgara (G)',
  'topbar.view.axes': 'Eksen',
  'topbar.view.axes.title': 'Eksenler (A)',
  'topbar.view.bounds': 'Sınır',
  'topbar.view.bounds.title': 'Harita sınırları (B)',
  'topbar.view.checker': 'Doku',
  'topbar.view.checker.title': 'Zemin dokusu',
  'topbar.view.snap': 'Yapış',
  'topbar.view.snap.title': 'Izgaraya yapış (X)',

  'topbar.btn.undo': 'Geri al',
  'topbar.btn.undo.title': 'Geri al (Ctrl+Z)',
  'topbar.btn.redo': 'İleri al',
  'topbar.btn.redo.title': 'İleri al (Ctrl+Y)',
  'topbar.btn.play': 'Önizle',
  'topbar.btn.play.title': 'Oyun önizlemesi (Space)',
  'topbar.btn.play.stop.title': 'Önizlemeyi durdur (Space)',
  'topbar.btn.new': 'Yeni',
  'topbar.btn.new.title': 'Yeni harita',
  'topbar.btn.save': 'Kaydet',
  'topbar.btn.save.title': 'Tarayıcıya kaydet (Ctrl+S)',
  'topbar.btn.load': 'Geri Yükle',
  'topbar.btn.load.title': 'Tarayıcıdan yükle',
  'topbar.btn.export': 'Export JSON',
  'topbar.btn.export.title': 'JSON olarak dışa aktar',
  'topbar.btn.import': 'Import',
  'topbar.btn.import.title': 'JSON proje · .npy yükseklik haritası · .smd model yükle (Ctrl+O)',
  'topbar.btn.help.title': 'Yardım / kısayollar (?)',

  'topbar.undo.with': 'Geri al: {ad}',
  'topbar.redo.with': 'İleri al: {ad}',

  /* =======================================================================
     VIEWPORT ARAÇ KUTUSU
     ======================================================================= */
  'vp.mode.translate': 'Taşı',
  'vp.mode.translate.title': 'Taşı (G / W)',
  'vp.mode.rotate': 'Döndür',
  'vp.mode.rotate.title': 'Döndür (R / E)',
  'vp.mode.scale': 'Boyutlandır',
  'vp.mode.scale.title': 'Boyutlandır (T / S)',
  'vp.space.world': 'World',
  'vp.space.world.title': 'Dünya uzayı',
  'vp.space.local': 'Local',
  'vp.space.local.title': 'Yerel uzay',
  'vp.rotSnap.title': 'Dönüş adımı (derece)',

  'vp.btn.focus': 'Odakla',
  'vp.btn.focus.title': 'Seçime odaklan (F)',
  'vp.btn.frameAll': 'Tüm Harita',
  'vp.btn.frameAll.title': 'Tüm haritayı çerçeçe al (Home)',
  'vp.btn.topView': 'Üst',
  'vp.btn.topView.title': 'Üstten görünüm (7)',

  'vp.hint.mouse':
    'Sol tık: seç · Shift+Sol tık: çoklu seçim · Sağ tık: yörünge · ' +
    'Orta tık: kaydır · Tekerlek: yakınlaştır',
  'vp.dropHint': 'Bırakın: .npy arazi · .smd / .glb model · .json proje',

  /* =======================================================================
     PANEL BAŞLIKLARI
     ======================================================================= */
  'panel.assets': 'Asset Paneli',
  'panel.outliner': 'Sahne Ağacı',
  'panel.inspector': 'Özellikler',
  'panel.map': 'Harita Ayarları',

  /* =======================================================================
     ASSET PANELİ
     ======================================================================= */
  'asset.search.placeholder': 'Asset ara (küp, ağaç, fence, torch…)',
  'asset.search.aria': 'Asset ara',
  'asset.hint.before': 'Sahneye eklemek için',
  'asset.hint.action': 'tıkla',
  'asset.hint.or': 'veya',
  'asset.hint.action2': 'sürükle-bırak',
  'asset.hint.after': '.',

  'asset.count': '{count} asset',
  'asset.count.library': '{count} asset · {kitap} kitaplık',
  'asset.count.zero': '0 asset',
  'asset.empty': 'Eşleşen asset bulunamadı.',
  'asset.more': '… {count} model daha göster',
  'asset.cat.count': '{label} · {count}',
  'asset.cat.first': '{label} · {count} (ilk {gosterilen})',

  'asset.tip.static': '{ad}\nBoyut: {olcu}\nTıkla: ekle · Sürükle: konumlandır',
  'asset.tip.triangles': '{count} üçgen',
  'asset.tip.action': 'Tıkla: ekle · Sürükle: konumlandır',
  'asset.tip.kat': 'Kategori',
  'asset.tip.ucgen': 'Üçgen',
  'asset.tip.kose': 'Köşe',
  'asset.tip.mesh': 'Mesh',
  'asset.tip.boyut': 'Boyut',
  'asset.tip.doku': 'Doku',
  'asset.tip.animasyon': 'Animasyon',
  'asset.tip.kemik': 'Kemik',
  'asset.tip.ktx2': 'KTX2 doku (Basis)',
  'asset.tip.meshopt': 'Meshopt sıkıştırma',
  'asset.tip.nothumb': 'Önizleme yok (fallback ikon kullanılıyor)',
  'asset.tip.warn': '⚠ {not}',
  'asset.unit.mb': '{size} MB',
  'asset.unit.kb': '{size} KB',

  /* --- asset kategorileri ------------------------------------------------ */
  'asset.cat.basic': 'Temel Geometri',
  'asset.cat.nature': 'Doğa',
  'asset.cat.structure': 'Yapı & Dekor',
  'asset.cat.game': 'Oyun Nesneleri',
  'asset.cat.light': 'Işık & Kamera',
  'asset.cat.imported': 'İçe Aktarılan',

  /* --- asset adları ------------------------------------------------------ */
  'asset.name.cube': 'Küp',
  'asset.name.box': 'Kutu',
  'asset.name.sphere': 'Küre',
  'asset.name.cylinder': 'Silindir',
  'asset.name.cone': 'Koni',
  'asset.name.torus': 'Halka',
  'asset.name.plane': 'Düzlem',
  'asset.name.stairs': 'Merdiven',
  'asset.name.tree': 'Ağaç',
  'asset.name.pine': 'Çam',
  'asset.name.bush': 'Çalı',
  'asset.name.rock': 'Kaya',
  'asset.name.mountain': 'Dağ',
  'asset.name.water': 'Su',
  'asset.name.house': 'Ev',
  'asset.name.tower': 'Kule',
  'asset.name.wall': 'Duvar',
  'asset.name.platform': 'Platform',
  'asset.name.bridge': 'Köprü',
  'asset.name.crate': 'Kasa',
  'asset.name.barrel': 'Varil',
  'asset.name.fence': 'Çit',
  'asset.name.torch': 'Meşale',
  'asset.name.npc': 'NPC',
  'asset.name.playerSpawn': 'Oyuncu Doğuş',
  'asset.name.npcSpawn': 'NPC Doğuş',
  'asset.name.waypoint': 'Waypoint',
  'asset.name.trigger': 'Trigger',
  'asset.name.portal': 'Portal',
  'asset.name.pickup': 'Toplanabilir',
  'asset.name.chest': 'Sandık',
  'asset.name.barrier': 'Bariyer',
  'asset.name.cameraMarker': 'Kamera Noktası',
  'asset.name.pointLight': 'Nokta Işık',
  'asset.name.spotLight': 'Spot Işık',
  'asset.name.ambientLight': 'Ortam Işığı',
  'asset.name.terrain': 'Arazi',
  'asset.name.importedMesh': 'İçe Aktarılan Mesh',
  'asset.name.importedLib': 'Dış Model',

  /* =======================================================================
     INSPECTOR
     ======================================================================= */
  'inspector.chip.none': 'Seçim yok',
  'inspector.chip.count': '{count} nesne',

  'inspector.empty.title': 'Nesne seçilmedi',
  'inspector.empty.body':
    'Sahneden bir nesneye tıklayın ya da soldaki asset panelinden yeni bir ' +
    'nesne ekleyin. Seçili nesnenin konum, rotasyon, ölçek ve oyun alanları ' +
    'burada düzenlenir.',

  'inspector.type.multi': 'Çoklu seçim',
  'inspector.type.external': 'Dış model · {kategori}',
  'inspector.type.category': 'kategori',
  'inspector.sub.count': '{count} farklı nesne',

  'inspector.group.transform': 'Dönüşüm',
  'inspector.group.appearance': 'Görünüm',
  'inspector.group.props': 'Oyun Alanları',
  'inspector.group.info': 'Nesne Bilgisi',

  'inspector.field.name': 'Ad',
  'inspector.field.tag': 'Etiket',
  'inspector.field.position': 'Konum',
  'inspector.field.rotation': 'Rotasyon (°)',
  'inspector.field.scale': 'Ölçek',
  'inspector.field.color': 'Renk',
  'inspector.field.castShadow': 'Gölge At',
  'inspector.field.receiveShadow': 'Gölge Al',
  'inspector.axis.title': '{axis} ekseni',

  'inspector.btn.reset': 'Sıfırla',
  'inspector.btn.snapGround': 'Yere İndir',
  'inspector.btn.focus': 'Odakla',
  'inspector.btn.hide': 'Gizle',
  'inspector.btn.show': 'Göster',
  'inspector.btn.lock': 'Kilitle',
  'inspector.btn.unlock': 'Kilidi Aç',
  'inspector.btn.duplicate': 'Çoğalt',
  'inspector.btn.delete': 'Sil',
  'inspector.btn.npcJump': 'En Yakın Waypoint\'e Atla',

  'inspector.placeholder.auto': 'otomatik',
  'inspector.mixed': '{count} nesne',

  'inspector.info.type': 'Tip',
  'inspector.info.category': 'Kategori',
  'inspector.info.role': 'Rol',
  'inspector.info.worldPos': 'Dünya Konumu',
  'inspector.info.footprint': 'Taban Ölçüsü',
  'inspector.info.id': 'Kimlik',
  'inspector.info.external': 'Dış model · {bicim}',
  'inspector.info.measuring': 'hesaplanıyor…',
  'inspector.info.heightOnly': 'y = {yukseklik} birim',

  'inspector.history.transform': 'dönüşüm',
  'inspector.history.color': 'renk',

  'role.prop': 'prop',
  'role.actor': 'aktör',
  'role.marker': 'işaret',
  'role.zone': 'bölge',
  'role.light': 'ışık',
  'role.item': 'eşya',

  /* =======================================================================
     SAHNE AĞACI (OUTLINER)
     ======================================================================= */
  'outliner.btn.selectAll': 'Tümü',
  'outliner.btn.selectAll.title': 'Tümünü seç (Ctrl+A)',
  'outliner.btn.delete': 'Sil',
  'outliner.btn.delete.title': 'Seçili sil (Del)',
  'outliner.empty.title': 'Sahne boş',
  'outliner.empty.body':
    'Soldaki asset panelinden bir nesne seçin veya sürükleyip haritaya bırakın.',
  'outliner.btn.visible.title': 'Görünürlük',
  'outliner.btn.hide': 'Gizle',
  'outliner.btn.show': 'Göster',
  'outliner.btn.lock': 'Kilitle',
  'outliner.btn.unlock': 'Kilidi aç',

  /* =======================================================================
     HARİTA AYARLARI PANELİ
     ======================================================================= */
  'map.field.size': 'Boyut (birim)',
  'map.field.groundColor': 'Zemin rengi',
  'map.field.gridColor': 'Grid rengi',
  'map.field.fog': 'Saydamlık',

  'map.stat.size': 'Boyut',
  'map.stat.cells': 'Birim',
  'map.stat.objects': 'Nesne',
  'map.stat.spawns': 'NPC / Nokta',

  /* =======================================================================
     DURUM ÇUBUĞU
     ======================================================================= */
  'status.objects': 'Nesne: {count}',
  'status.selection': 'Seçim: {count}',
  'status.hover': 'Üzerinde: {ad}',
  'status.playing': 'ÖNİZLEME',
  'status.fps': '{fps} fps',
  'status.pointer.empty': 'x: -  y: -  z: -',

  /* =======================================================================
     MODAL (genel)
     ======================================================================= */
  'modal.close': 'Kapat',
  'modal.close.title': 'Kapat',
  'modal.cancel': 'Vazgeç',
  'modal.confirm': 'Onayla',

  /* =======================================================================
     HARİTA BOYUTU DİYALOĞU
     ======================================================================= */
  'mapsize.title': 'Harita boyutu {size}',
  'mapsize.toast': 'Harita boyutu {size} birime ayarlandı · {etiket}',
  'mapsize.label.keep': 'Yerleşimi koru',
  'mapsize.label.scale': 'Ölçekle',
  'mapsize.label.clear': 'Temizle',
  'mapsize.label.change': 'Değiştir',
  'mapsize.desc.keep': 'Nesneler aynı koordinatlarda kalır; harita sınırı değişir.',
  'mapsize.desc.scale': 'Tüm nesneler {oran}x oranında küçültülür/büyütülür.',
  'mapsize.desc.clear': 'Tüm nesneler silinir, boş harita oluşur.',
  'mapsize.desc.change': '{size} birimlik yeni harita oluştur.',
  'mapsize.warn.empty': 'Sahne boş — değişiklik doğrudan uygulanacak.',
  'mapsize.body.count': 'Sahnede {count} nesne var. Yeni boyuta geçerken mevcut yerleşimle ne yapılsın?',
  'mapsize.body.empty': 'Sahne boş; yeni boyuta geçilebilir.',
  'mapsize.result.keep': 'yerleşim korundu',
  'mapsize.result.scale': 'yerleşim ölçeklendi',
  'mapsize.result.clear': 'sahne temizlendi',

  /* =======================================================================
     JSON DIŞA / İÇE AKTARMA
     ======================================================================= */
  'export.title': 'JSON dışa aktar',
  'export.opt.compact': 'Yalnızca metadata + önizleme (önerilen)',
  'export.opt.compact.desc':
    'Arazi verisi 64×64 önizlemeye indirgenir; .smd modelleri kaynak metin ' +
    'olarak yazılır. Dosya küçük kalır.',
  'export.opt.full': 'Ham yükseklik haritalarını da göm',
  'export.opt.full.desc':
    'Tüm .npy verisi base64 olarak yazılır — kayıpsız ama dosya boyutu ' +
    'büyük olabilir.',
  'export.cancel': 'İptal',
  'import.title': 'JSON içe aktar',
  'import.ok': '{count} nesne yüklendi',
  'import.failed': '{count} dosya yüklenemedi: {adlar}',
  'import.restore': '{count} içe aktarılmış içerik geri yüklendi',
  'import.restore.degraded':
    '{count} içerik için veri eksik (önizleme kullanıldı)',
  'import.ok.title': 'Proje yüklendi',
  'import.ok.body': '{count} nesne sahneye yerleştirildi. {not}',
  'import.confirm': 'Yükle',
  'import.confirm.body':
    '“{ad}” yüklenecek: {count} nesne, {boyut} birimlik harita. ' +
    'Mevcut {mevcut} nesneniz silinecek.',
  'import.cancel': 'İptal',

  /* =======================================================================
     KAYDET / GERİ YÜKLE / YENİ
     ======================================================================= */
  'save.ok': 'Tarayıcıya kaydedildi',
  'save.fail': 'Kaydedilemedi: tarayıcı depolaması dolu olabilir',
  'load.notFound': 'Kayıtlı harita bulunamadı',
  'load.corrupt': 'Kayıt bozuk',
  'load.ok': 'Kayıtlı harita yüklendi',
  'load.restored': 'Son çalışma geri yüklendi',
  'new.title': 'Yeni harita',
  'new.body':
    'Sahnedeki tüm nesneler silinecek ve 2048 birimlik boş bir harita oluşturulacak.',
  'new.ok': 'Yeni harita oluşturuldu',
  'new.confirm': 'Yeni Harita',
  'new.cancel': 'Vazgeç',

  /* =======================================================================
     YARDIM VE KISAYOLLAR
     ======================================================================= */
  'help.title': 'Yardım ve Kısayollar',
  'help.sec.keys': 'Klavye',
  'help.sec.mouse': 'Fare',
  'help.sec.formats': 'İçe Aktarım Biçimleri',
  'help.sec.terrain': 'Arazi (.npy)',
  'help.sec.model': 'Model (.smd)',
  'help.sec.external': 'Dış Veri',
  'help.sec.json': 'JSON Yapısı',

  'help.key.g': 'Taşı modu',
  'help.key.r': 'Döndürme modu',
  'help.key.t': 'Ölçekleme modu',
  'help.key.q': 'World / Local uzay değiştir',
  'help.key.x': 'Izgaraya yapışma',
  'help.key.f': 'Seçime odaklan',
  'help.key.home': 'Tüm haritayı çerçeçe al',
  'help.key.7': 'Üstten görünüm',
  'help.key.h': 'Panelleri gizle/göster',
  'help.key.space': 'Oyun önizlemesi',
  'help.key.del': 'Seçili nesneleri sil',
  'help.key.ctrld': 'Çoğalt',
  'help.key.ctrla': 'Tümünü seç',
  'help.key.ctrlz': 'Geri al',
  'help.key.ctrls': 'Tarayıcıya kaydet',
  'help.key.ctrle': 'JSON dışa aktar',
  'help.key.ctrlo': 'Dosya içe aktar (.json / .npy / .smd)',
  'help.key.esc': 'Seçimi kaldır',
  'help.key.slash': 'Asset araması',
  'help.key.ctrly': 'İleri al',

  'help.mouse.left': 'Nesne seç',
  'help.mouse.shift': 'Çoklu seçim',
  'help.mouse.orbit': 'Kamerayı döndür',
  'help.mouse.pan': 'Kaydır (pan)',
  'help.mouse.zoom': 'Yakınlaştır',
  'help.mouse.scrub': 'Değeri kaydırarak değiştir',
  'help.mouse.assetDrag': 'Haritaya bırak',
  'help.mouse.fileDrag': '.npy / .smd / .json yükle',

  'help.fmt.json': 'Proje dosyası (sahneyi değiştirir)',
  'help.fmt.npy': 'NumPy yükseklik haritası → Arazi (terrain)',
  'help.fmt.smd': 'Valve Source modeli → BufferGeometry',
  'help.fmt.glb': '3B model → Meshopt + KTX2 destekli',

  'help.terrain.body':
    'Yükseklik alanı 0..1 aralığına normalize edilip mesh köşelerine yazılır ' +
    '(bilinear örnekleme). Yükseklik Ölçeği, Bölüm, Arazi Boyutu, renk rampası ' +
    've eş yükselti (contour) ayarları Inspector\'dadır.',
  'help.model.body':
    'Üçgen/köşe/normal/UV blokları çözülür. Kaynak metin önbellekte saklandığı ' +
    'için JSON\'a gömüldüğünde model kayıpsız yeniden üretilebilir.',

  'help.ext.cached': 'Önbellekteki içerik',
  'help.ext.terrain': 'Arazi',
  'help.ext.model': 'Model',

  /* =======================================================================
     BİLDİRİM VE HATA MESAJLARI
     ======================================================================= */
  'msg.deleted': '{count} nesne silindi',
  'msg.deleted.locked': '{count} kilitli atlandı',
  'msg.locked.delete': 'Kilitli nesneler silinemez',
  'msg.asset.unknown': 'Bilinmeyen asset: {id}',
  'msg.asset.added': '{ad} eklendi ({x}, {z})',
  'msg.library.missing': 'Kitaplıkta bu model yok: {id}',
  'msg.library.nomesh':
    '"{ad}" içinde mesh yok (yalnızca animasyon verisi) — görünmez bir ' +
    'nesne eklendi.',
  'msg.terrain.flat': 'Uyarı: yükseklik haritası düz (tüm değerler aynı). Arazi düz oluşturuldu.',
  'msg.terrain.nan': '{count} geçersiz değer (NaN/Inf) bulundu ve 0 sayıldı.',
  'msg.grid.flat': 'Uyarı: ızgara düz (tüm değerler aynı). Arazi düz oluşturuldu.',
  'msg.grid.nan': '{count} geçersiz değer (NaN) bulundu ve 0 sayıldı.',
  'msg.preview.noNpc': 'Önizleme için sahneye en az bir NPC ekleyin',
  'msg.npc.moved': '{ad} en yakın waypoint\'e taşındı',
  'msg.npc.noWaypoint': 'Yarıçap içinde waypoint bulunamadı',
  'msg.file.unreadable': 'Dosya okunamadı',
  'msg.webgl.lost': 'WebGL bağlamı kayboldu, sayfayı yenileyin',
  'msg.model.failed': '{ad}: {hata}',
  'msg.i18n.missing': 'Eksik çeviri anahtarı: {anahtar}',

  /* --- içe aktarma / dışa aktarma raporları ----------------------------- */
  'msg.gltf.loaded': '{ad} yüklendi · {ucgen} üçgen · {mesh} mesh · {kb} KB',
  'msg.gltf.anim': ' · {count} animasyon',
  'msg.terrain.created': 'Arazi oluşturuldu: {genislik}×{yukseklik} → {bolum}² bölüm',
  'msg.smd.loaded': 'Model yüklendi: {ad} · {ucgen} üçgen, {kose} köşe, {grup} grup',
  'msg.warn.count': ' · {count} uyarı',
  'msg.bgrid.read': 'İkili ızgara okundu: {coz}×{coz} → {bolum}² bölüm',
  'msg.bgrid.skipped': ' · {mb} MB okunmadı',
  'msg.exported': '{count} nesne dışa aktarıldı ({kb} KB)',
  'msg.exported.embedded': ' · {count} içerik gömüldü',
  'msg.exported.preview': ' · {count} içerik önizleme olarak',
  'msg.saved.withSize': 'Tarayıcıya kaydedildi ({kb} KB)',
  'msg.saved.previewOnly': ' · {count} içerik yalnızca önizleme olarak',
  'msg.library.missingManifest':
    '{count} dış model kitaplıkta bulunamadı (manifest eksik olabilir: ' +
    'node tools/scan-assets.mjs).',
  'msg.library.sessionOnly':
    '{count} model yalnızca bu oturumda geçerliydi (dosya sunucuya ' +
    'kopyalanmadı). Yeniden yüklemek için dosyayı viewport\'a sürükleyin.',
  'msg.project.invalid': 'Geçersiz proje dosyası.',

  /* =======================================================================
     INSPECTOR ALAN ETİKETLERİ  ·  prop.<assetId>.<schemaKey>
     -----------------------------------------------------------------------
     Anahtarlar asset kimliğiyle AYRIŞTIRILMIŞTIR, sadece alan adıyla değil.

     NEDEN? `waypoint.radius` = "Yarıçap" ama `portal.radius` =
     "Aktivasyon Yarıçapı"; `torch.intensity` = "Yoğunluk" ama
     `spotLight.intensity` = "Yoğunluk". Alan adına göre tekilleştirmek
     ya çakıştırır ya da "portal.radius" adı altında yanlış metni gösterir.
     Bu blok `catalog.js` içindeki normalizasyon adımıyla EŞLEŞMEK ZORUNDA:
     `propsSchema` girdilerine `labelKey = prop.<assetId>.<key>` yazılır.
     ======================================================================= */

  /* --- Su ---------------------------------------------------------------- */
  'prop.water.wave': 'Dalga Hızı',
  'prop.water.deepColor': 'Derin Renk',

  /* --- Meşale ------------------------------------------------------------ */
  'prop.torch.intensity': 'Yoğunluk',
  'prop.torch.distance': 'Menzil',

  /* --- NPC --------------------------------------------------------------- */
  'prop.npc.npcName': 'NPC Adı',
  'prop.npc.role': 'Rol',
  'prop.npc.speed': 'Hız',
  'prop.npc.health': 'Can',
  'prop.npc.patrolRadius': 'Devriye Yarıçapı',
  'prop.npc.autoPatrol': 'Otomatik Devriye',
  'prop.npc.loopPatrol': 'Waypoint Döngüsü',
  'propopt.npc.role.neutral': 'Tarafsız',
  'propopt.npc.role.friendly': 'Dost',
  'propopt.npc.role.enemy': 'Düşman',
  'propopt.npc.role.merchant': 'Tüccar',
  'propopt.npc.role.quest': 'Görev Veren',

  /* --- Oyuncu Doğuş ------------------------------------------------------ */
  'prop.playerSpawn.playerIndex': 'Oyuncu No',
  'prop.playerSpawn.yaw': 'Yön (°)',
  'prop.playerSpawn.team': 'Takım',

  /* --- NPC Doğuş --------------------------------------------------------- */
  'prop.npcSpawn.spawnType': 'Tip',
  'prop.npcSpawn.count': 'Adet',
  'propopt.npcSpawn.spawnType.guard': 'Muhafız',
  'propopt.npcSpawn.spawnType.villager': 'Kasabalı',
  'propopt.npcSpawn.spawnType.enemy': 'Düşman',
  'propopt.npcSpawn.spawnType.animal': 'Hayvan',

  /* --- Waypoint ---------------------------------------------------------- */
  'prop.waypoint.order': 'Sıra',
  'prop.waypoint.pause': 'Bekleme (sn)',
  'prop.waypoint.radius': 'Yarıçap',

  /* --- Trigger ----------------------------------------------------------- */
  'prop.trigger.action': 'Tetik Olayı',
  'prop.trigger.once': 'Sadece Bir Kez',
  'prop.trigger.target': 'Hedef Obj. Adı',
  'propopt.trigger.action.onEnter': 'Girişte',
  'propopt.trigger.action.onExit': 'Çıkışta',
  'propopt.trigger.action.teleport': 'Işınla',
  'propopt.trigger.action.damage': 'Hasar',
  'propopt.trigger.action.dialogue': 'Diyalog',

  /* --- Portal ------------------------------------------------------------ */
  'prop.portal.destination': 'Hedef Sahne',
  'prop.portal.radius': 'Aktivasyon Yarıçapı',
  'prop.portal.bidirectional': 'Çift Yönlü',

  /* --- Toplanabilir ------------------------------------------------------ */
  'prop.pickup.itemId': 'Öğe Kodu',
  'prop.pickup.amount': 'Adet',
  'prop.pickup.respawn': 'Yeniden Doğar',

  /* --- Sandık ------------------------------------------------------------ */
  'prop.chest.lootTable': 'Ganim Tablosu',
  'prop.chest.locked': 'Kilitli',

  /* --- Bariyer ----------------------------------------------------------- */
  'prop.barrier.autoBreak': 'Otomatik Kırılır',
  'prop.barrier.hp': 'Dayanıklılık',

  /* --- Kamera Noktası ---------------------------------------------------- */
  'prop.cameraMarker.fov': 'FOV',
  'prop.cameraMarker.dolly': 'Yumuşatma',
  'prop.cameraMarker.active': 'Aktif',

  /* --- Nokta Işık -------------------------------------------------------- */
  'prop.pointLight.intensity': 'Yoğunluk',
  'prop.pointLight.distance': 'Menzil',
  'prop.pointLight.decay': 'Sönüm',
  'prop.pointLight.lightColor': 'Işık Rengi',

  /* --- Spot Işık --------------------------------------------------------- */
  'prop.spotLight.intensity': 'Yoğunluk',
  'prop.spotLight.distance': 'Menzil',
  'prop.spotLight.angle': 'Açı (°)',
  'prop.spotLight.penumbra': 'Yumuşaklık',

  /* --- Ortam Işığı ------------------------------------------------------- */
  'prop.ambientLight.intensity': 'Yoğunluk',
  'prop.ambientLight.lightColor': 'Işık Rengi',

  /* --- Arazi ------------------------------------------------------------- */
  'prop.terrain.source': 'Kaynak Dosya',
  'prop.terrain.heightMode': 'Yükseklik Modu',
  'prop.terrain.heightBase': 'Referans Düzlem',
  'prop.terrain.heightScale': 'Yükseklik Ölçeği',
  'prop.terrain.flipRows': 'Satır Yönünü Ters Çevir',
  'prop.terrain.terrainSize': 'Arazi Boyutu',
  'prop.terrain.segments': 'Bölüm (eksen)',
  'prop.terrain.waterLevel': 'Su Seviyesi (boş = otomatik)',
  'prop.terrain.beachWidth': 'Kıyı Bandı (birim)',
  'prop.terrain.waterColor': 'Su Rengi',
  'prop.terrain.sandColor': 'Kıyı / Kum Rengi',
  'prop.terrain.lowColor': 'Alçak Renk',
  'prop.terrain.midColor': 'Orta Renk',
  'prop.terrain.highColor': 'Yüksek Renk',
  'prop.terrain.peakColor': 'Zirve Renk',
  'prop.terrain.contourStep': 'Eş Yükselti Adımı',
  'prop.terrain.wireframe': 'Tel Kafes',
  'prop.terrain.flatShading': 'Düz Gölgelendirme',
  'propopt.terrain.heightMode.absolute': 'Mutlak (dünya birimi)',
  'propopt.terrain.heightMode.normalized': 'Normalize (0-1 sıkıştır)',

  /* --- İçe Aktarılan Mesh ------------------------------------------------ */
  'prop.importedMesh.source': 'Kaynak Dosya',
  'prop.importedMesh.modelName': 'Model Adı',
  'prop.importedMesh.triangles': 'Üçgen',
  'prop.importedMesh.vertexCount': 'Köşe',
  'prop.importedMesh.groupCount': 'Grup',
  'prop.importedMesh.boneCount': 'Kemik Ağırlığı',
  'prop.importedMesh.convertSource': 'Source Koordinat Sistemi',

  /* --- Dış Model (paylaşılan kitaplık şeması) --------------------------- */
  'prop.importedLib.source': 'Kaynak Dosya',
  'prop.importedLib.kitapKategori': 'Kitaplık Kategorisi',
  'prop.importedLib.bicim': 'Biçim',
  'prop.importedLib.ucgen': 'Üçgen',
  'prop.importedLib.kose': 'Köşe',
  'prop.importedLib.doku': 'Doku',
  'prop.importedLib.animasyon': 'Animasyon',
  'prop.importedLib.yukseklik': 'Ölçülen Yükseklik',
  'prop.importedLib.boyut': 'Dosya Boyutu (bayt)',
  'prop.importedLib.hedefYukseklik': 'Hedef Yükseklik (0 = 1:1)',
  'prop.importedLib.tabanDuzelt': 'Tabanı Zemine Otur',
  'prop.importedLib.not': 'Not',
};
