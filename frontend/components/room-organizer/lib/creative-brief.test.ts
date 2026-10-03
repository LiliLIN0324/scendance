import { describe, expect, it } from 'vitest';
import { backendSceneToLayout, layoutToBackendScene } from './backend-adapter';
import { briefInstruction, INITIAL_BRIEF, mergeProposalPresentation } from './creative-brief';
import type { Scene } from '@/lib/backend-session';

const scene: Scene = { schemaVersion: 1, venue: { width: 12, depth: 10, height: 3, shape: 'rectangle', entrances: [] }, camera: 'overview', lighting: 'neutral', objects: [{ id: '10000000-0000-4000-8000-000000000001', materialId: 'chair', position: { x: 2, z: 2 }, rotation: 0, size: { width: .5, depth: .5, height: .9 }, color: '#ffffff', locked: false, notes: '' }] };

describe('creative brief boundaries', () => {
  it('rejects attendance beyond the current backend limit and invalid input before generation', () => {
    const brief = { ...INITIAL_BRIEF, description: '交流活动' };
    for (const guests of [0, 1.5, 41, 100, NaN]) expect(() => briefInstruction({ ...brief, guests }, 12, 10)).toThrow('1–40');
    expect(() => briefInstruction(INITIAL_BRIEF, 12, 10)).toThrow('描述');
    expect(briefInstruction({ ...brief, guests: 40 }, 12, 10)).toContain('40人');
  });

  it('does not imply image understanding and creates a complete preview for confirmation', () => {
    const instruction = briefInstruction({ ...INITIAL_BRIEF, description: '要帐篷和签到区' }, 12, 10);
    expect(instruction).toContain('完整候选后由客户整体确认');
    expect(instruction).toContain('现场照片尚未提交给模型');
    expect(instruction).toContain('不得用桌椅冒充');
    expect(instruction).toContain('依据当前资源库');
    expect(instruction).not.toContain('帐篷、拱门等当前不支持');
    expect(briefInstruction({ ...INITIAL_BRIEF, description: '交流会', allowIdeas: false }, 12, 10)).toContain('不自行扩展');
  });

  it('carries confirmed venue conditions, style, palette and atmosphere without pretending to read images', () => {
    const instruction=briefInstruction({...INITIAL_BRIEF,description:'品牌活动',venueConditions:'北侧入口不得遮挡',style:'自然露营',palette:'米白橄榄绿',atmosphere:'温暖夜场'},12,10);
    for(const text of ['北侧入口不得遮挡','自然露营','米白橄榄绿','温暖夜场','文字输入，非图片识别']) expect(instruction).toContain(text);
  });

  it('persists the default warm atmosphere of a local draft', () => {
    const local = backendSceneToLayout(scene);
    delete local.backendLighting;
    expect(layoutToBackendScene(local).lighting).toBe('warm');
  });

  it('keeps local presentation while applying only server-authorized scene changes', () => {
    const base = backendSceneToLayout(scene);
    base.floors[0]!.floorColor = '#ff0000';
    base.floors[0]!.items[0]!.name = '客户选定的座椅';
    base.floors[0]!.items[0]!.groupId = 'local-group';
    const changed = structuredClone(scene);
    changed.objects[0]!.position.x = 6;
    changed.lighting = 'cool';
    const next = mergeProposalPresentation(base, backendSceneToLayout(changed));
    expect(next.floors[0]!.floorColor).toBe('#ff0000');
    expect(next.floors[0]!.items[0]).toMatchObject({ name: '客户选定的座椅', groupId: 'local-group' });
    expect(layoutToBackendScene(next)).toEqual(changed);
    expect(layoutToBackendScene(base)).toEqual(scene);
  });
});


it('routes missing materials to supported parametric families and keeps the full structured brief',()=>{
  const instruction=briefInstruction({...INITIAL_BRIEF,description:'完整活动需求'.repeat(600)},12,10);
  expect(instruction.length).toBeGreaterThan(3000);
  expect(instruction).toContain('参数化工具建模');
  expect(instruction).not.toContain('HY3');
});
