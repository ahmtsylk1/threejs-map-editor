/**
 * catalog.js
 * ---------------------------------------------------------------------------
 * Asset PANELİ veri tabanı. Her kayıt şunları içerir:
 *   - id            : benzersiz kod (JSON'a yazılır)
 *   - name          : görünen ad
 *   - category      : paneldeki grup
 *   - icon          : satır içi SVG gövdesi
 *   - footprint     : [genişlik, yükseklik, derinlik] (varsayılan ölçü / taban)
 *   - instantiable  : sahneye tek başına konabilir mi
 *   - propsSchema   : Inspector'da gösterilecek özel alanlar
 *   - defaultProps  : yeni nesneye uygulanacak varsayılan özel alanlar
 *
 * NOT: Gerçek 3B geometriler AssetFactory.js içinde üretilir; burada sadece
 *      meta veri ve arayüz tanımları bulunur.
 *
 * ---------------------------------------------------------------------------
 * i18n
 * ---------------------------------------------------------------------------
 * Bu dosyadaki `name` / `label` alanları **Türkçe kaynak metindir** ve
 * çeviri SÖZLÜĞÜNE girmez. Bunun yerine aşağıdaki normalizasyon adımı her
 * kayda bir anahtar basar:
 *
 *     asset.nameKey          = `asset.name.<id>`
 *     category.labelKey      = `asset.cat.<id>`
 *     schema.labelKey        = `prop.<assetId>.<schemaKey>`
 *     option.labelKey        = `propopt.<assetId>.<schemaKey>.<value>`
 *
 * Inspector ve Outbar `labelKey` varsa onu, yoksa `label`'ı kullanır. Yani
 * sözlük eksikse arayüz TÜRKÇEye düşer (sessiz boşluk olmaz) ve
 * `tools/test-i18n.js` eksik anahtarı raporlar.
 *
 * Şema anahtarı ASSET KİMLİĞİYLE AYRIŞTIRILIR, sadece alan adıyla değil:
 * `waypoint.radius` "Radius" iken `portal.radius` "Activation Radius"tır.
 * Alan adına göre tekilleştirmek ya çakıştırır ya da yanlış metni gösterir.
 *
 * Yeni alan eklerken sözlüğe de eklemeyi UNUTMAYIN: `labelKey` elle
 * yazılmadığı için test paketi eksik anahtarı yakalar.
 */
import { i18n } from '../core/I18nManager.js';

/** SVG yardımcı: 24x24 viewBox, currentColor. */
const I = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** Asset kategorileri (panel sırası). */
export const CATEGORIES = [
  { id: 'basic',    label: 'Temel Geometri' },
  { id: 'nature',   label: 'Doğa' },
  { id: 'structure',label: 'Yapı & Dekor' },
  { id: 'game',     label: 'Oyun Nesneleri' },
  { id: 'light',    label: 'Işık & Kamera' },
  { id: 'imported', label: 'İçe Aktarılan' },
];

/** Inspector alan şemaları için kısa kurucular. */
const num  = (key, label, def, min, max, step = 0.1) => ({ key, label, type: 'number', def, min, max, step });
/**
 * Boş bırakılabilir sayı alanı.
 *
 * `def = null` ise alan BAŞTAN boş görünür ve boş bırakıldığında `null`
 * saklanır. Bu, "otomatik" gibi davranışları sayısal bir alanla temsil
 * etmenin en dürüst yoludur: 0 yazarak kullanıcı, otomatik davranışı
 * farkında olmadan kapatmış olurdu.
 */
const numN = (key, label, min, max, step = 0.1) =>
  ({ key, label, type: 'number', def: null, min, max, step, nullable: true });
const txt  = (key, label, def) => ({ key, label, type: 'text', def });
const sel  = (key, label, def, options) => ({ key, label, type: 'select', def, options });
const chk  = (key, label, def) => ({ key, label, type: 'checkbox', def });
const col  = (key, label, def) => ({ key, label, type: 'color', def });

/**
 * Tüm asset tanımları.
 * @type {Array<Object>}
 */
export const ASSETS = [
  /* ------------------------------------------------------------------ */
  /* TEMEL GEOMETRİ                                                     */
  /* ------------------------------------------------------------------ */
  {
    id: 'cube', name: 'Küp', category: 'basic', footprint: [1, 1, 1], color: '#c3cddb',
    icon: I('<path d="M12 2.8 20.5 7.4v9.2L12 21.2 3.5 16.6V7.4L12 2.8Z"/><path d="M12 12 20.5 7.4M12 12v9.2M12 12 3.5 7.4" opacity=".6"/>'),
  },
  {
    id: 'box', name: 'Kutu', category: 'basic', footprint: [4, 1, 1], color: '#b3bfcd',
    icon: I('<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M3 12h18" opacity=".6"/>'),
  },
  {
    id: 'sphere', name: 'Küre', category: 'basic', footprint: [2, 2, 2], color: '#9fb4cc',
    icon: I('<circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="8" ry="3" opacity=".55"/><path d="M12 4a13 13 0 0 0 0 16a13 13 0 0 0 0-16" opacity=".55"/>'),
  },
  {
    id: 'cylinder', name: 'Silindir', category: 'basic', footprint: [1.6, 3, 1.6], color: '#8fa6bf',
    icon: I('<ellipse cx="12" cy="6" rx="6" ry="2.6"/><path d="M6 6v12c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6V6"/><path d="M6 18c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6" opacity=".6"/>'),
  },
  {
    id: 'cone', name: 'Koni', category: 'basic', footprint: [1.8, 2.6, 1.8], color: '#7f97b2',
    icon: I('<ellipse cx="12" cy="19" rx="7" ry="2.8"/><path d="M12 3.5 5 19"/><path d="M12 3.5 19 19"/>'),
  },
  {
    id: 'torus', name: 'Halka', category: 'basic', footprint: [2, 2, 2], color: '#9db0c6',
    icon: I('<ellipse cx="12" cy="12" rx="9" ry="5.5"/><ellipse cx="12" cy="12" rx="3.6" ry="1.8"/>'),
  },
  {
    id: 'plane', name: 'Düzlem', category: 'basic', footprint: [8, 0.1, 8], color: '#5c6b7f', flat: true,
    icon: I('<path d="m12 4 8.5 4.4L12 12.8 3.5 8.4 12 4Z"/><path d="M12 12.8v7.2L3.5 15.6V8.4" opacity=".55"/><path d="M12 12.8 20.5 8.4v7.2L12 20" opacity=".55"/>'),
  },
  {
    id: 'stairs', name: 'Merdiven', category: 'basic', footprint: [4, 2, 4], color: '#a9b6c6',
    icon: I('<path d="M3 20h5v-4h4v-4h4V8h5"/><path d="M3 20v-2M20 8v12" opacity=".5"/><rect x="3" y="8" width="4" height="4" rx=".5"/>'),
  },

  /* ------------------------------------------------------------------ */
  /* DOĞA                                                               */
  /* ------------------------------------------------------------------ */
  {
    id: 'tree', name: 'Ağaç', category: 'nature', footprint: [2.5, 6, 2.5], color: '#4a9d5a',
    icon: I('<path d="M12 3.5 7 11h10L12 3.5Z"/><path d="M12 8 5.5 16h13L12 8Z"/><path d="M12 13v7.5" stroke-width="2"/>'),
  },
  {
    id: 'pine', name: 'Çam', category: 'nature', footprint: [2.2, 7, 2.2], color: '#3d7d52',
    icon: I('<path d="M12 3 8 9h8L12 3Z"/><path d="M12 7.5 6.5 15h11L12 7.5Z"/><path d="M12 12.5 5.5 20h13L12 12.5Z"/><path d="M12 19v2.5" stroke-width="2"/>'),
  },
  {
    id: 'bush', name: 'Çalı', category: 'nature', footprint: [1.8, 1.4, 1.8], color: '#5aa866',
    icon: I('<circle cx="9" cy="14" r="4.2"/><circle cx="15" cy="14.5" r="3.6"/><circle cx="12" cy="10.5" r="3.8"/>'),
  },
  {
    id: 'rock', name: 'Kaya', category: 'nature', footprint: [2.5, 2, 2.5], color: '#8a909a',
    icon: I('<path d="m12 4 7.5 5.2-2 8.3H6.5l-2-8.3L12 4Z"/><path d="m12 4-1.5 8.2M10.5 12.2 6.5 17.5m4-5.3 7 5.3" opacity=".55"/>'),
  },
  {
    id: 'mountain', name: 'Dağ', category: 'nature', footprint: [30, 22, 30], color: '#6f7784',
    icon: I('<path d="m2.5 19 6.5-11 4 6.5 3-4.5 5.5 9H2.5Z"/><path d="m9 8 2.4 3.9-1.6.6L9 14" opacity=".6"/>'),
  },
  {
    id: 'water', name: 'Su', category: 'nature', footprint: [20, 0.2, 20], color: '#2f7fb5', flat: true,
    icon: I('<path d="M2.5 9c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 5.5 0M2.5 15c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 5.5 0" opacity=".8"/>'),
    propsSchema: [num('wave', 'Dalga Hızı', 1, 0, 6, 0.1), col('deepColor', 'Derin Renk', '#123a58')],
    defaultProps: { wave: 1, deepColor: '#123a58' },
  },

  /* ------------------------------------------------------------------ */
  /* YAPI & DEKOR                                                       */
  /* ------------------------------------------------------------------ */
  {
    id: 'house', name: 'Ev', category: 'structure', footprint: [6, 5, 6], color: '#c8b196',
    icon: I('<path d="M3.5 11 12 4.5 20.5 11"/><path d="M5.5 10v9.5h13V10"/><rect x="10" y="13.5" width="4" height="6" opacity=".6"/>'),
  },
  {
    id: 'tower', name: 'Kule', category: 'structure', footprint: [3, 14, 3], color: '#b0a48f',
    icon: I('<path d="M8 21V6l4-3 4 3v15"/><path d="M8 10h8M8 15h8" opacity=".6"/><path d="M6 21h12" stroke-width="1.8"/>'),
  },
  {
    id: 'wall', name: 'Duvar', category: 'structure', footprint: [8, 3.5, 0.6], color: '#98a3b2',
    icon: I('<rect x="2.5" y="8" width="19" height="8" rx="1"/><path d="M2.5 12h19M8 8v4m8 0v4" opacity=".55"/>'),
  },
  {
    id: 'platform', name: 'Platform', category: 'structure', footprint: [8, 0.6, 8], color: '#8d99a8',
    icon: I('<path d="M12 4.5 21 9l-9 4.5L3 9l9-4.5Z"/><path d="M3 9v6l9 4.5 9-4.5V9"/>'),
  },
  {
    id: 'bridge', name: 'Köprü', category: 'structure', footprint: [16, 2, 5], color: '#a2846a',
    icon: I('<path d="M2 16c3.5-7 16.5-7 20 0"/><path d="M2 16h20" stroke-width="1.8"/><path d="M7 16v-2.6M12 16v-3.4M17 16v-2.6" opacity=".6"/>'),
  },
  {
    id: 'crate', name: 'Kasa', category: 'structure', footprint: [1.6, 1.6, 1.6], color: '#a9793f',
    icon: I('<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" opacity=".55"/>'),
  },
  {
    id: 'barrel', name: 'Varil', category: 'structure', footprint: [1.3, 2, 1.3], color: '#7d5a3a',
    icon: I('<ellipse cx="12" cy="6" rx="5.4" ry="2.4"/><path d="M6.6 6v12c0 1.3 2.4 2.4 5.4 2.4s5.4-1.1 5.4-2.4V6"/><path d="M6.6 10.5h10.8M6.6 15.5h10.8" opacity=".6"/>'),
  },
  {
    id: 'fence', name: 'Çit', category: 'structure', footprint: [6, 1.6, 0.3], color: '#9a7a52',
    icon: I('<path d="M2.5 20V8.5M8 20V6.5M13.5 20V8.5M19 20V6.5" stroke-width="1.8"/><path d="M2.5 11.5h19M2.5 16h19" opacity=".6"/>'),
  },
  {
    id: 'torch', name: 'Meşale', category: 'structure', footprint: [0.4, 2.4, 0.4], color: '#ff9d4d', emissive: true,
    icon: I('<path d="M12 3.5c2.2 2.4 3.4 4 3.4 5.6A3.4 3.4 0 0 1 12 12.5a3.4 3.4 0 0 1-3.4-3.4c0-1.6 1.2-3.2 3.4-5.6Z"/><path d="M12 12.5V21" stroke-width="1.8"/>'),
    propsSchema: [num('intensity', 'Yoğunluk', 2, 0, 20, 0.1), num('distance', 'Menzil', 18, 1, 80, 0.5)],
    defaultProps: { intensity: 2, distance: 18 },
  },

  /* ------------------------------------------------------------------ */
  /* OYUN NESNELERİ                                                     */
  /* ------------------------------------------------------------------ */
  {
    id: 'npc', name: 'NPC', category: 'game', footprint: [1, 2.1, 1], color: '#5ec8ff', role: 'actor',
    icon: I('<circle cx="12" cy="6.6" r="2.9"/><path d="M8.2 20v-5.2a3.8 3.8 0 0 1 7.6 0V20"/><path d="M12 12.5v7.5" opacity=".5"/>'),
    propsSchema: [
      txt('npcName', 'NPC Adı', 'Vezir'),
      sel('role', 'Rol', 'neutral', [
        { value: 'neutral', label: 'Tarafsız' },
        { value: 'friendly', label: 'Dost' },
        { value: 'enemy', label: 'Düşman' },
        { value: 'merchant', label: 'Tüccar' },
        { value: 'quest', label: 'Görev Veren' },
      ]),
      num('speed', 'Hız', 3, 0.1, 40, 0.1),
      num('health', 'Can', 100, 1, 9999, 1),
      num('patrolRadius', 'Devriye Yarıçapı', 25, 0, 500, 1),
      chk('autoPatrol', 'Otomatik Devriye', true),
      chk('loopPatrol', 'Waypoint Döngüsü', true),
    ],
    defaultProps: { npcName: 'Vezir', role: 'neutral', speed: 3, health: 100, patrolRadius: 25, autoPatrol: true, loopPatrol: true },
  },
  {
    id: 'playerSpawn', name: 'Oyuncu Doğuş', category: 'game', footprint: [1.5, 2.5, 1.5], color: '#35d0a5', role: 'marker',
    icon: I('<circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/><path d="M12 17.5v4M9.5 20l2.5 2 2.5-2" stroke-width="1.8"/>'),
    propsSchema: [num('playerIndex', 'Oyuncu No', 0, 0, 15, 1), num('yaw', 'Yön (°)', 0, -180, 180, 5), txt('team', 'Takım', 'player')],
    defaultProps: { playerIndex: 0, yaw: 0, team: 'player' },
  },
  {
    id: 'npcSpawn', name: 'NPC Doğuş', category: 'game', footprint: [1.5, 2.5, 1.5], color: '#7aa9ff', role: 'marker',
    icon: I('<circle cx="12" cy="7.5" r="2.6"/><path d="M6.5 20a5.5 5.5 0 0 1 11 0"/><path d="M12 17.5v4" stroke-width="1.8"/>'),
    propsSchema: [sel('spawnType', 'Tip', 'guard', [
      { value: 'guard', label: 'Muhafız' },
      { value: 'villager', label: 'Kasabalı' },
      { value: 'enemy', label: 'Düşman' },
      { value: 'animal', label: 'Hayvan' },
    ]), num('count', 'Adet', 1, 1, 100, 1)],
    defaultProps: { spawnType: 'guard', count: 1 },
  },
  {
    id: 'waypoint', name: 'Waypoint', category: 'game', footprint: [1.2, 1.2, 1.2], color: '#ffcf5c', role: 'marker',
    icon: I('<path d="M12 3.5 20 12l-8 8.5L4 12l8-8.5Z"/><circle cx="12" cy="12" r="2.4" fill="currentColor" opacity=".4"/>'),
    propsSchema: [num('order', 'Sıra', 0, 0, 999, 1), num('pause', 'Bekleme (sn)', 0, 0, 30, 0.1), num('radius', 'Yarıçap', 1.5, 0.1, 30, 0.1)],
    defaultProps: { order: 0, pause: 0, radius: 1.5 },
  },
  {
    id: 'trigger', name: 'Trigger', category: 'game', footprint: [4, 3, 4], color: '#ff9f43', role: 'zone',
    icon: I('<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M4 12h16M12 4v16" opacity=".45"/>'),
    propsSchema: [
      sel('action', 'Tetik Olayı', 'onEnter', [
        { value: 'onEnter', label: 'Girişte' },
        { value: 'onExit', label: 'Çıkışta' },
        { value: 'teleport', label: 'Işınla' },
        { value: 'damage', label: 'Hasar' },
        { value: 'dialogue', label: 'Diyalog' },
      ]),
      chk('once', 'Sadece Bir Kez', false),
      txt('target', 'Hedef Obj. Adı', ''),
    ],
    defaultProps: { action: 'onEnter', once: false, target: '' },
  },
  {
    id: 'portal', name: 'Portal', category: 'game', footprint: [2.5, 3.5, 0.6], color: '#b07cff', role: 'zone', emissive: true,
    icon: I('<ellipse cx="12" cy="12" rx="7" ry="8.5"/><ellipse cx="12" cy="12" rx="3.4" ry="4.6" opacity=".5"/>'),
    propsSchema: [txt('destination', 'Hedef Sahne', ''), num('radius', 'Aktivasyon Yarıçapı', 2, 0.2, 30, 0.1), chk('bidirectional', 'Çift Yönlü', false)],
    defaultProps: { destination: '', radius: 2, bidirectional: false },
  },
  {
    id: 'pickup', name: 'Toplanabilir', category: 'game', footprint: [0.8, 0.8, 0.8], color: '#ffd54a', role: 'item', emissive: true,
    icon: I('<path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z"/><path d="m4 8 8 4.5L20 8M12 12.5V20" opacity=".5"/>'),
    propsSchema: [txt('itemId', 'Öğe Kodu', 'coin'), num('amount', 'Adet', 1, 1, 9999, 1), chk('respawn', 'Yeniden Doğar', true)],
    defaultProps: { itemId: 'coin', amount: 1, respawn: true },
  },
  {
    id: 'chest', name: 'Sandık', category: 'game', footprint: [1.6, 1.2, 1], color: '#b98a4a', role: 'item',
    icon: I('<path d="M3 11.5a9 6 0 0 1 18 0v5H3v-5Z"/><path d="M3 13.5h18"/><rect x="10.4" y="12" width="3.2" height="4.5" rx=".6" fill="currentColor" opacity=".5" stroke="none"/>'),
    propsSchema: [txt('lootTable', 'Ganim Tablosu', 'common'), chk('locked', 'Kilitli', false)],
    defaultProps: { lootTable: 'common', locked: false },
  },
  {
    id: 'barrier', name: 'Bariyer', category: 'game', footprint: [4, 1.2, 0.4], color: '#ff5c5c', role: 'prop',
    icon: I('<path d="M2.5 15.5h19v3h-19z"/><path d="M2.5 18.5v2M21.5 18.5v2" stroke-width="1.8"/><path d="M4 8.5 20 5.5v4.6L4 13.1V8.5Z"/>'),
    propsSchema: [chk('autoBreak', 'Otomatik Kırılır', true), num('hp', 'Dayanıklılık', 50, 1, 9999, 1)],
    defaultProps: { autoBreak: true, hp: 50 },
  },
  {
    id: 'cameraMarker', name: 'Kamera Noktası', category: 'game', footprint: [1.2, 1.2, 1.2], color: '#5ec8ff', role: 'marker',
    icon: I('<rect x="2.5" y="8" width="13" height="9" rx="2"/><path d="m15.5 11 6-3.2v9.4l-6-3.2V11Z"/>'),
    propsSchema: [num('fov', 'FOV', 55, 10, 120, 1), num('dolly', 'Yumuşatma', 0.3, 0, 1, 0.05), chk('active', 'Aktif', false)],
    defaultProps: { fov: 55, dolly: 0.3, active: false },
  },

  /* ------------------------------------------------------------------ */
  /* IŞIK & KAMERA                                                      */
  /* ------------------------------------------------------------------ */
  {
    id: 'pointLight', name: 'Nokta Işık', category: 'light', footprint: [1, 1, 1], color: '#ffd9a0', role: 'light',
    icon: I('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>'),
    propsSchema: [num('intensity', 'Yoğunluk', 60, 0, 5000, 1), num('distance', 'Menzil', 40, 0, 500, 1), num('decay', 'Sönüm', 2, 0, 4, 0.01), col('lightColor', 'Işık Rengi', '#ffd9a0')],
    defaultProps: { intensity: 60, distance: 40, decay: 2, lightColor: '#ffd9a0' },
  },
  {
    id: 'spotLight', name: 'Spot Işık', category: 'light', footprint: [1, 1, 1], color: '#fff3d6', role: 'light',
    icon: I('<path d="M9 4h6l2 5H7l2-5Z"/><path d="M7 9h10l3.5 10H3.5L7 9Z"/><path d="M12 12v7" opacity=".6"/>'),
    propsSchema: [num('intensity', 'Yoğunluk', 120, 0, 8000, 1), num('distance', 'Menzil', 60, 0, 500, 1), num('angle', 'Açı (°)', 38, 5, 80, 1), num('penumbra', 'Yumuşaklık', 0.4, 0, 1, 0.01)],
    defaultProps: { intensity: 120, distance: 60, angle: 38, penumbra: 0.4 },
  },
  {
    id: 'ambientLight', name: 'Ortam Işığı', category: 'light', footprint: [0.2, 0.2, 0.2], color: '#8fa8c8', role: 'light',
    icon: I('<circle cx="12" cy="12" r="7.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /><path d="m5 5 1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" opacity=".6"/>'),
    propsSchema: [num('intensity', 'Yoğunluk', 0.6, 0, 8, 0.05), col('lightColor', 'Işık Rengi', '#8fa8c8')],
    defaultProps: { intensity: 0.6, lightColor: '#8fa8c8' },
  },

  /* ------------------------------------------------------------------ */
  /* İÇE AKTARILAN (dosyalardan üretilir)                               */
  /* ------------------------------------------------------------------ */
  {
    // Yükseklik haritası (.npy) uygulanmış arazi. Geometriyi TerrainSystem
    // üretir; asset builder yalnızca yer tutucu düzlemi kurar.
    id: 'terrain', name: 'Arazi', category: 'imported', footprint: [1024, 40, 1024], color: '#ffffff',
    role: 'prop', external: 'terrain',
    icon: I('<path d="M2.5 19 8 9l3.5 5.5L15 8l6.5 11H2.5Z"/><path d="m8 9 1.8 2.8M15 8l1.4 2.3" opacity=".6"/><path d="M2.5 19h21" stroke-width="1.8"/>'),
    propsSchema: [
      txt('source', 'Kaynak Dosya', ''),

      // --- yükseklik ---
      sel('heightMode', 'Yükseklik Modu', 'absolute', [
        { value: 'absolute', label: 'Mutlak (dünya birimi)' },
        { value: 'normalized', label: 'Normalize (0-1 sıkıştır)' },
      ]),
      num('heightBase', 'Referans Düzlem', 0, -100000, 100000, 1),
      num('heightScale', 'Yükseklik Ölçeği', 1, 0.001, 10000, 0.05),
      chk('flipRows', 'Satır Yönünü Ters Çevir', false),

      // --- geometri ---
      num('terrainSize', 'Arazi Boyutu', 2048, 1, 65536, 1),
      num('segments', 'Bölüm (eksen)', 256, 2, 513, 1),

      // --- su / kıyı ---
      // NOT: waterLevel boş (null) bırakılırsa OTOMATİK mod: ham veride negatif
      // değer varsa 0 (deniz seviyesi), yoksa en alçak nokta (su yok).
      numN('waterLevel', 'Su Seviyesi (boş = otomatik)', -100000, 100000, 1),
      num('beachWidth', 'Kıyı Bandı (birim)', 2, 0, 2000, 0.5),
      col('waterColor', 'Su Rengi', '#2c4a63'),
      col('sandColor', 'Kıyı / Kum Rengi', '#b9a678'),

      // --- yükseklik rampası ---
      col('lowColor', 'Alçak Renk', '#3d5a43'),
      col('midColor', 'Orta Renk', '#6b8a52'),
      col('highColor', 'Yüksek Renk', '#8a8570'),
      col('peakColor', 'Zirve Renk', '#d8dce0'),

      // --- görünüm ---
      num('contourStep', 'Eş Yükselti Adımı', 0, 0, 2000, 0.5),
      chk('wireframe', 'Tel Kafes', false),
      chk('flatShading', 'Düz Gölgelendirme', false),
    ],
    defaultProps: {
      source: '', terrainSize: 2048, segments: 256,
      heightMode: 'absolute', heightBase: 0, heightScale: 1,
      waterLevel: null, beachWidth: 2,
      waterColor: '#2c4a63', sandColor: '#b9a678',
      flipRows: false,
      lowColor: '#3d5a43', midColor: '#6b8a52',
      highColor: '#8a8570', peakColor: '#d8dce0',
      contourStep: 0, wireframe: false, flatShading: false,
    },
  },
  {
    // Valve .smd modeli. Geometri SMDParser tarafından üretilir.
    id: 'importedMesh', name: 'İçe Aktarılan Mesh', category: 'imported', footprint: [1, 1, 1], color: '#b8c4d4',
    role: 'prop', external: 'smd',
    icon: I('<path d="M12 2.8 20.5 7.4v9.2L12 21.2 3.5 16.6V7.4L12 2.8Z"/><path d="M12 12 20.5 7.4M12 12v9.2M12 12 3.5 7.4" opacity=".6"/><path d="M9 10.4 15.5 7M9 13.6 15.5 17" opacity=".45"/>'),
    propsSchema: [
      txt('source', 'Kaynak Dosya', ''),
      txt('modelName', 'Model Adı', ''),
      num('triangles', 'Üçgen', 0, 0, 1e7, 1),
      num('vertexCount', 'Köşe', 0, 0, 1e7, 1),
      num('groupCount', 'Grup', 0, 0, 9999, 1),
      num('boneCount', 'Kemik Ağırlığı', 0, 0, 1e6, 1),
      chk('convertSource', 'Source Koordinat Sistemi', false),
    ],
    defaultProps: {
      source: '', modelName: '', triangles: 0, vertexCount: 0,
      groupCount: 0, boneCount: 0, convertSource: false,
    },
  },
  {
    /*
     * Dış kitaplıktan gelen glTF/GLB/OBJ modeli.
     *
     * Bu bir "asset tanımı" değil, Inspector'ın alan şemasıdır: gerçek
     * asset'ler `ImportedAssetLibrary` tarafından manifest'ten dinamik gelir
     * ve `imp:` önekiyle kimliklenir. `Editor._addImportedAsset()` bu şemayı
     * kullanarak kaydı oluşturur, `AssetFactory.createImportedPlaceholder()`
     * yer tutucuyu kurar, asıl geometri `ImportedAssetLibrary.instantiate()`
     * ile bağlanır.
     *
     * `footprint` kasıtlı olarak [0,0,0]: kitaplık modellerinin ölçüsü
     * dosyadan okunur ve YÜKLEME SONRASI hesaplanır (kuantize modellerde
     * manifest'teki değerler dünya birimi değildir).
     */
    id: 'importedLib', name: 'Dış Model', category: 'imported', footprint: [0, 0, 0], color: '#ffffff',
    role: 'prop',
    // Asset PANELİNDE görünmez: bu bir gerçek asset değil, yalnızca Inspector
    // alan şemasıdır. Paneldeki kayıtlar `ImportedAssetLibrary`'den gelir.
    hidden: true,
    icon: I('<path d="M12 2.8 20.5 7.4v9.2L12 21.2 3.5 16.6V7.4L12 2.8Z"/><path d="M12 12 20.5 7.4M12 12v9.2M12 12 3.5 7.4" opacity=".6"/><path d="M9 10.4 15.5 7M9 13.6 15.5 17" opacity=".45"/>'),
    propsSchema: [
      txt('source', 'Kaynak Dosya', ''),
      txt('kitapKategori', 'Kitaplık Kategorisi', ''),
      txt('bicim', 'Biçim', 'glb'),
      num('ucgen', 'Üçgen', 0, 0, 1e8, 1),
      num('kose', 'Köşe', 0, 0, 1e8, 1),
      num('doku', 'Doku', 0, 0, 9999, 1),
      num('animasyon', 'Animasyon', 0, 0, 9999, 1),
      num('yukseklik', 'Ölçülen Yükseklik', 0, 0, 100000, 0.01),
      num('boyut', 'Dosya Boyutu (bayt)', 0, 0, 1e9, 1),
      // --- ölçek ---
      // Kitaplık modelleri YARD/metre ölçeğinde yazılmıştır (medyan ~1.2 birim).
      // Bu haritada 1 birim = 1 ızgara hücresi (varsayılan 8), dolayısıyla
      // modeller küçük görünür. Sessizce ölçeklemek yerine kullanıcı HEDEF
      // YÜKSEKLİK belirler; boş bırakılırsa 1:1 kalır.
      num('hedefYukseklik', 'Hedef Yükseklik (0 = 1:1)', 0, 0, 10000, 0.25),
      chk('tabanDuzelt', 'Tabanı Zemine Otur', true),
      txt('not', 'Not', ''),
    ],
    defaultProps: {
      source: '', kitapKategori: '', bicim: 'glb',
      ucgen: 0, kose: 0, doku: 0, animasyon: 0,
      yukseklik: 0, boyut: 0, hedefYukseklik: 0, tabanDuzelt: true, not: '',
    },
  },
];

/** id -> asset hızlı erişim haritası. */
export const ASSET_MAP = new Map(ASSETS.map((a) => [a.id, a]));

/* -------------------------------------------------------------------------
   i18n NORMALİZASYONU
   -------------------------------------------------------------------------
   Yukarıdaki tanımlar düz Türkçe metin içerir (okunabilirlik için). Burada
   her kayda, o kaydın KİMLİĞİNDEN TÜRETİLEN çeviri anahtarı basılır.

   Elle anahtar yazmamak, yeni alan eklerken anahtarı UNUTMA riskini ortadan
   kaldırır: anahtar otomatik üretilir, eksikliği yalnızca sözlük eksikliği
   olarak ortaya çıkar ve `test-i18n.js` bunu raporlar.
   ------------------------------------------------------------------------- */
for (const kategori of CATEGORIES) {
  kategori.labelKey = `asset.cat.${kategori.id}`;
}

for (const asset of ASSETS) {
  asset.nameKey = `asset.name.${asset.id}`;
  for (const alan of asset.propsSchema || []) {
    alan.labelKey = `prop.${asset.id}.${alan.key}`;
    for (const secenek of alan.options || []) {
      secenek.labelKey = `propopt.${asset.id}.${alan.key}.${secenek.value}`;
    }
  }
}

/** Bir etiketi çözer: anahtar varsa çeviri, yoksa kaynak metin. */
function etiketCoz(obje) {
  if (!obje) return '';
  if (obje.labelKey) return i18n.t(obje.labelKey);
  return obje.label ?? '';
}

/** Panelde "instantiable" olan asset'ler (ışık vb. hepsi eklenebilir). */
export function getAsset(id) {
  return ASSET_MAP.get(id) || null;
}

/**
 * Görünen asset adı (aktif dile göre).
 * Katalogda olmayan kimliklerde (ör. `imp:props_fence`) kimliğin kendisi
 * döner — çeviri denemesi yapılmaz, çünkü dış kitaplık adları keyfi metindir.
 */
export function getAssetName(id) {
  const asset = ASSET_MAP.get(id);
  return asset ? etiketCoz({ labelKey: asset.nameKey, label: asset.name }) : id;
}

/** Inspector alan etiketi — şema girdisi üzerinden çözülür. */
export function getSchemaLabel(schema) {
  return etiketCoz(schema);
}

/** Inspector <select> seçenek metni. */
export function getOptionLabel(secenek) {
  return etiketCoz(secenek);
}

/** Kategori görünen adı (panel başlıkları ve sahne ağacı grupları). */
export function getCategoryLabel(categoryId) {
  const kategori = CATEGORIES.find((c) => c.id === categoryId);
  return kategori ? etiketCoz(kategori) : categoryId;
}

export function getAssetIcon(id) {
  return ASSET_MAP.get(id)?.icon || I('<circle cx="12" cy="12" r="7"/>');
}

export function getAssetColor(id) {
  return ASSET_MAP.get(id)?.color || '#9aa8bd';
}

/** Bir asset için varsayılan özel alan (props) nesnesi. */
export function getDefaultProps(id) {
  return { ...(ASSET_MAP.get(id)?.defaultProps || {}) };
}

/** Kategoriye göre süzülmüş asset listesi. */
export function assetsByCategory(categoryId) {
  return ASSETS.filter((a) => a.category === categoryId);
}
