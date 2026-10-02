/** The backend domain is the single wire-format authority. No parallel API schema. */
import { catalog, sceneSchema, type Scene, type SceneObject } from '../../../../supabase/functions/_shared/domain';
import { MAX_ITEM_DIMENSION, MAX_ROOM_DIMENSION } from './constants';
import { MAX_STOREY_HEIGHT, MIN_STOREY_HEIGHT } from './storeys';
import type { FurnitureItem, RoomLayout } from './types';

export class SceneAdapterError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'SceneAdapterError';
  }
}

const rendererTypes: Record<SceneObject['materialId'], string> = {
  chair: 'chair', table: 'table', reception: 'counter', backdrop: 'backdrop',
  display: 'bookshelf', partition: 'partition', carpet: 'rug', decoration: 'plant', asset: 'glb-asset',
};
const icons: Record<SceneObject['materialId'], string> = {
  chair: '🪑', table: '▰', reception: '▣', backdrop: '▥', display: '▤',
  partition: '▯', carpet: '▱', decoration: '✦', asset: '◇',
};

export interface BackendAdapterOptions {
  name?: string;
  projectId?: string;
  /** Short-lived loading URLs only; these are never sent back in scene.save. */
  assetUrls?: Readonly<Record<string, string>>;
  assetNames?: Readonly<Record<string, string>>;
}

function assertSupportedVenue(venue: Scene['venue']): void {
  if (venue.shape !== 'rectangle') {
    throw new SceneAdapterError('POLYGON_NOT_SUPPORTED', '此版编辑器暂不支持多边形场地，未打开项目；原云端场景保持不变。');
  }
  if (venue.floorplanAssetId) {
    throw new SceneAdapterError('FLOORPLAN_NOT_SUPPORTED', '此版编辑器暂不支持云端平面图，未打开项目；请保留原项目并等待平面图功能。');
  }
  if (venue.width > MAX_ROOM_DIMENSION || venue.depth > MAX_ROOM_DIMENSION ||
      venue.height < MIN_STOREY_HEIGHT || venue.height > MAX_STOREY_HEIGHT) {
    throw new SceneAdapterError('VENUE_SIZE_NOT_SUPPORTED', '场地尺寸超出此版编辑器范围，无法无损打开。');
  }
}

/** Backend positive angle turns +X towards +Z; Three.js positive Y turns towards -Z. */
export function backendDegreesToEditorRadians(degrees: number): number {
  return -degrees * Math.PI / 180;
}
export function editorRadiansToBackendDegrees(radians: number): number {
  const degrees = -radians * 180 / Math.PI;
  // Avoid rounding a persisted value or changing ±360 when already in the wire range.
  return degrees >= -360 && degrees <= 360 ? degrees : ((degrees + 180) % 360 + 360) % 360 - 180;
}

function entranceItem(entrance: Scene['venue']['entrances'][number], venue: Scene['venue']): FurnitureItem {
  const sideWall = Math.abs(entrance.position.x) < 1e-8 || Math.abs(entrance.position.x - venue.width) < 1e-8;
  return {
    id: entrance.id, type: 'door', name: '主要出入口', icon: '🚪',
    width: entrance.width, depth: 0.12, height: Math.min(2.2, venue.height), color: '#d6c7a4',
    position: { x: entrance.position.x - venue.width / 2, z: entrance.position.z - venue.depth / 2 },
    rotation: sideWall ? Math.PI / 2 : 0,
    locked: true, venueEntranceId: entrance.id, source: 'builtin',
  };
}

export function backendSceneToLayout(input: unknown, options: BackendAdapterOptions = {}): RoomLayout {
  const result = sceneSchema.safeParse(input);
  if (!result.success) throw new SceneAdapterError('INVALID_SCENE', '云端场景格式无效，未覆盖当前编辑内容。');
  const scene = result.data;
  assertSupportedVenue(scene.venue);
  const ids = new Set(scene.objects.map(o => o.id));
  if (scene.venue.entrances.some(e => ids.has(e.id))) {
    throw new SceneAdapterError('ENTRANCE_ID_COLLISION', '出入口与物件编号重复，无法无损打开。');
  }
  const items: FurnitureItem[] = scene.objects.map(o => {
    if (Math.max(o.size.width, o.size.depth, o.size.height) > MAX_ITEM_DIMENSION ||
        o.size.width < 0.1 || o.size.depth < 0.1 || o.size.height < 0.01) {
      throw new SceneAdapterError('OBJECT_SIZE_NOT_SUPPORTED', '物件尺寸超出此版编辑器范围（宽深至少 0.1 米、高至少 0.01 米），未打开项目，原尺寸未改动。');
    }
    const meta = catalog.find(entry => entry.id === o.materialId);
    return {
      id: o.id, type: rendererTypes[o.materialId], materialId: o.materialId,
      name: o.assetId ? options.assetNames?.[o.assetId] ?? '三维资产' : meta?.name ?? o.materialId,
      width: o.size.width, depth: o.size.depth, height: o.size.height,
      position: { x: o.position.x - scene.venue.width / 2, z: o.position.z - scene.venue.depth / 2 },
      rotation: backendDegreesToEditorRadians(o.rotation), color: o.color, icon: icons[o.materialId],
      locked: o.locked, notes: o.notes,
      ...(o.assetId ? { assetId: o.assetId } : { source: 'builtin' as const }),
      ...(o.assetId && options.assetUrls?.[o.assetId] ? { glbUrl: options.assetUrls[o.assetId] } : {}),
    };
  });
  items.push(...scene.venue.entrances.map(e => entranceItem(e, scene.venue)));
  return {
    ...(options.projectId ? { id: options.projectId } : {}),
    name: options.name ?? '活动场景', width: scene.venue.width, height: scene.venue.depth,
    floors: [{ id: 'event-floor', name: '活动场地', height: scene.venue.height,
      floorColor: '#e9e5db', items, interiorWalls: [] }],
    roof: { style: 'none' },
    backendVenue: structuredClone(scene.venue), backendCamera: scene.camera, backendLighting: scene.lighting,
  };
}

export function layoutToBackendScene(layout: RoomLayout): Scene {
  if (layout.floors.length !== 1) throw new SceneAdapterError('MULTI_FLOOR_NOT_SUPPORTED', '云端首版只支持单层场地，请保留本地方案。');
  if (layout.floorPlanImage || layout.backendVenue?.floorplanAssetId) {
    throw new SceneAdapterError('FLOORPLAN_NOT_SUPPORTED', '平面图尚未接入云保存，不能忽略底图后保存。');
  }
  if (layout.backendVenue?.shape === 'polygon') {
    throw new SceneAdapterError('POLYGON_NOT_SUPPORTED', '多边形场地尚未接入此版编辑器，不能改存为矩形。');
  }
  const floor = layout.floors[0]!;
  if (floor.interiorWalls?.length || layout.roof && layout.roof.style !== 'none' ||
      layout.terrain && (layout.terrain.frontY !== 0 || layout.terrain.backY !== 0)) {
    throw new SceneAdapterError('STRUCTURE_NOT_SUPPORTED', '此方案含未接入云端的建筑结构，不能忽略这些内容后保存。');
  }
  const entrances = (layout.backendVenue?.entrances ?? []).map(original => {
    const item = floor.items.find(i => i.venueEntranceId === original.id);
    if (!item?.position) throw new SceneAdapterError('ENTRANCE_MISSING', '主要出入口数据缺失，已阻止保存。');
    return { id: original.id, position: { x: item.position.x + layout.width / 2, z: item.position.z + layout.height / 2 }, width: item.width };
  });
  if (floor.items.some(i => i.venueEntranceId && !entrances.some(e => e.id === i.venueEntranceId))) {
    throw new SceneAdapterError('UNKNOWN_ENTRANCE', '存在未关联的出入口，已阻止保存。');
  }
  const objects = floor.items.filter(i => !i.venueEntranceId).map(item => {
    if (!item.position) throw new SceneAdapterError('POSITION_MISSING', `物件“${item.name}”缺少位置，无法保存。`);
    if (item.mirrored) throw new SceneAdapterError('MIRROR_NOT_SUPPORTED', '云端暂不支持镜像物件，不能丢失镜像状态。');
    if ((item.type === 'glb-asset' || item.glbUrl) && !item.assetId) {
      throw new SceneAdapterError('LOCAL_ASSET_NOT_UPLOADED', '本地 GLB 样例尚未归档到云端，不能作为云资产保存。');
    }
    const inferred = Object.entries(rendererTypes).find(([, type]) => type === item.type)?.[0];
    const materialId = item.materialId ?? inferred;
    if (!materialId) throw new SceneAdapterError('MATERIAL_NOT_SUPPORTED', `物料“${item.name}”不在活动目录中，无法保存。`);
    return {
      id: item.id, materialId, ...(item.assetId ? { assetId: item.assetId } : {}),
      position: { x: item.position.x + layout.width / 2, z: item.position.z + layout.height / 2 },
      rotation: editorRadiansToBackendDegrees(item.rotation ?? 0),
      size: { width: item.width, depth: item.depth, height: item.height }, color: item.color,
      locked: item.locked ?? false, notes: item.notes ?? '',
    };
  });
  const candidate = {
    schemaVersion: 1,
    venue: { width: layout.width, depth: layout.height, height: floor.height ?? 3, shape: 'rectangle', entrances },
    objects, camera: layout.backendCamera ?? 'overview', lighting: layout.backendLighting ?? 'neutral',
  };
  const result = sceneSchema.safeParse(candidate);
  if (!result.success) {
    throw new SceneAdapterError('INVALID_SCENE', `场景未通过后端校验，未保存：${result.error.issues[0]?.message ?? '格式错误'}`);
  }
  return result.data;
}
