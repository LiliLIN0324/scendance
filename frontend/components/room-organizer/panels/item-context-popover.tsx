'use client';

import { Copy, Lock, RotateCcw, Trash2, Unlock, X } from 'lucide-react';
import { useRoomEditor, useSelection } from '../contexts';
import { MaterialGlyph, NumberField } from './scendance-workspace';

export interface ItemContextPopoverProps {
  hasCollision: boolean;
  onRemove(id: string): void;
  onDuplicate(id: string): void;
  onRotate(id: string): void;
  onToggleCameraBracket(id: string): void;
  onClose(): void;
}

const COLORS = ['#375B4B', '#78958B', '#B5C3B2', '#C9B89D', '#DDD9CA', '#EDEAE1', '#B98067', '#404748'];

export function ItemContextPopover(props: ItemContextPopoverProps): JSX.Element {
  const { actions, pushColor, activeFloor } = useRoomEditor();
  const { selectedItem: item } = useSelection();
  if (!item) return <></>;
  const locked = item.locked === true;
  const position = item.position ?? { x: 0, z: 0 };
  const rotation = ((item.rotation ?? 0) * 180 / Math.PI % 360 + 360) % 360;
  return <aside className="sc-properties" aria-label={`${item.name}属性`}>
    <header><div><span className="sc-eyebrow">OBJECT PROPERTIES</span><h2>物料属性</h2></div><button type="button" className="sc-icon-button" onClick={props.onClose} aria-label="关闭物料属性"><X size={17}/></button></header>
    <div className="sc-properties-content">
      <div className="sc-selected-summary"><div><MaterialGlyph materialId={item.materialId} color={item.color}/></div><strong>{item.name}</strong><span>{item.glbUrl ? item.assetId ? '云端模型资产' : '本地 GLB 验证样例' : '内置活动物料'}</span></div>
      <button type="button" className={`sc-lock-button ${locked ? 'is-locked' : ''}`} aria-pressed={locked} onClick={() => actions.setLocked(item.id, !locked)}>{locked ? <Lock size={15}/> : <Unlock size={15}/>}<span>{locked ? '已锁定 · 点击解锁' : '允许编辑 · 点击锁定'}</span></button>
      {props.hasCollision && <p className="sc-warning">物料可能重叠或超出场地，请检查位置。</p>}
      <section><h3>尺寸 <small>米</small></h3><div className="sc-dimension-grid">
        <NumberField label="宽" value={item.width} disabled={locked} onChange={value => actions.resizeItem(item.id, 'width', value)}/>
        <NumberField label="深" value={item.depth} disabled={locked} onChange={value => actions.resizeItem(item.id, 'depth', value)}/>
        <NumberField label="高" value={item.height} max={30} step={0.01} disabled={locked} onChange={value => actions.resizeItem(item.id, 'height', value)}/>
      </div></section>
      <section><h3>位置与角度</h3><div className="sc-dimension-grid">
        <NumberField label="X / m" value={position.x} min={-100} max={100} disabled={locked} onChange={value => actions.moveItem(item.id, value, position.z)}/>
        <NumberField label="Z / m" value={position.z} min={-100} max={100} disabled={locked} onChange={value => actions.moveItem(item.id, position.x, value)}/>
        <NumberField label="旋转 / °" value={rotation} min={0} max={360} step={15} disabled={locked} onChange={value => actions.setRotation(item.id, value * Math.PI / 180)}/>
      </div></section>
      <section><h3>物料颜色 <input type="color" aria-label="物料颜色" value={item.color} disabled={locked || Boolean(item.glbUrl)} onChange={event => { actions.setColor(item.id, event.target.value); pushColor(event.target.value); }}/></h3><div className="sc-color-swatches">{COLORS.map(color => <button type="button" key={color} style={{ background: color }} aria-label={`颜色 ${color}`} aria-pressed={item.color.toUpperCase() === color} disabled={locked || Boolean(item.glbUrl)} onClick={() => { actions.setColor(item.id, color); pushColor(color); }}/>)}</div>{item.glbUrl && <p className="sc-note">保留模型原材质</p>}</section>
      <section><h3>物料备注</h3><textarea className="sc-notes" aria-label="物料备注" placeholder="例如：预留电源 / 实物待确认" maxLength={500} disabled={locked} value={item.notes ?? ''} onChange={event => actions.updateItem(item.id, { notes: event.target.value })}/></section>
      <div className="sc-property-actions"><button type="button" className="sc-button" disabled={locked} onClick={() => props.onRotate(item.id)}><RotateCcw size={15}/>旋转 90°</button><button type="button" className="sc-button" disabled={activeFloor.items.length >= 50} onClick={() => props.onDuplicate(item.id)}><Copy size={15}/>复制</button></div>
      <button type="button" className="sc-delete-button" disabled={locked} onClick={() => props.onRemove(item.id)}><Trash2 size={15}/>删除物料</button>
    </div>
  </aside>;
}
