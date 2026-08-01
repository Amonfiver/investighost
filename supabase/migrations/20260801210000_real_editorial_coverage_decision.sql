-- Decisión humana durable de cobertura tras agotar las dos rondas reales.
-- La decisión no ejecuta proveedores, no cambia el ledger y no reanuda el workflow.

create table public.real_editorial_coverage_reviews (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  checkpoint_version integer not null check (checkpoint_version > 0),
  checkpoint_hash text not null check (checkpoint_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('pending','kept','accepted','rejected')),
  coverage_score numeric(9,8) not null check (coverage_score between 0 and 1),
  gaps jsonb not null check (jsonb_typeof(gaps) = 'array' and jsonb_array_length(gaps) > 0),
  contradictions jsonb not null check (
    jsonb_typeof(contradictions) = 'array' and jsonb_array_length(contradictions) > 0
  ),
  affected_profiles jsonb not null check (
    jsonb_typeof(affected_profiles) = 'array' and jsonb_array_length(affected_profiles) > 0
  ),
  latest_decision_id uuid,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (run_id,checkpoint_version),
  check (
    (status in ('pending','kept') and resolved_at is null)
    or (status in ('accepted','rejected') and resolved_at is not null)
  )
);

create table public.real_editorial_coverage_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_key text not null unique check (decision_key ~ '^[a-f0-9]{64}$'),
  review_id uuid not null references public.real_editorial_coverage_reviews(id) on delete restrict,
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  checkpoint_version integer not null check (checkpoint_version > 0),
  checkpoint_hash text not null check (checkpoint_hash ~ '^[a-f0-9]{64}$'),
  actor_id uuid not null,
  decision text not null check (
    decision in ('keep_review_required','reject_editorial_run','accept_with_warnings')
  ),
  reason text not null check (
    length(btrim(reason)) between 1 and 500
    and reason !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ),
  note text check (
    note is null
    or (
      length(btrim(note)) between 1 and 1000
      and note !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
    )
  ),
  gap_dispositions jsonb not null check (
    jsonb_typeof(gap_dispositions) = 'array' and jsonb_array_length(gap_dispositions) > 0
  ),
  known_contradictions jsonb not null check (
    jsonb_typeof(known_contradictions) = 'array'
    and jsonb_array_length(known_contradictions) > 0
  ),
  affected_profiles jsonb not null check (
    jsonb_typeof(affected_profiles) = 'array' and jsonb_array_length(affected_profiles) > 0
  ),
  safety_constraints jsonb not null check (jsonb_typeof(safety_constraints) = 'array'),
  risk_accepted boolean not null,
  risk_statement text not null check (length(btrim(risk_statement)) between 1 and 2000),
  spent_cost numeric(18,9) not null check (spent_cost >= 0),
  reserved_cost numeric(18,9) not null check (reserved_cost >= 0),
  maximum_cost numeric(18,9) not null check (maximum_cost >= 0),
  remaining_estimated_cost numeric(18,9) not null check (remaining_estimated_cost >= 0),
  projected_total_cost numeric(18,9) not null check (projected_total_cost >= 0),
  shortfall_cost numeric(18,9) not null check (shortfall_cost >= 0),
  decided_at timestamptz not null default now(),
  check (
    (decision = 'accept_with_warnings' and risk_accepted and remaining_estimated_cost = 0.060000000)
    or (decision <> 'accept_with_warnings' and not risk_accepted and remaining_estimated_cost = 0)
  )
);

alter table public.real_editorial_coverage_reviews
  add constraint real_editorial_coverage_reviews_latest_decision_fkey
  foreign key (latest_decision_id)
  references public.real_editorial_coverage_decisions(id) on delete restrict;

alter table public.real_editorial_budget_reviews
  add column review_context text not null default 'workflow_completion'
    check (review_context in ('workflow_completion','coverage_acceptance')),
  add column coverage_decision_id uuid
    references public.real_editorial_coverage_decisions(id) on delete restrict,
  add column checkpoint_version integer check (checkpoint_version is null or checkpoint_version > 0),
  add column checkpoint_hash text check (
    checkpoint_hash is null or checkpoint_hash ~ '^[a-f0-9]{64}$'
  ),
  add constraint real_editorial_budget_review_context_fields check (
    (review_context = 'workflow_completion'
      and coverage_decision_id is null
      and checkpoint_version is null
      and checkpoint_hash is null)
    or (review_context = 'coverage_acceptance'
      and coverage_decision_id is not null
      and checkpoint_version is not null
      and checkpoint_hash is not null
      and remaining_estimated_cost = 0.060000000)
  );

create index real_editorial_coverage_reviews_run_idx
  on public.real_editorial_coverage_reviews(pilot_id,run_id,opened_at desc);

alter table public.real_editorial_coverage_reviews enable row level security;
alter table public.real_editorial_coverage_decisions enable row level security;

revoke all on table
  public.real_editorial_coverage_reviews,
  public.real_editorial_coverage_decisions
from public,anon,authenticated;

grant select on table
  public.real_editorial_coverage_reviews,
  public.real_editorial_coverage_decisions
to service_role;

create trigger real_editorial_coverage_reviews_no_delete
  before delete on public.real_editorial_coverage_reviews
  for each row execute function public.prevent_real_editorial_append_mutation();

create trigger real_editorial_coverage_decisions_append_only
  before update or delete on public.real_editorial_coverage_decisions
  for each row execute function public.prevent_real_editorial_append_mutation();

create or replace function public.resolve_real_editorial_coverage_review(
  p_decision_key text,
  p_pilot_id uuid,
  p_run_id uuid,
  p_checkpoint_version integer,
  p_checkpoint_hash text,
  p_actor_id uuid,
  p_decision text,
  p_reason text,
  p_note text,
  p_risk_accepted boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing public.real_editorial_coverage_decisions%rowtype;
  review public.real_editorial_coverage_reviews%rowtype;
  checkpoint public.real_editorial_artifacts%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  decision_id uuid := gen_random_uuid();
  review_id uuid := gen_random_uuid();
  incident_id uuid;
  budget_review_id uuid;
  gaps jsonb;
  contradictions jsonb;
  affected_profiles jsonb;
  gap_dispositions jsonb;
  safety_constraints jsonb := '[
    "avoid_categorical_contradictory_claims",
    "mark_pending_or_variable_data",
    "do_not_invent_operational_details",
    "adapt_warnings_to_profile",
    "preserve_evidence_traceability"
  ]'::jsonb;
  risk_statement text;
  coverage_score numeric;
  remaining_estimated numeric;
  projected_total numeric;
  shortfall numeric;
begin
  if p_decision_key !~ '^[a-f0-9]{64}$' then
    raise exception 'COVERAGE_DECISION_KEY_INVALID';
  end if;
  if p_decision not in (
    'keep_review_required','reject_editorial_run','accept_with_warnings'
  ) then
    raise exception 'COVERAGE_DECISION_INVALID';
  end if;
  if p_reason is null
     or length(btrim(p_reason)) not between 1 and 500
     or p_reason ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])' then
    raise exception 'COVERAGE_DECISION_REASON_INVALID';
  end if;
  if p_note is not null and (
    length(btrim(p_note)) not between 1 and 1000
    or p_note ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ) then
    raise exception 'COVERAGE_DECISION_NOTE_UNSAFE';
  end if;
  if (p_decision = 'accept_with_warnings') is distinct from p_risk_accepted then
    raise exception 'COVERAGE_DECISION_RISK_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-coverage-decision:' || p_run_id::text,0)
  );

  select * into existing
    from public.real_editorial_coverage_decisions
   where decision_key = p_decision_key;
  if found then
    if existing.pilot_id = p_pilot_id
       and existing.run_id = p_run_id
       and existing.checkpoint_version = p_checkpoint_version
       and existing.checkpoint_hash = p_checkpoint_hash
       and existing.actor_id = p_actor_id
       and existing.decision = p_decision
       and existing.reason = p_reason
       and existing.note is not distinct from p_note
       and existing.risk_accepted = p_risk_accepted then
      return existing.id;
    end if;
    raise exception 'COVERAGE_DECISION_IDEMPOTENCY_CONFLICT';
  end if;

  if not exists (
    select 1 from public.real_editorial_pilots
     where id = p_pilot_id and current_run_id = p_run_id and state = 'review_required'
  ) or not exists (
    select 1 from public.real_editorial_runs
     where id = p_run_id and pilot_id = p_pilot_id and state = 'review_required'
  ) then
    raise exception 'COVERAGE_DECISION_STATE_CHANGED';
  end if;
  if exists (
    select 1 from public.real_editorial_execution_guard
     where guard_name = 'morella-real-editorial'
       and owner_execution_id is not null and expires_at > now()
  ) then
    raise exception 'COVERAGE_DECISION_GUARD_BUSY';
  end if;
  if exists (
    select 1 from public.real_editorial_call_reservations
     where pilot_id = p_pilot_id and run_id = p_run_id
       and state in ('reserved','started','unknown')
  ) then
    raise exception 'COVERAGE_DECISION_PENDING_RESERVATIONS';
  end if;

  select * into checkpoint
    from public.real_editorial_artifacts
   where run_id = p_run_id and artifact_kind = 'checkpoint' and artifact_key = 'workflow'
   order by version desc limit 1;
  if not found
     or checkpoint.version <> p_checkpoint_version
     or checkpoint.payload_hash <> p_checkpoint_hash
     or checkpoint.payload->>'state' <> 'review_required'
     or checkpoint.payload->>'completedRound' <> '2'
     or checkpoint.payload#>>'{lastDecision,action}' <> 'stop_review_required'
     or checkpoint.payload#>>'{coverage,sufficient}' <> 'false'
     or jsonb_typeof(checkpoint.payload->'unresolvedGaps') <> 'array'
     or jsonb_array_length(checkpoint.payload->'unresolvedGaps') = 0
     or jsonb_typeof(checkpoint.payload#>'{masterKnowledge,contradictions}') <> 'array'
     or jsonb_array_length(checkpoint.payload#>'{masterKnowledge,contradictions}') = 0 then
    raise exception 'COVERAGE_DECISION_CHECKPOINT_CHANGED';
  end if;

  gaps := checkpoint.payload->'unresolvedGaps';
  contradictions := checkpoint.payload#>'{masterKnowledge,contradictions}';
  coverage_score := (checkpoint.payload#>>'{coverage,score}')::numeric;
  select coalesce(jsonb_agg(to_jsonb(profile) order by profile),'[]'::jsonb)
    into affected_profiles
    from (
      select distinct jsonb_array_elements_text(
        coalesce(gap->'requiredForProfiles','[]'::jsonb)
      ) as profile
      from jsonb_array_elements(gaps) gap
    ) profiles;
  if jsonb_array_length(affected_profiles) = 0 then
    raise exception 'COVERAGE_DECISION_PROFILES_MISSING';
  end if;

  select * into review
    from public.real_editorial_coverage_reviews
   where run_id = p_run_id and checkpoint_version = p_checkpoint_version
   for update;
  if found then
    if review.pilot_id <> p_pilot_id
       or review.checkpoint_hash <> p_checkpoint_hash
       or review.gaps <> gaps
       or review.contradictions <> contradictions
       or review.affected_profiles <> affected_profiles then
      raise exception 'COVERAGE_REVIEW_CONFLICT';
    end if;
    if review.status in ('accepted','rejected') then
      raise exception 'COVERAGE_DECISION_ALREADY_TERMINAL';
    end if;
    review_id := review.id;
  else
    insert into public.real_editorial_coverage_reviews (
      id,pilot_id,run_id,checkpoint_version,checkpoint_hash,status,
      coverage_score,gaps,contradictions,affected_profiles
    ) values (
      review_id,p_pilot_id,p_run_id,p_checkpoint_version,p_checkpoint_hash,'pending',
      coverage_score,gaps,contradictions,affected_profiles
    );
  end if;

  select * into budget
    from public.real_editorial_pilot_budgets where pilot_id = p_pilot_id for update;
  if not found then raise exception 'REAL_EDITORIAL_BUDGET_MISSING'; end if;
  if budget.reserved_cost <> 0 then
    raise exception 'COVERAGE_DECISION_PENDING_RESERVATIONS';
  end if;

  remaining_estimated := case when p_decision = 'accept_with_warnings'
    then 0.060000000 else 0 end;
  projected_total := budget.spent_cost + budget.reserved_cost + remaining_estimated;
  shortfall := greatest(0,projected_total - budget.task_limit_cost);
  risk_statement := case p_decision
    when 'accept_with_warnings' then
      'Se acepta redactar con gaps y contradicciones no resueltos; toda afirmación afectada debe ser prudente, advertida y trazable.'
    when 'reject_editorial_run' then
      'El expediente se rechaza editorialmente y no se autoriza redacción ni publicación.'
    else
      'La revisión humana permanece abierta y no se acepta todavía ningún riesgo editorial.'
  end;
  select jsonb_agg(jsonb_build_object(
    'gapId',gap->>'id',
    'disposition',case p_decision
      when 'accept_with_warnings' then 'accepted_unresolved'
      when 'reject_editorial_run' then 'rejected'
      else 'pending'
    end
  ) order by gap->>'id') into gap_dispositions
  from jsonb_array_elements(gaps) gap;

  insert into public.real_editorial_coverage_decisions (
    id,decision_key,review_id,pilot_id,run_id,checkpoint_version,checkpoint_hash,
    actor_id,decision,reason,note,gap_dispositions,known_contradictions,
    affected_profiles,safety_constraints,risk_accepted,risk_statement,
    spent_cost,reserved_cost,maximum_cost,remaining_estimated_cost,
    projected_total_cost,shortfall_cost
  ) values (
    decision_id,p_decision_key,review_id,p_pilot_id,p_run_id,p_checkpoint_version,
    p_checkpoint_hash,p_actor_id,p_decision,p_reason,p_note,gap_dispositions,
    contradictions,affected_profiles,
    case when p_decision = 'accept_with_warnings' then safety_constraints else '[]'::jsonb end,
    p_risk_accepted,risk_statement,budget.spent_cost,budget.reserved_cost,
    budget.task_limit_cost,remaining_estimated,projected_total,shortfall
  );

  if p_decision = 'keep_review_required' then
    update public.real_editorial_coverage_reviews
       set status = 'kept',latest_decision_id = decision_id
     where id = review_id;
  elsif p_decision = 'reject_editorial_run' then
    update public.real_editorial_coverage_reviews
       set status = 'rejected',latest_decision_id = decision_id,resolved_at = now()
     where id = review_id;
    update public.real_editorial_incidents
       set resolved_at = coalesce(resolved_at,now())
     where pilot_id = p_pilot_id and run_id = p_run_id
       and code = 'REVIEW_REQUIRED' and resolved_at is null;
    update public.real_editorial_runs
       set state = 'cancelled',cancel_requested_at = now(),cancelled_at = now(),
           completed_at = now(),accumulated_cost = budget.spent_cost
     where id = p_run_id and pilot_id = p_pilot_id;
    update public.real_editorial_pilots set state = 'cancelled'
     where id = p_pilot_id and current_run_id = p_run_id;
  else
    update public.real_editorial_coverage_reviews
       set status = 'accepted',latest_decision_id = decision_id,resolved_at = now()
     where id = review_id;
    update public.real_editorial_incidents
       set resolved_at = coalesce(resolved_at,now())
     where pilot_id = p_pilot_id and run_id = p_run_id
       and code = 'REVIEW_REQUIRED' and resolved_at is null;
    incident_id := gen_random_uuid();
    budget_review_id := gen_random_uuid();
    insert into public.real_editorial_incidents (
      id,pilot_id,run_id,code,classification,message
    ) values (
      incident_id,p_pilot_id,p_run_id,'BUDGET_EXCEEDED','human_required',
      'La cobertura se aceptó con advertencias; quedan 0.060000 EUR de redacción y revisión final; se requiere una decisión presupuestaria separada.'
    );
    insert into public.real_editorial_budget_reviews (
      id,pilot_id,run_id,incident_id,status,initial_maximum_cost,
      opened_spent_cost,opened_reserved_cost,remaining_estimated_cost,
      review_context,coverage_decision_id,checkpoint_version,checkpoint_hash
    ) values (
      budget_review_id,p_pilot_id,p_run_id,incident_id,'pending',budget.task_limit_cost,
      budget.spent_cost,budget.reserved_cost,0.060000000,
      'coverage_acceptance',decision_id,p_checkpoint_version,p_checkpoint_hash
    );
  end if;

  insert into public.real_editorial_events (
    pilot_id,run_id,event_type,state,payload
  ) values (
    p_pilot_id,p_run_id,'real.editorial.coverage.human_decided',
    case when p_decision = 'reject_editorial_run' then 'cancelled' else 'review_required' end,
    jsonb_build_object(
      'decisionId',decision_id,'actorId',p_actor_id,'decision',p_decision,
      'checkpointVersion',p_checkpoint_version,'checkpointHash',p_checkpoint_hash,
      'gapDispositions',gap_dispositions,'contradictions',contradictions,
      'affectedProfiles',affected_profiles,'riskAccepted',p_risk_accepted,
      'riskStatement',risk_statement,'remainingEstimatedCostEur',remaining_estimated,
      'projectedTotalCostEur',projected_total,'shortfallCostEur',shortfall,
      'providerCalled',false,'workflowResumed',false,'budgetChanged',false
    )
  );
  return decision_id;
end;
$$;

create or replace function public.resolve_real_editorial_coverage_budget_review(
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
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  review public.real_editorial_budget_reviews%rowtype;
  coverage_decision public.real_editorial_coverage_decisions%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  existing public.real_editorial_budget_decisions%rowtype;
  checkpoint public.real_editorial_artifacts%rowtype;
  decision_id uuid := gen_random_uuid();
  previous_maximum numeric;
  normalized_new_maximum numeric;
  total_estimated numeric;
  next_status text;
  next_state text;
begin
  if p_decision_key !~ '^[a-f0-9]{64}$' then raise exception 'BUDGET_DECISION_KEY_INVALID'; end if;
  if p_decision not in ('keep_limit','authorize_extension','cancel_permanently') then
    raise exception 'BUDGET_DECISION_INVALID';
  end if;
  if p_reason is null
     or length(btrim(p_reason)) not between 1 and 500
     or p_reason ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])' then
    raise exception 'BUDGET_DECISION_REASON_INVALID';
  end if;
  if p_note is not null and (
    length(btrim(p_note)) not between 1 and 1000
    or p_note ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ) then raise exception 'BUDGET_DECISION_NOTE_UNSAFE'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-coverage-budget:' || p_run_id::text,0)
  );
  select * into existing from public.real_editorial_budget_decisions
   where decision_key = p_decision_key;
  if found then
    if existing.pilot_id = p_pilot_id and existing.run_id = p_run_id
       and existing.actor_id = p_actor_id and existing.decision = p_decision
       and existing.new_maximum_cost is not distinct from p_new_maximum_cost
       and existing.reason = p_reason and existing.note is not distinct from p_note then
      return existing.id;
    end if;
    raise exception 'BUDGET_DECISION_IDEMPOTENCY_CONFLICT';
  end if;

  select * into review from public.real_editorial_budget_reviews
   where pilot_id = p_pilot_id and run_id = p_run_id
     and review_context = 'coverage_acceptance'
   order by opened_at desc limit 1 for update;
  if not found then raise exception 'COVERAGE_BUDGET_REVIEW_NOT_FOUND'; end if;
  if review.status in ('authorized','cancelled') then
    raise exception 'BUDGET_DECISION_ALREADY_TERMINAL';
  end if;
  select * into coverage_decision from public.real_editorial_coverage_decisions
   where id = review.coverage_decision_id and decision = 'accept_with_warnings';
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

  select * into budget from public.real_editorial_pilot_budgets
   where pilot_id = p_pilot_id for update;
  if not found then raise exception 'REAL_EDITORIAL_BUDGET_MISSING'; end if;
  if budget.reserved_cost <> 0 then raise exception 'BUDGET_DECISION_PENDING_RESERVATIONS'; end if;
  previous_maximum := budget.task_limit_cost;
  total_estimated := budget.spent_cost + budget.reserved_cost + review.remaining_estimated_cost;
  normalized_new_maximum := case when p_decision = 'authorize_extension'
    then p_new_maximum_cost else previous_maximum end;
  if normalized_new_maximum is null or normalized_new_maximum = 'NaN'::numeric
     or normalized_new_maximum < 0 then raise exception 'BUDGET_DECISION_MAXIMUM_INVALID'; end if;
  if p_decision <> 'authorize_extension' and p_new_maximum_cost <> previous_maximum then
    raise exception 'BUDGET_DECISION_MAXIMUM_NOT_ALLOWED';
  end if;

  if p_decision = 'authorize_extension' then
    if normalized_new_maximum <= previous_maximum then raise exception 'BUDGET_EXTENSION_NOT_GREATER'; end if;
    if normalized_new_maximum < budget.spent_cost + budget.reserved_cost then
      raise exception 'BUDGET_EXTENSION_BELOW_LEDGER';
    end if;
    if normalized_new_maximum < total_estimated then
      raise exception 'BUDGET_EXTENSION_BELOW_TOTAL_ESTIMATE';
    end if;
    if normalized_new_maximum > budget.technical_limit_cost then
      raise exception 'BUDGET_EXTENSION_ABOVE_TECHNICAL_LIMIT';
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
       or p_checkpoint_payload#>>'{editorialConstraints,decisionId}' <> coverage_decision.id::text
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
  elsif p_checkpoint_version is not null or p_checkpoint_previous_hash is not null
     or p_checkpoint_payload is not null or p_checkpoint_payload_hash is not null then
    raise exception 'BUDGET_DECISION_CHECKPOINT_NOT_ALLOWED';
  end if;

  insert into public.real_editorial_budget_decisions (
    id,decision_key,review_id,pilot_id,run_id,actor_id,decision,
    previous_maximum_cost,new_maximum_cost,spent_cost,reserved_cost,
    remaining_estimated_cost,total_estimated_cost,reason,note
  ) values (
    decision_id,p_decision_key,review.id,p_pilot_id,p_run_id,p_actor_id,p_decision,
    previous_maximum,normalized_new_maximum,budget.spent_cost,budget.reserved_cost,
    review.remaining_estimated_cost,total_estimated,p_reason,p_note
  );

  if p_decision = 'keep_limit' then
    next_status := 'kept'; next_state := 'review_required';
    update public.real_editorial_budget_reviews
       set status = next_status,latest_decision_id = decision_id where id = review.id;
  elsif p_decision = 'cancel_permanently' then
    next_status := 'cancelled'; next_state := 'cancelled';
    update public.real_editorial_budget_reviews
       set status = next_status,latest_decision_id = decision_id,resolved_at = now()
     where id = review.id;
    update public.real_editorial_incidents set resolved_at = coalesce(resolved_at,now())
     where id = review.incident_id;
    update public.real_editorial_runs
       set state = 'cancelled',cancel_requested_at = now(),cancelled_at = now(),
           completed_at = now(),accumulated_cost = budget.spent_cost
     where id = p_run_id and pilot_id = p_pilot_id;
    update public.real_editorial_pilots set state = 'cancelled'
     where id = p_pilot_id and current_run_id = p_run_id;
  else
    next_status := 'authorized'; next_state := 'preflight';
    update public.real_editorial_pilot_budgets
       set task_limit_cost = normalized_new_maximum,
           batch_limit_cost = normalized_new_maximum,
           daily_limit_cost = normalized_new_maximum
     where pilot_id = p_pilot_id;
    insert into public.real_editorial_artifacts (
      pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
    ) values (
      p_pilot_id,p_run_id,'checkpoint','workflow',p_checkpoint_version,
      p_checkpoint_payload,p_checkpoint_payload_hash
    );
    update public.real_editorial_budget_reviews
       set status = next_status,latest_decision_id = decision_id,resolved_at = now()
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
  end if;

  insert into public.real_editorial_events (
    pilot_id,run_id,event_type,state,payload
  ) values (
    p_pilot_id,p_run_id,'real.editorial.coverage_budget.human_decided',next_state,
    jsonb_strip_nulls(jsonb_build_object(
      'coverageDecisionId',coverage_decision.id,'decisionId',decision_id,
      'actorId',p_actor_id,'decision',p_decision,
      'previousMaximumCostEur',previous_maximum,
      'newMaximumCostEur',normalized_new_maximum,
      'spentCostEur',budget.spent_cost,'reservedCostEur',budget.reserved_cost,
      'remainingEstimatedCostEur',review.remaining_estimated_cost,
      'totalEstimatedCostEur',total_estimated,'reason',p_reason,'note',p_note,
      'providerCalled',false,'workflowResumed',false
    ))
  );
  return decision_id;
end;
$$;

revoke all on function public.resolve_real_editorial_coverage_review(
  text,uuid,uuid,integer,text,uuid,text,text,text,boolean
) from public,anon,authenticated;
revoke all on function public.resolve_real_editorial_coverage_budget_review(
  text,uuid,uuid,uuid,text,numeric,text,text,integer,text,jsonb,text
) from public,anon,authenticated;

grant execute on function public.resolve_real_editorial_coverage_review(
  text,uuid,uuid,integer,text,uuid,text,text,text,boolean
) to service_role;
grant execute on function public.resolve_real_editorial_coverage_budget_review(
  text,uuid,uuid,uuid,text,numeric,text,text,integer,text,jsonb,text
) to service_role;
