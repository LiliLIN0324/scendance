import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CatalogItem, FurnitureItem } from '../lib/types';

const MAX_GLB_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
export type GlbAssetState = Readonly<{
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  dimensions?: Readonly<{ width: number; depth: number; height: number }>;
}>;
type CachedAsset = { url: string; state: GlbAssetState; source?: THREE.Object3D; promise: Promise<void>; controller: AbortController };
const cache = new Map<string, CachedAsset>();
const listeners = new Set<() => void>();
const IDLE: GlbAssetState = Object.freeze({ status: 'idle' });
let revision = 0;
function changed(): void { revision += 1; listeners.forEach(fn => fn()); }
export function subscribeGlbAssets(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function getGlbAssetRevision(): number { return revision; }
export function getGlbAssetState(key: string): GlbAssetState { return cache.get(key)?.state ?? IDLE; }
export function glbAssetKey(item: Pick<FurnitureItem, 'assetId' | 'glbUrl'>): string | undefined { return item.assetId ?? item.glbUrl; }

/** Reject external URI dependencies: an archived standalone GLB must reopen by itself. */
export function validateGlbBuffer(buffer: ArrayBuffer): void {
  if (buffer.byteLength > MAX_GLB_BYTES) throw new Error('GLB 超过 10 MB，未载入。');
  if (buffer.byteLength < 20) throw new Error('GLB 文件不完整。');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) {
    throw new Error('文件不是有效的 GLB 2.0。');
  }
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength > buffer.byteLength - 20) throw new Error('GLB 缺少有效模型数据。');
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength))) as { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
  for (const dependency of [...(document.buffers ?? []), ...(document.images ?? [])]) {
    if (dependency.uri && !dependency.uri.startsWith('data:')) throw new Error('GLB 引用了外部文件，请先归档为独立模型。');
  }
}

async function downloadGlb(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  // Local samples use /assets/; cloud loading URLs must use HTTPS.
  if (!/^(?:https:\/\/|\/(?!\/)|\.\/)[^\s]+$/.test(url)) throw new Error('模型地址无效。');
  const response = await fetch(url, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error(`模型下载失败（HTTP ${response.status}）。`);
  if (Number(response.headers.get('content-length')) > MAX_GLB_BYTES) throw new Error('GLB 超过 10 MB，未载入。');
  if (!response.body) {
    const buffer = await response.arrayBuffer(); validateGlbBuffer(buffer); return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let count = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      count += result.value.byteLength;
      if (count > MAX_GLB_BYTES) { await reader.cancel(); throw new Error('GLB 超过 10 MB，未载入。'); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  validateGlbBuffer(bytes.buffer);
  return bytes.buffer;
}

function dimensionsOf(source: THREE.Object3D): { width: number; depth: number; height: number } {
  source.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(source).getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z].every(n => Number.isFinite(n) && n > 0.000001)) throw new Error('模型包围盒无效，无法设定尺寸。');
  let meshCount = 0;
  source.traverse(node => { if ((node as THREE.Mesh).isMesh) meshCount += 1; });
  if (!meshCount) throw new Error('模型不含可显示网格。');
  return { width: size.x, depth: size.z, height: size.y };
}

/** Cache is keyed by stable asset ID (or a local sample URL). A new URL supersedes a pending request. */
export function ensureGlbAsset(key: string, url: string): Promise<void> {
  if (!key) return Promise.reject(new Error('缺少模型标识。'));
  const prior = cache.get(key);
  if (prior?.state.status === 'ready') return Promise.resolve();
  if (prior?.state.status === 'loading' && prior.url === url) return prior.promise;
  prior?.controller.abort();
  const controller = new AbortController();
  const entry: CachedAsset = { url, state: { status: 'loading' }, controller, promise: Promise.resolve() };
  cache.set(key, entry);
  entry.promise = (async () => {
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let source: THREE.Object3D | undefined;
    try {
      const buffer = await downloadGlb(url, controller.signal);
      const gltf = await new GLTFLoader().parseAsync(buffer, '');
      source = gltf.scene;
      const dimensions = dimensionsOf(source);
      if (cache.get(key) !== entry || controller.signal.aborted) throw new Error('模型加载请求已过期，请重试。');
      entry.source = source;
      entry.state = { status: 'ready', dimensions };
      source = undefined; // The cache now owns the template.
      changed();
    } catch (error) {
      if (source) disposeOwnedModel(source);
      const message = controller.signal.aborted ? '模型加载超时或请求已取消，请重试。' : error instanceof Error ? error.message : '模型加载失败，请重试。';
      if (cache.get(key) === entry) { entry.state = { status: 'error', error: message }; changed(); }
      throw new Error(message);
    } finally { clearTimeout(timer); }
  })();
  changed();
  return entry.promise;
}

/** Every rendered instance owns its GPU resources; upstream disposeObject is therefore safe. */
export function cloneOwnedGlb(source: THREE.Object3D): THREE.Object3D {
  const object = cloneSkeleton(source);
  const geometryCopies = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const materialCopies = new Map<THREE.Material, THREE.Material>();
  const textureCopies = new Map<THREE.Texture, THREE.Texture>();
  function materialCopy(original: THREE.Material): THREE.Material {
    let result = materialCopies.get(original);
    if (result) return result;
    result = original.clone();
    for (const [field, value] of Object.entries(original)) {
      if (value instanceof THREE.Texture) {
        let copy = textureCopies.get(value);
        if (!copy) { copy = value.clone(); copy.needsUpdate = true; textureCopies.set(value, copy); }
        (result as unknown as Record<string, unknown>)[field] = copy;
      }
    }
    materialCopies.set(original, result);
    return result;
  }
  object.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    let geometry = geometryCopies.get(mesh.geometry);
    if (!geometry) { geometry = mesh.geometry.clone(); geometryCopies.set(mesh.geometry, geometry); }
    mesh.geometry = geometry;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(materialCopy) : materialCopy(mesh.material);
    mesh.castShadow = true; mesh.receiveShadow = true;
  });
  return object;
}

export function normalizeGlbInstance(source: THREE.Object3D, dimensions: { width: number; depth: number; height: number }): THREE.Group {
  if (![dimensions.width, dimensions.depth, dimensions.height].every(n => Number.isFinite(n) && n > 0)) throw new Error('模型尺寸必须为正数。');
  const object = cloneOwnedGlb(source);
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z].every(n => Number.isFinite(n) && n > 0.000001)) { disposeOwnedModel(object); throw new Error('模型包围盒无效。'); }
  const center = bounds.getCenter(new THREE.Vector3());
  const origin = new THREE.Group();
  origin.position.set(-center.x, -bounds.min.y, -center.z);
  origin.add(object);
  const result = new THREE.Group();
  result.add(origin);
  result.scale.set(dimensions.width / size.x, dimensions.height / size.y, dimensions.depth / size.z);
  return result;
}

export function createCachedGlbModel(item: FurnitureItem): THREE.Group | null {
  const key = glbAssetKey(item);
  const source = key ? cache.get(key)?.source : undefined;
  if (!source) return null;
  const group = normalizeGlbInstance(source, item);
  // The default white multiplier preserves every original material/texture.
  // An explicit user colour tints independent instance materials only.
  if (item.color.toLowerCase() !== '#ffffff') {
    const tint = new THREE.Color(item.color);
    const tinted = new Set<THREE.Material>();
    group.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (tinted.has(material)) continue;
        const colored = material as THREE.MeshStandardMaterial;
        if (colored.color) colored.color.multiply(tint);
        tinted.add(material);
      }
    });
  }
  group.userData.glbStatus = 'ready';
  return group;
}

export interface GlbCatalogInput {
  name: string; url: string; width: number; depth: number; height: number;
  assetId?: string; materialId?: FurnitureItem['materialId']; source?: FurnitureItem['source']; notes?: string;
}
export function createGlbCatalogItem(input: GlbCatalogInput): CatalogItem {
  return {
    type: 'glb-asset', name: input.name, width: input.width, depth: input.depth, height: input.height,
    color: '#ffffff', icon: '◇', price: 0, category: 'decor', glbUrl: input.url,
    source: input.source ?? (input.assetId ? 'public_library' : 'local_sample'),
    materialId: input.materialId ?? 'asset', notes: input.notes ?? '',
    ...(input.assetId ? { assetId: input.assetId } : {}),
  };
}

export function disposeOwnedModel(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
    const skinned = mesh as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) skinned.skeleton.dispose();
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}

export function clearGlbAssetCache(): void {
  for (const entry of cache.values()) { entry.controller.abort(); if (entry.source) disposeOwnedModel(entry.source); }
  cache.clear(); changed();
}
