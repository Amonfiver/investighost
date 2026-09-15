-- Reconciliación de una respuesta de analysis confirmada localmente pero perdida
-- antes de que el receipt/artifact pudiera persistirse. No es una llamada ambigua:
-- el proveedor completó, el envelope y el contrato canónico ya habían validado.
-- Como usage/remote id se perdieron del proceso, el coste se reconoce mediante un
-- techo prudencial reproducible, no como coste exacto del proveedor.

create table public.real_editorial_confirmed_analysis_response_losses (
  id uuid primary key default gen_random_uuid(),
  resolution_key text not null unique check (resolution_key ~ '^[a-f0-9]{64}$'),
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  call_id uuid not null unique,
  reservation_id uuid not null unique references public.real_editorial_call_reservations(id) on delete restrict,
  adjustment_reservation_id uuid not null unique references public.real_editorial_call_reservations(id) on delete restrict,
  triggering_incident_id uuid not null references public.real_editorial_incidents(id) on delete restrict,
  loss_incident_id uuid not null unique references public.real_editorial_incidents(id) on delete restrict,
  actor_id uuid not null,
  provider_id text not null check (provider_id = 'deepseek'),
  operation text not null check (operation = 'analysis'),
  currency text not null check (currency = 'EUR'),
  pricing_band text not null check (pricing_band = 'off_peak'),
  input_token_cap bigint not null check (input_token_cap = 200000),
  output_token_cap bigint not null check (output_token_cap = 12000),
  prudential_cost numeric(18,9) not null check (prudential_cost > 0),
  original_reserved_cost numeric(18,9) not null check (original_reserved_cost > 0),
  adjustment_cost numeric(18,9) not null check (adjustment_cost > 0),
  reason text not null check (
    length(btrim(reason)) between 1 and 500
    and reason !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ),
  note text check (
    note is null or (
      length(btrim(note)) between 1 and 1000
      and note !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
    )
  ),
  created_at timestamptz not null default now(),
  check (prudential_cost = original_reserved_cost + adjustment_cost)
);

alter table public.real_editorial_confirmed_analysis_response_losses enable row level security;
revoke all on table public.real_editorial_confirmed_analysis_response_losses
from public,anon,authenticated;
grant select on table public.real_editorial_confirmed_analysis_response_losses to service_role;
create trigger real_editorial_confirmed_analysis_response_losses_append_only
  before update or delete on public.real_editorial_confirmed_analysis_response_losses
  for each row execute function public.prevent_real_editorial_append_mutation();

create function public.reconcile_real_editorial_confirmed_analysis_response_loss(
  p_resolution_key text,
  p_pilot_id uuid,
  p_run_id uuid,
  p_call_id uuid,
  p_incident_id uuid,
  p_actor_id uuid,
  p_currency text,
  p_reason text,
  p_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  reservation public.real_editorial_call_reservations%rowtype;
  pilot public.real_editorial_pilots%rowtype;
  run public.real_editorial_runs%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  tariff public.real_editorial_tariffs%rowtype;
  incident public.real_editorial_incidents%rowtype;
  existing public.real_editorial_confirmed_analysis_response_losses%rowtype;
  resolution_id uuid := gen_random_uuid();
  adjustment_reservation_id uuid := gen_random_uuid();
  adjustment_call_id uuid := gen_random_uuid();
  loss_incident_id uuid := gen_random_uuid();
  derived_cost numeric(18,9);
  adjustment_cost numeric(18,9);
  next_sequence integer;
begin
  if p_resolution_key !~ '^[a-f0-9]{64}$' then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_RESOLUTION_KEY_INVALID';
  end if;
  if p_actor_id is null then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_ACTOR_REQUIRED';
  end if;
  if p_currency <> 'EUR' then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_CURRENCY_INVALID';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500
     or p_reason ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])' then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_REASON_INVALID';
  end if;
  if p_note is not null and (length(btrim(p_note)) not between 1 and 1000
     or p_note ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])') then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_NOTE_UNSAFE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-confirmed-analysis-loss:' || p_call_id::text,0)
  );
  select * into existing
    from public.real_editorial_confirmed_analysis_response_losses
   where resolution_key = p_resolution_key;
  if found then
    if existing.pilot_id = p_pilot_id
       and existing.run_id = p_run_id
       and existing.call_id = p_call_id
       and existing.triggering_incident_id = p_incident_id
       and existing.actor_id = p_actor_id
       and existing.currency = p_currency
       and existing.reason = btrim(p_reason)
       and existing.note is not distinct from p_note then
      return existing.id;
    end if;
    raise exception 'CONFIRMED_ANALYSIS_LOSS_IDEMPOTENCY_CONFLICT';
  end if;

  select * into pilot from public.real_editorial_pilots
   where id = p_pilot_id for update;
  select * into run from public.real_editorial_runs
   where id = p_run_id and pilot_id = p_pilot_id for update;
  if pilot.id is null or run.id is null or pilot.current_run_id <> p_run_id then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_PILOT_RUN_INVALID';
  end if;
  if pilot.state not in ('preflight','researching_round_1','evaluating_round_1','researching_round_2',
       'evaluating_round_2','generating_adventure','generating_student','final_review')
     or run.state not in ('preflight','researching_round_1','evaluating_round_1','researching_round_2',
       'evaluating_round_2','generating_adventure','generating_student','final_review') then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_STATE_INVALID';
  end if;
  if exists (
    select 1 from public.real_editorial_execution_guard
     where guard_name = 'morella-real-editorial'
       and owner_execution_id is not null and expires_at > now()
  ) then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_GUARD_BUSY';
  end if;

  select * into reservation from public.real_editorial_call_reservations
   where call_id = p_call_id for update;
  if not found or reservation.pilot_id <> p_pilot_id or reservation.run_id <> p_run_id
     or reservation.state <> 'started' or reservation.provider_id <> 'deepseek'
     or reservation.operation <> 'analysis' or reservation.currency <> p_currency then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_RESERVATION_INVALID';
  end if;
  if exists (
    select 1 from public.real_editorial_analysis_provider_receipts
     where call_id = p_call_id or reservation_id = reservation.id
  ) or exists (
    select 1 from public.real_editorial_artifacts
     where run_id = p_run_id and artifact_kind = 'round' and artifact_key = 'round-1'
  ) or exists (
    select 1 from public.real_editorial_provider_calls
     where call_id = p_call_id and state in ('succeeded','failed','cancelled','unknown')
  ) then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_NOT_RECOVERABLE';
  end if;

  select * into incident from public.real_editorial_incidents
   where id = p_incident_id and pilot_id = p_pilot_id and run_id = p_run_id for update;
  if not found or incident.code <> 'ACTUAL_COST_EXCEEDS_RESERVATION'
     or incident.classification <> 'human_required' or incident.resolved_at is not null then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_INCIDENT_INVALID';
  end if;

  select * into tariff from public.real_editorial_tariffs where id = reservation.tariff_id;
  if not found or tariff.provider_id <> 'deepseek' or tariff.model <> reservation.model
     or tariff.operation <> 'responses' or tariff.currency <> 'EUR'
     or tariff.unit_scale <> 1000000 or tariff.input_unit_cost <> 0.220000000
     or tariff.cached_input_unit_cost <> 0.007000000 or tariff.output_unit_cost <> 0.660000000
     or reservation.tariff_id not like '%off-peak%' then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_OFF_PEAK_TARIFF_INVALID';
  end if;
  -- All input is costed uncached. This is deliberately an upper bound, not usage.
  derived_cost := round(
    (tariff.input_unit_cost * 200000 + tariff.output_unit_cost * 12000) / tariff.unit_scale,
    9
  );
  adjustment_cost := round(derived_cost - reservation.reserved_cost,9);
  if derived_cost <= reservation.reserved_cost or adjustment_cost <= 0 then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_BOUND_INVALID';
  end if;

  select * into budget from public.real_editorial_pilot_budgets
   where pilot_id = p_pilot_id for update;
  if not found or budget.currency <> p_currency
     or budget.reserved_cost < reservation.reserved_cost then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_LEDGER_MISMATCH';
  end if;
  if budget.spent_cost + budget.reserved_cost - reservation.reserved_cost + derived_cost
       > budget.task_limit_cost
     or budget.spent_cost + budget.reserved_cost - reservation.reserved_cost + derived_cost
       > budget.batch_limit_cost
     or budget.spent_cost + budget.reserved_cost - reservation.reserved_cost + derived_cost
       > budget.daily_limit_cost then
    raise exception 'CONFIRMED_ANALYSIS_LOSS_BUDGET_EXCEEDED';
  end if;

  insert into public.real_editorial_call_reservations (
    id,call_id,idempotency_key,execution_id,pilot_id,run_id,task_id,batch_id,stage,
    operation,provider_id,model,attempt,retry_of_call_id,estimated_cost,reserved_cost,
    calculated_cost,currency,tariff_id,state,prompt_version,schema_version,input_hash,
    reconciled_at
  ) values (
    adjustment_reservation_id,adjustment_call_id,
    reservation.idempotency_key || ':loss-adjustment',reservation.execution_id,
    p_pilot_id,p_run_id,reservation.task_id,reservation.batch_id,
    reservation.stage || '_cost_adjustment','cost_adjustment','deepseek',reservation.model,
    reservation.attempt,reservation.call_id,adjustment_cost,adjustment_cost,adjustment_cost,
    p_currency,reservation.tariff_id,'reconciled',reservation.prompt_version,
    reservation.schema_version,reservation.input_hash,now()
  );

  update public.real_editorial_pilot_budgets
     set reserved_cost = reserved_cost - reservation.reserved_cost,
         spent_cost = spent_cost + derived_cost
   where pilot_id = p_pilot_id;
  update public.real_editorial_call_reservations
     set state = 'reconciled',calculated_cost = reservation.reserved_cost,reconciled_at = now()
   where id = reservation.id;

  select coalesce(max(sequence),0) + 1 into next_sequence
    from public.real_editorial_provider_calls where call_id = p_call_id;
  insert into public.real_editorial_provider_calls (
    call_id,sequence,reservation_id,pilot_id,run_id,stage,operation,provider_id,model,state,
    attempt,retry_of_call_id,input_tokens,output_tokens,tool_calls,tools,credits,
    estimated_cost,reserved_cost,calculated_cost,currency,tariff_id,sanitized_error,
    prompt_version,schema_version,input_hash
  ) values (
    p_call_id,next_sequence,reservation.id,p_pilot_id,p_run_id,reservation.stage,
    reservation.operation,reservation.provider_id,reservation.model,'succeeded',
    reservation.attempt,reservation.retry_of_call_id,0,0,0,'[]'::jsonb,0,
    reservation.estimated_cost,reservation.reserved_cost,reservation.reserved_cost,
    reservation.currency,reservation.tariff_id,
    'VALIDATED_RESULT_LOST_AFTER_PROVIDER_SUCCESS',reservation.prompt_version,
    reservation.schema_version,reservation.input_hash
  );
  insert into public.real_editorial_provider_calls (
    call_id,sequence,reservation_id,pilot_id,run_id,stage,operation,provider_id,model,state,
    attempt,retry_of_call_id,input_tokens,output_tokens,tool_calls,tools,credits,
    estimated_cost,reserved_cost,calculated_cost,currency,tariff_id,sanitized_error,
    prompt_version,schema_version,input_hash
  ) values (
    adjustment_call_id,1,adjustment_reservation_id,p_pilot_id,p_run_id,
    reservation.stage || '_cost_adjustment','cost_adjustment','deepseek',reservation.model,
    'succeeded',reservation.attempt,reservation.call_id,0,0,0,'[]'::jsonb,0,
    adjustment_cost,adjustment_cost,adjustment_cost,p_currency,reservation.tariff_id,
    'CONFIRMED_RESPONSE_LOSS_PRUDENTIAL_ADJUSTMENT',reservation.prompt_version,
    reservation.schema_version,reservation.input_hash
  );

  insert into public.real_editorial_incidents (
    id,pilot_id,run_id,code,classification,message
  ) values (
    loss_incident_id,p_pilot_id,p_run_id,
    'VALIDATED_RESULT_LOST_AFTER_PROVIDER_SUCCESS','human_required',
    'DeepSeek analysis validado localmente se perdió antes de persistir artifact y usage; no se reintentó al proveedor.'
  );
  insert into public.real_editorial_confirmed_analysis_response_losses (
    id,resolution_key,pilot_id,run_id,call_id,reservation_id,adjustment_reservation_id,
    triggering_incident_id,loss_incident_id,actor_id,provider_id,operation,currency,
    pricing_band,input_token_cap,output_token_cap,prudential_cost,original_reserved_cost,
    adjustment_cost,reason,note
  ) values (
    resolution_id,p_resolution_key,p_pilot_id,p_run_id,p_call_id,reservation.id,
    adjustment_reservation_id,p_incident_id,loss_incident_id,p_actor_id,'deepseek','analysis',
    p_currency,'off_peak',200000,12000,derived_cost,reservation.reserved_cost,
    adjustment_cost,btrim(p_reason),p_note
  );
  update public.real_editorial_incidents set resolved_at = now() where id = p_incident_id;
  update public.real_editorial_runs
     set state = 'preflight',cancel_requested_at = null,cancelled_at = null,completed_at = null,
         accumulated_cost = budget.spent_cost + derived_cost
   where id = p_run_id and pilot_id = p_pilot_id;
  update public.real_editorial_pilots set state = 'preflight'
   where id = p_pilot_id and current_run_id = p_run_id;
  insert into public.real_editorial_events (pilot_id,run_id,event_type,state,payload) values (
    p_pilot_id,p_run_id,'real.editorial.analysis.confirmed_response_lost','preflight',
    jsonb_build_object(
      'callId',p_call_id,'reservationId',reservation.id,'providerId','deepseek',
      'providerResult','confirmed_success','providerStatus','completed_by_control_flow',
      'envelopeValidation','pass_by_control_flow','canonicalJsonValidation','pass_by_control_flow',
      'zodValidation','pass_by_control_flow','artifactRecovery','lost','usageRecovery','lost',
      'reason','VALIDATED_RESULT_LOST_AFTER_PROVIDER_SUCCESS',
      'costKind','prudential_confirmed_response_usage_lost','pricingBand','off_peak',
      'inputTokenCap',200000,'outputTokenCap',12000,'prudentialCostEur',derived_cost,
      'originalReservedCostEur',reservation.reserved_cost,'adjustmentCostEur',adjustment_cost,
      'currency','EUR','providerCalled',false
    )
  );
  return resolution_id;
end;
$$;

revoke all on function public.reconcile_real_editorial_confirmed_analysis_response_loss(
  text,uuid,uuid,uuid,uuid,uuid,text,text,text
) from public,anon,authenticated;
grant execute on function public.reconcile_real_editorial_confirmed_analysis_response_loss(
  text,uuid,uuid,uuid,uuid,uuid,text,text,text
) to service_role;
