// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeFloor, makeItem, makeLayout } from '../lib/__testfixtures__/fixtures';
import { layoutReducer, type LayoutState } from './layout-reducer';
import { useItemDrag } from './use-item-drag';
import type { LayoutActions } from './use-layout-state';

describe('useItemDrag — cancelled gestures commit nothing (#207 follow-up)', () => {
  afterEach(cleanup);

  const setup = () => {
    const actions = {
      moveItem: vi.fn(),
      bulkSetPositions: vi.fn(),
      setLocked: vi.fn(),
      updateItem: vi.fn(),
    } as unknown as LayoutActions;
    const floor = makeFloor({
      items: [makeItem({ id: 'a', position: { x: 0, z: 0 } })],
    });
    const { result } = renderHook(() =>
      useItemDrag({
        activeFloor: floor,
        activeFloorIndex: 0,
        roomWidth: 10,
        roomDepth: 10,
        keepOut: [],
        frontGap: null,
        actions,
        allSelectedIds: new Set(['a']),
      })
    );
    return { actions, result };
  };

  it('a completed drag commits once and reports active in between', () => {
    const { actions, result } = setup();
    expect(result.current.isDragActive()).toBe(false);
    result.current.handleDragStart('a');
    expect(result.current.isDragActive()).toBe(true);
    result.current.handleDrag('a', 2, 3);
    result.current.handleDragEnd('a');
    expect(result.current.isDragActive()).toBe(false);
    expect(actions.bulkSetPositions).toHaveBeenCalledTimes(1);
    expect(actions.setLocked).not.toHaveBeenCalled();
  });

  it('a cancelled drag discards the session — the release commits and locks nothing', () => {
    const { actions, result } = setup();
    result.current.handleDragStart('a');
    result.current.handleDrag('a', 2, 3);
    // The canvas handler aborted: its captured group was rebuilt away
    // (cross-tab adopt, library load) mid-gesture.
    result.current.handleDragCancel('a');
    expect(result.current.isDragActive()).toBe(false);
    // A stray pointerup after the abort must be a complete no-op.
    result.current.handleDragEnd('a');
    expect(actions.bulkSetPositions).not.toHaveBeenCalled();
    expect(actions.setLocked).not.toHaveBeenCalled();
    expect(actions.updateItem).not.toHaveBeenCalled();
  });
});

describe('useItemDrag — pointercancel restores the group drag (#292)', () => {
  afterEach(cleanup);

  it('puts every member back at its origin and commits nothing', () => {
    const actions = {
      moveItem: vi.fn(),
      bulkSetPositions: vi.fn(),
      setLocked: vi.fn(),
      updateItem: vi.fn(),
    } as unknown as LayoutActions;
    const floor = makeFloor({
      items: [
        makeItem({ id: 'a', position: { x: 0, z: 0 } }),
        makeItem({ id: 'b', position: { x: 2, z: 1 } }),
      ],
    });
    const scene = new THREE.Scene();
    for (const item of floor.items) {
      const group = new THREE.Group();
      group.userData = { type: 'furniture', id: item.id, floorIndex: 0 };
      group.position.set(item.position!.x, 0, item.position!.z);
      scene.add(group);
    }
    const group = (id: string) => scene.children.find((obj) => obj.userData.id === id)!;
    const { result } = renderHook(() =>
      useItemDrag({
        activeFloor: floor,
        activeFloorIndex: 0,
        roomWidth: 10,
        roomDepth: 10,
        keepOut: [],
        frontGap: null,
        actions,
        allSelectedIds: new Set(['a', 'b']),
      })
    );
    const invalidate = vi.fn();
    result.current.sceneBoxRef.current = { current: scene };
    result.current.invalidateBoxRef.current = invalidate;

    result.current.handleDragStart('a');
    // The canvas handler moves the primary itself; the hook moves the rest.
    group('a').position.set(1, 0, 1);
    result.current.handleDrag('a', 1, 1);
    expect(group('b').position.x).toBe(3);

    result.current.handleDragCancel('a', { restore: true });
    expect(group('a').position.x).toBe(0);
    expect(group('a').position.z).toBe(0);
    expect(group('b').position.x).toBe(2);
    expect(group('b').position.z).toBe(1);
    expect(invalidate).toHaveBeenCalled();
    expect(result.current.isDragActive()).toBe(false);
    result.current.handleDragEnd('a');
    expect(actions.bulkSetPositions).not.toHaveBeenCalled();
    expect(actions.setLocked).not.toHaveBeenCalled();
  });
});


describe('useItemDrag — locks remain a user decision', () => {
  afterEach(cleanup);

  it('allows consecutive drags and leaves an explicitly locked co-selection untouched', () => {
    let state: LayoutState = { layout: makeLayout({ floors: [makeFloor({ items: [
      makeItem({ id: 'a', locked: false, position: { x: 0, z: 0 } }),
      makeItem({ id: 'b', locked: true, position: { x: -3, z: -3 } }),
    ] })] }), activeFloorIndex: 0 };
    const actions = {
      bulkSetPositions: (positions: ReadonlyMap<string, { x: number; z: number }>) => {
        state = layoutReducer(state, { type: 'bulkSetPositions', positions });
      },
      setLocked: (id: string, locked: boolean) => {
        state = layoutReducer(state, { type: 'setLocked', id, locked });
      },
      updateItem: vi.fn(), moveItem: vi.fn(),
    } as unknown as LayoutActions;
    const { result, rerender } = renderHook(() => useItemDrag({
      activeFloor: state.layout.floors[0], activeFloorIndex: 0,
      roomWidth: 10, roomDepth: 10, keepOut: [], frontGap: null, actions,
      allSelectedIds: new Set(['a', 'b']),
    }));
    result.current.handleDragStart('a');
    result.current.handleDrag('a', 1, 1);
    result.current.handleDragEnd('a');
    expect(state.layout.floors[0].items[0]).toMatchObject({ locked: false, position: { x: 1, z: 1 } });
    rerender();
    result.current.handleDragStart('a');
    result.current.handleDrag('a', 2, 1.5);
    result.current.handleDragEnd('a');
    expect(state.layout.floors[0].items[0]).toMatchObject({ locked: false, position: { x: 2, z: 1.5 } });
    expect(state.layout.floors[0].items[1]).toMatchObject({ locked: true, position: { x: -3, z: -3 } });
  });
});
