/* Geometry is concept scale. Asset dimensions are normalized from the actual GLB bounds. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TAU = Math.PI * 2;
const PHASES = new Set(['opening', 'build', 'mentoring', 'demo', 'closing']);
const PHASE_LABELS = { opening: 'WELCOME / OPENING', build: 'BUILD SOMETHING REAL', mentoring: 'MENTOR OFFICE HOURS', demo: 'SHOW YOUR WORK', closing: 'KEEP CREATING' };
const ACTIVE = { opening: ['stage', 'stands', 'checkin'], build: ['teams', 'quiet'], mentoring: ['teams', 'mentors'], demo: ['stage', 'stands'], closing: ['stage', 'checkin', 'aisle'] };
const ZONES = {
  teams: { x: -1.3, z: 1.3, w: 24.4, d: 21.8, color: '#d6ad6c', label: '团队创作 / 25 TEAMS' },
  stage: { x: 0, z: -20.5, w: 18.4, d: 6.2, color: '#7d9ea4', label: '主舞台 / MAIN STAGE' },
  mentors: { x: -17.1, z: 1.2, w: 5.2, d: 12, color: '#bc9471', label: '导师交流 / MENTORS' },
  quiet: { x: 17.1, z: 1.2, w: 5.2, d: 12, color: '#94b49e', label: '安静缓冲 / QUIET' },
  checkin: { x: -9.2, z: 20.3, w: 10, d: 5.7, color: '#d1a77b', label: '签到服务 / CHECK IN' },
  break: { x: 9.2, z: 20.3, w: 9, d: 5.7, color: '#c8b18b', label: '茶歇交流 / COFFEE' },
  aisle: { x: .65, z: .3, w: 3.1, d: 47, color: '#a3d3c3', label: '主通道 / MAIN AISLE' },
  stands: { x: -23.3, z: 0, w: 6.5, d: 38, color: '#699f95', label: '既有看台 / STANDS' }
};
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = (color, extras = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .03, ...extras });
const makeCanvas = (w, h) => { const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; return canvas; };

export class VenueRenderer {
  constructor(canvas, { onSelect, onStatus } = {}) {
    if (!canvas?.getContext) throw new Error('VenueRenderer requires a canvas.');
    this.canvas = canvas;
    this.onSelect = typeof onSelect === 'function' ? onSelect : () => {};
    this.onStatus = typeof onStatus === 'function' ? onStatus : () => {};
    this.phase = 'opening'; this.hours = 0; this.playing = false; this.flows = true; this.roof = false;
    this.view = 'perspective'; this.selected = 'teams'; this.motionTime = 0; this.lastStamp = null;
    this.destroyed = false; this.dirty = true; this.frame = null; this.loadedAssets = [];
    this.propPlacements = new Map(); this.propBatches = new Map(); this.pickTargets = [];
    this.disposables = new Set(); this.pointers = new Map(); this.handlers = {};
    this.original = { touchAction: canvas.style.touchAction, cursor: canvas.style.cursor, tabIndex: canvas.getAttribute('tabindex') };
    canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
    if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e4e9e5');
    this.scene.fog = new THREE.Fog('#e4e9e5', 140, 250);
    this.camera = new THREE.PerspectiveCamera(43, 1, .12, 350);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = .09;
    this.controls.enablePan = true; this.controls.screenSpacePanning = false;
    this.controls.minPolarAngle = .035; this.controls.maxPolarAngle = Math.PI / 2 - .025;
    this.controls.minDistance = 12; this.controls.maxDistance = 135;
    this.controls.target.set(0, 0, -1);
    this.controls.addEventListener('change', this.handlers.controlChange = () => this.invalidate());
    this.controls.addEventListener('start', this.handlers.controlStart = () => { canvas.style.cursor = 'grabbing'; });
    this.controls.addEventListener('end', this.handlers.controlEnd = () => { canvas.style.cursor = 'grab'; });
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.roofGroup = new THREE.Group(); this.roofGroup.name = 'Existing arched steel roof'; this.scene.add(this.roofGroup);
    this.propGroup = new THREE.Group(); this.propGroup.name = '3dassets.dev GLB instances'; this.scene.add(this.propGroup);
    this.flowGroup = new THREE.Group(); this.flowGroup.name = 'Illustrative pedestrian routes'; this.scene.add(this.flowGroup);
    this.setupLighting(); this.buildVenue(); this.buildFurniture(); this.buildPeople(); this.buildFlows(); this.bindEvents();
    this.observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    if (this.observer) this.observer.observe(canvas);
    else window.addEventListener('resize', this.handlers.resize = () => this.resize());
    this.setView('perspective'); this.setRoof(false); this.setSelectedZone('teams'); this.setTime(0); this.resize();
    this.ready = this.loadAssets();
    this.invalidate();
  }

  setupLighting() {
    this.hemi = new THREE.HemisphereLight('#e5f0ff', '#7b8b6e', 2.1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1d8', 3.0); this.sun.position.set(-29, 48, 10);
    this.sun.target.position.set(0, 0, -2); this.scene.add(this.sun, this.sun.target);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -39, right: 39, top: 39, bottom: -39, near: .5, far: 140 });
    this.sun.shadow.normalBias = .035; this.sun.shadow.bias = -.0002;
    this.fillLight = new THREE.DirectionalLight('#dbe7ff', 1.0); this.fillLight.position.set(20, 25, -30); this.scene.add(this.fillLight);
    this.interiorLight = new THREE.HemisphereLight('#fff2d6', '#56766c', .1); this.scene.add(this.interiorLight);
    // A small neutral environment keeps metallic GLB parts readable without a remote HDR dependency.
    const env = new THREE.Scene(); env.background = new THREE.Color('#aebcbd');
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
    ceiling.rotation.x = Math.PI / 2; ceiling.position.y = 25; env.add(ceiling);
    const windowPanel = new THREE.Mesh(new THREE.PlaneGeometry(90, 38), new THREE.MeshBasicMaterial({ color: '#eef8ff', side: THREE.DoubleSide }));
    windowPanel.position.set(-35, 10, 0); windowPanel.rotation.y = Math.PI / 2; env.add(windowPanel);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget = pmrem.fromScene(env, .08); this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = .45;
    pmrem.dispose(); ceiling.geometry.dispose(); ceiling.material.dispose(); windowPanel.geometry.dispose(); windowPanel.material.dispose();
  }

  mesh(geometry, material, x, y, z, parent = this.scene, cast = true) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z);
    mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  box(w, h, d, x, y, z, material, parent = this.scene, cast = true) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent, cast);
  }
  beam(a, b, radius, material, parent = this.scene) {
    const direction = b.clone().sub(a);
    const mesh = this.mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 6), material, ...a.clone().add(b).multiplyScalar(.5).toArray(), parent);
    mesh.quaternion.setFromUnitVectors(v3(0, 1, 0), direction.normalize()); return mesh;
  }
  flatLabel(text, width, height, x, y, z, opts = {}) {
    const canvas = makeCanvas(1024, 128); const ctx = canvas.getContext('2d');
    if (opts.background) { ctx.fillStyle = opts.background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.fillStyle = opts.color || '#f3efe1'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 45px "Arial", "PingFang SC", sans-serif'; ctx.fillText(text, 512, 67, 970);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const plane = this.mesh(new THREE.PlaneGeometry(width, height), material, x, y, z, opts.parent || this.scene, false);
    if (opts.floor) plane.rotation.x = -Math.PI / 2;
    return plane;
  }

  buildVenue() {
    const concrete = mat('#d6dbd6'); const darkConcrete = mat('#879890'); const steel = mat('#788986', { metalness: .55, roughness: .39 });
    const white = mat('#d8e4de'); const seatTeal = mat('#278a84'); const seatYellow = mat('#d8b63d');
    const ground = this.mesh(new THREE.PlaneGeometry(300, 300), mat('#d9dfd9'), 0, -.48, 0, this.scene, false); ground.rotation.x = -Math.PI / 2;
    this.box(56, .8, 57, 0, -.45, 0, concrete);
    this.box(55.5, .14, 56.5, 0, -.01, 0, mat('#7c9b89'));
    const courtCanvas = makeCanvas(2048, 2560); const ctx = courtCanvas.getContext('2d');
    ctx.fillStyle = '#3d9984'; ctx.fillRect(0, 0, 2048, 2560);
    // Court paint remains visible between the temporary workstations.
    ctx.fillStyle = '#348d77'; ctx.fillRect(185, 215, 1678, 2110);
    ctx.strokeStyle = '#e8e6c8'; ctx.lineWidth = 8;
    ctx.strokeRect(245, 320, 1558, 1920);
    ctx.beginPath(); ctx.moveTo(245, 1280); ctx.lineTo(1803, 1280); ctx.stroke();
    ctx.beginPath(); ctx.arc(1024, 1280, 210, 0, TAU); ctx.stroke();
    for (const y of [320, 1850]) {
      ctx.fillStyle = '#c9865f'; ctx.fillRect(728, y, 592, 390); ctx.strokeRect(728, y, 592, 390);
      ctx.beginPath(); ctx.arc(1024, y === 320 ? 710 : 1850, 152, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(1024, y === 320 ? 455 : 2105, 625, y === 320 ? 0 : Math.PI, y === 320 ? Math.PI : TAU); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(239,237,210,.22)'; ctx.lineWidth = 3;
    for (const x of [420, 750, 1298, 1628]) { ctx.beginPath(); ctx.moveTo(x, 345); ctx.lineTo(x, 2215); ctx.stroke(); }
    const courtTexture = new THREE.CanvasTexture(courtCanvas); courtTexture.colorSpace = THREE.SRGBColorSpace;
    courtTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const court = this.mesh(new THREE.PlaneGeometry(40, 51), mat('#ffffff', { map: courtTexture, roughness: .84 }), 0, .075, 0, this.scene, false); court.rotation.x = -Math.PI / 2;
    this.flatLabel('CREATORS  /  48 HOURS', 14, 1.7, 0, .089, 14.8, { floor: true, color: '#dce6cb' });

    // Cutaway side bleachers follow the teal / yellow blocks of the reference venue.
    for (const side of [-1, 1]) {
      for (let step = 0; step < 5; step++) {
        const x = side * (20.9 + step * 1.2); const y = .26 + step * .53;
        this.box(1.22, .54 + step * .53, 38, x, (.54 + step * .53) / 2, 0, darkConcrete);
        for (let segment = 0; segment < 3; segment++) {
          const z = (segment - 1) * 12.7;
          this.box(.91, .14, 10.9, x, y + .34, z, segment === 1 ? seatYellow : seatTeal);
          // A narrow backrest gives the existing bleachers a readable seating silhouette.
          this.box(.095, .26, 10.9, x + side * .39, y + .48, z, segment === 1 ? seatYellow : seatTeal);
        }
      }
      for (const z of [-19.1, 19.1]) {
        this.beam(v3(side * 20.4, .8, z), v3(side * 26.5, 3.5, z), .048, steel);
        for (let n = 0; n < 7; n++) { const x = side * (20.4 + n * .95); this.beam(v3(x, n * .44, z), v3(x, .8 + n * .44, z), .035, steel); }
      }
      this.box(.24, 3.65, 48, side * 27.5, 1.8, -1.3, concrete);
      for (const z of [-25, -15, -5, 5, 15, 25]) this.box(.45, 8.6, .45, side * 27.4, 4.3, z, white);
    }
    // Far glass wall: pale glazing, dark mullions, and a view of trees beyond the hall.
    this.box(55, 1.2, .35, 0, .6, -27.2, concrete);
    const glass = mat('#abc9c3', { transparent: true, opacity: .30, roughness: .18, metalness: .1, side: THREE.DoubleSide, depthWrite: false });
    this.box(55, 7.9, .08, 0, 5.15, -27.15, glass, this.scene, false);
    for (let x = -27; x <= 27; x += 3.4) this.box(.12, 9.7, .15, x, 4.85, -27, steel);
    for (const y of [1.25, 4, 6.8, 9.55]) this.box(55, .13, .18, 0, y, -27, steel);
    this.box(55, .45, .7, 0, 9.65, -27, white);
    const treeMat = mat('#8cae8d');
    for (let n = 0; n < 16; n++) this.mesh(new THREE.IcosahedronGeometry(1.8 + (n % 3) * .5, 1), treeMat, -31 + n * 4.1, 3.1, -31 - (n % 2) * 2, this.scene, false);

    // Arched roof trusses can be exposed on demand so the floor plan stays legible.
    const archY = x => 10.2 + 5.0 * Math.cos(x / 28 * Math.PI / 2);
    for (const z of [-25, -15, -5, 5, 15, 25]) {
      for (let x = -28; x < 28; x += 4) {
        this.beam(v3(x, archY(x), z), v3(x + 4, archY(x + 4), z), .115, steel, this.roofGroup);
        this.beam(v3(x, archY(x) - .85, z), v3(x + 4, archY(x + 4) - .85, z), .085, steel, this.roofGroup);
        this.beam(v3(x, archY(x), z), v3(x + 4, archY(x + 4) - .85, z), .057, steel, this.roofGroup);
        this.beam(v3(x, archY(x) - .85, z), v3(x, archY(x), z), .054, steel, this.roofGroup);
      }
    }
    for (const x of [-27, -18, -9, 0, 9, 18, 27]) this.beam(v3(x, archY(x), -27), v3(x, archY(x), 27), .075, steel, this.roofGroup);
    const roofMaterial = mat('#566f62', { transparent: true, opacity: .13, depthWrite: false, side: THREE.DoubleSide });
    this.roofMaterial = roofMaterial;
    for (let x = -28; x < 28; x += 4) {
      const p = this.mesh(new THREE.PlaneGeometry(Math.hypot(4, archY(x + 4) - archY(x)), 54), roofMaterial, x + 2, (archY(x) + archY(x + 4)) / 2 + .15, 0, this.roofGroup, false);
      p.rotation.x = -Math.PI / 2; p.rotation.y = -Math.atan2(archY(x + 4) - archY(x), 4);
    }
    this.roofLamps = [];
    const lampMaterial = new THREE.MeshBasicMaterial({ color: '#fff0c7', toneMapped: false });
    for (const x of [-13, 0, 13]) for (const z of [-19, -6, 7, 20]) {
      const lamp = this.mesh(new THREE.CylinderGeometry(.28, .4, .16, 12), lampMaterial, x, archY(x) - 1.2, z, this.roofGroup, false);
      this.roofLamps.push(lamp);
    }
    // Retain a basketball hoop behind the temporary stage as a visual anchor to the photograph.
    const hoop = new THREE.Group(); this.scene.add(hoop);
    this.box(.24, 4.3, .24, -11.9, 2.15, -23, steel, hoop);
    this.box(2.05, 1.2, .10, -11.9, 4.5, -22.2, mat('#e9f1e9', { transparent: true, opacity: .66 }), hoop);
    const ring = this.mesh(new THREE.TorusGeometry(.35, .04, 6, 24), mat('#cb8254'), -11.9, 4.06, -21.8, hoop); ring.rotation.x = Math.PI / 2;
    this.buildStage();
    this.buildZones();
  }

  buildStage() {
    const charcoal = mat('#233b38'); const brass = mat('#be9b63', { metalness: .4, roughness: .42 });
    this.box(16.8, .56, 5.4, 0, .37, -20.5, charcoal);
    this.box(17.0, .085, .12, 0, .7, -17.78, brass);
    this.box(4, .24, .8, 0, .17, -17.35, charcoal);
    this.box(4, .36, .7, 0, .26, -17.88, charcoal);
    this.box(14.8, 6.2, .35, 0, 3.67, -22.95, charcoal);
    this.screenCanvas = makeCanvas(1792, 800); this.screenTexture = new THREE.CanvasTexture(this.screenCanvas); this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    this.screenMaterial = new THREE.MeshBasicMaterial({ map: this.screenTexture, toneMapped: false });
    this.mesh(new THREE.PlaneGeometry(14.3, 5.74), this.screenMaterial, 0, 3.75, -22.755, this.scene, false);
    this.box(.9, 1.2, .72, -5.7, 1.25, -19.3, mat('#e2d8bd'));
    this.flatLabel('48H', .66, .23, -5.7, 1.55, -18.925, { color: '#2c5548' });
    this.flatLabel('MAKE  ·  TEST  ·  SHARE', 10, .54, 0, .39, -17.786, { color: '#e0d8bb' });
    this.stageAccent = new THREE.PointLight('#aad7bc', 12, 18, 2); this.stageAccent.position.set(0, 4, -20); this.scene.add(this.stageAccent);
  }

  buildZones() {
    this.zoneVisuals = new Map();
    for (const [id, z] of Object.entries(ZONES)) {
      const material = new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: id === 'aisle' ? .10 : .035, depthWrite: false, side: THREE.DoubleSide });
      const plane = this.mesh(new THREE.PlaneGeometry(z.w, z.d), material, z.x, id === 'aisle' ? .10 : .102, z.z, this.scene, false); plane.rotation.x = -Math.PI / 2;
      plane.userData.zone = id;
      this.pickTargets.push(plane); this.zoneVisuals.set(id, plane);
      const positions = [z.x - z.w / 2, .118, z.z - z.d / 2, z.x + z.w / 2, .118, z.z - z.d / 2, z.x + z.w / 2, .118, z.z + z.d / 2, z.x - z.w / 2, .118, z.z + z.d / 2];
      const outline = new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)), new THREE.LineBasicMaterial({ color: z.color, transparent: true, opacity: .38 }));
      outline.userData.zone = id; this.scene.add(outline); plane.userData.outline = outline;
    }
    const standHit = this.mesh(new THREE.PlaneGeometry(6.5, 38), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }), 23.3, 3.15, 0, this.scene, false);
    standHit.rotation.x = -Math.PI / 2; standHit.userData.zone = 'stands'; this.pickTargets.push(standHit);
    for (const id of ['mentors', 'quiet', 'checkin', 'break']) {
      const z = ZONES[id]; this.flatLabel(z.label, id === 'mentors' || id === 'quiet' ? 5.4 : 8, .7, z.x, .13, z.z + z.d / 2 - .4, { floor: true, color: '#f1eddb' });
    }
    this.flatLabel('START HERE  /  入口示意', 9, 1.0, .65, .13, 25.4, { floor: true, color: '#f3edda' });
  }

  addProp(role, x, y, z, rotation = 0, size = null) {
    if (!this.propPlacements.has(role)) this.propPlacements.set(role, []);
    this.propPlacements.get(role).push({ x, y, z, rotation, size });
  }
  buildFurniture() {
    this.tables = []; this.seats = [];
    const deskXs = [-11.0, -6.9, -2.8, 4.3, 8.4]; const deskZs = [-7.1, -2.9, 1.3, 5.5, 9.7];
    let number = 1;
    for (const z of deskZs) for (const x of deskXs) {
      this.tables.push({ x, z, number });
      this.addProp('table', x, .085, z, 0, [2.65, .78, 1.28]);
      for (const side of [-1, 1]) for (const dx of [-.74, .74]) {
        const sz = z + side * 1.17; const rotation = side === 1 ? 0 : Math.PI;
        this.addProp('chair', x + dx, .085, sz, rotation + Math.PI, [.56, .94, .62]);
        this.seats.push({ x: x + dx, z: sz, rotation });
      }
      for (const side of [-1, 1]) this.addProp('laptop', x + side * .66, .872, z + side * .23, side === 1 ? 0 : Math.PI, [.42, .27, .326]);
      // Team placards stay independent of the imported desk geometry.
      this.flatLabel(String(number).padStart(2, '0'), .41, .23, x, 1.12, z + .16, { background: '#294a40', color: '#f1dfa9' });
      number++;
    }
    for (const z of [-2.3, 3.3]) {
      this.addProp('table', -17.1, .085, z, Math.PI / 2, [1.95, .78, 1.08]);
      this.addProp('chair', -18.3, .085, z, Math.PI / 2, [.56, .94, .62]);
      this.addProp('chair', -15.9, .085, z, -Math.PI / 2, [.56, .94, .62]);
      this.addProp('laptop', -17.1, .87, z, Math.PI / 2, [.42, .27, .326]);
    }
    for (const z of [-2.6, 1.2, 5]) {
      this.addProp('chair', 17.15, .085, z, -Math.PI / 2, [.65, 1.09, .72]);
      this.addProp('plant', 18.6, .085, z + 1.05, 0, [1.03, 1.9, 1.08]);
    }
    for (const x of [-11.0, -7.5]) { this.addProp('table', x, .085, 20.2, 0, [2.8, .9, 1.1]); this.addProp('chair', x, .085, 19.0, Math.PI, [.56, .94, .62]); this.addProp('laptop', x, .99, 20.25, 0, [.42, .27, .326]); }
    for (const x of [7.0, 10.5]) this.addProp('table', x, .085, 20.2, 0, [2.8, .9, 1.1]);
    for (const [x, z] of [[-14.1, 19.6], [-4.9, 20.0], [4.8, 20], [13.2, 20], [-17.2, -7.8], [17.2, -7.8], [-9.3, -21], [9.3, -21]]) this.addProp('plant', x, .085, z, 0, [1.04, 1.92, 1.10]);
    for (const x of [-9.8, 9.8]) this.addProp('speaker', x, .085, -18.5, 0, [.83, 2.08, .8]);
    const coffeeMaterial = mat('#efe8d5'); const coffeeMetal = mat('#4f5e57', { metalness: .3 });
    this.box(.7, .6, .6, 7.2, 1.27, 20.2, coffeeMetal);
    for (let n = 0; n < 8; n++) this.mesh(new THREE.CylinderGeometry(.065, .05, .15, 10), coffeeMaterial, 8 + (n % 4) * .16, 1.06, 20 + Math.floor(n / 4) * .20);
    this.signBoard(-11.8, 23.1, 'HELLO.', 'CHECK IN / 签到'); this.signBoard(11.5, 23.1, 'TAKE A BREAK', 'COFFEE / 茶歇');
    this.buildFallbackProps();
  }
  signBoard(x, z, title, detail) {
    const material = mat('#e3d9ba'); this.box(2.6, 2.5, .15, x, 1.4, z, material);
    this.box(2.8, .12, 1.0, x, .15, z, mat('#344c41'));
    this.flatLabel(title, 2.32, .37, x, 1.75, z + .083, { color: '#294e41' });
    this.flatLabel(detail, 2.3, .24, x, 1.1, z + .084, { color: '#466354' });
  }
  buildFallbackProps() {
    const wood = mat('#d6c39c'); const steel = mat('#495951'); const green = mat('#738f64');
    for (const [role, placements] of this.propPlacements) {
      const group = new THREE.Group(); group.name = `Temporary placeholders: ${role}`; this.propGroup.add(group); this.propBatches.set(role, group);
      for (const p of placements) {
        const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = p.rotation; group.add(g);
        if (role === 'table') {
          this.box(p.size[0], .09, p.size[2], 0, p.size[1] - .045, 0, wood, g);
          for (const x of [-.42, .42]) this.box(.10, p.size[1] - .1, p.size[2] * .78, x * p.size[0], (p.size[1] - .1) / 2, 0, steel, g);
        } else if (role === 'chair') {
          this.box(.5, .085, .46, 0, .44, 0, steel, g); this.box(.5, .40, .065, 0, .7, .22, steel, g);
          for (const x of [-.19, .19]) this.box(.04, .4, .38, x, .22, 0, steel, g);
        } else if (role === 'plant') {
          this.mesh(new THREE.CylinderGeometry(.32, .22, .48, 10), wood, 0, .24, 0, g);
          this.mesh(new THREE.IcosahedronGeometry(.55, 1), green, 0, 1.04, 0, g);
        } else if (role === 'laptop') {
          this.box(.40, .035, .29, 0, .02, 0, steel, g); this.box(.4, .23, .025, 0, .14, -.12, steel, g);
        } else this.box(.55, 1.9, .45, 0, .95, 0, steel, g);
      }
    }
  }

  async loadAssets() {
    this.assetState = { state: 'loading', loaded: 0, total: 5, message: '正在加载 3dassets.dev 的真实 GLB 素材…', assets: [] };
    this.reportStatus();
    try {
      const response = await fetch(new URL('./assets/catalogue.json', import.meta.url));
      if (!response.ok) throw new Error(`素材清单 HTTP ${response.status}`);
      const catalogue = await response.json();
      if (!Array.isArray(catalogue.assets) || !catalogue.assets.length) throw new Error('素材清单为空');
      this.catalogue = catalogue;
      const neededRoles = [...this.propPlacements.keys()];
      const entries = neededRoles.map(role => ({ role, entry: catalogue.assets.find(a => a.role === role || a.id === role) }));
      this.assetState.total = entries.length;
      const loader = new GLTFLoader();
      const results = await Promise.all(entries.map(async ({ role, entry }) => {
        try {
          if (!entry?.localPath) throw new Error(`清单缺少 ${role}`);
          const gltf = await loader.loadAsync(new URL(entry.localPath, import.meta.url).href);
          if (this.destroyed) { this.disposeTree(gltf.scene); return { role, ok: false, message: 'renderer destroyed' }; }
          this.installAsset(role, gltf.scene);
          const result = { ...entry, role, ok: true };
          this.loadedAssets.push(result); this.assetState.loaded++;
          this.assetState.assets.push(result); this.assetState.message = `已加载 ${this.assetState.loaded} / ${this.assetState.total} 个真实 GLB 素材`;
          this.reportStatus(); this.renderer.shadowMap.needsUpdate = true; this.invalidate();
          return result;
        } catch (error) {
          const result = { role, ok: false, title: entry?.title || role, message: error.message };
          this.assetState.assets.push(result); console.error(`GLB asset failed (${role})`, error); return result;
        }
      }));
      if (this.destroyed) return { state: 'error', message: 'renderer destroyed' };
      const failures = results.filter(r => !r.ok);
      this.assetState.state = failures.length ? (this.assetState.loaded ? 'partial' : 'error') : 'ready';
      this.assetState.message = failures.length ? `${this.assetState.loaded} / ${entries.length} 个素材已加载；${failures.map(f => f.role).join('、')} 加载失败，仍显示临时占位模型。` : `${entries.length} 个 3dassets.dev 真实素材已接入 · 桌椅、笔记本、绿植与音箱`;
      this.reportStatus(); return { ...this.assetState };
    } catch (error) {
      this.assetState.state = 'error'; this.assetState.message = `真实素材加载失败：${error.message}。当前为临时占位模型。`;
      console.error(error); this.reportStatus(); return { ...this.assetState };
    }
  }
  reportStatus() { if (!this.destroyed) this.onStatus({ ...this.assetState, assets: [...this.assetState.assets] }); }

  installAsset(role, model) {
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model); const size = bounds.getSize(new THREE.Vector3()); const center = bounds.getCenter(new THREE.Vector3());
    if (size.x < .00001 || size.y < .00001 || size.z < .00001) throw new Error(`${role} GLB has invalid bounds`);
    const placements = this.propPlacements.get(role) || [];
    const batch = new THREE.Group(); batch.name = `3dassets.dev / ${role} / ${placements.length} instances`;
    const localOrigin = new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z);
    const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    const normalized = new THREE.Matrix4(), placement = new THREE.Matrix4(), matrix = new THREE.Matrix4();
    let meshCount = 0;
    model.traverse(source => {
      if (!source.isMesh) return;
      if (!source.geometry.attributes.normal) source.geometry.computeVertexNormals();
      const materials = Array.isArray(source.material) ? source.material : [source.material];
      for (const material of materials) { material.envMapIntensity = .62; }
      const instances = new THREE.InstancedMesh(source.geometry, source.material, placements.length);
      instances.name = `${role}: ${source.name || meshCount}`;
      instances.castShadow = role !== 'laptop'; instances.receiveShadow = true;
      for (let i = 0; i < placements.length; i++) {
        const p = placements[i]; const desired = p.size || [size.x, size.y, size.z];
        scale.set(desired[0] / size.x, desired[1] / size.y, desired[2] / size.z);
        normalized.makeScale(scale.x, scale.y, scale.z).multiply(localOrigin).multiply(source.matrixWorld);
        position.set(p.x, p.y, p.z); rotation.setFromAxisAngle(v3(0, 1, 0), p.rotation);
        placement.compose(position, rotation, v3(1, 1, 1)); matrix.multiplyMatrices(placement, normalized);
        instances.setMatrixAt(i, matrix);
      }
      instances.instanceMatrix.needsUpdate = true; instances.computeBoundingSphere(); batch.add(instances); meshCount++;
    });
    if (!meshCount) throw new Error(`${role} GLB contains no mesh`);
    const old = this.propBatches.get(role);
    if (old) { this.propGroup.remove(old); this.disposeTree(old); }
    this.propGroup.add(batch); this.propBatches.set(role, batch);
  }

  buildPeople() {
    this.people = Array.from({ length: 100 }, (_, i) => ({ index: i, seat: this.seats[i], color: ['#d4a475', '#6e9692', '#d5d7c1', '#7a8699', '#b99898'][i % 5] }));
    this.peopleGroup = new THREE.Group(); this.peopleGroup.name = '100 schematic participants'; this.scene.add(this.peopleGroup);
    const specs = {
      body: [new THREE.CylinderGeometry(.17, .20, .52, 7), mat('#a9bfc0')],
      head: [new THREE.SphereGeometry(.135, 9, 7), mat('#d6b79b')],
      hair: [new THREE.SphereGeometry(.138, 8, 5, 0, TAU, 0, Math.PI * .47), mat('#405149')],
      leftLeg: [new THREE.CylinderGeometry(.065, .062, .44, 6), mat('#485a54')],
      rightLeg: [new THREE.CylinderGeometry(.065, .062, .44, 6), mat('#485a54')],
      leftArm: [new THREE.CylinderGeometry(.052, .048, .44, 6), mat('#acb9ab')],
      rightArm: [new THREE.CylinderGeometry(.052, .048, .44, 6), mat('#acb9ab')]
    };
    this.personParts = {};
    for (const [name, [geometry, material]] of Object.entries(specs)) {
      const part = new THREE.InstancedMesh(geometry, material, this.people.length); part.castShadow = name === 'body'; part.receiveShadow = true;
      part.instanceMatrix.setUsage(THREE.DynamicDrawUsage); part.frustumCulled = false;
      if (['body', 'leftArm', 'rightArm'].includes(name)) this.people.forEach((p, i) => part.setColorAt(i, new THREE.Color(p.color)));
      this.personParts[name] = part; this.peopleGroup.add(part);
    }
    this.dummy = new THREE.Object3D(); this.personTransform = new THREE.Object3D(); this.personMatrix = new THREE.Matrix4();
    this.updatePeople();
  }
  personPose(i) {
    const seat = this.people[i].seat;
    if (this.phase === 'opening' || this.phase === 'demo') {
      if (i >= 96) return { x: (i - 97.5) * 1.2 + 1.6, z: -19.7, y: .65, rotation: Math.PI, sitting: false };
      const side = i < 48 ? -1 : 1; const n = i % 48; const step = 1 + Math.floor(n / 16);
      return { x: side * (20.9 + step * 1.2), z: -16.5 + (n % 16) * 2.2, y: .24 + step * .53, rotation: side < 0 ? -Math.PI / 2 : Math.PI / 2, sitting: true };
    }
    if (this.phase === 'mentoring' && i < 8) return { x: -17.1 + (i % 2 ? 1.22 : -1.22), z: (i < 4 ? -2.3 : 3.3) + (Math.floor(i / 2) % 2 ? .64 : -.64), y: .085, rotation: i % 2 ? Math.PI / 2 : -Math.PI / 2, sitting: i % 2 === 0 };
    if (this.phase === 'closing' && i % 4 === 0) return { x: -.45 + (i % 3) * .65, z: 12 + (i % 12) * .85, y: .085, rotation: 0, sitting: false };
    return { ...seat, y: .085, sitting: true };
  }
  updatePeople() {
    if (!this.personParts) return;
    const d = this.dummy, root = this.personTransform;
    this.people.forEach((person, i) => {
      const p = this.personPose(i); const sitting = p.sitting;
      root.position.set(p.x, p.y, p.z); root.rotation.set(0, p.rotation, 0); root.scale.setScalar(.92); root.updateMatrix();
      const torsoY = sitting ? .82 : 1.03; const headY = torsoY + .40;
      const parts = {
        body: [0, torsoY, 0, 0], head: [0, headY, -.015, 0], hair: [0, headY + .025, -.015, 0],
        leftLeg: [-.11, sitting ? .35 : .36, sitting ? -.16 : 0, sitting ? -.75 : 0],
        rightLeg: [.11, sitting ? .35 : .36, sitting ? -.16 : 0, sitting ? -.75 : 0],
        leftArm: [-.23, torsoY - .03, sitting ? -.13 : 0, sitting ? -.65 : 0],
        rightArm: [.23, torsoY - .03, sitting ? -.13 : 0, sitting ? -.65 : 0]
      };
      for (const [name, [x, y, z, rotation]] of Object.entries(parts)) {
        d.position.set(x, y, z); d.rotation.set(rotation, 0, 0); d.scale.set(1, 1, 1); d.updateMatrix();
        this.personMatrix.multiplyMatrices(root.matrix, d.matrix); this.personParts[name].setMatrixAt(i, this.personMatrix);
      }
    });
    for (const mesh of Object.values(this.personParts)) mesh.instanceMatrix.needsUpdate = true;
  }

  buildFlows() {
    const points = [v3(.65, .14, 24.2), v3(.65, .14, -15), v3(-14.2, .14, -15), v3(-14.2, .14, 15.8), v3(14.3, .14, 15.8), v3(14.3, .14, -15), v3(.65, .14, -15)];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: '#e7dcb0', transparent: true, opacity: .5, dashSize: .55, gapSize: .50 })); line.computeLineDistances(); this.flowGroup.add(line);
    for (const z of [-11, -3, 5, 13, 22]) {
      const arrow = new THREE.Shape(); arrow.moveTo(-.21, -.28); arrow.lineTo(0, .15); arrow.lineTo(.21, -.28); arrow.lineTo(0, -.08); arrow.closePath();
      const mesh = this.mesh(new THREE.ShapeGeometry(arrow), new THREE.MeshBasicMaterial({ color: '#eee5bc', transparent: true, opacity: .58, side: THREE.DoubleSide }), .65, .15, z, this.flowGroup, false); mesh.rotation.x = -Math.PI / 2;
    }
    this.walkers = [];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group(); this.flowGroup.add(g);
      this.mesh(new THREE.CylinderGeometry(.15, .18, .5, 7), mat(i % 2 ? '#bbaf83' : '#a6c5ba'), 0, .9, 0, g, false);
      this.mesh(new THREE.SphereGeometry(.13, 8, 6), mat('#ceb394'), 0, 1.28, 0, g, false);
      const legs = [];
      for (const x of [-.1, .1]) legs.push(this.mesh(new THREE.CylinderGeometry(.06, .055, .56, 6), mat('#45594e'), x, .35, 0, g, false));
      this.walkers.push({ group: g, legs, offset: i / 8 });
    }
    this.updateWalkers();
  }
  updateWalkers() {
    if (!this.walkers) return;
    this.walkers.forEach(({ group, legs, offset }, i) => {
      const t = (this.motionTime * .023 + offset) % 1;
      if (t < .5) { group.position.set(.18 + (i % 2) * .88, .085, 23 - t * 75); group.rotation.y = Math.PI; }
      else { group.position.set(i % 2 ? 14.25 : -14.2, .085, -14.5 + (t - .5) * 75); group.rotation.y = 0; }
      const step = Math.sin(this.motionTime * 5 + i) * .28;
      legs[0].rotation.x = step; legs[1].rotation.x = -step;
      // A schematic route marker should never become a foreground obstruction.
      group.visible = this.view !== 'walk' || Math.hypot(group.position.x - this.camera.position.x, group.position.z - this.camera.position.z) > 6;
    });
  }

  updateScreen() {
    if (!this.screenCanvas) return;
    const ctx = this.screenCanvas.getContext('2d'); const w = this.screenCanvas.width, h = this.screenCanvas.height;
    ctx.fillStyle = '#132d28'; ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * .86, h * .9, 0, w * .86, h * .9, w * .72);
    glow.addColorStop(0, '#547862'); glow.addColorStop(1, '#132d28'); ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d0b983'; ctx.fillRect(98, 104, 96, 8);
    ctx.fillStyle = '#dce6d5'; ctx.font = '500 34px Arial'; ctx.fillText('HACKATHON  /  GYMNASIUM EDITION', 98, 174);
    ctx.font = '700 164px Arial'; ctx.fillStyle = '#f1efdb'; ctx.fillText('48H', 92, 369);
    ctx.font = '600 53px Arial'; ctx.fillText(PHASE_LABELS[this.phase], 101, 466);
    ctx.font = '400 30px Arial'; ctx.fillStyle = '#bdd0be'; ctx.fillText('25 TEAMS    ·    100 CREATORS    ·    ONE SHARED SPACE', 103, 558);
    const totalMinutes = Math.round(this.hours * 60);
    ctx.font = '500 37px Arial'; ctx.fillStyle = '#e2c899'; ctx.fillText(`T + ${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`, 103, 695);
    ctx.strokeStyle = '#a4b996'; ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(1500, 380, 68 + i * 42, -.8, 4.5); ctx.stroke(); }
    this.screenTexture.needsUpdate = true;
  }

  bindEvents() {
    const canvas = this.canvas;
    this.handlers.pointerdown = event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      canvas.focus({ preventScroll: true });
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, moved: false });
      if (this.pointers.size > 1) for (const p of this.pointers.values()) p.moved = true;
    };
    this.handlers.pointermove = event => {
      const p = this.pointers.get(event.pointerId);
      if (p && Math.hypot(event.clientX - p.x, event.clientY - p.y) > 5) p.moved = true;
    };
    this.handlers.pointerup = event => {
      const p = this.pointers.get(event.pointerId); this.pointers.delete(event.pointerId);
      if (p && !p.moved && !this.pointers.size) {
        const bounds = canvas.getBoundingClientRect(); this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hits = this.raycaster.intersectObjects(this.pickTargets, false);
        if (hits.length) { const id = hits[0].object.userData.zone; this.setSelectedZone(id); this.onSelect(id); }
      }
    };
    this.handlers.pointercancel = event => { this.pointers.delete(event.pointerId); };
    this.handlers.keydown = event => {
      const key = event.key; const offset = this.camera.position.clone().sub(this.controls.target);
      if (key === '+' || key === '=') { offset.multiplyScalar(.89); this.camera.position.copy(this.controls.target).add(offset); }
      else if (key === '-' || key === '_') { offset.multiplyScalar(1.12); this.camera.position.copy(this.controls.target).add(offset); }
      else if (key === 'Home') this.reset();
      else if (key.startsWith('Arrow')) {
        if (this.view === 'walk') {
          const forward = this.controls.target.clone().sub(this.camera.position); forward.y = 0; forward.normalize();
          const right = forward.clone().cross(v3(0, 1, 0));
          const delta = key === 'ArrowUp' ? forward : key === 'ArrowDown' ? forward.negate() : key === 'ArrowRight' ? right : right.negate();
          delta.multiplyScalar(.85); this.camera.position.add(delta); this.controls.target.add(delta);
        } else {
          const spherical = new THREE.Spherical().setFromVector3(offset);
          if (key === 'ArrowLeft') spherical.theta -= .08;
          if (key === 'ArrowRight') spherical.theta += .08;
          if (key === 'ArrowUp') spherical.phi = clamp(spherical.phi - .06, .035, Math.PI / 2 - .025);
          if (key === 'ArrowDown') spherical.phi = clamp(spherical.phi + .06, .035, Math.PI / 2 - .025);
          this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
        }
      } else return;
      event.preventDefault(); this.controls.update(); this.invalidate();
    };
    for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'keydown']) canvas.addEventListener(name, this.handlers[name]);
    this.handlers.visibility = () => { this.lastStamp = null; this.invalidate(); };
    document.addEventListener('visibilitychange', this.handlers.visibility);
  }

  setPhase(phase) {
    if (!PHASES.has(phase) || this.phase === phase) return;
    this.phase = phase; this.updatePeople(); this.updateScreen(); this.updateHighlights();
    this.renderer.shadowMap.needsUpdate = true; this.invalidate();
  }
  setTime(hours) {
    if (!Number.isFinite(Number(hours))) return;
    this.hours = clamp(Number(hours), 0, 48);
    const clockHour = (9 + this.hours) % 24;
    const daylight = clamp(Math.sin((clockHour - 6) / 12 * Math.PI) * 1.35, 0, 1);
    this.daylight = daylight;
    this.hemi.intensity = .55 + daylight * 1.45; this.sun.intensity = .12 + daylight * 2.7;
    this.fillLight.intensity = .45 + daylight * .55; this.interiorLight.intensity = (1 - daylight) * 1.4;
    this.stageAccent.intensity = 12 + (1 - daylight) * 12;
    const color = new THREE.Color('#334b58').lerp(new THREE.Color('#e4e9e5'), daylight);
    this.scene.background.copy(color); this.scene.fog.color.copy(color);
    this.scene.environmentIntensity = .26 + daylight * .20;
    this.renderer.toneMappingExposure = 1.00 + daylight * .10;
    const minute = Math.round(this.hours * 60);
    if (minute !== this.screenMinute) { this.screenMinute = minute; this.updateScreen(); }
    this.invalidate();
  }
  setPlaying(value) { this.playing = Boolean(value); this.lastStamp = null; this.invalidate(); }
  setView(view) {
    // Flush the previous drag's inertia before applying an explicit camera preset.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false; this.controls.update();
    this.view = ['perspective', 'top', 'walk'].includes(view) ? view : 'perspective';
    this.controls.enableRotate = this.view !== 'top'; this.controls.minDistance = this.view === 'walk' ? 1.0 : 12; this.controls.maxDistance = this.view === 'walk' ? 42 : 135;
    this.controls.maxPolarAngle = this.view === 'walk' ? Math.PI * .57 : Math.PI / 2 - .025;
    this.camera.fov = this.view === 'walk' ? 64 : 43;
    if (this.view === 'top') { this.camera.position.set(0, 86, .1); this.controls.target.set(0, 0, 0); }
    else if (this.view === 'walk') { this.camera.position.set(.65, 4.7, 24.7); this.controls.target.set(.65, 2.15, -8); }
    else { this.camera.position.set(43, 43, 59); this.controls.target.set(0, 1, -1.8); }
    this.camera.updateProjectionMatrix(); this.controls.update(); this.controls.enableDamping = damping; this.invalidate();
    if (this.roofMaterial) this.roofMaterial.opacity = this.view === 'walk' ? .94 : .13;
    this.updateWalkers();
  }
  setFlows(value) { this.flows = Boolean(value); this.flowGroup.visible = this.flows; this.invalidate(); }
  setRoof(value) { this.roof = Boolean(value); this.roofGroup.visible = this.roof; this.renderer.shadowMap.needsUpdate = true; this.invalidate(); }
  setSelectedZone(id) { if (!(id in ZONES)) return; this.selected = id; this.updateHighlights(); this.invalidate(); }
  updateHighlights() {
    for (const [id, plane] of this.zoneVisuals) {
      const selected = id === this.selected; const active = ACTIVE[this.phase].includes(id);
      plane.material.opacity = selected ? .13 : id === 'aisle' ? .065 : active ? .045 : .014;
      plane.userData.outline.material.opacity = selected ? .82 : active ? .4 : .18;
    }
  }
  reset() { this.setView('perspective'); this.setSelectedZone('teams'); }
  resize() {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect(); this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    this.renderer.setSize(this.width, this.height, false); this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix(); this.renderer.shadowMap.needsUpdate = true; this.invalidate();
  }
  invalidate() {
    if (this.destroyed) return; this.dirty = true;
    if (this.frame === null) this.frame = requestAnimationFrame(stamp => this.tick(stamp));
  }
  tick(stamp) {
    this.frame = null; if (this.destroyed) return;
    const dt = this.lastStamp === null ? 0 : Math.min((stamp - this.lastStamp) / 1000, .08); this.lastStamp = stamp;
    if (this.playing && !document.hidden) { this.motionTime += dt; this.updateWalkers(); this.dirty = true; }
    // controls.update returns true while damping still changes the camera.
    const controlsChanged = this.controls.update();
    if (controlsChanged && this.view === 'walk') this.updateWalkers();
    if (this.dirty || controlsChanged) { this.renderer.render(this.scene, this.camera); this.dirty = false; }
    if ((this.playing && !document.hidden) || controlsChanged || this.dirty) this.invalidate();
  }
  disposeTree(root) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    root.traverse(node => { if (node.geometry) geometries.add(node.geometry); if (node.material) for (const m of (Array.isArray(node.material) ? node.material : [node.material])) materials.add(m); });
    for (const m of materials) { for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); m.dispose(); }
    for (const geometry of geometries) geometry.dispose(); for (const texture of textures) texture.dispose();
  }
  destroy() {
    if (this.destroyed) return; this.destroyed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.observer?.disconnect(); if (this.handlers.resize) window.removeEventListener('resize', this.handlers.resize);
    for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'keydown']) this.canvas.removeEventListener(name, this.handlers[name]);
    document.removeEventListener('visibilitychange', this.handlers.visibility);
    this.controls.dispose(); this.disposeTree(this.scene); this.environmentTarget?.dispose(); this.renderer.dispose();
    this.canvas.style.touchAction = this.original.touchAction; this.canvas.style.cursor = this.original.cursor;
    if (this.original.tabIndex === null) this.canvas.removeAttribute('tabindex'); else this.canvas.setAttribute('tabindex', this.original.tabIndex);
  }
}

// Existing app.js can keep its public constructor while the renderer is an ES module.
window.VenueRenderer = VenueRenderer;
