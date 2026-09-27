/**
 * Viewport.js
 * ---------------------------------------------------------------------------
 * Three.js çekirdeğini kuran sınıf:
 *   - WebGLRenderer (ACES tone mapping, soft shadows, sRGB çıkış)
 *   - Perspektif kamera + OrbitControls (yörünge/kaydırma/yakınlaştırma)
 *   - Dengeli ışıklandırma (hemisphere + ana güneş + dolgu)
 *   - Gökyüzü kubbesi (gradient shader) ve mesafeye bağlı sis
 *   - Yeniden boyutlandırma, FPS ölçümü, render döngüsü
 *   - Fare koordinatlarını dünya koordinatına çevirme (raycast)
 *
 * Sınıf ayrıca bir EventBus'tır; Editor, seçim ve sürükle-bırak mantığını
 * pointer olaylarına buradan bağlar.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EventBus } from '../core/EventBus.js';

export class Viewport extends EventBus {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    super();
    this.canvas = canvas;

    /* ---------------- Renderer ---------------- */
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x05070a, 1);

    /* ---------------- Sahne ---------------- */
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#080b11');
    this.scene.fog = new THREE.Fog(0x080b11, 800, 4200);

    /** Editörün nesnelerini tuttuğu kök grup. */
    this.content = new THREE.Group();
    this.content.name = '__content__';
    this.scene.add(this.content);

    this._buildSky();
    this._buildLights();

    /* ---------------- Kamera ---------------- */
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 8000);
    this.camera.position.set(700, 520, 760);

    /* ---------------- Kontroller ---------------- */
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.085;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 9000;
    this.controls.maxPolarAngle = Math.PI * 0.495;  // zeminin altına inme
    this.controls.zoomSpeed = 0.9;
    this.controls.rotateSpeed = 0.75;
    this.controls.target.set(0, 0, 0);

    /* ---------------- Raycast yardımcıları ---------------- */
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hit = new THREE.Vector3();

    /* ---------------- Durum ---------------- */
    this._clock = new THREE.Clock();
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this.fps = 0;
    this._downInfo = null;

    this._bindEvents();
  }

  /* =======================================================================
     Kurulum parçaları
     ======================================================================= */

  /** Gökyüzü kubbesi: dikey gradyan + ufuk parlaması. */
  _buildSky() {
    const geo = new THREE.SphereGeometry(1, 32, 20);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color('#0d1522') },
        midColor: { value: new THREE.Color('#16202f') },
        bottomColor: { value: new THREE.Color('#080b11') },
      },
      vertexShader: /* glsl */`
        varying vec3 vWorldPosition;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          vec3 c = mix(bottomColor, midColor, smoothstep(-0.25, 0.12, h));
          c = mix(c, topColor, smoothstep(0.05, 0.75, h));
          // ufukta hafif aydınlık
          c += vec3(0.05, 0.07, 0.11) * (1.0 - smoothstep(0.0, 0.28, abs(h - 0.02)));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(geo, material);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    this.sky.name = '__sky__';
    this.scene.add(this.sky);
  }

  /** Ana + dolgu ışıkları. */
  _buildLights() {
    // Gökyüzü/zemin yarımküresi — gölge olmayan ana dolgu
    this.hemi = new THREE.HemisphereLight(0x9dc0e8, 0x2a2f38, 0.55);
    this.scene.add(this.hemi);

    // Ana güneş (gölge üreten)
    this.sun = new THREE.DirectionalLight(0xfff1dc, 1.7);
    this.sun.position.set(180, 320, 160);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.35;
    this._setShadowExtent(600);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Karşı yönden soğuk dolgu (kontur ayrımı)
    this.fill = new THREE.DirectionalLight(0x7fa6d8, 0.42);
    this.fill.position.set(-220, 140, -200);
    this.scene.add(this.fill);

    this.lights = new THREE.Group();
    this.lights.name = '__lights__';
  }

  /** Gölge kamerasını harita boyutuna göre ayarlar. */
  _setShadowExtent(extent) {
    const cam = this.sun.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 1;
    cam.far = extent * 6;
    cam.updateProjectionMatrix();
  }

  /* =======================================================================
     Olay bağlama
     ======================================================================= */
  _bindEvents() {
    const c = this.canvas;

    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('pointerdown', (e) => {
      this._downInfo = { x: e.clientX, y: e.clientY, button: e.button, time: performance.now() };
      this.emit('pointerdown', this._eventInfo(e));
    });

    c.addEventListener('pointermove', (e) => {
      this._updatePointer(e);
      this.emit('pointermove', this._eventInfo(e));
    });

    c.addEventListener('pointerup', (e) => {
      const down = this._downInfo;
      this._downInfo = null;
      const dist = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) : Infinity;
      const isClick = dist < 5;
      this.emit('pointerup', { ...this._eventInfo(e), isClick, button: down?.button ?? e.button });
    });

    c.addEventListener('pointerleave', () => this.emit('pointerleave'));

    // Kaydırma tekerleği odaklanmayı bozmasın
    c.addEventListener('wheel', () => this.emit('wheel'), { passive: true });

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(c.parentElement || document.body);
    window.addEventListener('resize', () => this.resize());
  }

  _updatePointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _eventInfo(event) {
    this._updatePointer(event);
    return {
      event,
      pointer: this.pointer,
      clientX: event.clientX,
      clientY: event.clientY,
      ground: this.screenToGround(event.clientX, event.clientY),
      shift: event.shiftKey,
      ctrl: event.ctrlKey || event.metaKey,
      alt: event.altKey,
    };
  }

  /* =======================================================================
     Ölçü / koordinat dönüşümleri
     ======================================================================= */

  /**
   * Ekran koordinatını zemin düzlemindeki dünya noktasına çevirir.
   * @returns {THREE.Vector3|null}
   */
  screenToGround(clientX, clientY, out = new THREE.Vector3()) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.ray.intersectPlane(this._groundPlane, out) ? out : null;
  }

  /**
   * Verilen nesneler arasında raycast yapar.
   * @param {THREE.Object3D[]} objects
   * @returns {THREE.Intersection[]}
   */
  raycast(objects) {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  /** Kamera yönüne göre "ileri" vektörü. */
  getForward(out = new THREE.Vector3()) {
    return this.camera.getWorldDirection(out);
  }

  /* =======================================================================
     Kamera yardımcıları
     ======================================================================= */

  /** Harita boyutuna göre kamerayı makul bir başlangıç görünümüne alır. */
  frameMap(size, immediate = false) {
    const dist = size * 0.78;
    this.camera.position.set(dist * 0.62, dist * 0.5, dist * 0.78);
    this.controls.target.set(0, 0, 0);
    this.controls.maxDistance = size * 3;
    this.camera.far = Math.max(4000, size * 3.2);
    this.camera.updateProjectionMatrix();
    this._setShadowExtent(size * 0.42);
    this.updateFog(size);
    if (immediate) this.controls.update();
  }

  /**
   * Belirli bir noktaya yumuşakça odaklanır.
   * @param {THREE.Vector3|{x:number,y:number,z:number}} point
   * @param {number} [distance] hedef kamera uzaklığı
   * @param {boolean} [immediate] true ise animasyonsuz
   */
  focusOn(point, distance = 60, immediate = false) {
    const target = point.isVector3 ? point : new THREE.Vector3(point.x || 0, point.y || 0, point.z || 0);
    this._focusAnim = {
      from: this.controls.target.clone(),
      to: target.clone(),
      fromDist: this.camera.position.distanceTo(this.controls.target),
      toDist: THREE.MathUtils.clamp(distance, 2, this.controls.maxDistance),
      t: immediate ? 1 : 0,
    };
    if (immediate) {
      this.controls.target.copy(target);
      this._applyFocusDistance(distance);
      this._focusAnim = null;
    }
  }

  _applyFocusDistance(d) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, d);
  }

  /** Üstten görünüme geçer. */
  topView(size, immediate = false) {
    const d = size * 0.7;
    this.focusOn(new THREE.Vector3(0, 0, 0), d, immediate);
    this._focusAnim.fromPos = this.camera.position.clone();
    this._focusAnim.toPos = new THREE.Vector3(0.001, d, 0.001);
  }

  updateFog(size) {
    const near = size * 0.55;
    const far = size * 2.6;
    this.scene.fog.near = near;
    this.scene.fog.far = far;
  }

  /* =======================================================================
     Boyutlandırma
     ======================================================================= */
  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.emit('resize', { width: w, height: h });
  }

  /* =======================================================================
     Render döngüsü
     ======================================================================= */
  start() {
    this._clock.start();
    this.renderer.setAnimationLoop(() => this._tick());
  }

  stop() {
    this.renderer.setAnimationLoop(null);
  }

  _tick() {
    const dt = Math.min(this._clock.getDelta(), 0.1);
    const elapsed = this._clock.elapsedTime;

    // FPS ölçümü
    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
      this.emit('fps', this.fps);
    }

    // Kamera odak animasyonu
    if (this._focusAnim && this._focusAnim.t < 1) {
      const a = this._focusAnim;
      a.t = Math.min(1, a.t + dt * 3.2);
      const e = 1 - Math.pow(1 - a.t, 3);          // easeOutCubic
      this.controls.target.lerpVectors(a.from, a.to, e);
      if (a.fromPos && a.toPos) {
        this.camera.position.lerpVectors(a.fromPos, a.toPos, e);
      } else {
        const dir = this.camera.position.clone().sub(a.from).normalize();
        this.camera.position.copy(this.controls.target).addScaledVector(dir, THREE.MathUtils.lerp(a.fromDist, a.toDist, e));
      }
      if (a.t >= 1) this._focusAnim = null;
    }

    this.controls.update();

    // Gökyüzü ve ışıklar kamerayı takip eder (sonsuz dünya hissi)
    const camPos = this.camera.position;
    this.sky.position.copy(camPos);
    this.sky.scale.setScalar(Math.max(1, this.scene.fog.far * 0.45));
    this.sun.position.set(camPos.x + 180, camPos.y + 320, camPos.z + 160);
    this.sun.target.position.set(camPos.x, 0, camPos.z);
    this.sun.target.updateMatrixWorld();
    this.fill.position.set(camPos.x - 220, camPos.y + 140, camPos.z - 200);

    this.emit('frame', { dt, elapsed });
    this.renderer.render(this.scene, this.camera);
  }

  /** Bellek temizliği. */
  dispose() {
    this.stop();
    this._resizeObserver?.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.clear();
  }

  /** Sahnedeki tüm içerikleri siler (kaynakları serbest bırakarak). */
  clear() {
    for (let i = this.content.children.length - 1; i >= 0; i--) {
      disposeObject(this.content.children[i]);
      this.content.remove(this.content.children[i]);
    }
  }
}

/**
 * Bir nesne ağacını özyinelemeli olarak serbest bırakır.
 * @param {THREE.Object3D} obj
 */
export function disposeObject(obj) {
  obj.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) {
      const list = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of list) {
        for (const key of Object.keys(m)) {
          const v = m[key];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      }
    }
  });
}
