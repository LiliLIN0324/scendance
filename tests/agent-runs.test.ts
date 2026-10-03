import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {database,owner,editor,outsider,studio,session,scene,chair} from './fixtures.ts';
import {createApi} from '../supabase/functions/_shared/api.ts';
import {agentRunRequestSchema,agentRunSchema} from '../supabase/functions/_shared/agent-contract.ts';
import {agentExecutionMode} from '../supabase/functions/_shared/agent-runner.ts';
import {evaluateCandidates} from '../supabase/functions/_shared/jev.ts';
import {canonical,sceneHash,sha256} from '../supabase/functions/_shared/domain.ts';
import {generationCapabilities} from '../supabase/functions/_shared/generation-contract.ts';
import {prepareGenerationRequest} from '../supabase/functions/_shared/generation-input.ts';
const env=(key:string)=>({DEEPSEEK_API_KEY:'fixture',TOKENDANCE_API_KEY:'fixture',HY3_RETIRED:'true'}[key]);
const plan=(x=2)=>({title:`布局 ${x}`,explanation:'已规划桌子，待程序应用。',commands:[{op:'add',materialId:'table',position:{x,z:3},rotation:0,color:'#ffffff'}]});
const tool=(name:string,args:unknown)=>({id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}});
const completion=(calls:ReturnType<typeof tool>[])=>new Response(JSON.stringify({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:calls}}],usage:{total_tokens:10}}));

describe('durable bounded DeepSeek Agent',()=>{
 let f:Awaited<ReturnType<typeof database>>;
 beforeAll(async()=>{f=await database();},30000);afterAll(async()=>{await f.db.close();});
 async function input(extra:Record<string,unknown>={}) {const base=scene(),p=await f.rpc(owner,'projects.create',{studioId:studio,name:'Agent test',scene:base});const lease=await f.rpc(owner,'lease.acquire',{projectId:p.id,sessionId:session});return {projectId:p.id,...agentRunRequestSchema.parse({requestId:crypto.randomUUID(),sessionId:session,generation:lease.generation,expectedRevision:0,localRevision:0,scene:base,selectedIds:[],instruction:'直接添加桌子',executionMode:'direct',...extra})};}
 function send(api:ReturnType<typeof createApi>,i:Awaited<ReturnType<typeof input>>) {const {projectId,...body}=i;return api(new Request(`https://api.test/projects/${projectId}/agent-runs`,{method:'POST',headers:{authorization:`Bearer ${owner}`,'content-type':'application/json'},body:JSON.stringify(body)}));}
 it('runs read tool then submit, stores original draft, replays without calling again, applies one undo group',async()=>{
  const i=await input(),fetcher=vi.fn(async()=>fetcher.mock.calls.length===1?completion([tool('get_scene',{})]):completion([tool('submit_candidates',{candidates:[plan()]})]));
  const api=createApi(f.backend,env,fetcher),res=await send(api,i);expect(res.status).toBe(202);const run=agentRunSchema.parse(await res.json());expect(run).toMatchObject({state:'complete',callCount:2,executionMode:'direct'});expect(run.candidates).toHaveLength(1);
  const replay=await send(api,i);expect(replay.status).toBe(200);expect((await replay.json()).id).toBe(run.id);expect(fetcher).toHaveBeenCalledTimes(2);
  const p=run.candidates[0].proposal;expect(p.base_scene).toEqual(i.scene);
  const applied=await f.rpc(owner,'proposals.apply',{...i,proposalId:p.id,baseHash:await sceneHash(i.scene)});expect(applied.scene.objects).toHaveLength(1);expect(applied.previousScene).toEqual(i.scene);expect(applied.undoGroup).toBe(p.id);
 });
 it('holds 3 independent candidates for JEV and never direct-applies them',async()=>{
  const i=await input({jevEnabled:true}),fetcher=vi.fn(async(url)=>String(url).includes('systemone')?new Response(JSON.stringify({answers:{recommended_plan:{type:'choice',choice:'B',probabilities:{A:0.2,B:0.6,C:0.1,NONE:0.1},confidence:0.7}}})):completion([tool('submit_candidates',{candidates:[plan(2),plan(5),plan(8)]})]));
  const res=await send(createApi(f.backend,env,fetcher),i),run=agentRunSchema.parse(await res.json());expect(run.executionMode).toBe('preview');expect(run.candidates).toHaveLength(3);expect(run.evaluation?.choice).toBe('B');expect(run.candidates.every(c=>c.proposal.base_hash===run.candidates[0].proposal.base_hash)).toBe(true);expect((await f.rpc(owner,'projects.get',{projectId:i.projectId})).scene.objects).toHaveLength(0);
 });
 it('preserves valid partial candidates when the repair call fails',async()=>{
  const i=await input({jevEnabled:true});let n=0;
  const fetcher=vi.fn(async()=>++n===1?completion([tool('submit_candidates',{candidates:[plan(2),plan(5),{bad:true}]})]):new Response('{}',{status:503}));
  const run=agentRunSchema.parse(await (await send(createApi(f.backend,env,fetcher),i)).json());expect(run.state).toBe('complete');expect(run.candidates).toHaveLength(2);expect(run.evaluation?.status).toBe('partial');expect(run.evaluation?.probabilities).toBeUndefined();
 });
 it('does not erase valid candidates if repair produces only invalid candidates',async()=>{
  const i=await input({jevEnabled:true});let n=0;const fetcher=vi.fn(async()=>completion([tool('submit_candidates',{candidates:++n===1?[plan(2),plan(5),{}]:[{}]})]));
  const run=agentRunSchema.parse(await (await send(createApi(f.backend,env,fetcher),i)).json());expect(run.candidates).toHaveLength(2);expect(run.evaluation?.status).toBe('partial');
 });
 it('forces only one candidate with JEV off even when model repeats three',async()=>{
  const i=await input();const fetcher=vi.fn(async()=>completion([tool('submit_candidates',{candidates:[plan(2),plan(5),plan(8)]})]));
  const run=agentRunSchema.parse(await (await send(createApi(f.backend,env,fetcher),i)).json());expect(run.candidates).toHaveLength(1);expect(run.evaluation).toBeNull();expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('supports a server feature flag back to the prior proposal flow without re-enabling HY3',async()=>{
  const i=await input({jevEnabled:true});const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({explanation:'兼容方案',commands:plan().commands})}}],usage:{total_tokens:10}})));
  const run=agentRunSchema.parse(await (await send(createApi(f.backend,key=>key==='DEEPSEEK_AGENT_MODE'?'legacy':env(key),fetcher),i)).json());expect(run.state).toBe('complete');expect(run.executionMode).toBe('preview');expect(run.candidates).toHaveLength(1);expect(run.evaluation?.status).toBe('partial');expect(fetcher).toHaveBeenCalledOnce();
 });
 it('stops after 6 calls and replays a terminal failed request without rerunning',async()=>{
  const i=await input(),fetcher=vi.fn(async()=>completion([tool('get_scene',{})]));const api=createApi(f.backend,env,fetcher);
  const run=agentRunSchema.parse(await (await send(api,i)).json());expect(run).toMatchObject({state:'failed',callCount:6,errorCode:'AGENT_NO_VALID_CANDIDATE'});await send(api,i);expect(fetcher).toHaveBeenCalledTimes(6);
 });
 it('cancellation during model call prevents tool effects and further calls',async()=>{
  const i=await input();const fetcher=vi.fn(async()=>{const run=await f.backend.agent!(owner,'by_request',{projectId:i.projectId,requestId:i.requestId});await f.backend.agent!(owner,'cancel',{projectId:i.projectId,id:run.id});return completion([tool('create_parametric_model',{parameters:{family:'table',width:1,depth:1,height:1}}),tool('submit_candidates',{candidates:[plan()]})]);});
  const run=agentRunSchema.parse(await (await send(createApi(f.backend,env,fetcher),i)).json());expect(run.state).toBe('cancelled');expect(run.candidates).toEqual([]);expect(fetcher).toHaveBeenCalledOnce();
 });
 it('cancel after complete fences application, and other users cannot retrieve the run',async()=>{
  const i=await input(),api=createApi(f.backend,env,async()=>completion([tool('submit_candidates',{candidates:[plan()]})]));const run=agentRunSchema.parse(await (await send(api,i)).json());
  await expect(f.backend.agent!(editor,'get',{projectId:i.projectId,id:run.id})).rejects.toThrow('AGENT_RUN_NOT_FOUND');await expect(f.backend.agent!(outsider,'get',{projectId:i.projectId,id:run.id})).rejects.toThrow();
  await f.backend.agent!(owner,'cancel',{projectId:i.projectId,id:run.id});await expect(f.rpc(owner,'proposals.apply',{...i,proposalId:run.candidates[0].proposal.id,baseHash:await sceneHash(i.scene)})).rejects.toThrow('STALE_PROPOSAL');
 });
 it('records the true lease failure without leaving the run active',async()=>{
  const i=await input();const fetcher=vi.fn(async()=>{await f.rpc(owner,'lease.release',i);return completion([tool('submit_candidates',{candidates:[plan()]})]);});
  const run=agentRunSchema.parse(await (await send(createApi(f.backend,env,fetcher),i)).json());expect(run).toMatchObject({state:'failed',errorCode:'LEASE_LOST'});
 });
 it('rejects unauthorized selection changes and locked objects',async()=>{
  for(const locked of [false,true]){const a={...chair(),locked},b=chair();const i=await input({scene:{...scene(),objects:[a,b]},selectedIds:[a.id]});const target=locked?a:b;const fetcher=vi.fn(async()=>completion([tool('submit_candidates',{candidates:[{title:'x',explanation:'x',commands:[{op:'remove',id:target.id}]}]})]));const run=agentRunSchema.parse(await (await send(createApi(f.backend,env,fetcher),i)).json());expect(run.candidates).toEqual([]);expect(run.state).toBe('failed');}
 });
 it('does not count IDs or color as meaningful candidate differences',async()=>{
  const i=await input({jevEnabled:true});const a=plan(),b=plan();b.commands[0].color='#ff0000';const fetcher=vi.fn(async()=>completion([tool('submit_candidates',{candidates:[a,b]})]));const run=agentRunSchema.parse(await (await send(createApi(f.backend,env,fetcher),i)).json());expect(run.candidates).toHaveLength(1);expect(run.evaluation?.status).toBe('partial');
 });
 it('returns queued immediately for Edge background execution and supports request-key recovery',async()=>{
  const i=await input();const tasks:Promise<unknown>[]=[];const api=createApi(f.backend,env,async()=>completion([tool('submit_candidates',{candidates:[plan()]})]),task=>tasks.push(task));const run=agentRunSchema.parse(await (await send(api,i)).json());expect(run.state).toBe('queued');await Promise.all(tasks);expect((await f.backend.agent!(owner,'by_request',{projectId:i.projectId,requestId:i.requestId})).state).toBe('complete');
 });
 it('unknown expired run becomes terminal and cannot be restarted',async()=>{
  const i=await input();const r=await f.backend.agent!(owner,'create',{projectId:i.projectId,input:i,fingerprint:await sha256(canonical(i)),baseHash:await sceneHash(i.scene),executionMode:'preview'});await f.db.query("update scene_private.agent_runs set deadline=clock_timestamp()-interval '1 second' where id=$1",[r.id]);expect((await f.backend.agent!(owner,'get',{projectId:i.projectId,id:r.id})).state).toBe('failed');expect(await f.backend.agent!(owner,'start',{projectId:i.projectId,id:r.id})).toEqual({claimed:false});
 });
 it('retirement rejects every new HY3 input before assets or provider calls',async()=>{
  expect(generationCapabilities(env)).toMatchObject({textToModel:false,imageToModel:false,texture:false});
  for(const kind of ['text','image','texture'])await expect(prepareGenerationRequest(f.backend,owner,{requestId:crypto.randomUUID(),prompt:'x',kind},env)).rejects.toMatchObject({code:'HY3_RETIRED',status:410});
 });
});
it.each(['不要直接删除桌子','暂时不要直接改','直接说明原因','先给我看一个方案','能否直接添加椅子？'])('does not auto-apply ambiguous or negative intent: %s',instruction=>{expect(agentExecutionMode(agentRunRequestSchema.parse({requestId:crypto.randomUUID(),sessionId:session,generation:1,expectedRevision:0,localRevision:0,scene:scene(),selectedIds:[],instruction,executionMode:'direct'}))).toBe('preview');});
it('validates JEV output instead of inventing probabilities',async()=>{
 const candidates=[2,5,8].map((x,i)=>({label:['A','B','C'][i],title:'x',scene:scene(),explanation:'x',warnings:[]}));
 for(const body of [{answers:{recommended_plan:{type:'choice',choice:'A',probabilities:{A:0.9,B:0.9,C:0.9,NONE:0},confidence:0.9}}},{choices:[]}])expect((await evaluateCandidates(candidates,'test',env,5000,async()=>new Response(JSON.stringify(body)))).status).toBe('unavailable');
});
