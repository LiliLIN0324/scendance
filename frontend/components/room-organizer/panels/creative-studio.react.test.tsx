// @vitest-environment jsdom

import { act, cleanup, fireEvent, render as renderUI, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendSession, getBackendConfig, type BackendSnapshot, type Scene, type SceneProposal, type AgentRun, type AgentRunInput } from '@/lib/backend-session';
import { backendSceneToLayout, createMeasuredRoomLayout, layoutToBackendScene } from '../lib/backend-adapter';
import { ensureGlbAsset } from '../three/glb-assets';
import { loadScenePreset } from '../three/scene-presets';
import { CreativeAssistant, CreativeStudioProvider } from './creative-studio';
import { GeneratedModelLibrary } from './generated-model-library';
import type { MaterialCustomizationSeed } from './material-customization';
import type { RoomLayout } from '../lib/types';

vi.mock('../three/glb-assets', async original => ({ ...(await original<typeof import('../three/glb-assets')>()), ensureGlbAsset: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../three/scene-presets', () => ({ loadScenePreset: vi.fn() }));
vi.mock('../contexts', () => ({ useSelection: () => ({ allSelectedIds: new Set<string>(), selectedItem: null }) }));
let materialProps: { seed?: MaterialCustomizationSeed; layout: RoomLayout; onApply(next:RoomLayout):void };
vi.mock('./material-customization', () => ({ MaterialCustomization: (props: typeof materialProps) => { materialProps=props;return <output data-testid="material-seed">{JSON.stringify(props.seed ?? null)}</output>; } }));

const projectId = '10000000-0000-4000-8000-000000000001';
const scene: Scene = {
  schemaVersion: 1,
  venue: { width: 12, depth: 10, height: 3, shape: 'rectangle', entrances: [] },
  objects: [], camera: 'overview', lighting: 'warm',
};
const candidate: Scene = {
  ...scene,
  objects: [{ id: '20000000-0000-4000-8000-000000000001', materialId: 'chair', position: { x: 3, z: 4 }, rotation: 0, size: { width: 0.5, depth: 0.5, height: 0.9 }, color: '#ddc8a2', locked: false, notes: '' }],
};
const proposal: SceneProposal = {
  id: '30000000-0000-4000-8000-000000000001', project_id: projectId, session_id: '40000000-0000-4000-8000-000000000001', user_id: 'test-user',
  generation: 1, base_revision: 1, local_revision: 0, base_hash: 'a'.repeat(64), base_scene: scene, candidate,
  expires_at: '2099-01-01T00:00:00Z', applied_at: null, explanation: '增加一把椅子，保留中心通道。', warnings: [],
};
let controller: BackendSession;
let snapshot: BackendSnapshot;
let layout: RoomLayout;
const prepareProposal=vi.fn<(input:AgentRunInput)=>Promise<SceneProposal>>();
function runFrom(value:SceneProposal,input?:AgentRunInput):AgentRun {return {id:'60000000-0000-4000-8000-000000000001',projectId,requestId:input?.requestId??'70000000-0000-4000-8000-000000000001',state:'complete',progress:'完成',callCount:1,candidates:[{label:'A',title:'交流区',proposal:value}],evaluation:null,executionMode:input?.executionMode??'preview',jevEnabled:input?.jevEnabled??false,expiresAt:value.expires_at};}
const onApply = vi.fn<(next: RoomLayout) => void>();
const onPreview = vi.fn<(next: RoomLayout | null) => void>();
const createBitmap = vi.fn();
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();
const forbiddenFetch = vi.fn(() => { throw new Error('This UI test must never access the network.'); });
const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');

function restoreProperty(object: object, key: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(object, key, descriptor);
  else Reflect.deleteProperty(object, key);
}

function ui(current = layout) {
  return <CreativeStudioProvider controller={controller} layout={current} onApply={onApply} onPreview={onPreview}>
    <CreativeAssistant/>
  </CreativeStudioProvider>;
}

function render(element: React.ReactElement) {
  const view=renderUI(element);
  fireEvent.click(screen.getByRole('button', {name:'打开 Binggo Agent'}));
  fireEvent.click(screen.getByText('活动需求与场地资料'));
  fireEvent.click(screen.getByText('风格、配色与氛围（可选）'));
  fireEvent.click(screen.getByRole('checkbox', {name:'明确指令直接应用'}));
  return view;
}

function connected(): void {
  Object.assign(snapshot, {
    configured: true, user: { id: 'test-user' }, sessionId:proposal.session_id,localRevision:0,lease:{projectId,sessionId:proposal.session_id,generation:1,revision:1,expiresAt:'2099-01-01T00:00:00Z'}, writeBlocked: false, status: 'editing', revision: 1,
    project: { id: projectId, studio_id: 'studio-test', name: '客户方案', revision: 1, scene },
  });
}

function enterBrief(): void {
  fireEvent.change(screen.getByRole('textbox', { name: '客户需求' }), { target: { value: '给 24 位来宾布置一个交流会，保留中心通道。' } });
}

async function generatePreview(): Promise<void> {
  enterBrief();
  fireEvent.click(screen.getByRole('button', { name: '生成布置预览' }));
  await screen.findByText('方案提案 · 尚未应用');
}

function upload(container: HTMLElement, files: File[]): void {
  const input = container.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files } });
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  onApply.mockReset();
  onPreview.mockReset();
  forbiddenFetch.mockClear();
  vi.stubGlobal('fetch', forbiddenFetch);
  createBitmap.mockReset().mockImplementation(async () => ({ width: 1024, height: 768, close: vi.fn() }));
  createObjectURL.mockReset().mockReturnValue('blob:local-reference');
  revokeObjectURL.mockReset();
  vi.stubGlobal('createImageBitmap', createBitmap);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  controller = new BackendSession(getBackendConfig({ url: '', anonKey: '' }));
  snapshot = { ...controller.getSnapshot() };
  vi.spyOn(controller, 'getSnapshot').mockImplementation(() => snapshot);
  vi.spyOn(controller, 'listSources').mockResolvedValue([]);
  prepareProposal.mockReset().mockResolvedValue(proposal);
  vi.spyOn(controller,'startAgentRun').mockImplementation(async input=>runFrom(await prepareProposal(input),input));
  vi.spyOn(controller,'getAgentRun');
  vi.spyOn(controller,'getAgentRunByRequest');
  vi.spyOn(controller,'cancelAgentRun');
  vi.spyOn(controller, 'authorizeAssets').mockResolvedValue({ assetUrls: {}, assetNames: {} });
  vi.spyOn(controller, 'applySceneProposal').mockResolvedValue({ id: projectId, revision: 2, scene: candidate, previousScene: scene, updatedAt: '2026-10-02T10:00:00Z', undoGroup: 'undo-test', acceptedLocally: true });
  layout = backendSceneToLayout(scene, { projectId, name: '客户方案' });
});

afterEach(() => {
  cleanup();
  controller.dispose();
  vi.useRealTimers();
  expect(forbiddenFetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreProperty(URL, 'createObjectURL', originalCreateObjectURL);
  restoreProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
  restoreProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
});

describe('creative brief and assistant interaction', () => {
  it('opens complete templates separately without losing the planning draft or invoking generation', async () => {
    connected();
    const preset:RoomLayout={...layout,name:'办公室 · 留白',scenePreset:'office'};
    vi.mocked(loadScenePreset).mockResolvedValueOnce(preset);
    vi.spyOn(window,'confirm').mockReturnValue(true);
    const create=vi.spyOn(controller,'createGenerationJob');
    renderUI(ui());
    fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));
    fireEvent.change(screen.getByRole('textbox',{name:'告诉助手你的想法'}),{target:{value:'保留这条未发送的需求'}});
    fireEvent.click(screen.getByRole('tab',{name:/场景模板/}));
    expect(screen.getAllByRole('button',{name:/载入工作台/})).toHaveLength(10);
    fireEvent.click(screen.getByRole('tab',{name:/场景策划/}));
    expect((screen.getByRole('textbox',{name:'告诉助手你的想法'}) as HTMLTextAreaElement).value).toBe('保留这条未发送的需求');
    fireEvent.click(screen.getByRole('tab',{name:/场景模板/}));
    fireEvent.click(screen.getByRole('button',{name:/办公室 · 留白/}));
    await waitFor(()=>expect(onApply).toHaveBeenCalledWith(preset));
    expect(loadScenePreset).toHaveBeenCalledWith('office');
    expect(prepareProposal).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole('tab',{name:/模型与交付/})).toBeTruthy();
  });

  it('keeps text planning available alongside reconstruction for an existing v2 scene',async()=>{
    render(ui(createMeasuredRoomLayout(layout,{width:12,depth:10,height:3})));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Generate 重建并设计方案'}).hasAttribute('disabled')).toBe(false));
    expect(screen.getByRole('button',{name:'生成布置预览'})).toBeTruthy();
    expect(screen.getByText('生成布置预览')).toBeTruthy();
  });

  it('sends full resource requirements to the Agent without a built-in catalogue rejection', async () => {
    connected();render(ui());
    fireEvent.change(screen.getByRole('textbox', { name: '客户需求' }), { target: { value: '需要圆桌和帐篷，安排24人交流会' } });
    fireEvent.click(screen.getByRole('button', { name: '生成布置预览' }));
    await screen.findByText('方案提案 · 尚未应用');
    expect(prepareProposal).toHaveBeenCalledWith(expect.objectContaining({ context:expect.objectContaining({brief: expect.stringContaining('需要圆桌和帐篷')}) }));
    expect(screen.queryByText('圆桌的处理方式')).toBeNull();
  });

  it('lets the Agent select a library tent and loads the authorized GLB before applying', async () => {
    connected();
    const assetId='50000000-0000-4000-8000-000000000001';
    const assetCandidate:Scene={...candidate,objects:[{...candidate.objects[0],materialId:'asset',assetId}]};
    const assetProposal={...proposal,candidate:assetCandidate};
    vi.mocked(prepareProposal).mockResolvedValueOnce(assetProposal);
    vi.mocked(controller.authorizeAssets).mockResolvedValueOnce({assetUrls:{[assetId]:'https://storage.example/tent.glb'},assetNames:{[assetId]:'资源库帐篷'}});
    vi.mocked(controller.applySceneProposal).mockResolvedValueOnce({id:projectId,revision:2,scene:assetCandidate,previousScene:scene,updatedAt:'2026-10-03T10:00:00Z',undoGroup:'undo-test',acceptedLocally:true});
    renderUI(ui());fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));
    fireEvent.change(screen.getByRole('textbox',{name:'告诉助手你的想法'}),{target:{value:'从资源库加入一顶帐篷'}});
    fireEvent.click(screen.getByRole('button',{name:'发送消息'}));
    await waitFor(()=>expect(onApply).toHaveBeenCalledOnce());
    expect(prepareProposal).toHaveBeenCalledWith(expect.objectContaining({instruction:expect.stringContaining('从资源库加入一顶帐篷')}));
    expect(ensureGlbAsset).toHaveBeenCalledWith(assetId,'https://storage.example/tent.glb');
    expect(controller.applySceneProposal).toHaveBeenCalledWith(assetProposal,layoutToBackendScene(layout));
    expect(onApply.mock.calls[0]![0].floors[0].items[0]).toMatchObject({assetId,name:'资源库帐篷'});
  });

  it('shows an unsupported shape without exposing HY3 creation', async () => {
    connected();
    prepareProposal.mockResolvedValueOnce({...proposal,candidate:scene,explanation:'资源库和参数族暂不支持花形拱门。'});
    vi.spyOn(controller,'listGenerationJobs').mockResolvedValue([]);
    const create=vi.spyOn(controller,'createGenerationJob');
    renderUI(<CreativeStudioProvider controller={controller} layout={layout} onApply={onApply}><CreativeAssistant generationPanel={<GeneratedModelLibrary controller={controller} onAdd={vi.fn()}/>}/></CreativeStudioProvider>);
    fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));
    fireEvent.change(screen.getByRole('textbox',{name:'告诉助手你的想法'}),{target:{value:'添加花形拱门'}});
    fireEvent.click(screen.getByRole('button',{name:'发送消息'}));
    await screen.findByText('资源库和参数族暂不支持花形拱门。');
    fireEvent.click(screen.getByRole('tab',{name:/模型与交付/}));
    expect(screen.queryByRole('button',{name:/HY3|生成 3D 模型/})).toBeNull();
    expect(screen.getByRole('button',{name:'桌'})).toBeTruthy();
    expect(controller.authorizeAssets).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();expect(onApply).not.toHaveBeenCalled();
  });

  it('hands exact material targets to a preview without applying the scene or calling HY3', async () => {
    connected();
    const suggestion={name:'椅面换色',reason:'保留原模型，调整选中椅子的基础色',objectIds:['20000000-0000-4000-8000-000000000001'],sourceAssetId:'50000000-0000-4000-8000-000000000001',scope:'choose_materials' as const,changes:{baseColor:'#aabbcc'}};
    vi.mocked(prepareProposal).mockResolvedValueOnce({...proposal,candidate:scene,materialSuggestions:[suggestion]});
    const create=vi.spyOn(controller,'createGenerationJob');
    renderUI(ui());fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));
    fireEvent.change(screen.getByRole('textbox',{name:'告诉助手你的想法'}),{target:{value:'把选中椅子的椅面改为灰蓝色'}});
    fireEvent.click(screen.getByRole('button',{name:'发送消息'}));
    fireEvent.click(await screen.findByRole('button',{name:'预览材质调整'}));
    expect(JSON.parse(screen.getByTestId('material-seed').textContent!)).toMatchObject({sourceAssetId:suggestion.sourceAssetId,objectIds:suggestion.objectIds,changes:suggestion.changes,materialScope:'choose_materials',projectId,userId:'test-user'});
    expect(controller.applySceneProposal).not.toHaveBeenCalled();expect(onApply).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{name:'材质调整'}).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button',{name:'场景交付'}));
    expect(screen.getByRole('button',{name:'导出场景 GLB'})).toBeTruthy();
  });
  it('tracks the newly applied version so the same instances can restore their parent', async () => {
    connected();
    const sourceAssetId='50000000-0000-4000-8000-000000000001',variantAssetId='50000000-0000-4000-8000-000000000002';
    const base:Scene={...candidate,objects:[{...candidate.objects[0]!,materialId:'asset',assetId:sourceAssetId}]};
    const current=backendSceneToLayout(base,{projectId,name:'材质测试'});
    const suggestion={objectIds:[base.objects[0]!.id],sourceAssetId,name:'蓝色椅子',reason:'仅选中实例',scope:'all_materials' as const,changes:{baseColor:'#285fad'}};
    vi.mocked(prepareProposal).mockResolvedValueOnce({...proposal,base_scene:base,candidate:base,materialSuggestions:[suggestion]});
    function Harness(){const [value,setValue]=useState(current);return <CreativeStudioProvider controller={controller} layout={value} onApply={setValue}><CreativeAssistant/></CreativeStudioProvider>;}
    renderUI(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));
    fireEvent.change(screen.getByRole('textbox',{name:'告诉助手你的想法'}),{target:{value:'给椅子换色'}});fireEvent.click(screen.getByRole('button',{name:'发送消息'}));
    fireEvent.click(await screen.findByRole('button',{name:'预览材质调整'}));
    act(()=>materialProps.onApply({...current,floors:current.floors.map(floor=>({...floor,items:floor.items.map(item=>({...item,assetId:variantAssetId}))}))}));
    expect(materialProps.seed).toMatchObject({sourceAssetId:variantAssetId,objectIds:suggestion.objectIds});
    expect(materialProps.seed!.changes).toBeUndefined();
    fireEvent.click(screen.getByRole('button',{name:'使用当前选中物件'}));expect(materialProps.seed).toBeUndefined();
  });

  it('ignores a late suggestion after the signed-in account changes', async () => {
    connected();let finish!:(value:SceneProposal)=>void;
    vi.mocked(prepareProposal).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const view=renderUI(ui());fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));
    fireEvent.change(screen.getByRole('textbox',{name:'告诉助手你的想法'}),{target:{value:'添加花形拱门'}});
    fireEvent.click(screen.getByRole('button',{name:'发送消息'}));
    snapshot={...snapshot,user:{id:'another-user'}};view.rerender(ui());
    await act(async()=>{finish({...proposal,candidate:scene,modelSuggestions:[{name:'花形拱门',reason:'缺少该资源',prompt:'单件花形拱门'}]});});
    expect(screen.queryByRole('button',{name:'前往 HY3 生成'})).toBeNull();
    expect(controller.applySceneProposal).not.toHaveBeenCalled();expect(onApply).not.toHaveBeenCalled();
  });

  it('moves keyboard focus into the assistant and returns it on Escape', () => {
    renderUI(ui());
    const launch = screen.getByRole('button', { name: '打开 Binggo Agent' });
    expect(screen.getByRole('img',{name:'Binggo 小狗'}).getAttribute('src')).toBe('/assets/assistant/puppy.png');
    fireEvent.click(launch);
    const input = screen.getByRole('textbox', { name: '告诉助手你的想法' });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Agent' })).toBeNull();
    expect(document.activeElement).toBe(launch);
  });

  it('explains the missing AI connection offline without fabricating a proposal or changing the scene', async () => {
    render(ui());
    expect(screen.getByRole('button', { name: '生成布置预览' }).hasAttribute('disabled')).toBe(true);
    enterBrief();
    fireEvent.click(screen.getByRole('button', { name: '生成布置预览' }));
    expect(await screen.findByRole('region', { name: 'Agent' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('当前尚未连接 AI 服务');
    expect(screen.queryByText('方案提案 · 尚未应用')).toBeNull();
    expect(screen.queryByRole('button', { name: '确认应用' })).toBeNull();
    expect(prepareProposal).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('shows local reference images, tells users they are not sent to the model, and releases their URLs', async () => {
    const rendered = render(ui());
    const file = new File(['image fixture'], 'venue.png', { type: 'image/png' });
    upload(rendered.container, [file]);
    const image = await screen.findByRole('img', { name: '现场照片：venue.png' });
    expect(screen.getByRole('button',{name:'生成布置预览'})).toBeTruthy();
    expect(screen.getByText('生成布置预览')).toBeTruthy();
    expect(image.getAttribute('src')).toBe('blob:local-reference');
    expect(screen.getByText(/图片保存在本机；连接项目并生成时会上传至私有存储/)).toBeTruthy();
    expect(prepareProposal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '移除 venue.png' }));
    expect(screen.queryByRole('img', { name: '现场照片：venue.png' })).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-reference');
    upload(rendered.container, [file]);
    await screen.findByRole('img', { name: '现场照片：venue.png' });
    rendered.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['unsupported format', () => new File(['vector'], 'venue.svg', { type: 'image/svg+xml' }), '请选择 PNG、JPEG 或 WebP 图片。'],
    ['oversized file', () => new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'venue.png', { type: 'image/png' }), '每张图片不能超过 5 MB。'],
  ])('rejects %s before creating a preview or decoding', async (_case, file, message) => {
    const rendered = render(ui());
    upload(rendered.container, [file()]);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByRole('img', { name: '现场照片：venue.png' })).toBeNull();
    expect(createBitmap).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('closes an oversized decoded bitmap and does not create a preview URL', async () => {
    const close = vi.fn();
    createBitmap.mockResolvedValueOnce({ width: 5000, height: 768, close });
    const rendered = render(ui());
    upload(rendered.container, [new File(['image'], 'wide.png', { type: 'image/png' })]);
    expect(await screen.findByText('图片长宽请控制在 4096 像素以内。')).toBeTruthy();
    expect(close).toHaveBeenCalledOnce();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('presents the actual proposal for confirmation and applies only after the confirmation request succeeds', async () => {
    connected();
    render(ui());
    await generatePreview();
    expect(onPreview).toHaveBeenLastCalledWith(expect.objectContaining({ id: projectId }));
    expect(prepareProposal).toHaveBeenCalledWith(expect.objectContaining({ scene: layoutToBackendScene(layout), context: expect.objectContaining({brief:expect.stringContaining('给 24 位来宾')}) }));
    expect(onApply).not.toHaveBeenCalled();
    expect(controller.applySceneProposal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认应用' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledOnce());
    expect(onApply.mock.calls[0]![0].designBook?.variants.map(v => v.name)).toEqual(['原始方案', 'AI 方案 A']);
    expect(controller.applySceneProposal).toHaveBeenCalledWith(proposal, layoutToBackendScene(layout));
    expect(layoutToBackendScene(onApply.mock.calls[0][0])).toEqual(candidate);
    expect(onApply.mock.calls[0][0].designBook?.variants.map(variant=>variant.name)).toEqual(['原始方案','AI 方案 A']);
    expect(screen.queryByText('方案提案 · 尚未应用')).toBeNull();
  });

  it.each(['scene', 'brief', 'lease'] as const)('removes the apply action when the %s changes after a preview', async change => {
    connected();
    const rendered = render(ui());
    await generatePreview();
    if (change === 'scene') rendered.rerender(ui({ ...layout, width: 13 }));
    if (change === 'brief') fireEvent.change(screen.getByRole('textbox', { name: '客户需求' }), { target: { value: '改成 12 人工作坊。' } });
    if (change === 'lease') {
      snapshot = { ...snapshot, writeBlocked: true };
      rendered.rerender(ui());
    }
    expect(await screen.findByText('场景、需求或编辑权已变化，请重新生成。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '确认应用' })).toBeNull();
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(controller.applySceneProposal).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('preserves the canvas when the controller reports acceptedLocally false', async () => {
    connected();
    vi.mocked(controller.applySceneProposal).mockResolvedValueOnce({ id: projectId, revision: 2, scene: candidate, previousScene: scene, updatedAt: '2026-10-02T10:00:00Z', undoGroup: 'undo-test', acceptedLocally: false });
    render(ui());
    await generatePreview();
    fireEvent.click(screen.getByRole('button', { name: '确认应用' }));
    expect(await screen.findByText(/应用期间本地有新修改，已保留本地草稿/)).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByText('提案已应用。你可以继续调整，或用撤销返回应用前的本地方案。')).toBeNull();
  });

  it('discards a pending generation result if the scene changes before its response arrives', async () => {
    connected();
    let finish!: (value: SceneProposal) => void;
    vi.mocked(prepareProposal).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const rendered = render(ui());
    enterBrief();
    fireEvent.click(screen.getByRole('button', { name: '生成布置预览' }));
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    rendered.rerender(ui({ ...layout, width: 13 }));
    await act(async () => { finish(proposal); });
    expect(screen.getByRole('status').textContent).toContain('生成期间方案或需求已变化');
    expect(screen.queryByText('方案提案 · 尚未应用')).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('automatically clears the canvas preview at expiration without waiting for a confirm click', async () => {
    connected();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
    vi.mocked(prepareProposal).mockResolvedValueOnce({ ...proposal, expires_at: '2026-10-02T10:00:02Z' });
    render(ui());
    enterBrief();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '生成布置预览' })); });
    expect(screen.getByRole('button', { name: '确认应用' })).toBeTruthy();
    expect(onPreview).toHaveBeenLastCalledWith(expect.objectContaining({ id: projectId }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByText('提案已过期，请重新生成。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '确认应用' })).toBeNull();
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(controller.applySceneProposal).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('clears the render-only preview when discarded or when its provider unmounts', async () => {
    connected();
    const rendered = render(ui());
    await generatePreview();
    expect(onPreview.mock.calls.at(-1)?.[0]).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '放弃' }));
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(onApply).not.toHaveBeenCalled();
    await generatePreview();
    expect(onPreview.mock.calls.at(-1)?.[0]).not.toBeNull();
    rendered.unmount();
    expect(onPreview).toHaveBeenLastCalledWith(null);
  });

  it('lists individual overlap and boundary warnings against named objects', async () => {
    connected();
    vi.mocked(prepareProposal).mockResolvedValueOnce({ ...proposal, warnings: [
      { code: 'OVERLAP', ids: [candidate.objects[0].id] },
      { code: 'OUT_OF_BOUNDS', ids: [candidate.objects[0].id] },
    ] });
    render(ui());
    await generatePreview();
    expect(screen.getByText('物件重叠：椅子')).toBeTruthy();
    expect(screen.getByText('超出场地边界：椅子')).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled();
  });
});


describe('context continuity and project isolation', () => {
  it('carries confirmed venue and design requirements into successive assistant requests', async () => {
    connected(); render(ui()); enterBrief();
    fireEvent.change(screen.getByRole('textbox',{name:'已确认的现场条件'}),{target:{value:'北侧入口不得遮挡'}});
    fireEvent.change(screen.getByRole('textbox',{name:'风格要求'}),{target:{value:'简约现代'}});
    fireEvent.change(screen.getByRole('textbox',{name:'配色要求'}),{target:{value:'米白橄榄绿'}});
    fireEvent.change(screen.getByRole('textbox',{name:'氛围要求'}),{target:{value:'温暖聚会'}});
    const send=async(text:string)=>{
      fireEvent.change(screen.getByRole('textbox',{name:'告诉助手你的想法'}),{target:{value:text}});
      fireEvent.click(screen.getByRole('button',{name:'发送消息'}));
      await waitFor(()=>expect(screen.getByRole('button',{name:'确认应用'})).toBeTruthy());
    };
    await send('把交流区靠近入口');
    fireEvent.click(screen.getByRole('button',{name:'放弃'}));
    await send('再留宽一点');
    const prompt=JSON.stringify(vi.mocked(prepareProposal).mock.calls[1]![0]);
    for(const text of ['北侧入口不得遮挡','简约现代','米白橄榄绿','温暖聚会','把交流区靠近入口','再留宽一点',proposal.explanation]) expect(prompt).toContain(text);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('clears old brief and conversation on project switch and ignores an old in-flight response', async () => {
    connected(); const rendered=render(ui()); enterBrief();
    let finish!:(value:SceneProposal)=>void;
    vi.mocked(prepareProposal).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    fireEvent.click(screen.getByRole('button',{name:'生成布置预览'}));
    await waitFor(()=>expect(prepareProposal).toHaveBeenCalledOnce());
    const changed={...layout,id:'10000000-0000-4000-8000-000000000002'};
    rendered.rerender(ui(changed));
    expect((screen.getByRole('textbox',{name:'客户需求'}) as HTMLTextAreaElement).value).toBe('');
    await act(async()=>{finish(proposal);});
    expect(screen.queryByText('方案提案 · 尚未应用')).toBeNull();
    expect(screen.queryByText(proposal.explanation)).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });
});


describe('unified Agent', () => {
  it('offers three Agent sections and keeps the unsent planning message when switching', () => {
    renderUI(<CreativeStudioProvider controller={controller} layout={layout} onApply={onApply}><CreativeAssistant/></CreativeStudioProvider>);
    fireEvent.click(screen.getByRole('button', { name: '打开 Binggo Agent' }));
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    fireEvent.change(screen.getByRole('textbox', { name: '告诉助手你的想法' }), { target: { value: '增加两把椅子' } });
    fireEvent.click(screen.getByRole('tab', { name: /模型与交付/ }));
    expect(screen.queryByRole('textbox', { name: '告诉助手你的想法' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /场景策划/ }));
    expect((screen.getByRole('textbox', { name: '告诉助手你的想法' }) as HTMLTextAreaElement).value).toBe('增加两把椅子');
    expect(prepareProposal).not.toHaveBeenCalled();
  });

  it('applies a validated text request directly through the cloud apply endpoint', async () => {
    connected();
    renderUI(<CreativeStudioProvider controller={controller} layout={layout} onApply={onApply}><CreativeAssistant/></CreativeStudioProvider>);
    fireEvent.click(screen.getByRole('button', { name: '打开 Binggo Agent' }));
    fireEvent.change(screen.getByRole('textbox', { name: '告诉助手你的想法' }), { target: { value: '增加一把椅子' } });
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledOnce());
    expect(prepareProposal).toHaveBeenCalledWith(expect.objectContaining({executionMode:'direct',jevEnabled:false}));
    expect(vi.mocked(prepareProposal).mock.calls[0]![0].context.brief).not.toContain('预计24人');
    expect(controller.applySceneProposal).toHaveBeenCalledWith(proposal, layoutToBackendScene(layout));
    expect(layoutToBackendScene(onApply.mock.calls[0][0])).toEqual(candidate);
    expect(onApply.mock.calls[0][0].designBook?.variants.map(variant=>variant.name)).toEqual(['原始方案','AI 方案 A']);
  });

  it('sends structured scenes to DeepSeek as material modifications without dropping structure', async () => {
    connected();
    const structured = createMeasuredRoomLayout(layout, { width: 12, depth: 10, height: 3 });
    const baseScene=layoutToBackendScene(structured);
    const structuredCandidate={...baseScene,objects:candidate.objects};
    vi.mocked(prepareProposal).mockResolvedValueOnce({...proposal,base_scene:baseScene,candidate:structuredCandidate});
    vi.mocked(controller.applySceneProposal).mockResolvedValueOnce({id:projectId,revision:2,scene:structuredCandidate,previousScene:baseScene,updatedAt:'2026-10-03T10:00:00Z',undoGroup:'undo-test',acceptedLocally:true});
    renderUI(<CreativeStudioProvider controller={controller} layout={structured} onApply={onApply}><CreativeAssistant/></CreativeStudioProvider>);
    fireEvent.click(screen.getByRole('button', { name: '打开 Binggo Agent' }));
    fireEvent.change(screen.getByRole('textbox', { name: '告诉助手你的想法' }), { target: { value: '增加一把椅子' } });
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
    await waitFor(() => expect(prepareProposal).toHaveBeenCalledOnce());
    expect(prepareProposal).toHaveBeenCalledWith(expect.objectContaining({ scene: baseScene }));
    await waitFor(()=>expect(onApply).toHaveBeenCalledOnce());
    expect(layoutToBackendScene(onApply.mock.calls[0][0])).toEqual(structuredCandidate);
  });


  it('keeps generation content mounted across tab switches and closing the Agent', () => {
    const mounted=vi.fn(), submitted=vi.fn();
    function Generator() {
      const [text,setText]=useState('');
      useEffect(()=>{mounted();},[]);
      return <><input aria-label="测试物料描述" value={text} onChange={event=>setText(event.target.value)}/><button onClick={submitted}>测试提交</button></>;
    }
    renderUI(<CreativeStudioProvider controller={controller} layout={layout} onApply={onApply}><CreativeAssistant generationPanel={<Generator/>}/></CreativeStudioProvider>);
    fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));
    fireEvent.click(screen.getByRole('tab',{name:/模型与交付/}));
    fireEvent.change(screen.getByRole('textbox',{name:'测试物料描述'}),{target:{value:'绿色休闲椅'}});
    fireEvent.click(screen.getByRole('tab',{name:/场景策划/}));
    fireEvent.click(screen.getByRole('button',{name:'关闭 Binggo Agent'}));
    fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));
    fireEvent.click(screen.getByRole('tab',{name:/模型与交付/}));
    expect((screen.getByRole('textbox',{name:'测试物料描述'}) as HTMLInputElement).value).toBe('绿色休闲椅');
    expect(mounted).toHaveBeenCalledOnce();
    expect(submitted).not.toHaveBeenCalled();
  });

  it('keeps the existing design limit before directly applying a proposal', async () => {
    connected();
    const full={...layout,designBook:{activeId:'design-0',variants:Array.from({length:20},(_,index)=>({id:`design-${index}`,name:`方案 ${index}`,layout}))}};
    renderUI(<CreativeStudioProvider controller={controller} layout={full} onApply={onApply}><CreativeAssistant/></CreativeStudioProvider>);
    fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));
    fireEvent.change(screen.getByRole('textbox',{name:'告诉助手你的想法'}),{target:{value:'增加一把椅子'}});
    fireEvent.click(screen.getByRole('button',{name:'发送消息'}));
    await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('请先在图层面板移除'));
    expect(controller.applySceneProposal).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('shows layout warnings after a direct application', async () => {
    connected();
    vi.mocked(prepareProposal).mockResolvedValueOnce({...proposal,warnings:[{code:'OVERLAP',ids:[candidate.objects[0].id]}]});
    renderUI(<CreativeStudioProvider controller={controller} layout={layout} onApply={onApply}><CreativeAssistant/></CreativeStudioProvider>);
    fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));
    fireEvent.change(screen.getByRole('textbox',{name:'告诉助手你的想法'}),{target:{value:'增加一把椅子'}});
    fireEvent.click(screen.getByRole('button',{name:'发送消息'}));
    await waitFor(()=>expect(onApply).toHaveBeenCalledOnce());
    expect(screen.getByRole('status').textContent).toContain('物件重叠：椅子');
  });

  it('does not apply a direct response after a scene edit while generation is pending', async () => {
    connected();
    let finish!:(value:SceneProposal)=>void;
    vi.mocked(prepareProposal).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const view=renderUI(<CreativeStudioProvider controller={controller} layout={layout} onApply={onApply}><CreativeAssistant/></CreativeStudioProvider>);
    fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));
    fireEvent.change(screen.getByRole('textbox',{name:'告诉助手你的想法'}),{target:{value:'增加一把椅子'}});
    fireEvent.click(screen.getByRole('button',{name:'发送消息'}));
    view.rerender(<CreativeStudioProvider controller={controller} layout={{...layout,width:13}} onApply={onApply}><CreativeAssistant/></CreativeStudioProvider>);
    await act(async()=>{finish(proposal);});
    expect(controller.applySceneProposal).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('生成期间方案或需求已变化');
  });
});

describe('bounded Agent runs and JEV decisions',()=>{
  const send=()=>{fireEvent.change(screen.getByRole('textbox',{name:'告诉助手你的想法'}),{target:{value:'直接把交流区布置好'}});fireEvent.click(screen.getByRole('button',{name:'发送消息'}));};
  function comparison():AgentRun {
    const alternatives=(['A','B','C'] as const).map((label,index)=>({label,title:`布局${index+1}`,proposal:{...proposal,id:`30000000-0000-4000-8000-00000000000${index+1}`,candidate:{...candidate,objects:[{...candidate.objects[0]!,position:{x:3+index,z:4}}]}}}));
    return {...runFrom(proposal),jevEnabled:true,executionMode:'direct',candidates:alternatives,evaluation:{status:'complete',choice:'B',probabilities:{A:.2,B:.5,C:.2,NONE:.1},confidence:.33,message:'方案 B 更符合动线要求。'}};
  }
  it('keeps JEV off by default and presents three independently selectable candidates without applying',async()=>{
    connected();renderUI(ui());fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));
    const toggle=screen.getByRole('checkbox',{name:'JEV 决策模式'}) as HTMLInputElement;
    expect(toggle.checked).toBe(false);fireEvent.click(toggle);
    vi.mocked(controller.startAgentRun).mockResolvedValueOnce(comparison());send();
    const second=await screen.findByRole('button',{name:/方案 B.*布局2.*50\.0/});
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(onApply).not.toHaveBeenCalled();expect(controller.applySceneProposal).not.toHaveBeenCalled();
    expect(controller.startAgentRun).toHaveBeenCalledWith(expect.objectContaining({jevEnabled:true,scene:layoutToBackendScene(layout)}));
    fireEvent.click(screen.getByRole('button',{name:/方案 C.*布局3.*20\.0/}));
    expect(screen.getByRole('button',{name:/方案 C.*布局3.*20\.0/}).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button',{name:'确认应用'}));
    await waitFor(()=>expect(controller.applySceneProposal).toHaveBeenCalledWith(comparison().candidates[2]!.proposal,layoutToBackendScene(layout)));
  });
  it('invalidates every candidate after any local edit',async()=>{
    connected();vi.mocked(controller.startAgentRun).mockResolvedValueOnce(comparison());const view=render(ui());send();
    await screen.findByRole('button',{name:/方案 A ·/});
    view.rerender(ui({...layout,width:14}));
    expect(screen.getAllByRole('button',{name:/方案 [ABC] ·/}).every(button=>button.hasAttribute('disabled'))).toBe(true);
    expect(screen.queryByRole('button',{name:'确认应用'})).toBeNull();
    expect(onPreview.mock.calls.at(-1)?.[0]).toBeNull();expect(onApply).not.toHaveBeenCalled();
  });
  it('retains partial candidates when evaluation is unavailable without inventing probabilities',async()=>{
    connected();const run=comparison();vi.mocked(controller.startAgentRun).mockResolvedValueOnce({...run,candidates:run.candidates.slice(0,2),evaluation:{status:'partial',message:'只有两个有效方案，未执行三选评价。'}});render(ui());send();
    await screen.findByText('只有两个有效方案，未执行三选评价。');
    expect(screen.getAllByRole('button',{name:/方案 [AB] ·/})).toHaveLength(2);
    expect(screen.queryByText(/模型推荐概率/)).toBeNull();expect(onApply).not.toHaveBeenCalled();
  });
  it('recovers an uncertain dispatch by the original request ID without posting again',async()=>{
    connected();vi.mocked(controller.startAgentRun).mockRejectedValueOnce(new TypeError('network unknown'));render(ui());send();
    const recover=await screen.findByRole('button',{name:'查询原任务'});
    const original=vi.mocked(controller.startAgentRun).mock.calls[0]![0];
    vi.mocked(controller.getAgentRunByRequest).mockResolvedValueOnce({...runFrom(proposal),requestId:original.requestId});
    fireEvent.click(recover);await screen.findByText('方案提案 · 尚未应用');
    expect(controller.getAgentRunByRequest).toHaveBeenCalledWith(original.requestId);
    expect(controller.startAgentRun).toHaveBeenCalledOnce();expect(onApply).not.toHaveBeenCalled();
  });
  it('cancels the original running task and ignores a later status response',async()=>{
    vi.useFakeTimers();connected();const running={...runFrom(proposal),state:'running' as const,candidates:[],progress:'正在查找物料'};
    vi.mocked(controller.startAgentRun).mockResolvedValueOnce(running);
    vi.mocked(controller.cancelAgentRun).mockResolvedValueOnce({...running,state:'cancelled'});
    render(ui());send();await act(async()=>{await Promise.resolve();});
    expect(screen.getByText('正在查找物料')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'取消任务'}));
    await act(async()=>{await Promise.resolve();await vi.advanceTimersByTimeAsync(2500);});
    expect(controller.cancelAgentRun).toHaveBeenCalledWith(running.id);
    expect(controller.getAgentRun).not.toHaveBeenCalled();expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByText('方案提案 · 尚未应用')).toBeNull();
  });
  it('offers all six parametric families as editable requests and keeps material/export tools',()=>{
    renderUI(ui());fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));fireEvent.click(screen.getByRole('tab',{name:/模型与交付/}));
    for(const name of ['桌','椅','柜台','地台','背景板','柜体'])expect(screen.getByRole('button',{name})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'桌'}));
    expect((screen.getByRole('textbox',{name:'告诉助手你的想法'}) as HTMLTextAreaElement).value).toContain('1.6 米');
    expect(controller.startAgentRun).not.toHaveBeenCalled();
  });
});

it('honors the server preview decision even when direct application is selected',async()=>{
  connected();vi.mocked(controller.startAgentRun).mockResolvedValueOnce(runFrom(proposal));
  renderUI(ui());fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));
  fireEvent.change(screen.getByRole('textbox',{name:'告诉助手你的想法'}),{target:{value:'有没有更好的布局'}});
  fireEvent.click(screen.getByRole('button',{name:'发送消息'}));
  await screen.findByText('方案提案 · 尚未应用');
  expect(controller.applySceneProposal).not.toHaveBeenCalled();expect(onApply).not.toHaveBeenCalled();
});

it('cancels a dispatch that is acknowledged only after the cancellation was requested',async()=>{
  connected();let acknowledge!:(run:AgentRun)=>void;
  vi.mocked(controller.startAgentRun).mockImplementationOnce(()=>new Promise(resolve=>{acknowledge=resolve;}));
  vi.mocked(controller.getAgentRunByRequest).mockRejectedValueOnce(new Error('任务尚未写入'));
  vi.mocked(controller.cancelAgentRun).mockResolvedValueOnce({...runFrom(proposal),state:'cancelled',candidates:[]});
  renderUI(ui());fireEvent.click(screen.getByRole('button',{name:'打开 Binggo Agent'}));
  fireEvent.change(screen.getByRole('textbox',{name:'告诉助手你的想法'}),{target:{value:'摆放桌子'}});fireEvent.click(screen.getByRole('button',{name:'发送消息'}));
  fireEvent.click(await screen.findByRole('button',{name:'取消任务'}));
  await screen.findByText('原任务结果待核对。查询会继续读取原任务，不会再次提交生成。');
  await act(async()=>acknowledge(runFrom(proposal)));
  expect(controller.cancelAgentRun).toHaveBeenCalledWith(runFrom(proposal).id);
  expect(controller.applySceneProposal).not.toHaveBeenCalled();expect(onApply).not.toHaveBeenCalled();
});
