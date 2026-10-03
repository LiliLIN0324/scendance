-- Durable, bounded DeepSeek runs. Usage has no daily spending ceiling.
create table scene_private.agent_runs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users,
  project_id uuid not null references scene_private.projects on delete cascade, request_key uuid not null,
  fingerprint text not null, input jsonb not null, base_hash text not null,
  state text not null default 'queued' check(state in ('queued','running','complete','failed','cancelled')),
  progress text not null default '等待开始', call_count integer not null default 0 check(call_count between 0 and 6),
  claim uuid, candidates jsonb not null default '[]', evaluation jsonb, usage jsonb not null default '[]',
  error_code text, message text, execution_mode text not null check(execution_mode in ('preview','direct')),
  created_at timestamptz not null default clock_timestamp(), deadline timestamptz not null default clock_timestamp()+interval '90 seconds',
  unique(owner_id,project_id,request_key)
);
create table scene_private.agent_proposals (
  proposal_id uuid primary key references scene_private.proposals on delete cascade,
  run_id uuid not null references scene_private.agent_runs on delete cascade
);
alter table scene_private.agent_runs enable row level security;
alter table scene_private.agent_proposals enable row level security;
revoke all on scene_private.agent_runs,scene_private.agent_proposals from public,anon,authenticated;
grant select,insert,update,delete on scene_private.agent_runs,scene_private.agent_proposals to service_role;

create function scene_private.agent_view(r scene_private.agent_runs) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'projectId',r.project_id,'requestId',r.request_key,'state',r.state,'progress',r.progress,
 'callCount',r.call_count,'candidates',case when r.state='cancelled' then '[]'::jsonb else r.candidates end,'evaluation',r.evaluation,
 'executionMode',r.execution_mode,'jevEnabled',(r.input->>'jevEnabled')::boolean,'expiresAt',r.deadline)
 || case when r.error_code is null then '{}'::jsonb else jsonb_build_object('errorCode',r.error_code) end
 || case when r.message is null then '{}'::jsonb else jsonb_build_object('message',r.message) end
$$;
revoke all on function scene_private.agent_view(scene_private.agent_runs) from public,anon,authenticated;
grant execute on function scene_private.agent_view(scene_private.agent_runs) to service_role;

create function public.agent_rpc(p_actor uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r scene_private.agent_runs; p scene_private.projects; c jsonb; stored jsonb; items jsonb:='[]'; v_day date;
begin
  select * into p from scene_private.projects where id=(p_data->>'projectId')::uuid;
  if p_actor is null or not found or not scene_private.is_member(p_actor,p.studio_id) then raise exception 'PROJECT_NOT_FOUND'; end if;
  if p_action='create' then
    perform pg_advisory_xact_lock(hashtextextended('agent-owner:'||p_actor::text,0));
    perform pg_advisory_xact_lock(hashtextextended('agent:'||p_actor::text||':'||p.id::text||':'||(p_data->'input'->>'requestId'),0));
    select * into r from scene_private.agent_runs where owner_id=p_actor and project_id=p.id and request_key=(p_data->'input'->>'requestId')::uuid for update;
    if found then
      if r.fingerprint is distinct from p_data->>'fingerprint' then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
      return scene_private.agent_view(r)||'{"reused":true}';
    end if;
    perform scene_private.require_lease(p_actor,p_data->'input'||jsonb_build_object('projectId',p.id));
    perform scene_private.check_assets(p_actor,p_data->'input'->'scene');
    if exists(select 1 from scene_private.agent_runs where owner_id=p_actor and state in ('queued','running') and deadline>clock_timestamp()) then raise exception 'AI_BUSY'; end if;
    insert into scene_private.agent_runs(owner_id,project_id,request_key,fingerprint,input,base_hash,execution_mode)
      values(p_actor,p.id,(p_data->'input'->>'requestId')::uuid,p_data->>'fingerprint',p_data->'input',p_data->>'baseHash',p_data->>'executionMode') returning * into r;
    return scene_private.agent_view(r)||'{"reused":false}';
  end if;
  if p_action='by_request' then
    select * into r from scene_private.agent_runs where owner_id=p_actor and project_id=p.id and request_key=(p_data->>'requestId')::uuid for update;
  else
    select * into r from scene_private.agent_runs where id=(p_data->>'id')::uuid and owner_id=p_actor and project_id=p.id for update;
  end if;
  if not found then raise exception 'AGENT_RUN_NOT_FOUND'; end if;
  if r.state in ('queued','running') and r.deadline<=clock_timestamp() then
    update scene_private.agent_runs set state=case when jsonb_array_length(candidates)>0 then 'complete' else 'failed' end,error_code='AGENT_DEADLINE',progress='执行已中断，保留有效结果',evaluation=case when (input->>'jevEnabled')::boolean then jsonb_build_object('status','partial','message','运行已中断，保留通过检查的方案，未完成评价。') else null end where id=r.id returning * into r;
  end if;
  if p_action in ('get','by_request') then return scene_private.agent_view(r); end if;
  if p_action='cancel' then
    update scene_private.agent_runs set state='cancelled',progress='已取消',execution_mode='preview' where id=r.id returning * into r;
    return scene_private.agent_view(r);
  end if;
  if p_action='start' then
    if r.state<>'queued' then return '{"claimed":false}'; end if;
    update scene_private.agent_runs set state='running',claim=gen_random_uuid(),progress='正在读取当前场景' where id=r.id returning * into r;
    return jsonb_build_object('claimed',true,'claim',r.claim,'input',r.input,'deadline',r.deadline,'studioId',p.studio_id);
  end if;
  if r.state<>'running' or r.claim is distinct from (p_data->>'claim')::uuid then raise exception 'AGENT_RUN_STOPPED'; end if;
  if p_action='fail' then
    update scene_private.agent_runs set state=case when jsonb_array_length(candidates)>0 and p_data->>'errorCode' not in ('LEASE_LOST','LEASE_BUSY','REVISION_CONFLICT','FORBIDDEN','PROJECT_NOT_FOUND') then 'complete' else 'failed' end,
      error_code=p_data->>'errorCode',progress='执行中断，原场景与有效方案已保留',
      evaluation=case when (input->>'jevEnabled')::boolean then jsonb_build_object('status','partial','message','后续处理未完成，有效方案已保留，未生成推荐概率。') else null end
      where id=r.id returning * into r;
    return scene_private.agent_view(r);
  end if;
  -- Check the edit lease/revision before each tool and model call, and again at final storage.
  perform scene_private.require_lease(p_actor,r.input||jsonb_build_object('projectId',p.id));
  if p_action='check' then return jsonb_build_object('active',true); end if;
  if p_action='step' then
    if r.call_count>=6 then raise exception 'AGENT_CALL_LIMIT'; end if;
    v_day:=(clock_timestamp() at time zone 'Asia/Shanghai')::date;
    insert into scene_private.text_daily_budgets(usage_day,committed_cents) values(v_day,20)
      on conflict(usage_day) do update set committed_cents=scene_private.text_daily_budgets.committed_cents+20;
    update scene_private.agent_runs set call_count=call_count+1,progress=p_data->>'progress' where id=r.id returning * into r;
    return jsonb_build_object('callCount',r.call_count);
  elsif p_action='usage' then
    update scene_private.agent_runs set usage=usage||jsonb_build_array(p_data->'usage') where id=r.id;
    return '{}';
  elsif p_action='progress' then
    update scene_private.agent_runs set progress=left(p_data->>'progress',200) where id=r.id;
    return '{}';
  elsif p_action in ('finish','checkpoint') then
    if jsonb_array_length(p_data->'candidates')>3 then raise exception 'INVALID_CANDIDATES'; end if;
    if p_data ? 'candidates' then
    for c in select value from jsonb_array_elements(p_data->'candidates') loop
      stored:=public.scene_rpc(p_actor,'proposals.store',r.input||jsonb_build_object('projectId',p.id,'id',gen_random_uuid(),
        'baseHash',r.base_hash,'candidate',c->'scene','explanation',c->>'explanation','warnings',c->'warnings'));
      stored:=stored||jsonb_build_object('modelSuggestions',coalesce(c->'modelSuggestions','[]'),'materialSuggestions',coalesce(c->'materialSuggestions','[]'));
      insert into scene_private.agent_proposals values((stored->>'id')::uuid,r.id);
      items:=items||jsonb_build_array(jsonb_build_object('label',c->>'label','title',c->>'title','proposal',stored));
    end loop;
    end if;
    update scene_private.agent_runs set state=case when p_action='checkpoint' then 'running' else 'complete' end,progress=case when p_action='checkpoint' then '已保存通过检查的候选方案' else '方案已准备好' end,candidates=case when p_data ? 'candidates' then items else candidates end,evaluation=p_data->'evaluation',message=p_data->>'message' where id=r.id returning * into r;
    return scene_private.agent_view(r);
  end if;
  raise exception 'UNKNOWN_ACTION';
end $$;
revoke all on function public.agent_rpc(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.agent_rpc(uuid,text,jsonb) to service_role;

alter function public.scene_rpc(uuid,text,jsonb) rename to scene_rpc_before_agent;
create function public.scene_rpc(p_actor uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r scene_private.agent_runs;
begin
  if p_action='proposals.apply' then
    select a.* into r from scene_private.agent_runs a join scene_private.agent_proposals link on link.run_id=a.id
      where link.proposal_id=(p_data->>'proposalId')::uuid for update of a;
    if found and (r.state<>'complete' or not exists(select 1 from jsonb_array_elements(r.candidates) c where c->'proposal'->>'id'=p_data->>'proposalId') or r.owner_id is distinct from p_actor or r.project_id is distinct from (p_data->>'projectId')::uuid) then raise exception 'STALE_PROPOSAL'; end if;
  end if;
  return public.scene_rpc_before_agent(p_actor,p_action,p_data);
end $$;
revoke all on function public.scene_rpc(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.scene_rpc(uuid,text,jsonb) to service_role;
