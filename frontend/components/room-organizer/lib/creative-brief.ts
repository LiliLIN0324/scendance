import type { RoomLayout } from './types';

export interface CreativeBrief {
  event: string;
  hasFloorplan?: boolean;
  guests: number;
  description: string;
  mustHave: string;
  allowIdeas: boolean;
  venueConditions?: string;
  style?: string;
  palette?: string;
  atmosphere?: string;
}
export const INITIAL_BRIEF: CreativeBrief = {
  event: '品牌快闪', guests: 24,
  description: '', mustHave: '', allowIdeas: true, venueConditions: '', style: '', palette: '', atmosphere: '',
};
export const IDEA_CARDS = [
  { title: '轻露营会客区', text: '用开放式帐篷、地毯与低座围合交流区，预留顺畅的主通道。', prompt: '设置一处帐篷会客区，适合小组交流，保留宽敞的主通道。' },
  { title: '会发光的夜场', text: '用暖色串灯连接签到、互动与休息区，形成连贯的夜间氛围。', prompt: '用暖色串灯串联签到区和休息区，并加入有层次的夜间照明。' },
  { title: '把记忆带走', text: '加入合影拱门或共创留言区，让参与者拥有一个愿意停留的角落。', prompt: '增加与主题呼应的合影拱门和互动留言区，作为活动记忆点。' },
] as const;

/** Current v1 accepts text only; image bytes must never be implied to reach the model. */
export function briefInstruction(brief: CreativeBrief, width: number, depth: number): string {
  if (!brief.description.trim()) throw new Error('请先描述客户希望举办怎样的活动。');
  if (!Number.isInteger(brief.guests) || brief.guests < 1 || brief.guests > 40) throw new Error('当前生成服务支持 1–40 人，请填写范围内的整数。');
  const result = [
    `请为客户设计一套完整的${brief.event}场景布置方案。场地${width}×${depth}米，预计${brief.guests}人。`,
    `客户需求：${brief.description.trim()}`,
    brief.mustHave.trim() ? `必须满足：${brief.mustHave.trim()}` : '',
    brief.venueConditions?.trim() ? `用户确认的现场条件（文字输入，非图片识别）：${brief.venueConditions.trim()}。必须保留出入口与固定设施，不得覆盖。` : '',
    brief.style?.trim() ? `风格要求：${brief.style.trim()}` : '',
    brief.palette?.trim() ? `配色要求：${brief.palette.trim()}` : '',
    brief.atmosphere?.trim() ? `氛围要求：${brief.atmosphere.trim()}；超出现有三种灯光预设的能力仅作为建议说明。` : '',
    brief.allowIdeas ? '在满足客户需求的基础上，主动布置适合主题的亮点、分区、装饰和氛围，形成完整候选后由客户整体确认。明确说明每个亮点的用途与对应物件。' : '只围绕客户明确提出的要求规划，不自行扩展需求。',
    '保留锁定对象。提出候选修改，不声称已经应用或保存；应用方式依据本轮用户指令和服务端规则。依据当前资源库优先选用真实物料；缺少所需物件时，可通过桌、椅、柜台、地台、背景板和柜体的参数化工具建模。工具不支持的造型须说明缺项，不得用桌椅冒充，也不得未经确认替换原要求。',
    '现场照片尚未提交给模型；不能声称已经识别、测量或参考了图片内容。',
  ].filter(Boolean).join('\n');
  if (result.length > 12000) throw new Error('需求内容过长，请精简后再生成。');
  return result;
}

export function proposalSummary(before: RoomLayout, after: RoomLayout): { added: number; removed: number; total: number } {
  const old = new Set(before.floors.flatMap(f => f.items.map(item => item.id)));
  const next = new Set(after.floors.flatMap(f => f.items.map(item => item.id)));
  return { added: [...next].filter(id => !old.has(id)).length, removed: [...old].filter(id => !next.has(id)).length, total: next.size };
}

/** Preserve presentation metadata absent from the v1 wire scene when applying a proposal. */
export function mergeProposalPresentation(base: RoomLayout, candidate: RoomLayout): RoomLayout {
  const previous = base.floors[0];
  const next = candidate.floors[0];
  if (!previous || !next) return candidate;
  const existing = new Map(previous.items.map(item => [item.id, item]));
  return { ...base, ...candidate, floors: [{ ...previous, ...next, id: previous.id,
    name: previous.name, floorColor: candidate.backendSceneV2 ? next.floorColor : previous.floorColor,
    items: next.items.map(item => {
      const old = existing.get(item.id);
      return old && old.type === item.type && old.assetId === item.assetId
        ? { ...item, name: old.name, icon: old.icon, ...(old.groupId ? { groupId: old.groupId } : {}) }
        : item;
    }),
  }] };
}
