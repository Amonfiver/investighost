-- Resolución humana, durable y auditada de conflictos de persistencia históricos.
-- La operación solo clasifica incidentes con evidencia posterior suficiente; no
-- cambia el ledger, las reservas, los artefactos ni el checkpoint y no reanuda.

create table public.real_editorial_historical_incident_resolution_batches (
  id uuid primary key default gen_random_uuid(),
  resolution_key text not null unique check (resolution_key ~ '^[a-f0-9]{64}$'),
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  actor_id uuid not null,
  reason text not null check (
    length(btrim(reason)) between 1 and 500
    and reason !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ),
  current_checkpoint_version integer not null check (current_checkpoint_version > 0),
  current_checkpoint_hash text not null check (current_checkpoint_hash ~ '^[a-f0-9]{64}$'),
  spent_cost numeric(18,9) not null check (spent_cost >= 0),
  reserved_cost numeric(18,9) not null check (reserved_cost >= 0),
  source_count integer not null check (source_count >= 0),
  provider_call_count integer not null check (provider_call_count >= 0),
  resolved_at timestamptz not null default now()
);

create table public.real_editorial_historical_incident_resolutions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null
    references public.real_editorial_historical_incident_resolution_batches(id) on delete restrict,
  incident_id uuid not null unique
    references public.real_editorial_incidents(id) on delete restrict,
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  classification text not null check (
    classification in ('historical_non_blocking','superseded_by_durable_recovery')
  ),
  evidence_kind text not null check (
    evidence_kind in ('durable_mission_reused','equivalent_query_reused','durable_recovery')
  ),
  failure_checkpoint_version integer not null check (failure_checkpoint_version > 0),
  current_checkpoint_version integer not null check (
    current_checkpoint_version > failure_checkpoint_version
  ),
  correction_reference text not null check (correction_reference ~ '^[a-f0-9]{40}$'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  security_evaluation text not null check (security_evaluation = 'passed'),
  resolved_at timestamptz not null default now(),
  unique (batch_id,incident_id)
);

create index real_editorial_historical_incident_batches_run_idx
  on public.real_editorial_historical_incident_resolution_batches(
    pilot_id,run_id,resolved_at desc
  );

create index real_editorial_historical_incident_resolutions_run_idx
  on public.real_editorial_historical_incident_resolutions(
    pilot_id,run_id,resolved_at desc
  );

alter table public.real_editorial_historical_incident_resolution_batches
  enable row level security;
alter table public.real_editorial_historical_incident_resolutions
  enable row level security;

revoke all on table public.real_editorial_historical_incident_resolution_batches
from public,anon,authenticated;
revoke all on table public.real_editorial_historical_incident_resolutions
from public,anon,authenticated;
grant select on table public.real_editorial_historical_incident_resolution_batches
to service_role;
grant select on table public.real_editorial_historical_incident_resolutions
to service_role;

create trigger real_editorial_historical_incident_batches_append_only
  before update or delete on public.real_editorial_historical_incident_resolution_batches
  for each row execute function public.prevent_real_editorial_append_mutation();
create trigger real_editorial_historical_incident_resolutions_append_only
  before update or delete on public.real_editorial_historical_incident_resolutions
  for each row execute function public.prevent_real_editorial_append_mutation();

create or replace function public.resolve_real_editorial_historical_incidents(
  p_resolution_key text,
  p_pilot_id uuid,
  p_run_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_incident_ids uuid[],
  p_expected_checkpoint_version integer,
  p_expected_checkpoint_hash text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing_batch public.real_editorial_historical_incident_resolution_batches%rowtype;
  pilot public.real_editorial_pilots%rowtype;
  run public.real_editorial_runs%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  execution_guard public.real_editorial_execution_guard%rowtype;
  current_checkpoint public.real_editorial_artifacts%rowtype;
  failure_checkpoint public.real_editorial_artifacts%rowtype;
  incident public.real_editorial_incidents%rowtype;
  mission public.real_editorial_artifacts%rowtype;
  query_artifact public.real_editorial_artifacts%rowtype;
  later_result public.real_editorial_artifacts%rowtype;
  current_incident_id uuid;
  existing_incident_ids uuid[];
  batch_id uuid := gen_random_uuid();
  source_count integer;
  provider_call_count integer;
  failure_state text;
  evidence_kind text;
  correction_reference text;
  evidence_artifact_kind text;
  evidence_artifact_key text;
  existing_value text;
  conflicting_value text;
  failure_query jsonb;
  current_query jsonb;
  evidence jsonb;
  evidence_lines jsonb;
  risk_evaluation text;
begin
  if p_resolution_key is null or p_resolution_key !~ '^[a-f0-9]{64}$'
     or p_actor_id is null
     or p_reason is null or length(btrim(p_reason)) not between 1 and 500
     or p_reason ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
     or p_incident_ids is null or cardinality(p_incident_ids) not between 1 and 10
     or cardinality(p_incident_ids) <> (
       select count(distinct value) from unnest(p_incident_ids) value
     )
     or p_expected_checkpoint_version is null or p_expected_checkpoint_version <= 0
     or p_expected_checkpoint_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'HISTORICAL_INCIDENT_INPUT_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-historical-incidents:' || p_run_id::text,0)
  );

  select * into existing_batch
    from public.real_editorial_historical_incident_resolution_batches
   where resolution_key = p_resolution_key;
  if found then
    select array_agg(resolution.incident_id order by resolution.incident_id)
      into existing_incident_ids
      from public.real_editorial_historical_incident_resolutions resolution
     where resolution.batch_id = existing_batch.id;
    if existing_batch.pilot_id = p_pilot_id
       and existing_batch.run_id = p_run_id
       and existing_batch.actor_id = p_actor_id
       and existing_batch.reason = btrim(p_reason)
       and existing_batch.current_checkpoint_version = p_expected_checkpoint_version
       and existing_batch.current_checkpoint_hash = p_expected_checkpoint_hash
       and existing_incident_ids = (
         select array_agg(value order by value) from unnest(p_incident_ids) value
       ) then
      return existing_batch.id;
    end if;
    raise exception 'HISTORICAL_INCIDENT_IDEMPOTENCY_CONFLICT';
  end if;

  if exists (
    select 1 from public.real_editorial_historical_incident_resolutions
     where incident_id = any(p_incident_ids)
  ) then
    raise exception 'HISTORICAL_INCIDENT_ALREADY_RESOLVED';
  end if;

  select * into pilot from public.real_editorial_pilots
   where id = p_pilot_id for update;
  select * into run from public.real_editorial_runs
   where id = p_run_id and pilot_id = p_pilot_id for update;
  select * into budget from public.real_editorial_pilot_budgets
   where pilot_id = p_pilot_id for update;
  if pilot.id is null or run.id is null or budget.pilot_id is null
     or pilot.current_run_id <> p_run_id then
    raise exception 'HISTORICAL_INCIDENT_STATE_CHANGED';
  end if;

  select * into current_checkpoint
    from public.real_editorial_artifacts
   where pilot_id = p_pilot_id and run_id = p_run_id
     and artifact_kind = 'checkpoint' and artifact_key = 'workflow'
   order by version desc limit 1 for update;
  if current_checkpoint.id is null
     or current_checkpoint.version <> p_expected_checkpoint_version
     or current_checkpoint.payload_hash <> p_expected_checkpoint_hash then
    raise exception 'HISTORICAL_INCIDENT_CHECKPOINT_CHANGED';
  end if;

  select * into execution_guard from public.real_editorial_execution_guard
   where guard_name = 'morella-real-editorial' for update;
  if execution_guard.owner_execution_id is not null
     and execution_guard.expires_at > now() or exists (
    select 1 from public.real_editorial_call_reservations
     where pilot_id = p_pilot_id and run_id = p_run_id
       and state in ('reserved','started','unknown')
  ) or exists (
    select 1 from public.real_editorial_ambiguous_calls
     where pilot_id = p_pilot_id and run_id = p_run_id and resolved_at is null
  ) then
    raise exception 'HISTORICAL_INCIDENT_PENDING_EFFECTS';
  end if;

  if jsonb_typeof(current_checkpoint.payload #> '{dossier,sources}') = 'array' then
    source_count := jsonb_array_length(current_checkpoint.payload #> '{dossier,sources}');
  else
    source_count := 0;
  end if;
  select count(*) into provider_call_count
    from public.real_editorial_provider_calls
   where pilot_id = p_pilot_id and run_id = p_run_id;

  insert into public.real_editorial_historical_incident_resolution_batches (
    id,resolution_key,pilot_id,run_id,actor_id,reason,current_checkpoint_version,
    current_checkpoint_hash,spent_cost,reserved_cost,source_count,provider_call_count
  ) values (
    batch_id,p_resolution_key,p_pilot_id,p_run_id,p_actor_id,btrim(p_reason),
    current_checkpoint.version,current_checkpoint.payload_hash,budget.spent_cost,
    budget.reserved_cost,source_count,provider_call_count
  );

  foreach current_incident_id in array p_incident_ids loop
    select * into incident from public.real_editorial_incidents
     where id = current_incident_id for update;
    if incident.id is null or incident.pilot_id <> p_pilot_id
       or incident.run_id is distinct from p_run_id
       or incident.code not in ('VERSION_CONFLICT','PERSISTENCE_ERROR')
       or incident.resolved_at is not null then
      raise exception 'HISTORICAL_INCIDENT_NOT_FOUND';
    end if;

    select * into failure_checkpoint
      from public.real_editorial_artifacts
     where pilot_id = p_pilot_id and run_id = p_run_id
       and artifact_kind = 'checkpoint' and artifact_key = 'workflow'
       and created_at <= incident.created_at
     order by version desc limit 1;
    if failure_checkpoint.id is null
       or current_checkpoint.version <= failure_checkpoint.version then
      raise exception 'HISTORICAL_INCIDENT_EVIDENCE_INSUFFICIENT';
    end if;
    failure_state := failure_checkpoint.payload->>'state';
    mission := null;
    query_artifact := null;
    later_result := null;
    failure_query := null;
    current_query := null;

    if failure_state = 'queued'
       and failure_checkpoint.payload->>'completedRound' = '0' then
      select * into mission from public.real_editorial_artifacts
       where pilot_id = p_pilot_id and run_id = p_run_id
         and artifact_kind = 'mission' and artifact_key = 'initial'
       order by version desc limit 1;
      select * into later_result from public.real_editorial_artifacts
       where pilot_id = p_pilot_id and run_id = p_run_id
         and artifact_kind = 'tavily_result' and artifact_key = 'round-1'
       order by version desc limit 1;
      if mission.id is null or mission.version <> 1 or later_result.id is null
         or later_result.payload->>'round' <> '1'
         or current_checkpoint.payload->'initialMission' <> mission.payload then
        raise exception 'HISTORICAL_INCIDENT_EVIDENCE_INSUFFICIENT';
      end if;
      evidence_kind := 'durable_mission_reused';
      correction_reference := '5799067552ddf2a0e922ba15332f12cb9e5e2fe4';
      evidence_artifact_kind := 'mission';
      evidence_artifact_key := 'initial';
      existing_value := 'createdAt=' || coalesce(mission.payload->>'createdAt','ausente');
      conflicting_value := case
        when incident.id = '45bece91-bea5-4167-a38b-9c5d06f18aea'::uuid
          then 'createdAt=2026-07-25T22:25:25.272Z'
        else 'createdAt temporal distinto'
      end;
      evidence_lines := jsonb_build_array(
        'El checkpoint avanzó durablemente más allá del fallo.',
        'La misión durable v1 coincide con initialMission del checkpoint actual.',
        'Existe un resultado Tavily de ronda 1 posterior y reutilizable.'
      );
      risk_evaluation :=
        'La divergencia era temporal; la misión durable actual es única y compatible.';
    elsif failure_state = 'researching_round_2'
       and failure_checkpoint.payload->>'completedRound' = '1' then
      select value into failure_query
        from jsonb_array_elements(
          coalesce(failure_checkpoint.payload->'nextRoundQueries','[]'::jsonb)
        ) value where value->>'id' = 'q3' limit 1;
      select * into query_artifact from public.real_editorial_artifacts
       where pilot_id = p_pilot_id and run_id = p_run_id
         and artifact_kind = 'query' and artifact_key in ('q3','round-1/q3')
       order by version desc limit 1;
      select value into current_query
        from jsonb_array_elements(
          coalesce(current_checkpoint.payload->'nextRoundQueries','[]'::jsonb)
        ) value where value->>'id' = 'q3' limit 1;
      select * into later_result from public.real_editorial_artifacts
       where pilot_id = p_pilot_id and run_id = p_run_id
         and artifact_kind = 'tavily_result' and artifact_key = 'round-2'
       order by version desc limit 1;
      if query_artifact.id is null or query_artifact.version <> 1
         or failure_query is null or current_query is null or later_result.id is null
         or later_result.payload->>'round' <> '2'
         or failure_query->>'id' is distinct from query_artifact.payload->>'id'
         or failure_query->>'gapId' is distinct from query_artifact.payload->>'gapId'
         or failure_query->>'query' is distinct from query_artifact.payload->>'query'
         or failure_query->>'rationale' is not distinct from query_artifact.payload->>'rationale'
         or current_query->>'id' is distinct from query_artifact.payload->>'id'
         or current_query->>'gapId' is distinct from query_artifact.payload->>'gapId'
         or current_query->>'query' is distinct from query_artifact.payload->>'query'
         or current_query->>'rationale' is distinct from query_artifact.payload->>'rationale' then
        raise exception 'HISTORICAL_INCIDENT_EVIDENCE_INSUFFICIENT';
      end if;
      evidence_kind := 'equivalent_query_reused';
      correction_reference := 'c754dcaf4014a166748eb61fb4a1c8ac3d2e295b';
      evidence_artifact_kind := 'query';
      evidence_artifact_key := 'q3';
      existing_value := query_artifact.payload->>'rationale';
      conflicting_value := failure_query->>'rationale';
      evidence_lines := jsonb_build_array(
        'El checkpoint avanzó durablemente más allá del fallo.',
        'id, gapId y query coinciden; únicamente divergía rationale.',
        'El checkpoint actual canoniza la consulta durable y existe Tavily ronda 2.'
      );
      risk_evaluation :=
        'La metadata no ejecutable fue canonizada y la consulta ejecutada es durable.';
    else
      raise exception 'HISTORICAL_INCIDENT_EVIDENCE_INSUFFICIENT';
    end if;

    if exists (
      select 1 from public.real_editorial_call_reservations reservation
       where reservation.pilot_id = p_pilot_id and reservation.run_id = p_run_id
         and reservation.created_at between failure_checkpoint.created_at and incident.created_at
    ) or exists (
      select 1 from public.real_editorial_provider_calls provider_call
       where provider_call.pilot_id = p_pilot_id and provider_call.run_id = p_run_id
         and provider_call.created_at between failure_checkpoint.created_at and incident.created_at
    ) then
      raise exception 'HISTORICAL_INCIDENT_EVIDENCE_INSUFFICIENT';
    end if;

    evidence := jsonb_build_object(
      'incidentId',incident.id,'code',incident.code,'message',incident.message,
      'createdAt',incident.created_at,'classification','historical_non_blocking',
      'evidenceKind',evidence_kind,
      'failureCheckpointVersion',failure_checkpoint.version,
      'currentCheckpointVersion',current_checkpoint.version,
      'failureCheckpointState',failure_state,
      'currentCheckpointState',current_checkpoint.payload->>'state',
      'artifactKind',evidence_artifact_kind,'artifactKey',evidence_artifact_key,
      'artifactVersion',1,
      'existingValue',existing_value,'conflictingValue',conflicting_value,
      'correctionReference',correction_reference,'durableEvidence',evidence_lines,
      'riskEvaluation',risk_evaluation,'safeToResolve',true
    );
    insert into public.real_editorial_historical_incident_resolutions (
      batch_id,incident_id,pilot_id,run_id,classification,evidence_kind,
      failure_checkpoint_version,current_checkpoint_version,correction_reference,
      evidence,security_evaluation
    ) values (
      batch_id,incident.id,p_pilot_id,p_run_id,'historical_non_blocking',evidence_kind,
      failure_checkpoint.version,current_checkpoint.version,correction_reference,
      evidence,'passed'
    );
  end loop;

  update public.real_editorial_incidents set resolved_at = now()
   where id = any(p_incident_ids) and resolved_at is null;
  if not found or (
    select count(*) from public.real_editorial_incidents
     where id = any(p_incident_ids) and resolved_at is not null
  ) <> cardinality(p_incident_ids) then
    raise exception 'HISTORICAL_INCIDENT_STATE_CHANGED';
  end if;

  if budget.spent_cost <> (
       select spent_cost from public.real_editorial_pilot_budgets where pilot_id = p_pilot_id
     ) or budget.reserved_cost <> (
       select reserved_cost from public.real_editorial_pilot_budgets where pilot_id = p_pilot_id
     ) or current_checkpoint.version <> (
       select max(version) from public.real_editorial_artifacts
        where run_id = p_run_id and artifact_kind = 'checkpoint' and artifact_key = 'workflow'
     ) or current_checkpoint.payload_hash <> (
       select payload_hash from public.real_editorial_artifacts
        where run_id = p_run_id and artifact_kind = 'checkpoint'
          and artifact_key = 'workflow' and version = current_checkpoint.version
     ) or provider_call_count <> (
       select count(*) from public.real_editorial_provider_calls
        where pilot_id = p_pilot_id and run_id = p_run_id
     ) then
    raise exception 'HISTORICAL_INCIDENT_INVARIANT_CHANGED';
  end if;

  insert into public.real_editorial_events (
    pilot_id,run_id,event_type,state,payload
  ) values (
    p_pilot_id,p_run_id,'real.editorial.incidents.historical_resolved',
    current_checkpoint.payload->>'state',jsonb_build_object(
      'resolutionBatchId',batch_id,'actorId',p_actor_id,
      'incidentIds',to_jsonb(p_incident_ids),'checkpointVersion',current_checkpoint.version,
      'spentCostEur',budget.spent_cost,'reservedCostEur',budget.reserved_cost,
      'sourceCount',source_count,'providerCalled',false,'workflowResumed',false
    )
  );
  return batch_id;
end;
$$;

revoke all on function public.resolve_real_editorial_historical_incidents(
  text,uuid,uuid,uuid,text,uuid[],integer,text
) from public,anon,authenticated;
grant execute on function public.resolve_real_editorial_historical_incidents(
  text,uuid,uuid,uuid,text,uuid[],integer,text
) to service_role;
