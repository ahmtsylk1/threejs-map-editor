/**
 * AssetFactory.js
 * ---------------------------------------------------------------------------
 * Asset kodlarından gerçek three.js Object3D ağaçları üretir.
 *
 * Kurallar:
 *  - Her asset, `userData.editorId` taşıyan bir KÖK grup (root) döndürür.
 *    Bu kök, raycast sonucu nesne kaydına eşlenir.
 *  - `userData.role` davranış rolünü belirtir:
 *      'prop'  : normal sahne nesnesi
 *      'actor' : NPC (devriye simülasyonu)
 *      'marker': oyun noktası / waypoint (ışınsız, görsel yardımcı)
 *      'zone'  : tel kaf çerçeve bölgeler (trigger, portal)
 *      'light' : gerçek ışık kaynağı içerir
 *  - `userData.tintable = true` olan mesh'ler Inspector'daki renk değişimine
 *    duyarlıdır; gövde/pencere gibi parçalar `nt()` ile kendi rengini korur.
 */
import * as THREE from 'three';
import { getAsset } from './catalog.js';

/* -------------------------------------------------------------------------
   Küçük yardımcılar
   ------------------------------------------------------------------------- */

/** Standart PBR malzeme (malzemeye ait olmayan anahtarlar ayrıştırılır). */
function mat(color, opts = {}) {
  const { castShadow, receiveShadow, flatShading, ...rest } = opts;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: rest.roughness ?? 0.78,
    metalness: rest.metalness ?? 0.04,
    ...rest,
    ...(flatShading ? { flatShading: true } : {}),
  });
}

/** Inspector renk değişimine duyarlı mesh. */
function part(geometry, color, opts = {}) {
  const m = new THREE.Mesh(geometry, mat(color, opts));
  m.castShadow = opts.castShadow !== false;
  m.receiveShadow = opts.receiveShadow !== false;
  m.userData.tintable = true;
  return m;
}

/** Inspector renk değişimine DUYARSIZ mesh (gövde, pencere, kaide vb.). */
function nt(geometry, color, opts = {}) {
  const m = new THREE.Mesh(geometry, mat(color, opts));
  m.castShadow = opts.castShadow !== false;
  m.receiveShadow = opts.receiveShadow !== false;
  m.userData.tintable = false;
  return m;
}

/** Mesh'i (x, y, z) konumuna taşır. */
function at(mesh, x = 0, y = 0, z = 0) {
  mesh.position.set(x, y, z);
  return mesh;
}

/** Gruba ekler. */
function add(group, ...children) {
  for (const c of children) if (c) group.add(c);
  return group;
}

/** Temel malzeme (MeshBasic / Line) kullanan yardımcı parça. */
function basicPart(geometry, color, opacity = 1, opts = {}) {
  const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    ...opts,
  }));
  m.castShadow = false;
  m.receiveShadow = false;
  m.userData.tintable = false;
  return m;
}

/** Düzensizleştirilmiş (kayalık) geometri. */
function jitter(geometry, amount = 0.18, seed = 1) {
  const pos = geometry.attributes.position;
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280 - 0.5;
  };
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) * (1 + rand() * amount),
      pos.getY(i) * (1 + rand() * amount),
      pos.getZ(i) * (1 + rand() * amount)
    );
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** Mesh'in tel kaf (edges) kopyası — konum/rotasyon/ölçek eşlenir. */
function edges(mesh, color = '#9fb0c4', opacity = 0.75) {
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 25),
    new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity })
  );
  line.position.copy(mesh.position);
  line.rotation.copy(mesh.rotation);
  line.scale.copy(mesh.scale);
  line.userData.tintable = false;
  return line;
}

/** Zemine oturan nesne işareti (ileride "yere düşür" özelliği için). */
function groundable(group) {
  group.userData.grounded = true;
  return group;
}

/* -------------------------------------------------------------------------
   Asset inşa edicileri
   ------------------------------------------------------------------------- */
const BUILDERS = {
  /* ---------------- Temel geometri ---------------- */
  cube: () => groundable(add(new THREE.Group(), at(part(new THREE.BoxGeometry(1, 1, 1), '#c3cddb'), 0, 0.5, 0))),

  box: () => groundable(add(new THREE.Group(), at(part(new THREE.BoxGeometry(4, 1, 1), '#b3bfcd'), 0, 0.5, 0))),

  sphere: () => groundable(add(new THREE.Group(), at(part(new THREE.SphereGeometry(1, 32, 20), '#9fb4cc', { roughness: 0.45 }), 0, 1, 0))),

  cylinder: () => groundable(add(new THREE.Group(), at(part(new THREE.CylinderGeometry(0.8, 0.8, 3, 24), '#8fa6bf'), 0, 1.5, 0))),

  cone: () => groundable(add(new THREE.Group(), at(part(new THREE.ConeGeometry(0.9, 2.6, 24), '#7f97b2'), 0, 1.3, 0))),

  torus: () => groundable(add(new THREE.Group(), at(part(new THREE.TorusGeometry(0.9, 0.32, 16, 40), '#9db0c6', { metalness: 0.35, roughness: 0.4 }), 0, 1.1, 0).rotateX(Math.PI / 2))),

  plane: () => {
    const m = part(new THREE.PlaneGeometry(8, 8), '#5c6b7f', { roughness: 0.95, castShadow: false });
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.01;
    return add(new THREE.Group(), m);
  },

  stairs: () => {
    const g = new THREE.Group();
    const steps = 6;
    const w = 4, h = 0.35, d = 4 / steps;
    for (let i = 0; i < steps; i++) {
      add(g, at(part(new THREE.BoxGeometry(w, h, d), '#a9b6c6'), 0, h / 2 + i * h, -2 + (i + 0.5) * d));
    }
    return groundable(g);
  },

  /* ---------------- Doğa ---------------- */
  tree: () => groundable(add(new THREE.Group(),
    at(nt(new THREE.CylinderGeometry(0.16, 0.26, 2.4, 10), '#6b4a2a', { roughness: 0.95 }), 0, 1.2, 0),
    at(part(new THREE.ConeGeometry(1.5, 2.4, 12), '#4a9d5a'), 0, 3.1, 0),
    at(part(new THREE.ConeGeometry(1.1, 1.8, 12), '#57ad66'), 0, 4.4, 0)
  )),

  pine: () => groundable(add(new THREE.Group(),
    at(nt(new THREE.CylinderGeometry(0.14, 0.22, 2.2, 8), '#5c4026', { roughness: 0.95 }), 0, 1.1, 0),
    at(part(new THREE.ConeGeometry(1.5, 2.6, 10), '#3d7d52'), 0, 3.2, 0),
    at(part(new THREE.ConeGeometry(1.1, 2.2, 10), '#448a5a'), 0, 4.6, 0),
    at(part(new THREE.ConeGeometry(0.7, 1.8, 10), '#4b9663'), 0, 5.9, 0)
  )),

  bush: () => groundable(add(new THREE.Group(),
    at(part(new THREE.IcosahedronGeometry(0.75, 0), '#5aa866', { flatShading: true }), 0, 0.7, 0),
    at(part(new THREE.IcosahedronGeometry(0.5, 0), '#67b872', { flatShading: true }), 0.5, 0.5, 0.2),
    at(part(new THREE.IcosahedronGeometry(0.45, 0), '#4e9c59', { flatShading: true }), -0.45, 0.45, -0.15)
  )),

  rock: () => groundable(add(new THREE.Group(),
    at(part(jitter(new THREE.IcosahedronGeometry(1.15, 1).scale(1, 0.78, 1), 0.3, 7), '#8a909a', { flatShading: true, roughness: 0.92 }), 0, 0.75, 0)
  )),

  mountain: () => groundable(add(new THREE.Group(),
    at(part(jitter(new THREE.ConeGeometry(15, 22, 9, 3), 0.22, 3), '#6f7784', { flatShading: true, roughness: 0.95 }), 0, 11, 0)
  )),

  water: () => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20, 1, 1),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color('#2f7fb5'),
        transparent: true,
        opacity: 0.72,
        roughness: 0.08,
        metalness: 0.35,
        depthWrite: true,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    m.receiveShadow = true;
    m.castShadow = false;
    m.userData.tintable = true;
    m.userData.isWater = true;
    m.userData.baseColor = new THREE.Color('#2f7fb5');
    const g = add(new THREE.Group(), m);
    g.userData.isWater = true;
    return g;
  },

  /* ---------------- Yapı & dekor ---------------- */
  house: () => {
    const g = new THREE.Group();
    const roof = at(part(new THREE.ConeGeometry(4.3, 2.2, 4), '#8d4a3a', { flatShading: true }), 0, 4.1, 0);
    roof.rotation.y = Math.PI / 4;
    add(g,
      at(part(new THREE.BoxGeometry(5, 3, 5), '#c8b196'), 0, 1.5, 0),
      roof,
      at(nt(new THREE.BoxGeometry(0.9, 0.9, 0.12), '#7fd4ff', { emissive: new THREE.Color('#2a6a8f'), emissiveIntensity: 0.7, castShadow: false }), -1.4, 1.7, 2.53),
      at(nt(new THREE.BoxGeometry(0.9, 0.9, 0.12), '#7fd4ff', { emissive: new THREE.Color('#2a6a8f'), emissiveIntensity: 0.7, castShadow: false }), 1.4, 1.7, 2.53),
      at(nt(new THREE.BoxGeometry(1.1, 2, 0.14), '#6b4a2c', { roughness: 0.9 }), 0, 1, 2.53)
    );
    return groundable(g);
  },

  tower: () => {
    const g = new THREE.Group();
    const roof = at(part(new THREE.ConeGeometry(2.6, 2.4, 4), '#8a4a3a', { flatShading: true }), 0, 15.2, 0);
    roof.rotation.y = Math.PI / 4;
    add(g,
      at(part(new THREE.BoxGeometry(3, 14, 3), '#b0a48f'), 0, 7, 0),
      roof,
      at(part(new THREE.BoxGeometry(5.5, 0.6, 5.5), '#9a8f7c'), 0, 0.3, 0)
    );
    return groundable(g);
  },

  wall: () => groundable(add(new THREE.Group(),
    at(part(new THREE.BoxGeometry(8, 3.5, 0.6), '#98a3b2'), 0, 1.75, 0),
    at(part(new THREE.BoxGeometry(8.2, 0.3, 0.85), '#7d8794'), 0, 3.6, 0)
  )),

  platform: () => {
    const top = at(part(new THREE.BoxGeometry(8, 0.5, 8), '#8d99a8'), 0, 0.25, 0);
    return groundable(add(new THREE.Group(), top, edges(top, '#c6d2e0', 0.5)));
  },

  bridge: () => {
    const g = new THREE.Group();
    add(g, at(part(new THREE.BoxGeometry(16, 0.4, 5), '#a2846a'), 0, 3.4, 0));
    for (const x of [-6, -2, 2, 6]) {
      add(g,
        at(nt(new THREE.CylinderGeometry(0.18, 0.18, 3.2, 8), '#8d7259'), x, 1.7, -2.3),
        at(nt(new THREE.CylinderGeometry(0.18, 0.18, 3.2, 8), '#8d7259'), x, 1.7, 2.3)
      );
    }
    add(g,
      at(nt(new THREE.BoxGeometry(16, 0.25, 0.25), '#8d7259'), 0, 4.4, -2.3),
      at(nt(new THREE.BoxGeometry(16, 0.25, 0.25), '#8d7259'), 0, 4.4, 2.3)
    );
    return groundable(g);
  },

  crate: () => {
    const box = at(part(new THREE.BoxGeometry(1.6, 1.6, 1.6), '#a9793f', { roughness: 0.9 }), 0, 0.8, 0);
    return groundable(add(new THREE.Group(), box, edges(box, '#d9a35f', 0.6)));
  },

  barrel: () => {
    const g = new THREE.Group();
    const ringA = at(nt(new THREE.TorusGeometry(0.66, 0.06, 8, 20), '#5d4228', { metalness: 0.6, roughness: 0.4 }), 0, 0.45, 0).rotateX(Math.PI / 2);
    const ringB = at(nt(new THREE.TorusGeometry(0.66, 0.06, 8, 20), '#5d4228', { metalness: 0.6, roughness: 0.4 }), 0, 1.55, 0).rotateX(Math.PI / 2);
    add(g, at(part(new THREE.CylinderGeometry(0.65, 0.65, 2, 18), '#7d5a3a', { roughness: 0.85 }), 0, 1, 0), ringA, ringB);
    return groundable(g);
  },

  fence: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      add(g, at(nt(new THREE.BoxGeometry(0.16, 1.6, 0.16), '#9a7a52'), -2.5 + i * 1.25, 0.8, 0));
    }
    add(g,
      at(nt(new THREE.BoxGeometry(6, 0.14, 0.12), '#9a7a52'), 0, 1.25, 0),
      at(nt(new THREE.BoxGeometry(6, 0.14, 0.12), '#9a7a52'), 0, 0.6, 0)
    );
    return groundable(g);
  },

  torch: () => {
    const flame = at(
      part(new THREE.SphereGeometry(0.22, 12, 10), '#ff9d4d', {
        emissive: new THREE.Color('#ff7a1a'), emissiveIntensity: 2.2, castShadow: false, roughness: 0.4,
      }),
      0, 2.15, 0
    );
    flame.scale.set(0.8, 1.5, 0.8);
    return groundable(add(new THREE.Group(),
      at(nt(new THREE.CylinderGeometry(0.07, 0.09, 2, 8), '#5c4026', { roughness: 0.95 }), 0, 1, 0),
      flame
    ));
  },

  /* ---------------- Oyun nesneleri ---------------- */
  npc: () => {
    const g = new THREE.Group();
    const nose = at(nt(new THREE.ConeGeometry(0.08, 0.22, 8), '#f0c39a', { castShadow: false }), 0, 1.72, 0.28);
    nose.rotation.x = Math.PI / 2;

    add(g,
      at(nt(new THREE.CapsuleGeometry(0.3, 0.75, 6, 16), '#5ec8ff', { roughness: 0.6 }), 0, 0.9, 0),
      at(nt(new THREE.SphereGeometry(0.26, 20, 16), '#f0c39a', { roughness: 0.65 }), 0, 1.72, 0),
      nose,
      at(nt(new THREE.SphereGeometry(0.045, 8, 8), '#22272e', { castShadow: false }), -0.1, 1.78, 0.22),
      at(nt(new THREE.SphereGeometry(0.045, 8, 8), '#22272e', { castShadow: false }), 0.1, 1.78, 0.22)
    );

    // devriye yarıçapı göstergesi (yalnızca önizlemede görünür)
    const ring = basicPart(new THREE.RingGeometry(0.98, 1.02, 64), 0x5ec8ff, 0.35);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.visible = false;
    g.add(ring);
    g.userData.patrolRing = ring;

    // taban gölge diski (her zaman siyah kalır)
    const disc = basicPart(new THREE.CircleGeometry(0.45, 24), 0x000000, 0.28);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.02;
    disc.userData.noTint = true;
    g.add(disc);

    g.userData.isActor = true;
    return g;
  },

  playerSpawn: () => {
    const g = new THREE.Group();
    const cone = basicPart(new THREE.ConeGeometry(0.3, 0.6, 12), 0x35d0a5, 0.45);
    cone.position.y = 1.35; cone.rotation.x = Math.PI;
    add(g,
      (() => { const r = basicPart(new THREE.RingGeometry(0.55, 0.75, 32), 0x35d0a5, 0.9); r.rotation.x = -Math.PI / 2; r.position.y = 0.05; return r; })(),
      (() => { const h = basicPart(new THREE.SphereGeometry(0.28, 16, 12), 0x35d0a5, 0.85); h.position.y = 1.9; return h; })(),
      cone,
      (() => { const b = basicPart(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 8), 0x35d0a5, 0.4); b.position.y = 0.9; return b; })()
    );
    return g;
  },

  npcSpawn: () => {
    const g = new THREE.Group();
    const ring = basicPart(new THREE.RingGeometry(0.5, 0.68, 28), 0x7aa9ff, 0.9);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    const box = basicPart(new THREE.BoxGeometry(0.55, 0.55, 0.55), 0x7aa9ff, 0.35);
    box.position.y = 1.3;
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.55, 0.55, 0.55)),
      new THREE.LineBasicMaterial({ color: 0x7aa9ff, transparent: true, opacity: 0.95 })
    );
    wire.position.y = 1.3;
    return add(g, ring, box, wire);
  },

  waypoint: () => {
    const g = new THREE.Group();
    const dia = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42),
      new THREE.MeshStandardMaterial({
        color: 0xffcf5c, emissive: new THREE.Color('#a06f00'), emissiveIntensity: 0.8, roughness: 0.4,
      })
    );
    dia.position.y = 1.1;
    dia.castShadow = false;
    dia.userData.tintable = true;
    const ring = basicPart(new THREE.RingGeometry(0.4, 0.52, 24), 0xffcf5c, 0.75);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    const stem = basicPart(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), 0xffcf5c, 0.5);
    stem.position.y = 0.7;
    return add(g, dia, ring, stem);
  },

  trigger: () => {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(4, 3, 4);
    const fill = basicPart(geo, 0xff9f43, 0.1);
    fill.position.y = 1.5;
    fill.userData.isZone = true;
    const line = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.95 })
    );
    line.position.y = 1.5;
    add(g, fill, line);
    g.userData.isZone = true;
    return g;
  },

  portal: () => groundable(add(new THREE.Group(),
    (() => {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(1.1, 0.22, 18, 48),
        new THREE.MeshStandardMaterial({ color: 0xb07cff, emissive: new THREE.Color('#6a2fd6'), emissiveIntensity: 1.6, roughness: 0.35 })
      );
      r.position.y = 1.6; r.userData.tintable = true;
      return r;
    })(),
    (() => { const c = basicPart(new THREE.CircleGeometry(1.02, 40), 0xd9c2ff, 0.42); c.position.y = 1.6; return c; })(),
    at(nt(new THREE.CylinderGeometry(1.3, 1.5, 0.3, 20), '#4a3a63', { roughness: 0.6 }), 0, 0.15, 0)
  )),

  pickup: () => {
    const g = new THREE.Group();
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42),
      new THREE.MeshStandardMaterial({
        color: 0xffd54a, emissive: new THREE.Color('#b07a00'), emissiveIntensity: 1.1, metalness: 0.5, roughness: 0.25,
      })
    );
    gem.position.y = 1.0; gem.userData.tintable = true;
    const glow = basicPart(new THREE.SphereGeometry(0.62, 16, 12), 0xffd54a, 0.14);
    glow.position.y = 1.0;
    g.userData.spin = true;
    return add(g, gem, glow);
  },

  chest: () => {
    const g = new THREE.Group();
    const lid = at(part(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 16, 1, false, 0, Math.PI), '#a9793f', { roughness: 0.8 }), 0, 0.85, 0);
    lid.rotation.z = Math.PI / 2;
    return groundable(add(g,
      at(part(new THREE.BoxGeometry(1.6, 0.85, 1), '#8d6236', { roughness: 0.85 }), 0, 0.42, 0),
      lid,
      at(nt(new THREE.BoxGeometry(0.22, 0.3, 0.1), '#ffd54a', { metalness: 0.7, roughness: 0.3, emissive: new THREE.Color('#6b4a00'), emissiveIntensity: 0.5 }), 0, 0.72, 0.52)
    ));
  },

  barrier: () => {
    const g = new THREE.Group();
    add(g,
      at(part(new THREE.BoxGeometry(4, 0.5, 0.4), '#ff5c5c', { roughness: 0.6 }), 0, 1.1, 0),
      at(nt(new THREE.BoxGeometry(0.2, 1.1, 0.2), '#5a5f68', { metalness: 0.5, roughness: 0.4 }), -1.7, 0.55, 0),
      at(nt(new THREE.BoxGeometry(0.2, 1.1, 0.2), '#5a5f68', { metalness: 0.5, roughness: 0.4 }), 1.7, 0.55, 0)
    );
    for (let i = 0; i < 4; i++) {
      const stripe = at(nt(new THREE.BoxGeometry(0.32, 0.52, 0.42), '#ffe27a', { castShadow: false }), -1.5 + i, 1.1, 0);
      stripe.rotation.z = -0.5;
      g.add(stripe);
    }
    return groundable(g);
  },

  cameraMarker: () => {
    const g = new THREE.Group();
    const lens = at(nt(new THREE.CylinderGeometry(0.22, 0.26, 0.4, 16), '#5ec8ff', {
      metalness: 0.6, roughness: 0.25, emissive: new THREE.Color('#0d3d5c'), emissiveIntensity: 0.5,
    }), 0, 1.6, 0.6);
    lens.rotation.x = Math.PI / 2;
    const cone = basicPart(new THREE.ConeGeometry(2.2, 8, 20, 1, true), 0x5ec8ff, 0.12);
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, 1.6, 4.6);
    return groundable(add(g,
      at(nt(new THREE.BoxGeometry(1.1, 0.7, 0.8), '#3a4756', { metalness: 0.4, roughness: 0.45 }), 0, 1.6, 0),
      lens,
      cone,
      at(nt(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), '#3a4756', { metalness: 0.5, roughness: 0.4 }), 0, 0.65, 0)
    ));
  },

  /* ---------------- Işıklar ---------------- */
  pointLight: () => {
    const g = new THREE.Group();
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 2.4, roughness: 0.3 })
    );
    bulb.position.y = 1.2; bulb.userData.tintable = false; bulb.castShadow = false;
    const light = new THREE.PointLight(0xffd9a0, 60, 40, 2);
    light.position.y = 1.2;
    g.add(bulb, light);
    g.userData.light = light;
    return g;
  },

  spotLight: () => {
    const g = new THREE.Group();
    const target = new THREE.Object3D();
    target.position.set(0, 0, 20);
    const light = new THREE.SpotLight(0xfff3d6, 120, 60, THREE.MathUtils.degToRad(38), 0.4, 2);
    light.position.set(0, 1.4, 0);
    light.target = target;
    const glow = basicPart(new THREE.CircleGeometry(0.22, 18), 0xfff3d6, 0.8);
    glow.position.y = 1.06; glow.rotation.x = -Math.PI / 2;
    add(g,
      at(nt(new THREE.CylinderGeometry(0.3, 0.22, 0.7, 14), '#3a4756', { metalness: 0.5, roughness: 0.4 }), 0, 1.4, 0),
      glow, target, light
    );
    g.userData.light = light;
    return g;
  },

  ambientLight: () => {
    const g = new THREE.Group();
    const glyph = basicPart(new THREE.SphereGeometry(0.3, 16, 12), 0x8fa8c8, 0.5);
    glyph.material.wireframe = true;
    glyph.material.transparent = true;
    glyph.material.opacity = 0.5;
    glyph.material.depthWrite = true;
    glyph.position.y = 1.2;
    const light = new THREE.AmbientLight(0x8fa8c8, 0.6);
    light.position.y = 1.2;
    g.add(glyph, light);
    g.userData.light = light;
    return g;
  },

  /* ---------------------------------------------------------------------
     İÇE AKTARILAN İÇERİK
     Bu asset'ler dosya yüklendiğinde oluşturulur. Builder yalnızca
     "yer tutucu" üretir; ASIL geometri ilgili sistem tarafından değiştirilir:
       terrain       -> TerrainSystem.rebuild()      (heightmap displacement)
       importedMesh  -> Editor._applyImportedMesh()  (SMD BufferGeometry)
     --------------------------------------------------------------------- */
  terrain: () => {
    // Küçük, düz ve ucuz bir yer tutucu. TerrainSystem.rebuild() çağrılana
    // kadar editör boş bir arazi gösterir (yükseklik haritasız kullanılabilir).
    const geo = new THREE.PlaneGeometry(256, 256, 8, 8);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0,
    }));
    mesh.receiveShadow = true;
    mesh.userData.tintable = false;      // görsel köşe renklerinden geliyor
    mesh.name = 'terrainMesh';
    const g = new THREE.Group();
    g.add(mesh);
    g.userData.isTerrain = true;
    return groundable(g);
  },

  importedMesh: () => {
    // Boş geometri: SMD yüklenene kadar hiçbir şey çizilmez.
    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xb8c4d4, roughness: 0.7, metalness: 0.08, side: THREE.DoubleSide })
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.tintable = true;
    mesh.name = 'importedMesh';
    const g = new THREE.Group();
    g.add(mesh);
    g.userData.isImported = true;
    return groundable(g);
  },
};

/* -------------------------------------------------------------------------
   Genel API
   ------------------------------------------------------------------------- */

/**
 * Asset kodundan yeni bir sahne nesnesi üretir.
 * @param {string} assetId
 * @returns {THREE.Object3D}
 */
export function createAssetObject(assetId) {
  const meta = getAsset(assetId);
  const build = BUILDERS[assetId] || BUILDERS.cube;
  const root = build();
  root.name = meta?.name || assetId;
  root.userData.assetId = assetId;
  root.userData.role = meta?.role || 'prop';
  root.userData.editorId = null;      // Editor tarafından atanır
  return root;
}

/**
 * Dış kitaplıktan gelen model (glTF/GLB/OBJ) için YER TUTUCU nesne.
 *
 * Neden ayrı?
 * `createAssetObject` STATİK katalogda arar; `imp:dungeon_fence` gibi bir
 * kimlik orada yoktur ve `BUILDERS.cube` (varsayılan) ile karışırdı.
 * Ayrıca dış modeller statik katalogdan farklı bir kimlik biçimi kullanır
 * (`imp:` öneki) ve asıl geometri asenkron gelir.
 *
 * Üretilen yapı `importedMesh` ile aynıdır: Group + tek Mesh. Böylece
 * `findFirstMesh()` ve `attachGeometry()` gibi mevcut yardımcılar
 * olduğu gibi çalışır; model yüklendiğinde mesh'in çocuğu olur.
 *
 * @returns {THREE.Group}
 */
export function createImportedPlaceholder() {
  const mesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    // Kayan yükleniyor göstergesi: nötr, yarı saydam
    new THREE.MeshStandardMaterial({
      color: 0x8fa8c8, roughness: 0.75, metalness: 0.05,
      transparent: true, opacity: 0.55, wireframe: true,
    })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.tintable = true;
  mesh.name = 'importedMesh';

  const g = new THREE.Group();
  g.add(mesh);
  g.userData.isImported = true;
  g.userData.role = 'prop';
  g.userData.grounded = true;
  g.userData.importedReady = false;     // yükleme tamamlanınca true olur
  return g;
}

/**
 * Kaydın rengini nesneye uygular.
 *
 * - `tintable === true`  : her zaman renklenir (birincil gövde)
 * - `tintable === false` : yalnızca BASİT/ÇİZGİ malzemeler renklenir
 *                         (marker halkaları, bölge tel kafları, ışık çekirdeği)
 * - `noTint === true`    : hiç renklenmez (taban gölge diski gibi)
 */
export function applyColor(root, color) {
  if (!color) return;
  root.traverse((n) => {
    if (!n.material?.color || n.userData.noTint) return;
    const basic = n.material.isLineBasicMaterial || n.material.isMeshBasicMaterial;
    if (n.userData.tintable === true || (n.userData.tintable === false && basic)) {
      n.material.color.set(color);
    }
  });
}

/**
 * Gölük/almama durumunu uygular.
 *
 * NOT: `castShadow` yalnızca GERÇEKTEN gölge üretebilen ışıklara
 * (Point/Spot/Directional) atanır. AmbientLight veya HemisphereLight'a atanırsa
 * three.js her karede "has no shadow" uyarısı basar (performans kaybı).
 */
export function applyShadows(root, cast, receive) {
  const SHADOWABLE = { isPointLight: 1, isSpotLight: 1, isDirectionalLight: 1 };
  root.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = cast;
      n.receiveShadow = receive;
    }
    if (n.isLight) {
      for (const key of Object.keys(SHADOWABLE)) {
        if (n[key]) { n.castShadow = cast; break; }
      }
    }
  });
}

/**
 * Özel alan (props) değiştiğinde canlı bileşenleri günceller
 * (ışık yoğunluğu/rengi, su rengi vb.).
 */
export function applyProps(root, props = {}) {
  const light = root.userData.light;
  if (light) {
    if (Number.isFinite(props.intensity)) light.intensity = props.intensity;
    if (Number.isFinite(props.distance)) light.distance = props.distance;
    if (Number.isFinite(props.decay)) light.decay = props.decay;
    if (Number.isFinite(props.angle)) light.angle = THREE.MathUtils.degToRad(props.angle);
    if (Number.isFinite(props.penumbra)) light.penumbra = props.penumbra;
    const c = props.lightColor || props.color;
    if (c && light.color) light.color.set(c);
  }
  if (Number.isFinite(props.wave)) root.userData.waveSpeed = props.wave;
  if (props.deepColor) {
    // NOT: `isWater` işareti hem Mesh'te hem de üst grupta bulunur; grupta
    // malzeme olmadığı için guard şart.
    root.traverse((n) => {
      if (n.userData.isWater && n.material?.color) {
        n.material.color.set(props.deepColor);
        n.userData.baseColor = new THREE.Color(props.deepColor);
      }
    });
  }
}

/** Nesnenin yönünü +Z eksenine göre döndürür (NPC ilerlemesi için). */
export function faceDirection(root, dx, dz) {
  if (dx === 0 && dz === 0) return;
  const target = Math.atan2(dx, dz);
  let diff = target - root.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  root.rotation.y += diff;
}

/** İstatistik için mesh sayısı. */
export function countMeshes(root) {
  let n = 0;
  root.traverse((o) => { if (o.isMesh) n++; });
  return n;
}

/** Asset'in ağaç derinliği (ölçeklendirme ipucu için). */
export function estimateHeight(assetId) {
  return getAsset(assetId)?.footprint?.[1] ?? 1;
}

/**
 * Bir asset ağacındaki İLK mesh'i döndürür.
 * İçe aktarılan geometriyi değiştirmek (terrain / importedMesh) için kullanılır.
 * @param {THREE.Object3D} root
 * @returns {THREE.Mesh|null}
 */
export function findFirstMesh(root) {
  let found = null;
  root.traverse((n) => { if (!found && n.isMesh) found = n; });
  return found;
}

/**
 * Dışarıdan gelen bir BufferGeometry'yi bir asset ağacına bağlar.
 * @param {THREE.Object3D} root
 * @param {THREE.BufferGeometry} geometry
 * @param {Object} [opts] { material, disposePrevious }
 * @returns {THREE.Mesh|null}
 */
export function attachGeometry(root, geometry, opts = {}) {
  const mesh = findFirstMesh(root);
  if (!mesh || !geometry) return null;
  if (opts.disposePrevious !== false && mesh.geometry && mesh.geometry !== geometry) {
    mesh.geometry.dispose();
  }
  mesh.geometry = geometry;
  if (opts.material) mesh.material = opts.material;
  if (geometry.boundingSphere === null) {
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return mesh;
}
