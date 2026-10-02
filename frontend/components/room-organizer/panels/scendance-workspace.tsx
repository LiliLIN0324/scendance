'use client';

import { Box, Download, Grid, Layers, Maximize2, Minus, MousePointer2, Plus, Redo2, Search, Undo2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useRoomEditor, useSelection } from '../contexts';
import { CATALOG_DRAG_MIME, catalogKey } from '../lib/catalog-drag';
import { EVENT_CATALOG } from '../lib/constants';
import { downloadLayoutAsJson } from '../lib/file-io';
import { createGlbCatalogItem, ensureGlbAsset } from '../three/glb-assets';
import type { CameraPreset, CatalogItem } from '../lib/types';

interface LibraryProps {
  placeCatalogItem(item: CatalogItem, position?: { x: number; z: number }): string;
  onImport(file: File): Promise<boolean>;
}

export function MaterialGlyph({ materialId, color = 'currentColor' }: { materialId?: string | undefined; color?: string }): JSX.Element {
  return <svg viewBox="0 0 72 58" width="72" height="58" fill="none" aria-hidden="true" style={{ color }}>
    {materialId === 'chair' ? <><path d="M23 9h26v23H23z" fill="currentColor" opacity=".3"/><path d="M23 9h26v23H23zM21 33h30v8H21zM25 41v11m22-11v11M25 24v9m22-9v9" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"/></> :
      materialId === 'table' || materialId === 'reception' ? <><path d="M11 19h50v15H11z" fill="currentColor" opacity=".25"/><path d="M11 19h50v15H11zM16 34v18m40-18v18" stroke="currentColor" strokeWidth="2.4"/>{materialId === 'reception' && <path d="M19 35h34v14H19z" fill="currentColor" opacity=".3"/>}</> :
      materialId === 'decoration' ? <><path d="M27 37h20l-4 16H31z" fill="currentColor" opacity=".3"/><path d="M36 37V12m0 15C16 25 18 12 19 10c12 0 17 8 17 17Zm0 4c16 0 21-11 17-18-10 0-16 9-17 18ZM27 37h20l-4 16H31z" stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round"/></> :
      materialId === 'carpet' ? <><path d="m9 34 34-18 21 13-34 20Z" fill="currentColor" opacity=".28"/><path d="m9 34 34-18 21 13-34 20Z" stroke="currentColor" strokeWidth="2.4"/><path d="m19 34 24-12 11 7-24 13Z" stroke="currentColor" strokeWidth="1.4"/></> :
      <><path d="M15 9h42v36H15z" fill="currentColor" opacity=".24"/><path d="M15 9h42v36H15zM22 45v8m28-8v8" stroke="currentColor" strokeWidth="2.4"/>{materialId === 'display' && <path d="M15 21h42M15 33h42" stroke="currentColor" strokeWidth="2"/>}{materialId === 'partition' && <path d="M29 9v36M43 9v36" stroke="currentColor" strokeWidth="1.5"/>}</>}
  </svg>;
}

export function ScendanceLibrary({ placeCatalogItem, onImport }: LibraryProps): JSX.Element {
  const { layout, activeFloor, actions, catalogQuery, setCatalogQuery } = useRoomEditor();
  const { selectOnly } = useSelection();
  const [tab, setTab] = useState<'materials' | 'venue' | 'list'>('materials');
  const [sampleState, setSampleState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [sampleError, setSampleError] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const items = EVENT_CATALOG.filter(item => item.name.includes(catalogQuery.trim()));
  const atLimit = activeFloor.items.length >= 50;

  const addMaterial = (item: CatalogItem) => {
    if (atLimit) return;
    const id = placeCatalogItem(item);
    if (id) selectOnly(id);
  };

  const loadSample = async () => {
    if (atLimit || sampleState === 'loading') return;
    setSampleState('loading');
    setSampleError('');
    try {
      const url = '/assets/models/table.glb';
      await ensureGlbAsset(url, url);
      addMaterial(createGlbCatalogItem({ name: 'GLB 桌子 · 本地样例', url, width: 1.2, depth: 0.6, height: 0.75 }));
      setSampleState('ready');
    } catch (error) {
      setSampleState('error');
      setSampleError(error instanceof Error ? error.message : '模型未能加载，请重试。');
    }
  };

  return <aside className="sc-library" aria-label="场地工具">
    <div className="sc-library-tabs" role="tablist" aria-label="工作台面板">
      {([['materials', '物料库'], ['venue', '场地'], ['list', '清单']] as const).map(([key, label]) =>
        <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    <div className="sc-library-content">
      {tab === 'materials' && <>
        <div className="sc-section-heading"><div><h2>把想法放进场地</h2><p>点击添加，也可以拖入画布</p></div><span className="sc-count">8 类</span></div>
        <label className="sc-search"><Search size={15}/><input aria-label="搜索活动物料" placeholder="搜索活动物料" value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)}/></label>
        {atLimit && <p className="sc-warning">已达到 50 件演示物料上限，请先删除部分物料。</p>}
        <div className="sc-material-grid">
          {items.map(item => <button type="button" key={item.materialId} className="sc-material-card" disabled={atLimit} draggable={!atLimit}
            onDragStart={event => { event.dataTransfer.setData(CATALOG_DRAG_MIME, catalogKey(item)); event.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => addMaterial(item)} aria-label={`添加${item.name}`}>
            <span className="sc-material-preview"><MaterialGlyph materialId={item.materialId} color={item.color}/><span className="sc-material-add"><Plus size={12}/></span></span>
            <span className="sc-material-name">{item.name}</span><span className="sc-material-size">{item.width} × {item.depth} × {item.height} m</span>
          </button>)}
        </div>
        {items.length === 0 && <p className="sc-muted">未找到对应物料，试试“椅子”或“桌子”。</p>}
        <section className="sc-sample-section"><div><Box size={17}/><strong>真实 GLB 加载验证</strong></div><p>使用仓库自带 CC0 桌子模型，验证导入、尺寸与保存重开。</p>
          <button type="button" className="sc-button sc-full" onClick={() => void loadSample()} disabled={sampleState === 'loading' || atLimit}>{sampleState === 'loading' ? '正在加载模型…' : '加入本地 GLB 样例'}<Plus size={14}/></button>
          <small>本地验证素材 · 不代表 AI 生成或云端资产</small>
          {sampleState === 'ready' && <p role="status" className="sc-success">模型已加入，可选中调整尺寸。</p>}
          {sampleError && <p role="alert" className="sc-warning">{sampleError}</p>}
        </section>
      </>}
      {tab === 'venue' && <>
        <div className="sc-section-heading"><div><h2>场地设置</h2><p>单层矩形 · 统一使用米制</p></div><Grid size={19}/></div>
        <label className="sc-field">项目名称<input value={layout.name} maxLength={80} onChange={event => actions.setName(event.target.value)} aria-label="项目名称"/></label>
        <div className="sc-dimension-grid">
          <NumberField label="宽度 / m" value={layout.width} min={2} max={100} onChange={actions.setWidth}/>
          <NumberField label="进深 / m" value={layout.height} min={2} max={100} onChange={actions.setHeight}/>
          <NumberField label="净高 / m" value={activeFloor.height ?? 3} min={2} max={10} onChange={actions.setStoreyHeight}/>
        </div>
        <div className="sc-area-card"><span>场地面积</span><strong>{(layout.width * layout.height).toFixed(1)} <small>m²</small></strong></div>
        <label className="sc-field sc-color-field">地面颜色<input type="color" aria-label="地面颜色" value={activeFloor.floorColor} onChange={event => actions.setFloorColor(event.target.value)}/></label>
        <p className="sc-note">当前版本提供矩形场地编辑。平面图标定与多边形编辑尚未接入。</p>
      </>}
      {tab === 'list' && <>
        <div className="sc-section-heading"><div><h2>场景物料</h2><p>选中一项，继续调整位置和规格</p></div><span className="sc-count">{activeFloor.items.length} 件</span></div>
        <div className="sc-object-list">{activeFloor.items.map(item => <button type="button" key={item.id} onClick={() => selectOnly(item.id)}><span className="sc-object-dot" style={{ background: item.color }}/><span><strong>{item.name}</strong><small>{item.width} × {item.depth} × {item.height} m</small></span><span>{item.locked ? '已锁定' : '可编辑'}</span></button>)}</div>
        {activeFloor.items.length === 0 && <p className="sc-note">场地还是空的，从物料库添加第一件物料吧。</p>}
      </>}
    </div>
    <div className="sc-library-footer"><span>本地文件</span><div><button type="button" onClick={() => importRef.current?.click()}><Upload size={14}/>导入 JSON</button><button type="button" onClick={() => downloadLayoutAsJson(layout)}><Download size={14}/>导出 JSON</button></div>
      <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void onImport(file); event.target.value = ''; }}/>
    </div>
  </aside>;
}

export function NumberField({ label, value, min = 0.01, max = 50, step = 0.1, disabled = false, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; disabled?: boolean; onChange(value: number): void }): JSX.Element {
  return <label className="sc-field">{label}<input type="number" aria-label={label} min={min} max={max} step={step} value={Math.round(value * 1000) / 1000} disabled={disabled} onChange={event => { const next = event.target.valueAsNumber; if (Number.isFinite(next) && next >= min && next <= max) onChange(next); }}/></label>;
}

interface ViewToolsProps {
  onApplyPreset(preset: CameraPreset): void;
  onFit(): void;
  onZoom(direction: '+' | '-'): void;
}

export function ScendanceViewTools({ onApplyPreset, onFit, onZoom }: ViewToolsProps): JSX.Element {
  const { view, setView, toggle, history } = useRoomEditor();
  const [preset, setPreset] = useState<CameraPreset>('iso');
  const choosePreset = (next: CameraPreset) => { setView(current => ({ ...current, view2D: false })); onApplyPreset(next); setPreset(next); };
  return <div className="sc-view-tools" aria-label="视角与编辑工具">
    <div className="sc-tool-group"><button type="button" title="撤销 Ctrl / ⌘ Z" aria-label="撤销" disabled={!history.canUndo} onClick={history.undo}><Undo2 size={17}/></button><button type="button" title="重做 Ctrl / ⌘ Shift Z" aria-label="重做" disabled={!history.canRedo} onClick={history.redo}><Redo2 size={17}/></button></div>
    <div className="sc-tool-group sc-view-tabs"><button type="button" className={!view.view2D && preset === 'iso' ? 'is-active' : ''} onClick={() => choosePreset('iso')}><Layers size={15}/>整体</button><button type="button" className={!view.view2D && preset === 'top' ? 'is-active' : ''} onClick={() => choosePreset('top')}>俯视</button><button type="button" className={!view.view2D && preset === 'front' ? 'is-active' : ''} onClick={() => choosePreset('front')}>客户视角</button><button type="button" className={view.view2D ? 'is-active' : ''} onClick={() => toggle('view2D')}>2D</button></div>
    <div className="sc-tool-group"><button type="button" title="缩小" aria-label="缩小" onClick={() => onZoom('-')} disabled={view.view2D}><Minus size={16}/></button><button type="button" title="适应场地" aria-label="适应场地" onClick={onFit} disabled={view.view2D}><Maximize2 size={16}/></button><button type="button" title="放大" aria-label="放大" onClick={() => onZoom('+')} disabled={view.view2D}><Plus size={16}/></button></div>
    <div className="sc-tool-group"><button type="button" title="网格吸附" aria-label="网格吸附" aria-pressed={view.snapToGrid} className={view.snapToGrid ? 'is-active' : ''} onClick={() => toggle('snapToGrid')}><Grid size={16}/></button><button type="button" title="显示尺寸" aria-label="显示尺寸" aria-pressed={view.showMeasurements} className={view.showMeasurements ? 'is-active' : ''} onClick={() => toggle('showMeasurements')}><MousePointer2 size={16}/></button></div>
  </div>;
}
