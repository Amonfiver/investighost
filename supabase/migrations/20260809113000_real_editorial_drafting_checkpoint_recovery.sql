-- Concilia un fallo local de restauración al entrar en redacción, únicamente si
-- el checkpoint de cobertura sigue intacto y no hubo efectos de proveedor.

create table public.real_editorial_drafting_checkpoint_recoveries (
  id uuid primary key default gen_random_uuid(),
  recovery_key text not null unique check (recovery_key ~ '^[a-f0-9]{64}$'),
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  incident_id uuid not null unique references public.real_editorial_incidents(id) on delete restrict,
  coverage_decision_id uuid not null references
    public.real_editorial_coverage_decisions(id) on delete restrict,
  budget_decision_id uuid not null references
    public.real_editorial_budget_decisions(id) on delete restrict,
  actor_id uuid not null,
  reason text not null check (
    length(btrim(reason)) between 1 and 500
    and reason !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ),
  checkpoint_version integer not null check (checkpoint_version > 0),
  checkpoint_hash text not null check (checkpoint_hash ~ '^[a-f0-9]{64}$'),
  provider_calls_after_checkpoint integer not null default 0
    check (provider_calls_after_checkpoint = 0),
  reservations_after_checkpoint integer not null default 0
    check (reservations_after_checkpoint = 0),
  spent_cost numeric(18,9) not null check (spent_cost >= 0),
  reserved_cost numeric(18,9) not null check (reserved_cost = 0),
  maximum_cost numeric(18,9) not null check (maximum_cost >= 0),
  recovered_at timestamptz not null default now(),
  check (spent_cost + reserved_cost <= maximum_cost)
);

alter table public.real_editorial_drafting_checkpoint_recoveries enable row level security;
revoke all on table public.real_editorial_drafting_checkpoint_recoveries
  from public,anon,authenticated;
grant select on table public.real_editorial_drafting_checkpoint_recoveries to service_role;
create trigger real_editorial_drafting_checkpoint_recoveries_append
  before update or delete on public.real_editorial_drafting_checkpoint_recoveries
  for each row execute function public.prevent_real_editorial_append_mutation();

create or replace function public.reconcile_real_editorial_drafting_checkpoint_incident(
  p_recovery_key text,
  p_pilot_id uuid,
  p_run_id uuid,
  p_incident_id uuid,
  p_coverage_decision_id uuid,
  p_budget_decision_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_checkpoint_version integer,
  p_checkpoint_hash text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.real_editorial_drafting_checkpoint_recoveries%rowtype;
  checkpoint public.real_editorial_artifacts%rowtype;
  coverage_decision public.real_editorial_coverage_decisions%rowtype;
  budget_decision public.real_editorial_budget_decisions%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  recovery_id uuid := gen_random_uuid();
  provider_calls_after integer;
  reservations_after integer;
  recovered_at timestamptz := now();
begin
  if p_recovery_key !~ '^[a-f0-9]{64}$'
     or p_reason is null or length(btrim(p_reason)) not between 1 and 500
     or p_reason ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])' then
    raise exception 'DRAFTING_CHECKPOINT_RECOVERY_INVALID';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-drafting-checkpoint:' || p_run_id::text,0)
  );
  select * into existing from public.real_editorial_drafting_checkpoint_recoveries
   where recovery_key = p_recovery_key or incident_id = p_incident_id
   order by (recovery_key = p_recovery_key) desc limit 1;
  if found then
    if existing.recovery_key <> p_recovery_key
       or existing.pilot_id <> p_pilot_id or existing.run_id <> p_run_id
       or existing.incident_id <> p_incident_id
       or existing.coverage_decision_id <> p_coverage_decision_id
       or existing.budget_decision_id <> p_budget_decision_id
       or existing.actor_id <> p_actor_id or existing.reason <> p_reason
       or existing.checkpoint_version <> p_checkpoint_version
       or existing.checkpoint_hash <> p_checkpoint_hash then
      raise exception 'DRAFTING_CHECKPOINT_RECOVERY_CONFLICT';
    end if;
    return existing.id;
  end if;
  if not exists (
    select 1 from public.real_editorial_pilots p
    join public.real_editorial_runs r on r.id = p.current_run_id
    where p.id = p_pilot_id and r.id = p_run_id
      and p.state = 'preflight' and r.state = 'preflight' and r.current_round = 2
  ) then raise exception 'DRAFTING_CHECKPOINT_RECOVERY_STATE_INVALID'; end if;
  if exists (
    select 1 from public.real_editorial_execution_guard
     where guard_name='morella-real-editorial' and owner_execution_id is not null
       and expires_at > now()
  ) then raise exception 'DRAFTING_CHECKPOINT_RECOVERY_GUARD_BUSY'; end if;
  select * into checkpoint from public.real_editorial_artifacts
   where run_id=p_run_id and artifact_kind='checkpoint' and artifact_key='workflow'
   order by version desc limit 1;
  if not found or checkpoint.version <> p_checkpoint_version
     or checkpoint.payload_hash <> p_checkpoint_hash
     or checkpoint.payload->>'state' <> 'ready_for_drafting'
     or checkpoint.payload->>'completedRound' <> '2'
     or jsonb_array_length(checkpoint.payload#>'{dossier,sources}') <> 8
     or jsonb_array_length(checkpoint.payload#>'{editorialConstraints,unresolvedGapIds}') < 1
     or jsonb_array_length(checkpoint.payload#>'{editorialConstraints,contradictions}') < 1
     or jsonb_array_length(checkpoint.payload#>'{editorialConstraints,safetyRules}') <> 5
     or checkpoint.payload#>>'{editorialConstraints,decisionId}'
        <> p_coverage_decision_id::text then
    raise exception 'DRAFTING_CHECKPOINT_RECOVERY_CHECKPOINT_CHANGED';
  end if;
  select * into coverage_decision from public.real_editorial_coverage_decisions
   where id=p_coverage_decision_id and pilot_id=p_pilot_id and run_id=p_run_id
     and decision='accept_with_warnings' and risk_accepted;
  if not found
     or coverage_decision.checkpoint_version >= checkpoint.version
     or coverage_decision.checkpoint_hash
        <> checkpoint.payload#>>'{editorialConstraints,checkpointHash}'
     or coverage_decision.gap_dispositions
        <> (select jsonb_agg(jsonb_build_object(
              'gapId',value,'disposition','accepted_unresolved'
            ) order by value)
              from jsonb_array_elements_text(
                checkpoint.payload#>'{editorialConstraints,unresolvedGapIds}'
              ) gap(value))
     or coverage_decision.known_contradictions
        <> checkpoint.payload#>'{editorialConstraints,contradictions}'
     or coverage_decision.safety_constraints
        <> checkpoint.payload#>'{editorialConstraints,safetyRules}' then
    raise exception 'DRAFTING_CHECKPOINT_RECOVERY_COVERAGE_CHANGED';
  end if;
  select * into budget_decision from public.real_editorial_budget_decisions
   where id=p_budget_decision_id and pilot_id=p_pilot_id and run_id=p_run_id
     and review_id in (
       select id from public.real_editorial_budget_reviews
        where coverage_decision_id=p_coverage_decision_id
          and review_context='coverage_acceptance' and status='authorized'
     );
  if not found
     or budget_decision.decision not in ('authorize_within_limit','authorize_extension') then
    raise exception 'DRAFTING_CHECKPOINT_RECOVERY_BUDGET_DECISION_CHANGED';
  end if;
  select * into budget from public.real_editorial_pilot_budgets
   where pilot_id=p_pilot_id;
  if not found or budget.reserved_cost <> 0
     or budget.spent_cost <> budget_decision.spent_cost
     or budget.task_limit_cost <> budget_decision.new_maximum_cost
     or budget.batch_limit_cost <> budget.task_limit_cost
     or budget.daily_limit_cost <> budget.task_limit_cost then
    raise exception 'DRAFTING_CHECKPOINT_RECOVERY_BUDGET_CHANGED';
  end if;
  select count(*) into provider_calls_after from public.real_editorial_provider_calls
   where run_id=p_run_id and created_at >= checkpoint.created_at;
  select count(*) into reservations_after from public.real_editorial_call_reservations
   where run_id=p_run_id and created_at >= checkpoint.created_at;
  if provider_calls_after <> 0 or reservations_after <> 0 then
    raise exception 'DRAFTING_CHECKPOINT_RECOVERY_PROVIDER_EFFECTS';
  end if;
  if exists (
    select 1 from public.real_editorial_artifacts
     where run_id=p_run_id and artifact_kind in ('draft_adventure','draft_student','final_review')
  ) then raise exception 'DRAFTING_CHECKPOINT_RECOVERY_DRAFT_EXISTS'; end if;
  if not exists (
    select 1 from public.real_editorial_incidents
     where id=p_incident_id and pilot_id=p_pilot_id and run_id=p_run_id
       and code='CHECKPOINT_INVALID' and classification='human_required'
       and resolved_at is null and created_at >= checkpoint.created_at
  ) then raise exception 'DRAFTING_CHECKPOINT_RECOVERY_INCIDENT_CHANGED'; end if;

  insert into public.real_editorial_drafting_checkpoint_recoveries (
    id,recovery_key,pilot_id,run_id,incident_id,coverage_decision_id,
    budget_decision_id,actor_id,reason,checkpoint_version,checkpoint_hash,
    provider_calls_after_checkpoint,reservations_after_checkpoint,
    spent_cost,reserved_cost,maximum_cost,recovered_at
  ) values (
    recovery_id,p_recovery_key,p_pilot_id,p_run_id,p_incident_id,
    p_coverage_decision_id,p_budget_decision_id,p_actor_id,p_reason,
    checkpoint.version,checkpoint.payload_hash,provider_calls_after,reservations_after,
    budget.spent_cost,budget.reserved_cost,budget.task_limit_cost,recovered_at
  );
  update public.real_editorial_incidents set resolved_at=recovered_at
   where id=p_incident_id;
  insert into public.real_editorial_events (
    pilot_id,run_id,event_type,state,payload,occurred_at
  ) values (
    p_pilot_id,p_run_id,'real.editorial.drafting_checkpoint.recovered','preflight',
    jsonb_build_object(
      'recoveryId',recovery_id,'incidentId',p_incident_id,
      'coverageDecisionId',p_coverage_decision_id,'budgetDecisionId',p_budget_decision_id,
      'actorId',p_actor_id,'checkpointVersion',checkpoint.version,
      'providerCallsAfterCheckpoint',0,'reservationsAfterCheckpoint',0,
      'budgetChanged',false,'workflowResumed',false
    ),recovered_at
  );
  return recovery_id;
end;
$$;

revoke all on function public.reconcile_real_editorial_drafting_checkpoint_incident(
  text,uuid,uuid,uuid,uuid,uuid,uuid,text,integer,text
) from public,anon,authenticated;

grant execute on function public.reconcile_real_editorial_drafting_checkpoint_incident(
  text,uuid,uuid,uuid,uuid,uuid,uuid,text,integer,text
) to service_role;
