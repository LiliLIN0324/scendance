import { z } from 'zod';
import { agentRunRequestSchema } from './agent-contract.ts';
import { agentExecutionMode, executeAgentRun } from './agent-runner.ts';
import { parametricAssetRequestSchema } from './parametric-contract.ts';
import { createParametricAsset } from './parametric.ts';
import { canApplyStructuralChange, structuralViolations, dimensionConflicts } from './structural-geometry.ts';
import { reconstructionRequestSchema } from './reconstruction-contract.ts';
import { ImageUtils } from '@gltf-transform/core';
import { ApiError, canonical, catalog, leaseSchema, proposalRequestSchema, randomToken, sceneHash, sceneSchema, sceneWarnings, sha256, uuid } from './domain.ts';
import { assetRecord, importPublicModel, recommendations } from './assets.ts';
import { generateProposal } from './providers.ts';
import { readSceneResources } from './scene-resources.ts';
import { prepareGenerationRequest } from './generation-input.ts';
import { generationCapabilities } from './generation-contract.ts';
import { createMaterialVariant, prepareMaterialVariant, readAssetMaterials } from './material-variants.ts';
import { readBounded, required, reserveCost, type Env, type Fetcher } from './http.ts';
import type { Backend } from './backend.ts';

const name=z.string().trim().min(1).max(120);
const displayName=z.string().trim().min(1).max(80);
const projectBody=(body:unknown,id:string)=>({...z.record(z.string(),z.unknown()).parse(body),projectId:uuid.parse(id)});
const savedScene=z.strictObject({...leaseSchema.shape,scene:sceneSchema});
export function createApi(backend:Backend,env:Env,fetcher:Fetcher=fetch,waitUntil?:(task:Promise<unknown>)=>void) {
  return async(request:Request):Promise<Response>=>{
    const origin=request.headers.get('origin');
    const allowed=(env('ALLOWED_ORIGINS')??'http://localhost:3000').split(',').map(s=>s.trim());
    const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    if(origin && allowed.includes(origin)) headers.set('Access-Control-Allow-Origin',origin);
    const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
    try {
      if(origin && !allowed.includes(origin)) throw new ApiError('ORIGIN_FORBIDDEN',403);
      if(request.method==='OPTIONS') {
        headers.set('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
        headers.set('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info');
        return new Response(null,{status:204,headers});
      }
      const url=new URL(request.url);
      const path=url.pathname.replace(/^\/functions\/v1\/scene-api/,'').replace(/^\/scene-api/,'').replace(/\/$/,'')||'/';
      const method=request.method;
      const json=async()=>{
        if(!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError('JSON_REQUIRED',415);
        try {return JSON.parse(new TextDecoder().decode(await readBounded(request,256_000))) as unknown;}
        catch(e) {if(e instanceof ApiError) throw e; throw new ApiError('INVALID_JSON');}
      };
      if(path==='/health' && method==='GET') return respond({ok:true,schemaVersion:1,supportedSchemaVersions:[1,2]});
      if(path==='/share/read' && method==='POST') {
        const input=z.strictObject({token:z.string().regex(/^[a-f0-9]{64}$/)}).parse(await json());
        const tokenHash=await sha256(input.token);
        const shared=await backend.scene(null,'share.read',{tokenHash});
        shared.assets=await Promise.all(shared.assets.map(async(asset:{storagePath:string;[key:string]:unknown})=>{
          const {storagePath,...metadata}=asset; return {...metadata,url:await backend.sign(storagePath),expiresIn:300};
        }));
        // Recheck after signing, so revocation during a slow storage request also blocks the response.
        await backend.scene(null,'share.read',{tokenHash});
        return respond(shared);
      }
      const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
      if(!token) throw new ApiError('UNAUTHENTICATED',401);
      const actor=await backend.user(token);
      if(['/assets/import','/assets/floorplan','/assets/sources','/catalog/recommendations'].includes(path) && !(await backend.scene(actor,'studios')).length) throw new ApiError('FORBIDDEN',403);
      if(path==='/studios' && method==='GET') return respond(await backend.scene(actor,'studios'));
      if(path==='/studios' && method==='POST') {
        const input=z.strictObject({requestId:uuid,name,displayName}).parse(await json());
        return respond(await backend.scene(actor,'studios.create',input),201);
      }
      const studio=path.match(/^\/studios\/([^/]+)(\/projects)?$/);
      if(studio) {
        const studioId=uuid.parse(studio[1]);
        if(studio[2] && method==='GET') return respond(await backend.scene(actor,'studios.projects.list',{studioId}));
        if(!studio[2] && method==='PATCH') {
          const input=z.strictObject({name}).parse(await json());
          return respond(await backend.scene(actor,'studios.rename',{...input,studioId}));
        }
        if(!studio[2] && method==='DELETE') return respond(await backend.scene(actor,'studios.delete',{studioId}));
      }
      const members=path.match(/^\/studios\/([^/]+)\/members(?:\/([^/]+))?$/);
      if(members) {
        const studioId=uuid.parse(members[1]);
        if(!members[2] && method==='GET') return respond(await backend.scene(actor,'studios.members.list',{studioId}));
        if(members[2]) {
          const userId=uuid.parse(members[2]);
          if(method==='PUT') {
            const input=z.strictObject({displayName}).parse(await json());
            return respond(await backend.scene(actor,'studios.members.put',{...input,studioId,userId}));
          }
          if(method==='DELETE') return respond(await backend.scene(actor,'studios.members.remove',{studioId,userId}));
        }
      }
      if(path==='/catalog' && method==='GET') return respond(catalog);
      if(path==='/projects' && method==='GET') return respond(await backend.scene(actor,'projects.list'));
      if(path==='/projects' && method==='POST') {
        const input=z.strictObject({studioId:uuid,name,scene:sceneSchema}).parse(await json());
        if(dimensionConflicts(input.scene).length)throw new ApiError('DIMENSION_CONFLICT',422,dimensionConflicts(input.scene));
        if(input.scene.schemaVersion===2&&structuralViolations(input.scene).length)throw new ApiError('STRUCTURAL_COLLISION',422,structuralViolations(input.scene));
        return respond(await backend.scene(actor,'projects.create',input),201);
      }
      const project=path.match(/^\/projects\/([^/]+)(.*)$/);
      if(project) {
        const projectId=uuid.parse(project[1]), tail=project[2];
        if(tail==='/agent-runs'&&method==='POST') {
          if(!backend.agent)throw new ApiError('SERVICE_NOT_CONFIGURED',503);
          const input=agentRunRequestSchema.parse(await json());
          if(input.selectedIds.some(id=>!input.scene.objects.some(object=>object.id===id)))throw new ApiError('INVALID_SELECTION',422);
          required(env,'DEEPSEEK_API_KEY');
          const stored=await backend.agent(actor,'create',{projectId,input,fingerprint:await sha256(canonical(input)),baseHash:await sceneHash(input.scene),executionMode:env('DEEPSEEK_AGENT_MODE')==='legacy'?'preview':agentExecutionMode(input)});
          if(!stored.reused){
            const task=executeAgentRun(backend,actor,projectId,stored.id,env,fetcher).catch(()=>{});
            if(waitUntil)waitUntil(task);else await task;
          }
          return respond(waitUntil?stored:await backend.agent(actor,'get',{projectId,id:stored.id}),stored.reused?200:202);
        }
        const agentRun=tail.match(/^\/agent-runs\/(by-request\/)?([^/]+)(\/cancel)?$/);
        if(agentRun&&backend.agent) {
          if(agentRun[1]&&method==='GET'&&!agentRun[3])return respond(await backend.agent(actor,'by_request',{projectId,requestId:uuid.parse(agentRun[2])}));
          if(!agentRun[1]&&((method==='GET'&&!agentRun[3])||(method==='POST'&&agentRun[3])))return respond(await backend.agent(actor,agentRun[3]?'cancel':'get',{projectId,id:uuid.parse(agentRun[2])}));
        }
        if(tail==='/material-variants' && method==='POST') {
          const {reused,...proposal}=await prepareMaterialVariant(backend,actor,projectId,await json());
          return respond(proposal,reused?200:201);
        }
        if(!tail && method==='GET') return respond(await backend.scene(actor,'projects.get',{projectId}));
        if(!tail && method==='DELETE') {
          const input=z.strictObject({expectedRevision:z.number().int().nonnegative()}).parse(await json());
          return respond(await backend.scene(actor,'projects.delete',{...input,projectId}));
        }
        if(!tail && method==='PATCH') {
          const input=z.strictObject({...leaseSchema.shape,name}).parse(await json());
          return respond(await backend.scene(actor,'projects.rename',{...input,projectId}));
        }
        const source=tail.match(/^\/sources\/([^/]+)$/);
        if(source&&method==='DELETE')return respond(await backend.scene(actor,'sources.unlink',{projectId,assetId:uuid.parse(source[1])}));
        if(tail==='/sources'&&method==='GET')return respond(await backend.scene(actor,'sources.list',{projectId}));
        if(tail==='/reconstructions'&&method==='POST'){
          const input=reconstructionRequestSchema.parse(await json());
          if(input.sources.some((s,i)=>input.sources.findIndex(x=>x.assetId===s.assetId)!==i))throw new ApiError('DUPLICATE_SOURCE',422);
          if(input.selectedIds.some(id=>!input.scene.objects.some(o=>o.id===id)))throw new ApiError('INVALID_SELECTION',422);
          required(env,'DEEPSEEK_API_KEY');
          const reserveCents=reserveCost(env,'RECONSTRUCTION_MAX_REQUEST_CENTS');
          if(reserveCents<200)throw new ApiError('BILLING_NOT_CONFIGURED',503,{setting:'RECONSTRUCTION_MAX_REQUEST_CENTS',minimum:200});
          await backend.scene(actor,'lease.check',{...input,projectId});
          if(input.reviewedJobId)await backend.reconstruction(actor,'review.check',{input:{...input,projectId},baseHash:await sceneHash(input.scene)});
          const stored=await backend.reconstruction(actor,'create',{input:{...input,projectId},fingerprint:await sha256(canonical({...input,projectId})),baseHash:await sceneHash(input.scene),reserveCents});
          return respond(stored,stored.reused?200:202);
        }
        const reconstruction=tail.match(/^\/reconstructions\/([^/]+)$/);
        if(reconstruction&&method==='GET')return respond(await backend.reconstruction(actor,'get',{projectId,id:uuid.parse(reconstruction[1])}));
        if(tail==='/materials' && method==='GET') return respond((await backend.scene(actor,'projects.get',{projectId})).materials);
        if(tail==='/lease/acquire' && method==='POST') {
          const input=z.strictObject({sessionId:uuid}).parse(await json());
          return respond(await backend.scene(actor,'lease.acquire',{...input,projectId}));
        }
        if(['/lease/renew','/lease/release'].includes(tail) && method==='POST') {
          const input=leaseSchema.omit({expectedRevision:true}).parse(await json());
          return respond(await backend.scene(actor,tail==='/lease/renew'?'lease.renew':'lease.release',{...input,projectId}));
        }
        if(tail==='/scene' && method==='PUT') {
          const input=savedScene.parse(await json());
          if(dimensionConflicts(input.scene).length)throw new ApiError('DIMENSION_CONFLICT',422,dimensionConflicts(input.scene));
          const previous=await backend.scene(actor,'lease.check',{...input,projectId});
          if(!canApplyStructuralChange(sceneSchema.parse(previous.scene),input.scene))throw new ApiError('STRUCTURAL_COLLISION',422,structuralViolations(input.scene));
          return respond({...await backend.scene(actor,'scene.save',{...input,projectId}),warnings:sceneWarnings(input.scene)});
        }
        if(tail==='/proposals' && method==='POST') {
          const input=proposalRequestSchema.parse(projectBody(await json(),projectId));
          if(input.selectedIds.some(id=>!input.scene.objects.some(o=>o.id===id))) throw new ApiError('INVALID_SELECTION',422);
          await backend.scene(actor,'lease.check',input);
          required(env,'DEEPSEEK_API_KEY');
          const reserveCents=reserveCost(env,'AI_MAX_REQUEST_CENTS');
          if(reserveCents<40) throw new ApiError('BILLING_NOT_CONFIGURED',503);
          const reservation=await backend.jobs(actor,'reserve',{requestId:input.requestId,fingerprint:await sha256(canonical(input)),reserveCents});
          if(reservation.reused) {
            if(reservation.state==='complete') return respond(reservation.result);
            throw new ApiError(reservation.state==='reserved'?'AI_IN_PROGRESS':'AI_PREVIOUS_REQUEST_FAILED',409,{requestId:input.requestId});
          }
          try {
            const resources=await readSceneResources(backend,actor,input.scene);
            const proposal=await generateProposal(input,env,attempt=>backend.jobs(actor,'text.reserve_call',{id:reservation.id,attempt}),fetcher,resources);
            const stored=await backend.scene(actor,'proposals.store',{
              ...input,id:reservation.id,baseHash:await sceneHash(input.scene),candidate:proposal.scene,explanation:proposal.explanation,warnings:proposal.warnings,
            });
            const result={...stored,modelSuggestions:proposal.modelSuggestions,materialSuggestions:proposal.materialSuggestions};
            await backend.jobs(actor,'requests.finish',{id:reservation.id,state:'complete',result,usage:proposal.usage});
            return respond(result,201);
          } catch(error) {
            await backend.jobs(actor,'requests.finish',{id:reservation.id,state:'failed',result:null,usage:error instanceof ApiError?error.details??{}:{}}).catch(()=>{});
            throw error;
          }
        }
        if(tail==='/proposals/apply' && method==='POST') {
          const input=z.strictObject({...leaseSchema.shape,proposalId:uuid,localRevision:z.number().int().nonnegative(),currentScene:sceneSchema}).parse(await json());
          const proposal=await backend.scene(actor,'proposals.get',{projectId,proposalId:input.proposalId});
          if(dimensionConflicts(proposal.candidate).length)throw new ApiError('DIMENSION_CONFLICT',422,dimensionConflicts(proposal.candidate));
          if(!canApplyStructuralChange(input.currentScene,sceneSchema.parse(proposal.candidate)))throw new ApiError('STRUCTURAL_COLLISION',422,structuralViolations(proposal.candidate));
          return respond(await backend.scene(actor,'proposals.apply',{...input,projectId,baseHash:await sceneHash(input.currentScene)}));
        }
        if(tail==='/history/restore'&&method==='POST'){
          const input=z.strictObject({...leaseSchema.shape,proposalId:uuid,currentScene:sceneSchema}).parse(await json());
          const previous=await backend.scene(actor,'proposals.get',{projectId,proposalId:input.proposalId});
          if(await sceneHash(input.currentScene)!==await sceneHash(previous.candidate))throw new ApiError('STALE_HISTORY_RESTORE',409);
          const restored=await backend.scene(actor,'history.restore',{...input,projectId});
          return respond({...restored,warnings:sceneWarnings(sceneSchema.parse(restored.scene))});
        }
        if(tail==='/publish' && method==='POST') {
          const input=z.strictObject({expectedRevision:z.number().int().nonnegative()}).parse(await json());
          const base=required(env,'PUBLIC_APP_URL');
          const shareToken=randomToken();
          const result=await backend.scene(actor,'publish',{...input,projectId,tokenHash:await sha256(shareToken)});
          return respond({...result,url:`${base.replace(/\/$/,'')}/view/#${shareToken}`,token:shareToken},201);
        }
        if(tail==='/shares' && method==='GET') return respond(await backend.scene(actor,'shares.list',{projectId}));
        const share=tail.match(/^\/shares\/([^/]+)$/);
        if(share && method==='DELETE') return respond(await backend.scene(actor,'shares.revoke',{projectId,shareId:uuid.parse(share[1])}));
      }
      if(path==='/assets/parametric'&&method==='POST') {
        const input=parametricAssetRequestSchema.parse(await json());
        const result=await createParametricAsset(backend,actor,input.studioId,input.requestId,input.parameters);
        return respond(result,result.reused?200:201);
      }
      if(path==='/assets' && method==='GET') return respond(await backend.scene(actor,'assets.list'));
      const materialAsset=path.match(/^\/assets\/([^/]+)\/(materials|customize)$/);
      if(materialAsset) {
        const assetId=uuid.parse(materialAsset[1]);
        if(materialAsset[2]==='materials' && method==='GET')return respond(await readAssetMaterials(backend,actor,assetId));
        if(materialAsset[2]==='customize' && method==='POST') {
          const result=await createMaterialVariant(backend,actor,assetId,await json());
          return respond(result.asset,result.reused?200:201);
        }
      }
      const asset=path.match(/^\/assets\/([^/]+)\/url$/);
      if(asset && method==='POST') {
        const a=await backend.scene(actor,'assets.get',{assetId:uuid.parse(asset[1])});
        const {storage_path,...metadata}=a;
        return respond({...metadata,url:await backend.sign(storage_path),expiresIn:300});
      }
      if(path==='/catalog/recommendations' && method==='POST') {
        const input=z.strictObject({theme:z.string().max(500),scene:sceneSchema}).parse(await json());
        return respond(await recommendations(input.theme,input.scene,fetcher));
      }
      if(path==='/assets/import' && method==='POST') {
        const {modelId}=z.strictObject({modelId:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)}).parse(await json());
        const {bytes,...properties}=await importPublicModel(modelId,fetcher);
        const record=await assetRecord(actor,bytes,properties);
        await backend.upload(record.storagePath,bytes,'model/gltf-binary');
        return respond(await backend.scene(actor,'assets.register',record),201);
      }
      if(path==='/assets/sources'&&method==='POST'){
        if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))throw new ApiError('MULTIPART_REQUIRED',415);
        const bytes=await readBounded(request,5*1024*1024+65536);
        const form=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')!},body:new Uint8Array(bytes)}).formData();
        const projectId=uuid.parse(form.get('projectId')),kind=z.enum(['floorplan','photo']).parse(form.get('kind')),file=form.get('file');
        const existing=await backend.scene(actor,'sources.list',{projectId});
        if(!(file instanceof File)||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new ApiError('UNSUPPORTED_IMAGE',415);
        if(file.size>5*1024*1024)throw new ApiError('FILE_TOO_LARGE',413);
        const image=new Uint8Array(await file.arrayBuffer());let size:ReturnType<typeof ImageUtils.getSize>;
        try{if(ImageUtils.getMimeType(image)!==file.type)throw new ApiError('INVALID_IMAGE',422);size=ImageUtils.getSize(image,file.type);}catch{throw new ApiError('INVALID_IMAGE',422);}
        if(!size||size.some(n=>n<=0||n>4096))throw new ApiError('INVALID_IMAGE',422);
        const record=await assetRecord(actor,image,{name:file.name.slice(0,120)||'来源图片',source:'upload',format:file.type.slice(6),metadata:{width:size[0],height:size[1],kind},license:{type:'user-upload'}});
        const duplicate=await backend.scene(actor,'sources.find',{projectId,kind,sha256:record.sha256});
        if(duplicate)return respond(duplicate);
        if(existing.length>=12)throw new ApiError('SOURCE_LIMIT_EXCEEDED',422);
        await backend.upload(record.storagePath,image,file.type);
        return respond(await backend.scene(actor,'sources.register',{projectId,kind,asset:record}),201);
      }
      if(path==='/assets/floorplan' && method==='POST') {
        const mime=request.headers.get('content-type');
        if(mime!=='image/png' && mime!=='image/jpeg') throw new ApiError('UNSUPPORTED_IMAGE',415);
        const bytes=await readBounded(request,5*1024*1024);
        const size=ImageUtils.getSize(bytes,mime);
        if(!size || size.some(n=>n<=0||n>4096)) throw new ApiError('INVALID_IMAGE',422);
        const record=await assetRecord(actor,bytes,{name:'场地平面图',source:'upload',format:mime==='image/png'?'png':'jpeg',metadata:{width:size[0],height:size[1]},license:{type:'user-upload'}});
        await backend.upload(record.storagePath,bytes,mime);
        return respond(await backend.scene(actor,'assets.register',record),201);
      }
      if(path==='/generation/capabilities' && method==='GET') return respond(generationCapabilities(env));
      if(path==='/jobs' && method==='POST') {
        const input=await prepareGenerationRequest(backend,actor,await json(),env);
        const result=await backend.jobs(actor,'jobs.create',{...input,reserveCents:reserveCost(env,'GENERATION_MAX_TASK_CENTS')});
        const {worker_token,worker_until,...safe}=result;
        return respond(safe,result.reused?200:202);
      }
      if(path==='/jobs' && method==='GET') return respond(await backend.jobs(actor,'jobs.list'));
      const job=path.match(/^\/jobs\/([^/]+)(\/added)?$/);
      if(job && !job[2] && method==='GET') return respond(await backend.jobs(actor,'jobs.get',{id:uuid.parse(job[1])}));
      if(job && job[2] && method==='POST') {
        const input=z.strictObject({projectId:uuid}).parse(await json());
        return respond(await backend.jobs(actor,'jobs.added',{...input,id:uuid.parse(job[1])}));
      }
      throw new ApiError('ROUTE_NOT_FOUND',404);
    } catch(error) {
      if(error instanceof z.ZodError) return respond({error:{code:'VALIDATION_ERROR',details:error.issues.map(i=>({path:i.path,message:i.message}))}},400);
      if(error instanceof ApiError) return respond({error:{code:error.code,details:error.details}},error.status);
      // Do not return SDK exceptions, signed URLs, prompts, tokens, or upstream response bodies.
      return respond({error:{code:'INTERNAL_ERROR'}},500);
    }
  };
}
