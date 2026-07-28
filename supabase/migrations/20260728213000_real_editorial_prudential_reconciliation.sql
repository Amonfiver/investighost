-- Conciliación humana prudencial de una subpetición remota ambigua.
-- Conserva las decisiones previas, deriva el coste desde el ledger y la tarifa,
-- y únicamente deja el checkpoint disponible para una reanudación posterior.

alter table public.real_editorial_ambiguous_calls
  drop constraint if exists real_editorial_ambiguous_calls_terminal_decision_check;

alter table public.real_editorial_ambiguous_calls
  add constraint real_editorial_ambiguous_calls_terminal_decision_check
  check (
    terminal_decision is null
    or terminal_decision in (
      'no_consumption',
      'consumption_confirmed',
      'indeterminate',
      'prudential_cost_assumed',
      'cancel_permanently'
    )
  );

alter table public.real_editorial_call_human_resolutions
  drop constraint if exists real_editorial_call_human_resolutions_decision_check;

alter table public.real_editorial_call_human_resolutions
  add constraint real_editorial_call_human_resolutions_decision_check
  check (
    decision in (
      'no_consumption',
      'consumption_confirmed',
      'indeterminate',
      'prudential_cost_assumed',
      'cancel_permanently'
    )
  ),
  add column reason text,
  add column prudential_cost numeric(18,9),
  add column released_reserve numeric(18,9),
  add column provider_id text,
  add column operation text,
  add column query text,
  add column origin text,
  add column provider_confirmed boolean,
  add column duplicate_charge_risk_accepted boolean,
  add column checkpoint_version integer,
  add column workflow_version text;

alter table public.real_editorial_call_human_resolutions
  add constraint real_editorial_prudential_trace_check
  check (
    (
      decision = 'prudential_cost_assumed'
      and reason is not null
      and length(btrim(reason)) between 1 and 500
      and reason !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
      and prudential_cost is not null
      and prudential_cost > 0
      and released_reserve is not null
      and released_reserve >= 0
      and provider_id is not null
      and length(btrim(provider_id)) between 1 and 160
      and operation is not null
      and length(btrim(operation)) between 1 and 160
      and query is not null
      and length(btrim(query)) between 1 and 2000
      and origin is not null
      and origin = 'human_prudential_reconciliation'
      and provider_confirmed is not null
      and provider_confirmed = false
      and duplicate_charge_risk_accepted is not null
      and duplicate_charge_risk_accepted = true
      and checkpoint_version is not null
      and checkpoint_version > 0
      and workflow_version is not null
      and length(btrim(workflow_version)) between 1 and 160
    )
    or
    (
      decision <> 'prudential_cost_assumed'
      and reason is null
      and prudential_cost is null
      and released_reserve is null
      and provider_id is null
      and operation is null
      and query is null
      and origin is null
      and provider_confirmed is null
      and duplicate_charge_risk_accepted is null
      and checkpoint_version is null
      and workflow_version is null
    )
  );

create or replace function public.reconcile_real_editorial_ambiguous_call_prudential(
  p_resolution_key text,
  p_pilot_id uuid,
  p_run_id uuid,
  p_call_id uuid,
  p_actor_id uuid,
  p_prudential_cost numeric,
  p_currency text,
  p_reason text,
  p_note text,
  p_duplicate_charge_risk_accepted boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  ambiguity public.real_editorial_ambiguous_calls%rowtype;
  reservation public.real_editorial_call_reservations%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  tariff public.real_editorial_tariffs%rowtype;
  pilot public.real_editorial_pilots%rowtype;
  run public.real_editorial_runs%rowtype;
  existing public.real_editorial_call_human_resolutions%rowtype;
  checkpoint_payload jsonb;
  request_payload jsonb;
  checkpoint_version integer;
  workflow_version text;
  query_text text;
  resolution_id uuid := gen_random_uuid();
  derived_cost numeric(18,9);
  released_reserve numeric(18,9);
  next_sequence integer;
  matched_incident_id uuid;
  matched_incident_count integer;
begin
  if p_resolution_key !~ '^[a-f0-9]{64}$' then
    raise exception 'HUMAN_RESOLUTION_KEY_INVALID';
  end if;
  if p_actor_id is null then
    raise exception 'PRUDENTIAL_ACTOR_REQUIRED';
  end if;
  if p_prudential_cost is null
     or p_prudential_cost::text = 'NaN'
     or p_prudential_cost <= 0 then
    raise exception 'PRUDENTIAL_COST_INVALID';
  end if;
  if p_currency is null or p_currency <> 'EUR' then
    raise exception 'PRUDENTIAL_CURRENCY_INVALID';
  end if;
  if p_reason is null
     or length(btrim(p_reason)) not between 1 and 500
     or p_reason ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])' then
    raise exception 'PRUDENTIAL_REASON_INVALID';
  end if;
  if p_note is not null and (
    length(btrim(p_note)) not between 1 and 1000
    or p_note ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ) then
    raise exception 'HUMAN_RESOLUTION_NOTE_UNSAFE';
  end if;
  if p_duplicate_charge_risk_accepted is distinct from true then
    raise exception 'PRUDENTIAL_DUPLICATE_CHARGE_RISK_NOT_ACCEPTED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-human:' || p_call_id::text,0)
  );

  select * into existing
    from public.real_editorial_call_human_resolutions
   where resolution_key = p_resolution_key;
  if found then
    if existing.pilot_id = p_pilot_id
       and existing.run_id = p_run_id
       and existing.call_id = p_call_id
       and existing.actor_id = p_actor_id
       and existing.decision = 'prudential_cost_assumed'
       and existing.prudential_cost = p_prudential_cost
       and existing.currency = p_currency
       and existing.reason = btrim(p_reason)
       and existing.note is not distinct from p_note
       and existing.duplicate_charge_risk_accepted = true then
      return existing.id;
    end if;
    raise exception 'HUMAN_RESOLUTION_IDEMPOTENCY_CONFLICT';
  end if;

  select * into ambiguity
    from public.real_editorial_ambiguous_calls
   where call_id = p_call_id
   for update;
  if not found
     or ambiguity.pilot_id <> p_pilot_id
     or ambiguity.run_id <> p_run_id then
    raise exception 'AMBIGUOUS_CALL_NOT_FOUND';
  end if;
  if ambiguity.resolved_at is not null then
    raise exception 'AMBIGUOUS_CALL_ALREADY_RESOLVED';
  end if;
  if ambiguity.source_state <> 'unknown' then
    raise exception 'PRUDENTIAL_CALL_NOT_AMBIGUOUS';
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
  if pilot.id is null
     or run.id is null
     or pilot.current_run_id <> p_run_id then
    raise exception 'PRUDENTIAL_PILOT_RUN_INVALID';
  end if;
  if pilot.state not in (
       'preflight',
       'researching_round_1',
       'evaluating_round_1',
       'researching_round_2',
       'evaluating_round_2',
       'generating_adventure',
       'generating_student',
       'final_review'
     )
     or run.state not in (
       'preflight',
       'researching_round_1',
       'evaluating_round_1',
       'researching_round_2',
       'evaluating_round_2',
       'generating_adventure',
       'generating_student',
       'final_review'
     ) then
    raise exception 'PRUDENTIAL_PILOT_STATE_INVALID';
  end if;
  if exists (
    select 1
      from public.real_editorial_execution_guard
     where guard_name = 'morella-real-editorial'
       and owner_execution_id is not null
       and expires_at > now()
  ) then
    raise exception 'PRUDENTIAL_GUARD_BUSY';
  end if;

  select * into reservation
    from public.real_editorial_call_reservations
   where id = ambiguity.reservation_id
   for update;
  if not found
     or reservation.call_id <> p_call_id
     or reservation.pilot_id <> p_pilot_id
     or reservation.run_id <> p_run_id then
    raise exception 'AMBIGUOUS_RESERVATION_MISMATCH';
  end if;
  if reservation.state <> 'unknown' then
    raise exception 'AMBIGUOUS_RESERVATION_STATE_CHANGED';
  end if;
  if reservation.currency <> p_currency then
    raise exception 'PRUDENTIAL_CURRENCY_MISMATCH';
  end if;

  select * into tariff
    from public.real_editorial_tariffs
   where id = reservation.tariff_id;
  if not found
     or tariff.provider_id <> reservation.provider_id
     or tariff.model <> reservation.model
     or tariff.currency <> reservation.currency
     or tariff.operation <> 'search'
     or tariff.unit_scale <= 0
     or tariff.credit_unit_cost <= 0 then
    raise exception 'PRUDENTIAL_TARIFF_INVALID';
  end if;
  if reservation.provider_id <> 'tavily'
     or reservation.operation <> 'research' then
    raise exception 'PRUDENTIAL_CALL_NOT_SUPPORTED';
  end if;

  derived_cost := round(tariff.credit_unit_cost / tariff.unit_scale,9);
  if p_prudential_cost > reservation.reserved_cost then
    raise exception 'PRUDENTIAL_COST_ABOVE_RESERVATION';
  end if;
  if p_prudential_cost > derived_cost then
    raise exception 'PRUDENTIAL_COST_ABOVE_SUBREQUEST_MAXIMUM';
  end if;
  if p_prudential_cost <> derived_cost then
    raise exception 'PRUDENTIAL_COST_MUST_EQUAL_SUBREQUEST_MAXIMUM';
  end if;

  if exists (
    select 1
      from public.real_editorial_artifacts
     where run_id = p_run_id
       and artifact_kind = 'tavily_result'
       and payload->>'originCallId' = p_call_id::text
  ) or exists (
    select 1
      from public.real_editorial_events
     where pilot_id = p_pilot_id
       and run_id = p_run_id
       and event_type = 'real.editorial.tavily.request.late_completed'
       and payload->>'callId' = p_call_id::text
  ) then
    raise exception 'PRUDENTIAL_PROVIDER_RESULT_BECAME_DURABLE';
  end if;

  select payload into request_payload
    from public.real_editorial_events
   where pilot_id = p_pilot_id
     and run_id = p_run_id
     and event_type in (
       'real.editorial.tavily.request.started',
       'real.editorial.tavily.request.ambiguous'
     )
     and payload->>'callId' = p_call_id::text
   order by occurred_at desc
   limit 1;

  select payload,version into checkpoint_payload,checkpoint_version
    from public.real_editorial_artifacts
   where run_id = p_run_id
     and artifact_kind = 'checkpoint'
     and artifact_key = 'workflow'
   order by version desc
   limit 1;
  if checkpoint_payload is null then
    raise exception 'PRUDENTIAL_CHECKPOINT_NOT_FOUND';
  end if;
  workflow_version := nullif(checkpoint_payload->>'version','');
  query_text := nullif(request_payload->>'query','');
  if query_text is null
     and checkpoint_payload->>'state' = 'researching_round_2'
     and checkpoint_payload->>'completedRound' = '1' then
    query_text := nullif(
      checkpoint_payload#>>'{nextRoundQueries,0,query}',
      ''
    );
  end if;
  if query_text is null or length(query_text) > 2000 then
    raise exception 'PRUDENTIAL_QUERY_NOT_DURABLE';
  end if;
  if workflow_version is null
     or length(workflow_version) > 160
     or checkpoint_version is null
     or checkpoint_version <= 0 then
    raise exception 'PRUDENTIAL_CHECKPOINT_INVALID';
  end if;

  select * into budget
    from public.real_editorial_pilot_budgets
   where pilot_id = p_pilot_id
   for update;
  if not found then
    raise exception 'REAL_EDITORIAL_BUDGET_MISSING';
  end if;
  if budget.currency <> p_currency then
    raise exception 'PRUDENTIAL_CURRENCY_MISMATCH';
  end if;
  if budget.reserved_cost < reservation.reserved_cost then
    raise exception 'PRUDENTIAL_RESERVE_LEDGER_MISMATCH';
  end if;
  if budget.spent_cost + budget.reserved_cost
       - reservation.reserved_cost + derived_cost > budget.task_limit_cost
     or budget.spent_cost + budget.reserved_cost
       - reservation.reserved_cost + derived_cost > budget.batch_limit_cost
     or budget.spent_cost + budget.reserved_cost
       - reservation.reserved_cost + derived_cost > budget.daily_limit_cost then
    raise exception 'HUMAN_RESOLUTION_BUDGET_EXCEEDED';
  end if;
  released_reserve := reservation.reserved_cost - derived_cost;

  insert into public.real_editorial_call_human_resolutions (
    id,resolution_key,call_id,reservation_id,pilot_id,run_id,actor_id,decision,
    recognized_cost,currency,credits,input_tokens,output_tokens,note,reason,
    prudential_cost,released_reserve,provider_id,operation,query,origin,
    provider_confirmed,duplicate_charge_risk_accepted,checkpoint_version,
    workflow_version
  ) values (
    resolution_id,p_resolution_key,p_call_id,reservation.id,p_pilot_id,p_run_id,
    p_actor_id,'prudential_cost_assumed',0,p_currency,0,0,0,p_note,btrim(p_reason),
    derived_cost,released_reserve,reservation.provider_id,reservation.operation,
    query_text,'human_prudential_reconciliation',false,true,checkpoint_version,
    workflow_version
  );

  update public.real_editorial_pilot_budgets
     set reserved_cost = reserved_cost - reservation.reserved_cost,
         spent_cost = spent_cost + derived_cost
   where pilot_id = p_pilot_id;

  update public.real_editorial_call_reservations
     set state = 'failed',
         calculated_cost = derived_cost,
         reconciled_at = now()
   where id = reservation.id;

  select coalesce(max(sequence),0) + 1 into next_sequence
    from public.real_editorial_provider_calls
   where call_id = p_call_id;
  insert into public.real_editorial_provider_calls (
    call_id,sequence,reservation_id,pilot_id,run_id,stage,operation,provider_id,
    model,state,attempt,retry_of_call_id,input_tokens,output_tokens,tool_calls,
    tools,credits,estimated_cost,reserved_cost,calculated_cost,currency,tariff_id,
    sanitized_error,prompt_version,schema_version,input_hash
  ) values (
    p_call_id,next_sequence,reservation.id,p_pilot_id,p_run_id,reservation.stage,
    reservation.operation,reservation.provider_id,reservation.model,'failed',
    reservation.attempt,reservation.retry_of_call_id,0,0,0,'[]'::jsonb,0,
    reservation.estimated_cost,reservation.reserved_cost,derived_cost,
    reservation.currency,reservation.tariff_id,
    'HUMAN_PRUDENTIAL_COST_ASSUMED',
    reservation.prompt_version,reservation.schema_version,reservation.input_hash
  );

  update public.real_editorial_runs
     set state = 'preflight',
         cancel_requested_at = null,
         cancelled_at = null,
         completed_at = null,
         accumulated_cost = budget.spent_cost + derived_cost
   where id = p_run_id
     and pilot_id = p_pilot_id;
  update public.real_editorial_pilots
     set state = 'preflight'
   where id = p_pilot_id
     and current_run_id = p_run_id;

  if ambiguity.incident_id is null then
    select count(*),(array_agg(id order by created_at))[1]
      into matched_incident_count,matched_incident_id
      from public.real_editorial_incidents
     where pilot_id = p_pilot_id
       and run_id = p_run_id
       and classification = 'ambiguous'
       and code in ('TIMEOUT','NETWORK_AMBIGUOUS')
       and resolved_at is null
       and created_at between ambiguity.opened_at
         and ambiguity.opened_at + interval '5 minutes';
    if matched_incident_count <> 1 then
      matched_incident_id := null;
    end if;
  else
    matched_incident_id := ambiguity.incident_id;
  end if;

  update public.real_editorial_ambiguous_calls
     set resolved_at = now(),
         terminal_decision = 'prudential_cost_assumed',
         terminal_resolution_id = resolution_id,
         incident_id = coalesce(incident_id,matched_incident_id)
   where call_id = p_call_id;
  if matched_incident_id is not null then
    update public.real_editorial_incidents
       set resolved_at = coalesce(resolved_at,now())
     where id = matched_incident_id;
  end if;

  insert into public.real_editorial_events (
    pilot_id,run_id,event_type,state,payload
  ) values (
    p_pilot_id,p_run_id,
    'real.editorial.remote_call.prudentially_reconciled',
    'preflight',
    jsonb_build_object(
      'actorId',p_actor_id,
      'callId',p_call_id,
      'reservationId',reservation.id,
      'providerId',reservation.provider_id,
      'operation',reservation.operation,
      'query',query_text,
      'decision','prudential_cost_assumed',
      'prudentialCostEur',derived_cost,
      'releasedReserveEur',released_reserve,
      'currency',p_currency,
      'reason',btrim(p_reason),
      'note',p_note,
      'origin','human_prudential_reconciliation',
      'providerConfirmed',false,
      'possibleDuplicateChargeAccepted',true,
      'checkpointVersion',checkpoint_version,
      'workflowVersion',workflow_version
    )
  );

  return resolution_id;
end;
$$;

revoke all on function public.reconcile_real_editorial_ambiguous_call_prudential(
  text,uuid,uuid,uuid,uuid,numeric,text,text,text,boolean
) from public,anon,authenticated;

grant execute on function public.reconcile_real_editorial_ambiguous_call_prudential(
  text,uuid,uuid,uuid,uuid,numeric,text,text,text,boolean
) to service_role;
