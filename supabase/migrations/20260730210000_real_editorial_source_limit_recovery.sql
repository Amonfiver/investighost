-- Recuperación humana durable de un resultado Tavily que excede el máximo
-- global de fuentes. Reutiliza artefactos existentes y no ejecuta proveedores.

create table public.real_editorial_source_limit_recoveries (
  id uuid primary key default gen_random_uuid(),
  recovery_key text not null unique check (recovery_key ~ '^[a-f0-9]{64}$'),
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  incident_id uuid not null unique
    references public.real_editorial_incidents(id) on delete restrict,
  actor_id uuid not null,
  reason text not null check (
    length(btrim(reason)) between 1 and 500
    and reason !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ),
  previous_checkpoint_version integer not null check (previous_checkpoint_version > 0),
  previous_checkpoint_hash text not null check (previous_checkpoint_hash ~ '^[a-f0-9]{64}$'),
  recovered_checkpoint_version integer not null check (recovered_checkpoint_version > 0),
  recovered_checkpoint_hash text not null check (recovered_checkpoint_hash ~ '^[a-f0-9]{64}$'),
  round_two_result_hash text not null check (round_two_result_hash ~ '^[a-f0-9]{64}$'),
  maximum_sources integer not null check (maximum_sources > 0),
  available_slots integer not null check (available_slots >= 0),
  existing_sources jsonb not null check (jsonb_typeof(existing_sources) = 'array'),
  candidate_sources jsonb not null check (jsonb_typeof(candidate_sources) = 'array'),
  selected_sources jsonb not null check (jsonb_typeof(selected_sources) = 'array'),
  excluded_sources jsonb not null check (jsonb_typeof(excluded_sources) = 'array'),
  provider_calls_before integer not null check (provider_calls_before >= 0),
  research_provider_calls integer not null check (research_provider_calls > 0),
  provider_calls_after integer not null check (provider_calls_after > 0),
  spent_cost numeric(18,9) not null check (spent_cost >= 0),
  reserved_cost numeric(18,9) not null check (reserved_cost = 0),
  current_maximum_cost numeric(18,9) not null check (current_maximum_cost >= 0),
  recovered_at timestamptz not null default now(),
  unique (pilot_id,run_id,incident_id),
  check (recovered_checkpoint_version = previous_checkpoint_version + 1),
  check (provider_calls_after = provider_calls_before + research_provider_calls),
  check (
    jsonb_array_length(existing_sources) + available_slots = maximum_sources
    and jsonb_array_length(selected_sources) = available_slots
    and jsonb_array_length(candidate_sources)
      = jsonb_array_length(selected_sources) + jsonb_array_length(excluded_sources)
    and jsonb_array_length(excluded_sources) > 0
  ),
  check (spent_cost + reserved_cost <= current_maximum_cost)
);

create index real_editorial_source_limit_recoveries_run_idx
  on public.real_editorial_source_limit_recoveries(pilot_id,run_id,recovered_at desc);

alter table public.real_editorial_source_limit_recoveries enable row level security;

revoke all on table public.real_editorial_source_limit_recoveries
from public,anon,authenticated;

grant select on table public.real_editorial_source_limit_recoveries
to service_role;

create trigger real_editorial_source_limit_recoveries_append_only
  before update or delete on public.real_editorial_source_limit_recoveries
  for each row execute function public.prevent_real_editorial_append_mutation();

create or replace function public.recover_real_editorial_source_limit(
  p_recovery_key text,
  p_pilot_id uuid,
  p_run_id uuid,
  p_incident_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_previous_checkpoint_version integer,
  p_previous_checkpoint_hash text,
  p_round_two_result_hash text,
  p_recovered_checkpoint_version integer,
  p_recovered_checkpoint jsonb,
  p_recovered_checkpoint_hash text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing_recovery public.real_editorial_source_limit_recoveries%rowtype;
  pilot public.real_editorial_pilots%rowtype;
  run public.real_editorial_runs%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  policy public.real_editorial_pilot_policies%rowtype;
  incident public.real_editorial_incidents%rowtype;
  checkpoint public.real_editorial_artifacts%rowtype;
  round_two public.real_editorial_artifacts%rowtype;
  recovery_id uuid := gen_random_uuid();
  maximum_sources integer;
  available_slots integer;
  provider_calls_before integer;
  research_provider_calls integer;
  provider_calls_after integer;
  existing_full jsonb;
  candidate_full jsonb;
  selected_full jsonb;
  expected_sources jsonb;
  existing_trace jsonb;
  candidate_trace jsonb;
  selected_trace jsonb;
  excluded_trace jsonb;
begin
  if p_recovery_key is null or p_recovery_key !~ '^[a-f0-9]{64}$' then
    raise exception 'SOURCE_LIMIT_RECOVERY_KEY_INVALID';
  end if;
  if p_actor_id is null then
    raise exception 'SOURCE_LIMIT_RECOVERY_ACTOR_REQUIRED';
  end if;
  if p_reason is null
     or length(btrim(p_reason)) not between 1 and 500
     or p_reason ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])' then
    raise exception 'SOURCE_LIMIT_RECOVERY_REASON_INVALID';
  end if;
  if p_previous_checkpoint_version is null
     or p_previous_checkpoint_version <= 0
     or p_recovered_checkpoint_version <> p_previous_checkpoint_version + 1
     or p_previous_checkpoint_hash !~ '^[a-f0-9]{64}$'
     or p_round_two_result_hash !~ '^[a-f0-9]{64}$'
     or p_recovered_checkpoint_hash !~ '^[a-f0-9]{64}$'
     or p_recovered_checkpoint is null
     or jsonb_typeof(p_recovered_checkpoint) <> 'object' then
    raise exception 'SOURCE_LIMIT_RECOVERY_CHECKPOINT_INPUT_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-source-limit:' || p_incident_id::text,0)
  );

  select * into existing_recovery
    from public.real_editorial_source_limit_recoveries
   where recovery_key = p_recovery_key;
  if found then
    if existing_recovery.pilot_id = p_pilot_id
       and existing_recovery.run_id = p_run_id
       and existing_recovery.incident_id = p_incident_id
       and existing_recovery.actor_id = p_actor_id
       and existing_recovery.reason = btrim(p_reason)
       and existing_recovery.previous_checkpoint_version
         = p_previous_checkpoint_version
       and existing_recovery.previous_checkpoint_hash
         = p_previous_checkpoint_hash
       and existing_recovery.round_two_result_hash = p_round_two_result_hash
       and existing_recovery.recovered_checkpoint_version
         = p_recovered_checkpoint_version
       and existing_recovery.recovered_checkpoint_hash
         = p_recovered_checkpoint_hash
       and exists (
         select 1
           from public.real_editorial_artifacts artifact
          where artifact.run_id = p_run_id
            and artifact.artifact_kind = 'checkpoint'
            and artifact.artifact_key = 'workflow'
            and artifact.version = p_recovered_checkpoint_version
            and artifact.payload_hash = p_recovered_checkpoint_hash
            and artifact.payload = p_recovered_checkpoint
       ) then
      return existing_recovery.id;
    end if;
    raise exception 'SOURCE_LIMIT_RECOVERY_IDEMPOTENCY_CONFLICT';
  end if;
  if exists (
    select 1
      from public.real_editorial_source_limit_recoveries
     where incident_id = p_incident_id
  ) then
    raise exception 'SOURCE_LIMIT_RECOVERY_ALREADY_APPLIED';
  end if;

  select * into pilot
    from public.real_editorial_pilots
   where id = p_pilot_id
   for update;
  select * into run
    from public.real_editorial_runs
   where id = p_run_id
     and pilot_id = p_pilot_id
   for update;
  select * into budget
    from public.real_editorial_pilot_budgets
   where pilot_id = p_pilot_id
   for update;
  if pilot.id is null
     or run.id is null
     or budget.pilot_id is null
     or pilot.current_run_id <> p_run_id then
    raise exception 'SOURCE_LIMIT_RECOVERY_PILOT_RUN_INVALID';
  end if;
  if pilot.state <> 'researching_round_2'
     or run.state <> 'researching_round_2'
     or run.current_round <> 1 then
    raise exception 'SOURCE_LIMIT_RECOVERY_STATE_CHANGED';
  end if;
  if budget.reserved_cost <> 0
     or budget.spent_cost + budget.reserved_cost > budget.task_limit_cost then
    raise exception 'SOURCE_LIMIT_RECOVERY_LEDGER_INVALID';
  end if;

  select * into policy
    from public.real_editorial_pilot_policies
   where id = pilot.policy_id;
  if not found then
    raise exception 'SOURCE_LIMIT_RECOVERY_POLICY_MISSING';
  end if;
  maximum_sources := policy.max_accepted_sources;
  if maximum_sources <= 0 then
    raise exception 'SOURCE_LIMIT_RECOVERY_POLICY_INVALID';
  end if;

  select * into incident
    from public.real_editorial_incidents
   where id = p_incident_id
   for update;
  if not found
     or incident.pilot_id <> p_pilot_id
     or incident.run_id <> p_run_id
     or incident.code <> 'LIMIT_EXCEEDED'
     or incident.classification <> 'human_required'
     or incident.resolved_at is not null then
    raise exception 'SOURCE_LIMIT_RECOVERY_INCIDENT_INVALID';
  end if;

  if exists (
    select 1
      from public.real_editorial_execution_guard
     where guard_name = 'morella-real-editorial'
       and owner_execution_id is not null
       and expires_at > now()
  ) then
    raise exception 'SOURCE_LIMIT_RECOVERY_GUARD_BUSY';
  end if;
  if exists (
    select 1
      from public.real_editorial_call_reservations
     where pilot_id = p_pilot_id
       and run_id = p_run_id
       and state in ('reserved','started','unknown')
  ) then
    raise exception 'SOURCE_LIMIT_RECOVERY_PENDING_RESERVATION';
  end if;
  if exists (
    select 1
      from public.real_editorial_ambiguous_calls
     where pilot_id = p_pilot_id
       and run_id = p_run_id
       and resolved_at is null
  ) then
    raise exception 'SOURCE_LIMIT_RECOVERY_AMBIGUITY_OPEN';
  end if;

  select * into checkpoint
    from public.real_editorial_artifacts
   where run_id = p_run_id
     and artifact_kind = 'checkpoint'
     and artifact_key = 'workflow'
   order by version desc
   limit 1;
  if not found
     or checkpoint.version <> p_previous_checkpoint_version
     or checkpoint.payload_hash <> p_previous_checkpoint_hash
     or checkpoint.payload->>'version' <> 'real-workflow-v1'
     or checkpoint.payload->>'state' <> 'researching_round_2'
     or checkpoint.payload->>'completedRound' <> '1'
     or checkpoint.payload#>>'{initialMission,limits,maxSources}'
        is distinct from maximum_sources::text then
    raise exception 'SOURCE_LIMIT_RECOVERY_CHECKPOINT_CHANGED';
  end if;

  select * into round_two
    from public.real_editorial_artifacts
   where run_id = p_run_id
     and artifact_kind = 'tavily_result'
     and artifact_key = 'round-2'
   order by version desc
   limit 1;
  if not found
     or round_two.payload_hash <> p_round_two_result_hash
     or round_two.payload->>'round' <> '2'
     or jsonb_typeof(round_two.payload->'sources') <> 'array'
     or jsonb_typeof(round_two.payload->'providerRequestIds') <> 'array'
     or round_two.created_at > incident.created_at then
    raise exception 'SOURCE_LIMIT_RECOVERY_ROUND_TWO_INVALID';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(round_two.payload->'sources') source
     where source->>'round' is distinct from '2'
        or jsonb_typeof(source->'score') is distinct from 'number'
        or coalesce(source->>'id','') = ''
        or coalesce(source->>'title','') = ''
        or coalesce(source->>'normalizedUrl','') not like 'https://%'
        or coalesce(source->>'contentHash','') !~ '^[a-f0-9]{64}$'
  ) then
    raise exception 'SOURCE_LIMIT_RECOVERY_ROUND_TWO_SOURCE_INVALID';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(round_two.payload->'sources') source
     where not exists (
       select 1
         from public.real_editorial_artifacts accepted
        where accepted.run_id = p_run_id
          and accepted.artifact_kind = 'source_accepted'
          and accepted.artifact_key = source->>'id'
          and accepted.payload->>'normalizedUrl' = source->>'normalizedUrl'
          and accepted.payload->>'contentHash' = source->>'contentHash'
     )
        or not exists (
       select 1
         from public.real_editorial_artifacts extracted
        where extracted.run_id = p_run_id
          and extracted.artifact_kind = 'extracted_document'
          and extracted.artifact_key = source->>'id'
          and extracted.payload->>'normalizedUrl' = source->>'normalizedUrl'
          and extracted.payload->>'contentHash' = source->>'contentHash'
     )
  ) then
    raise exception 'SOURCE_LIMIT_RECOVERY_SOURCE_TRACE_MISSING';
  end if;
  if exists (
    select 1
      from public.real_editorial_artifacts
     where run_id = p_run_id
       and artifact_kind = 'round'
       and artifact_key = 'round-2'
  ) or exists (
    select 1
      from public.real_editorial_call_reservations
     where pilot_id = p_pilot_id
       and run_id = p_run_id
       and stage = '2_analysis'
  ) then
    raise exception 'SOURCE_LIMIT_RECOVERY_ANALYSIS_ALREADY_STARTED';
  end if;

  existing_full := checkpoint.payload#>'{dossier,sources}';
  if jsonb_typeof(existing_full) <> 'array'
     or jsonb_array_length(existing_full) = 0
     or exists (
       select 1
         from jsonb_array_elements(existing_full) source
        where source->>'round' <> '1'
           or jsonb_typeof(source->'score') <> 'number'
           or source->>'normalizedUrl' not like 'https://%'
           or source->>'contentHash' !~ '^[a-f0-9]{64}$'
     )
     or (
       select count(distinct source->>'normalizedUrl')
         from jsonb_array_elements(existing_full) source
     ) <> jsonb_array_length(existing_full) then
    raise exception 'SOURCE_LIMIT_RECOVERY_EXISTING_SOURCES_INVALID';
  end if;

  available_slots := maximum_sources - jsonb_array_length(existing_full);
  if available_slots <= 0 then
    raise exception 'SOURCE_LIMIT_RECOVERY_NO_AVAILABLE_SLOTS';
  end if;

  with source_candidates as (
    select source,
           source->>'normalizedUrl' as normalized_url,
           (source->>'score')::numeric as score,
           source->>'id' as source_id,
           row_number() over (
             partition by source->>'normalizedUrl'
             order by (source->>'score')::numeric desc,
                      source->>'normalizedUrl' collate "C",
                      source->>'id' collate "C"
           ) as duplicate_rank
      from jsonb_array_elements(round_two.payload->'sources') source
     where source->>'round' = '2'
       and jsonb_typeof(source->'score') = 'number'
       and source->>'normalizedUrl' like 'https://%'
       and source->>'contentHash' ~ '^[a-f0-9]{64}$'
  ),
  unique_candidates as (
    select source,normalized_url,score,source_id
      from source_candidates
     where duplicate_rank = 1
       and not exists (
         select 1
           from jsonb_array_elements(existing_full) previous
          where previous->>'normalizedUrl' = normalized_url
       )
     order by score desc,normalized_url collate "C",source_id collate "C"
  )
  select
    coalesce(jsonb_agg(source order by score desc,normalized_url collate "C",
      source_id collate "C"),'[]'::jsonb)
    into candidate_full
    from unique_candidates;

  if jsonb_array_length(candidate_full) <= available_slots then
    raise exception 'SOURCE_LIMIT_RECOVERY_OVERFLOW_NOT_PRESENT';
  end if;

  select coalesce(jsonb_agg(source order by ordinal),'[]'::jsonb)
    into selected_full
    from jsonb_array_elements(candidate_full) with ordinality ranked(source,ordinal)
   where ordinal <= available_slots;
  expected_sources := existing_full || selected_full;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',source->>'id',
      'round',1,
      'normalizedUrl',source->>'normalizedUrl',
      'title',source->>'title',
      'score',(source->>'score')::numeric,
      'contentHash',source->>'contentHash'
    ) order by ordinal),'[]'::jsonb)
    into existing_trace
    from jsonb_array_elements(existing_full) with ordinality traced(source,ordinal);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',source->>'id',
      'round',2,
      'normalizedUrl',source->>'normalizedUrl',
      'title',source->>'title',
      'score',(source->>'score')::numeric,
      'contentHash',source->>'contentHash'
    ) order by ordinal),'[]'::jsonb)
    into candidate_trace
    from jsonb_array_elements(candidate_full) with ordinality traced(source,ordinal);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',source->>'id',
      'round',2,
      'normalizedUrl',source->>'normalizedUrl',
      'title',source->>'title',
      'score',(source->>'score')::numeric,
      'contentHash',source->>'contentHash'
    ) order by ordinal),'[]'::jsonb)
    into selected_trace
    from jsonb_array_elements(selected_full) with ordinality traced(source,ordinal);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',source->>'id',
      'round',2,
      'normalizedUrl',source->>'normalizedUrl',
      'title',source->>'title',
      'score',(source->>'score')::numeric,
      'contentHash',source->>'contentHash',
      'rank',ordinal,
      'reason','global_source_limit_exhausted'
    ) order by ordinal),'[]'::jsonb)
    into excluded_trace
    from jsonb_array_elements(candidate_full) with ordinality traced(source,ordinal)
   where ordinal > available_slots;

  provider_calls_before := (checkpoint.payload->>'providerCalls')::integer;
  research_provider_calls :=
    jsonb_array_length(round_two.payload->'providerRequestIds');
  provider_calls_after := provider_calls_before + research_provider_calls;
  if provider_calls_before < 0 or research_provider_calls <= 0 then
    raise exception 'SOURCE_LIMIT_RECOVERY_PROVIDER_CALLS_INVALID';
  end if;

  if p_recovered_checkpoint->>'version' <> checkpoint.payload->>'version'
     or p_recovered_checkpoint->>'state' <> 'analyzing_round_2'
     or p_recovered_checkpoint->>'completedRound' <> '1'
     or p_recovered_checkpoint#>'{dossier,rounds}' <> '[1,2]'::jsonb
     or p_recovered_checkpoint#>'{dossier,sources}' <> expected_sources
     or p_recovered_checkpoint#>'{dossier,evidence}'
        <> checkpoint.payload#>'{dossier,evidence}'
     or (p_recovered_checkpoint->>'providerCalls')::integer <> provider_calls_after
     or (p_recovered_checkpoint->>'simulatedCost')::numeric <> budget.spent_cost
     or (p_recovered_checkpoint - array[
       'state','dossier','providerCalls','simulatedCost','updatedAt'
     ]) <> (checkpoint.payload - array[
       'state','dossier','providerCalls','simulatedCost','updatedAt'
     ]) then
    raise exception 'SOURCE_LIMIT_RECOVERY_CHECKPOINT_INVALID';
  end if;

  insert into public.real_editorial_source_limit_recoveries (
    id,recovery_key,pilot_id,run_id,incident_id,actor_id,reason,
    previous_checkpoint_version,previous_checkpoint_hash,
    recovered_checkpoint_version,recovered_checkpoint_hash,
    round_two_result_hash,maximum_sources,available_slots,
    existing_sources,candidate_sources,selected_sources,excluded_sources,
    provider_calls_before,research_provider_calls,provider_calls_after,
    spent_cost,reserved_cost,current_maximum_cost
  ) values (
    recovery_id,p_recovery_key,p_pilot_id,p_run_id,p_incident_id,p_actor_id,
    btrim(p_reason),p_previous_checkpoint_version,p_previous_checkpoint_hash,
    p_recovered_checkpoint_version,p_recovered_checkpoint_hash,
    p_round_two_result_hash,maximum_sources,available_slots,
    existing_trace,candidate_trace,selected_trace,excluded_trace,
    provider_calls_before,research_provider_calls,provider_calls_after,
    budget.spent_cost,budget.reserved_cost,budget.task_limit_cost
  );

  insert into public.real_editorial_artifacts (
    pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
  ) values (
    p_pilot_id,p_run_id,'checkpoint','workflow',
    p_recovered_checkpoint_version,p_recovered_checkpoint,
    p_recovered_checkpoint_hash
  );

  update public.real_editorial_incidents
     set resolved_at = now()
   where id = p_incident_id;
  update public.real_editorial_runs
     set state = 'evaluating_round_2',
         current_round = 1,
         checkpoint_version = p_recovered_checkpoint_version,
         accumulated_cost = budget.spent_cost,
         completed_at = null
   where id = p_run_id
     and pilot_id = p_pilot_id;
  update public.real_editorial_pilots
     set state = 'evaluating_round_2'
   where id = p_pilot_id
     and current_run_id = p_run_id;

  insert into public.real_editorial_events (
    pilot_id,run_id,event_type,state,payload
  ) values (
    p_pilot_id,p_run_id,'real.editorial.source_limit.human_recovered',
    'evaluating_round_2',jsonb_build_object(
      'actorId',p_actor_id,
      'recoveryId',recovery_id,
      'incidentId',p_incident_id,
      'previousCheckpointVersion',p_previous_checkpoint_version,
      'recoveredCheckpointVersion',p_recovered_checkpoint_version,
      'maximumSources',maximum_sources,
      'availableSlots',available_slots,
      'selectedSources',selected_trace,
      'excludedSources',excluded_trace,
      'providerCallsBefore',provider_calls_before,
      'researchProviderCalls',research_provider_calls,
      'providerCallsAfter',provider_calls_after,
      'spentCostEur',budget.spent_cost,
      'reservedCostEur',budget.reserved_cost,
      'currentMaximumCostEur',budget.task_limit_cost,
      'openAIAnalysisRoundTwoPending',true,
      'reason',btrim(p_reason)
    )
  );

  return recovery_id;
end;
$$;

revoke all on function public.recover_real_editorial_source_limit(
  text,uuid,uuid,uuid,uuid,text,integer,text,text,integer,jsonb,text
) from public,anon,authenticated;

grant execute on function public.recover_real_editorial_source_limit(
  text,uuid,uuid,uuid,uuid,text,integer,text,text,integer,jsonb,text
) to service_role;
