-- Identidad por ronda, recepción durable previa, persistencia atómica y
-- recuperación humana del análisis OpenAI de ronda 2 parcialmente persistido.

create table public.real_editorial_analysis_provider_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_key text not null unique check (receipt_key ~ '^[a-f0-9]{64}$'),
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  round integer not null check (round between 1 and 2),
  call_id uuid not null unique,
  reservation_id uuid not null unique
    references public.real_editorial_call_reservations(id) on delete restrict,
  attempt integer not null check (attempt between 1 and 10),
  remote_id text,
  analysis jsonb not null check (jsonb_typeof(analysis) = 'object'),
  analysis_hash text not null check (analysis_hash ~ '^[a-f0-9]{64}$'),
  usage jsonb not null check (jsonb_typeof(usage) = 'object'),
  received_at timestamptz not null default now(),
  unique (run_id,round,attempt)
);

create index real_editorial_analysis_receipts_run_idx
  on public.real_editorial_analysis_provider_receipts(pilot_id,run_id,round,received_at desc);

alter table public.real_editorial_analysis_provider_receipts enable row level security;
revoke all on table public.real_editorial_analysis_provider_receipts
from public,anon,authenticated;
grant select on table public.real_editorial_analysis_provider_receipts to service_role;

create trigger real_editorial_analysis_receipts_append_only
  before update or delete on public.real_editorial_analysis_provider_receipts
  for each row execute function public.prevent_real_editorial_append_mutation();

create or replace function public.record_real_editorial_analysis_response(
  p_receipt_key text,
  p_pilot_id uuid,
  p_run_id uuid,
  p_round integer,
  p_call_id uuid,
  p_reservation_id uuid,
  p_attempt integer,
  p_remote_id text,
  p_analysis jsonb,
  p_analysis_hash text,
  p_usage jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing_receipt public.real_editorial_analysis_provider_receipts%rowtype;
  reservation public.real_editorial_call_reservations%rowtype;
  receipt_id uuid := gen_random_uuid();
begin
  if p_receipt_key !~ '^[a-f0-9]{64}$'
     or p_analysis_hash !~ '^[a-f0-9]{64}$'
     or p_round not between 1 and 2
     or p_attempt not between 1 and 10
     or jsonb_typeof(p_analysis) <> 'object'
     or jsonb_typeof(p_usage) <> 'object' then
    raise exception 'ANALYSIS_RECEIPT_INPUT_INVALID';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-analysis-receipt:' || p_call_id::text,0)
  );
  select * into existing_receipt
    from public.real_editorial_analysis_provider_receipts
   where receipt_key = p_receipt_key;
  if found then
    if existing_receipt.pilot_id = p_pilot_id
       and existing_receipt.run_id = p_run_id
       and existing_receipt.round = p_round
       and existing_receipt.call_id = p_call_id
       and existing_receipt.reservation_id = p_reservation_id
       and existing_receipt.attempt = p_attempt
       and existing_receipt.remote_id is not distinct from p_remote_id
       and existing_receipt.analysis_hash = p_analysis_hash
       and existing_receipt.analysis = p_analysis
       and existing_receipt.usage = p_usage then
      return existing_receipt.id;
    end if;
    raise exception 'ANALYSIS_RECEIPT_CONFLICT';
  end if;
  if exists (
    select 1 from public.real_editorial_analysis_provider_receipts
     where call_id = p_call_id or reservation_id = p_reservation_id
  ) then
    raise exception 'ANALYSIS_RECEIPT_CONFLICT';
  end if;
  select * into reservation
    from public.real_editorial_call_reservations
   where id = p_reservation_id
     and call_id = p_call_id
     and pilot_id = p_pilot_id
     and run_id = p_run_id
   for update;
  if not found
     or reservation.provider_id <> 'openai'
     or reservation.operation <> 'analysis'
     or reservation.stage <> (p_round::text || '_analysis')
     or reservation.attempt <> p_attempt
     or reservation.state <> 'started' then
    raise exception 'ANALYSIS_RECEIPT_CALL_INVALID';
  end if;
  if not exists (
    select 1 from public.real_editorial_provider_calls
     where call_id = p_call_id and reservation_id = p_reservation_id and state = 'started'
  ) then
    raise exception 'ANALYSIS_RECEIPT_CALL_NOT_STARTED';
  end if;
  insert into public.real_editorial_analysis_provider_receipts (
    id,receipt_key,pilot_id,run_id,round,call_id,reservation_id,attempt,
    remote_id,analysis,analysis_hash,usage
  ) values (
    receipt_id,p_receipt_key,p_pilot_id,p_run_id,p_round,p_call_id,p_reservation_id,
    p_attempt,p_remote_id,p_analysis,p_analysis_hash,p_usage
  );
  return receipt_id;
end;
$$;

create or replace function public.persist_real_editorial_analysis(
  p_pilot_id uuid,
  p_run_id uuid,
  p_round integer,
  p_provider_receipt_id uuid,
  p_artifacts jsonb
) returns integer language plpgsql security definer set search_path = public as $$
declare
  artifact jsonb;
  inserted_count integer := 0;
  expected_round_key text;
begin
  if p_round not between 1 and 2
     or jsonb_typeof(p_artifacts) <> 'array'
     or jsonb_array_length(p_artifacts) = 0 then
    raise exception 'ANALYSIS_ARTIFACT_BATCH_INVALID';
  end if;
  expected_round_key := 'round-' || p_round::text;
  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-analysis:' || p_run_id::text || ':' || p_round::text,0)
  );
  if not exists (
    select 1 from public.real_editorial_runs
     where id = p_run_id and pilot_id = p_pilot_id
  ) then
    raise exception 'ANALYSIS_ARTIFACT_RUN_INVALID';
  end if;
  if p_provider_receipt_id is not null and not exists (
    select 1 from public.real_editorial_analysis_provider_receipts
     where id = p_provider_receipt_id
       and pilot_id = p_pilot_id and run_id = p_run_id and round = p_round
  ) then
    raise exception 'ANALYSIS_RECEIPT_MISSING';
  end if;
  if (
    select count(*) from jsonb_array_elements(p_artifacts) item
     where item->>'kind' = 'round'
       and item->>'key' = expected_round_key
       and item->>'version' = '1'
  ) <> 1 then
    raise exception 'ANALYSIS_CANONICAL_ROUND_MISSING';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(p_artifacts) as item(
        kind text,key text,version integer,payload jsonb,"payloadHash" text
      )
     where item.kind not in (
       'round','query','evidence','master_knowledge','fact','place','activity',
       'gap','contradiction','coverage'
     )
        or item.key is null
        or item.key !~ ('^round-' || p_round::text || '(/|$)')
        or item.version <> 1
        or jsonb_typeof(item.payload) not in ('object','array')
        or item."payloadHash" !~ '^[a-f0-9]{64}$'
        or (
          item.kind = 'query' and (
            (item.payload->>'generatingRound') is distinct from p_round::text
            or item.key is distinct from expected_round_key || '/' || (item.payload->>'id')
            or coalesce(item.payload->>'queryOrdinal','') !~ '^[1-9][0-9]*$'
            or (p_round = 2 and (item.payload->>'actionable') is distinct from 'false')
          )
        )
  ) then
    raise exception 'ANALYSIS_ARTIFACT_IDENTITY_INVALID';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(p_artifacts) as item(
        kind text,key text,version integer,payload jsonb,"payloadHash" text
      )
     group by item.kind,item.key,item.version having count(*) > 1
  ) then
    raise exception 'ANALYSIS_ARTIFACT_DUPLICATE_IDENTITY';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(p_artifacts) as item(
        kind text,key text,version integer,payload jsonb,"payloadHash" text
      )
      join public.real_editorial_artifacts existing
        on existing.run_id = p_run_id
       and existing.artifact_kind = item.kind
       and existing.artifact_key = item.key
       and existing.version = item.version
     where existing.payload_hash <> item."payloadHash"
        or existing.payload <> item.payload
  ) then
    raise exception 'ANALYSIS_ARTIFACT_CONFLICT';
  end if;
  for artifact in select value from jsonb_array_elements(p_artifacts) loop
    insert into public.real_editorial_artifacts (
      pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
    ) values (
      p_pilot_id,p_run_id,artifact->>'kind',artifact->>'key',
      (artifact->>'version')::integer,artifact->'payload',artifact->>'payloadHash'
    ) on conflict (run_id,artifact_kind,artifact_key,version) do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  if inserted_count > 0 then
    insert into public.real_editorial_events (
      pilot_id,run_id,event_type,state,payload
    ) values (
      p_pilot_id,p_run_id,'real.editorial.analysis.persisted_atomically',
      case when p_round = 1 then 'evaluating_round_1' else 'evaluating_round_2' end,
      jsonb_build_object(
        'round',p_round,'artifactCount',jsonb_array_length(p_artifacts),
        'insertedCount',inserted_count,'providerReceiptId',p_provider_receipt_id
      )
    );
  end if;
  return inserted_count;
end;
$$;

create table public.real_editorial_partial_analysis_recoveries (
  id uuid primary key default gen_random_uuid(),
  recovery_key text not null unique check (recovery_key ~ '^[a-f0-9]{64}$'),
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  incident_id uuid not null unique references public.real_editorial_incidents(id) on delete restrict,
  call_id uuid not null unique,
  reservation_id uuid not null unique
    references public.real_editorial_call_reservations(id) on delete restrict,
  actor_id uuid not null,
  reason text not null check (
    length(btrim(reason)) between 1 and 500
    and reason !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ),
  round integer not null check (round = 2),
  checkpoint_version integer not null check (checkpoint_version > 0),
  partial_artifacts jsonb not null check (
    jsonb_typeof(partial_artifacts) = 'array'
    and jsonb_array_length(partial_artifacts) = 38
  ),
  partial_artifacts_hash text not null check (partial_artifacts_hash ~ '^[a-f0-9]{64}$'),
  artifact_counts jsonb not null check (jsonb_typeof(artifact_counts) = 'object'),
  maximum_exposure_cost numeric(18,9) not null check (maximum_exposure_cost > 0),
  recognized_cost numeric(18,9) not null check (
    recognized_cost > 0 and recognized_cost = maximum_exposure_cost
  ),
  spent_cost_before numeric(18,9) not null check (spent_cost_before >= 0),
  current_maximum_cost numeric(18,9) not null check (current_maximum_cost >= 0),
  recovered_at timestamptz not null default now(),
  unique (pilot_id,run_id,incident_id)
);

create index real_editorial_partial_analysis_recovery_run_idx
  on public.real_editorial_partial_analysis_recoveries(pilot_id,run_id,recovered_at desc);

alter table public.real_editorial_partial_analysis_recoveries enable row level security;
revoke all on table public.real_editorial_partial_analysis_recoveries
from public,anon,authenticated;
grant select on table public.real_editorial_partial_analysis_recoveries to service_role;

create trigger real_editorial_partial_analysis_recoveries_append_only
  before update or delete on public.real_editorial_partial_analysis_recoveries
  for each row execute function public.prevent_real_editorial_append_mutation();

create or replace function public.recover_real_editorial_partial_analysis(
  p_recovery_key text,
  p_pilot_id uuid,
  p_run_id uuid,
  p_incident_id uuid,
  p_call_id uuid,
  p_reservation_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_assumed_cost numeric,
  p_checkpoint_version integer,
  p_partial_artifacts jsonb,
  p_partial_artifacts_hash text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing_recovery public.real_editorial_partial_analysis_recoveries%rowtype;
  pilot public.real_editorial_pilots%rowtype;
  run public.real_editorial_runs%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  incident public.real_editorial_incidents%rowtype;
  reservation public.real_editorial_call_reservations%rowtype;
  started_at timestamptz;
  terminal_call public.real_editorial_provider_calls%rowtype;
  recovery_id uuid := gen_random_uuid();
  next_sequence integer;
  artifact_counts jsonb;
begin
  if p_recovery_key !~ '^[a-f0-9]{64}$'
     or p_partial_artifacts_hash !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_partial_artifacts) <> 'array'
     or jsonb_array_length(p_partial_artifacts) <> 38
     or p_actor_id is null
     or p_reason is null or length(btrim(p_reason)) not between 1 and 500
     or p_reason ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])' then
    raise exception 'PARTIAL_ANALYSIS_RECOVERY_INPUT_INVALID';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-partial-analysis:' || p_incident_id::text,0)
  );
  select * into existing_recovery
    from public.real_editorial_partial_analysis_recoveries
   where recovery_key = p_recovery_key;
  if found then
    if existing_recovery.pilot_id = p_pilot_id
       and existing_recovery.run_id = p_run_id
       and existing_recovery.incident_id = p_incident_id
       and existing_recovery.call_id = p_call_id
       and existing_recovery.reservation_id = p_reservation_id
       and existing_recovery.actor_id = p_actor_id
       and existing_recovery.reason = btrim(p_reason)
       and existing_recovery.recognized_cost = p_assumed_cost
       and existing_recovery.checkpoint_version = p_checkpoint_version
       and existing_recovery.partial_artifacts_hash = p_partial_artifacts_hash
       and existing_recovery.partial_artifacts = p_partial_artifacts then
      return existing_recovery.id;
    end if;
    raise exception 'PARTIAL_ANALYSIS_RECOVERY_IDEMPOTENCY_CONFLICT';
  end if;
  if exists (
    select 1 from public.real_editorial_partial_analysis_recoveries
     where incident_id = p_incident_id or call_id = p_call_id
  ) then
    raise exception 'PARTIAL_ANALYSIS_RECOVERY_ALREADY_APPLIED';
  end if;
  select * into pilot from public.real_editorial_pilots
   where id = p_pilot_id for update;
  select * into run from public.real_editorial_runs
   where id = p_run_id and pilot_id = p_pilot_id for update;
  select * into budget from public.real_editorial_pilot_budgets
   where pilot_id = p_pilot_id for update;
  if pilot.id is null or run.id is null or budget.pilot_id is null
     or pilot.current_run_id <> p_run_id
     or pilot.state <> 'evaluating_round_2'
     or run.state <> 'evaluating_round_2'
     or run.current_round <> 1 then
    raise exception 'PARTIAL_ANALYSIS_STATE_CHANGED';
  end if;
  if budget.reserved_cost <> 0
     or budget.spent_cost + p_assumed_cost > budget.task_limit_cost then
    raise exception 'PARTIAL_ANALYSIS_BUDGET_INVALID';
  end if;
  select * into incident from public.real_editorial_incidents
   where id = p_incident_id for update;
  if not found or incident.pilot_id <> p_pilot_id or incident.run_id <> p_run_id
     or incident.code <> 'VERSION_CONFLICT'
     or incident.classification <> 'human_required'
     or incident.resolved_at is not null
     or incident.message not like 'El artefacto durable query/q1 v1 diverge%query%' then
    raise exception 'PARTIAL_ANALYSIS_INCIDENT_INVALID';
  end if;
  select * into reservation from public.real_editorial_call_reservations
   where id = p_reservation_id and call_id = p_call_id
     and pilot_id = p_pilot_id and run_id = p_run_id for update;
  if not found or reservation.provider_id <> 'openai'
     or reservation.operation <> 'analysis' or reservation.stage <> '2_analysis'
     or reservation.attempt <> 1 or reservation.state <> 'failed'
     or coalesce(reservation.calculated_cost,0) <> 0
     or p_assumed_cost <> reservation.reserved_cost then
    raise exception 'PARTIAL_ANALYSIS_CALL_INVALID';
  end if;
  select created_at into started_at from public.real_editorial_provider_calls
   where call_id = p_call_id and reservation_id = p_reservation_id and state = 'started'
   order by sequence desc limit 1;
  select * into terminal_call from public.real_editorial_provider_calls
   where call_id = p_call_id order by sequence desc limit 1;
  if started_at is null or terminal_call.state <> 'failed'
     or terminal_call.sanitized_error not like '%VERSION_CONFLICT%' then
    raise exception 'PARTIAL_ANALYSIS_CALL_INVALID';
  end if;
  if exists (
    select 1 from public.real_editorial_analysis_provider_receipts
     where call_id = p_call_id
  ) or exists (
    select 1 from public.real_editorial_artifacts
     where run_id = p_run_id and artifact_kind = 'round' and artifact_key = 'round-2'
  ) or (
    select coalesce(max(version),0) from public.real_editorial_artifacts
     where run_id = p_run_id and artifact_kind = 'checkpoint' and artifact_key = 'workflow'
  ) <> p_checkpoint_version then
    raise exception 'PARTIAL_ANALYSIS_STATE_CHANGED';
  end if;
  if (
    select count(*)
      from jsonb_to_recordset(p_partial_artifacts) as item(
        id uuid,kind text,key text,version integer,"payloadHash" text,"createdAt" timestamptz
      )
      join public.real_editorial_artifacts artifact on artifact.id = item.id
     where artifact.pilot_id = p_pilot_id and artifact.run_id = p_run_id
       and artifact.artifact_kind = item.kind and artifact.artifact_key = item.key
       and artifact.version = item.version and artifact.payload_hash = item."payloadHash"
       and artifact.created_at = item."createdAt"
       and artifact.created_at between started_at and incident.created_at
       and (
         (artifact.artifact_kind = 'contradiction' and artifact.version = 1
           and artifact.artifact_key ~ '^round-2-[0-9]+$')
         or (artifact.artifact_kind <> 'contradiction' and artifact.version = 2)
       )
  ) <> 38 or (
    select count(*) from public.real_editorial_artifacts
     where pilot_id = p_pilot_id and run_id = p_run_id
       and artifact_kind in (
         'master_knowledge','coverage','fact','evidence','place','activity','gap','contradiction'
       )
       and created_at between started_at and incident.created_at
  ) <> 38 then
    raise exception 'PARTIAL_ANALYSIS_ARTIFACTS_CHANGED';
  end if;
  select jsonb_build_object(
    'masterKnowledge',count(*) filter (where artifact_kind = 'master_knowledge'),
    'coverage',count(*) filter (where artifact_kind = 'coverage'),
    'facts',count(*) filter (where artifact_kind = 'fact'),
    'evidence',count(*) filter (where artifact_kind = 'evidence'),
    'places',count(*) filter (where artifact_kind = 'place'),
    'activities',count(*) filter (where artifact_kind = 'activity'),
    'gaps',count(*) filter (where artifact_kind = 'gap'),
    'contradictions',count(*) filter (where artifact_kind = 'contradiction'),
    'queries',0,'total',count(*)
  ) into artifact_counts
  from public.real_editorial_artifacts
  where pilot_id = p_pilot_id and run_id = p_run_id
    and artifact_kind in (
      'master_knowledge','coverage','fact','evidence','place','activity','gap','contradiction'
    ) and created_at between started_at and incident.created_at;
  if artifact_counts <> jsonb_build_object(
    'masterKnowledge',1,'coverage',1,'facts',10,'evidence',10,'places',5,
    'activities',1,'gaps',6,'contradictions',4,'queries',0,'total',38
  ) or exists (
    select 1 from public.real_editorial_artifacts
     where pilot_id = p_pilot_id and run_id = p_run_id and artifact_kind = 'query'
       and created_at between started_at and incident.created_at
  ) then
    raise exception 'PARTIAL_ANALYSIS_ARTIFACTS_CHANGED';
  end if;
  if exists (
    select 1 from public.real_editorial_execution_guard
     where guard_name = 'morella-real-editorial' and owner_execution_id is not null
       and expires_at > now()
  ) or exists (
    select 1 from public.real_editorial_call_reservations
     where pilot_id = p_pilot_id and run_id = p_run_id
       and state in ('reserved','started','unknown')
  ) then
    raise exception 'PARTIAL_ANALYSIS_GUARD_OR_RESERVATION_ACTIVE';
  end if;
  insert into public.real_editorial_partial_analysis_recoveries (
    id,recovery_key,pilot_id,run_id,incident_id,call_id,reservation_id,actor_id,
    reason,round,checkpoint_version,partial_artifacts,partial_artifacts_hash,
    artifact_counts,maximum_exposure_cost,recognized_cost,spent_cost_before,
    current_maximum_cost
  ) values (
    recovery_id,p_recovery_key,p_pilot_id,p_run_id,p_incident_id,p_call_id,
    p_reservation_id,p_actor_id,btrim(p_reason),2,p_checkpoint_version,
    p_partial_artifacts,p_partial_artifacts_hash,artifact_counts,
    reservation.reserved_cost,p_assumed_cost,budget.spent_cost,budget.task_limit_cost
  );
  update public.real_editorial_pilot_budgets
     set spent_cost = spent_cost + p_assumed_cost
   where pilot_id = p_pilot_id;
  update public.real_editorial_call_reservations
     set calculated_cost = p_assumed_cost
   where id = p_reservation_id;
  select coalesce(max(sequence),0) + 1 into next_sequence
    from public.real_editorial_provider_calls where call_id = p_call_id;
  insert into public.real_editorial_provider_calls (
    call_id,sequence,reservation_id,pilot_id,run_id,stage,operation,provider_id,
    model,state,attempt,retry_of_call_id,input_tokens,output_tokens,tool_calls,
    tools,credits,estimated_cost,reserved_cost,calculated_cost,currency,tariff_id,
    sanitized_error,prompt_version,schema_version,input_hash
  ) values (
    p_call_id,next_sequence,p_reservation_id,p_pilot_id,p_run_id,reservation.stage,
    reservation.operation,reservation.provider_id,reservation.model,'succeeded',
    reservation.attempt,reservation.retry_of_call_id,0,0,1,'[]'::jsonb,0,
    reservation.estimated_cost,reservation.reserved_cost,p_assumed_cost,
    reservation.currency,reservation.tariff_id,
    'HUMAN_PRUDENTIAL_RESPONSE_RECEIVED_PERSISTENCE_FAILED',
    reservation.prompt_version,reservation.schema_version,reservation.input_hash
  );
  update public.real_editorial_incidents set resolved_at = now()
   where id = p_incident_id;
  update public.real_editorial_runs
     set accumulated_cost = budget.spent_cost + p_assumed_cost
   where id = p_run_id and pilot_id = p_pilot_id;
  insert into public.real_editorial_events (
    pilot_id,run_id,event_type,state,payload
  ) values (
    p_pilot_id,p_run_id,'real.editorial.analysis.partial_recovered',
    'evaluating_round_2',jsonb_build_object(
      'recoveryId',recovery_id,'actorId',p_actor_id,'incidentId',p_incident_id,
      'callId',p_call_id,'reservationId',p_reservation_id,'artifactCount',38,
      'recognizedCostEur',p_assumed_cost,'responseComplete',false,
      'providerCalled',false,'workflowResumed',false,'checkpointVersion',p_checkpoint_version
    )
  );
  return recovery_id;
end;
$$;

revoke all on function public.record_real_editorial_analysis_response(
  text,uuid,uuid,integer,uuid,uuid,integer,text,jsonb,text,jsonb
) from public,anon,authenticated;
revoke all on function public.persist_real_editorial_analysis(
  uuid,uuid,integer,uuid,jsonb
) from public,anon,authenticated;
revoke all on function public.recover_real_editorial_partial_analysis(
  text,uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,integer,jsonb,text
) from public,anon,authenticated;

grant execute on function public.record_real_editorial_analysis_response(
  text,uuid,uuid,integer,uuid,uuid,integer,text,jsonb,text,jsonb
) to service_role;
grant execute on function public.persist_real_editorial_analysis(
  uuid,uuid,integer,uuid,jsonb
) to service_role;
grant execute on function public.recover_real_editorial_partial_analysis(
  text,uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,integer,jsonb,text
) to service_role;
