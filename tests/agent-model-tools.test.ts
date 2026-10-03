import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {createApi} from '../supabase/functions/_shared/api.ts';
import {agentRunRequestSchema,agentRunSchema} from '../supabase/functions/_shared/agent-contract.ts';
import {createParametricAsset} from '../supabase/functions/_shared/parametric.ts';
import {sceneHash,type Scene} from '../supabase/functions/_shared/domain.ts';
import {database,owner,studio,session,scene,chair} from './fixtures.ts';

const env=(key:string)=>key==='DEEPSEEK_API_KEY'?'fixture':undefined;
const tool=(name:string,args:unknown)=>({id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}});
const completion=(calls:ReturnType<typeof tool>[])=>new Response(JSON.stringify({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:calls}}],usage:{total_tokens:10}}));
const toolResources=(init?:RequestInit):string[]=>JSON.parse(String(init?.body)).messages.filter((m:{role:string})=>m.role==='tool').flatMap((m:{content:string})=>JSON.parse(m.content).items?.map((row:string[])=>row[0])??[]);
const candidate=(commands:unknown[])=>({title:'检查材质与尺寸',explanation:'只更改指定实例，等待应用。',commands});

describe('Agent model tools preserve instance boundaries and meaningful alternatives',()=>{
  let f:Awaited<ReturnType<typeof database>>,source:Awaited<ReturnType<typeof createParametricAsset>>;
  const files=new Map<string,Uint8Array>();let afterUpload:(()=>Promise<void>)|undefined;
  beforeAll(async()=>{
    f=await database();f.backend.upload=async(path,bytes)=>{files.set(path,bytes.slice());await afterUpload?.();};f.backend.readSourceBytes=async path=>files.get(path)!;
    source=await createParametricAsset(f.backend,owner,studio,crypto.randomUUID(),{family:'table',width:1.2,depth:0.7,height:0.75});
  },30000);
  afterAll(async()=>{await f.db.close();});
  async function input(draft=scene(),extra:Record<string,unknown>={}) {
    const p=await f.rpc(owner,'projects.create',{studioId:studio,name:'Model tools',scene:draft}),lease=await f.rpc(owner,'lease.acquire',{projectId:p.id,sessionId:session});
    return {projectId:p.id,...agentRunRequestSchema.parse({requestId:crypto.randomUUID(),sessionId:session,generation:lease.generation,expectedRevision:0,localRevision:4,scene:draft,selectedIds:[],instruction:'直接修改选中实例',executionMode:'direct',...extra})};
  }
  async function send(i:Awaited<ReturnType<typeof input>>,fetcher:typeof fetch) {
    const {projectId,...body}=i,response=await createApi(f.backend,env,fetcher)(new Request(`https://api.test/projects/${projectId}/agent-runs`,{method:'POST',headers:{authorization:`Bearer ${owner}`,'content-type':'application/json'},body:JSON.stringify(body)}));
    expect(response.status).toBe(202);return agentRunSchema.parse(await response.json());
  }
  function scaledInstances():Scene {
    return {...scene(),objects:[
      {...chair(),materialId:'asset',assetId:source.asset.id,size:{width:0.8,depth:0.5,height:0.6},position:{x:2,z:2}},
      {...chair('保留备注'),materialId:'asset',assetId:source.asset.id,size:{width:2,depth:1.1,height:0.95},position:{x:7,z:6},rotation:0.4,color:'#abcdef'},
    ]};
  }
  it('applies a material variant without changing selected scaled dimensions, color, placement or other instances',async()=>{
    const draft=scaledInstances(),target=draft.objects[1],i=await input(draft,{selectedIds:[target.id]});
    const fetcher=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
      if(fetcher.mock.calls.length===1)return completion([tool('customize_material',{resourceId:source.asset.id,objectIds:[target.id],materialIndices:[0],changes:{baseColor:'#808080'}})]);
      return completion([tool('submit_candidates',{candidates:[candidate([{op:'replace_resource',id:target.id,resourceId:toolResources(init)[0],size:{width:4,depth:4,height:2}}])]})]);
    });
    const run=await send(i,fetcher);expect(run.state).toBe('complete');expect(run.candidates).toHaveLength(1);
    const proposal=run.candidates[0].proposal,result=proposal.candidate.objects[1];expect(result.assetId).not.toBe(target.assetId);expect(result).toEqual({...target,assetId:result.assetId});expect(proposal.candidate.objects[0]).toEqual(draft.objects[0]);
    expect((await f.rpc(owner,'projects.get',{projectId:i.projectId})).scene).toEqual(draft);
    const applied=await f.rpc(owner,'proposals.apply',{...i,proposalId:proposal.id,baseHash:await sceneHash(draft)});expect(applied.scene).toEqual(proposal.candidate);expect(applied.previousScene).toEqual(draft);
    expect((await f.rpc(owner,'assets.get',{assetId:source.asset.id})).sha256).toBe(source.asset.sha256);
  });
  it.each(['other-instance','add-instance'])('refuses to use a targeted material variant for %s with no global selection restriction',async misuse=>{
    const draft=scaledInstances(),target=draft.objects[1],i=await input(draft);
    const fetcher=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
      if(fetcher.mock.calls.length===1)return completion([tool('customize_material',{resourceId:source.resource.resourceId,objectIds:[target.id],materialIndices:[0],changes:{roughness:0.2}})]);
      const resourceId=toolResources(init)[0],command=misuse==='other-instance'?{op:'replace_resource',id:draft.objects[0].id,resourceId}:{op:'add_resource',resourceId,position:{x:5,z:3},rotation:0};
      return completion([tool('submit_candidates',{candidates:[candidate([command])]})]);
    });
    const run=await send(i,fetcher);expect(run.state).toBe('failed');expect(run.candidates).toEqual([]);expect((await f.rpc(owner,'projects.get',{projectId:i.projectId})).scene).toEqual(draft);
  });
  it('counts three differently colored copies of one parametric shape as only one option',async()=>{
    const i=await input(scene(),{jevEnabled:true});let ids:string[]=[];
    const fetcher=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
      expect(String(url)).toContain('api.deepseek.com');
      if(fetcher.mock.calls.length===1)return completion(['#ff0000','#00ff00','#0000ff'].map(color=>tool('create_parametric_model',{parameters:{family:'table',width:1.2,depth:0.7,height:0.75,color}})));
      ids=toolResources(init).slice(0,3);return completion([tool('submit_candidates',{candidates:ids.map(resourceId=>candidate([{op:'add_resource',resourceId,position:{x:3,z:3},rotation:0}]))})]);
    });
    const run=await send(i,fetcher);expect(new Set(ids).size).toBe(3);expect(run.state).toBe('complete');expect(run.candidates).toHaveLength(1);expect(run.evaluation?.status).toBe('partial');expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('does not count color-only material asset IDs as different plans',async()=>{
    const draft=scaledInstances(),target=draft.objects[1],i=await input(draft,{jevEnabled:true});let ids:string[]=[];
    const fetcher=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
      expect(String(url)).toContain('api.deepseek.com');
      if(fetcher.mock.calls.length===1)return completion(['#ff0000','#00ff00','#0000ff'].map(baseColor=>tool('customize_material',{resourceId:source.resource.resourceId,objectIds:[target.id],materialIndices:[0],changes:{baseColor}})));
      ids=toolResources(init).slice(0,3);return completion([tool('submit_candidates',{candidates:ids.map(resourceId=>candidate([{op:'replace_resource',resourceId,id:target.id}]))})]);
    });
    const run=await send(i,fetcher);expect(new Set(ids).size).toBe(3);expect(run.candidates).toHaveLength(1);expect(run.evaluation?.status).toBe('partial');
  });
  it('stops later model creation tools after cancellation and never exposes an applicable partial result',async()=>{
    const i=await input(),before=(await f.rpc(owner,'assets.list')).length;
    afterUpload=async()=>{const run=await f.backend.agent!(owner,'by_request',{projectId:i.projectId,requestId:i.requestId});await f.backend.agent!(owner,'cancel',{projectId:i.projectId,id:run.id});};
    const fetcher=vi.fn(async()=>completion([tool('create_parametric_model',{parameters:{family:'platform',width:1,depth:1,height:0.2}}),tool('create_parametric_model',{parameters:{family:'platform',width:2,depth:2,height:0.2}})]));
    let run;try {run=await send(i,fetcher);}finally {afterUpload=undefined;}
    expect(run).toMatchObject({state:'cancelled',executionMode:'preview',candidates:[]});expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await f.rpc(owner,'assets.list')).length).toBe(before+1);expect((await f.rpc(owner,'projects.get',{projectId:i.projectId})).scene).toEqual(i.scene);
    const restarted=await send({...i,requestId:crypto.randomUUID()},async()=>completion([tool('submit_candidates',{candidates:[candidate([])]})]));expect(restarted.state).toBe('complete');expect(restarted.id).not.toBe(run!.id);
  });
});
