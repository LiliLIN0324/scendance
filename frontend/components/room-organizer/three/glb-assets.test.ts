import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearGlbAssetCache, cloneOwnedGlb, createCachedGlbModel, createGlbCatalogItem, disposeOwnedModel,
  ensureGlbAsset, getGlbAssetState, normalizeGlbInstance, validateGlbBuffer } from './glb-assets';

function realGlb(): ArrayBuffer {
  return new Uint8Array(readFileSync(new URL('../../../../assets/models/table.glb', import.meta.url))).buffer;
}
function response(buffer = realGlb()): Response { return new Response(buffer, { status: 200 }); }
function template(): THREE.Group {
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ color: '#ac8855', map: texture, roughness: 0.23 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4), material);
  mesh.position.set(5, 7, -3);
  const group = new THREE.Group(); group.add(mesh); return group;
}

afterEach(() => { clearGlbAssetCache(); vi.restoreAllMocks(); });

describe('owned GLB model instances', () => {
  it('grounds, centers and sizes a model without losing its original material', () => {
    const source = template();
    const instance = normalizeGlbInstance(source, { width: 1.6, depth: 0.9, height: 0.75 });
    const bounds = new THREE.Box3().setFromObject(instance);
    const size = bounds.getSize(new THREE.Vector3());
    expect([size.x, size.y, size.z]).toEqual([1.6, 0.75, 0.9]);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(0);
    expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(0);
    const meshes: THREE.Mesh[] = []; instance.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect((meshes[0].material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ac8855');
    expect((meshes[0].material as THREE.MeshStandardMaterial).roughness).toBe(0.23);
    disposeOwnedModel(instance); disposeOwnedModel(source);
  });

  it('deleting one copy does not dispose another copy or the cached source', () => {
    const source = template();
    const first = cloneOwnedGlb(source); const second = cloneOwnedGlb(source);
    const originals = source.children[0] as THREE.Mesh;
    const other = second.children[0] as THREE.Mesh;
    const spyGeometry = vi.spyOn(originals.geometry, 'dispose');
    const spyOtherGeometry = vi.spyOn(other.geometry, 'dispose');
    const spyOtherMaterial = vi.spyOn(other.material as THREE.Material, 'dispose');
    const spyOriginalTexture = vi.spyOn((originals.material as THREE.MeshStandardMaterial).map!, 'dispose');
    const spyOtherTexture = vi.spyOn((other.material as THREE.MeshStandardMaterial).map!, 'dispose');
    disposeOwnedModel(first);
    expect(spyGeometry).not.toHaveBeenCalled(); expect(spyOtherGeometry).not.toHaveBeenCalled();
    expect(spyOtherMaterial).not.toHaveBeenCalled(); expect(spyOriginalTexture).not.toHaveBeenCalled();
    expect(spyOtherTexture).not.toHaveBeenCalled();
    expect(other.geometry.attributes.position.count).toBeGreaterThan(0);
    disposeOwnedModel(second); disposeOwnedModel(source);
  });

  it('loads a real repository GLB and reuses the same request for concurrent callers', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());
    await Promise.all([ensureGlbAsset('test-table', '/assets/models/table.glb'), ensureGlbAsset('test-table', '/assets/models/table.glb')]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(getGlbAssetState('test-table').status).toBe('ready');
    const item = { ...createGlbCatalogItem({ name: '桌子', url: '/assets/models/table.glb', assetId: 'test-table', width: 1.6, depth: 0.9, height: 0.75 }), id: 'instance' };
    const instance = createCachedGlbModel(item);
    expect(instance).not.toBeNull();
    const size = new THREE.Box3().setFromObject(instance!).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(1.6); expect(size.y).toBeCloseTo(0.75); expect(size.z).toBeCloseTo(0.9);
    disposeOwnedModel(instance!);
    expect(createCachedGlbModel(item)).not.toBeNull();
  });

  it('keeps a newer successful result when an obsolete request fails later', async () => {
    let rejectFirst: (reason?: unknown) => void = () => {};
    const firstFetch = new Promise<Response>((_resolve, reject) => { rejectFirst = reject; });
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(firstFetch).mockResolvedValueOnce(response());
    const first = ensureGlbAsset('same', 'https://example.test/old.glb').catch(e => e);
    await ensureGlbAsset('same', 'https://example.test/new.glb');
    rejectFirst(new Error('old network failure')); await first;
    expect(getGlbAssetState('same').status).toBe('ready');
  });

  it('reports invalid data as failure without manufacturing a successful model', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not a glb'));
    await expect(ensureGlbAsset('broken', '/assets/broken.glb')).rejects.toThrow();
    expect(getGlbAssetState('broken').status).toBe('error');
    expect(createCachedGlbModel({ ...createGlbCatalogItem({ name: '坏模型', url: '/assets/broken.glb', width: 1, depth: 1, height: 1 }), id: 'broken' })).toBeNull();
  });

  it('rejects oversized GLB and external file dependencies', () => {
    expect(() => validateGlbBuffer(new ArrayBuffer(10 * 1024 * 1024 + 1))).toThrow('10 MB');
    const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'https://example.test/data.bin' }] }));
    const buffer = new ArrayBuffer(20 + json.length); const view = new DataView(buffer);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
    view.setUint32(12, json.length, true); view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(buffer, 20).set(json);
    expect(() => validateGlbBuffer(buffer)).toThrow('外部文件');
  });
});
