# ÜÇÜNCÜ TARAF YAZILIM BİLDİRİMLERİ

Bu depo, **MIT lisansı** altında dağıtılmaktadır (bkz. [LICENSE](LICENSE)).
MIT lisansı, yazılımın kopyalarında veyasubstantial bölümlerinde telif
bildiriminin **korunmasını** şart koşar. Aşağıda, bu depoda yeniden
dağıtılan üçüncü taraf içeriklerin kaynakları ve telif bildirimleri
verilmiştir.

> Bu dosya `LICENSE` dosyasının **yerine geçmez**. Kendi kodunuzun lisansı
> `LICENSE` dosyasındadır; buradaki bildirimler yalnızca size ait olmayan
> içerikleri kapsar.

---

## 1. World of Claudecraft — 3B model kütüphanesi

| | |
|---|---|
| **Kapsam** | `public/assets/imported/` altındaki **400 `.glb` model** (12 kategori, ~10.3 MB) ve `imported-assets.json` manifesti |
| **Kaynak** | `world-of-claudecraft` v0.43.3 |
| **Lisans** | MIT |
| **Telif** | Copyright (c) 2026 Levy Street |

Bu modeller `tools/scan-assets.mjs` betiğiyle taranmış, **değiştirilmeden**
kopyalanmıştır. Betik dosyaları yeniden adlandırma, ölçekleme veya yeniden
dışa aktarma yapmaz; yalnızca kopyalar ve bir manifest üretir.

Orijinal lisans metni:

```
MIT License

Copyright (c) 2026 Levy Street

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. three.js — render motoru ve Basis transcoder

| | |
|---|---|
| **Kapsam** | `public/vendor/basis/basis_transcoder.wasm` (488 KB) ve `basis_transcoder.js` (61 KB) |
| **Kaynak** | three.js **r160** — `three/examples/jsm/libs/basis/` |
| **Lisans** | MIT (three.js) |
| **İndiren** | `tools/fetch-transcoder.mjs` |

Bu iki dosya, kitaplıktaki **1190 modelin `KHR_texture_basisu` (KTX2/Basis)
dokularını** çözebilmek için gereklidir. Sürüm, `index.html` içindeki
importmap ile **birebir eşleşecek** şekilde indirilir; farklı bir three.js
sürümünün transcoder'ı, WASM arayüzü değiştiği için çalışmaz.

three.js çalışma zamanında CDN'den (unpkg) yüklenir ve depoda **bulunmaz**:

```
https://unpkg.com/three@0.160.0/build/three.module.js
https://unpkg.com/three@0.160.0/examples/jsm/
```

---

## 3. Test verisi — `testdata/`

Bu klasördeki dosyalar **projenin regresyon testlerinin girdisidir** ve
üçüncü taraf lisansına tabi değildir:

* `testdata/*.npy`, `testdata/*.smd` — bu depo için **sentetik olarak
  üretilmiş** test dosyalarıdır. Kasıtlı olarak bozuk, kesik, NaN içeren,
  çok baytlı (big-endian), Fortran sıralı ve CRLF/BOM'lu örnekler
  içerirler. Parser'ın hatalı girdiyi **reddettiğini** doğrularlar.

### ⚠️ `testdata/user/` — doğrulanması gereken içerik

Bu alt klasör gerçek dünya heightmap verisi içerir:

```
Ardream.npy · Elmorad.npy · Eslant.npy · Luferson.npy
Moradon.npy · moradon.smd · Ronarkland.npy          (toplam ~6.7 MB)
```

Dosya adları oyun dünyası yer adlarına işaret eder; bu verinin **kökeni ve
lisansı bu depoda belgelenmemiştir.** Test paketi bu klasörü kullanır ancak
**zorunlu değildir** — yoksa ilgili testler atlanır:

```js
const varMi = async (yol) => (await fetch(yol, { method: 'HEAD' })).ok;
```

Bu nedenle, deponun **halka açık** hâle getirilmesi planlanıyorsa iki seçenek
vardır:

1. **Lisansını doğrulayıp** bu satırları güncelleyin, ya da
2. `testdata/user/` klasörünü depodan çıkarın:
   ```bash
   echo "testdata/user/" >> .gitignore
   git rm -r --cached testdata/user
   ```
   Test paketi bu klasörü yokluğunda ilgili testleri sessizce atlar; geri
   kalan 98 test geçmeye devam eder.

---

## 4. Çalışma zamanı bağımlılıkları (depoda değil)

| Paket | Lisans | Kullanım |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) r160 | MIT | Render motoru, OrbitControls, TransformControls |
| [Puppeteer](https://github.com/puppeteer/puppeteer) ^25.12.0 | Apache-2.0 | **Yalnızca** `devDependencies` — thumbnail üretimi ve testler için, tarayıcıya dağıtılmaz |

Üretim çalışma zamanı bağımlılığı **yalnızca three.js**'tir. Puppeteer
geliştirme ortamına özeldir ve `node_modules/` altında tutulur (depoda yok).
