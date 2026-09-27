/**
 * GridSystem.js
 * ---------------------------------------------------------------------------
 * Harita boyutuna göre OTOMATİK güncellenen zemin + ızgara + sınır görselleştirmesi.
 *
 *   - Zemin düzlemi   : size × size, gölge alan (receiveShadow), renk ayarlanabilir
 *   - Doku            : prosedürel CanvasTexture dama tahtası (isteğe bağlı)
 *   - Izgara          : GridHelper — hücre sayısı = size / cellSize
 *   - Sınır çerçevesi : harita kenarına kesik çizgi kutu + köşe dikmeleri
 *   - Eksen çizgileri : X (kırmızı) / Z (mavi) yön çizgileri
 *
 * PERFORMANS NOTU
 * ---------------
 * Doku, hücre başına `fillRect` ile değil, 2×2 bir "pattern" ile tek seferde
 * boyanır; ayrıca dokunun kendisi GRİ tonludur ve `material.color` ile
 * renklendirilir. Böylece zemin rengini değiştirmek dokuyu yeniden üretmez.
 * Izgara renkleri de geometri yeniden kurulmadan `color` niteliği yazılarak
 * güncellenir (GridHelper'ın renk düzeni belirlenimci: her i için 4 verteks).
 */
import * as THREE from 'three';
import { disposeObject } from './Viewport.js';

export class GridSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {number} size başlangıç boyutu
   * @param {number} cellSize
   */
  constructor(scene, size = 2048, cellSize = 8) {
    this.scene = scene;
    this.size = size;
    this.cellSize = cellSize;
    this.renderer = null;

    this.map = {
      groundColor: new THREE.Color('#1e242f'),
      gridColor: new THREE.Color('#3a4658'),
      accentGridColor: new THREE.Color('#5b83c2'),
      showGrid: true,
      showAxes: true,
      showBounds: true,
      showChecker: true,
    };

    this.ground = null;
    this.grid = null;
    this.axes = null;
    this.bounds = null;
    this._checkerTexture = null;

    this.root = new THREE.Group();
    this.root.name = '__grid__';
    this.scene.add(this.root);

    this.setSize(size, cellSize);
  }

  /* =======================================================================
     Boyut
     ======================================================================= */
  setSize(size, cellSize = this.cellSize) {
    this.size = size;
    this.cellSize = cellSize;
    this._rebuildGround();
    this._rebuildGrid();
    this._rebuildAxes();
    this._rebuildBounds();
    return this;
  }

  /**
   * Store'dan gelen harita ayarlarını uygular.
   * @param {Object} map
   */
  applyMap(map) {
    if (map.groundColor) this.map.groundColor.set(map.groundColor);
    if (map.gridColor) this.map.gridColor.set(map.gridColor);
    if (map.accentGridColor) this.map.accentGridColor.set(map.accentGridColor);

    const sizeChanged = map.size !== this.size;
    const cellChanged = map.cellSize !== this.cellSize;
    const checkerChanged = map.showChecker !== this.map.showChecker;
    const wasChecker = this.map.showChecker;

    this.map.showGrid = map.showGrid;
    this.map.showAxes = map.showAxes;
    this.map.showBounds = map.showBounds;
    this.map.showChecker = map.showChecker;

    if (sizeChanged || cellChanged) {
      this.setSize(map.size, map.cellSize);
      return this;
    }

    // --- ucuz yol: renkler + görünürlük ---
    if (this.ground) this.ground.material.color.copy(this.map.groundColor);
    this._tintGrid();
    if (this.grid) this.grid.visible = this.map.showGrid;
    if (this.axes) this.axes.visible = this.map.showAxes;
    if (this.bounds) this.bounds.visible = this.map.showBounds;
    if (checkerChanged) this._rebuildGround();
    void wasChecker;

    return this;
  }

  /* =======================================================================
     Zemin
     ======================================================================= */
  _rebuildGround() {
    if (this.ground) {
      this.root.remove(this.ground);
      disposeObject(this.ground);
    }
    this._disposeChecker();

    const geo = new THREE.PlaneGeometry(this.size, this.size, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: this.map.groundColor.clone(),
      roughness: 0.96,
      metalness: 0.0,
    });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.name = '__ground__';
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.userData.isGround = true;

    if (this.map.showChecker) {
      this._checkerTexture = this._makeCheckerTexture();
      if (this._checkerTexture) {
        mat.map = this._checkerTexture;
        mat.needsUpdate = true;
      }
    }
    this.root.add(this.ground);
  }

  /**
   * Hücre boyutuna uygun prosedürel dama dokusu.
   * Doku GRİ tonludur; `material.color` ile renklendirilir (tint).
   * @returns {THREE.CanvasTexture|null}
   */
  _makeCheckerTexture() {
    const tiles = Math.max(2, Math.min(512, Math.round(this.size / this.cellSize)));
    const px = Math.min(1024, Math.max(128, tiles * 4));
    const step = Math.max(2, Math.floor(px / tiles));

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext('2d');

    // --- 2×2 dama deseni (pattern olarak tek seferde serilir) ---
    const tile = document.createElement('canvas');
    tile.width = tile.height = step * 2;
    const tctx = tile.getContext('2d');
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, step * 2, step * 2);
    tctx.fillStyle = '#f6f6f6';                       // bir damanın açık tonu
    tctx.fillRect(0, 0, step, step);
    tctx.fillRect(step, step, step, step);

    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(0, 0, px, px);

    // --- ince hücre çizgileri ---
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i * step <= px; i++) {
      const p = i * step + 0.5;
      ctx.moveTo(p, 0); ctx.lineTo(p, px);
      ctx.moveTo(0, p); ctx.lineTo(px, p);
    }
    ctx.stroke();

    // --- kalın ana hatlar (her 8 hücre) ---
    ctx.strokeStyle = 'rgba(0,0,0,0.20)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i * step <= px; i += 8) {
      const p = i * step + 1;
      ctx.moveTo(p, 0); ctx.lineTo(p, px);
      ctx.moveTo(0, p); ctx.lineTo(px, p);
    }
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const maxAniso = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
    tex.anisotropy = Math.min(8, maxAniso);
    tex.needsUpdate = true;
    return tex;
  }

  _disposeChecker() {
    if (this._checkerTexture) {
      this._checkerTexture.dispose();
      this._checkerTexture = null;
    }
  }

  /* =======================================================================
     Izgara (GridHelper)
     ======================================================================= */
  _rebuildGrid() {
    if (this.grid) {
      this.root.remove(this.grid);
      disposeObject(this.grid);
      this.grid = null;
    }
    const divisions = Math.max(1, Math.min(512, Math.round(this.size / this.cellSize)));
    const grid = new THREE.GridHelper(this.size, divisions, 0xffffff, 0xffffff);
    grid.name = '__gridHelper__';
    grid.material.transparent = true;
    grid.material.opacity = 0.7;
    grid.material.depthWrite = false;
    grid.position.y = 0.012;
    grid.renderOrder = 1;
    grid.visible = this.map.showGrid;
    this.grid = grid;
    this._tintGrid();
    this.root.add(grid);
  }

  /**
   * Izgara renklerini geometriye yazar (yeniden kurmadan).
   * GridHelper her i için 4 verteks yazar: renk niteliği deterministiktir.
   */
  _tintGrid() {
    if (!this.grid) return;
    const geo = this.grid.geometry;
    const attr = geo.getAttribute('color');
    if (!attr) return;

    const divisions = Math.max(1, Math.min(512, Math.round(this.size / this.cellSize)));
    const accent = this.map.accentGridColor;
    const base = this.map.gridColor;
    const arr = attr.array;

    for (let i = 0; i <= divisions; i++) {
      const c = (i === 0 || i === divisions) ? accent : base;
      for (let v = 0; v < 4; v++) {
        const o = (i * 4 + v) * 3;
        if (o + 2 < arr.length) {
          arr[o] = c.r; arr[o + 1] = c.g; arr[o + 2] = c.b;
        }
      }
    }
    attr.needsUpdate = true;
  }

  /* =======================================================================
     Eksenler
     ======================================================================= */
  _rebuildAxes() {
    if (this.axes) {
      this.root.remove(this.axes);
      disposeObject(this.axes);
      this.axes = null;
    }
    const half = this.size / 2;
    const y = 0.02;
    const positions = new Float32Array([
      -half, y, 0,   half, y, 0,     // X ekseni -> kırmızı
      0, y, -half,   0, y, half,     // Z ekseni -> mavi
    ]);
    const colors = new Float32Array([
      1, 0.35, 0.35,  1, 0.35, 0.35,
      0.35, 0.65, 1,  0.35, 0.65, 1,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const line = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false })
    );
    line.name = '__axes__';
    line.visible = this.map.showAxes;
    this.axes = line;
    this.root.add(line);
  }

  /* =======================================================================
     Sınır
     ======================================================================= */
  _rebuildBounds() {
    if (this.bounds) {
      this.root.remove(this.bounds);
      disposeObject(this.bounds);
      this.bounds = null;
    }
    const h = this.size / 2;
    const y = 0.03;
    const top = this.size * 0.02;
    const points = [
      // yatay çerçeve
      [-h, y, -h], [h, y, -h],
      [h, y, -h], [h, y, h],
      [h, y, h], [-h, y, h],
      [-h, y, h], [-h, y, -h],
      // köşe dikmeleri
      [-h, 0, -h], [-h, top, -h],
      [h, 0, -h], [h, top, -h],
      [h, 0, h], [h, top, h],
      [-h, 0, h], [-h, top, h],
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));

    const lines = new THREE.LineSegments(
      geo,
      new THREE.LineDashedMaterial({
        color: 0x5a7ba8,
        dashSize: this.size / 90,
        gapSize: this.size / 180,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      })
    );
    lines.computeLineDistances();
    lines.name = '__bounds__';
    lines.visible = this.map.showBounds;
    this.bounds = lines;
    this.root.add(lines);
  }

  /* =======================================================================
     Yardımcılar
     ======================================================================= */
  /** Renderer referansını dokuların kalitesi için saklar. */
  setRenderer(renderer) {
    this.renderer = renderer;
    return this;
  }

  /** Zeminin iki nokta arası yüksekliğini verir (düz zemin = 0). */
  getGroundHeight() {
    return 0;
  }

  dispose() {
    this.scene.remove(this.root);
    disposeObject(this.root);
    this._disposeChecker();
  }
}
