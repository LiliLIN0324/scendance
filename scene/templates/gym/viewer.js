import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// The viewer reads one archived scene. It does not reconstruct venue geometry.
const $ = id => document.getElementById(id);
const canvas = $('scene');
const state = { ready: false, status: 'loading', view: 'overview', roof: false, meshes: 0, triangles: 0, materials: 0, dimensions: null, error: null };
let renderer, scene, camera, controls, perspective, orthographic, environmentTarget, root, roof;
let frame = null, disposed = false, loading = false, observer, narrowFit = 1;
const fitBox = new THREE.Box3();
const viewNames = { overview: '总览', top: '俯视', inside: '场内' };

function status(kind, message) {
  state.status = kind; state.ready = kind === 'ready'; state.error = kind === 'error' ? message : null;
  $('load-status').dataset.state = kind;
  $('load-status').textContent = { loading: '读取归档中', ready: '已归档 · GLB 就绪', error: '尚未成功读取' }[kind];
  $('load-detail').textContent = message;
  $('load-overlay').hidden = kind === 'ready';
  $('load-overlay').classList.toggle('error', kind === 'error');
  $('overlay-title').textContent = kind === 'error' ? '场景尚未成功归档或文件不可用' : '读取完整场景';
  $('overlay-message').textContent = message;
  $('retry').hidden = kind !== 'error';
  $('glb-download').setAttribute('aria-disabled', String(kind !== 'ready'));
}
function invalidate() {
  if (disposed || frame !== null || !renderer) return;
  frame = requestAnimationFrame(render);
}
function render() {
  frame = null;
  if (disposed) return;
  const moving = controls.update();
  renderer.render(scene, camera);
  if (moving) invalidate();
}
function updateCaption() {
  $('view-label').textContent = `${viewNames[state.view]} · 屋顶${state.roof ? '显示' : '隐藏'}`;
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
}
function topFrustum() {
  const dimensions = fitBox.isEmpty() ? new THREE.Vector3(57, 20, 57) : fitBox.getSize(new THREE.Vector3());
  const aspect = perspective.aspect;
  const halfHeight = Math.max(dimensions.z / 2, dimensions.x / (2 * aspect)) * 1.14;
  orthographic.left = -halfHeight * aspect; orthographic.right = halfHeight * aspect;
  orthographic.top = halfHeight; orthographic.bottom = -halfHeight;
  orthographic.updateProjectionMatrix();
}
function setView(view) {
  if (!controls || !['overview', 'top', 'inside'].includes(view)) return;
  const damping = controls.enableDamping;
  controls.enableDamping = false; controls.update();
  state.view = view;
  camera = view === 'top' ? orthographic : perspective;
  controls.object = camera;
  controls.enableRotate = view !== 'top'; controls.minDistance = view === 'inside' ? 1 : 12;
  controls.maxDistance = view === 'inside' ? 70 : 420;
  controls.minPolarAngle = 0.001;
  controls.maxPolarAngle = view === 'inside' ? Math.PI * .57 : Math.PI / 2 - .025;
  controls.minZoom = .45; controls.maxZoom = 7;
  if (view === 'top') {
    topFrustum(); orthographic.zoom = 1; orthographic.updateProjectionMatrix();
    const center = fitBox.isEmpty() ? new THREE.Vector3() : fitBox.getCenter(new THREE.Vector3());
    camera.position.set(center.x, 86, center.z + .01); controls.target.set(center.x, 0, center.z);
  } else if (view === 'inside') {
    camera.fov = 64; camera.position.set(.65, 4.7, 24.7); controls.target.set(.65, 2.15, -8);
  } else {
    camera.fov = 43; controls.target.set(0, 1, -1.8); camera.position.set(43, 43, 59);
    camera.position.sub(controls.target).multiplyScalar(narrowFit).add(controls.target);
  }
  camera.updateProjectionMatrix(); controls.update(); controls.enableDamping = damping;
  updateCaption(); invalidate();
}
function setRoof(value) {
  state.roof = Boolean(value); $('roof-toggle').checked = state.roof;
  if (roof) roof.visible = state.roof;
  if (renderer) renderer.shadowMap.needsUpdate = true;
  updateCaption(); invalidate();
}
function resize() {
  if (!renderer || disposed) return;
  const { width, height } = $('canvas-wrap').getBoundingClientRect();
  renderer.setSize(Math.max(1, width), Math.max(1, height), false);
  perspective.aspect = Math.max(1, width) / Math.max(1, height);
  const nextFit = Math.max(1, 1.25 / perspective.aspect);
  if (state.view === 'overview' && controls) camera.position.sub(controls.target).multiplyScalar(nextFit / narrowFit).add(controls.target);
  narrowFit = nextFit; perspective.updateProjectionMatrix(); topFrustum(); invalidate();
}
function disposeModel(model) {
  if (!model) return;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  model.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose());
}
async function loadScene() {
  if (loading || disposed) return;
  loading = true; status('loading', '正在读取 gym.glb；完成解析后显示归档结果。');
  let loadedRoot = null;
  try {
    const gltf = await new GLTFLoader().loadAsync(new URL('./gym.glb', import.meta.url).href, event => {
      if (!event.lengthComputable) return;
      $('overlay-message').textContent = `已读取 ${Math.round(event.loaded / event.total * 100)}%，正在准备完整场景…`;
    });
    loadedRoot = gltf.scene;
    if (disposed) { disposeModel(loadedRoot); return; }
    loadedRoot.updateMatrixWorld(true);
    fitBox.setFromObject(loadedRoot);
    if (fitBox.isEmpty() || ![...fitBox.min.toArray(), ...fitBox.max.toArray()].every(Number.isFinite)) throw new Error('GLB 未包含可读取的有效场景几何。');
    let meshes = 0, triangles = 0;
    const materials = new Set();
    loadedRoot.traverse(object => {
      if (!object.isMesh) return;
      meshes++;
      triangles += ((object.geometry.index?.count ?? object.geometry.attributes.position?.count ?? 0) / 3) * (object.isInstancedMesh ? object.count : 1);
      const items = Array.isArray(object.material) ? object.material : [object.material];
      items.forEach(material => { if (material) materials.add(material.uuid); });
      object.castShadow = items.some(material => material && !material.transparent);
      object.receiveShadow = true;
    });
    if (meshes === 0) throw new Error('GLB 解析完成，但场景内没有可显示的网格。');
    roof = loadedRoot.getObjectByName('Gym_Roof');
    if (!roof) throw new Error('归档缺少 Gym_Roof 节点，完整场景结构需要重新检查。');
    root = loadedRoot; scene.add(root);
    Object.assign(state, { meshes, triangles: Math.round(triangles), materials: materials.size, dimensions: fitBox.getSize(new THREE.Vector3()).toArray() });
    $('mesh-stats').textContent = `${meshes.toLocaleString()} / ${Math.round(triangles).toLocaleString()}`;
    $('material-stats').textContent = `${materials.size} 个实际材质`;
    const size = state.dimensions;
    $('bounds-stats').textContent = `${size[0].toFixed(1)} × ${size[2].toFixed(1)} × ${size[1].toFixed(1)}`;
    setRoof(state.roof); setView(state.view);
    renderer.shadowMap.needsUpdate = true;
    status('ready', '实际 GLB 已解析并显示'); invalidate();
  } catch (error) {
    if (loadedRoot) { scene?.remove(loadedRoot); disposeModel(loadedRoot); }
    root = roof = null;
    status('error', `尚未完成读取：${error.message}。请确认 gym.glb 已归档；此处不会显示替代场景。`);
    console.error('Archived gym load failed:', error);
  } finally { loading = false; }
}
function initialize() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.10;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  scene = new THREE.Scene(); scene.background = new THREE.Color('#e4e9e5');
  perspective = new THREE.PerspectiveCamera(43, 1, .12, 600);
  orthographic = new THREE.OrthographicCamera(-35, 35, 35, -35, .1, 600);
  camera = perspective;
  controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = .09; controls.screenSpacePanning = false;
  controls.addEventListener('change', invalidate);
  controls.addEventListener('start', () => { canvas.style.cursor = 'grabbing'; });
  controls.addEventListener('end', () => { canvas.style.cursor = 'grab'; });
  scene.add(new THREE.HemisphereLight('#e5f0ff', '#7b8b6e', 2));
  const sun = new THREE.DirectionalLight('#fff1d8', 2.82); sun.position.set(-29, 48, 10); sun.target.position.set(0, 0, -2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -39, right: 39, top: 39, bottom: -39, near: .5, far: 140 });
  sun.shadow.normalBias = .035; sun.shadow.bias = -.0002; scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#dbe7ff', 1); fill.position.set(20, 25, -30); scene.add(fill);
  const pmrem = new THREE.PMREMGenerator(renderer); const environment = new RoomEnvironment();
  environmentTarget = pmrem.fromScene(environment, .08); scene.environment = environmentTarget.texture; scene.environmentIntensity = .46;
  environment.dispose(); pmrem.dispose();
  for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => setView(button.dataset.view));
  $('roof-toggle').addEventListener('change', event => setRoof(event.target.checked));
  $('retry').addEventListener('click', loadScene);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); status('error', '图形上下文已中断，请刷新页面重新读取归档。'); });
  observer = new ResizeObserver(resize); observer.observe($('canvas-wrap'));
  resize(); setView('overview'); loadScene();
}
function dispose() {
  disposed = true; if (frame !== null) cancelAnimationFrame(frame);
  observer?.disconnect(); controls?.dispose(); disposeModel(root); environmentTarget?.dispose(); renderer?.dispose();
}
window.gymViewer = { setView, setRoof, getState: () => structuredClone(state), dispose };
try { initialize(); } catch (error) { status('error', `三维显示初始化失败：${error.message}`); console.error(error); }
window.addEventListener('beforeunload', dispose, { once: true });
