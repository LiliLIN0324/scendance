import { DEFAULT_ROOF } from './constants';
import type { FloorLayout, RoomLayout } from './types';

/**
 * The house every new session starts from. Lives in `lib/` so pure modules —
 * `restore-point.ts` decides "untouched" by comparing against it (#346) —
 * can read it; `hooks/layout-reducer.ts` re-exports it as the reducer's
 * initial state.
 */
export const INITIAL_GROUND_FLOOR: FloorLayout = {
  id: 'ground',
  name: '活动场地',
  height: 3,
  floorColor: '#ece8de',
  floorPattern: 'solid',
  items: [
    { id: 'a0100000-0000-4000-8000-000000000001', type: 'table', name: '共创桌', width: 1.2, depth: .6, height: .75, color: '#c6a580', icon: '▱', position: { x: -1.4, z: 0 }, rotation: 0 },
    { id: 'a0100000-0000-4000-8000-000000000002', type: 'table', name: '共创桌', width: 1.2, depth: .6, height: .75, color: '#c6a580', icon: '▱', position: { x: 1.4, z: 0 }, rotation: 0 },
    { id: 'a0100000-0000-4000-8000-000000000003', type: 'chair', name: '活动座椅', width: .5, depth: .5, height: .85, color: '#356350', icon: '▥', position: { x: -1.4, z: 1 }, rotation: Math.PI },
    { id: 'a0100000-0000-4000-8000-000000000004', type: 'chair', name: '活动座椅', width: .5, depth: .5, height: .85, color: '#356350', icon: '▥', position: { x: 1.4, z: 1 }, rotation: Math.PI },
    { id: 'a0100000-0000-4000-8000-000000000005', type: 'plant', name: '空间绿植', width: .4, depth: .4, height: .6, color: '#58735a', icon: '♧', position: { x: -3.8, z: -2.7 }, rotation: 0 },
  ],
};

export const INITIAL_LAYOUT: RoomLayout = {
  name: '周末共创工作坊',
  width: 10,
  height: 8,
  floors: [INITIAL_GROUND_FLOOR],
  roof: DEFAULT_ROOF,
  floorPlanOpacity: 0.5,
  floorPlanFitMode: 'stretch',
};
