import { beforeAll,afterAll,describe,it,expect,vi } from 'vitest';
import { WebIO, getBounds } from '@gltf-transform/core';
import { buildParametricGlb, createParametricAsset } from '../supabase/functions/_shared/parametric.ts';
import { parametricParametersSchema } from '../supabase/functions/_shared/parametric-contract.ts';
import { createMaterialVariant, inspectGlbMaterials } from '../supabase/functions/_shared/material-variants.ts';
import { ApiError, sha256 } from '../supabase/functions/_shared/domain.ts';
import { database,owner,editor,outsider,studio,scene } from './fixtures.ts';

const table={family:'table',width:1.8,depth:0.8,height:0.75};
const examples=[
  table,{...table,variant:'round',width:1.2,depth:1.2,legs:'pedestal'},
  {family:'chair',width:0.5,depth:0.5,height:0.85},{family:'chair',variant:'stool',width:0.4,depth:0.4,height:0.45},
  {family:'counter',width:2.4,depth:0.7,height:1.05},{family:'counter',variant:'l',width:2.4,depth:1.8,height:1.05,armDepth:0.6},
  {family:'platform',width:3,depth:2,height:0.3},
  {family:'backdrop',width:3,depth:0.5,height:2.4},
  {family:'cabinet',width:1.2,depth:0.5,height:1.8},{family:'cabinet',variant:'closed',width:1.2,depth:0.5,height:1.8,shelves:3},
];
describe('fixed parameter geometry',()=>{
  it.each(examples)('validates, grounds and exports $family/$variant at requested size',async parameters=>{
    const built=await buildParametricGlb(parameters),doc=await new WebIO().readBinary(built.bytes),bounds=getBounds(doc.getRoot().listScenes()[0]);
    expect(built.size).toEqual({width:parameters.width,depth:parameters.depth,height:parameters.height});
    expect(bounds.min[0]).toBeCloseTo(-parameters.width/2,5);expect(bounds.max[0]).toBeCloseTo(parameters.width/2,5);
    expect(bounds.min[2]).toBeCloseTo(-parameters.depth/2,5);expect(bounds.max[2]).toBeCloseTo(parameters.depth/2,5);
    expect(bounds.min[1]).toBeCloseTo(0,5);expect(bounds.max[1]).toBeCloseTo(parameters.height,5);
    expect(built.metadata.parametric).toMatchObject({family:parameters.family,builderVersion:'1',procurementStatus:'needs_confirmation'});
    expect(built.metadata.triangles).toBeGreaterThan(0);expect(built.metadata.triangles).toBeLessThan(1000);
    const inspection=await inspectGlbMaterials(built.bytes);expect(inspection.slots).toHaveLength(1);expect(inspection.validation.hasUV).toBe(true);
    expect(built.bytes.length).toBeLessThan(100_000);
  });
  it('is byte deterministic and rejects code, inconsistent dimensions and collapsed geometry',async()=>{
    expect(await sha256((await buildParametricGlb(table)).bytes)).toBe(await sha256((await buildParametricGlb({...table})).bytes));
    for(const parameters of [{...table,script:'return mesh'},{...table,variant:'round'},{...table,topThickness:0.8},{...table,legThickness:0.5},{family:'chair',width:0.5,depth:0.5,height:0.4},{family:'counter',variant:'l',width:1,depth:1,height:1,armDepth:1},{family:'backdrop',width:1,depth:0.1,height:1,panelThickness:0.1},{family:'cabinet',width:1,depth:0.5,height:0.1,shelves:8},{...table,width:Infinity}])expect(parametricParametersSchema.safeParse(parameters).success).toBe(false);
  });
});

describe('parametric private immutable assets',()=>{
  let f:Awaited<ReturnType<typeof database>>;
  const files=new Map<string,Uint8Array>(),upload=vi.fn(async(path:string,bytes:Uint8Array)=>{files.set(path,bytes.slice());});
  beforeAll(async()=>{f=await database();f.backend.upload=upload;f.backend.readSourceBytes=async path=>files.get(path)!;},30000);
  afterAll(async()=>{await f?.db.close();});
  const create=(requestId=crypto.randomUUID(),parameters:unknown=table,actor=owner)=>createParametricAsset(f.backend,actor,studio,requestId,parameters);
  it('requires target studio membership before storage; private model only becomes shared through a scene',async()=>{
    const count=upload.mock.calls.length;await expect(create(undefined,table,outsider)).rejects.toThrow('FORBIDDEN');expect(upload.mock.calls.length).toBe(count);
    const result=await create();expect(result.resource).toMatchObject({resourceId:`asset:${result.asset.id}`,assetId:result.asset.id,category:'parametric',size:{width:1.8,depth:0.8,height:0.75}});
    await expect(f.rpc(editor,'assets.get',{assetId:result.asset.id})).rejects.toThrow('ASSET_NOT_FOUND');
    const draft=scene();draft.objects=[{id:crypto.randomUUID(),materialId:'asset',assetId:result.asset.id,position:{x:3,z:3},rotation:0,size:result.resource.size!,color:'#ffffff',locked:false,notes:''}];
    await f.rpc(owner,'projects.create',{studioId:studio,name:'Shared parameters',scene:draft});
    expect((await f.rpc(editor,'assets.get',{assetId:result.asset.id})).id).toBe(result.asset.id);
    await expect(f.rpc(outsider,'assets.get',{assetId:result.asset.id})).rejects.toThrow('ASSET_NOT_FOUND');
  });
  it('replays without another upload, refuses changed replay and preserves older parameter versions',async()=>{
    const requestId=crypto.randomUUID(),first=await create(requestId),count=upload.mock.calls.length,replay=await create(requestId);
    expect(replay.reused).toBe(true);expect(replay.asset.id).toBe(first.asset.id);expect(upload.mock.calls.length).toBe(count);
    await expect(create(requestId,{...table,width:2})).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    const changed=await create(undefined,{...table,width:2});expect(changed.asset.id).not.toBe(first.asset.id);expect(changed.asset.sha256).not.toBe(first.asset.sha256);
    expect((await f.rpc(owner,'assets.get',{assetId:first.asset.id})).sha256).toBe(first.asset.sha256);
    expect((await f.rpc(owner,'assets.get',{assetId:first.asset.id})).metadata.parametric.parameters.width).toBe(1.8);
  });
  it('recovers interrupted upload using the same reserved identity and bytes',async()=>{
    const id=crypto.randomUUID();upload.mockRejectedValueOnce(new ApiError('STORAGE_UPLOAD_FAILED',502));
    await expect(create(id)).rejects.toThrow('STORAGE_UPLOAD_FAILED');const failed=upload.mock.calls.at(-1)!;
    const result=await create(id),retried=upload.mock.calls.at(-1)!;expect(retried[0]).toBe(failed[0]);expect(retried[1]).toEqual(failed[1]);expect(result.reused).toBe(false);
  });
  it('retains parameter provenance through existing immutable material customization',async()=>{
    const original=await create(),variant=await createMaterialVariant(f.backend,owner,original.asset.id,{requestId:crypto.randomUUID(),sourceSha256:original.asset.sha256,materialIndices:[0],baseColor:'#808080'});
    expect(variant.asset.metadata.parametric).toEqual(original.asset.metadata.parametric);
    expect(variant.asset.metadata.parentAssetId).toBe(original.asset.id);
    expect(variant.asset.sha256).not.toBe(original.asset.sha256);
    expect((await f.rpc(owner,'assets.get',{assetId:original.asset.id})).sha256).toBe(original.asset.sha256);
  });
  it('keeps browser roles out of registration and does not add AI budget records',async()=>{
    const result=await f.db.query<{allowed:boolean}>("select has_table_privilege('authenticated','scene_private.parametric_assets','select') or has_table_privilege('anon','scene_private.parametric_assets','insert') or has_function_privilege('authenticated','public.scene_rpc(uuid,text,jsonb)','execute') as allowed");
    expect(result.rows[0].allowed).toBe(false);expect((await f.db.query('select * from scene_private.requests')).rows).toHaveLength(0);
  });
});
