-- Autoriza la redacción tras aceptar cobertura cuando el coste restante ya cabe
-- en el máximo humano vigente. No amplía el presupuesto ni ejecuta proveedores.

alter table public.real_editorial_budget_decisions
  drop constraint real_editorial_budget_decisions_decision_check;

alter table public.real_editorial_budget_decisions
  add constraint real_editorial_budget_decisions_decision_check check (
    decision in (
      'keep_limit','authorize_within_limit','authorize_extension','cancel_permanently'
    )
  );

create or replace function public.resolve_real_editorial_coverage_budget_within_limit(
  p_decision_key text,
  p_pilot_id uuid,
  p_run_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_new_maximum_cost numeric,
  p_reason text,
  p_note text,
  p_checkpoint_version integer,
  p_checkpoint_previous_hash text,
  p_checkpoint_payload jsonb,
  p_checkpoint_payload_hash text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  review public.real_editorial_budget_reviews%rowtype;
  coverage_decision public.real_editorial_coverage_decisions%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  existing public.real_editorial_budget_decisions%rowtype;
  checkpoint public.real_editorial_artifacts%rowtype;
  decision_id uuid := gen_random_uuid();
  total_estimated numeric;
begin
  if p_decision_key !~ '^[a-f0-9]{64}$'
     or p_decision <> 'authorize_within_limit' then
    raise exception 'COVERAGE_WITHIN_LIMIT_DECISION_INVALID';
  end if;
  if p_reason is null
     or length(btrim(p_reason)) not between 1 and 500
     or p_reason ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])' then
    raise exception 'BUDGET_DECISION_REASON_INVALID';
  end if;
  if p_note is not null and (
    length(btrim(p_note)) not between 1 and 1000
    or p_note ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ) then
    raise exception 'BUDGET_DECISION_NOTE_UNSAFE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-coverage-budget:' || p_run_id::text,0)
  );
  select * into existing from public.real_editorial_budget_decisions
   where decision_key = p_decision_key;
  if found then
    if existing.pilot_id = p_pilot_id and existing.run_id = p_run_id
       and existing.actor_id = p_actor_id and existing.decision = p_decision
       and existing.new_maximum_cost = p_new_maximum_cost
       and existing.reason = p_reason and existing.note is not distinct from p_note then
      return existing.id;
    end if;
    raise exception 'BUDGET_DECISION_IDEMPOTENCY_CONFLICT';
  end if;

  select * into review from public.real_editorial_budget_reviews
   where pilot_id = p_pilot_id and run_id = p_run_id
     and review_context = 'coverage_acceptance'
   order by opened_at desc limit 1 for update;
  if not found or review.status not in ('pending','kept') then
    raise exception 'COVERAGE_BUDGET_REVIEW_NOT_PENDING';
  end if;
  select * into coverage_decision from public.real_editorial_coverage_decisions
   where id = review.coverage_decision_id and decision = 'accept_with_warnings'
     and risk_accepted;
  if not found then raise exception 'COVERAGE_ACCEPTANCE_MISSING'; end if;
  if not exists (
    select 1 from public.real_editorial_pilots
     where id = p_pilot_id and current_run_id = p_run_id and state = 'review_required'
  ) or not exists (
    select 1 from public.real_editorial_runs
     where id = p_run_id and pilot_id = p_pilot_id and state = 'review_required'
  ) then raise exception 'BUDGET_DECISION_STATE_CHANGED'; end if;
  if exists (
    select 1 from public.real_editorial_execution_guard
     where guard_name = 'morella-real-editorial'
       and owner_execution_id is not null and expires_at > now()
  ) then raise exception 'BUDGET_DECISION_GUARD_BUSY'; end if;
  if exists (
    select 1 from public.real_editorial_call_reservations
     where pilot_id = p_pilot_id and run_id = p_run_id
       and state in ('reserved','started','unknown')
  ) then raise exception 'BUDGET_DECISION_PENDING_RESERVATIONS'; end if;

  select * into budget from public.real_editorial_pilot_budgets
   where pilot_id = p_pilot_id for share;
  if not found or budget.reserved_cost <> 0 then
    raise exception 'REAL_EDITORIAL_BUDGET_INVALID';
  end if;
  total_estimated := budget.spent_cost + budget.reserved_cost
    + review.remaining_estimated_cost;
  if p_new_maximum_cost <> budget.task_limit_cost
     or budget.task_limit_cost <> budget.batch_limit_cost
     or budget.batch_limit_cost <> budget.daily_limit_cost
     or total_estimated > budget.task_limit_cost then
    raise exception 'COVERAGE_COST_DOES_NOT_FIT_CURRENT_LIMIT';
  end if;

  select * into checkpoint from public.real_editorial_artifacts
   where run_id = p_run_id and artifact_kind = 'checkpoint' and artifact_key = 'workflow'
   order by version desc limit 1;
  if not found or checkpoint.version <> review.checkpoint_version
     or checkpoint.payload_hash <> review.checkpoint_hash
     or checkpoint.version + 1 <> p_checkpoint_version
     or p_checkpoint_previous_hash <> checkpoint.payload_hash
     or checkpoint.payload->>'state' <> 'review_required'
     or checkpoint.payload->>'completedRound' <> '2'
     or checkpoint.payload#>>'{lastDecision,action}' <> 'stop_review_required' then
    raise exception 'COVERAGE_BUDGET_CHECKPOINT_CHANGED';
  end if;
  if p_checkpoint_payload is null
     or p_checkpoint_payload_hash !~ '^[a-f0-9]{64}$'
     or p_checkpoint_payload->>'state' <> 'ready_for_drafting'
     or p_checkpoint_payload->>'completedRound' <> '2'
     or p_checkpoint_payload->'nextRoundQueries' <> '[]'::jsonb
     or p_checkpoint_payload#>>'{editorialConstraints,decisionId}'
        <> coverage_decision.id::text
     or p_checkpoint_payload#>>'{editorialConstraints,checkpointVersion}'
        <> coverage_decision.checkpoint_version::text
     or p_checkpoint_payload#>>'{editorialConstraints,checkpointHash}'
        <> coverage_decision.checkpoint_hash
     or p_checkpoint_payload#>>'{editorialConstraints,mode}' <> 'accept_with_warnings'
     or p_checkpoint_payload#>'{editorialConstraints,unresolvedGapIds}'
        <> (select jsonb_agg(item->>'gapId' order by item->>'gapId')
              from jsonb_array_elements(coverage_decision.gap_dispositions) item)
     or p_checkpoint_payload#>'{editorialConstraints,contradictions}'
        <> coverage_decision.known_contradictions
     or p_checkpoint_payload#>'{editorialConstraints,affectedProfiles}'
        <> coverage_decision.affected_profiles
     or p_checkpoint_payload#>'{editorialConstraints,safetyRules}'
        <> coverage_decision.safety_constraints
     or (p_checkpoint_payload - array['state','updatedAt','editorialConstraints'])
        <> (checkpoint.payload - array['state','updatedAt','editorialConstraints']) then
    raise exception 'COVERAGE_BUDGET_CHECKPOINT_INVALID';
  end if;

  insert into public.real_editorial_budget_decisions (
    id,decision_key,review_id,pilot_id,run_id,actor_id,decision,
    previous_maximum_cost,new_maximum_cost,spent_cost,reserved_cost,
    remaining_estimated_cost,total_estimated_cost,reason,note
  ) values (
    decision_id,p_decision_key,review.id,p_pilot_id,p_run_id,p_actor_id,p_decision,
    budget.task_limit_cost,budget.task_limit_cost,budget.spent_cost,budget.reserved_cost,
    review.remaining_estimated_cost,total_estimated,p_reason,p_note
  );
  insert into public.real_editorial_artifacts (
    pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
  ) values (
    p_pilot_id,p_run_id,'checkpoint','workflow',p_checkpoint_version,
    p_checkpoint_payload,p_checkpoint_payload_hash
  );
  update public.real_editorial_budget_reviews
     set status = 'authorized',latest_decision_id = decision_id,resolved_at = now()
   where id = review.id;
  update public.real_editorial_incidents set resolved_at = coalesce(resolved_at,now())
   where id = review.incident_id;
  update public.real_editorial_runs
     set state = 'preflight',cancel_requested_at = null,cancelled_at = null,
         completed_at = null,checkpoint_version = p_checkpoint_version,
         accumulated_cost = budget.spent_cost
   where id = p_run_id and pilot_id = p_pilot_id;
  update public.real_editorial_pilots set state = 'preflight'
   where id = p_pilot_id and current_run_id = p_run_id;
  insert into public.real_editorial_events (
    pilot_id,run_id,event_type,state,payload
  ) values (
    p_pilot_id,p_run_id,'real.editorial.coverage_budget.human_decided','preflight',
    jsonb_build_object(
      'coverageDecisionId',coverage_decision.id,'decisionId',decision_id,
      'actorId',p_actor_id,'decision',p_decision,
      'previousMaximumCostEur',budget.task_limit_cost,
      'newMaximumCostEur',budget.task_limit_cost,
      'spentCostEur',budget.spent_cost,'reservedCostEur',budget.reserved_cost,
      'remainingEstimatedCostEur',review.remaining_estimated_cost,
      'totalEstimatedCostEur',total_estimated,'reason',p_reason,'note',p_note,
      'providerCalled',false,'workflowResumed',false,'budgetLimitChanged',false
    )
  );
  return decision_id;
end;
$$;

revoke all on function public.resolve_real_editorial_coverage_budget_within_limit(
  text,uuid,uuid,uuid,text,numeric,text,text,integer,text,jsonb,text
) from public,anon,authenticated;

grant execute on function public.resolve_real_editorial_coverage_budget_within_limit(
  text,uuid,uuid,uuid,text,numeric,text,text,integer,text,jsonb,text
) to service_role;
