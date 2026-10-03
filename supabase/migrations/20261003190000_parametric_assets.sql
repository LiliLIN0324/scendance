-- Fixed parametric models are private, immutable assets, with retry-safe registration.
alter table scene_private.assets drop constraint assets_source_check;
alter table scene_private.assets add constraint assets_source_check check (source in ('hunyuan','polyhaven','upload','parametric'));
create table scene_private.parametric_assets (
  owner_id uuid not null references auth.users, request_key uuid not null,
  studio_id uuid not null references scene_private.studios on delete cascade,
  fingerprint text not null, parameters jsonb not null, builder_version text not null,
  asset_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(), primary key(owner_id,request_key)
);
alter table scene_private.parametric_assets enable row level security;
revoke all on scene_private.parametric_assets from public,anon,authenticated;
grant select,insert on scene_private.parametric_assets to service_role;

alter function public.scene_rpc(uuid,text,jsonb) rename to scene_rpc_before_parametric;
create function public.scene_rpc(p_actor uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare request scene_private.parametric_assets; target scene_private.assets; result jsonb;
begin
  if p_action not in ('parametric.reserve','parametric.complete') then
    return public.scene_rpc_before_parametric(p_actor,p_action,p_data);
  end if;
  if not scene_private.is_member(p_actor,(p_data->>'studioId')::uuid) then raise exception 'FORBIDDEN'; end if;
  if p_data->>'builderVersion' is distinct from '1'
    or jsonb_typeof(p_data->'parameters') is distinct from 'object'
    or not coalesce((p_data->>'fingerprint') ~ '^[a-f0-9]{64}$',false) then raise exception 'INVALID_PARAMETRIC_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('parametric:'||p_actor::text||':'||(p_data->>'requestId'),0));
  select * into request from scene_private.parametric_assets where owner_id=p_actor and request_key=(p_data->>'requestId')::uuid;
  if found then
    if request.fingerprint is distinct from p_data->>'fingerprint'
      or request.studio_id is distinct from (p_data->>'studioId')::uuid
      or request.parameters is distinct from p_data->'parameters'
      or request.builder_version is distinct from p_data->>'builderVersion' then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  elsif p_action='parametric.complete' then raise exception 'REQUEST_NOT_FOUND';
  else
    insert into scene_private.parametric_assets(owner_id,request_key,studio_id,fingerprint,parameters,builder_version)
      values(p_actor,(p_data->>'requestId')::uuid,(p_data->>'studioId')::uuid,p_data->>'fingerprint',p_data->'parameters',p_data->>'builderVersion') returning * into request;
  end if;
  select * into target from scene_private.assets where id=request.asset_id;
  if found then return jsonb_build_object('assetId',request.asset_id,'asset',to_jsonb(target)-'storage_path','reused',true); end if;
  if p_action='parametric.reserve' then return jsonb_build_object('assetId',request.asset_id,'reused',false); end if;
  if p_data->'asset'->>'id' is distinct from request.asset_id::text
    or p_data->'asset'->>'source' is distinct from 'parametric'
    or p_data->'asset'->>'format' is distinct from 'glb'
    or p_data->'asset'->'metadata'->'parametric'->>'builderVersion' is distinct from request.builder_version
    or p_data->'asset'->'metadata'->'parametric'->'parameters' is distinct from request.parameters
    or p_data->'asset'->'metadata'->'parametric'->>'family' is distinct from request.parameters->>'family'
    or p_data->'asset'->>'storagePath' is distinct from p_actor::text||'/'||request.asset_id::text||'/'||(p_data->'asset'->>'sha256')||'.glb'
    then raise exception 'INVALID_PARAMETRIC_ASSET'; end if;
  result:=public.scene_rpc_before_parametric(p_actor,'assets.register',p_data->'asset');
  return jsonb_build_object('asset',result,'reused',false);
end $$;
revoke all on function public.scene_rpc(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.scene_rpc(uuid,text,jsonb) to service_role;
