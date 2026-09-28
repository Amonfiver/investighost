-- Batch owners reuse the same ambiguity and human-resolution ledger as pilots.
-- External provider usage can be recorded without fabricating an EUR FX rate
-- or reconstructing a lost editorial response.
alter table public.real_editorial_ambiguous_calls
  add column execution_owner_id uuid references public.real_editorial_executions(id) on delete restrict,
  alter column pilot_id drop not null,
  alter column run_id drop not null;

alter table public.real_editorial_ambiguous_calls
  add constraint real_editorial_ambiguous_calls_exactly_one_owner check (
    (execution_owner_id is null and pilot_id is not null and run_id is not null)
    or
    (execution_owner_id is not null and pilot_id is null and run_id is null)
  );

alter table public.real_editorial_call_human_resolutions
  add column execution_owner_id uuid references public.real_editorial_executions(id) on delete restrict,
  add column response_recovered boolean not null default true,
  add column external_usage_evidence jsonb,
  alter column pilot_id drop not null,
  alter column run_id drop not null;

alter table public.real_editorial_call_human_resolutions
  add constraint real_editorial_human_resolution_exactly_one_owner check (
    (execution_owner_id is null and pilot_id is not null and run_id is not null)
    or
    (execution_owner_id is not null and pilot_id is null and run_id is null)
  );

create index real_editorial_ambiguous_calls_execution_pending_idx
  on public.real_editorial_ambiguous_calls(execution_owner_id,opened_at)
  where resolved_at is null and execution_owner_id is not null;

create or replace function public.register_real_editorial_unknown_call()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.state = 'unknown' and old.state is distinct from 'unknown' then
    insert into public.real_editorial_ambiguous_calls (
      call_id,reservation_id,pilot_id,run_id,execution_owner_id,reason_code,source_state,opened_at
    ) values (
      new.call_id,new.id,new.pilot_id,new.run_id,new.execution_owner_id,
      'REMOTE_OUTCOME_UNKNOWN','unknown',now()
    ) on conflict (call_id) do nothing;
  end if;
  return new;
end;
$$;

-- 094 correctly retained historical generic calls as unknown but, because the
-- legacy table then required pilot IDs, it intentionally could not open their
-- review records. Backfill only still-open generic unknown reservations.
insert into public.real_editorial_ambiguous_calls (
  call_id,reservation_id,execution_owner_id,reason_code,source_state,opened_at
)
select reservation.call_id,reservation.id,reservation.execution_owner_id,
  'REMOTE_OUTCOME_UNKNOWN','unknown',coalesce(reservation.reconciled_at,reservation.updated_at,now())
from public.real_editorial_call_reservations reservation
where reservation.execution_owner_id is not null
  and reservation.state = 'unknown'
on conflict (call_id) do nothing;

create function public.resolve_generic_real_editorial_ambiguous_call(
  p_resolution_key text,
  p_execution_owner_id uuid,
  p_call_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_response_recovered boolean,
  p_external_usage_evidence jsonb,
  p_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  ambiguity public.real_editorial_ambiguous_calls%rowtype;
  reservation public.real_editorial_call_reservations%rowtype;
  execution public.real_editorial_executions%rowtype;
  existing public.real_editorial_call_human_resolutions%rowtype;
  resolution_id uuid := gen_random_uuid();
  next_sequence integer;
  evidence jsonb := p_external_usage_evidence;
begin
  if p_resolution_key !~ '^[a-f0-9]{64}$' then raise exception 'HUMAN_RESOLUTION_KEY_INVALID'; end if;
  if p_actor_id is null then raise exception 'HUMAN_RESOLUTION_ACTOR_REQUIRED'; end if;
  if p_decision not in ('no_consumption','consumption_confirmed','indeterminate') then
    raise exception 'HUMAN_RESOLUTION_DECISION_INVALID';
  end if;
  if p_note is not null and (length(btrim(p_note)) not between 1 and 1000
      or p_note ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])') then
    raise exception 'HUMAN_RESOLUTION_NOTE_UNSAFE';
  end if;
  if p_decision = 'consumption_confirmed' then
    if p_response_recovered is distinct from false then raise exception 'RESPONSE_RECOVERY_STATE_INVALID'; end if;
    if evidence is null
       or evidence->>'evidenceType' <> 'PROVIDER_USAGE_EXPORT'
       or evidence->>'provider' <> 'deepseek'
       or evidence->>'currency' <> 'USD'
       or coalesce((evidence->>'requestCount')::integer,0) <= 0
       or coalesce((evidence->>'inputCacheMissTokens')::bigint,0) < 0
       or coalesce((evidence->>'outputTokens')::bigint,0) < 0
       or coalesce((evidence->>'providerCost')::numeric,0) <= 0
       or coalesce((evidence->>'requestIdPresentInExport')::boolean,true) <> false
       or coalesce(length(btrim(evidence->>'limitation')),0) = 0
       or coalesce(evidence->>'apiKeyName','') ~* '(sk-|api[_ -]?key|authorization|bearer)' then
      raise exception 'EXTERNAL_USAGE_EVIDENCE_INVALID';
    end if;
  elsif evidence is not null then
    raise exception 'EXTERNAL_USAGE_EVIDENCE_NOT_ALLOWED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('real-editorial-human:' || p_call_id::text,0));
  select * into existing from public.real_editorial_call_human_resolutions where resolution_key = p_resolution_key;
  if found then
    if existing.execution_owner_id = p_execution_owner_id and existing.call_id = p_call_id
       and existing.actor_id = p_actor_id and existing.decision = p_decision
       and existing.response_recovered = p_response_recovered
       and existing.external_usage_evidence is not distinct from evidence
       and existing.note is not distinct from p_note then return existing.id; end if;
    raise exception 'HUMAN_RESOLUTION_IDEMPOTENCY_CONFLICT';
  end if;

  select * into ambiguity from public.real_editorial_ambiguous_calls
    where call_id = p_call_id and execution_owner_id = p_execution_owner_id for update;
  if not found then raise exception 'AMBIGUOUS_CALL_NOT_FOUND'; end if;
  if ambiguity.resolved_at is not null then raise exception 'AMBIGUOUS_CALL_ALREADY_RESOLVED'; end if;
  if ambiguity.source_state <> 'unknown' then raise exception 'AMBIGUOUS_CALL_STATE_INVALID'; end if;
  select * into reservation from public.real_editorial_call_reservations
    where id = ambiguity.reservation_id for update;
  if not found or reservation.call_id <> p_call_id or reservation.execution_owner_id <> p_execution_owner_id
     or reservation.state <> 'unknown' then raise exception 'AMBIGUOUS_RESERVATION_MISMATCH'; end if;
  select * into execution from public.real_editorial_executions where id = p_execution_owner_id for update;
  if not found or execution.owner_type <> 'BATCH_JOB' then raise exception 'GENERIC_EXECUTION_OWNER_INVALID'; end if;

  insert into public.real_editorial_call_human_resolutions (
    id,resolution_key,call_id,reservation_id,execution_owner_id,actor_id,decision,
    recognized_cost,currency,credits,input_tokens,output_tokens,note,response_recovered,external_usage_evidence
  ) values (
    resolution_id,p_resolution_key,p_call_id,reservation.id,p_execution_owner_id,p_actor_id,p_decision,
    0,'EUR',0,
    case when p_decision='consumption_confirmed' then (evidence->>'inputCacheMissTokens')::bigint else 0 end,
    case when p_decision='consumption_confirmed' then (evidence->>'outputTokens')::bigint else 0 end,
    p_note,p_response_recovered,evidence
  );

  if p_decision = 'indeterminate' then return resolution_id; end if;

  if p_decision = 'no_consumption' then
    update public.real_editorial_executions set reserved_cost = reserved_cost - reservation.reserved_cost
      where id = execution.id;
  end if;
  -- For confirmed consumption the EUR reserve remains held. The external
  -- evidence is USD and no FX rate is fabricated. This closes the call while
  -- preserving the conservative local EUR budget envelope.
  update public.real_editorial_call_reservations
    set state='failed',calculated_cost=case when p_decision='no_consumption' then 0 else null end,
        reconciled_at=now()
    where id=reservation.id;
  select coalesce(max(sequence),0)+1 into next_sequence from public.real_editorial_provider_calls
    where call_id=p_call_id;
  insert into public.real_editorial_provider_calls (
    call_id,sequence,reservation_id,execution_owner_id,stage,operation,provider_id,model,state,attempt,
    retry_of_call_id,input_tokens,output_tokens,tool_calls,credits,estimated_cost,reserved_cost,
    calculated_cost,currency,tariff_id,sanitized_error,prompt_version,schema_version,input_hash
  ) values (
    p_call_id,next_sequence,reservation.id,p_execution_owner_id,reservation.stage,reservation.operation,
    reservation.provider_id,reservation.model,'failed',reservation.attempt,reservation.retry_of_call_id,
    case when p_decision='consumption_confirmed' then (evidence->>'inputCacheMissTokens')::bigint else 0 end,
    case when p_decision='consumption_confirmed' then (evidence->>'outputTokens')::bigint else 0 end,
    1,0,reservation.estimated_cost,reservation.reserved_cost,
    case when p_decision='no_consumption' then 0 else null end,reservation.currency,reservation.tariff_id,
    case when p_decision='no_consumption' then 'HUMAN_CONFIRMED_NO_CONSUMPTION'
      else 'HUMAN_CONFIRMED_CONSUMPTION_RESPONSE_LOST_EXTERNAL_USAGE_UNCONVERTED' end,
    reservation.prompt_version,reservation.schema_version,reservation.input_hash
  );
  update public.real_editorial_ambiguous_calls
    set resolved_at=now(),terminal_decision=p_decision,terminal_resolution_id=resolution_id
    where call_id=p_call_id;
  update public.editorial_destination_batch_jobs
    set retryable=true, updated_at=now()
    where id=execution.owner_id and status='FAILED';
  return resolution_id;
end;
$$;

revoke all on function public.resolve_generic_real_editorial_ambiguous_call(
  text,uuid,uuid,uuid,text,boolean,jsonb,text
) from public,anon,authenticated;
grant execute on function public.resolve_generic_real_editorial_ambiguous_call(
  text,uuid,uuid,uuid,text,boolean,jsonb,text
) to service_role;
