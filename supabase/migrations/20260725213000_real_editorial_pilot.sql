-- Ruta durable e independiente para el piloto editorial real de Morella.
-- No modifica filas Manual ni filas económicas de la prueba de conectividad 10D.

create table public.editorial_execution_modes (
  mode text primary key check (mode in ('manual','real_editorial_pilot','automatic')),
  description text not null check (length(description) between 1 and 300)
);

insert into public.editorial_execution_modes (mode,description) values
  ('manual','Investigación humana histórica del pipeline Manual'),
  ('real_editorial_pilot','Piloto editorial real autorizado y aislado'),
  ('automatic','Reserva de identidad para una futura tarea Automatic');

create table public.real_editorial_pilot_policies (
  id text primary key check (length(id) between 1 and 160),
  destination_name text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  destination_type text not null check (destination_type in ('country','region','locality','zone')),
  pipeline_version text not null,
  target_cost numeric(18,9) not null check (target_cost >= 0),
  warning_cost numeric(18,9) not null check (warning_cost >= target_cost),
  automatic_stop_cost numeric(18,9) not null check (automatic_stop_cost >= warning_cost),
  manual_extension_cost numeric(18,9) not null check (manual_extension_cost >= automatic_stop_cost),
  technical_limit_cost numeric(18,9) not null check (technical_limit_cost >= manual_extension_cost),
  daily_limit_cost numeric(18,9) not null check (daily_limit_cost >= automatic_stop_cost),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  fx_policy_version text not null,
  usd_to_eur numeric(18,9) not null check (usd_to_eur > 0),
  max_rounds integer not null check (max_rounds = 2),
  max_initial_searches integer not null check (max_initial_searches between 1 and 4),
  max_focused_queries integer not null check (max_focused_queries between 1 and 3),
  max_accepted_sources integer not null check (max_accepted_sources between 1 and 8),
  max_concurrency integer not null check (max_concurrency = 1),
  max_regenerations integer not null check (max_regenerations = 0),
  created_at timestamptz not null default now()
);

insert into public.real_editorial_pilot_policies (
  id,destination_name,country_code,destination_type,pipeline_version,
  target_cost,warning_cost,automatic_stop_cost,manual_extension_cost,technical_limit_cost,
  daily_limit_cost,currency,fx_policy_version,usd_to_eur,max_rounds,max_initial_searches,
  max_focused_queries,max_accepted_sources,max_concurrency,max_regenerations
) values (
  'morella-real-editorial-pilot-v1','Morella','ES','locality','real-editorial-v1',
  0.125000000,0.160000000,0.200000000,0.250000000,0.500000000,
  0.200000000,'EUR','real-editorial-fx-2026-07-25.1',1.000000000,2,4,3,8,1,0
);

create table public.real_editorial_pilots (
  id uuid primary key default gen_random_uuid(),
  policy_id text not null references public.real_editorial_pilot_policies(id) on delete restrict,
  mode text not null references public.editorial_execution_modes(mode) on delete restrict
    check (mode = 'real_editorial_pilot'),
  task_origin text not null check (task_origin in ('human_authorized','automatic_authorized')),
  variant_key text not null check (length(variant_key) between 1 and 120),
  preparation_key text not null unique check (length(preparation_key) between 1 and 160),
  identity_key text not null unique check (identity_key ~ '^[a-f0-9]{64}$'),
  canonical_destination_id uuid not null references public.geographic_entities(id) on delete restrict,
  destination_name text not null,
  normalized_destination text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  destination_type text not null check (destination_type in ('country','region','locality','zone')),
  language text not null check (language ~ '^[a-z]{2}$'),
  pipeline_version text not null,
  profile_configuration jsonb not null check (jsonb_typeof(profile_configuration) = 'array'),
  state text not null check (state in (
    'queued','preflight','researching_round_1','evaluating_round_1',
    'researching_round_2','evaluating_round_2','generating_adventure',
    'generating_student','final_review','pending_human_review',
    'ready_for_human_review','review_required','failed','cancelled'
  )),
  budget_confirmed boolean not null default false,
  publication_count integer not null default 0 check (publication_count = 0),
  trawel_connected boolean not null default false check (trawel_connected = false),
  automatic_enabled boolean not null default false check (automatic_enabled = false),
  current_run_id uuid,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (policy_id,variant_key)
);

create table public.real_editorial_runs (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  attempt integer not null check (attempt between 1 and 10),
  state text not null check (state in (
    'queued','preflight','researching_round_1','evaluating_round_1',
    'researching_round_2','evaluating_round_2','generating_adventure',
    'generating_student','final_review','pending_human_review',
    'ready_for_human_review','review_required','failed','cancelled'
  )),
  current_round integer not null default 0 check (current_round between 0 and 2),
  checkpoint_version integer not null default 0 check (checkpoint_version >= 0),
  prompt_version text not null,
  schema_version text not null,
  accumulated_cost numeric(18,9) not null default 0 check (accumulated_cost >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  cancel_requested_at timestamptz,
  cancelled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pilot_id,attempt)
);

alter table public.real_editorial_pilots
  add constraint real_editorial_pilots_current_run_fkey
  foreign key (current_run_id) references public.real_editorial_runs(id) on delete restrict;

create table public.real_editorial_pilot_budgets (
  pilot_id uuid primary key references public.real_editorial_pilots(id) on delete restrict,
  task_id text not null unique,
  batch_id text not null unique,
  daily_scope_id text not null unique,
  budget_date date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  target_cost numeric(18,9) not null,
  warning_cost numeric(18,9) not null,
  task_limit_cost numeric(18,9) not null,
  batch_limit_cost numeric(18,9) not null,
  daily_limit_cost numeric(18,9) not null,
  manual_extension_cost numeric(18,9) not null,
  technical_limit_cost numeric(18,9) not null,
  reserved_cost numeric(18,9) not null default 0 check (reserved_cost >= 0),
  spent_cost numeric(18,9) not null default 0 check (spent_cost >= 0),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_cost <= warning_cost),
  check (warning_cost <= task_limit_cost),
  check (task_limit_cost = batch_limit_cost and batch_limit_cost = daily_limit_cost),
  check (daily_limit_cost <= manual_extension_cost and manual_extension_cost <= technical_limit_cost),
  check (reserved_cost + spent_cost <= task_limit_cost)
);

create table public.real_editorial_tariffs (
  id text primary key check (length(id) between 1 and 160),
  provider_id text not null,
  model text not null,
  operation text not null,
  currency text not null check (currency = 'EUR'),
  unit_scale bigint not null check (unit_scale > 0),
  input_unit_cost numeric(18,9) not null default 0,
  cached_input_unit_cost numeric(18,9) not null default 0,
  output_unit_cost numeric(18,9) not null default 0,
  credit_unit_cost numeric(18,9) not null default 0,
  effective_from timestamptz not null,
  source_reference text not null,
  fx_policy_version text not null,
  created_at timestamptz not null default now(),
  unique (provider_id,model,operation,effective_from)
);

insert into public.real_editorial_tariffs (
  id,provider_id,model,operation,currency,unit_scale,input_unit_cost,
  cached_input_unit_cost,output_unit_cost,credit_unit_cost,effective_from,
  source_reference,fx_policy_version
) values
  (
    'morella-v1-tavily-search','tavily','search-and-extract','search','EUR',1,
    0,0,0,0.008000000,'2026-07-25T00:00:00+02:00',
    'https://docs.tavily.com/documentation/api-credits',
    'real-editorial-fx-2026-07-25.1'
  ),
  (
    'morella-v1-openai-responses','openai','gpt-5.6-luna','responses','EUR',1000000,
    1.000000000,0.100000000,6.000000000,0,'2026-07-25T00:00:00+02:00',
    'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
    'real-editorial-fx-2026-07-25.1'
  );

create table public.real_editorial_execution_guard (
  guard_name text primary key check (guard_name = 'morella-real-editorial'),
  owner_execution_id text,
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

insert into public.real_editorial_execution_guard (guard_name)
values ('morella-real-editorial');

create table public.real_editorial_call_reservations (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique default gen_random_uuid(),
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 160),
  execution_id text not null,
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  task_id text not null,
  batch_id text not null,
  stage text not null,
  operation text not null,
  provider_id text not null,
  model text not null,
  attempt integer not null check (attempt between 1 and 10),
  retry_of_call_id uuid,
  estimated_cost numeric(18,9) not null check (estimated_cost > 0),
  reserved_cost numeric(18,9) not null check (reserved_cost > 0),
  calculated_cost numeric(18,9),
  currency text not null check (currency = 'EUR'),
  tariff_id text not null references public.real_editorial_tariffs(id) on delete restrict,
  state text not null check (state in ('reserved','started','reconciled','failed','cancelled','unknown')),
  prompt_version text not null,
  schema_version text not null,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reconciled_at timestamptz
);

create table public.real_editorial_provider_calls (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  sequence integer not null check (sequence > 0),
  reservation_id uuid not null references public.real_editorial_call_reservations(id) on delete restrict,
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  stage text not null,
  operation text not null,
  provider_id text not null,
  model text not null,
  state text not null check (state in ('reserved','started','succeeded','failed','cancelled','unknown')),
  attempt integer not null,
  retry_of_call_id uuid,
  remote_id text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  tool_calls integer not null default 0,
  tools jsonb not null default '[]'::jsonb,
  credits numeric(18,9) not null default 0,
  estimated_cost numeric(18,9) not null,
  reserved_cost numeric(18,9) not null,
  calculated_cost numeric(18,9),
  currency text not null,
  tariff_id text not null references public.real_editorial_tariffs(id) on delete restrict,
  sanitized_error text,
  prompt_version text not null,
  schema_version text not null,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  output_hash text,
  created_at timestamptz not null default now(),
  unique (call_id,sequence)
);

create table public.real_editorial_artifacts (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  artifact_kind text not null check (artifact_kind in (
    'mission','round','query','tavily_result','source_accepted','source_rejected',
    'extracted_document','evidence','master_knowledge','fact','place','activity',
    'gap','contradiction','coverage','draft_adventure','draft_student',
    'final_review','checkpoint'
  )),
  artifact_key text not null,
  version integer not null check (version > 0),
  payload jsonb not null check (jsonb_typeof(payload) in ('object','array')),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (run_id,artifact_kind,artifact_key,version)
);

create table public.real_editorial_events (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid references public.real_editorial_runs(id) on delete restrict,
  event_type text not null,
  state text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now()
);

create table public.real_editorial_incidents (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid references public.real_editorial_runs(id) on delete restrict,
  code text not null,
  classification text not null check (classification in ('recoverable','permanent','ambiguous','human_required')),
  message text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create view public.editorial_work_items as
select
  request.id::text as item_id,
  'manual'::text as mode,
  'manual_human'::text as task_origin,
  request.destination_id::text as destination_id,
  request.destination_query_snapshot as destination_name,
  request.configuration_version as pipeline_version,
  request.state,
  request.created_at,
  request.updated_at
from public.editorial_research_requests request
union all
select
  pilot.id::text,
  pilot.mode,
  pilot.task_origin,
  pilot.canonical_destination_id::text,
  pilot.destination_name,
  pilot.pipeline_version,
  pilot.state,
  pilot.created_at,
  pilot.updated_at
from public.real_editorial_pilots pilot;

create or replace function public.prevent_real_editorial_append_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'REAL_EDITORIAL_APPEND_ONLY';
end;
$$;

create trigger real_editorial_policy_append_only
  before update or delete on public.real_editorial_pilot_policies
  for each row execute function public.prevent_real_editorial_append_mutation();
create trigger real_editorial_tariff_append_only
  before update or delete on public.real_editorial_tariffs
  for each row execute function public.prevent_real_editorial_append_mutation();
create trigger real_editorial_calls_append_only
  before update or delete on public.real_editorial_provider_calls
  for each row execute function public.prevent_real_editorial_append_mutation();
create trigger real_editorial_artifacts_append_only
  before update or delete on public.real_editorial_artifacts
  for each row execute function public.prevent_real_editorial_append_mutation();
create trigger real_editorial_events_append_only
  before update or delete on public.real_editorial_events
  for each row execute function public.prevent_real_editorial_append_mutation();

create trigger real_editorial_pilots_updated
  before update on public.real_editorial_pilots
  for each row execute function public.set_updated_at();
create trigger real_editorial_runs_updated
  before update on public.real_editorial_runs
  for each row execute function public.set_updated_at();
create trigger real_editorial_budgets_updated
  before update on public.real_editorial_pilot_budgets
  for each row execute function public.set_updated_at();
create trigger real_editorial_reservations_updated
  before update on public.real_editorial_call_reservations
  for each row execute function public.set_updated_at();

create or replace function public.prepare_real_editorial_pilot(
  p_pilot_id uuid,
  p_run_id uuid,
  p_policy_id text,
  p_preparation_key text,
  p_identity_key text,
  p_variant_key text,
  p_destination_id uuid,
  p_profiles jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare existing_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('real-editorial-prepare:' || p_identity_key,0));
  select id into existing_id from public.real_editorial_pilots
   where preparation_key = p_preparation_key;
  if found then return existing_id; end if;
  if exists (select 1 from public.real_editorial_pilots where identity_key = p_identity_key) then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_REAL_EDITORIAL_PILOT';
  end if;

  insert into public.real_editorial_pilots (
    id,policy_id,mode,task_origin,variant_key,preparation_key,identity_key,
    canonical_destination_id,destination_name,normalized_destination,country_code,
    destination_type,language,pipeline_version,profile_configuration,state
  ) values (
    p_pilot_id,p_policy_id,'real_editorial_pilot','human_authorized',p_variant_key,
    p_preparation_key,p_identity_key,p_destination_id,'Morella','morella','ES',
    'locality','es','real-editorial-v1',p_profiles,'queued'
  );
  insert into public.real_editorial_runs (
    id,pilot_id,attempt,state,prompt_version,schema_version
  ) values (
    p_run_id,p_pilot_id,1,'queued','morella-real-editorial-v1','real-editorial-snapshot-v1'
  );
  update public.real_editorial_pilots set current_run_id = p_run_id where id = p_pilot_id;
  insert into public.real_editorial_events (pilot_id,run_id,event_type,state,payload)
  values (
    p_pilot_id,p_run_id,'real.editorial.pilot.prepared','queued',
    jsonb_build_object('policyId',p_policy_id,'variantKey',p_variant_key,'mode','real_editorial_pilot')
  );
  return p_pilot_id;
end;
$$;

create or replace function public.confirm_real_editorial_budget(
  p_pilot_id uuid,
  p_budget_date date
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  policy public.real_editorial_pilot_policies%rowtype;
  existing public.real_editorial_pilot_budgets%rowtype;
begin
  select * into policy from public.real_editorial_pilot_policies
   where id = (select policy_id from public.real_editorial_pilots where id = p_pilot_id);
  if not found then raise exception 'REAL_EDITORIAL_POLICY_MISSING'; end if;
  select * into existing from public.real_editorial_pilot_budgets where pilot_id = p_pilot_id;
  if found then
    if existing.task_limit_cost = policy.automatic_stop_cost
       and existing.batch_limit_cost = policy.automatic_stop_cost
       and existing.daily_limit_cost = policy.daily_limit_cost
       and existing.currency = policy.currency then
      return true;
    end if;
    raise exception 'REAL_EDITORIAL_BUDGET_CONFLICT';
  end if;

  insert into public.real_editorial_pilot_budgets (
    pilot_id,task_id,batch_id,daily_scope_id,budget_date,currency,target_cost,warning_cost,
    task_limit_cost,batch_limit_cost,daily_limit_cost,manual_extension_cost,
    technical_limit_cost,confirmed_at
  ) values (
    p_pilot_id,'real-editorial-task:' || p_pilot_id::text,
    'real-editorial-batch:' || p_pilot_id::text,
    'real-editorial-day:' || p_pilot_id::text,p_budget_date,policy.currency,
    policy.target_cost,policy.warning_cost,policy.automatic_stop_cost,
    policy.automatic_stop_cost,policy.daily_limit_cost,policy.manual_extension_cost,
    policy.technical_limit_cost,now()
  );
  update public.real_editorial_pilots
     set budget_confirmed = true,state = 'preflight'
   where id = p_pilot_id;
  insert into public.real_editorial_events (pilot_id,run_id,event_type,state,payload)
  select p_pilot_id,current_run_id,'real.editorial.budget.confirmed','preflight',
    jsonb_build_object('automaticStopEur',policy.automatic_stop_cost,'budgetDate',p_budget_date)
  from public.real_editorial_pilots where id = p_pilot_id;
  return true;
end;
$$;

create or replace function public.acquire_real_editorial_guard(
  p_execution_id text,
  p_lease_token uuid,
  p_expires_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  if p_expires_at <= now() then return false; end if;
  update public.real_editorial_execution_guard
     set owner_execution_id = p_execution_id,
         lease_token = p_lease_token,
         acquired_at = now(),
         expires_at = p_expires_at,
         updated_at = now()
   where guard_name = 'morella-real-editorial'
     and (owner_execution_id is null or expires_at <= now() or lease_token = p_lease_token);
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.release_real_editorial_guard(
  p_lease_token uuid
) returns boolean language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  update public.real_editorial_execution_guard
     set owner_execution_id = null,lease_token = null,acquired_at = null,expires_at = null,updated_at = now()
   where guard_name = 'morella-real-editorial' and lease_token = p_lease_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.reserve_real_editorial_call(
  p_idempotency_key text,
  p_execution_id text,
  p_pilot_id uuid,
  p_run_id uuid,
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
  existing public.real_editorial_call_reservations%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  reservation_id uuid;
  new_call_id uuid := gen_random_uuid();
  previous_state text;
begin
  perform pg_advisory_xact_lock(hashtextextended('real-editorial:' || p_idempotency_key,0));
  select * into existing from public.real_editorial_call_reservations
   where idempotency_key = p_idempotency_key;
  if found then
    if existing.execution_id is not distinct from p_execution_id
       and existing.pilot_id is not distinct from p_pilot_id
       and existing.run_id is not distinct from p_run_id
       and existing.task_id is not distinct from p_task_id
       and existing.batch_id is not distinct from p_batch_id
       and existing.stage is not distinct from p_stage
       and existing.operation is not distinct from p_operation
       and existing.provider_id is not distinct from p_provider_id
       and existing.model is not distinct from p_model
       and existing.attempt is not distinct from p_attempt
       and existing.retry_of_call_id is not distinct from p_retry_of_call_id
       and existing.estimated_cost is not distinct from p_estimated_cost
       and existing.currency is not distinct from p_currency
       and existing.tariff_id is not distinct from p_tariff_id
       and existing.prompt_version is not distinct from p_prompt_version
       and existing.schema_version is not distinct from p_schema_version
       and existing.input_hash is not distinct from p_input_hash then
      return existing.id;
    end if;
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
  end if;

  if not exists (
    select 1 from public.real_editorial_execution_guard
     where guard_name = 'morella-real-editorial'
       and owner_execution_id = p_execution_id and expires_at > now()
  ) then raise exception 'REAL_EDITORIAL_GUARD_REQUIRED'; end if;

  if p_retry_of_call_id is not null then
    select state into previous_state from public.real_editorial_provider_calls
     where call_id = p_retry_of_call_id order by sequence desc limit 1;
    if previous_state = 'unknown' then raise exception 'AMBIGUOUS_TIMEOUT_NOT_RETRYABLE'; end if;
  end if;

  select * into budget from public.real_editorial_pilot_budgets
   where pilot_id = p_pilot_id for update;
  if not found then raise exception 'REAL_EDITORIAL_BUDGET_MISSING'; end if;
  if budget.task_id <> p_task_id or budget.batch_id <> p_batch_id or budget.currency <> p_currency then
    raise exception 'REAL_EDITORIAL_BUDGET_MISMATCH';
  end if;
  if budget.spent_cost + budget.reserved_cost + p_estimated_cost > budget.task_limit_cost
     or budget.spent_cost + budget.reserved_cost + p_estimated_cost > budget.batch_limit_cost
     or budget.spent_cost + budget.reserved_cost + p_estimated_cost > budget.daily_limit_cost then
    raise exception 'REAL_EDITORIAL_BUDGET_EXCEEDED';
  end if;

  insert into public.real_editorial_call_reservations (
    call_id,idempotency_key,execution_id,pilot_id,run_id,task_id,batch_id,stage,operation,
    provider_id,model,attempt,retry_of_call_id,estimated_cost,reserved_cost,currency,tariff_id,
    state,prompt_version,schema_version,input_hash
  ) values (
    new_call_id,p_idempotency_key,p_execution_id,p_pilot_id,p_run_id,p_task_id,p_batch_id,p_stage,p_operation,
    p_provider_id,p_model,p_attempt,p_retry_of_call_id,p_estimated_cost,p_estimated_cost,p_currency,p_tariff_id,
    'reserved',p_prompt_version,p_schema_version,p_input_hash
  ) returning id into reservation_id;

  update public.real_editorial_pilot_budgets
     set reserved_cost = reserved_cost + p_estimated_cost
   where pilot_id = p_pilot_id;

  insert into public.real_editorial_provider_calls (
    call_id,sequence,reservation_id,pilot_id,run_id,stage,operation,provider_id,model,state,
    attempt,retry_of_call_id,estimated_cost,reserved_cost,currency,tariff_id,prompt_version,
    schema_version,input_hash
  ) values (
    new_call_id,1,reservation_id,p_pilot_id,p_run_id,p_stage,p_operation,p_provider_id,p_model,'reserved',
    p_attempt,p_retry_of_call_id,p_estimated_cost,p_estimated_cost,p_currency,p_tariff_id,p_prompt_version,
    p_schema_version,p_input_hash
  );
  return reservation_id;
end;
$$;

create or replace function public.start_real_editorial_call(
  p_reservation_id uuid
) returns boolean language plpgsql security definer set search_path = public as $$
declare reservation public.real_editorial_call_reservations%rowtype;
begin
  select * into reservation from public.real_editorial_call_reservations
   where id = p_reservation_id for update;
  if not found then raise exception 'REAL_EDITORIAL_RESERVATION_NOT_FOUND'; end if;
  if reservation.state <> 'reserved' then raise exception 'REAL_EDITORIAL_RESERVATION_ALREADY_STARTED'; end if;
  update public.real_editorial_call_reservations set state = 'started' where id = reservation.id;
  insert into public.real_editorial_provider_calls (
    call_id,sequence,reservation_id,pilot_id,run_id,stage,operation,provider_id,model,state,
    attempt,retry_of_call_id,estimated_cost,reserved_cost,currency,tariff_id,prompt_version,
    schema_version,input_hash
  ) values (
    reservation.call_id,2,reservation.id,reservation.pilot_id,reservation.run_id,reservation.stage,
    reservation.operation,reservation.provider_id,reservation.model,'started',reservation.attempt,
    reservation.retry_of_call_id,reservation.estimated_cost,reservation.reserved_cost,reservation.currency,
    reservation.tariff_id,reservation.prompt_version,reservation.schema_version,reservation.input_hash
  );
  return true;
end;
$$;

create or replace function public.settle_real_editorial_call(
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
  reservation public.real_editorial_call_reservations%rowtype;
  next_sequence integer;
  terminal_state text;
begin
  if p_outcome not in ('succeeded','failed','cancelled','unknown') then
    raise exception 'REAL_EDITORIAL_OUTCOME_INVALID';
  end if;
  select * into reservation from public.real_editorial_call_reservations
   where id = p_reservation_id for update;
  if not found then raise exception 'REAL_EDITORIAL_RESERVATION_NOT_FOUND'; end if;
  if reservation.state not in ('reserved','started') then raise exception 'REAL_EDITORIAL_RESERVATION_TERMINAL'; end if;
  if p_outcome <> 'unknown' and coalesce(p_calculated_cost,0) > reservation.reserved_cost then
    raise exception 'REAL_EDITORIAL_COST_EXCEEDS_RESERVATION';
  end if;

  if p_outcome = 'unknown' then
    terminal_state := 'unknown';
  else
    update public.real_editorial_pilot_budgets
       set reserved_cost = reserved_cost - reservation.reserved_cost,
           spent_cost = spent_cost + coalesce(p_calculated_cost,0)
     where pilot_id = reservation.pilot_id;
    terminal_state := case when p_outcome = 'succeeded' then 'reconciled' else p_outcome end;
  end if;

  update public.real_editorial_call_reservations
     set state = terminal_state,
         calculated_cost = case when p_outcome = 'unknown' then null else coalesce(p_calculated_cost,0) end,
         reconciled_at = case when p_outcome = 'unknown' then null else now() end
   where id = reservation.id;

  select coalesce(max(sequence),0) + 1 into next_sequence
    from public.real_editorial_provider_calls where call_id = reservation.call_id;
  insert into public.real_editorial_provider_calls (
    call_id,sequence,reservation_id,pilot_id,run_id,stage,operation,provider_id,model,state,
    attempt,retry_of_call_id,remote_id,input_tokens,output_tokens,tool_calls,tools,credits,
    estimated_cost,reserved_cost,calculated_cost,currency,tariff_id,sanitized_error,
    prompt_version,schema_version,input_hash,output_hash
  ) values (
    reservation.call_id,next_sequence,reservation.id,reservation.pilot_id,reservation.run_id,
    reservation.stage,reservation.operation,reservation.provider_id,reservation.model,p_outcome,
    reservation.attempt,reservation.retry_of_call_id,p_remote_id,coalesce(p_input_tokens,0),
    coalesce(p_output_tokens,0),coalesce(p_tool_calls,0),coalesce(p_tools,'[]'::jsonb),
    coalesce(p_credits,0),reservation.estimated_cost,reservation.reserved_cost,
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
    'editorial_execution_modes','real_editorial_pilot_policies','real_editorial_pilots',
    'real_editorial_runs','real_editorial_pilot_budgets','real_editorial_tariffs',
    'real_editorial_execution_guard','real_editorial_call_reservations',
    'real_editorial_provider_calls','real_editorial_artifacts','real_editorial_events',
    'real_editorial_incidents'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated',table_name);
  end loop;
end $$;

revoke all on public.editorial_work_items from public,anon,authenticated;

grant select on table
  public.editorial_execution_modes,public.real_editorial_pilot_policies,
  public.real_editorial_tariffs,public.real_editorial_execution_guard,
  public.real_editorial_provider_calls,public.editorial_work_items
to service_role;

grant select,insert,update on table
  public.real_editorial_pilots,public.real_editorial_runs,
  public.real_editorial_pilot_budgets,public.real_editorial_call_reservations,
  public.real_editorial_incidents
to service_role;

grant select,insert on table
  public.real_editorial_artifacts,public.real_editorial_events
to service_role;

revoke all on function public.acquire_real_editorial_guard(text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.release_real_editorial_guard(uuid) from public,anon,authenticated;
revoke all on function public.prepare_real_editorial_pilot(uuid,uuid,text,text,text,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.confirm_real_editorial_budget(uuid,date) from public,anon,authenticated;
revoke all on function public.reserve_real_editorial_call(
  text,text,uuid,uuid,text,text,text,text,text,text,integer,uuid,numeric,text,text,text,text,text
) from public,anon,authenticated;
revoke all on function public.start_real_editorial_call(uuid) from public,anon,authenticated;
revoke all on function public.settle_real_editorial_call(
  uuid,text,numeric,text,bigint,bigint,integer,jsonb,numeric,text,text
) from public,anon,authenticated;

grant execute on function public.acquire_real_editorial_guard(text,uuid,timestamptz) to service_role;
grant execute on function public.release_real_editorial_guard(uuid) to service_role;
grant execute on function public.prepare_real_editorial_pilot(uuid,uuid,text,text,text,text,uuid,jsonb) to service_role;
grant execute on function public.confirm_real_editorial_budget(uuid,date) to service_role;
grant execute on function public.reserve_real_editorial_call(
  text,text,uuid,uuid,text,text,text,text,text,text,integer,uuid,numeric,text,text,text,text,text
) to service_role;
grant execute on function public.start_real_editorial_call(uuid) to service_role;
grant execute on function public.settle_real_editorial_call(
  uuid,text,numeric,text,bigint,bigint,integer,jsonb,numeric,text,text
) to service_role;
