import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { sceneSchema, type Scene } from '../supabase/functions/_shared/domain.ts';
import type { Backend, Rpc } from '../supabase/functions/_shared/backend.ts';
import { ApiError } from '../supabase/functions/_shared/domain.ts';

export const owner='10000000-0000-4000-8000-000000000001';
export const editor='10000000-0000-4000-8000-000000000002';
export const outsider='10000000-0000-4000-8000-000000000003';
export const studio='20000000-0000-4000-8000-000000000001';
export const session='30000000-0000-4000-8000-000000000001';
export function scene():Scene {return sceneSchema.parse({schemaVersion:1,venue:{shape:'rectangle',width:12,depth:10,height:3,entrances:[]},objects:[],camera:'overview',lighting:'neutral'});}
export function chair(notes='') {return {id:crypto.randomUUID(),materialId:'chair' as const,position:{x:3,z:3},rotation:0,size:{width:0.5,depth:0.5,height:0.85},color:'#ffffff',locked:false,notes};}
export async function database(dataDir?: string) {
  const db=new PGlite(dataDir);
  const initialized = await db.query<{ present: boolean }>("select to_regnamespace('auth') is not null as present");
  if (!initialized.rows[0].present) await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    grant usage on schema auth,public to service_role; grant select on auth.users to service_role;
    grant usage on schema public to anon,authenticated;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  await db.exec('create table if not exists public.local_fixture_migrations(name text primary key, checksum text not null)');
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for(const file of readdirSync(migrations).filter(f=>f.endsWith('.sql')).sort()) {
    const sql = readFileSync(new URL(file,migrations),'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await db.query<{ checksum: string }>('select checksum from public.local_fixture_migrations where name=$1',[file]);
    if (existing.rows.length) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Local fixture migration changed: ${file}. Choose a new SCENDANCE_DEV_DATA directory; existing data has been preserved.`);
      continue;
    }
    await db.exec(sql);
    await db.query('insert into public.local_fixture_migrations values ($1,$2)',[file,checksum]);
  }
  await db.query('insert into auth.users values ($1),($2),($3) on conflict do nothing',[owner,editor,outsider]);
  await db.query('insert into scene_private.studios(id,name) values ($1,$2) on conflict do nothing',[studio,'Test studio']);
  await db.query("insert into scene_private.members values ($1,$2,'owner','Owner'),($1,$3,'editor','Editor') on conflict do nothing",[studio,owner,editor]);
  const call=(fn:string):Rpc=>async(actor,action,data={})=>{
    try {
      const result=await db.transaction(async tx=>{
        await tx.exec('set local role service_role');
        return tx.query<{result:unknown}>(`select public.${fn}($1,$2,$3::jsonb) as result`,[actor,action,JSON.stringify(data)]);
      });
      return result.rows[0].result;
    } catch(error) {
      const code=(error as Error).message;
      if(/^[A-Z_]+$/.test(code)) throw new ApiError(code,code.endsWith('NOT_FOUND')?404:/FORBIDDEN/.test(code)?403:/BUSY|BUDGET/.test(code)?429:409);
      throw error;
    }
  };
  const core=call('scene_rpc'),studios=call('studio_rpc'),jobs=call('job_rpc'),reconstruction=call('reconstruction_rpc');
  const sceneRpc:Rpc=(actor,action,data)=>(action.startsWith('studios.')?studios:core)(actor,action,data);
  const backend:Backend={scene:sceneRpc,jobs,reconstruction,agent:call('agent_rpc'),user:async token=>{if([owner,editor,outsider].includes(token))return token;throw new ApiError('UNAUTHENTICATED',401);},upload:async()=>{},sign:async path=>`https://storage.example/signed/${path}`};
  return {db,rpc:sceneRpc,jobs,reconstruction,backend};
}
