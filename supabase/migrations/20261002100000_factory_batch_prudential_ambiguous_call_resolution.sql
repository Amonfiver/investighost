-- A dispatched batch DeepSeek analysis request can time out without durable
-- provider usage evidence.  A human may close that ambiguity prudentially:
-- the maximum already-reserved EUR amount is charged to the local budget, but
-- never represented as confirmed provider usage or a recovered response.
create function public.reconcile_generic_real_editorial_ambiguous_call_prudential(
  p_resolution_key text,
  p_execution_owner_id uuid,
  p_call_id uuid,
  p_reservation_id uuid,
  p_actor_id uuid,
  p_prudential_cost numeric,
  p_currency text,
  p_reason text,
  p_note text,
  p_duplicate_charge_risk_accepted boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  ambiguity public.real_editorial_ambiguous_calls%rowtype;
  reservation public.real_editorial_call_reservations%rowtype;
  execution public.real_editorial_executions%rowtype;
  existing public.real_editorial_call_human_resolutions%rowtype;
  checkpoint_payload jsonb;
  checkpoint_version integer;
  workflow_version text;
  resolution_id uuid := gen_random_uuid();
  next_sequence integer;
begin
  if p_resolution_key !~ '^[a-f0-9]{64}$' then raise exception 'HUMAN_RESOLUTION_KEY_INVALID'; end if;
  if p_actor_id is null then raise exception 'PRUDENTIAL_ACTOR_REQUIRED'; end if;
  if p_prudential_cost is null or p_prudential_cost::text = 'NaN' or p_prudential_cost <= 0 then
    raise exception 'PRUDENTIAL_COST_INVALID';
  end if;
  if p_currency <> 'EUR' then raise exception 'PRUDENTIAL_CURRENCY_INVALID'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500
      or p_reason ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])' then
    raise exception 'PRUDENTIAL_REASON_INVALID';
  end if;
  if p_note is not null and (length(btrim(p_note)) not between 1 and 1000
      or p_note ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])') then
    raise exception 'HUMAN_RESOLUTION_NOTE_UNSAFE';
  end if;
  if p_duplicate_charge_risk_accepted is distinct from true then
    raise exception 'PRUDENTIAL_DUPLICATE_CHARGE_RISK_NOT_ACCEPTED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('real-editorial-human:' || p_call_id::text, 0));
  select * into existing from public.real_editorial_call_human_resolutions where resolution_key = p_resolution_key;
  if found then
    if existing.execution_owner_id = p_execution_owner_id and existing.call_id = p_call_id
       and existing.reservation_id = p_reservation_id and existing.actor_id = p_actor_id
       and existing.decision = 'prudential_cost_assumed' and existing.prudential_cost = p_prudential_cost
       and existing.currency = p_currency and existing.reason = btrim(p_reason)
       and existing.note is not distinct from p_note and existing.duplicate_charge_risk_accepted = true then
      return existing.id;
    end if;
    raise exception 'HUMAN_RESOLUTION_IDEMPOTENCY_CONFLICT';
  end if;

  select * into ambiguity from public.real_editorial_ambiguous_calls
    where call_id = p_call_id and reservation_id = p_reservation_id
      and execution_owner_id = p_execution_owner_id for update;
  if not found then raise exception 'AMBIGUOUS_CALL_NOT_FOUND'; end if;
  if ambiguity.resolved_at is not null then raise exception 'AMBIGUOUS_CALL_ALREADY_RESOLVED'; end if;
  if ambiguity.source_state <> 'unknown' then raise exception 'PRUDENTIAL_CALL_NOT_AMBIGUOUS'; end if;

  select * into reservation from public.real_editorial_call_reservations
    where id = p_reservation_id for update;
  if not found or reservation.call_id <> p_call_id or reservation.execution_owner_id <> p_execution_owner_id
     or reservation.state <> 'unknown' or reservation.provider_id <> 'deepseek'
     or reservation.operation !~ '^analysis\\.stage_[a-z0-9_]+$' then
    raise exception 'AMBIGUOUS_RESERVATION_MISMATCH';
  end if;
  if reservation.currency <> p_currency then raise exception 'PRUDENTIAL_CURRENCY_MISMATCH'; end if;
  -- The conservative amount is exactly the maximum already approved for this
  -- call.  It is accounting prudence, not an asserted DeepSeek invoice.
  if p_prudential_cost <> reservation.reserved_cost then
    raise exception 'PRUDENTIAL_COST_MUST_EQUAL_RESERVED_MAXIMUM';
  end if;

  select * into execution from public.real_editorial_executions where id = p_execution_owner_id for update;
  if not found or execution.owner_type <> 'BATCH_JOB' then raise exception 'GENERIC_EXECUTION_OWNER_INVALID'; end if;
  if execution.reserved_cost < reservation.reserved_cost then raise exception 'PRUDENTIAL_RESERVE_LEDGER_MISMATCH'; end if;
  if execution.spent_cost + execution.reserved_cost - reservation.reserved_cost + p_prudential_cost > execution.task_limit_cost
     or execution.spent_cost + execution.reserved_cost - reservation.reserved_cost + p_prudential_cost > execution.batch_limit_cost
     or execution.spent_cost + execution.reserved_cost - reservation.reserved_cost + p_prudential_cost > execution.daily_limit_cost then
    raise exception 'HUMAN_RESOLUTION_BUDGET_EXCEEDED';
  end if;

  if exists (select 1 from public.real_editorial_provider_calls
      where call_id = p_call_id and execution_owner_id = p_execution_owner_id and state = 'succeeded') then
    raise exception 'PRUDENTIAL_PROVIDER_RESULT_BECAME_DURABLE';
  end if;
  select payload, version into checkpoint_payload, checkpoint_version from public.real_editorial_artifacts
    where execution_owner_id = p_execution_owner_id and artifact_kind = 'checkpoint' and artifact_key = 'workflow'
    order by version desc limit 1;
  workflow_version := nullif(checkpoint_payload->>'version', '');
  if checkpoint_payload is null or checkpoint_version is null or checkpoint_version <= 0
     or workflow_version is null or length(workflow_version) > 160 then
    raise exception 'PRUDENTIAL_CHECKPOINT_INVALID';
  end if;

  insert into public.real_editorial_call_human_resolutions (
    id,resolution_key,call_id,reservation_id,execution_owner_id,actor_id,decision,
    recognized_cost,currency,credits,input_tokens,output_tokens,note,response_recovered,external_usage_evidence,
    reason,prudential_cost,released_reserve,provider_id,operation,query,origin,
    provider_confirmed,duplicate_charge_risk_accepted,checkpoint_version,workflow_version
  ) values (
    resolution_id,p_resolution_key,p_call_id,reservation.id,p_execution_owner_id,p_actor_id,'prudential_cost_assumed',
    0,p_currency,0,0,0,p_note,false,
    jsonb_build_object('evidenceType','INSUFFICIENT_PROVIDER_USAGE_EVIDENCE','remoteResult','indeterminate',
      'accountingPolicy','PRUDENTIAL_MAX_ASSUMED','providerCostConfirmed',false,'responseRecovered',false),
    btrim(p_reason),p_prudential_cost,0,reservation.provider_id,reservation.operation,
    'analysis request fingerprint ' || reservation.input_hash,'human_prudential_reconciliation',
    false,true,checkpoint_version,workflow_version
  );

  update public.real_editorial_executions
    set reserved_cost = reserved_cost - reservation.reserved_cost,
        spent_cost = spent_cost + p_prudential_cost
    where id = execution.id;
  update public.real_editorial_call_reservations
    set state = 'failed', calculated_cost = p_prudential_cost, reconciled_at = now()
    where id = reservation.id;
  select coalesce(max(sequence),0) + 1 into next_sequence from public.real_editorial_provider_calls where call_id = p_call_id;
  insert into public.real_editorial_provider_calls (
    call_id,sequence,reservation_id,execution_owner_id,stage,operation,provider_id,model,state,attempt,
    retry_of_call_id,input_tokens,output_tokens,tool_calls,credits,estimated_cost,reserved_cost,
    calculated_cost,currency,tariff_id,sanitized_error,prompt_version,schema_version,input_hash
  ) values (
    p_call_id,next_sequence,reservation.id,p_execution_owner_id,reservation.stage,reservation.operation,
    reservation.provider_id,reservation.model,'failed',reservation.attempt,reservation.retry_of_call_id,
    0,0,0,0,reservation.estimated_cost,reservation.reserved_cost,p_prudential_cost,
    reservation.currency,reservation.tariff_id,'HUMAN_PRUDENTIAL_COST_ASSUMED',
    reservation.prompt_version,reservation.schema_version,reservation.input_hash
  );
  update public.real_editorial_ambiguous_calls
    set resolved_at = now(), terminal_decision = 'prudential_cost_assumed', terminal_resolution_id = resolution_id
    where call_id = p_call_id;
  update public.editorial_destination_batch_jobs
    set retryable = true, updated_at = now()
    where id = execution.owner_id and status = 'FAILED';
  return resolution_id;
end;
$$;

revoke all on function public.reconcile_generic_real_editorial_ambiguous_call_prudential(
  text,uuid,uuid,uuid,uuid,numeric,text,text,text,boolean
) from public,anon,authenticated;
grant execute on function public.reconcile_generic_real_editorial_ambiguous_call_prudential(
  text,uuid,uuid,uuid,uuid,numeric,text,text,text,boolean
) to service_role;
