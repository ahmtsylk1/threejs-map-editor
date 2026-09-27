/**
 * StatusBar.js
 * ---------------------------------------------------------------------------
 * Alt durum çubuğu: mod, nesne sayısı, seçim sayısı, fare konumu (dünya),
 * önizleme durumu ve FPS.
 * Sağ paneldeki "Harita Ayarları" istatistik kutularını da yönetir.
 *
 * i18n NOTU: buradaki metinlerin TAMAMI hesaplanmıştır ("Nesne: 12"), bu yüzden
 * `data-i18n` işareti işe yaramaz. Dil değişiminde `sync()` yeniden çağrılır.
 * `setStatus()` ile konan GEÇİCİ mesajlar (dosya yükleme ilerlemesi) sözlükten
 * gelen ham metin olduğundan dokunulmaz — onlar o anki işlemin kendi
 * cümlesidir, arayüz diline değil içeriğe aittir.
 */
import { qs, el } from '../utils/dom.js';
import { EVENT } from '../core/Store.js';
import { fmt, fmtCompact } from '../utils/math.js';
import { i18n } from '../core/I18nManager.js';
import { n } from '../i18n/format.js';

/** Mod etiketleri sözlük anahtarı olarak. */
const MODE_ANAHTARI = {
  translate: 'vp.mode.translate',
  rotate: 'vp.mode.rotate',
  scale: 'vp.mode.scale',
};

export class StatusBar {
  /** @param {import('../core/Store.js').Store} store */
  constructor(store, viewport) {
    this.store = store;
    this.viewport = viewport;

    this.stMode = qs('#stMode');
    this.stObjects = qs('#stObjects');
    this.stSelection = qs('#stSelection');
    this.stPointer = qs('#stPointer');
    this.stPlay = qs('#stPlay');
    this.stFps = qs('#stFps');
    this.selChip = qs('#selCountChip');
    this.statsBox = qs('#mapStats');

    this._bind();
    // Dil değişince tüm göstergeler ve istatistik kutuları tazelenir.
    i18n.register('statusBar', () => this.sync());
  }

  _bind() {
    this.store.on(EVENT.OBJECT_ADD, () => this.sync());
    this.store.on(EVENT.OBJECT_REMOVE, () => this.sync());
    this.store.on(EVENT.OBJECTS_REPLACE, () => this.sync());
    this.store.on(EVENT.SELECTION_CHANGE, () => this.sync());
    this.store.on(EVENT.MODE_CHANGE, () => this.sync());
    this.store.on(EVENT.PLAY_CHANGE, (playing) => this.sync(playing));
    this.store.on(EVENT.MAP_CHANGE, () => this.sync());

    this.viewport.on('fps', (fps) => { this.stFps.textContent = i18n.t('status.fps', { fps }); });
    this.viewport.on('pointermove', (info) => {
      const g = info.ground;
      this.stPointer.textContent = g
        ? `x: ${fmt(g.x, 1)}  y: ${fmt(g.y, 1)}  z: ${fmt(g.z, 1)}`
        : i18n.t('status.pointer.empty');
    });
    this.viewport.on('pointerleave', () => { this.stPointer.textContent = i18n.t('status.pointer.empty'); });
    this.viewport.on('hover:change', (id) => {
      const rec = id ? this.store.getRecord(id) : null;
      this.stObjects.textContent = rec
        ? i18n.t('status.hover', { ad: rec.name })
        : i18n.t('status.objects', { count: n(this.store.objects.length) });
    });
  }

  /** Tüm göstergeleri yeniler. */
  sync(playing = this.store.playing) {
    const modAnahtari = MODE_ANAHTARI[this.store.mode];
    this.stMode.textContent = modAnahtari ? i18n.t(modAnahtari) : this.store.mode;
    this.stObjects.textContent = i18n.t('status.objects', { count: n(this.store.objects.length) });
    this.stSelection.textContent = i18n.t('status.selection', { count: n(this.store.selection.length) });
    this.stPlay.hidden = !playing;
    if (this.selChip) {
      this.selChip.textContent = this.store.selection.length === 0
        ? i18n.t('inspector.chip.none')
        : i18n.t('inspector.chip.count', { count: n(this.store.selection.length) });
    }
    this._renderStats();
  }

  /**
   * Geçici bir durum mesajı gösterir (dosya içe aktarma ilerlemesi gibi).
   * @param {string} text
   */
  setStatus(text) {
    this.stObjects.textContent = text || i18n.t('status.objects', { count: n(this.store.objects.length) });
  }

  /** Sağ paneldeki istatistik kutuları. */
  _renderStats() {
    if (!this.statsBox) return;
    const map = this.store.map;
    const count = this.store.objects.length;
    const byRole = { actor: 0, marker: 0, zone: 0, light: 0, prop: 0 };
    for (const rec of this.store.objects) {
      const role = rec.category === 'game' ? guessRole(rec.assetId) : 'prop';
      byRole[role] = (byRole[role] || 0) + 1;
    }
    const stats = [
      ['map.stat.size', `${n(map.size)} × ${n(map.size)}`],
      ['map.stat.cells', fmtCompact(map.size * map.size)],
      ['map.stat.objects', n(count)],
      ['map.stat.spawns', `${n(byRole.actor)} / ${n(byRole.marker + byRole.zone)}`],
    ];
    this.statsBox.innerHTML = '';
    for (const [anahtar, deger] of stats) {
      this.statsBox.append(el('div.stat', {}, [
        el('b', { text: deger }),
        el('span', { i18n: anahtar }),
      ]));
    }
  }
}

/** Basit rol tahmini (yalnızca istatistik gösterimi için). */
function guessRole(assetId) {
  if (assetId === 'npc') return 'actor';
  if (['playerSpawn', 'npcSpawn', 'waypoint', 'cameraMarker'].includes(assetId)) return 'marker';
  if (['trigger', 'portal'].includes(assetId)) return 'zone';
  if (assetId.includes('Light')) return 'light';
  return 'prop';
}
