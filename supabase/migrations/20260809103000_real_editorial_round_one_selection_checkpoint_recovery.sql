-- Concilia únicamente fallos locales de restauración posteriores a una selección
-- de fuentes ya aplicada, siempre que no exista ningún efecto de proveedor.

create table public.real_editorial_source_selection_checkpoint_recoveries (
  id uuid primary key default gen_random_uuid(),
  recovery_key text not null unique check (recovery_key ~ '^[a-f0-9]{64}$'),
  selection_id uuid not null unique references
    public.real_editorial_round_one_source_selections(id) on delete restrict,
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  actor_id uuid not null,
  reason text not null check (
    length(btrim(reason)) between 1 and 500
    and reason !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ),
  incident_count integer not null check (incident_count between 1 and 5),
  checkpoint_version integer not null check (checkpoint_version > 0),
  checkpoint_hash text not null check (checkpoint_hash ~ '^[a-f0-9]{64}$'),
  provider_calls_after_selection integer not null default 0
    check (provider_calls_after_selection = 0),
  reservations_after_selection integer not null default 0
    check (reservations_after_selection = 0),
  spent_cost numeric(18,9) not null check (spent_cost >= 0),
  reserved_cost numeric(18,9) not null check (reserved_cost = 0),
  current_maximum_cost numeric(18,9) not null check (current_maximum_cost >= 0),
  recovered_at timestamptz not null default now(),
  check (spent_cost + reserved_cost <= current_maximum_cost)
);

create table public.real_editorial_source_selection_checkpoint_incidents (
  recovery_id uuid not null references
    public.real_editorial_source_selection_checkpoint_recoveries(id) on delete restrict,
  incident_id uuid not null unique references public.real_editorial_incidents(id) on delete restrict,
  code text not null check (code = 'CHECKPOINT_INVALID'),
  classification text not null check (classification = 'human_required'),
  message text not null,
  incident_created_at timestamptz not null,
  primary key (recovery_id,incident_id)
);

alter table public.real_editorial_source_selection_checkpoint_recoveries
  enable row level security;
alter table public.real_editorial_source_selection_checkpoint_incidents
  enable row level security;

revoke all on table
  public.real_editorial_source_selection_checkpoint_recoveries,
  public.real_editorial_source_selection_checkpoint_incidents
from public,anon,authenticated;

grant select on table
  public.real_editorial_source_selection_checkpoint_recoveries,
  public.real_editorial_source_selection_checkpoint_incidents
to service_role;

create trigger real_editorial_source_selection_checkpoint_recoveries_append
  before update or delete on public.real_editorial_source_selection_checkpoint_recoveries
  for each row execute function public.prevent_real_editorial_append_mutation();

create trigger real_editorial_source_selection_checkpoint_incidents_append
  before update or delete on public.real_editorial_source_selection_checkpoint_incidents
  for each row execute function public.prevent_real_editorial_append_mutation();

create or replace function public.reconcile_real_editorial_source_selection_checkpoint(
  p_recovery_key text,
  p_selection_id uuid,
  p_pilot_id uuid,
  p_run_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_incident_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.real_editorial_source_selection_checkpoint_recoveries%rowtype;
  selection public.real_editorial_round_one_source_selections%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  checkpoint public.real_editorial_artifacts%rowtype;
  recovery_id uuid;
  recovered_at timestamptz := now();
  normalized_incident_ids uuid[];
  stored_incident_ids uuid[];
  provider_calls_after integer;
  reservations_after integer;
  unresolved_count integer;
begin
  if p_recovery_key !~ '^[a-f0-9]{64}$'
     or p_reason is null or length(btrim(p_reason)) not between 1 and 500
     or p_reason ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
     or p_incident_ids is null or cardinality(p_incident_ids) not between 1 and 5 then
    raise exception 'ROUND_ONE_SELECTION_CHECKPOINT_RECOVERY_INVALID';
  end if;
  select array_agg(id order by id) into normalized_incident_ids
    from (select distinct unnest(p_incident_ids) as id) value;
  if cardinality(normalized_incident_ids) <> cardinality(p_incident_ids) then
    raise exception 'ROUND_ONE_SELECTION_CHECKPOINT_RECOVERY_INCIDENTS_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-round-one-selection-checkpoint:' || p_run_id::text,0)
  );
  select * into existing
    from public.real_editorial_source_selection_checkpoint_recoveries
   where recovery_key = p_recovery_key or selection_id = p_selection_id
   order by (recovery_key = p_recovery_key) desc
   limit 1;
  if found then
    select array_agg(incident_id order by incident_id) into stored_incident_ids
      from public.real_editorial_source_selection_checkpoint_incidents recovery_incident
     where recovery_incident.recovery_id = existing.id;
    if existing.recovery_key <> p_recovery_key
       or existing.selection_id <> p_selection_id
       or existing.pilot_id <> p_pilot_id
       or existing.run_id <> p_run_id
       or existing.actor_id <> p_actor_id
       or existing.reason <> p_reason
       or stored_incident_ids <> normalized_incident_ids then
      raise exception 'ROUND_ONE_SELECTION_CHECKPOINT_RECOVERY_CONFLICT';
    end if;
    return existing.id;
  end if;

  select * into selection
    from public.real_editorial_round_one_source_selections
   where id = p_selection_id and pilot_id = p_pilot_id and run_id = p_run_id
   for share;
  if not found
     or selection.maximum_sources <> 8
     or selection.original_active_count <> 8
     or selection.active_count_after_selection <> 5
     or selection.available_slots_after_selection <> 3 then
    raise exception 'ROUND_ONE_SELECTION_CHECKPOINT_RECOVERY_SELECTION_INVALID';
  end if;
  if not exists (
    select 1 from public.real_editorial_pilots p
    join public.real_editorial_runs r on r.id = p.current_run_id
    where p.id = p_pilot_id and r.id = p_run_id
      and p.state = 'preflight' and r.state = 'preflight' and r.current_round = 1
  ) then
    raise exception 'ROUND_ONE_SELECTION_CHECKPOINT_RECOVERY_STATE_INVALID';
  end if;
  select * into checkpoint from public.real_editorial_artifacts
   where run_id = p_run_id and artifact_kind = 'checkpoint' and artifact_key = 'workflow'
   order by version desc limit 1;
  if not found
     or checkpoint.version <> selection.selected_checkpoint_version
     or checkpoint.payload_hash <> selection.selected_checkpoint_hash
     or jsonb_array_length(checkpoint.payload#>'{dossier,sources}') <> 5
     or jsonb_array_length(checkpoint.payload->'nextRoundQueries') <> 3 then
    raise exception 'ROUND_ONE_SELECTION_CHECKPOINT_RECOVERY_CHECKPOINT_INVALID';
  end if;
  if exists (
    select 1 from public.real_editorial_artifacts
     where run_id = p_run_id and artifact_kind = 'tavily_result' and artifact_key = 'round-2'
  ) then
    raise exception 'ROUND_ONE_SELECTION_CHECKPOINT_RECOVERY_ROUND_TWO_EXISTS';
  end if;
  if exists (
    select 1 from public.real_editorial_execution_guard
     where guard_name = 'morella-real-editorial' and owner_execution_id is not null
       and expires_at > now()
  ) then
    raise exception 'ROUND_ONE_SELECTION_CHECKPOINT_RECOVERY_GUARD_BUSY';
  end if;
  select * into budget from public.real_editorial_pilot_budgets where pilot_id = p_pilot_id;
  if not found
     or budget.spent_cost <> selection.spent_cost
     or budget.reserved_cost <> selection.reserved_cost
     or budget.task_limit_cost <> selection.current_maximum_cost
     or budget.batch_limit_cost <> selection.current_maximum_cost
     or budget.daily_limit_cost <> selection.current_maximum_cost then
    raise exception 'ROUND_ONE_SELECTION_CHECKPOINT_RECOVERY_BUDGET_CHANGED';
  end if;
  select count(*) into provider_calls_after
    from public.real_editorial_provider_calls
   where run_id = p_run_id and created_at >= selection.selected_at;
  select count(*) into reservations_after
    from public.real_editorial_call_reservations
   where run_id = p_run_id and created_at >= selection.selected_at;
  if provider_calls_after <> 0 or reservations_after <> 0 then
    raise exception 'ROUND_ONE_SELECTION_CHECKPOINT_RECOVERY_PROVIDER_EFFECTS';
  end if;
  select count(*) into unresolved_count
    from public.real_editorial_incidents
   where pilot_id = p_pilot_id and run_id = p_run_id
     and code = 'CHECKPOINT_INVALID' and classification = 'human_required'
     and resolved_at is null and created_at >= selection.selected_at;
  if unresolved_count <> cardinality(normalized_incident_ids)
     or exists (
       select 1 from unnest(normalized_incident_ids) requested(id)
       left join public.real_editorial_incidents incident on incident.id = requested.id
       where incident.id is null or incident.pilot_id <> p_pilot_id
         or incident.run_id <> p_run_id or incident.code <> 'CHECKPOINT_INVALID'
         or incident.classification <> 'human_required' or incident.resolved_at is not null
         or incident.created_at < selection.selected_at
     ) then
    raise exception 'ROUND_ONE_SELECTION_CHECKPOINT_RECOVERY_INCIDENTS_CHANGED';
  end if;

  insert into public.real_editorial_source_selection_checkpoint_recoveries (
    recovery_key,selection_id,pilot_id,run_id,actor_id,reason,incident_count,
    checkpoint_version,checkpoint_hash,provider_calls_after_selection,
    reservations_after_selection,spent_cost,reserved_cost,current_maximum_cost,recovered_at
  ) values (
    p_recovery_key,p_selection_id,p_pilot_id,p_run_id,p_actor_id,p_reason,
    cardinality(normalized_incident_ids),checkpoint.version,checkpoint.payload_hash,
    provider_calls_after,reservations_after,budget.spent_cost,budget.reserved_cost,
    budget.task_limit_cost,recovered_at
  ) returning id into recovery_id;
  insert into public.real_editorial_source_selection_checkpoint_incidents (
    recovery_id,incident_id,code,classification,message,incident_created_at
  )
  select recovery_id,id,code,classification,message,created_at
    from public.real_editorial_incidents where id = any(normalized_incident_ids);
  update public.real_editorial_incidents set resolved_at = recovered_at
   where id = any(normalized_incident_ids);
  insert into public.real_editorial_events (
    pilot_id,run_id,event_type,state,payload,occurred_at
  ) values (
    p_pilot_id,p_run_id,'real.editorial.round_one_sources.checkpoint_recovered','preflight',
    jsonb_build_object(
      'recoveryId',recovery_id,'selectionId',p_selection_id,'actorId',p_actor_id,
      'incidentIds',to_jsonb(normalized_incident_ids),'checkpointVersion',checkpoint.version,
      'providerCallsAfterSelection',0,'reservationsAfterSelection',0,
      'budgetChanged',false,'workflowResumed',false
    ),recovered_at
  );
  return recovery_id;
end;
$$;

revoke all on function
  public.reconcile_real_editorial_source_selection_checkpoint(
    text,uuid,uuid,uuid,uuid,text,uuid[]
  )
from public,anon,authenticated;

grant execute on function
  public.reconcile_real_editorial_source_selection_checkpoint(
    text,uuid,uuid,uuid,uuid,text,uuid[]
  )
to service_role;
