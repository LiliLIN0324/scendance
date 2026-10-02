import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { corners, sceneSchema, type Scene } from '../../../../supabase/functions/_shared/domain';
import { layoutReducer, type LayoutState } from '../hooks/layout-reducer';
import { backendSceneToLayout, layoutToBackendScene, SceneAdapterError } from './backend-adapter';
import { parseStoredLayout } from './schema';

const objectId = '00000000-0000-4000-8000-000000000001';
const assetId = '00000000-0000-4000-8000-000000000002';
const entranceId = '00000000-0000-4000-8000-000000000003';
function scene(): Scene {
  return sceneSchema.parse({
    schemaVersion: 1,
    venue: { shape: 'rectangle', width: 10, depth: 8, height: 3,
      entrances: [{ id: entranceId, position: { x: 5, z: 0 }, width: 1.8 }] },
    objects: [{ id: objectId, materialId: 'table', position: { x: 2, z: 3 }, rotation: 30,
      size: { width: 2, depth: 1, height: 0.75 }, color: '#cc9966', locked: true, notes: '场内已有桌子' }],
    camera: 'top', lighting: 'warm',
  });
}

describe('the shared backend scene adapter', () => {
  it('maps a non-square 30 degree object to identical physical corners in Three.js', () => {
    const input = scene();
    const layout = backendSceneToLayout(input);
    const item = layout.floors[0].items[0];
    expect(layout.width).toBe(10);
    expect(layout.height).toBe(8); // upstream height is footprint depth
    expect(layout.floors[0].height).toBe(3);
    expect(item.rotation).toBeCloseTo(-Math.PI / 6);
    const actual = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => {
      return new Vector3(x * item.width / 2, 0, z * item.depth / 2)
        .applyAxisAngle(new Vector3(0, 1, 0), item.rotation!)
        .add(new Vector3(item.position!.x + 5, 0, item.position!.z + 4));
    });
    corners(input.objects[0]).forEach((expected, i) => {
      expect(actual[i].x).toBeCloseTo(expected.x, 10);
      expect(actual[i].z).toBeCloseTo(expected.z, 10);
    });
    const output = layoutToBackendScene(layout);
    expect(output.venue).toEqual(input.venue);
    expect(output.objects[0].rotation).toBeCloseTo(input.objects[0].rotation, 10);
    expect(output.objects[0].position).toEqual(input.objects[0].position);
    expect(output.objects[0].size).toEqual(input.objects[0].size);
    expect(output.objects[0].notes).toBe('场内已有桌子');
    expect(output.camera).toBe('top');
    expect(output.lighting).toBe('warm');
    expect(output.objects).toHaveLength(1); // structural entrance is not a material
  });

  it('preserves cloud asset IDs and notes through the upstream serialization whitelist', () => {
    const input = scene();
    input.objects[0] = { ...input.objects[0], materialId: 'asset', assetId };
    const layout = backendSceneToLayout(input, { assetUrls: { [assetId]: 'https://example.test/model.glb?token=short' } });
    layout.floors[0].items[0].source = 'generated';
    const reopened = parseStoredLayout(JSON.parse(JSON.stringify(layout)));
    expect(reopened).not.toBeNull();
    const item = reopened!.floors[0].items[0];
    expect(item).toMatchObject({ assetId, materialId: 'asset', notes: '场内已有桌子', source: 'generated' });
    const output = layoutToBackendScene(reopened!);
    expect(output.objects[0]).toMatchObject({ assetId, materialId: 'asset', notes: '场内已有桌子' });
    expect(JSON.stringify(output)).not.toContain('example.test');
    expect(JSON.stringify(output)).not.toContain('glbUrl');
  });

  it.each(['polygon', 'floorplan'] as const)('rejects unsupported %s without mutating input', kind => {
    const input = scene();
    if (kind === 'polygon') {
      input.venue.shape = 'polygon';
      input.venue.polygon = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }];
    } else input.venue.floorplanAssetId = assetId;
    const before = JSON.stringify(input);
    expect(() => backendSceneToLayout(input)).toThrow(SceneAdapterError);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('rejects a local GLB sample on cloud export rather than assigning a fictitious cloud ID', () => {
    const layout = backendSceneToLayout(scene());
    Object.assign(layout.floors[0].items[0], { type: 'glb-asset', glbUrl: '/assets/models/table.glb', materialId: 'asset' });
    expect(() => layoutToBackendScene(layout)).toThrow('本地 GLB');
  });

  it('rejects multistorey, missing entrances and local floorplans instead of dropping them', () => {
    const a = backendSceneToLayout(scene());
    a.floors.push(structuredClone(a.floors[0]));
    expect(() => layoutToBackendScene(a)).toThrow('单层');
    const b = backendSceneToLayout(scene());
    b.floors[0].items = b.floors[0].items.filter(i => !i.venueEntranceId);
    expect(() => layoutToBackendScene(b)).toThrow('出入口');
    const c = backendSceneToLayout(scene());
    c.floorPlanImage = 'data:image/png;base64,AA==';
    expect(() => layoutToBackendScene(c)).toThrow('平面图');
  });

  it('uses backend validation for UUIDs and the 50 object cap', () => {
    const a = backendSceneToLayout(scene());
    a.floors[0].items[0].id = 'old-local-item';
    expect(() => layoutToBackendScene(a)).toThrow('后端校验');
    const b = backendSceneToLayout(scene());
    b.floors[0].items = Array.from({ length: 51 }, (_, i) => ({
      ...b.floors[0].items[0], id: `00000000-0000-4000-8000-${String(i + 10).padStart(12, '0')}`,
    })).concat(b.floors[0].items.filter(i => i.venueEntranceId));
    expect(() => layoutToBackendScene(b)).toThrow('后端校验');
  });
});


describe('backend dimensions survive the editor', () => {
  it('keeps a one-centimetre carpet through both editing paths and save/reopen', () => {
    const input = scene();
    input.objects[0] = { ...input.objects[0], materialId: 'carpet', locked: false,
      size: { width: 2, depth: 3, height: 0.01 } };
    let state: LayoutState = { layout: backendSceneToLayout(input), activeFloorIndex: 0 };
    state = layoutReducer(state, { type: 'resizeItem', id: objectId, dimension: 'height', value: 0.02 });
    state = layoutReducer(state, { type: 'resizeItem', id: objectId, dimension: 'height', value: 0.01 });
    expect(state.layout.floors[0].items[0].height).toBe(0.01);
    state = layoutReducer(state, { type: 'updateItem', id: objectId, patch: { height: 0.01, width: 2.2 } });
    const reopened = parseStoredLayout(JSON.parse(JSON.stringify(state.layout)));
    const output = layoutToBackendScene(reopened!);
    expect(output.objects[0].size).toEqual({ width: 2.2, depth: 3, height: 0.01 });
  });

  it.each([['width', 0.05], ['depth', 0.05], ['height', 0.005]] as const)(
    'refuses backend %s=%s instead of silently enlarging it', (dimension, value) => {
      const input = scene();
      input.objects[0].size[dimension] = value;
      const before = JSON.stringify(input);
      expect(() => backendSceneToLayout(input)).toThrow('原尺寸未改动');
      expect(JSON.stringify(input)).toBe(before);
    },
  );
});
