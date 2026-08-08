-- Repara exclusivamente la barrera presupuestaria omitida por el retorno
-- prematuro de review_required tras una ronda 1 focalizable. No decide,
-- no amplía presupuesto, no reanuda el workflow y no abre cobertura de ronda 2.

create or replace function public.materialize_real_editorial_round_one_budget_review(
  p_pilot_id uuid,
  p_run_id uuid,
  p_checkpoint_version integer,
  p_checkpoint_hash text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  pilot public.real_editorial_pilots%rowtype;
  run public.real_editorial_runs%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  checkpoint public.real_editorial_artifacts%rowtype;
  source_incident public.real_editorial_incidents%rowtype;
  existing public.real_editorial_budget_reviews%rowtype;
  budget_incident_id uuid := gen_random_uuid();
  review_id uuid := gen_random_uuid();
  focused_queries jsonb;
  analysis_cost numeric(18,9);
  remaining_estimated numeric(18,9);
  materialized_at timestamptz := now();
begin
  if p_checkpoint_version is null or p_checkpoint_version <= 0
     or p_checkpoint_hash is null
     or p_checkpoint_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_CHECKPOINT_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-round-one-budget-repair:' || p_run_id::text,0)
  );

  select * into pilot from public.real_editorial_pilots
   where id = p_pilot_id and current_run_id = p_run_id
   for update;
  select * into run from public.real_editorial_runs
   where id = p_run_id and pilot_id = p_pilot_id
   for update;
  if pilot.id is null or run.id is null
     or pilot.state <> 'review_required'
     or run.state <> 'review_required'
     or run.current_round <> 1 then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_STATE_INVALID';
  end if;

  if exists (
    select 1 from public.real_editorial_execution_guard
     where owner_execution_id is not null and expires_at > now()
  ) then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_GUARD_BUSY';
  end if;
  if exists (
    select 1 from public.real_editorial_call_reservations
     where pilot_id = p_pilot_id and run_id = p_run_id
       and state in ('reserved','started','unknown')
  ) then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_PENDING_RESERVATIONS';
  end if;
  if exists (
    select 1 from public.real_editorial_coverage_reviews
     where pilot_id = p_pilot_id and run_id = p_run_id
  ) then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_COVERAGE_EXISTS';
  end if;

  select * into budget from public.real_editorial_pilot_budgets
   where pilot_id = p_pilot_id
   for update;
  if not found or budget.reserved_cost <> 0 then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_LEDGER_INVALID';
  end if;

  select * into checkpoint from public.real_editorial_artifacts
   where run_id = p_run_id
     and artifact_kind = 'checkpoint'
     and artifact_key = 'workflow'
   order by version desc
   limit 1;
  if not found
     or checkpoint.version <> p_checkpoint_version
     or checkpoint.payload_hash <> p_checkpoint_hash
     or checkpoint.payload->>'state' <> 'review_required'
     or checkpoint.payload->>'completedRound' <> '1'
     or checkpoint.payload#>>'{lastDecision,action}' <> 'continue_focused'
     or checkpoint.payload->'nextRoundQueries' <> '[]'::jsonb
     or jsonb_typeof(checkpoint.payload->'simulatedCost') <> 'number'
     or (checkpoint.payload->>'simulatedCost')::numeric <> budget.spent_cost
     or jsonb_typeof(checkpoint.payload->'lastAnalysisCost') <> 'number' then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_CHECKPOINT_CHANGED';
  end if;

  focused_queries := checkpoint.payload#>'{lastDecision,queries}';
  if jsonb_typeof(focused_queries) <> 'array'
     or jsonb_array_length(focused_queries) <> 3
     or exists (
       select 1 from jsonb_array_elements(focused_queries) item
        where jsonb_typeof(item) <> 'object'
           or length(btrim(coalesce(item->>'id',''))) = 0
           or length(btrim(coalesce(item->>'gapId',''))) = 0
           or length(btrim(coalesce(item->>'query',''))) = 0
     ) then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_QUERIES_INVALID';
  end if;

  analysis_cost := (checkpoint.payload->>'lastAnalysisCost')::numeric;
  if analysis_cost = 'NaN'::numeric or analysis_cost < 0 then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_ANALYSIS_COST_INVALID';
  end if;
  remaining_estimated := round(
    0.048000000 + greatest(0.022000000,analysis_cost) + 0.040000000 + 0.020000000,
    9
  );
  if budget.spent_cost + budget.reserved_cost + remaining_estimated
     <= budget.task_limit_cost then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_NOT_REQUIRED';
  end if;

  select * into existing from public.real_editorial_budget_reviews
   where pilot_id = p_pilot_id and run_id = p_run_id
   order by opened_at desc
   limit 1;
  if found then
    if existing.review_context = 'workflow_completion'
       and existing.remaining_estimated_cost = remaining_estimated
       and exists (
         select 1 from public.real_editorial_incidents incident
          where incident.id = existing.incident_id
            and incident.code = 'BUDGET_EXCEEDED'
            and incident.classification = 'human_required'
       ) then
      return existing.id;
    end if;
    raise exception 'ROUND_ONE_BUDGET_REPAIR_REVIEW_CONFLICT';
  end if;

  select * into source_incident from public.real_editorial_incidents
   where pilot_id = p_pilot_id and run_id = p_run_id
     and code = 'REVIEW_REQUIRED'
     and classification = 'human_required'
     and resolved_at is null
   order by created_at desc
   limit 1
   for update;
  if not found then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_SOURCE_INCIDENT_MISSING';
  end if;

  insert into public.real_editorial_incidents (
    id,pilot_id,run_id,code,classification,message,created_at
  ) values (
    budget_incident_id,p_pilot_id,p_run_id,'BUDGET_EXCEEDED','human_required',
    'La estimación operativa para completar el piloto es '
      || remaining_estimated::text
      || ' EUR adicionales; el checkpoint de ronda 1 requiere una decisión presupuestaria humana.',
    materialized_at
  );
  insert into public.real_editorial_budget_reviews (
    id,pilot_id,run_id,incident_id,status,initial_maximum_cost,
    opened_spent_cost,opened_reserved_cost,remaining_estimated_cost,
    review_context,opened_at
  ) values (
    review_id,p_pilot_id,p_run_id,budget_incident_id,'pending',budget.task_limit_cost,
    budget.spent_cost,budget.reserved_cost,remaining_estimated,
    'workflow_completion',materialized_at
  );
  update public.real_editorial_incidents
     set resolved_at = materialized_at
   where id = source_incident.id;

  insert into public.real_editorial_events (
    pilot_id,run_id,event_type,state,payload,occurred_at
  ) values (
    p_pilot_id,p_run_id,'real.editorial.budget.review_materialized','review_required',
    jsonb_build_object(
      'reviewId',review_id,
      'incidentId',budget_incident_id,
      'supersededIncidentId',source_incident.id,
      'checkpointVersion',checkpoint.version,
      'checkpointHash',checkpoint.payload_hash,
      'focusedQueryCount',jsonb_array_length(focused_queries),
      'spentCostEur',budget.spent_cost,
      'reservedCostEur',budget.reserved_cost,
      'currentMaximumCostEur',budget.task_limit_cost,
      'remainingEstimatedCostEur',remaining_estimated,
      'projectedTotalCostEur',budget.spent_cost + budget.reserved_cost + remaining_estimated,
      'providerCalled',false,
      'workflowResumed',false,
      'budgetChanged',false,
      'coverageReviewOpened',false
    ),
    materialized_at
  );
  return review_id;
end;
$$;

revoke all on function public.materialize_real_editorial_round_one_budget_review(
  uuid,uuid,integer,text
) from public,anon,authenticated;

grant execute on function public.materialize_real_editorial_round_one_budget_review(
  uuid,uuid,integer,text
) to service_role;
