-- Endurece la idempotencia durable sin modificar reservas históricas ni su esquema.
--
-- Reversibilidad: la función previa puede volver a declararse mediante una migración
-- posterior. No hay tablas, columnas ni datos que retirar. Si existen reservas, una
-- reversión requiere auditoría porque perdería la detección de conflictos.

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
  existing_reservation public.provider_call_reservations%rowtype;
  reservation_id uuid;
  new_call_id uuid := gen_random_uuid();
  previous_state text;
  task_budget public.real_task_budgets%rowtype;
  batch_budget public.real_batch_budgets%rowtype;
  daily_budget public.real_daily_budgets%rowtype;
begin
  -- Una misma clave se serializa antes de leer o insertar. El segundo concurrente
  -- observa la fila confirmada por el primero y debe demostrar equivalencia completa.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));

  select * into existing_reservation
    from public.provider_call_reservations
   where idempotency_key = p_idempotency_key;

  if found then
    -- reserved_cost es la reserva máxima y, por contrato actual, se deriva de
    -- p_estimated_cost. input_hash es el fingerprint canónico de atribución,
    -- facturación, payload y límites de tokens, créditos y herramientas.
    if existing_reservation.execution_id is not distinct from p_execution_id
       and existing_reservation.request_id is not distinct from p_request_id
       and existing_reservation.run_id is not distinct from p_run_id
       and existing_reservation.task_id is not distinct from p_task_id
       and existing_reservation.batch_id is not distinct from p_batch_id
       and existing_reservation.budget_date is not distinct from p_budget_date
       and existing_reservation.stage is not distinct from p_stage
       and existing_reservation.operation is not distinct from p_operation
       and existing_reservation.provider_id is not distinct from p_provider_id
       and existing_reservation.model is not distinct from p_model
       and existing_reservation.attempt is not distinct from p_attempt
       and existing_reservation.retry_of_call_id is not distinct from p_retry_of_call_id
       and existing_reservation.estimated_cost is not distinct from p_estimated_cost
       and existing_reservation.reserved_cost is not distinct from p_estimated_cost
       and existing_reservation.currency is not distinct from p_currency
       and existing_reservation.tariff_id is not distinct from p_tariff_id
       and existing_reservation.prompt_version is not distinct from p_prompt_version
       and existing_reservation.schema_version is not distinct from p_schema_version
       and existing_reservation.input_hash is not distinct from p_input_hash then
      return existing_reservation.id;
    end if;

    -- Mensaje estable, sanitizado y sin parámetros. El workflow lo clasifica como
    -- conflicto no reintentable y nunca crea ni altera otra reserva.
    raise exception using
      errcode = 'P0001',
      message = 'IDEMPOTENCY_CONFLICT';
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

revoke all on function public.reserve_provider_call(
  text,text,text,text,text,text,date,text,text,text,text,integer,uuid,numeric,text,uuid,text,text,text
) from public,anon,authenticated;

grant execute on function public.reserve_provider_call(
  text,text,text,text,text,text,date,text,text,text,text,integer,uuid,numeric,text,uuid,text,text,text
) to service_role;
