'use client';

import { ArrowUp, Box, Check, LayoutTemplate, Loader2, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { buildAgentContext } from '@/lib/assistant-context';
import { useBackendSession, SceneApiError, type BackendSession, type SceneProposal, type AgentRun } from '@/lib/backend-session';
import { listStoredSources, storeSource, deleteSource, suggestSourceKind, readSourceForm, storeSourceForm, registerSourceFlush } from '@/lib/source-storage';
import { canonical } from '../../../../supabase/functions/_shared/domain';
import { useSelection } from '../contexts';
import { backendSceneToLayout, layoutToBackendScene } from '../lib/backend-adapter';
import { briefInstruction, IDEA_CARDS, INITIAL_BRIEF, mergeProposalPresentation, proposalSummary, type CreativeBrief } from '../lib/creative-brief';
import { addDesign, MAX_DESIGNS } from '../lib/scene-layers';
import { ensureGlbAsset } from '../three/glb-assets';
import { proposalDifferences } from '../three/proposal-preview';
import { MaterialCustomization, type MaterialCustomizationSeed } from './material-customization';
import { ReconstructionPanel } from './reconstruction-panel';
import { SceneDeliveryPanel } from './scene-delivery-panel';
import { ScenePresetsPanel } from './scene-presets-panel';
import { VenuePhotosPanel, type VenuePhoto } from './venue-photos-panel';
import { VenueShapePresets } from './venue-shape-presets';
import type { RoomLayout } from '../lib/types';
import './creative-studio.css';

type ReferenceImage = VenuePhoto;
type Message = { id: string; role: 'user' | 'assistant'; text: string; modelSuggestions?: SceneProposal['modelSuggestions']; materialSuggestions?: SceneProposal['materialSuggestions'] };
type RunMarker = { requestId: string; runId?: string; baseKey: string; briefKey: string };
const runStorageKey = (scope: string) => `scendance:agent-run:${scope}`;
type CandidatePreview = { label: 'A' | 'B' | 'C'; title: string; preview: Preview };
type Preview = { assets: { assetUrls: Record<string,string>; assetNames: Record<string,string> }; proposal: SceneProposal; layout: RoomLayout; base: RoomLayout; briefKey: string; scope: string };
interface Props { controller: BackendSession; layout: RoomLayout; onApply(layout: RoomLayout): void; onPreview?: ((layout: RoomLayout | null) => void) | undefined; children: ReactNode }
interface StudioValue {
  scope: string; controller: BackendSession; layout: RoomLayout; onApply(layout: RoomLayout): void; onPreview?: ((layout: RoomLayout | null) => void) | undefined; updateImage(id: string, patch: Partial<VenuePhoto>): void;
  brief: CreativeBrief; setBrief: React.Dispatch<React.SetStateAction<CreativeBrief>>;
  images: ReferenceImage[]; addImages(files: FileList | null): Promise<void>; removeImage(id: string): void;
  busy: boolean; notice: string; connection: string; generate(message?: string): Promise<void>;
  messages: Message[]; expanded: boolean; setExpanded(value: boolean): void; preview: Preview | null; stale: boolean; expired: boolean;
  jevEnabled: boolean; setJevEnabled(value:boolean):void; run: AgentRun | null; candidates: CandidatePreview[]; selectCandidate(label: 'A'|'B'|'C'):void; cancelRun():Promise<void>; recoverRun():Promise<void>; recoverable:boolean;
  directApply: boolean; setDirectApply(value: boolean): void; applyPreview(): Promise<void>; discardPreview(): void;
}
const StudioContext = createContext<StudioValue | null>(null);
function useStudio(): StudioValue { const value=useContext(StudioContext); if(!value) throw new Error('Creative studio unavailable'); return value; }
/** Library consumers can render independently of the creative workspace. */
export function useCreativeBrief(): CreativeBrief | null { return useContext(StudioContext)?.brief ?? null; }
const initialMessages: Message[] = [{ id:'welcome', role:'assistant', text:'我是 Binggo，你的场景策划 Agent，由 DeepSeek 根据当前场景安排物料。告诉我需要增加、移动、旋转、换色、替换或移除哪些物件；选中物件后可针对它们调整。需要新物料时，可从资源库选择，或描述桌、椅、柜台、地台、背景板和柜体的尺寸来建模。' }];

export function CreativeStudioProvider({ controller, layout, onApply, onPreview, children }: Props): JSX.Element {
  const cloud=useBackendSession(controller);
  const { allSelectedIds }=useSelection();
  const [brief,setBrief]=useState<CreativeBrief>(INITIAL_BRIEF);
  const [briefReady,setBriefReady]=useState(false);
  const briefValueRef=useRef(brief);briefValueRef.current=brief;
  const briefHydration=useRef<Promise<void>>(Promise.resolve());
  const [images,setImages]=useState<ReferenceImage[]>([]);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [messages,setMessages]=useState<Message[]>(initialMessages);
  const [lastExplanation,setLastExplanation]=useState('');
  const scope=layout.id??'local';
  const scopeRef=useRef(scope); scopeRef.current=scope;
  const agentScope=`${controller.config.apiUrl}:${cloud.user?.id??'anonymous'}:${scope}`;
  const agentScopeRef=useRef(agentScope);agentScopeRef.current=agentScope;
  useEffect(()=>{setBrief(INITIAL_BRIEF);},[scope]);
  useEffect(()=>{runEpoch.current++;markerRef.current=null;requestPending.current=false;setBusy(false);setMessages(initialMessages);setAcceptedDecisions([]);setLastExplanation('');setPreview(null);setCandidates([]);setRun(null);setRecoverable(false);setNotice('');},[agentScope]);
  useEffect(()=>{let cancelled=false;setBriefReady(false);briefHydration.current=readSourceForm<CreativeBrief>(`${scope}:brief`).then(saved=>{if(!cancelled&&saved){briefValueRef.current={...INITIAL_BRIEF,...saved};setBrief(briefValueRef.current);}}).catch(()=>{}).finally(()=>{if(!cancelled)setBriefReady(true);});return()=>{cancelled=true;};},[scope]);
  useEffect(()=>{if(!briefReady)return;const timer=setTimeout(()=>{void storeSourceForm(`${scope}:brief`,brief).catch(()=>{});},250);return()=>clearTimeout(timer);},[brief,briefReady,scope]);
  const [expanded,setExpanded]=useState(false);
  const [directApply,setDirectApply]=useState(true);
  const [jevEnabled,setJevEnabled]=useState(false);
  const [run,setRun]=useState<AgentRun|null>(null);
  const [candidates,setCandidates]=useState<CandidatePreview[]>([]);
  const [recoverable,setRecoverable]=useState(false);
  const [acceptedDecisions,setAcceptedDecisions]=useState<string[]>([]);
  const runEpoch=useRef(0), recoveredScope=useRef('');
  const markerRef=useRef<RunMarker|null>(null);
  const cancelledRequest=useRef<string|null>(null);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [expired,setExpired]=useState(false);
  const layoutRef=useRef(layout); layoutRef.current=layout;
  const imageRef=useRef(images); imageRef.current=images;
  const alive=useRef(true);
  const requestPending=useRef(false);
  const uploadQueue=useRef<Promise<void>>(Promise.resolve());
  const imageEpoch=useRef(0);
  useEffect(()=>{
    const epoch=++imageEpoch.current;
    uploadQueue.current=listStoredSources(scope).then(stored=>{
      if(!alive.current || epoch!==imageEpoch.current)return;
      const restored=stored.filter(source=>source.blob).map(source=>({...source,url:URL.createObjectURL(source.blob!)}));
      imageRef.current=restored;setImages(restored);
    }).catch(()=>{ /* Saving reports unavailable IndexedDB when files are selected. */ });
    for(const image of imageRef.current) URL.revokeObjectURL(image.url);
    imageRef.current=[];
    setImages([]);
  },[scope]);
  useEffect(()=>{
    if(!cloud.user||cloud.project?.id!==scope)return;
    let cancelled=false;
    void uploadQueue.current.then(async()=>{
      const sources=await controller.listSources();
      const saved=await listStoredSources(scope).catch(()=>[]);
      const missing=sources.filter(source=>!imageRef.current.some(image=>image.assetId===source.assetId));
      const restored=await Promise.all(missing.map(async source=>({...source,kind:saved.find(image=>image.assetId===source.assetId)?.kind??source.kind,id:saved.find(image=>image.assetId===source.assetId)?.id??source.assetId,url:await controller.sourceImageUrl(source.assetId),uploadedKind:source.kind})));
      if(cancelled||scopeRef.current!==scope)return;
      imageRef.current=[...imageRef.current,...restored.filter(source=>!imageRef.current.some(image=>image.assetId===source.assetId))].slice(0,12);setImages(imageRef.current);
    }).catch(error=>{if(!cancelled)setNotice(error instanceof Error?error.message:'云端资料暂时无法恢复，本机资料已保留。');});
    return()=>{cancelled=true;};
  },[controller,cloud.user,cloud.project?.id,scope]);
  useEffect(()=>registerSourceFlush(scope,async()=>{
    await Promise.all([uploadQueue.current,briefHydration.current]);
    if(!alive.current||scopeRef.current!==scope)throw new Error('场地资料正在切换，请稍后重试创建项目。');
    await Promise.all([
      storeSourceForm(`${scope}:brief`,briefValueRef.current),
      ...imageRef.current.map(({url,...image})=>storeSource({...image,scope,kind:image.kind??'photo',width:image.width!,height:image.height!})),
    ]);
  }),[scope]);
  const briefKey=JSON.stringify({brief,images:images.map(i=>({id:i.id,kind:i.kind}))});
  const briefRef=useRef(briefKey); briefRef.current=briefKey;
  const connection=!cloud.configured?'离线引导':!cloud.user?'等待登录':cloud.writeBlocked?'等待项目编辑权':'项目已连接';
  const stale=!!preview && (expired || Date.parse(preview.proposal.expires_at)<=Date.now() || preview.scope!==agentScope || preview.base!==layout || preview.briefKey!==briefKey || cloud.writeBlocked || preview.proposal.project_id!==cloud.project?.id || preview.proposal.base_revision!==cloud.revision || preview.proposal.local_revision!==cloud.localRevision || preview.proposal.session_id!==cloud.sessionId || preview.proposal.generation!==cloud.lease?.generation);
  useEffect(()=>{ alive.current=true; const lifecycleEpoch=imageEpoch; return ()=>{ alive.current=false; lifecycleEpoch.current++; for(const img of imageRef.current) URL.revokeObjectURL(img.url); }; },[]);
  useEffect(()=>{
    setExpired(false);
    if(!preview) return undefined;
    let timeout:ReturnType<typeof setTimeout>;
    const expire=()=>{
      const remaining=Date.parse(preview.proposal.expires_at)-Date.now();
      if(!Number.isFinite(remaining) || remaining<=0) { setExpired(true); return; }
      // Browser timers cap at signed 32-bit milliseconds. Long-lived test or
      // server responses must not accidentally expire on the next tick.
      timeout=setTimeout(expire,Math.min(remaining,2_147_000_000));
    };
    expire();
    return ()=>clearTimeout(timeout);
  },[preview]);
  useEffect(()=>{ onPreview?.(preview&&!stale?preview.layout:null); },[onPreview,preview,stale]);
  useEffect(()=>()=>onPreview?.(null),[onPreview]);
  function say(text:string,modelSuggestions?:SceneProposal['modelSuggestions'],materialSuggestions?:SceneProposal['materialSuggestions']):void { setMessages(items=>[...items.slice(-38),{id:crypto.randomUUID(),role:'assistant',text,modelSuggestions,materialSuggestions}]); }

  async function addImages(files: FileList|null):Promise<void> {
    if(!files?.length) return;
    // Snapshot before the input is cleared. Every selection is processed in
    // order; a second selection no longer invalidates the first decode.
    const batch=Array.from(files);
    const epoch=imageEpoch.current, imageScope=scopeRef.current;
    const active=()=>alive.current&&epoch===imageEpoch.current&&imageScope===scopeRef.current;
    const task=uploadQueue.current.then(async()=>{
      if(!active()) return;
      setNotice('');
      const added:ReferenceImage[]=[];
      try {
        if(batch.length+imageRef.current.length>12) throw new Error('最多添加 12 张图纸或现场照片。');
        for(const file of batch) {
          if(!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 图片。');
          if(file.size>5*1024*1024) throw new Error('每张图片不能超过 5 MB。');
          const bitmap=await createImageBitmap(file);
          const valid=bitmap.width>0&&bitmap.height>0&&bitmap.width<=4096&&bitmap.height<=4096;
          const width=bitmap.width,height=bitmap.height;
          let pixels:Uint8ClampedArray|undefined;
          try { const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64; const context=canvas.getContext('2d');if(context){context.drawImage(bitmap,0,0,64,64);pixels=context.getImageData(0,0,64,64).data;} } catch { /* Filename suggestion still available. */ }
          const kind=suggestSourceKind(file.name,pixels);
          bitmap.close();
          if(!valid) throw new Error('图片长宽请控制在 4096 像素以内。');
          if(!active()) break;
          added.push({id:crypto.randomUUID(),name:file.name,url:URL.createObjectURL(file),width,height,kind,blob:file});
        }
        if(!active()) { for(const img of added) URL.revokeObjectURL(img.url); return; }
        // Update the ref immediately: the following queued batch can start
        // before React commits this state, and must still see the new count.
        imageRef.current=[...imageRef.current,...added];
        setImages(imageRef.current);
        try { await Promise.all(added.map(({url,...image})=>storeSource({...image,scope:imageScope,kind:image.kind??'photo',width:image.width!,height:image.height!}))); } catch(error) { if(active()) setNotice(error instanceof Error?error.message:'本机保存失败，图片仍在本次会话中。'); }
      } catch(error) { for(const img of added) URL.revokeObjectURL(img.url); if(active()) setNotice(error instanceof Error?error.message:'图片无法读取，请更换文件。'); }
    });
    uploadQueue.current=task;
    return task;
  }
  function removeImage(id:string):void {
    const image=imageRef.current.find(value=>value.id===id);if(!image)return;
    const requestedScope=scopeRef.current;
    const remove=()=>{if(scopeRef.current!==requestedScope)return;URL.revokeObjectURL(image.url);imageRef.current=imageRef.current.filter(value=>value.id!==id);setImages(imageRef.current);void deleteSource(id).catch(error=>setNotice(error instanceof Error?error.message:'删除本机记录失败。'));};
    if(image.assetId){void controller.removeSource(image.assetId).then(remove).catch(error=>setNotice(error instanceof Error?error.message:'项目资料移除失败，请重试。'));}else remove();
  }
  function updateImage(id:string,patch:Partial<VenuePhoto>):void {
    imageRef.current=imageRef.current.map(image=>image.id===id?{...image,...patch}:image);setImages(imageRef.current);
    const updated=imageRef.current.find(image=>image.id===id);
    if(updated){const {url,...stored}=updated;void storeSource({...stored,scope,kind:stored.kind??'photo',width:stored.width!,height:stored.height!}).catch(error=>setNotice(error instanceof Error?error.message:'资料保存失败。'));}
  }
  function forgetRun():void {
    markerRef.current=null;setRecoverable(false);
    try { localStorage.removeItem(runStorageKey(agentScopeRef.current)); } catch { /* A leftover marker can only trigger a status read. */ }
  }
  function rememberRun(marker:RunMarker,scope:string):void {
    // Saving the identity before POST prevents accidental duplicate paid runs after disconnects.
    localStorage.setItem(runStorageKey(scope),JSON.stringify(marker));
    markerRef.current=marker;
  }
  async function consumeRun(result:AgentRun,base:RoomLayout,submittedBrief:string,submittedScope:string,allowDirect:boolean,epoch:number):Promise<void> {
    if(result.state==='cancelled'){setCandidates([]);setPreview(null);forgetRun();say('任务已取消，当前方案保持不变。');return;}
    if(!result.candidates.length){forgetRun();say(result.message || (result.state==='failed'?`任务未完成（${result.errorCode??'UNKNOWN'}），原方案已保留。`:'已读取当前场景，本次没有修改物件。'));return;}
    if(layoutRef.current!==base || briefRef.current!==submittedBrief) throw new Error('生成期间方案或需求已变化，旧提案未应用。请根据最新内容重新生成。');
    const scene=layoutToBackendScene(base), first=result.candidates[0]!.proposal;
    if(result.candidates.some(({proposal})=>canonical(proposal.base_scene)!==canonical(scene)||proposal.project_id!==first.project_id||proposal.base_revision!==first.base_revision||proposal.local_revision!==first.local_revision||proposal.session_id!==first.session_id||proposal.generation!==first.generation))throw new Error('返回的候选方案基线不一致，原方案已保留。');
    if(result.candidates.some(({proposal})=>!Number.isFinite(Date.parse(proposal.expires_at))||Date.parse(proposal.expires_at)<=Date.now()))throw new Error('提案已过期，请重新生成。');
    setLastExplanation(first.explanation);
    if(result.candidates.length===1&&canonical(first.candidate)===canonical(scene)){
      forgetRun();say(first.explanation||result.message||'已读取当前场景，本次没有修改物件。',first.modelSuggestions,first.materialSuggestions);return;
    }
    const prepared=await Promise.all(result.candidates.map(async item=>{
      const assets=await controller.authorizeAssets(item.proposal.candidate);
      await Promise.all(Object.entries(assets.assetUrls).map(([id,url])=>ensureGlbAsset(id,url)));
      const next=mergeProposalPresentation(base,backendSceneToLayout(item.proposal.candidate,{projectId:base.id!,name:base.name,...assets}));
      return {label:item.label,title:item.title,preview:{proposal:item.proposal,assets,layout:next,base,briefKey:submittedBrief,scope:submittedScope}};
    }));
    if(!alive.current||agentScopeRef.current!==submittedScope||epoch!==runEpoch.current)return;
    if(layoutRef.current!==base||briefRef.current!==submittedBrief)throw new Error('生成期间方案或需求已变化，旧提案未应用。请根据最新内容重新生成。');
    const preferred=prepared.find(item=>item.label===result.evaluation?.choice)??prepared[0]!;
    if(allowDirect&&result.executionMode==='direct'&&!result.jevEnabled&&prepared.length===1){await applyCandidate(preferred.preview);}
    else {setCandidates(prepared);setPreview(preferred.preview);say(result.jevEnabled?'候选方案已准备好。可以分别预览比较，最终由你选择并确认应用。':first.explanation||'方案提案已返回，请核对修改范围后确认应用。',first.modelSuggestions,first.materialSuggestions);}
  }
  async function followRun(initial:AgentRun,base:RoomLayout,submittedBrief:string,submittedScope:string,epoch:number,allowDirect:boolean):Promise<void> {
    let result=initial;
    const pollingDeadline=Date.now()+120_000;
    const active=()=>alive.current&&agentScopeRef.current===submittedScope&&epoch===runEpoch.current;
    while(active()){
      setRun(result);
      const marker=markerRef.current;
      if(marker){try{rememberRun({...marker,runId:result.id},submittedScope);}catch{setNotice('任务已提交，但本机记录更新失败；请保持页面打开。');}}
      if(!['queued','running'].includes(result.state))break;
      if(Date.now()>=pollingDeadline)throw new Error('任务仍在处理，已暂停自动查询。请稍后查询原任务，不要重复提交。');
      await new Promise(resolve=>setTimeout(resolve,2000));
      if(!active())return;
      result=await controller.getAgentRun(result.id);
    }
    if(active())await consumeRun(result,base,submittedBrief,submittedScope,allowDirect,epoch);
  }
  async function recoverRun():Promise<void> {
    if(requestPending.current)return;
    const scope=agentScopeRef.current,base=layoutRef.current,submittedBrief=briefRef.current;
    const marker=markerRef.current;
    if(!marker)return;
    const epoch=++runEpoch.current;requestPending.current=true;setBusy(true);setRecoverable(false);setNotice('');
    try {
      const result=marker.runId?await controller.getAgentRun(marker.runId):await controller.getAgentRunByRequest(marker.requestId);
      if(marker.baseKey!==canonical(layoutToBackendScene(base))||marker.briefKey!==submittedBrief){
        if(epoch!==runEpoch.current||scope!==agentScopeRef.current)return;
        setRun(result);setNotice('已查询原任务；场景或需求已变化，旧候选不会应用。');
        if(!['queued','running'].includes(result.state))forgetRun();else setRecoverable(true);
        return;
      }
      await followRun(result,base,submittedBrief,scope,epoch,false);
    } catch(error){if(epoch===runEpoch.current&&scope===agentScopeRef.current){setRecoverable(true);setNotice(error instanceof Error?error.message:'原任务状态暂不可读取，请稍后查询。');}}
    finally{if(epoch===runEpoch.current){requestPending.current=false;setBusy(false);}}
  }
  useEffect(()=>{
    if(!cloud.user||cloud.project?.id!==scope||recoveredScope.current===agentScope)return;
    recoveredScope.current=agentScope;
    try{
      const raw=localStorage.getItem(runStorageKey(agentScope));
      if(!raw)return;
      const marker=JSON.parse(raw) as RunMarker;
      if(typeof marker.requestId!=='string'||typeof marker.baseKey!=='string'||typeof marker.briefKey!=='string'||(marker.runId!==undefined&&typeof marker.runId!=='string'))throw new Error('任务记录无法读取，请保留此页面记录并联系管理员核对。');
      markerRef.current=marker;setRecoverable(true);if(briefReady)void recoverRun();else recoveredScope.current='';
    }catch(error){setRecoverable(true);setNotice(error instanceof Error?error.message:'任务记录无法读取。');}
    // Recovery runs once after this project's brief has loaded. Changes do not launch another paid run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[agentScope,briefReady,cloud.user,cloud.project?.id,scope]);
  async function cancelRun():Promise<void> {
    const scope=agentScopeRef.current,marker=markerRef.current;
    if(!marker)return;
    cancelledRequest.current=marker.requestId;
    const epoch=++runEpoch.current;requestPending.current=true;setBusy(true);setPreview(null);setCandidates([]);
    try{
      const original=marker.runId?{id:marker.runId}:await controller.getAgentRunByRequest(marker.requestId);
      const result=await controller.cancelAgentRun(original.id);
      if(scope!==agentScopeRef.current||epoch!==runEpoch.current)return;
      setRun(result);forgetRun();say('任务已取消，当前方案保持不变。');
    }catch(error){if(scope===agentScopeRef.current&&epoch===runEpoch.current){setRecoverable(true);setNotice(error instanceof Error?error.message:'取消结果待核对，请查询原任务。');}}
    finally{if(epoch===runEpoch.current){requestPending.current=false;setBusy(false);}}
  }
  async function generate(message?:string):Promise<void> {
    if(requestPending.current||recoverable)return;
    setExpanded(true);setNotice('');
    if(message?.trim())setMessages(items=>[...items.slice(-38),{id:crypto.randomUUID(),role:'user',text:message.trim()}]);
    if(!cloud.configured||!cloud.user||cloud.writeBlocked||cloud.project?.id!==layout.id){
      const text=!cloud.configured?'需求入口已经准备好。当前尚未连接 AI 服务，暂时不能生成真实方案。你可以完善需求、添加现场照片，并使用物料库手动布置。':!cloud.user?'请先登录工作室，再为当前方案创建云项目并获取编辑权。':'请在“账户与项目”中打开或创建当前方案，并获取编辑权；你的本地草稿会保留。';
      setNotice(text);say(text);return;
    }
    const base=layoutRef.current,submittedBrief=briefRef.current,submittedScope=agentScopeRef.current,epoch=++runEpoch.current;
    let dispatched=false;
    try{
      const scene=layoutToBackendScene(base),context=buildAgentContext({briefInstruction:message&&!brief.description.trim()?'':briefInstruction(brief,base.width,base.height),message:message?.trim()||'请按上述需求生成布置方案。',confirmedMaterialDecisions:acceptedDecisions,recentMessages:message?messages.filter(item=>item.id!=='welcome'):[],lastProposalExplanation:message?lastExplanation:''});
      if(context.omittedHistory)say(`已省略 ${context.omittedHistory} 条较早或过长的背景对话；当前需求完整保留。`);
      if(!message)setMessages(items=>[...items.slice(-38),{id:crypto.randomUUID(),role:'user',text:`生成${brief.event}方案：${brief.description.trim()}`}]);
      const marker:RunMarker={requestId:crypto.randomUUID(),baseKey:canonical(scene),briefKey:submittedBrief};
      try{rememberRun(marker,submittedScope);}catch{throw new Error('无法保存任务编号，尚未提交。请恢复浏览器本机存储后重试。');}
      requestPending.current=true;setBusy(true);setPreview(null);setCandidates([]);setRun(null);dispatched=true;
      const result=await controller.startAgentRun({requestId:marker.requestId,instruction:context.instruction,context:context.context,scene,selectedIds:[...allSelectedIds].filter(id=>scene.objects.some(object=>object.id===id)),jevEnabled,executionMode:directApply?'direct':'preview'});
      if(cancelledRequest.current===marker.requestId){
        if(agentScopeRef.current===submittedScope){
          const cancelled=await controller.cancelAgentRun(result.id);
          if(alive.current&&agentScopeRef.current===submittedScope&&markerRef.current?.requestId===marker.requestId){setRun(cancelled);forgetRun();setBusy(false);requestPending.current=false;say('任务已取消，当前方案保持不变。');}
        }
        return;
      }
      await followRun(result,base,submittedBrief,submittedScope,epoch,directApply);
    }catch(error){if(alive.current&&agentScopeRef.current===submittedScope&&epoch===runEpoch.current){
      const text=controller.getSnapshot().error?.message??(error instanceof Error?error.message:'生成失败，原方案已保留。');setNotice(text);say(text);
      if(dispatched){
        if(error instanceof SceneApiError&&([400,401,403,404,409,422].includes(error.status)||['SERVICE_NOT_CONFIGURED','BILLING_NOT_CONFIGURED','AI_INPUT_TOO_LARGE'].includes(error.code)))forgetRun();
        else setRecoverable(true);
      }
    }}finally{if(epoch===runEpoch.current){requestPending.current=false;if(alive.current)setBusy(false);}}
  }
  async function applyCandidate(selected:Preview):Promise<void> {
    if(agentScopeRef.current!==selected.scope)return;
    if ((selected.base.designBook?.variants.length ?? 0) >= MAX_DESIGNS) throw new Error('请先在图层面板移除不再需要的方案，再确认提案。');
    const result=await controller.applySceneProposal(selected.proposal,layoutToBackendScene(layoutRef.current));
    if(!alive.current || agentScopeRef.current!==selected.scope)return;
    if(!result.acceptedLocally || layoutRef.current!==selected.base) throw new Error('应用期间本地有新修改，已保留本地草稿。云端已有新版本，请核对后重新打开。');
    const next=mergeProposalPresentation(selected.base,backendSceneToLayout(result.scene,{projectId:selected.base.id!,name:selected.base.name,...selected.assets}));
    onApply(addDesign(selected.base,next));setPreview(null);setCandidates([]);forgetRun();
    setAcceptedDecisions(items=>[...items,`已应用方案：${selected.proposal.explanation}`.slice(0,1000)].slice(-20));
    if(selected.proposal.warnings.length) setNotice(selected.proposal.warnings.map(warning=>{
      const names=warning.ids.map(id=>next.floors.flatMap(floor=>floor.items).find(item=>item.id===id)?.name??'物件');
      return `${warning.code==='OVERLAP'?'物件重叠':warning.code==='OUT_OF_BOUNDS'?'超出场地边界':'待检查事项'}：${names.join('、')}`;
    }).join('；'));
    say(`${selected.proposal.explanation}\n提案已应用。你可以继续调整，或用撤销返回应用前的本地方案。`,selected.proposal.modelSuggestions,selected.proposal.materialSuggestions);
  }
  async function applyPreview():Promise<void> {
    if(!preview || requestPending.current || busy || stale) return;
    if(Date.parse(preview.proposal.expires_at)<=Date.now()) { setExpired(true); return; }
    const selected=preview,epoch=++runEpoch.current;
    requestPending.current=true;setBusy(true);setNotice('');
    try { await applyCandidate(selected); }
    catch(error) { if(alive.current && agentScopeRef.current===selected.scope)setNotice(error instanceof Error?error.message:'应用失败，原方案已保留。'); }
    finally { if(epoch===runEpoch.current){requestPending.current=false;if(alive.current)setBusy(false);} }
  }
  const value:StudioValue={scope:agentScope,controller,layout,onApply,onPreview,updateImage,brief,setBrief,images,addImages,removeImage,busy,notice,connection,generate,messages,expanded,setExpanded,preview,stale,expired,directApply,setDirectApply,jevEnabled,setJevEnabled,run,candidates,recoverable,recoverRun,cancelRun,selectCandidate:label=>{const item=candidates.find(value=>value.label===label);if(item&&!stale)setPreview(item.preview);},applyPreview,discardPreview:()=>{setPreview(null);setCandidates([]);forgetRun();}};
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function CreativeBriefPanel({ showNotice=true }: { showNotice?: boolean }):JSX.Element {
  const studio=useStudio();
  const update=(patch:Partial<CreativeBrief>)=>studio.setBrief(current=>({...current,...patch}));
  // One idea at a time, swapped on demand: three stacked articles were mostly noise.
  const [ideaIndex,setIdeaIndex]=useState(0);
  const idea=IDEA_CARDS[ideaIndex%IDEA_CARDS.length];
  return <div className="cr-brief">
    <div className="sc-section-heading"><div><h2>活动需求</h2></div></div>
    <label className="cr-label">活动类型<select value={studio.brief.event} onChange={e=>update({event:e.target.value})}>{['品牌快闪','露营派对','工作坊','小型黑客松','展览市集','婚礼聚会','其他活动'].map(label=><option key={label}>{label}</option>)}</select></label>
    <fieldset className="cr-floorplan-choice"><legend>平面图</legend><div role="radiogroup" aria-label="是否有平面图">
      <label><input type="radio" name="floorplan-choice" checked={studio.brief.hasFloorplan!==false} onChange={()=>update({hasFloorplan:true})}/>有平面图，上传资料</label>
      <label><input type="radio" name="floorplan-choice" checked={studio.brief.hasFloorplan===false} onChange={()=>update({hasFloorplan:false})}/>没有平面图，选择场地形状</label>
    </div></fieldset>
    {studio.brief.hasFloorplan===false ? <VenueShapePresets layout={studio.layout} onApply={studio.onApply}/> : <VenuePhotosPanel images={studio.images} addImages={studio.addImages} removeImage={studio.removeImage} onKindChange={(id,kind)=>studio.updateImage(id,{kind})}/>}
    {studio.brief.hasFloorplan===false && studio.images.length>0 && <p className="cr-hint">已上传的资料仍保留；生成时会使用这些资料。切回“有平面图”可查看或删除。</p>}
    <label className="cr-label">客户需求<textarea aria-label="客户需求" maxLength={1800} rows={5} placeholder="描述活动目标、分区与来宾体验……" value={studio.brief.description} onChange={e=>update({description:e.target.value})}/></label>
    <details className="cr-optional"><summary>风格、配色与氛围（可选）</summary>
    <label className="cr-label">风格要求 <span>选填</span><input aria-label="风格要求" maxLength={120} placeholder="自然露营、简约现代、复古市集……" value={studio.brief.style??''} onChange={e=>update({style:e.target.value})}/></label>
    <label className="cr-label">配色要求 <span>选填</span><input aria-label="配色要求" maxLength={120} placeholder="米白与橄榄绿，少量暖橙点缀" value={studio.brief.palette??''} onChange={e=>update({palette:e.target.value})}/></label>
    <label className="cr-label">氛围要求 <span>选填</span><input aria-label="氛围要求" maxLength={120} placeholder="温暖的夜场、明亮交流、安静观展……" value={studio.brief.atmosphere??''} onChange={e=>update({atmosphere:e.target.value})}/></label>
    </details>
    <label className="cr-label">预计人数<input type="number" min={1} max={40} value={studio.brief.guests||''} onChange={e=>update({guests:e.target.valueAsNumber||0})}/></label>
    <label className="cr-label">已确认的现场条件 <span>选填</span><textarea aria-label="已确认的现场条件" maxLength={500} rows={3} placeholder="例如：北侧中间是入口，东侧有两根固定柱；入口前保留通道。请填写你确认的信息。" value={studio.brief.venueConditions??''} onChange={e=>update({venueConditions:e.target.value})}/></label>
    <p className="cr-hint">要求会随方案请求提交。添加图纸或照片后，可结合实测尺寸重建空间；未确认的结构会先请你核对。</p>
    <label className="cr-label">一定要有 <span>选填</span><input maxLength={350} placeholder="帐篷、签到区、无障碍通道……" value={studio.brief.mustHave} onChange={e=>update({mustHave:e.target.value})}/></label>
    <ReconstructionPanel controller={studio.controller} layout={studio.layout} onApply={studio.onApply} onPreview={studio.onPreview} images={studio.images} updateImage={studio.updateImage} brief={studio.brief}/>
    <label className="cr-check"><input type="checkbox" checked={studio.brief.allowIdeas} onChange={e=>update({allowIdeas:e.target.checked})}/><span><strong>也给我一些意料之外的灵感</strong><small>可以提出建议，由你确认是否采用</small></span></label>
    <button className="cr-generate" type="button" disabled={studio.busy||studio.recoverable||!studio.brief.description.trim()} onClick={()=>void studio.generate()}>{studio.busy?<Loader2 className="cr-spin" size={18}/>:<Sparkles size={18}/>}<span>{studio.busy?'正在整理方案…':studio.jevEnabled?'生成三个方案':studio.directApply?'生成布置方案':'生成布置预览'}</span></button>
    <p className="cr-hint">DeepSeek 读取当前场景和资源库，可按尺寸创建桌、椅、柜台、地台、背景板和柜体。本轮策划不读取照片；图纸重建仍在上方单独确认。</p>

    {showNotice&&studio.notice&&<p className="cr-notice" role="status">{studio.notice}</p>}
    <div className="cr-ideas"><div><h3>布置思路</h3><button type="button" aria-label="换一条布置思路" onClick={()=>setIdeaIndex(current=>(current+1)%IDEA_CARDS.length)}><RefreshCw size={13}/></button></div><article><strong>{idea.title}</strong><p>{idea.text}</p></article></div>
  </div>;
}

function AssistantMascot({ busy }: { busy: boolean }): JSX.Element {
  // A transparent user-provided character; only the element moves, never the launcher.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`cr-mascot ${busy ? 'is-thinking' : ''}`} src="/assets/assistant/puppy.png" alt="Binggo 小狗" draggable={false} width={60} height={60}/>;
}

export type GeneratedVariant = { sourceAssetId: string; variantAssetId: string; objectIds?: string[] };
export type GenerationContext = { sourceAssetId?: string; sourceObjectIds: string[]; onVariantReady(variant: GeneratedVariant): void };
export function CreativeAssistant({ generationPanel }: { generationPanel?: ReactNode | ((context: GenerationContext) => ReactNode) }):JSX.Element {
  const studio=useStudio(); const {selectedItem,allSelectedIds}=useSelection();
  const [draft,setDraft]=useState(''); const feed=useRef<HTMLDivElement>(null);
  const [tab,setTab]=useState<'plan'|'model'|'templates'>('plan');
  const [opened,setOpened]=useState(false);
  const [modelOpened,setModelOpened]=useState(false);
  const [modelTool,setModelTool]=useState<'generate'|'customize'|'delivery'>('generate');
  const [materialSeed,setMaterialSeed]=useState<MaterialCustomizationSeed>();
  useEffect(()=>{if(studio.expanded)setOpened(true);},[studio.expanded]);
  const messageInput=useRef<HTMLTextAreaElement>(null);
  const launcher=useRef<HTMLButtonElement>(null);
  const wasExpanded=useRef(false);
  useEffect(()=>{setDraft('');setMaterialSeed(undefined);setModelTool('generate');setTab('plan');},[studio.scope]);
  useEffect(()=>{
    if(studio.expanded && tab==='plan') messageInput.current?.focus();
    else if(!studio.expanded&&wasExpanded.current) launcher.current?.focus();
    wasExpanded.current=studio.expanded;
  },[studio.expanded,tab]);
  useEffect(()=>{feed.current?.scrollTo({top:feed.current.scrollHeight,behavior:'smooth'});},[studio.messages,studio.busy,studio.expanded]);
  const sceneItems=studio.layout.floors.flatMap(floor=>floor.items);
  const selectedItems=sceneItems.filter(item=>allSelectedIds.has(item.id));
  const selectedCount=selectedItems.length;
  const sourceAssetId=selectedItems.length&&selectedItems.every(item=>item.assetId&&item.assetId===selectedItems[0]!.assetId&&!item.locked)?selectedItems[0]!.assetId:undefined;
  function previewMaterial(input: Omit<MaterialCustomizationSeed,'id'|'scope'|'userId'|'projectId'|'apiUrl'>):void {
    const cloud=studio.controller.getSnapshot();
    if(!cloud.user||!cloud.project||cloud.project.id!==studio.layout.id)return;
    setMaterialSeed({...input,id:crypto.randomUUID(),scope:studio.scope,userId:cloud.user.id,projectId:cloud.project.id,apiUrl:studio.controller.config.apiUrl});
    setModelTool('customize');setModelOpened(true);setTab('model');
  }
  const generationContext:GenerationContext={...(sourceAssetId?{sourceAssetId}:{}),sourceObjectIds:sourceAssetId?selectedItems.map(item=>item.id):[],onVariantReady:variant=>previewMaterial({...variant,objectIds:variant.objectIds??[],name:'纹理新版本',reason:'核对纹理与原模型后，仅替换指定物件。',materialScope:'all_materials'})};
  function applyMaterial(next:RoomLayout):void {
    const changed=next.floors.flatMap(floor=>floor.items).filter(item=>item.assetId&&sceneItems.some(previous=>previous.id===item.id&&previous.assetId!==item.assetId));
    studio.onApply(next);
    if(changed.length&&changed.every(item=>item.assetId===changed[0]!.assetId))previewMaterial({sourceAssetId:changed[0]!.assetId!,objectIds:changed.map(item=>item.id),name:'已更新的物料',reason:'可继续调整或预览恢复父版本。',materialScope:'all_materials'});
    else setMaterialSeed(undefined);
  }
  const submit=()=>{if(!draft.trim()||studio.busy||studio.recoverable)return;const text=draft;setDraft('');void studio.generate(text);};
  const summary=studio.preview?proposalSummary(studio.preview.base,studio.preview.layout):null;
  const differences=studio.preview?proposalDifferences(studio.preview.base,studio.preview.layout):[];
  return <div className={`cr-assistant ${studio.expanded?'is-open':''} ${selectedItem?'has-properties':''}`}>
    {(opened||studio.expanded)&&<section hidden={!studio.expanded} id="creative-assistant" className="cr-chat" aria-label="Agent" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();studio.setExpanded(false);}}}>
      <header><span className="cr-avatar"><AssistantMascot busy={studio.busy}/></span><div><strong>Binggo · Agent</strong><small><i/>{studio.connection}</small></div><button type="button" aria-label="收起 Agent" onClick={()=>studio.setExpanded(false)}><X size={18}/></button></header>
      <div className="cr-agent-tabs" role="tablist" aria-label="Agent 能力">
        {([['plan','场景策划','DeepSeek'],['model','模型与交付','DeepSeek'],['templates','场景模板','完整场景']] as const).map(([key,label,provider])=><button type="button" role="tab" id={`agent-tab-${key}`} aria-controls={`agent-panel-${key}`} aria-selected={tab===key} key={key} onClick={()=>{setTab(key);if(key==='model')setModelOpened(true);}}>{key==='plan'?<Sparkles size={17}/>:key==='model'?<Box size={17}/>:<LayoutTemplate size={17}/>}<span>{label}<small>{provider}</small></span></button>)}
      </div>
      <div className="cr-plan-panel" role="tabpanel" id="agent-panel-plan" aria-labelledby="agent-tab-plan" hidden={tab!=='plan'}>
      <div className="cr-agent-mode"><label><input type="checkbox" checked={studio.directApply} disabled={studio.busy||studio.jevEnabled} onChange={event=>studio.setDirectApply(event.target.checked)}/>明确指令直接应用</label><span>{studio.directApply?'明确调整通过校验后应用，可撤销':'先预览，再确认应用'}</span></div>
      <div className="cr-agent-mode"><label><input type="checkbox" checked={studio.jevEnabled} disabled={studio.busy} onChange={event=>studio.setJevEnabled(event.target.checked)}/>JEV 决策模式</label><span>生成 3 个方案，由你最终选择</span></div>
      <div className="cr-chat-feed" ref={feed}>
        <details className="cr-agent-brief"><summary>活动需求与场地资料</summary><CreativeBriefPanel showNotice={false}/></details>
        <p className="cr-selection-context">当前场景：{sceneItems.length} 件物料 · 已选中 {selectedCount} 件{selectedItem?` · ${selectedItem.name}`:''}</p>
        <div aria-live="polite">{studio.messages.map(m=><div key={m.id} className={`cr-message is-${m.role}`}><span>{m.role==='assistant'?'Binggo':'你'}</span><p>{m.text}</p>{m.modelSuggestions?.map((suggestion,index)=><article className="cr-model-suggestion" key={`${m.id}-${index}`}><strong>{suggestion.name}</strong><p>{suggestion.reason}</p><p>{suggestion.prompt}</p><small>可继续描述尺寸，让 DeepSeek 查找资源或使用参数化建模；不支持的造型会明确说明。</small></article>)}{m.materialSuggestions?.map((suggestion,index)=><article className="cr-model-suggestion" key={`${m.id}-material-${index}`}><strong>{suggestion.name}</strong><p>{suggestion.reason}</p><button type="button" onClick={()=>{const {scope:materialScope,...input}=suggestion;previewMaterial({...input,materialScope});}}>预览材质调整</button><small>仅调整指定的 {suggestion.objectIds.length} 件物料；原版本保留，确认后应用。</small></article>)}</div>)}
        {studio.busy&&<div className="cr-chat-working"><Loader2 className="cr-spin" size={15}/><span>{studio.run?.progress||'正在提交任务…'}</span>{(!studio.run||['queued','running'].includes(studio.run.state))&&<button type="button" onClick={()=>void studio.cancelRun()}>取消任务</button>}</div>}
        {studio.recoverable&&<div className="cr-proposal"><p>原任务结果待核对。查询会继续读取原任务，不会再次提交生成。</p><button type="button" disabled={studio.busy} onClick={()=>void studio.recoverRun()}>查询原任务</button><button type="button" disabled={studio.busy} onClick={()=>void studio.cancelRun()}>取消原任务</button></div>}
        {studio.candidates.length>0&&studio.run?.jevEnabled&&<div className="cr-candidates" aria-label="JEV 方案比较">
          <p>{studio.run.evaluation?.message||'可分别预览候选方案。'}</p>
          {studio.run.evaluation?.status==='complete'&&<p>模型推荐概率表示本轮方案间的相对偏好，不是真实成功率。{studio.run.evaluation.confidence!==undefined?`评价信心 ${(studio.run.evaluation.confidence*100).toFixed(0)}%。`:''}</p>}
          <div>{studio.candidates.map(item=><button type="button" key={item.label} aria-pressed={studio.preview===item.preview} disabled={studio.busy||studio.stale} onClick={()=>studio.selectCandidate(item.label)}><strong>方案 {item.label} · {item.title}</strong>{studio.run?.evaluation?.status==='complete'&&studio.run.evaluation.probabilities&&<span>模型推荐概率 {(studio.run.evaluation.probabilities[item.label]*100).toFixed(1)}%</span>}</button>)}</div>
          {studio.run.evaluation?.status==='complete'&&studio.run.evaluation.probabilities&&<p>均不推荐：{(studio.run.evaluation.probabilities.NONE*100).toFixed(1)}%{studio.run.evaluation.choice==='NONE'?' · 建议调整需求后重试。':''}</p>}
        </div>}
        {studio.preview&&summary&&<div className="cr-proposal"><span>方案提案 · 尚未应用</span><strong>新增 {summary.added} · 移除 {summary.removed} · 共 {summary.total} 件</strong><p>{studio.preview.proposal.explanation}</p>{studio.preview.proposal.warnings.length>0&&<div role="status"><p>提案包含 {studio.preview.proposal.warnings.length} 项场地检查提示：</p><ul>{studio.preview.proposal.warnings.map((warning,index)=>{const names=warning.ids.map(id=>studio.preview!.layout.floors.flatMap(floor=>floor.items).find(item=>item.id===id)?.name??'物件');return <li key={`${warning.code}-${index}`}>{warning.code==='OVERLAP'?'物件重叠':warning.code==='OUT_OF_BOUNDS'?'超出场地边界':'待检查事项'}：{names.join('、')}</li>;})}</ul></div>}<ul>{differences.map(change=><li key={change.id}>{({added:'新增',removed:'移除',changed:'调整'} as const)[change.kind]} · {change.after?.item.name ?? change.before?.item.name}<small>{change.after ? ` · ${change.after.item.width} × ${change.after.item.depth} m` : ''}</small></li>)}</ul><p>画布中的半透明模型是候选方案。绿色框为新增，蓝色框为改动，橙色框为原位置，红色框为移除；确认前不会保存。</p>{studio.stale?<p role="status">{studio.expired?'提案已过期，请重新生成。':'场景、需求或编辑权已变化，请重新生成。'}</p>:<div><button type="button" onClick={()=>void studio.applyPreview()} disabled={studio.busy}><Check size={14}/>确认应用</button><button type="button" onClick={studio.discardPreview} disabled={studio.busy}><Trash2 size={14}/>放弃</button></div>}</div>}
        </div>
      </div>
      {studio.notice&&<p className="cr-agent-notice" role="status">{studio.notice}</p>}
      <form className="cr-chat-composer" onSubmit={e=>{e.preventDefault();submit();}}><label className="sr-only" htmlFor="creative-message">告诉助手你的想法</label><textarea ref={messageInput} id="creative-message" value={draft} maxLength={1800} onChange={e=>setDraft(e.target.value)} placeholder="告诉我想怎么调整……" rows={2} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit();}}}/><button aria-label="发送消息" type="submit" disabled={!draft.trim()||studio.busy||studio.recoverable}><ArrowUp size={19}/></button></form>
      <footer><span>{studio.jevEnabled?'比较方案后由你确认应用':studio.directApply?'明确调整通过校验后应用，模糊需求先预览':'确认提案后修改当前场景'} · 登录请使用顶部账户与项目</span></footer>
      </div>
      <div className="cr-model-panel" role="tabpanel" id="agent-panel-model" aria-labelledby="agent-tab-model" hidden={tab!=='model'}>
        <nav className="cr-model-tools" aria-label="3D 内容工具">{([['generate','物料建模'],['customize','材质调整'],['delivery','场景交付']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={modelTool===key} onClick={()=>setModelTool(key)}>{label}</button>)}</nav>
        <div hidden={modelTool!=='generate'}><p className="sc-note">选择物料类型，在场景策划中填写尺寸与样式。DeepSeek 会创建独立模型，原资产保持不变。</p><div className="cr-parametric-families">{[['桌','生成一张长 1.6 米、宽 0.8 米、高 0.75 米的矩形桌，先给预览'],['椅','生成一把有靠背的椅子，座面宽 0.5 米，先给预览'],['柜台','生成一个长 2 米、深 0.6 米、高 1 米的直柜台，先给预览'],['地台','生成一个长 3 米、宽 2 米、高 0.3 米的矩形地台，先给预览'],['背景板','生成一块宽 3 米、高 2.4 米并带底座的背景板，先给预览'],['柜体','生成一个宽 1.2 米、深 0.4 米、高 1.8 米的开放柜体，分 4 层，先给预览']].map(([label,prompt])=><button type="button" key={label} onClick={()=>{setDraft(prompt!);setTab('plan');}}>{label}</button>)}</div>{modelOpened&&((typeof generationPanel==='function'?generationPanel(generationContext):generationPanel)??<p className="sc-note">登录并打开云项目后可查看历史模型。</p>)}</div>
        {modelOpened&&<div hidden={modelTool!=='customize'}>{materialSeed?.scope===studio.scope&&<button type="button" className="sc-button" onClick={()=>setMaterialSeed(undefined)}>使用当前选中物件</button>}<MaterialCustomization controller={studio.controller} layout={studio.layout} onApply={applyMaterial} seed={materialSeed?.scope===studio.scope?materialSeed:undefined} active={studio.expanded&&tab==='model'&&modelTool==='customize'}/></div>}
        {modelTool==='delivery'&&<SceneDeliveryPanel layout={studio.layout} controller={studio.controller}/>}
      </div>
      <div className="cr-model-panel" role="tabpanel" id="agent-panel-templates" aria-labelledby="agent-tab-templates" hidden={tab!=='templates'}>
        {tab==='templates'&&<ScenePresetsPanel layout={studio.layout} onApply={studio.onApply}/>}
      </div>
    </section>}
    <button ref={launcher} aria-controls="creative-assistant" className="cr-assistant-launcher" type="button" onClick={()=>studio.setExpanded(!studio.expanded)} aria-expanded={studio.expanded} aria-label={studio.expanded?'关闭 Binggo Agent':'打开 Binggo Agent'}><span><AssistantMascot busy={studio.busy}/></span>{studio.expanded?'收起 Binggo':'Binggo · Agent'}<i/></button>
  </div>;
}
