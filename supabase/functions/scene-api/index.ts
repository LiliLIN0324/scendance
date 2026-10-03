import { createBackend } from '../_shared/backend.ts';
import { createApi } from '../_shared/api.ts';

declare const EdgeRuntime: { waitUntil(task:Promise<unknown>):void };
const env=(key:string)=>Deno.env.get(key);
Deno.serve(createApi(createBackend(env),env,fetch,task=>EdgeRuntime.waitUntil(task)));
