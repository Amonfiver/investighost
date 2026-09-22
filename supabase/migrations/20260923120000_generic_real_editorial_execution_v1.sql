-- Generic real editorial execution ownership. Historical pilot rows keep their
-- pilot/run scope; a batch job receives an execution owner in the same
-- append-only artifacts and provider-ledger tables.

create table public.real_editorial_executions (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('PILOT','BATCH_JOB')),
  owner_id uuid not null,
  destination_id uuid not null references public.geographic_entities(id) on delete restrict,
  run_id uuid not null default gen_random_uuid(),
  task_id text not null check (length(task_id) between 1 and 200),
  batch_id text not null default '',
  state text not null default 'queued',
  task_limit_cost numeric(18,9) not null check (task_limit_cost >= 0),
  batch_limit_cost numeric(18,9) not null check (batch_limit_cost >= 0),
  daily_limit_cost numeric(18,9) not null check (daily_limit_cost >= 0),
  reserved_cost numeric(18,9) not null default 0 check (reserved_cost >= 0),
  spent_cost numeric(18,9) not null default 0 check (spent_cost >= 0),
  policy jsonb not null default '{}'::jsonb check (jsonb_typeof(policy) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_type, owner_id),
  check (reserved_cost + spent_cost <= task_limit_cost),
  check (reserved_cost + spent_cost <= batch_limit_cost),
  check (reserved_cost + spent_cost <= daily_limit_cost)
);

create trigger real_editorial_executions_updated
  before update on public.real_editorial_executions
  for each row execute function public.set_updated_at();

alter table public.real_editorial_artifacts
  add column execution_owner_id uuid references public.real_editorial_executions(id) on delete restrict,
  alter column pilot_id drop not null,
  alter column run_id drop not null;

alter table public.real_editorial_artifacts
  add constraint real_editorial_artifacts_exactly_one_owner check (
    (execution_owner_id is null and pilot_id is not null and run_id is not null)
    or
    (execution_owner_id is not null and pilot_id is null and run_id is null)
  );

create unique index real_editorial_artifacts_execution_owner_key
  on public.real_editorial_artifacts (execution_owner_id, artifact_kind, artifact_key, version)
  where execution_owner_id is not null;

alter table public.real_editorial_call_reservations
  add column execution_owner_id uuid references public.real_editorial_executions(id) on delete restrict,
  alter column pilot_id drop not null,
  alter column run_id drop not null;

alter table public.real_editorial_call_reservations
  add constraint real_editorial_call_reservations_exactly_one_owner check (
    (execution_owner_id is null and pilot_id is not null and run_id is not null)
    or
    (execution_owner_id is not null and pilot_id is null and run_id is null)
  );

alter table public.real_editorial_provider_calls
  add column execution_owner_id uuid references public.real_editorial_executions(id) on delete restrict,
  alter column pilot_id drop not null,
  alter column run_id drop not null;

alter table public.real_editorial_provider_calls
  add constraint real_editorial_provider_calls_exactly_one_owner check (
    (execution_owner_id is null and pilot_id is not null and run_id is not null)
    or
    (execution_owner_id is not null and pilot_id is null and run_id is null)
  );

alter table public.real_editorial_events
  add column execution_owner_id uuid references public.real_editorial_executions(id) on delete restrict,
  alter column pilot_id drop not null;

alter table public.real_editorial_events
  add constraint real_editorial_events_exactly_one_owner check (
    (execution_owner_id is null and pilot_id is not null)
    or
    (execution_owner_id is not null and pilot_id is null)
  );

create or replace function public.reserve_generic_real_editorial_call(
  p_execution_owner_id uuid,
  p_idempotency_key text,
  p_execution_id text,
  p_task_id text,
  p_batch_id text,
  p_stage text,
  p_operation text,
  p_provider_id text,
  p_model text,
  p_attempt integer,
  p_retry_of_call_id uuid,
  p_estimated_cost numeric,
  p_currency text,
  p_tariff_id text,
  p_prompt_version text,
  p_schema_version text,
  p_input_hash text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  owner public.real_editorial_executions%rowtype;
  existing public.real_editorial_call_reservations%rowtype;
  reservation_id uuid;
begin
  select * into existing from public.real_editorial_call_reservations
    where idempotency_key = p_idempotency_key;
  if found then
    if existing.execution_owner_id is distinct from p_execution_owner_id
      or existing.execution_id <> p_execution_id
      or existing.input_hash <> p_input_hash then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return existing.id;
  end if;

  select * into owner from public.real_editorial_executions where id = p_execution_owner_id for update;
  if not found then raise exception 'REAL_EDITORIAL_EXECUTION_NOT_FOUND'; end if;
  if owner.reserved_cost + owner.spent_cost + p_estimated_cost > owner.task_limit_cost
    or owner.reserved_cost + owner.spent_cost + p_estimated_cost > owner.batch_limit_cost
    or owner.reserved_cost + owner.spent_cost + p_estimated_cost > owner.daily_limit_cost then
    raise exception 'REAL_EDITORIAL_BUDGET_EXCEEDED';
  end if;

  insert into public.real_editorial_call_reservations (
    idempotency_key,execution_id,execution_owner_id,task_id,batch_id,stage,operation,
    provider_id,model,attempt,retry_of_call_id,estimated_cost,reserved_cost,currency,
    tariff_id,state,prompt_version,schema_version,input_hash
  ) values (
    p_idempotency_key,p_execution_id,p_execution_owner_id,p_task_id,p_batch_id,p_stage,p_operation,
    p_provider_id,p_model,p_attempt,p_retry_of_call_id,p_estimated_cost,p_estimated_cost,p_currency,
    p_tariff_id,'reserved',p_prompt_version,p_schema_version,p_input_hash
  ) returning id into reservation_id;
  update public.real_editorial_executions set reserved_cost = reserved_cost + p_estimated_cost where id = owner.id;
  insert into public.real_editorial_provider_calls (
    call_id,sequence,reservation_id,execution_owner_id,stage,operation,provider_id,model,state,
    attempt,retry_of_call_id,estimated_cost,reserved_cost,currency,tariff_id,prompt_version,
    schema_version,input_hash
  ) select call_id,1,id,execution_owner_id,stage,operation,provider_id,model,'reserved',
    attempt,retry_of_call_id,estimated_cost,reserved_cost,currency,tariff_id,prompt_version,
    schema_version,input_hash from public.real_editorial_call_reservations where id = reservation_id;
  return reservation_id;
end;
$$;

create or replace function public.start_generic_real_editorial_call(p_reservation_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare reservation public.real_editorial_call_reservations%rowtype;
begin
  select * into reservation from public.real_editorial_call_reservations where id = p_reservation_id for update;
  if not found or reservation.execution_owner_id is null then raise exception 'REAL_EDITORIAL_RESERVATION_NOT_FOUND'; end if;
  if reservation.state <> 'reserved' then raise exception 'REAL_EDITORIAL_RESERVATION_ALREADY_STARTED'; end if;
  update public.real_editorial_call_reservations set state = 'started' where id = reservation.id;
  insert into public.real_editorial_provider_calls (
    call_id,sequence,reservation_id,execution_owner_id,stage,operation,provider_id,model,state,
    attempt,retry_of_call_id,estimated_cost,reserved_cost,currency,tariff_id,prompt_version,
    schema_version,input_hash
  ) values (
    reservation.call_id,2,reservation.id,reservation.execution_owner_id,reservation.stage,reservation.operation,
    reservation.provider_id,reservation.model,'started',reservation.attempt,reservation.retry_of_call_id,
    reservation.estimated_cost,reservation.reserved_cost,reservation.currency,reservation.tariff_id,
    reservation.prompt_version,reservation.schema_version,reservation.input_hash
  );
  return true;
end;
$$;

create or replace function public.settle_generic_real_editorial_call(
  p_reservation_id uuid,p_outcome text,p_calculated_cost numeric,p_remote_id text,
  p_input_tokens bigint,p_output_tokens bigint,p_tool_calls integer,p_credits numeric,
  p_sanitized_error text,p_output_hash text
) returns boolean language plpgsql security definer set search_path = public as $$
declare reservation public.real_editorial_call_reservations%rowtype;
declare actual numeric := coalesce(p_calculated_cost,0);
begin
  select * into reservation from public.real_editorial_call_reservations where id = p_reservation_id for update;
  if not found or reservation.execution_owner_id is null then raise exception 'REAL_EDITORIAL_RESERVATION_NOT_FOUND'; end if;
  if reservation.state not in ('reserved','started') then raise exception 'REAL_EDITORIAL_RESERVATION_TERMINAL'; end if;
  if p_outcome not in ('succeeded','failed','cancelled','unknown') then raise exception 'REAL_EDITORIAL_INVALID_OUTCOME'; end if;
  if actual > reservation.reserved_cost then raise exception 'REAL_EDITORIAL_COST_EXCEEDS_RESERVATION'; end if;
  update public.real_editorial_call_reservations set
    state = case when p_outcome = 'succeeded' then 'reconciled' else p_outcome end,
    calculated_cost = case when p_outcome = 'unknown' then null else actual end,
    reconciled_at = now()
  where id = reservation.id;
  if p_outcome <> 'unknown' then
    update public.real_editorial_executions set
      reserved_cost = reserved_cost - reservation.reserved_cost,
      spent_cost = spent_cost + actual
    where id = reservation.execution_owner_id;
  end if;
  insert into public.real_editorial_provider_calls (
    call_id,sequence,reservation_id,execution_owner_id,stage,operation,provider_id,model,state,
    attempt,retry_of_call_id,remote_id,input_tokens,output_tokens,tool_calls,credits,estimated_cost,
    reserved_cost,calculated_cost,currency,tariff_id,sanitized_error,prompt_version,schema_version,
    input_hash,output_hash
  ) values (
    reservation.call_id,3,reservation.id,reservation.execution_owner_id,reservation.stage,reservation.operation,
    reservation.provider_id,reservation.model,p_outcome,reservation.attempt,reservation.retry_of_call_id,
    p_remote_id,coalesce(p_input_tokens,0),coalesce(p_output_tokens,0),coalesce(p_tool_calls,0),coalesce(p_credits,0),
    reservation.estimated_cost,reservation.reserved_cost,case when p_outcome = 'unknown' then null else actual end,
    reservation.currency,reservation.tariff_id,p_sanitized_error,reservation.prompt_version,
    reservation.schema_version,reservation.input_hash,p_output_hash
  );
  return true;
end;
$$;
