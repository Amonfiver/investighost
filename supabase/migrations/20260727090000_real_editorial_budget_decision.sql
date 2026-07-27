-- Decisión humana durable ante un presupuesto editorial insuficiente.
-- No crea pilotos, runs ni presupuestos y no altera asientos históricos del ledger.

alter table public.real_editorial_pilot_budgets
  drop constraint real_editorial_pilot_budgets_check3;

alter table public.real_editorial_pilot_budgets
  add constraint real_editorial_pilot_budgets_manual_and_technical_limits
  check (
    manual_extension_cost <= technical_limit_cost
    and daily_limit_cost <= technical_limit_cost
  );

create table public.real_editorial_budget_reviews (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  incident_id uuid not null unique
    references public.real_editorial_incidents(id) on delete restrict,
  status text not null check (status in ('pending','kept','authorized','cancelled')),
  initial_maximum_cost numeric(18,9) not null check (initial_maximum_cost >= 0),
  opened_spent_cost numeric(18,9) not null check (opened_spent_cost >= 0),
  opened_reserved_cost numeric(18,9) not null check (opened_reserved_cost >= 0),
  remaining_estimated_cost numeric(18,9) not null check (remaining_estimated_cost > 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  latest_decision_id uuid,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (pilot_id,run_id,incident_id),
  check (
    (status in ('pending','kept') and resolved_at is null)
    or (status in ('authorized','cancelled') and resolved_at is not null)
  )
);

create table public.real_editorial_budget_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_key text not null unique check (decision_key ~ '^[a-f0-9]{64}$'),
  review_id uuid not null
    references public.real_editorial_budget_reviews(id) on delete restrict,
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  actor_id uuid not null,
  decision text not null check (
    decision in ('keep_limit','authorize_extension','cancel_permanently')
  ),
  previous_maximum_cost numeric(18,9) not null check (previous_maximum_cost >= 0),
  new_maximum_cost numeric(18,9) not null check (new_maximum_cost >= 0),
  spent_cost numeric(18,9) not null check (spent_cost >= 0),
  reserved_cost numeric(18,9) not null check (reserved_cost >= 0),
  remaining_estimated_cost numeric(18,9) not null check (remaining_estimated_cost > 0),
  total_estimated_cost numeric(18,9) not null check (total_estimated_cost >= 0),
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
  decided_at timestamptz not null default now(),
  check (
    (decision = 'authorize_extension' and new_maximum_cost > previous_maximum_cost)
    or (decision <> 'authorize_extension' and new_maximum_cost = previous_maximum_cost)
  )
);

alter table public.real_editorial_budget_reviews
  add constraint real_editorial_budget_reviews_latest_decision_fkey
  foreign key (latest_decision_id)
  references public.real_editorial_budget_decisions(id) on delete restrict;

create index real_editorial_budget_reviews_run_idx
  on public.real_editorial_budget_reviews(pilot_id,run_id,opened_at desc);

alter table public.real_editorial_budget_reviews enable row level security;
alter table public.real_editorial_budget_decisions enable row level security;

revoke all on table
  public.real_editorial_budget_reviews,
  public.real_editorial_budget_decisions
from public,anon,authenticated;

grant select on table
  public.real_editorial_budget_reviews,
  public.real_editorial_budget_decisions
to service_role;

create trigger real_editorial_budget_reviews_no_delete
  before delete on public.real_editorial_budget_reviews
  for each row execute function public.prevent_real_editorial_append_mutation();

create trigger real_editorial_budget_decisions_append_only
  before update or delete on public.real_editorial_budget_decisions
  for each row execute function public.prevent_real_editorial_append_mutation();

-- Materializa barreras económicas ya persistidas, incluida cualquier barrera
-- creada por una versión anterior de la aplicación. No decide ni amplía nada.
with persisted_deficits as (
  select distinct on (incident.pilot_id,incident.run_id)
    incident.id as incident_id,
    incident.pilot_id,
    incident.run_id,
    incident.created_at,
    budget.task_limit_cost,
    budget.spent_cost,
    budget.reserved_cost,
    (
      regexp_match(
        incident.message,
        'estimación operativa para completar el piloto es ([0-9]+([.][0-9]+)?) EUR adicionales'
      )
    )[1]::numeric as remaining_estimated_cost
  from public.real_editorial_incidents incident
  join public.real_editorial_pilot_budgets budget
    on budget.pilot_id = incident.pilot_id
  where incident.code = 'BUDGET_EXCEEDED'
    and incident.classification = 'human_required'
    and incident.resolved_at is null
  order by incident.pilot_id,incident.run_id,incident.created_at desc
)
insert into public.real_editorial_budget_reviews (
  pilot_id,run_id,incident_id,status,initial_maximum_cost,
  opened_spent_cost,opened_reserved_cost,remaining_estimated_cost,opened_at
)
select
  pilot_id,run_id,incident_id,'pending',task_limit_cost,
  spent_cost,reserved_cost,remaining_estimated_cost,created_at
from persisted_deficits
where remaining_estimated_cost is not null
on conflict (incident_id) do nothing;

create or replace function public.open_real_editorial_budget_review(
  p_pilot_id uuid,
  p_run_id uuid,
  p_incident_id uuid,
  p_remaining_estimated_cost numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing public.real_editorial_budget_reviews%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  review_id uuid := gen_random_uuid();
begin
  if p_remaining_estimated_cost is null
     or p_remaining_estimated_cost = 'NaN'::numeric
     or p_remaining_estimated_cost <= 0 then
    raise exception 'BUDGET_REVIEW_ESTIMATE_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-budget-review:' || p_run_id::text,0)
  );

  select * into existing
    from public.real_editorial_budget_reviews
   where incident_id = p_incident_id;
  if found then
    if existing.pilot_id = p_pilot_id
       and existing.run_id = p_run_id
       and existing.remaining_estimated_cost = p_remaining_estimated_cost then
      return existing.id;
    end if;
    raise exception 'BUDGET_REVIEW_CONFLICT';
  end if;

  if not exists (
    select 1
      from public.real_editorial_incidents
     where id = p_incident_id
       and pilot_id = p_pilot_id
       and run_id = p_run_id
       and code = 'BUDGET_EXCEEDED'
       and classification = 'human_required'
       and resolved_at is null
  ) then
    raise exception 'BUDGET_REVIEW_INCIDENT_INVALID';
  end if;

  select * into budget
    from public.real_editorial_pilot_budgets
   where pilot_id = p_pilot_id;
  if not found then raise exception 'REAL_EDITORIAL_BUDGET_MISSING'; end if;

  insert into public.real_editorial_budget_reviews (
    id,pilot_id,run_id,incident_id,status,initial_maximum_cost,
    opened_spent_cost,opened_reserved_cost,remaining_estimated_cost
  ) values (
    review_id,p_pilot_id,p_run_id,p_incident_id,'pending',budget.task_limit_cost,
    budget.spent_cost,budget.reserved_cost,p_remaining_estimated_cost
  );
  return review_id;
end;
$$;

create or replace function public.resolve_real_editorial_budget_review(
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
  if p_decision_key !~ '^[a-f0-9]{64}$' then
    raise exception 'BUDGET_DECISION_KEY_INVALID';
  end if;
  if p_decision not in (
    'keep_limit','authorize_extension','cancel_permanently'
  ) then
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
  ) then
    raise exception 'BUDGET_DECISION_NOTE_UNSAFE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-budget-decision:' || p_run_id::text,0)
  );

  select * into existing
    from public.real_editorial_budget_decisions
   where decision_key = p_decision_key;
  if found then
    if existing.pilot_id = p_pilot_id
       and existing.run_id = p_run_id
       and existing.actor_id = p_actor_id
       and existing.decision = p_decision
       and existing.new_maximum_cost is not distinct from p_new_maximum_cost
       and existing.reason = p_reason
       and existing.note is not distinct from p_note then
      return existing.id;
    end if;
    raise exception 'BUDGET_DECISION_IDEMPOTENCY_CONFLICT';
  end if;

  select * into review
    from public.real_editorial_budget_reviews
   where pilot_id = p_pilot_id and run_id = p_run_id
   order by opened_at desc
   limit 1
   for update;
  if not found then raise exception 'BUDGET_REVIEW_NOT_FOUND'; end if;
  if review.status in ('authorized','cancelled') then
    raise exception 'BUDGET_DECISION_ALREADY_TERMINAL';
  end if;

  if not exists (
    select 1
      from public.real_editorial_pilots
     where id = p_pilot_id
       and current_run_id = p_run_id
       and state = 'review_required'
  ) or not exists (
    select 1
      from public.real_editorial_runs
     where id = p_run_id
       and pilot_id = p_pilot_id
       and state = 'review_required'
  ) then
    raise exception 'BUDGET_DECISION_STATE_CHANGED';
  end if;

  if exists (
    select 1
      from public.real_editorial_execution_guard
     where guard_name = 'morella-real-editorial'
       and owner_execution_id is not null
       and expires_at > now()
  ) then
    raise exception 'BUDGET_DECISION_GUARD_BUSY';
  end if;

  select * into budget
    from public.real_editorial_pilot_budgets
   where pilot_id = p_pilot_id
   for update;
  if not found then raise exception 'REAL_EDITORIAL_BUDGET_MISSING'; end if;
  if budget.reserved_cost <> 0 then
    raise exception 'BUDGET_DECISION_PENDING_RESERVATIONS';
  end if;

  previous_maximum := budget.task_limit_cost;
  total_estimated := budget.spent_cost
    + budget.reserved_cost
    + review.remaining_estimated_cost;
  normalized_new_maximum := case
    when p_decision = 'authorize_extension' then p_new_maximum_cost
    else previous_maximum
  end;

  if normalized_new_maximum is null
     or normalized_new_maximum = 'NaN'::numeric
     or normalized_new_maximum < 0 then
    raise exception 'BUDGET_DECISION_MAXIMUM_INVALID';
  end if;
  if p_decision <> 'authorize_extension' and p_new_maximum_cost <> previous_maximum then
    raise exception 'BUDGET_DECISION_MAXIMUM_NOT_ALLOWED';
  end if;

  if p_decision = 'authorize_extension' then
    if normalized_new_maximum <= previous_maximum then
      raise exception 'BUDGET_EXTENSION_NOT_GREATER';
    end if;
    if normalized_new_maximum < budget.spent_cost + budget.reserved_cost then
      raise exception 'BUDGET_EXTENSION_BELOW_LEDGER';
    end if;
    if normalized_new_maximum < total_estimated then
      raise exception 'BUDGET_EXTENSION_BELOW_TOTAL_ESTIMATE';
    end if;
    if normalized_new_maximum > budget.technical_limit_cost then
      raise exception 'BUDGET_EXTENSION_ABOVE_TECHNICAL_LIMIT';
    end if;

    select * into checkpoint
      from public.real_editorial_artifacts
     where run_id = p_run_id
       and artifact_kind = 'checkpoint'
       and artifact_key = 'workflow'
     order by version desc
     limit 1;
    if not found
       or checkpoint.version + 1 <> p_checkpoint_version
       or checkpoint.payload_hash <> p_checkpoint_previous_hash
       or checkpoint.payload->>'state' <> 'review_required'
       or checkpoint.payload->>'completedRound' <> '1'
       or checkpoint.payload#>>'{lastDecision,action}' <> 'continue_focused'
       or jsonb_array_length(
         coalesce(checkpoint.payload#>'{lastDecision,queries}','[]'::jsonb)
       ) = 0 then
      raise exception 'BUDGET_EXTENSION_CHECKPOINT_CHANGED';
    end if;
    if p_checkpoint_payload is null
       or p_checkpoint_payload_hash !~ '^[a-f0-9]{64}$'
       or p_checkpoint_payload->>'state' <> 'researching_round_2'
       or p_checkpoint_payload->>'completedRound' <> '1'
       or p_checkpoint_payload->'nextRoundQueries'
          <> checkpoint.payload#>'{lastDecision,queries}'
       or (p_checkpoint_payload - array['state','nextRoundQueries','updatedAt'])
          <> (checkpoint.payload - array['state','nextRoundQueries','updatedAt']) then
      raise exception 'BUDGET_EXTENSION_CHECKPOINT_INVALID';
    end if;
  elsif p_checkpoint_version is not null
     or p_checkpoint_previous_hash is not null
     or p_checkpoint_payload is not null
     or p_checkpoint_payload_hash is not null then
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
    next_status := 'kept';
    next_state := 'review_required';
    update public.real_editorial_budget_reviews
       set status = next_status,latest_decision_id = decision_id
     where id = review.id;
  elsif p_decision = 'cancel_permanently' then
    next_status := 'cancelled';
    next_state := 'cancelled';
    update public.real_editorial_budget_reviews
       set status = next_status,latest_decision_id = decision_id,resolved_at = now()
     where id = review.id;
    update public.real_editorial_incidents
       set resolved_at = coalesce(resolved_at,now())
     where id = review.incident_id;
    update public.real_editorial_runs
       set state = 'cancelled',cancel_requested_at = now(),cancelled_at = now(),
           completed_at = now(),accumulated_cost = budget.spent_cost
     where id = p_run_id and pilot_id = p_pilot_id;
    update public.real_editorial_pilots
       set state = 'cancelled'
     where id = p_pilot_id and current_run_id = p_run_id;
  else
    next_status := 'authorized';
    next_state := 'preflight';
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
    update public.real_editorial_incidents
       set resolved_at = coalesce(resolved_at,now())
     where id = review.incident_id;
    update public.real_editorial_runs
       set state = 'preflight',cancel_requested_at = null,cancelled_at = null,
           completed_at = null,checkpoint_version = p_checkpoint_version,
           accumulated_cost = budget.spent_cost
     where id = p_run_id and pilot_id = p_pilot_id;
    update public.real_editorial_pilots
       set state = 'preflight'
     where id = p_pilot_id and current_run_id = p_run_id;
  end if;

  insert into public.real_editorial_events (
    pilot_id,run_id,event_type,state,payload
  ) values (
    p_pilot_id,p_run_id,'real.editorial.budget.human_decided',next_state,
    jsonb_strip_nulls(jsonb_build_object(
      'actorId',p_actor_id,
      'decisionId',decision_id,
      'decision',p_decision,
      'previousMaximumCostEur',previous_maximum,
      'newMaximumCostEur',normalized_new_maximum,
      'spentCostEur',budget.spent_cost,
      'reservedCostEur',budget.reserved_cost,
      'remainingEstimatedCostEur',review.remaining_estimated_cost,
      'totalEstimatedCostEur',total_estimated,
      'reason',p_reason,
      'note',p_note
    ))
  );
  return decision_id;
end;
$$;

revoke all on function public.open_real_editorial_budget_review(
  uuid,uuid,uuid,numeric
) from public,anon,authenticated;

revoke all on function public.resolve_real_editorial_budget_review(
  text,uuid,uuid,uuid,text,numeric,text,text,integer,text,jsonb,text
) from public,anon,authenticated;

grant execute on function public.open_real_editorial_budget_review(
  uuid,uuid,uuid,numeric
) to service_role;

grant execute on function public.resolve_real_editorial_budget_review(
  text,uuid,uuid,uuid,text,numeric,text,text,integer,text,jsonb,text
) to service_role;
