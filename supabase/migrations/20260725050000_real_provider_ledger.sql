-- Ledger y cortafuegos económicos del pipeline real.
-- Migración estrictamente aditiva: no modifica ni reinterpreta datos humanos existentes.

create table public.provider_tariffs (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null check (length(provider_id) between 1 and 80),
  model text not null check (length(model) between 1 and 160),
  operation text not null check (length(operation) between 1 and 120),
  version integer not null check (version > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  unit_scale bigint not null default 1000 check (unit_scale > 0),
  input_unit_cost numeric(18,9) not null default 0 check (input_unit_cost >= 0),
  output_unit_cost numeric(18,9) not null default 0 check (output_unit_cost >= 0),
  tool_unit_cost numeric(18,9) not null default 0 check (tool_unit_cost >= 0),
  credit_unit_cost numeric(18,9) not null default 0 check (credit_unit_cost >= 0),
  effective_from timestamptz not null,
  source_reference text not null check (length(source_reference) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (provider_id,model,operation,version)
);

create table public.real_task_budgets (
  task_id text primary key check (length(task_id) between 1 and 160),
  request_id text not null check (length(request_id) between 1 and 160),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  limit_cost numeric(18,9) not null check (limit_cost >= 0),
  reserved_cost numeric(18,9) not null default 0 check (reserved_cost >= 0),
  spent_cost numeric(18,9) not null default 0 check (spent_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reserved_cost + spent_cost <= limit_cost)
);

create table public.real_batch_budgets (
  batch_id text primary key check (length(batch_id) between 1 and 160),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  limit_cost numeric(18,9) not null check (limit_cost >= 0),
  reserved_cost numeric(18,9) not null default 0 check (reserved_cost >= 0),
  spent_cost numeric(18,9) not null default 0 check (spent_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reserved_cost + spent_cost <= limit_cost)
);

create table public.real_daily_budgets (
  budget_date date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  limit_cost numeric(18,9) not null check (limit_cost >= 0),
  reserved_cost numeric(18,9) not null default 0 check (reserved_cost >= 0),
  spent_cost numeric(18,9) not null default 0 check (spent_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (budget_date,currency),
  check (reserved_cost + spent_cost <= limit_cost)
);

create table public.real_execution_guard (
  guard_name text primary key check (guard_name = 'global'),
  owner_execution_id text check (owner_execution_id is null or length(owner_execution_id) between 1 and 160),
  lease_token uuid,
  acquired_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (owner_execution_id is null and lease_token is null and acquired_at is null and expires_at is null)
    or
    (owner_execution_id is not null and lease_token is not null and acquired_at is not null and expires_at is not null)
  )
);

insert into public.real_execution_guard (guard_name) values ('global');

create table public.provider_call_reservations (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique default gen_random_uuid(),
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 160),
  execution_id text not null check (length(execution_id) between 1 and 160),
  request_id text not null check (length(request_id) between 1 and 160),
  run_id text not null check (length(run_id) between 1 and 160),
  task_id text not null references public.real_task_budgets(task_id) on delete restrict,
  batch_id text not null references public.real_batch_budgets(batch_id) on delete restrict,
  budget_date date not null,
  stage text not null check (length(stage) between 1 and 120),
  operation text not null check (length(operation) between 1 and 120),
  provider_id text not null check (length(provider_id) between 1 and 80),
  model text not null check (length(model) between 1 and 160),
  attempt integer not null check (attempt between 1 and 10),
  retry_of_call_id uuid,
  estimated_cost numeric(18,9) not null check (estimated_cost > 0),
  reserved_cost numeric(18,9) not null check (reserved_cost > 0),
  calculated_cost numeric(18,9) check (calculated_cost >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  tariff_id uuid not null references public.provider_tariffs(id) on delete restrict,
  state text not null check (state in ('reserved','started','reconciled','failed','cancelled','unknown')),
  prompt_version text not null check (length(prompt_version) between 1 and 80),
  schema_version text not null check (length(schema_version) between 1 and 80),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reconciled_at timestamptz,
  foreign key (budget_date,currency) references public.real_daily_budgets(budget_date,currency) on delete restrict
);

create table public.provider_calls (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  sequence integer not null check (sequence > 0),
  reservation_id uuid not null references public.provider_call_reservations(id) on delete restrict,
  request_id text not null check (length(request_id) between 1 and 160),
  run_id text not null check (length(run_id) between 1 and 160),
  task_id text not null check (length(task_id) between 1 and 160),
  batch_id text not null check (length(batch_id) between 1 and 160),
  stage text not null check (length(stage) between 1 and 120),
  operation text not null check (length(operation) between 1 and 120),
  provider_id text not null check (length(provider_id) between 1 and 80),
  model text not null check (length(model) between 1 and 160),
  state text not null check (state in ('reserved','started','succeeded','failed','cancelled','unknown')),
  attempt integer not null check (attempt between 1 and 10),
  retry_of_call_id uuid,
  reserved_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  remote_id text check (length(remote_id) <= 240),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  tool_calls integer not null default 0 check (tool_calls >= 0),
  tools jsonb not null default '[]'::jsonb check (jsonb_typeof(tools) = 'array'),
  credits numeric(18,9) not null default 0 check (credits >= 0),
  estimated_cost numeric(18,9) not null check (estimated_cost >= 0),
  reserved_cost numeric(18,9) not null check (reserved_cost >= 0),
  calculated_cost numeric(18,9) check (calculated_cost >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  tariff_id uuid not null references public.provider_tariffs(id) on delete restrict,
  sanitized_error text check (
    sanitized_error is null
    or (
      length(sanitized_error) between 1 and 500
      and sanitized_error !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
    )
  ),
  prompt_version text not null check (length(prompt_version) between 1 and 80),
  schema_version text not null check (length(schema_version) between 1 and 80),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  output_hash text check (output_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (call_id,sequence)
);

create index provider_calls_request_idx on public.provider_calls(request_id,created_at);
create index provider_calls_task_idx on public.provider_calls(task_id,created_at);
create index provider_calls_remote_idx on public.provider_calls(provider_id,remote_id)
  where remote_id is not null;
create index provider_reservations_state_idx on public.provider_call_reservations(state,created_at);
create index provider_tariffs_lookup_idx on public.provider_tariffs(provider_id,model,operation,effective_from desc);

create or replace function public.prevent_real_ledger_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'REAL_LEDGER_APPEND_ONLY';
end;
$$;

create trigger provider_calls_append_only
  before update or delete on public.provider_calls
  for each row execute function public.prevent_real_ledger_mutation();

create trigger provider_tariffs_append_only
  before update or delete on public.provider_tariffs
  for each row execute function public.prevent_real_ledger_mutation();

create trigger real_task_budgets_updated
  before update on public.real_task_budgets
  for each row execute function public.set_updated_at();
create trigger real_batch_budgets_updated
  before update on public.real_batch_budgets
  for each row execute function public.set_updated_at();
create trigger real_daily_budgets_updated
  before update on public.real_daily_budgets
  for each row execute function public.set_updated_at();
create trigger provider_call_reservations_updated
  before update on public.provider_call_reservations
  for each row execute function public.set_updated_at();

create or replace function public.acquire_real_execution_guard(
  p_execution_id text,
  p_lease_token uuid,
  p_expires_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  if p_expires_at <= now() then
    return false;
  end if;
  update public.real_execution_guard
     set owner_execution_id = p_execution_id,
         lease_token = p_lease_token,
         acquired_at = now(),
         expires_at = p_expires_at,
         updated_at = now()
   where guard_name = 'global'
     and (
       owner_execution_id is null
       or expires_at <= now()
       or lease_token = p_lease_token
     );
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.release_real_execution_guard(
  p_lease_token uuid
) returns boolean language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  update public.real_execution_guard
     set owner_execution_id = null,
         lease_token = null,
         acquired_at = null,
         expires_at = null,
         updated_at = now()
   where guard_name = 'global'
     and lease_token = p_lease_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.reserve_provider_call(
  p_idempotency_key text,
  p_execution_id text,
  p_request_id text,
  p_run_id text,
  p_task_id text,
  p_batch_id text,
  p_budget_date date,
  p_stage text,
  p_operation text,
  p_provider_id text,
  p_model text,
  p_attempt integer,
  p_retry_of_call_id uuid,
  p_estimated_cost numeric,
  p_currency text,
  p_tariff_id uuid,
  p_prompt_version text,
  p_schema_version text,
  p_input_hash text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing_id uuid;
  reservation_id uuid;
  new_call_id uuid := gen_random_uuid();
  previous_state text;
  task_budget public.real_task_budgets%rowtype;
  batch_budget public.real_batch_budgets%rowtype;
  daily_budget public.real_daily_budgets%rowtype;
begin
  -- Serializa únicamente esta clave para que dos solicitudes concurrentes
  -- devuelvan la misma reserva en vez de duplicar presupuesto o fallar por unique.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
  select id into existing_id
    from public.provider_call_reservations
   where idempotency_key = p_idempotency_key;
  if existing_id is not null then
    return existing_id;
  end if;

  if not exists (
    select 1 from public.real_execution_guard
     where guard_name = 'global'
       and owner_execution_id = p_execution_id
       and expires_at > now()
  ) then
    raise exception 'REAL_GLOBAL_GUARD_REQUIRED';
  end if;

  if p_retry_of_call_id is not null then
    select state into previous_state
      from public.provider_calls
     where call_id = p_retry_of_call_id
     order by sequence desc limit 1;
    if previous_state = 'unknown' then
      raise exception 'AMBIGUOUS_TIMEOUT_NOT_RETRYABLE';
    end if;
  end if;

  select * into task_budget from public.real_task_budgets where task_id = p_task_id for update;
  if not found then raise exception 'REAL_TASK_BUDGET_MISSING'; end if;
  if task_budget.currency <> p_currency then raise exception 'REAL_TASK_CURRENCY_MISMATCH'; end if;
  if task_budget.spent_cost + task_budget.reserved_cost + p_estimated_cost > task_budget.limit_cost then
    raise exception 'REAL_TASK_BUDGET_EXCEEDED';
  end if;

  select * into batch_budget from public.real_batch_budgets where batch_id = p_batch_id for update;
  if not found then raise exception 'REAL_BATCH_BUDGET_MISSING'; end if;
  if batch_budget.currency <> p_currency then raise exception 'REAL_BATCH_CURRENCY_MISMATCH'; end if;
  if batch_budget.spent_cost + batch_budget.reserved_cost + p_estimated_cost > batch_budget.limit_cost then
    raise exception 'REAL_BATCH_BUDGET_EXCEEDED';
  end if;

  select * into daily_budget
    from public.real_daily_budgets
   where budget_date = p_budget_date and currency = p_currency
   for update;
  if not found then raise exception 'REAL_DAILY_BUDGET_MISSING'; end if;
  if daily_budget.spent_cost + daily_budget.reserved_cost + p_estimated_cost > daily_budget.limit_cost then
    raise exception 'REAL_DAILY_BUDGET_EXCEEDED';
  end if;

  insert into public.provider_call_reservations (
    call_id,idempotency_key,execution_id,request_id,run_id,task_id,batch_id,budget_date,
    stage,operation,provider_id,model,attempt,retry_of_call_id,estimated_cost,reserved_cost,
    currency,tariff_id,state,prompt_version,schema_version,input_hash
  ) values (
    new_call_id,p_idempotency_key,p_execution_id,p_request_id,p_run_id,p_task_id,p_batch_id,p_budget_date,
    p_stage,p_operation,p_provider_id,p_model,p_attempt,p_retry_of_call_id,p_estimated_cost,p_estimated_cost,
    p_currency,p_tariff_id,'reserved',p_prompt_version,p_schema_version,p_input_hash
  ) returning id into reservation_id;

  update public.real_task_budgets set reserved_cost = reserved_cost + p_estimated_cost where task_id = p_task_id;
  update public.real_batch_budgets set reserved_cost = reserved_cost + p_estimated_cost where batch_id = p_batch_id;
  update public.real_daily_budgets set reserved_cost = reserved_cost + p_estimated_cost
    where budget_date = p_budget_date and currency = p_currency;

  insert into public.provider_calls (
    call_id,sequence,reservation_id,request_id,run_id,task_id,batch_id,stage,operation,
    provider_id,model,state,attempt,retry_of_call_id,reserved_at,estimated_cost,reserved_cost,
    currency,tariff_id,prompt_version,schema_version,input_hash
  ) values (
    new_call_id,1,reservation_id,p_request_id,p_run_id,p_task_id,p_batch_id,p_stage,p_operation,
    p_provider_id,p_model,'reserved',p_attempt,p_retry_of_call_id,now(),p_estimated_cost,p_estimated_cost,
    p_currency,p_tariff_id,p_prompt_version,p_schema_version,p_input_hash
  );
  return reservation_id;
end;
$$;

create or replace function public.start_provider_call(
  p_reservation_id uuid
) returns boolean language plpgsql security definer set search_path = public as $$
declare reservation public.provider_call_reservations%rowtype;
begin
  select * into reservation from public.provider_call_reservations where id = p_reservation_id for update;
  if not found then raise exception 'REAL_RESERVATION_NOT_FOUND'; end if;
  if reservation.state <> 'reserved' then raise exception 'REAL_RESERVATION_ALREADY_STARTED'; end if;

  update public.provider_call_reservations set state = 'started' where id = p_reservation_id;
  insert into public.provider_calls (
    call_id,sequence,reservation_id,request_id,run_id,task_id,batch_id,stage,operation,
    provider_id,model,state,attempt,retry_of_call_id,reserved_at,started_at,estimated_cost,reserved_cost,
    currency,tariff_id,prompt_version,schema_version,input_hash
  ) values (
    reservation.call_id,2,reservation.id,reservation.request_id,reservation.run_id,reservation.task_id,
    reservation.batch_id,reservation.stage,reservation.operation,reservation.provider_id,reservation.model,
    'started',reservation.attempt,reservation.retry_of_call_id,reservation.created_at,now(),
    reservation.estimated_cost,reservation.reserved_cost,reservation.currency,reservation.tariff_id,
    reservation.prompt_version,reservation.schema_version,reservation.input_hash
  );
  return true;
end;
$$;

create or replace function public.settle_provider_call(
  p_reservation_id uuid,
  p_outcome text,
  p_calculated_cost numeric,
  p_remote_id text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_tool_calls integer,
  p_tools jsonb,
  p_credits numeric,
  p_sanitized_error text,
  p_output_hash text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  reservation public.provider_call_reservations%rowtype;
  next_sequence integer;
  terminal_reservation_state text;
begin
  if p_outcome not in ('succeeded','failed','cancelled','unknown') then
    raise exception 'REAL_OUTCOME_INVALID';
  end if;
  if p_outcome = 'unknown' and p_calculated_cost is not null then
    raise exception 'REAL_AMBIGUOUS_COST_MUST_BE_NULL';
  end if;
  if p_outcome <> 'unknown' and coalesce(p_calculated_cost,0) < 0 then
    raise exception 'REAL_CALCULATED_COST_INVALID';
  end if;

  select * into reservation from public.provider_call_reservations where id = p_reservation_id for update;
  if not found then raise exception 'REAL_RESERVATION_NOT_FOUND'; end if;
  if reservation.state not in ('reserved','started') then raise exception 'REAL_RESERVATION_TERMINAL'; end if;
  if p_outcome <> 'unknown' and coalesce(p_calculated_cost,0) > reservation.reserved_cost then
    raise exception 'REAL_COST_EXCEEDS_RESERVATION';
  end if;

  if p_outcome = 'unknown' then
    terminal_reservation_state := 'unknown';
  else
    update public.real_task_budgets
       set reserved_cost = reserved_cost - reservation.reserved_cost,
           spent_cost = spent_cost + coalesce(p_calculated_cost,0)
     where task_id = reservation.task_id;
    update public.real_batch_budgets
       set reserved_cost = reserved_cost - reservation.reserved_cost,
           spent_cost = spent_cost + coalesce(p_calculated_cost,0)
     where batch_id = reservation.batch_id;
    update public.real_daily_budgets
       set reserved_cost = reserved_cost - reservation.reserved_cost,
           spent_cost = spent_cost + coalesce(p_calculated_cost,0)
     where budget_date = reservation.budget_date and currency = reservation.currency;
    terminal_reservation_state := case when p_outcome = 'succeeded' then 'reconciled' else p_outcome end;
  end if;

  update public.provider_call_reservations
     set state = terminal_reservation_state,
         calculated_cost = case when p_outcome = 'unknown' then null else coalesce(p_calculated_cost,0) end,
         reconciled_at = case when p_outcome = 'unknown' then null else now() end
   where id = reservation.id;

  select coalesce(max(sequence),0) + 1 into next_sequence
    from public.provider_calls where call_id = reservation.call_id;
  insert into public.provider_calls (
    call_id,sequence,reservation_id,request_id,run_id,task_id,batch_id,stage,operation,
    provider_id,model,state,attempt,retry_of_call_id,reserved_at,started_at,completed_at,remote_id,
    input_tokens,output_tokens,tool_calls,tools,credits,estimated_cost,reserved_cost,calculated_cost,
    currency,tariff_id,sanitized_error,prompt_version,schema_version,input_hash,output_hash
  ) values (
    reservation.call_id,next_sequence,reservation.id,reservation.request_id,reservation.run_id,
    reservation.task_id,reservation.batch_id,reservation.stage,reservation.operation,
    reservation.provider_id,reservation.model,p_outcome,reservation.attempt,reservation.retry_of_call_id,
    reservation.created_at,case when reservation.state = 'started' then reservation.updated_at else null end,
    now(),p_remote_id,coalesce(p_input_tokens,0),coalesce(p_output_tokens,0),coalesce(p_tool_calls,0),
    coalesce(p_tools,'[]'::jsonb),coalesce(p_credits,0),reservation.estimated_cost,reservation.reserved_cost,
    case when p_outcome = 'unknown' then null else coalesce(p_calculated_cost,0) end,
    reservation.currency,reservation.tariff_id,p_sanitized_error,reservation.prompt_version,
    reservation.schema_version,reservation.input_hash,p_output_hash
  );
  return true;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'provider_tariffs','real_task_budgets','real_batch_budgets','real_daily_budgets',
    'real_execution_guard','provider_call_reservations','provider_calls'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated',table_name);
  end loop;
end $$;

grant select,insert on table public.provider_tariffs to service_role;
grant select on table public.provider_calls,public.provider_call_reservations,public.real_execution_guard to service_role;
grant select,insert on table public.real_task_budgets,public.real_batch_budgets,public.real_daily_budgets to service_role;

revoke all on function public.acquire_real_execution_guard(text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.release_real_execution_guard(uuid) from public,anon,authenticated;
revoke all on function public.reserve_provider_call(text,text,text,text,text,text,date,text,text,text,text,integer,uuid,numeric,text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.start_provider_call(uuid) from public,anon,authenticated;
revoke all on function public.settle_provider_call(uuid,text,numeric,text,bigint,bigint,integer,jsonb,numeric,text,text) from public,anon,authenticated;

grant execute on function public.acquire_real_execution_guard(text,uuid,timestamptz) to service_role;
grant execute on function public.release_real_execution_guard(uuid) to service_role;
grant execute on function public.reserve_provider_call(text,text,text,text,text,text,date,text,text,text,text,integer,uuid,numeric,text,uuid,text,text,text) to service_role;
grant execute on function public.start_provider_call(uuid) to service_role;
grant execute on function public.settle_provider_call(uuid,text,numeric,text,bigint,bigint,integer,jsonb,numeric,text,text) to service_role;
