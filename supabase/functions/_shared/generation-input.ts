import { ApiError, sha256 } from './domain.ts';
import type { Backend } from './backend.ts';
import { required, type Env } from './http.ts';
import { generationCapabilities, generationRequestSchema, type GenerationProvider } from './generation-contract.ts';
import { requireTextureSource } from './generation-quality.ts';

export async function prepareGenerationRequest(backend:Backend,actor:string,raw:unknown,env:Env) {
  if(env('HY3_RETIRED')==='true')throw new ApiError('HY3_RETIRED',410);
  const input=generationRequestSchema.parse(raw),capabilities=generationCapabilities(env);
  required(env,'HUNYUAN_API_KEY');required(env,'HUNYUAN_TERMS_REVIEWED_AT');required(env,'HUNYUAN_TERMS_URL');
  if(!(input.kind==='text'?capabilities.textToModel:input.kind==='image'?capabilities.imageToModel:capabilities.texture))throw new ApiError('SERVICE_NOT_CONFIGURED',503,{setting:input.kind==='texture'?'HUNYUAN_TEXTURE_ENABLED':'HUNYUAN_MODEL'});
  if(input.referenceImageAssetId){
    const image=await backend.scene(actor,'assets.get',{assetId:input.referenceImageAssetId});
    const min=input.kind==='texture'?129:128,max=input.kind==='texture'?4095:4096;
    if(image.owner_id!==actor||!['png','jpeg'].includes(image.format))throw new ApiError('REFERENCE_IMAGE_FORBIDDEN',403);
    if(image.byte_size>5*1024*1024||!Number.isInteger(image.metadata?.width)||!Number.isInteger(image.metadata?.height)||[image.metadata.width,image.metadata.height].some(n=>n<min||n>max))throw new ApiError('INVALID_REFERENCE_IMAGE',422);
  }
  if(input.sourceAssetId){
    const source=await backend.scene(actor,'assets.get',{assetId:input.sourceAssetId});
    if(source.format!=='glb')throw new ApiError('INVALID_SOURCE_MODEL',422);
    if(!backend.readSourceBytes)throw new ApiError('SERVICE_NOT_CONFIGURED',503);
    await requireTextureSource(await backend.readSourceBytes(source.storage_path));
  }
  const {requestId,...identity}=input;
  return {...input,fingerprint:await sha256(input.kind==='text'?input.prompt:JSON.stringify(identity)),providerMode:(env('HUNYUAN_API_MODE')??'tokenhub') as GenerationProvider['providerMode'],providerModel:(input.kind==='texture'?'hy-3d-texture':capabilities.model) as GenerationProvider['providerModel']};
}
