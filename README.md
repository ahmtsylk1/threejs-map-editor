<<<<<<< HEAD
<<<<<<< HEAD
# Three.js 3B Harita Editörü (Map Editor / Level Studio)

Web tabanlı oyunlar için **Three.js** ile yazılmış, **Vanilla JavaScript / ES6
modülleri** ile yapılandırılmış modern bir 3B harita editörü.

* 2048 / 1024 / 512 birimlik **dinamik harita boyutu**
* Sol panelde **Asset Paneli** (tıkla veya sürükle-bırak ile ekleme)
* Sağ panelde **Özellik Paneli (Inspector)**: konum / rotasyon / ölçek + oyun alanları
* **TransformControls** ile taşıma, döndürme, ölçekleme (çoklu seçim pivotu destekli)
* **JSON dışa/içe aktarma**, tarayıcıya otomatik kayıt
* **Geri al / İleri al** (undo-redo), klavye kısayolları, sahne ağacı
* **Önizleme (play) modu**: NPC'ler waypoint'ler arasında devriye yapar
* **2048/1024/512 ölçekli grid**, prosedürel zemin dokusu, sınır çerçevesi

---

## 1. Çalıştırma

ES6 modülleri `file://` üzerinden yüklenemediği için bir HTTP sunucusu gerekir.

```bash
# Seçenek A (önerilen) - önbelleksiz geliştirme sunucusu, port 5174
python dev_server.py

# Seçenek B - Node (npx ile, kurulum gerektirmez)
npx serve . -l 5173

# Seçenek C - Python (standart)
python -m http.server 5173

# Seçenek D - VS Code
# "Live Server" eklentisi ile index.html dosyasını açın
```

Ardından tarayıcıda açın: <http://localhost:5174>

> **Neden `dev_server.py`?** Tarayıcılar ES6 modüllerini agresif biçimde
> önbelleğe alır; kaynak kodu değiştirdikten sonra eski dosya sunulabiliyor.
> `dev_server.py` her yanıta `Cache-Control: no-store` ekler, böylece her
> yenilemede güncel kod yüklenir.
>
> Sunucu **çok iş parçacıklı** ve bağlantı kuyruğu geniştir
> (`request_queue_size = 256`). Bunlar süs değil, zorunlu: sayfa açılışında
> tarayıcı paralel bağlantılar açıyor ve Asset Panel tek seferde ~355
> thumbnail isteği gönderiyor. Python'un varsayılanı tek iş parçacıklı sunucu
> ve 5 bağlantılık kuyruk bu yük altında `ERR_CONNECTION_REFUSED` üretiyor —
> uygulamanın bir kısmı hiç yüklenmeden açılıyor.

> `three` ve `three/addons` CDN'den (unpkg) yüklenir; `node_modules` gerekmez.
> Çevrimdışı çalışmak için `index.html` içindeki importmap'i yerel kopyalara
> yönlendirin.

---

## 2. Dosya yapısı

```
threejs-map/
├─ index.html                 # Layout (topbar / sol panel / viewport / sağ panel)
├─ dev_server.py              # Önbelleksiz geliştirme sunucusu
├─ package.json
├─ css/
│  └─ style.css               # Tasarım değişkenleri + tüm arayüz stilleri
├─ testdata/                  # Regresyon testi verileri (.npy / .smd örnekleri)
└─ js/
   ├─ main.js                 # Giriş noktası, dil hazırlığı, WebGL kontrolü
   ├─ scene/
   │  ├─ Viewport.js          # Renderer, kamera, OrbitControls, ışık, sky, sis, FPS
   │  ├─ GridSystem.js        # Dinamik zemin + GridHelper + sınır + eksen
   │  ├─ SelectionManager.js  # Raycast, hover, seçim kutuları
   │  └─ TransformTool.js     # TransformControls sarmalayıcı (çoklu seçim pivotu)
   ├─ core/
   │  ├─ EventBus.js          # Pub-sub altyapısı
   │  ├─ Store.js             # Tek doğru kaynak: harita + nesne kayıtları + seçim
   │  ├─ ObjectRegistry.js    # id -> Object3D eşlemesi (O(1) raycast çözümü)
   │  └─ I18nManager.js       # Aktif dil, t(key), DOM tarama, localStorage
   ├─ i18n/
   │  ├─ tr.js                # Türkçe sözlük (KAYNAK + geri düşülecek dil)
   │  ├─ en.js                # İngilizce sözlük
   │  ├─ index.js             # Dil kaydı, tarayıcı dili önerisi
   │  └─ format.js            # Dil duyarlı sayı/yüzde biçimleme
   ├─ assets/
   │  ├─ catalog.js           # Asset metadata (ad, ikon, props şeması, footprint)
   │  └─ AssetFactory.js      # Asset kodlarından Object3D ağaçları üretir
   ├─ editor/
   │  ├─ Editor.js            # Orkestratör: tüm modülleri bağlar
   │  ├─ History.js           # Snapshot tabanlı undo/redo
   │  ├─ Topbar.js            # Üst çubuk
   │  ├─ AssetPanel.js        # Sol üst: asset ızgarası + arama
   │  ├─ Outliner.js          # Sol alt: sahne ağacı
   │  ├─ Inspector.js         # Sağ: özellik paneli (scrub'lu sayı alanları)
   │  └─ StatusBar.js         # Alt: durum çubuğu + istatistikler
   ├─ io/
   │  ├─ ProjectIO.js         # JSON dışa/İçe aktarma, doğrulama, localStorage
   │  ├─ NPYParser.js         # .npy binary heightmap parser (saf JS, three.js bağımsız)
   │  ├─ SMDParser.js         # Valve .smd ASCII model parser → BufferGeometry
   │  ├─ BinaryGridParser.js  # [uint32 N][N×N float32] ikili ızgara (SEZGİSEL)
   │  ├─ TerrainSystem.js     # Heightmap → arazi mesh (vertex displacement)
   │  ├─ ExternalAssets.js    # Store DIŞINDA ağır ikili veri deposu
   │  └─ ImportRouter.js      # İçerik denetimli parser yönlendirme
   ├─ game/
   │  └─ NPCSystem.js         # Önizleme modunda basit devriye simülasyonu
   ├─ utils/
   │  ├─ dom.js               # el(), ikonlar, toast, modal, sürükle-bırak
   │  └─ math.js              # clamp, snap, format, dönüşüm yardımcıları
   ├─ tools/                 # Node betikleri (derleme zamanı işleri)
   │  ├─ scan-assets.mjs      # Dış projeden tarar → kopyalar → manifest ürerir
   │  ├─ fetch-transcoder.mjs # KTX2 transcoder'ı indirir (three.js ile eşleş)
   │  ├─ generate-thumbs.mjs  # Her model için 128×128 PNG thumbnail ürerir
   │  ├─ thumbnail-harness.html # Puppeteer'ın render sayfası
   │  ├─ test-terrain.js      # Tarayıcıda çalışan regresyon testi (98 test)
   │  │                       #   await import('/tools/test-terrain.js')
   │  │                       #   → runTerrainSuite()
   │  ├─ test-i18n.js         # Tarayıcıda çalışan i18n testi (65 test)
   │  │                       #   await import('/tools/test-i18n.js')
   │  │                       #   → runI18nSuite()
   │  ├─ test-modal-fit.js    # Node/Puppeteer: modal'ın 7 ekran boyutunda
   │  │                       #   sığma + kaydırma + yapışkan başlık testi
   │  ├─ test-all.mjs         # Yukarıdaki iki tarayıcı paketini soğuk sayfada
   │  │                       #   sırayla çalıştırır (tek komut, CI uyumlu)
   │  ├─ viewport-harness.html  # test-modal-fit.js'in iframe yerleştiricisi
   │  ├─ shot-modal.js        # Modalın ekran görüntüsünü PNG'ye alır
   │  └─ shot-i18n.js         # TR/EN ekran görüntüsü (düğmeye tıklayarak)
   │                           #   (geliştirici aracı; test değil)
   └─ public/                # Statik varlıklar (dev sunucusu bunları sunar)
      ├─ assets/imported/     # Taranmış modeller + imported-assets.json
      ├─ assets/thumbs/       # generate-thumbs çıktısı (PNG)
      └─ vendor/basis/        # KTX2 transcoder (.wasm + .js)
```

---

## 3. Mimari: Store ⇄ Sahne

Editörün en önemli kararı şudur: **kalıcı veri sahne nesnesinde değil,
`Store`'da tutulur.** `Object3D` yalnızca bu verinin bir görüntüsüdür.

```
kullanıcı değişikliği
        │
        ▼
Store.patchRecord(id, patch)  ──►  OBJECT_UPDATE olayı
        │                                    │
        │                                    ├─► Inspector  (değerleri tazele)
        │                                    ├─► Outliner   (satırı tazele)
        │                                    └─► Editor._syncRecordToObject()
        │                                             │
        │                                             ▼
        │                                     Object3D (position/rotation/scale)
        ▼
Export JSON  /  History snapshot
```

Bunun kazancı:

| Konu | Sonuç |
|---|---|
| JSON dışa aktarma | Sahne taranmaz, doğrudan `store.objects` yazılır |
| Undo/redo | JSON metin anlık görüntüsü; sahne yeniden kurulur |
| Çoklu seçim | Her kayıt bağımsız; toplu güncelleme tek yerde |
| Inspector | Sahne nesnesine dokunmadan veri yazar |

> **Gizmo istisnası:** `TransformControls` nesneyi doğrudan taşıdığı için
> `objectChange` olayında kayıt *sahne nesnesinden okunarak* güncellenir
> (`source: 'gizmo'`); bu durumda geri yazma yapılmaz (sonsuz döngü olurdu).

---

## 4. Harita boyutu

`Store.setMap({ size })` çağrıldığında otomatik olarak:

1. `GridSystem.setSize()` → zemin düzlemi, `GridHelper` (2048/1024/512) ve sınır yeniden kurulur
2. `Viewport.frameMap()` → kamera sınırı, gölge kamerası ve sis mesafeleri ayarlanır
3. `TransformTool.setSnap()` → yapışma adımı yeni hücre boyutuna güncellenir
4. Segment düğmeleri ve istatistikler tazelenir

Boyut değiştirilirken mevcut yerleşim için üç seçenek sunulur:

| Seçenek | Davranış |
|---|---|
| **Yerleşimi koru** | Nesneler aynı koordinatlarda kalır |
| **Ölçekle** | `yeni/eski` oranında konum ve ölçek çarpılır |
| **Temizle** | Sahne boşaltılır |

---

## 5. Klavye Kısayolları

| Tuş | İşlev |
|---|---|
| `G` / `W` | Taşı modu |
| `R` / `E` | Döndürme modu |
| `T` / `S` | Ölçekleme modu |
| `Q` | World ↔ Local uzay |
| `X` | Izgaraya yapışma |
| `A` / `B` | Eksenler / sınır çerçevesi |
| `H` | Panelleri gizle-göster |
| `F` | Seçime odaklan |
| `Home` | Tüm haritayı çerçeçe al |
| `7` | Üstten görünüm |
| `Space` | Oyun önizlemesi |
| `Del` | Seçili sil |
| `Ctrl+D` | Çoğalt |
| `Ctrl+A` | Tümünü seç |
| `Ctrl+Z` / `Ctrl+Y` | Geri al / ileri al |
| `Ctrl+S` | Tarayıcıya kaydet |
| `Ctrl+E` | JSON dışa aktar |
| `Ctrl+O` | JSON içe aktar |
| `Esc` | Seçimi kaldır |
| `/` | Asset araması |
| `?` | Yardım penceresi |

**Fare:** Sol tık seç · `Shift`+Sol tık çoklu seçim · Sağ tık yörünge ·
Orta tık kaydırma · Tekerlek yakınlaştırma.
Inspector'da bir sayı alanının **etiketine (X/Y/Z) tutup sürükle**erek değeri
kaydırabilirsiniz (`Shift` = ×10, `Ctrl` = ×0.1).

---

## 6. JSON Dosya Formatı

```json
{
  "format": "threejs-map-editor",
  "version": 1,
  "createdAt": "2026-09-27T10:15:00.000Z",
  "app": { "name": "Three.js Map Editor", "units": "birim (unit)" },
  "map": {
    "size": 2048,
    "cellSize": 8,
    "showGrid": true,
    "showAxes": true,
    "showBounds": true,
    "showChecker": true,
    "snap": true,
    "groundColor": "#1b212b",
    "gridColor": "#2b3648",
    "fog": 0.35
  },
  "objects": [
    {
      "id": "obj_m1x2y3z",
      "name": "Ağaç",
      "assetId": "tree",
      "category": "nature",
      "position": [12.5, 0, -40],
      "rotation": [0, 90, 0],
      "scale": [1, 1, 1],
      "visible": true,
      "locked": false,
      "color": "#4a9d5a",
      "castShadow": true,
      "receiveShadow": true,
      "tag": "orman",
      "props": {}
    },
    {
      "id": "obj_a1b2c3d4",
      "name": "Vezir",
      "assetId": "npc",
      "category": "game",
      "position": [0, 0, 10],
      "rotation": [0, 45, 0],
      "scale": [1, 1, 1],
      "visible": true,
      "locked": false,
      "color": "#5ec8ff",
      "castShadow": true,
      "receiveShadow": true,
      "tag": "patrol",
      "props": {
        "npcName": "Vezir",
        "role": "neutral",
        "speed": 3,
        "health": 100,
        "patrolRadius": 25,
        "autoPatrol": true,
        "loopPatrol": true
      }
    }
  ]
}
```

**Sözleşme kuralları**

* `rotation` **derece** cinsindendir (oyun motorunda okunabilirlik için);
  içe aktarımda `0..360` aralığına normalize edilir.
* `assetId` bilinmezse nesne sessizce atlanır ve uyarı verilir.
* `position` / `rotation` / `scale` dizileri 3 elemanlı olmalıdır.
* Eksik alanlar (görünürlük, renk, gölük, props) içe aktarımda tamamlanır.
* `map.size` yalnızca 2048 / 1024 / 512 kabul eder; diğer değerler en yakına
  yuvarlanır ve uyarı üretilir.

### Oyun motoruna aktarma (örnek)

```js
// Tarayıcıda açtığınız JSON dosyasını doğrudan kullanabilirsiniz.
const map = await fetch('/maps/harita_2048.json').then(r => r.json());

// three.js yüklüyse doğrudan sahneye kurabilirsiniz:
for (const o of map.objects) {
  const mesh = buildMeshFor(o.assetId);          // kendi asset üreticiniz
  mesh.position.fromArray(o.position);
  mesh.rotation.set(...o.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
  mesh.scale.fromArray(o.scale);
  scene.add(mesh);
  if (o.assetId === 'npc') agents.push({ mesh, props: o.props });
}
```

---

## 6-bis. Dosya İçe Aktarma: `.npy`, `.smd` ve ikili ızgaralar

`Import` butonu (veya viewport'a dosya sürükle-bırak) dosyayı **önce içeriğine
göre** denetler, sonra doğru parser'a yollar.

| Uzantı | İçerik denetimi | Parser | Sonuç |
|---|---|---|---|
| `.json` | — | `ProjectIO` | Sahne değiştirilir (proje yüklenir) |
| `.npy` | — | `NPYParser` + `TerrainSystem` | **Arazi** (terrain) nesnesi |
| `.smd` | `ascii-smd`? | `SMDParser` | **İçe Aktarılan Mesh** |
| `.smd` | `binary-grid`? | `BinaryGridParser` | **Arazi** (sezgisel) + uyarı |
| `.bin .raw .grid .map .dat` | her zaman | yukarıdakilerden biri | içeriğe göre karar verilir |

Aynı anda birden fazla dosya bırakılabilir. `.json` dosyaları **en son**
işlenir; aksi halde proje yüklemesi kendinden önce eklenen nesneleri silerdi.
Desteklenmeyen uzantılarda (`.npz`, `.obj`, `.fbx`, `.vmdl` …) kullanıcıya
hangi biçimlerin kabul edildiğini söyleyen net bir hata gösterilir.

> ### ⚠️ Neden içerik denetimi var?
>
> Gerçek dünyada `.smd` adı verilmiş dosyaların bir kısmı **Valve ASCII SMD
> değildir**. Üçüncü parti araçların ürettiği ikili harita dökümleri de bu
> uzantıyı kullanır. Bu dosyaları doğrudan metin parser'ına sokmak
> *"Satır 1: 'version' bekleniyordu, '<binary>' bulundu"* gibi anlamsız bir
> hata üretir ve kullanıcıyı saatlerce yanlış yönde aratır.
>
> Bu yüzden `.smd` ve belirsiz uzantılar önce ilk baytlarına bakar:
> ilk satır `version N` ise ASCII SMD, dosya `[uint32 N][N×N float32]` ile
> başlıyorsa ikili ızgara, hiçbiri değilse **ne olduğunu söyleyen** bir hata.

### `.npy` — NumPy yükseklik haritası

`NPYParser.js` tamamen bağımsızdır (three.js import etmez, Web Worker'da da
çalışır) ve şunları çözer:

* sihirli dizi (`0x93NUMPY`), sürüm 1/2/3, header uzunluğu (v1: uint16, v2/3: uint32)
* header'daki Python dict literal — **`eval()` kullanılmaz**, küçük bir
  özyinelemeli çözümleyici vardır (güvenlik: dosya içeriği dış veridir)
* `descr` dtype → `bool |b1`, `int8/16/32/64`, `uint8/16/32/64`, `float16/32/64`
  (float16 için elle IEEE-754 half → float32 dönüşümü)
* bayt sırası: `<` little, `>` big-endian, `|` sırasız
* `fortran_order` → matris transpoze edilerek C order'a getirilir
* çok boyutlu diziler: 1D → 1×N, 3D → kanal seçimi veya kanal ortalaması
* doğrulama: bozuk imza, kısa/truncated veri, aşırı büyük dizi, NaN/Inf sayımı

`TerrainSystem` heightmap'i araziye uygular:

1. `PlaneGeometry(size, size, segments, segments)` → `rotateX(-90°)`
2. her köşe için heightmap'ten **bilinear örnek** alınır → heightmap
   çözünürlüğü ile mesh bölüm sayısı birbirinden bağımsızdır (257×257'lik
   klasik Source heightmap'i 512 bölümlü araziye de sorunsun uyar)
3. `projectHeight()` ile dünya Y'sine çevrilir (aşağıdaki *Yükseklik Modu*)
4. normaller yeniden hesaplanır, köşe renkleri yüksekliğe göre boyanır

```python
# numpy ile kaydedilen her şey doğrudan yüklenir
np.save("harita.npy", heightmap.astype(np.float32))       # (257, 257)
```

### Yükseklik Modu — mutlak mı, normalize mi?

Bu ayar **en önemli** olanıdır ve yanlış seçilirse veri sessizce kaybolur.

| Mod | Formül | Ne zaman |
|---|---|---|
| **Mutlak** (varsayılan) | `y = (v − heightBase) × heightScale` | Ham `.npy` değerleri **dünya birimi** ise |
| **Normalize** | `y = (v−min)/(max−min) × heightScale` | Ham veri keyfi aralıklıysa (0–255 LUT vb.) |

> Knight Online / Source tarzı haritaların heightmap'leri genelde
> **mutlak dünya yüksekliğidir** — negatif vadiler içerir. Bu tür veriler
> `normalize` ile yüklenirse `min…max` aralığı `0…heightScale`'e sıkışır ve
> hem negatif vadiler hem de mutlak yükseklikler kaybolur. Bu yüzden varsayılan
> **mutlak**, `heightScale = 1`, `heightBase = 0`'dır: heightmap birebir dünya
> yüksekliği olur.

Örnek — gerçek bir harita `−34.74 … 51.12` aralığında:

| Ayar | Sonuç |
|---|---|
| Mutlak, ölçek 1, taban 0 | `−34.63 … 50.94` ✅ vadiler ve yükseklikler birebir |
| Normalize, ölçek 40 | `0 … 40` ⚠️ bilgi sıkıştırıldı |
| Mutlak, ölçek 2 | `−69.3 … 101.9` ✅ istenen aralık |

**Referans düzlem (`heightBase`)** en alçak noktayı 0'a taşımak için
kullanılır: `heightBase = −34.74` ile arazi `0 … 85.9` aralığına gelir.

### Su ve kıyı boyaması

`Su Seviyesi` alanı boş bırakılırsa **otomatik** mod çalışır: ham veride
negatif değer varsa `0` (deniz seviyesi), yoksa en alçak nokta. Böylece
gerçek dünya heightmap'lerinde vadiler doğal olarak su görünür, ama tamamen
pozitif veride (0–255 LUT) hiçbir alan gereksiz yere su boyanmaz.

* `y ≤ su` → **Su Rengi**
* `y ≤ su + Kıyı Bandı` → **Kıyı / Kum Rengi** (bandı dünya birimidir; ince tutulmalıdır)
* üstü → Alçak → Orta → Yüksek → Zirve rampası

### Performans: hangi değişiklik ne kadar pahalı?

`TerrainSystem` son uygulanan props'un anlık görüntüsünü tutar ve **gerçek
farkı** hesaplar (`Store.patchRecord` props nesnesinin tamamını yollar, bu
yüzden olaydan "hangi alan değişti" bilgisi çıkarılamaz). 257 bölüm (66k köşe)
için:

| Değişiklik | Yol | Maliyet |
|---|---|---|
| `heightScale` | `rescaleGeometry` — `y *= yeni/eski` | çok hızlı |
| `heightMode`, `heightBase` | `reprojectGeometry` — `aHeight`'dan Y yeniden hesap | hızlı |
| Renkler, su seviyesi, kıyı bandı | `colorizeTerrain` — yalnızca `color` | hızlı |
| Tel kafes, düz gölge | malzeme bayrağı | anlık |
| `segments`, `terrainSize`, `flipRows` | `rebuild` — yeniden örnekleme | pahalı |

Tüm istekler bir karede birleştirilir (`rAF`), böylece etiket kaydırma
sırasında kare başına yalnızca bir iş yapılır.

**Ölçek yeniden kurulumda korunur:** `displaceGeometry` yükseklik
projeksiyonunu `opts.props.heightScale` olarak okur. `opts.heightScale`
okumak her zaman `undefined` verir ve ölçeği sessizce 1'e düşürürdü — hata
yalnızca `heightScale ≠ 1` iken görünür. `tools/test-terrain.js` bunu açıkça
test eder.

### `.smd` — Valve Source modeli

`SMDParser.js` blok sırasıyla satır satır okur:

```
version 1
<triangleSayisi>
<3 × (vertexIndex  px py pz  nx ny nz  u v)>   ← 27 sayı (kanonik Valve biçimi)
<vertexSayisi>  <px py pz>
<normalSayisi>  <nx ny nz>
<texcoordSayisi><u v>
<skinWeightSayisi> / <boneWeightSayisi>       ← opsiyonel
<grupSayisi>  {  <id> <ad>  }
```

> **Köşe indeksli (27 sayı) ve indekssiz (24 sayı) biçimlerin ikisi de
> desteklenir.** İkincisinde indeksler `triangleIndex*3 + corner` ile türetilir
> ve yalnızca `numVertices === numTriangles × 3` ise tutarlıdır (uyarı verilir).

* `//` yorumları, boş satırlar, CRLF, UTF-8 BOM, `version` satırının yokluğu
* opsiyonel skin/bone blokları **ileriye dönük doğrulama** ile tanınır
  (sayı 0 ise ve ardından `{` geliyorsa bu grup sayısıdır)
* grup bloğu eksikse hata yerine uyarı üretilir
* `mode: 'auto'` → `numVertices > 0` ise **indexed** (paylaşımlı köşe) geometri,
  aksi halde `flat` (üçgen başına 3 köşe, normaller/UV'ler kesin doğru)
* `convert: 'source'` → Source (Z-yukarı, sol el) → three.js (Y-yukarı, sağ el):
  `x' = -y,  y' = z,  z' = x` (determinant +1 → üçgen sarımı korunur)
* `skinIndex` / `skinWeight` nitelikleri kemik ağırlıkları varsa üretilir
* kaynak metin `ExternalAssetCache`'te saklanır → JSON'a gömülüp geri
  yüklendiğinde model **kayıpsız yeniden üretilir**

### İkili ızgara (`.smd` / `.bin` / `.map` / …) — **sezgisel**

`BinaryGridParser.js` şu düzeni okur:

```
[uint32 N]  [N × N float32]  …(kalan baytlar yok sayılır)
```

Bu **tam bir biçim uygulaması değildir** ve bunu saklamaz. Yalnızca dosyanın
başındaki ızgarayı okur, doğrular (`N` makul mü, değerler sonlu ve makul mu,
tamamı aynı değil mi) ve kullanıcıya **ne okunduğunu ve neyin atlandığını**
açıkça söyler. Emin olunamayan durumda hata verir; asla uydurma geometri
üretmez.

> Gerçek bir örnek: Knight Online harita araçlarından gelen 3 MB'lık bir
> `.smd` dosyasının ilk 257×257 float bloğu, aynı haritanın `.npy` heightmap'i
> ile **birebir aynı min/max değerlerine** sahipti (`−34.739 … 51.115`) ve
> editöre arazi olarak alındı. Dosyanın kalan 2.7 MB'ı bu okuyucu tarafından
> işlenmedi — konsol çıktısı bunu açıkça belirtir.

### Ağır veri: Store dışı önbellek

İçe aktarılan içerik JSON'a sığmaz (2048² float32 ≈ 16 MB, base64 ≈ 22 MB).
Bu yüzden ağır veri `ExternalAssetCache`'te, `id → veri` olarak tutulur; Store
kaydında yalnızca **metadata + 64×64 önizleme** bulunur.

| Durum | JSON içeriği | Round-trip |
|---|---|---|
| `includeExternalData: false` (varsayılan) | arazi: metadata + 64×64 önizleme · mesh: **kaynak metin** | meshler kayıpsız, arazi düşük çözünürlüklü (`degraded`) |
| `includeExternalData: true` | arazi: base64 float32 (kayıpsız) · mesh: kaynak metin | tam kayıpsız |

`Export JSON` düğmesi içerik varsa hangi modun kullanılacağını sorar.
Otomatik kayıt (localStorage) her zaman hafif moddadır.

**Geri alma (undo) arazi verisini korur:** bir nesne silindiğinde cache kaydı
anında silinmez; `ExternalAssetCache.gc()` geri alma penceresi dolduktan sonra
temizler (`missCount > 64`). Aksi halde geri alınan arazi düz bir düzleme dönerdi.

### Test verisi ve regresyon testi

`testdata/` klasörü gerçek NumPy ve SMD örneklerini içerir:

```
.npy : height_257_f32/f64/f16, height_int16, height_u8, rgb_3d, fortran,
       bigendian, mask_bool, nan_inf, scalar, empty, complex (reddedilir)
.smd : plane, cube, baked (indekssiz), flipped, boned, crlf_bom, empty,
       bad_group, truncated, nan, bad_index (hepsi reddedilmeli)
user/ : gerçek dünya dosyaları (Moradon.npy, moradon.smd, …) — opsiyonel
```

**Tarayıcıda çalışan test paketi** — konsoldan:

```js
const T = await import('/tools/test-terrain.js');
await T.runTerrainSuite();          // konsola yazar, 98 test
const r = await T.runTerrainSuite({ verbose: false });
console.log(r.pass.length, r.fail); // ayrıntıyı programatik al
```

Kapsam: yükseklik modları, yeniden kurumada ölçek korunumu, undo/redo,
`sampleWorld` ↔ mesh tutarlılığı, su/kıyı, dosya yönlendirme (ASCII SMD,
bozuk SMD, `.npy`, ikili ızgara, yanıltıcı uzantı, gürültü dosyası), JSON
gidiş-dönüş, tüm asset türlerinde Inspector alan bağları ve thumbnail
davranışı (lazy-load, 404 → fallback, `draggable=false`).

> Paket **idempotenttir**: `sifirla()` tüm modül durumunu temizler, `waitFor()`
> da sabit gecikme yerine koşulu bekler. Arazi prop güncellemeleri rAF'te
> biriktirildiği (`_flushTerrainSync`) için sabit `wait()` yetersiz kalırdı.
> Testi yeni açılmış bir sekmede hemen çalıştırırsanız, sayfa bootstrap'ı
> (otomatik kayıt geri yükleme) testin kurulumuyla yarışabilir —
> `e._firstLoad` çözülene kadar bekleyin.

**Node/Puppeteer testi — modal sığma** (tarayıcı açıkça gerekmez):

```bash
python dev_server.py 5174      # ayrı bir terminalde açık olmalı
node tools/test-modal-fit.js
```

7 ekran boyutunda (1600×1000 → 1440×380) ölçer: modal 85vh'yi aşıyor mu,
başlık ve altbilgi kaydırma sırasında sabit kalıyor mu, gövde tek başına
kayıyor mu, bölüm başlıkları yapışkan mı, sütun sayısı dar ekranda düşüyor
mu, `Escape` ile kapanma korunmuş mu. **98 ölçüm, hepsi geçer.**
Pencere boyutu headless Chrome'da değiştirilemediği için editör
`tools/viewport-harness.html` içindeki iframe'e konur — iframe'in kendi
viewport'u test edilen boyuttur.

Üretmek için:

```python
import numpy as np
h = (np.sin(np.linspace(0, 12, 257))[:, None]
     * np.cos(np.linspace(0, 9, 257))[None, None] * 180 + 260).astype(np.float32)
np.save("testdata/height_257_f32.npy", h)
```

---

## 6-ter. DIŞ PROJEDEN 3B VARLIK KÜTÜPHANESİ

Başka bir projedeki `.glb` / `.gltf` / `.obj` modellerini editöre
aktarır. Süreç iki aşamalıdır:

```
┌─ DERLEME ZAMANI (Node) ─────────────────┐   ┌─ ÇALIŞMA ZAMANI (Tarayıcı) ─┐
│ tools/scan-assets.mjs                   │   │ js/io/ImportedAssetLibrary.js │
│  → tara, kopyala, manifest üret          │──▶│  → manifest oku              │
│ public/assets/imported/imported-assets. │   │  → tembel yükle (GLTFLoader) │
│ json + <kategori>/<ad>.glb              │   │  → LRU önbellek              │
└──────────────────────────────────────────┘   │  → AssetPanel kategorisi     │
                                               └─────────────────────────────┘
```

> ### ⚠️ Neden iki aşamalı?
>
> Editör tarayıcıda çalışan statik bir uygulamadır; dosya sistemine erişemez.
> "C:\...\public\models" altındaki 1390 modeli tarayıcı listeleyemez. Bu
> yüzden tarama + kopyalama + manifest üretimi **derleme zamanı** bir iştir;
> editör yalnızca üretilen `imported-assets.json` dosyasını okur.

### Kurulum

```bash
# 1) modelleri tara, kopyala ve manifest üret
node tools/scan-assets.mjs

# 2) KTX2 dokuları için transcoder'ı indir (three.js sürümüyle aynı)
node tools/fetch-transcoder.mjs

# 3) editörü başlat
python dev_server.py 5174      # → http://localhost:5174
```

Asset panelinde `World of Claudecraft` kategorileri otomatik belirir.

### Tarayıcıda oynatıcı

| Seçenek | Anlamı |
|---|---|
| `--src <yol>` | Kaynak kök dizin (varsayılan: `C:\worldofclaudecraft\world-of-claudecraft-main`) |
| `--out <yol>` | Çıktı klasörü (varsayılan: `public/assets/imported`) |
| `--limit <n>` | En fazla n model. Küçükten büyüğe sıralanır, böylece **en çok model, en az yer** kaplar |
| `--min-kb <n>` / `--max-mb <n>` | Boyut filtreleri (varsayılan: `< 8 MB`) |
| `--include "a,b"` | Yalnızca bu kaynak klasörlerini tara |
| `--exclude "a,b"` | Bu klasörleri atla (varsayılan: `test, node_modules, dist, …`) |
| `--category-depth n` | Kategoriyi kaç klasör derinlikten al (1 = doğrudan alt klasör) |
| `--no-gltf` / `--no-obj` | Belirli biçimleri kapat |
| `--clean` | Çıktı klasörünü önce boşalt |
| `--dry-run` | **Kopyalamadan** yalnızca rapor üret |
| `-v` | Her dosya için satır yaz |

Örnek:

```bash
# yalnızca mağara ve sahne eşyalarını al, en fazla 200 model
node tools/scan-assets.mjs --include "dungeon,props" --limit 200

# önce ne olacağını gör
node tools/scan-assets.mjs --include dungeon --limit 200 --dry-run
```

### Sıkıştırma: Meshopt ve KTX2

Taranan kitaplığın **1249 modeli `EXT_meshopt_compression`**, **1191 modeli
`KHR_texture_basisu`** kullanıyor ve bunları `extensionsRequired` içinde
bildiriyor. Bu iki eklenti olmadan modellerin çoğu **yüklenemez**:

| Eklenti | Ne yapar | Çözücü |
|---|---|---|
| `EXT_meshopt_compression` | Vertex buffer'larını sıkıştırır | `MeshoptDecoder` |
| `KHR_texture_basisu` | Dokuları Basis/KTX2 olarak sıkıştırır | `KTX2Loader` + transcoder |

`fetch-transcoder.mjs`, transcoder'ı **three.js sürümüyle aynı** olacak şekilde
indirir ve `.wasm` dosyasının gerçekten WebAssembly olduğunu doğrular. CDN'den
çalışma zamanında çekmek yerine projeye indirilmesi bilinçlidir: sürüm
tutarsızlığı sessizce bozuk doku üretir ve çevrimdışı çalışmaz.

> Kaynak projenin kendi yükleyicisi de birebir aynı iki çağrıyı yapıyor
> (`src/render/assets/loader.ts`), yani bu kurulum onunla aynı davranışı verir.

### Bellek: 1390 model, 24 tanesi bellekte

Modeller **tembel** yüklenir — sahnede olan indirilir. Yüklenenler LRU
önbellekte tutulur ve **geometri/malzeme örnekler arası paylaşılır**:

```
200 adet ağaç  →  1 dosya indirilir, 1 geometri, 1 malzeme, 200 düğüm
```

`clone()` materyalleri de klonladığı için `instantiate()` bunu açıkça geri
alar (`object.getObjectByName`). Bu bilinçli bir seçimdir: her kopyaya ayrı
doku yüklemek 200 × doku belleği demektir.

### Ölçek: modeller bu haritada küçük

Kitaplık modelleri **yard/metre ölçeğinde** yazılmıştır (ölçülen medyan
~1.2 birim: bir kalkan 0.88, bir sütun 1.5×4×1.5). Bu haritada ise 1 birim
bir ızgara hücresidir (varsayılan 8), dolayısıyla modeller küçük görünür.

Bu yüzden Inspector'da **Hedef Yükseklik** alanı vardır:

| Ayar | Sonuç |
|---|---|
| `0` (varsayılan) | 1:1 — hiçbir şey değişmez |
| `3` | model 3 birim yüksekliğe ölçeklenir, `scale` kayda yazılır |

Sessizce ölçeklemek **seçilmemiştir**: ölçeğe duyarlı yerleşim yapan projelerde
(düşman çarpışma kutuları, kapı boşlukları) "modelim neden 3 kat büyük?"
sorusunu sormadan ölçek değiştirmek hataya yol açar.

> **`KHR_mesh_quantization` tuzağı:** bu eklenti kullanıldığında accessor
> `min/max` değerleri **kuantize uzaydadır**, dünya birimi değildir — tipik
> olarak `65534` gibi anlamsız sayılar çıkar. Tarayıcı manifest'te
> `sinirGuvenilir: false` işaretler ve editör gerçek sınırı modeli
> **yüklendikten sonra** ölçer.

### Hata ve yol yönetimi

| Durum | Davranış |
|---|---|
| **Ad çakışması** | Çıktı klasöründe `fence.glb` → `fence_2.glb`. Kaynak proje **değiştirilmez**; orijinal yol manifest'te `kaynak` alanında saklanır |
| **Bozuk GLB** | Sihirli dizi / sürüm / chunk boyutu doğrulanır; geçersizse `sorunlar.atlanan` listesine gider ve kopyalanmaz |
| **Eksik dizin** | `✗ Kaynak dizin bulunamadı` + `--src` ipucu, çıkış kodu 1 |
| **Eksik KTX2 transcoder** | Manifest yine üretilir; yalnızca KTX2 dokulu modeller yüklenemez ve bu **açıkça** bildirilir |
| **Manifest yok** | Editör **normal çalışır**, kategori boş kalır, konsola tek satır bilgi düşer |
| **Bırakılan yerel dosya** | Proje JSON'unda `imp:serbest_*` olarak taşınır ama sunucuda karşılığı yoktur. Yeni oturumda çözülemez; kayıt **kaybolmaz**, "yeniden sürükleyin" notuyla durur |
| **Sayfa yenileme** | `_bootstrap()` kütüphane manifest'i **yüklendikten sonra** çalışır; yoksa kayıtlı modeller çözülemeden hata verirdi |

### Sürükle-bırak ile tekil dosya

`viewport`'a doğrudan `.glb` / `.gltf` / `.obj` bırakmak da çalışır. Bu dosyalar
sunucuya kopyalanmaz, yalnızca o oturumda geçerlidir; kitaplıktaki modellerin
`imported-assets.json` ile kalıcıdır.

```js
const T = await import('/tools/test-terrain.js');
await T.runTerrainSuite();   // 98 test: arazi + dış kütüphane + thumbnail
```

**Tüm tarayıcı paketlerini tek komutla çalıştırmak** için:

```bash
python dev_server.py 5174      # ayrı terminalde açık olmalı
node tools/test-all.mjs        # 163 test: arazi (98) + i18n (65)
```

`test-all.mjs` her paketi **soğuk** bir sayfada (yeni sekme, boş
localStorage) çalıştırır. Böylece "ilk koşu bozuk" durumu — geçmişte arazi
testinde görülen, yalnızca taze yüklemede ortaya çıkan kararsızlık — yakalanır.

---

### Thumbnail (görsel önizleme) üretimi

`tools/generate-thumbs.mjs`, manifestteki her modeli **izole bir sahnede**
yükleyip 128×128 PNG üretir ve yolu manifeste `thumb` alanı olarak yazar.

```bash
npm install                      # puppeteer (tek geliştirme bağımlılığı)
node tools/generate-thumbs.mjs   # veya:  npm run thumbs
```

**Neden Puppeteer?** Kitaplık `EXT_meshopt_compression` (vertex buffer) ve
`KHR_texture_basisu` (Basis/KTX2 doku) eklentilerini zorunlu kılıyor. Bu iki
çözücüyü saf Node'da yazmak (meshopt + basis transcoder) hem çok büyük hem de
three.js'teki uygulamayla birebir aynı olmaz. Gerçek bir tarayıcı motoru üç
şeyi bedavaya getirir: GLTFLoader'ın tam sürümü, gerçek WebGL ve transcoder'ın
WebAssembly'i.

Betik kendi **geçici HTTP sunucusunu** açar (port 0 → çakışma imkânsız) ve
`file://` kaynaklı CORS/WASM sorunlarını böylece ortadan kaldırır. three.js
sürümü `index.html` importmap'inden okunur; transcoder ile sürüm eşleşmezse
dokular sessizce bozulur.

#### Oynatıcı

| Seçenek | Anlamı |
|---|---|
| `--size <n>` | Kare boyutu (varsayılan 128) |
| `--limit <n>` | En fazla n model |
| `--include "a,b"` | Yalnızca bu kategoriler |
| `--par <n>` | Eşzamanlı tarayıcı sayfası (varsayılan çekirdek−1, en fazla 3) |
| `--azimut <°>` | Kamera yatay açısı (varsayılan 35 — 3/4 görünüm) |
| `--egim <°>` | Kamera dikey açısı (varsayılan 22) |
| `--doluluk <0-1>` | Kadraj doluluğu (varsayılan 0.82) |
| `--ters-normal` | Normal haritası ters çözülüyorsa |
| `--yeniden` | (varsayılan) güncel thumbnail'ları atla |
| `--hepsini` | Tümünü yeniden üret |
| `--size 256` | Retina panel için büyük thumbnail |
| `-v` | Model bazlı çıktı |

```bash
# hızlı önizleme: tek kategori, büyük görsel
node tools/generate-thumbs.mjs --include dungeon --limit 40 --size 256

# kamera açısını değiştirip hepsini yeniden üret
node tools/generate-thumbs.mjs --azimut 45 --egim 30 --hepsini
```

#### Render kuralları

* **Otomatik kadraj** — modeller 0.15–7 birim aralığında değişken. Kamera her
  modelin sınır kutusuna göre yeniden ayarlanır; elmasla sütun aynı kadraj
  payını alır.
* **Sabit ışıklandırma** — 3 noktalı yönlü + dolgu + ortam. Model başına
  değişen ışık, 400 thumbnail'ın karşılaştırılabilir olmasını bozardı.
* **Şeffaf arka plan** — PNG arka plansızdır; koyu panelde de açık panelde de
  okunur.
* **İzolasyon + dispose** — her modelden sonra geometri, malzeme ve **doku**
  serbest bırakılır. KTX2 dokularının çözümü o kadar hızlıdır ki temizlik
  yapılmazsa Chrome birkaç yüz modelde çöker.

#### Sonuç ve hata yönetimi

```
üretilen   : 353        (355 thumbnail dosyası, 2.9 MB, ort. 8.4 KB)
atlanan    : 2          (zaten güncel)
hatalı     : 45         → hepsi "mesh yok (yalnızca animasyon/iskelet)"
```

Üretilemeyen modeller **tüm işi çöpe atmaz**; manifestte `sorunlar.thumbnail`
altında listelenir. "Mesh yok" sonucu için `meshVar: false` **geri yazılır** —
böylece düzenleyici bu dosyaları mesh'li sanmaz, kullanıcı sahneye ekleyip boş
nesne görmez.

#### Panelde gösterim ve performans

`AssetPanel._createThumb()` her kart için bir `<img>` yerleştirir:

| Öznitelik | Neden |
|---|---|
| `loading="lazy"` | Görsel yalnızca kadraja **girdiğinde** indirilir. 400 kart olsa bile görünen ~20 tanesi istek yapar. |
| `decoding="async"` | PNG decode'u ana iş parçacığını bloklamaz |
| `width` / `height` | Görsel yüklenmeden önce yer ayrılır; yüzlerce kartın yeniden yerleşim (layout thrash) yapmasını engeller |
| `draggable="false"` | Kartın sürükle-bırak davranışı bozulmaz |

Ayrıca:

* **Shimmer iskeleti** — `loading="lazy"` yüzünden henüz indirilmemiş kartlar
  sabit gri kutuyla değil, hareketli gradyanla "bekliyor" sinyali verir.
  `prefers-reduced-motion` açıksa animasyon durur.
* **Fallback** — thumbnail üretilmemiş (bozuk model, mesh'siz dosya) ya da
  dosya 404 döndürmüşse küp ikonuna düşer. `error` olayı `once` ile bağlanır,
  bozuk `<img>` DOM'dan kaldırılır.
* **`content-visibility: auto`** — kart görünür alana girmeden önce içeriği
  **çizilmez**; `contain-intrinsic-size` kaydırma çubuğunun sıçramasını önler.

Ölçülen: 89 kart DOM'da, yalnızca **21** görsel indirildi (kadrajda görünenler),
sıfır bozuk görsel.

---

## 6-quater. ÇOK DİLLİ ARAYÜZ (i18n)

Editör Türkçe ve İngilizce arasında geçiş yapar. Dil üst çubuğun sağ
ucundaki **TR ⇄ EN** düğmesinden değiştirilir, `localStorage`'da saklanır ve
sayfa yeniden açıldığında geri gelir.

### Neden dil `Store`'da değil?

`Store` **haritanın** durumudur ve `ProjectIO` ile JSON'a yazılır. Arayüz
dili ise bir kullanıcı **tercihidir**, proje verisi değildir: haritayı
İngilizce okuyan birine "Türkçe görünümünde açıldı" demek yanlış olur.
Bu yüzden dil ayrı bir kaynakta (`I18nManager`) tutulur ve JSON'a **girmez**.

Harita ayarlarının aksine — ızgara rengi, hücre boyutu, zemin rengi —
bunlar projenin parçasıdır ve `Store`'da kalır.

### Dosyalar

```
js/i18n/tr.js               Türkçe sözlük — KAYNAK ve geri düşülecek dil
js/i18n/en.js               İngilizce sözlük
js/i18n/index.js            Dil kaydı, tarayıcı dili önerisi
js/i18n/format.js           n() / pct() — dil duyarlı sayı biçimleme
js/core/I18nManager.js      Aktif dil, t(key), DOM tarama, localStorage
```

### Çözümleme sırası

```js
i18n.t('status.objects', { count: 1234 })
```

1. aktif dil · `status.objects.one`    (yalnızca `count` verildiyse)
2. aktif dil · `status.objects.other`
3. aktif dil · `status.objects`         → çoğul / varsayılan biçim
4. **geri düşülecek dil** (Türkçe) · aynı üç deneme
5. anahtarın kendisi + konsol uyarısı

Bulunamayan anahtar **boş dönmez** — anahtarın kendisini döner ve `MISSING`
olayı yayınlar. Boş string, "arayüz bozuk" ile "çeviri eksik" ayrımını
imkânsız kılardı; `topbar.btn.export` yazan bir kutu hatayı kendi bildirir.

### Çoğul (plural)

**Türkçede çoğul eki yoktur** — "1 nesne" ile "5 nesne" aynı yazılır. Bu
yüzden TR sözlüğünde `.one` **gerekmez** ve yazılmaz. İngilizcede isim
çoğullandığı için `.one` + düz anahtar (çoğul) kullanılır:

```js
// tr.js  — tek biçim yeter
'status.objects': 'Nesne: {count}',

// en.js  — tekil + çoğul
'status.objects.one':   'Object: {count}',
'status.objects':       'Objects: {count}',
```

`tools/test-i18n.js` şu kuralı denetler: İngilizce bir anahtarda `{count}`
hemen ardından `s` ile biten bir isim geliyorsa `.one` **vardır** — aksi
hâlde "1 objects" gibi bir gramer hatası üretilirdi.

### Yeni metin eklerken

1. Anahtarı **anlam** taşısın, metni değil: `btn.save` = "Kaydet". Bir
   çeviri güncellenirse kod değişmez.
2. Sözlüğe **iki dile** de ekleyin. Eksik düz anahtar, o dilde başka bir
   dile düşer ve kullanıcı karışık dil görür — test bunu yakalar.
3. Sayı içeriyorsa `.one` gerekip gerekmediğini düşünün.
4. `data-i18n` yalnızca **çocuk düğümü olmayan** öğelere konur. Aksi hâlde
   `textContent` yazımı ikonları/etiketleri silerdi; `I18nManager` bunu
   bilerek atlar ve konsola uyarı yazar.

### DOM yenileme: iki katman

Dil değişince arayüzü tazelemek iki farklı yol gerektirir:

| Katman | Kapsam | Nasıl |
|---|---|---|
| **Tarama** | Statik metin ve öznitelikler: `index.html`'deki `data-i18n` / `data-i18n-attr`, `el()` ile üretilen düğümler | `I18nManager.apply()` tüm belgeyi tarar |
| **Yeniden çizim** | Hesaplanmış metin: "Nesne: 12", "Kategori: biyom", "3 kilitli atlandı" | Bileşen `i18n.register('inspector', …)` ile geri çağrı kaydeder |

Neden sadece tarama yetmez? "Nesne: 12" metninin `12` değeri DOM'da değil,
`Store`'dadır; tarama onu yeniden üretemez. Neden sadece yeniden çizim
yeter? `title` / `placeholder` gibi öznitelikler ve düğme etiketleri
bileşen yeniden çizilmeden değişmeli; üstelik yeniden çizim, kullanıcının
odakladığı bir `<input>` değerini sıfırlayabilir.

Sıra önemlidir: önce tarama, sonra yeniden çizim. Ters sırada tarama,
bileşenin yeni düğümlerini göremez.

### `el()` entegrasyonu

```js
el('span', { i18n: 'topbar.btn.save' })
el('input', { i18nAttr: { title: 'topbar.btn.load.title' } })
el('span', { i18n: 'status.objects', i18nArgs: { count: 12 } })
```

Üretilen düğümler `data-i18n` ile işaretlenir, taramaya kendiliğinden katılır.
JS'in ürettiği metinleri çeviriye sokmanın en ucuz yolu budur.

### Asset kataloğu

`catalog.js` içindeki Türkçe `name` / `label` alanları **kaynak metindir**;
sözlüğe girmez. Dosya sonundaki normalizasyon adımı her kayda kimliğinden
türetilen anahtar basar:

```
asset.nameKey      = asset.name.<id>
category.labelKey  = asset.cat.<id>
schema.labelKey    = prop.<assetId>.<schemaKey>
option.labelKey    = propopt.<assetId>.<schemaKey>.<value>
```

Anahtar **asset kimliğiyle ayrıştırılır**, sadece alan adıyla değil:
`waypoint.radius` "Yarıçap" iken `portal.radius` "Aktivasyon Yarıçapı"tır.
Alan adına göre tekilleştirmek ya çakıştırır ya da yanlış metni gösterir.

Yeni alan eklerken anahtar **otomatik** üretilir; eksiklik yalnızca "sözlükte
karşılığı yok" olarak ortaya çıkar ve test onu raporlar.

### Açık modal pencereler

`openModal` gövdeyi bir kez kurar; dil değişirse bayat kalırdı. Çözüm:
`opts.html` bir **fonksiyon** olarak da verilebilir, `refreshOpenModal()`
onu yeniden çağırır. Yardım penceresi bu yolu kullanır
(`Editor._helpHtml`), böylece açık pencere de anında çevrilir ve kaydırma
konumu korunur.

### Konsol / hata ayıklama

```js
const { i18n, I18N_EVENT } = await import('/js/core/I18nManager.js');

i18n.on(I18N_EVENT.MISSING, (a) => console.log('eksik:', a));
i18n.on(I18N_EVENT.CHANGE, ({ language }) => console.log('dil:', language));

i18n.language          // 'tr' | 'en'
i18n.languages         // seçici için [{ kod, ad, bayrak }]
i18n.setLanguage('en') // olay yayınlar + DOM uygulanır
i18n.toggleLanguage()  // TR ⇄ EN
i18n.exists('btn.save')
```

### Test

```bash
python dev_server.py 5174
node tools/test-all.mjs        # iki paketi soğuk sayfada çalıştırır (163 test)
```

Ya da tarayıcı konsolundan:

```js
const T = await import('/tools/test-i18n.js');
await T.runI18nSuite();       // 65 test
```

Kapsam: sözlük paritesi (iki dil), şablon/yer tutucu paritesi, çoğul
seçimi, geri düşüş zinciri, DOM'daki **her** `data-i18n` anahtarının
çözülebilirliği, `el()` entegrasyonu, katalog şema etiketleri, Inspector /
Outliner / AssetPanel / StatusBar yeniden çizimi, localStorage kalıcılığı,
bozuk kayıt toleransı, açık modalin yeniden kurulması, sayı biçimlendirme ve
"DOM'da ham anahtar metni kalmadığı" denetimi.

### Yeni dil eklerken

1. `js/i18n/<kod>.js` sözlüğü oluştur (TR'yi kopyala, çevir).
2. `DILLER` dizisine `{ kod, ad, metin }` olarak ekle.
3. `test-i18n.js`'deki parite denetimini güncelle: yeni dilin **düz**
   anahtarlarının TR'de karşılığı olmalıdır.

---

## 7. Asset Kataloğu

`js/assets/catalog.js` içindeki `ASSETS` dizisi tek yapılandırma noktasıdır:

```js
{
  id: 'npc',                    // JSON'a yazılan kod
  name: 'NPC',
  category: 'game',             // panel grubu
  footprint: [1, 2.1, 1],       // bilgi panelinde gösterilen taban ölçüsü
  color: '#5ec8ff',             // varsayılan renk
  role: 'actor',                // prop | actor | marker | zone | light
  icon: '<svg …>',              // panel ikonu
  propsSchema: [ … ],           // Inspector'da üretilecek alanlar
  defaultProps: { … }           // yeni nesneye uygulanan değerler
}
```

Yeni bir asset eklemek için:

1. `catalog.js` içine tanım ekleyin (ikon ve props şemasıyla)
2. `AssetFactory.js` içindeki `BUILDERS` sözlüğüne aynı `id` ile bir üretici
   ekleyin (`nt()` = renk değişimine duyarsız parça, `part()` = duyarlı parça)

Mevcut asset'ler: Küp, Kutu, Küre, Silindir, Koni, Halka, Düzlem, Merdiven,
Ağaç, Çam, Çalı, Kaya, Dağ, Su, Ev, Kule, Duvar, Platform, Köprü, Kasa, Varil,
Çit, Meşale, **NPC**, Oyuncu Doğuş, NPC Doğuş, **Waypoint**, Trigger, Portal,
Toplanabilir, Sandık, Bariyer, Kamera Noktası, Nokta/Spot/Ambient Işık.

---

## 8. Oyun Nesneleri (NPC akışı)

1. `NPC` ekleyin, konumunu gizmo ile ayarlayın
2. Yoluna `Waypoint` nesneleri koyun (sıra numarası Inspector'dan verilir)
3. NPC'nin `Devriye Yarıçapı` değerini waypoint'leri kapsayacak şekilde ayarlayın
4. `Space` ile **önizlemeyi** başlatın; NPC'ler `Hız` değerine göre yürür, +Z
   yönüne döner ve waypoint başında `Bekleme` kadar durur
5. Önizlemeden çıkınca konumlar **otomatik geri alınır** — deneme veri kaybettirmez

`props` alanları doğrudan JSON'a yazıldığı için, kendi oyun motorunuzda
patrol mantığını aynı alanlardan besleyebilirsiniz.

---

## 9. Performans Notları

* Zemin dokusu **gri tonlu** üretilir ve `material.color` ile renklendirilir;
  zemin rengini değiştirmek dokuyu yeniden üretmez.
* Dama deseni 2×2 bir `CanvasPattern` ile tek seferde serilir (hücre başına
  `fillRect` yoktur).
* `GridHelper` renkleri geometri yeniden kurulmadan `color` niteliğine yazılır
  (GridHelper'ın renk düzeni belirlenimcidir: her bölme için 4 verteks).
* `Object3D` aramaları `ObjectRegistry` ile O(1) yapılır (ağaç taraması yok).
* `OBJECT_UPDATE` olayı yalnızca **gerçekten değişen alanları** taşır; gizmo
  sürüklemesi sırasında renk/gölük/ışık yeniden uygulanmaz.
* `Outliner` nesne güncellemesinde tüm listeyi değil yalnızca değişen satırı
  tazeler.
* `AmbientLight`/`HemisphereLight` nesnelerine `castShadow` atanmaz; atansaydı
  three.js her karede uyarı basardı.
* Otomatik kayıt 2,5 sn debounce ile yapılır.
* Ölçülen değer: 101 nesne / ~13k üçgen → 60 FPS.

## 10. Bilinen Sınırlar

* Dokunmatik düzenleme hedeflenmemiştir (arayüzü dar ekranda sadeleşir).
* Çoklu seçimde ölçekleme, `pivot` üzerinden oransal çalışır; ölçeklenmiş
  nesnelerin *yerel* konumları pivot'a göreli tutulur, **dünya** konumları her
  zaman kayıtlarla birebir eşleşir.
* TransformControls'ın sürükleme matematiği three.js'e aittir; bu proje yalnızca
  gizmo ↔ kayıt köprüsünü (`source: 'gizmo'`) yönetir.
* Çarpışma (collision) hesabı yoktur; `trigger`/`portal` bölgeleri yalnızca
  görsel + veri olarak tutulur.
* `BinaryGridParser` **sezgisel** bir okuyucudur: yalnızca dosyanın başındaki
  `[uint32 N][N×N float32]` bloğunu okur, kalan baytları atlar. Üçüncü parti
  araçların tamamını çözebilmek için o aracın format açıklaması gerekir.
  Konsol çıktısı atlanan bayt sayısını açıkça bildirir.
* Arazi `Su Seviyesi` ve `Kıyı Bandı` yalnızca **görsel** renklendirmedir;
  gerçek su/su birimi üretmez.
* Referans ızgara `y = 0` düzlemindedir. Mutlak modda arazi bu düzlemin altına
  inebilir; ızgarayı görsel gürültü olarak buluyorsanız üst çubuktaki
  `Izgara` düğmesiyle kapatabilirsiniz.

---

## 11. Tarayıcı Desteği

Chrome / Edge / Firefox / Safari güncel sürümleri (WebGL2). Mobil dokunmatik
düzenleme hedeflenmemiştir; arayüz dar ekranlarda 1180 px ve 900 px kırılım
noktalarıyla sadeleşir.

---

## Lisans

**MIT** — telif sahibi: [ahmtsylk1](https://github.com/ahmtsylk1) · tam metin: [`LICENSE`](LICENSE)

Bu depo **üçüncü taraf içerik de** içerir ve yeniden dağıtır. MIT lisansı,
telif bildiriminin kopyalarda korunmasını şart koşar; ilgili bildirimler
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) dosyasındadır:

| İçerik | Konum | Telif / Lisans |
|---|---|---|
| 400 adet `.glb` model | `public/assets/imported/` | Copyright (c) 2026 Levy Street — MIT (World of Claudecraft v0.43.3) |
| Basis transcoder (`.wasm` + `.js`) | `public/vendor/basis/` | three.js r160 — MIT |
| Render motoru | CDN'den (depoda yok) | three.js — MIT |
| Sentez test verisi | `testdata/*` | Bu depoya ait (sentetik) |
| ⚠️ Gerçek dünya heightmap'leri | `testdata/user/` | **Kaynak doğrulanmamış** — halka açık yapmadan önce aşağıya bakın |

> **`testdata/user/` uyarısı.** Bu klasördeki 7 dosya (Moradon, Luferson,
> Elmorad, Ronarkland, Ardream, Eslant — ~6.7 MB) gerçek dünya verisidir ve
> kökeni belgelenmemiştir. Test paketi bu klasörü kullanır ama **zorunlu
> değildir**; yoksa ilgili testler sessizce atlanır ve kalan testler geçer.
> Depoyu herkese açık yapmadan önce ya lisansını doğrulayın ya da
> `git rm -r --cached testdata/user` ile çıkarın.
=======
# threejs-map-editor
Modern web-based 3D level editor built with Three.js with NPY/SMD import, automated thumbnails, and store-driven architecture.
>>>>>>> c893348f5a05ec0505cb8e42ac93b4d83c310dcf
=======

>>>>>>> 9236b0979a2985f6d0b4a71eee4b07a1789b4d0a
