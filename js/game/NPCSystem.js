/**
 * NPCSystem.js
 * ---------------------------------------------------------------------------
 * "Önizleme" (play) modunda çalışan basit NPC devriye simülasyonu.
 *
 * Davranış:
 *  - Her NPC, `props.patrolRadius` yarıçapındaki waypoint'leri tarar.
 *  - En yakın (veya sıra numarasına göre sonraki) waypoint'e doğru `props.speed`
 *    hızında yürür; +Z yönüne bakarak döner.
 *  - Waypoint'e varınca `props.pause` kadar bekler, sonra sıradakine geçer.
 *  - `props.loopPatrol` kapalıysa listede bir tur atıp kendi doğduğu noktaya döner.
 *  - Hedef yoksa yerinde küçük bir salınım (idle) yapar.
 *
 * Oyun motoru tarafından kullanılacak veri zaten JSON'da; bu simülasyon sadece
 * editörde düzenleme yaparken NPC'lerin nasıl davranacağını görmek içindir.
 */
import * as THREE from 'three';
import { faceDirection } from '../assets/AssetFactory.js';

const ARRIVE = 0.35;      // waypoint'e bu kadar yaklaşınca "vardı" say
const WAIT_FALLBACK = 1.2; // hedef yoksa bekleme

export class NPCSystem {
  /**
   * @param {import('../core/Store.js').Store} store
   * @param {import('../core/ObjectRegistry.js').ObjectRegistry} registry
   */
  constructor(store, registry) {
    this.store = store;
    this.registry = registry;
    this.enabled = false;
    /** @type {Map<string, {targetIndex:number, targetId:string|null, wait:number, phase:number, home:THREE.Vector3}>} */
    this._brain = new Map();
  }

  setEnabled(on) {
    this.enabled = on;
    for (const record of this.store.objects) {
      const obj = this._objectOf(record.id);
      if (obj?.userData.patrolRing) obj.userData.patrolRing.visible = !!on;
    }
  }

  _objectOf(id) {
    return this.registry.getObject(id);
  }

  /**
   * @param {THREE.Object3D} content sahne kökü (id -> object eşlemesi için)
   */
  setContent(content) {
    this._content = content;
  }

  /** Her karede çağrılır. */  update(dt, elapsed) {
    if (!this.enabled) return;

    // Waypoint listesini bir kez topla (frame başına tek tarama)
    const waypoints = [];
    for (const rec of this.store.objects) {
      if (rec.assetId === 'waypoint' && rec.visible) waypoints.push(rec);
    }

    for (const record of this.store.objects) {
      if (record.assetId !== 'npc' || !record.visible || record.locked) continue;
      const obj = this._objectOf(record.id);
      if (!obj) continue;
      this._updateNpc(record, obj, waypoints, dt, elapsed);
    }

    // Toplanabilir / portaller gibi hafif animasyonlar
    for (const record of this.store.objects) {
      const obj = this._objectOf(record.id);
      if (!obj) continue;
      if (obj.userData.spin) obj.rotation.y += dt * 1.6;
      if (obj.userData.isWater) this._animateWater(obj, dt, elapsed);
    }
  }

  _animateWater(obj, dt, elapsed) {
    const speed = obj.userData.waveSpeed ?? 1;
    obj.traverse((n) => {
      // NOT: `isWater` işareti hem Mesh'te hem üst grupta var; grupta malzeme yok.
      if (!n.userData.isWater || !n.material?.color || !n.userData.baseColor) return;
      n.position.y = 0.02 + Math.sin(elapsed * speed) * 0.045;
      n.material.color.copy(n.userData.baseColor).offsetHSL(0, 0, Math.sin(elapsed * 0.6) * 0.03);
    });
  }

  _updateNpc(record, obj, waypoints, dt, elapsed) {
    const props = record.props || {};
    const brain = this._ensure(record, obj);

    // Devriye halkasını yalnızca bu NPC seçiliyken göster
    const ring = obj.userData.patrolRing;
    if (ring) {
      const active = this.store.selection.includes(record.id);
      ring.visible = active || this.enabled;
      if (ring.visible && active) ring.scale.setScalar(Math.max(0.1, (props.patrolRadius || 0) / 25));
    }

    if (!props.autoPatrol) {
      // Bekleme modu: hafif salınım
      obj.position.y = record.position[1] + Math.sin(elapsed * 1.5 + brain.phase) * 0.05;
      obj.rotation.y = record.rotation[1] * THREE.MathUtils.DEG2RAD;
      return;
    }

    // Uygun waypoint'leri seç
    const radius = props.patrolRadius ?? 25;
    const candidates = waypoints
      .map((w) => ({ w, d: dist2(obj.position, w.position) }))
      .filter((c) => c.d <= radius * radius);

    if (!candidates.length) {
      // Hedef yok: idle salınım
      obj.position.y = record.position[1] + Math.sin(elapsed * 1.5 + brain.phase) * 0.05;
      return;
    }

    // Sıra numarasına göre sırala, sonra döngüsel olarak ilerle
    candidates.sort((a, b) => (a.w.props?.order ?? 0) - (b.w.props?.order ?? 0));
    const list = candidates.map((c) => c.w);
    if (!list.length) return;

    // Mevcut hedef listede kaldı mı? Kalmadıysa listedeki ilkine dön.
    let index = list.findIndex((w) => w.id === brain.targetId);
    if (index < 0) index = 0;
    const target = list[index];
    brain.targetId = target.id;

    // Bekleme durumu
    if (brain.wait > 0) {
      brain.wait -= dt;
      faceDirection(obj, Math.cos(elapsed * 0.4 + brain.phase), Math.sin(elapsed * 0.4 + brain.phase));
      return;
    }

    // Hedefe doğru yürü
    const speed = props.speed ?? 3;
    const dx = target.position[0] - obj.position.x;
    const dz = target.position[2] - obj.position.z;
    const d = Math.hypot(dx, dz);

    if (d < ARRIVE + (target.props?.radius ?? 0)) {
      // Vardı -> sıradaki hedef
      brain.wait = target.props?.pause ?? 0;
      if (props.loopPatrol === false) {
        // Eve dön
        obj.position.x += (brain.home.x - obj.position.x) * 0.06;
        obj.position.z += (brain.home.z - obj.position.z) * 0.06;
        return;
      }
      brain.targetIndex = (index + 1) % list.length;
      brain.targetId = list[brain.targetIndex].id;
      return;
    }

    const step = Math.min(speed * dt, d);
    obj.position.x += (dx / d) * step;
    obj.position.z += (dz / d) * step;
    obj.position.y = record.position[1] + Math.abs(Math.sin(elapsed * speed * 1.6 + brain.phase)) * 0.06;
    faceDirection(obj, dx / d, dz / d);
  }

  _ensure(record, obj) {
    let brain = this._brain.get(record.id);
    if (!brain) {
      brain = {
        targetIndex: 0,
        targetId: null,
        wait: 0,
        phase: Math.random() * Math.PI * 2,
        home: new THREE.Vector3(record.position[0], record.position[1], record.position[2]),
      };
      this._brain.set(record.id, brain);
    }
    return brain;
  }

  /** Sahne yeniden kurulduğunda iç durumu temizler. */
  reset() {
    this._brain.clear();
  }

  /** Bir NPC'nin beynini sıfırlar (pozisyon elle değiştirildiğinde). */
  forget(id) {
    this._brain.delete(id);
  }

  /** Bir NPC'yi anlık olarak hedefe ulaştırır (waypoint'e taşır) — "git" kısayolu. */
  teleportToNearestWaypoint(record) {
    const obj = this._objectOf(record.id);
    if (!obj) return false;
    const radius = record.props?.patrolRadius ?? 25;
    let best = null, bestD = Infinity;
    for (const w of this.store.objects) {
      if (w.assetId !== 'waypoint') continue;
      const d = dist2(obj.position, w.position);
      if (d <= radius * radius && d < bestD) { best = w; bestD = d; }
    }
    if (!best) return false;
    obj.position.set(best.position[0], record.position[1], best.position[2]);
    this.forget(record.id);
    return true;
  }
}

function dist2(a, b) {
  const dx = a.x - b[0];
  const dz = a.z - b[2];
  return dx * dx + dz * dz;
}
