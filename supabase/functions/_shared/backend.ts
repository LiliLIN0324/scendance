import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './domain.ts';
import { required, type Env } from './http.ts';

// RPC responses are PostgreSQL JSON; route-specific inputs are validated with Zod.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Rpc = (actor: string|null, action: string, data?: Record<string,unknown>) => Promise<any>;
export interface Backend {
  user(token:string):Promise<string>;
  scene: Rpc;
  jobs: Rpc;
  reconstruction: Rpc;
  agent?: Rpc;
  upload(path:string,bytes:Uint8Array,mime:string):Promise<void>;
  sign(path:string):Promise<string>;
  readSourceBytes?(path:string):Promise<Uint8Array>;
}
function rpc(client: SupabaseClient,name:string): Rpc {
  return async(actor,action,data={})=>{
    const { data:result,error }=await client.rpc(name,{p_actor:actor,p_action:action,p_data:data});
    if (error) {
      const code=error.message;
      if (/^[A-Z_]+$/.test(code)) {
        const status=code.endsWith('NOT_FOUND')?404:code==='UNAUTHENTICATED'?401:/FORBIDDEN/.test(code)?403:/BUDGET|BUSY/.test(code)?429:/LEASE|CONFLICT|STALE|CLAIM/.test(code)?409:422;
        throw new ApiError(code,status);
      }
      throw new ApiError('DATABASE_ERROR',500);
    }
    return result;
  };
}
export function createBackend(env:Env):Backend {
  const client=createClient(required(env,'SUPABASE_URL'),required(env,'SUPABASE_SERVICE_ROLE_KEY'),{ auth:{persistSession:false,autoRefreshToken:false} });
  const scene=rpc(client,'scene_rpc'),studios=rpc(client,'studio_rpc');
  return {
    async user(token) { const {data,error}=await client.auth.getUser(token); if(error||!data.user||data.user.is_anonymous) throw new ApiError('UNAUTHENTICATED',401); return data.user.id; },
    scene:(actor,action,data)=>(action.startsWith('studios.')?studios:scene)(actor,action,data),jobs:rpc(client,'job_rpc'),reconstruction:rpc(client,'reconstruction_rpc'),agent:rpc(client,'agent_rpc'),
    async upload(path,bytes,mime) {
      const {error}=await client.storage.from('scene-assets').upload(path,new Uint8Array(bytes),{contentType:mime,upsert:false});
      // Retry after a worker crash reuses a content-addressed immutable path.
      if(error && !('statusCode' in error && String(error.statusCode)==='409')) throw new ApiError('STORAGE_UPLOAD_FAILED',502);
    },
    async readSourceBytes(path) { const {data,error}=await client.storage.from('scene-assets').download(path);if(error||!data)throw new ApiError('STORAGE_DOWNLOAD_FAILED',502);return new Uint8Array(await data.arrayBuffer()); },
    async sign(path) { const {data,error}=await client.storage.from('scene-assets').createSignedUrl(path,300); if(error||!data) throw new ApiError('STORAGE_SIGN_FAILED',502); return data.signedUrl; },
  };
}
