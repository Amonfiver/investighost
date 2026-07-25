-- Resolución humana durable de llamadas editoriales con consumo remoto ambiguo.
-- Es aditiva: conserva todas las reservas, llamadas, eventos e incidentes previos.

create table public.real_editorial_ambiguous_calls (
  call_id uuid primary key,
  reservation_id uuid not null unique
    references public.real_editorial_call_reservations(id) on delete restrict,
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  incident_id uuid references public.real_editorial_incidents(id) on delete restrict,
  reason_code text not null check (reason_code ~ '^[A-Z0-9_]{1,120}$'),
  source_state text not null check (source_state in ('unknown','failed')),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  terminal_decision text check (
    terminal_decision is null
    or terminal_decision in ('no_consumption','consumption_confirmed','cancel_permanently')
  ),
  terminal_resolution_id uuid,
  check (
    (resolved_at is null and terminal_decision is null and terminal_resolution_id is null)
    or
    (resolved_at is not null and terminal_decision is not null and terminal_resolution_id is not null)
  )
);

create table public.real_editorial_call_human_resolutions (
  id uuid primary key default gen_random_uuid(),
  resolution_key text not null unique check (resolution_key ~ '^[a-f0-9]{64}$'),
  call_id uuid not null references public.real_editorial_ambiguous_calls(call_id) on delete restrict,
  reservation_id uuid not null references public.real_editorial_call_reservations(id) on delete restrict,
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  actor_id uuid not null,
  decision text not null check (
    decision in ('no_consumption','consumption_confirmed','indeterminate','cancel_permanently')
  ),
  recognized_cost numeric(18,9) not null default 0 check (recognized_cost >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  credits numeric(18,9) not null default 0 check (credits >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  note text check (
    note is null
    or (
      length(btrim(note)) between 1 and 1000
      and note !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
    )
  ),
  decided_at timestamptz not null default now(),
  check (
    decision = 'consumption_confirmed'
    or (recognized_cost = 0 and credits = 0 and input_tokens = 0 and output_tokens = 0)
  ),
  check (
    decision <> 'consumption_confirmed'
    or recognized_cost > 0 or credits > 0 or input_tokens > 0 or output_tokens > 0
  )
);

alter table public.real_editorial_ambiguous_calls
  add constraint real_editorial_ambiguous_terminal_resolution_fkey
  foreign key (terminal_resolution_id)
  references public.real_editorial_call_human_resolutions(id) on delete restrict;

create index real_editorial_ambiguous_calls_pending_idx
  on public.real_editorial_ambiguous_calls(pilot_id,run_id,opened_at)
  where resolved_at is null;

alter table public.real_editorial_ambiguous_calls enable row level security;
alter table public.real_editorial_call_human_resolutions enable row level security;

revoke all on table
  public.real_editorial_ambiguous_calls,
  public.real_editorial_call_human_resolutions
from public,anon,authenticated;

grant select on table
  public.real_editorial_ambiguous_calls,
  public.real_editorial_call_human_resolutions
to service_role;

create trigger real_editorial_ambiguous_calls_no_delete
  before delete on public.real_editorial_ambiguous_calls
  for each row execute function public.prevent_real_editorial_append_mutation();

create trigger real_editorial_human_resolutions_append_only
  before update or delete on public.real_editorial_call_human_resolutions
  for each row execute function public.prevent_real_editorial_append_mutation();

create or replace function public.register_real_editorial_unknown_call()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.state = 'unknown' and old.state is distinct from 'unknown' then
    insert into public.real_editorial_ambiguous_calls (
      call_id,reservation_id,pilot_id,run_id,reason_code,source_state,opened_at
    ) values (
      new.call_id,new.id,new.pilot_id,new.run_id,'REMOTE_OUTCOME_UNKNOWN','unknown',now()
    ) on conflict (call_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger real_editorial_unknown_call_review
  after update of state on public.real_editorial_call_reservations
  for each row execute function public.register_real_editorial_unknown_call();

create or replace function public.block_unresolved_real_editorial_retry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.retry_of_call_id is not null and exists (
    select 1
      from public.real_editorial_ambiguous_calls ambiguous
     where ambiguous.call_id = new.retry_of_call_id
       and (
         ambiguous.resolved_at is null
         or ambiguous.terminal_decision = 'cancel_permanently'
       )
  ) then
    raise exception 'AMBIGUOUS_CALL_REQUIRES_HUMAN_RESOLUTION';
  end if;
  return new;
end;
$$;

create trigger real_editorial_retry_requires_resolution
  before insert on public.real_editorial_call_reservations
  for each row execute function public.block_unresolved_real_editorial_retry();

-- El cliente anterior a f3da762 ocultaba cualquier excepción Responses como
-- PROVIDER_ERROR. Esas llamadas sin ID remoto requieren decisión humana antes de
-- admitir un retry, aunque su agregado histórico figure como failed.
insert into public.real_editorial_ambiguous_calls (
  call_id,reservation_id,pilot_id,run_id,incident_id,reason_code,source_state,opened_at
)
select
  reservation.call_id,
  reservation.id,
  reservation.pilot_id,
  reservation.run_id,
  incident.id,
  'LEGACY_OPENAI_PROVIDER_ERROR',
  'failed',
  terminal.created_at
from public.real_editorial_call_reservations reservation
join lateral (
  select calls.state,calls.sanitized_error,calls.remote_id,calls.created_at
    from public.real_editorial_provider_calls calls
   where calls.call_id = reservation.call_id
   order by calls.sequence desc
   limit 1
) terminal on true
left join lateral (
  select incidents.id
    from public.real_editorial_incidents incidents
   where incidents.pilot_id = reservation.pilot_id
     and incidents.run_id = reservation.run_id
     and incidents.code = 'PROVIDER_ERROR'
     and incidents.created_at >= terminal.created_at - interval '10 seconds'
   order by incidents.created_at
   limit 1
) incident on true
where reservation.provider_id = 'openai'
  and reservation.operation = 'analysis'
  and reservation.state = 'failed'
  and terminal.state = 'failed'
  and terminal.sanitized_error = 'PROVIDER_ERROR'
  and terminal.remote_id is null
on conflict (call_id) do nothing;

create or replace function public.resolve_real_editorial_ambiguous_call(
  p_resolution_key text,
  p_pilot_id uuid,
  p_run_id uuid,
  p_call_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_recognized_cost numeric,
  p_credits numeric,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  ambiguity public.real_editorial_ambiguous_calls%rowtype;
  reservation public.real_editorial_call_reservations%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  existing public.real_editorial_call_human_resolutions%rowtype;
  resolution_id uuid := gen_random_uuid();
  normalized_cost numeric := coalesce(p_recognized_cost,0);
  normalized_credits numeric := coalesce(p_credits,0);
  normalized_input_tokens bigint := coalesce(p_input_tokens,0);
  normalized_output_tokens bigint := coalesce(p_output_tokens,0);
  released_reserve numeric := 0;
  next_sequence integer;
  next_state text;
begin
  if p_resolution_key !~ '^[a-f0-9]{64}$' then
    raise exception 'HUMAN_RESOLUTION_KEY_INVALID';
  end if;
  if p_decision not in (
    'no_consumption','consumption_confirmed','indeterminate','cancel_permanently'
  ) then
    raise exception 'HUMAN_RESOLUTION_DECISION_INVALID';
  end if;
  if normalized_cost < 0 or normalized_credits < 0
     or normalized_input_tokens < 0 or normalized_output_tokens < 0 then
    raise exception 'HUMAN_RESOLUTION_USAGE_INVALID';
  end if;
  if p_note is not null and (
    length(btrim(p_note)) not between 1 and 1000
    or p_note ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ) then
    raise exception 'HUMAN_RESOLUTION_NOTE_UNSAFE';
  end if;
  if p_decision = 'consumption_confirmed' then
    if p_recognized_cost is null then
      raise exception 'HUMAN_RESOLUTION_COST_REQUIRED';
    end if;
    if normalized_cost = 0 and normalized_credits = 0
       and normalized_input_tokens = 0 and normalized_output_tokens = 0 then
      raise exception 'HUMAN_RESOLUTION_EVIDENCE_REQUIRED';
    end if;
  elsif p_recognized_cost is not null or p_credits is not null
     or p_input_tokens is not null or p_output_tokens is not null then
    raise exception 'HUMAN_RESOLUTION_USAGE_NOT_ALLOWED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('real-editorial-human:' || p_call_id::text,0));

  select * into existing
    from public.real_editorial_call_human_resolutions
   where resolution_key = p_resolution_key;
  if found then
    if existing.pilot_id = p_pilot_id
       and existing.run_id = p_run_id
       and existing.call_id = p_call_id
       and existing.actor_id = p_actor_id
       and existing.decision = p_decision
       and existing.recognized_cost = normalized_cost
       and existing.credits = normalized_credits
       and existing.input_tokens = normalized_input_tokens
       and existing.output_tokens = normalized_output_tokens
       and existing.note is not distinct from p_note then
      return existing.id;
    end if;
    raise exception 'HUMAN_RESOLUTION_IDEMPOTENCY_CONFLICT';
  end if;

  select * into ambiguity
    from public.real_editorial_ambiguous_calls
   where call_id = p_call_id for update;
  if not found or ambiguity.pilot_id <> p_pilot_id or ambiguity.run_id <> p_run_id then
    raise exception 'AMBIGUOUS_CALL_NOT_FOUND';
  end if;
  if ambiguity.resolved_at is not null then
    raise exception 'AMBIGUOUS_CALL_ALREADY_RESOLVED';
  end if;

  select * into reservation
    from public.real_editorial_call_reservations
   where id = ambiguity.reservation_id for update;
  if not found or reservation.call_id <> p_call_id
     or reservation.pilot_id <> p_pilot_id or reservation.run_id <> p_run_id then
    raise exception 'AMBIGUOUS_RESERVATION_MISMATCH';
  end if;
  if reservation.state not in ('unknown','failed') then
    raise exception 'AMBIGUOUS_RESERVATION_STATE_CHANGED';
  end if;

  insert into public.real_editorial_call_human_resolutions (
    id,resolution_key,call_id,reservation_id,pilot_id,run_id,actor_id,decision,
    recognized_cost,credits,input_tokens,output_tokens,note
  ) values (
    resolution_id,p_resolution_key,p_call_id,reservation.id,p_pilot_id,p_run_id,
    p_actor_id,p_decision,normalized_cost,normalized_credits,
    normalized_input_tokens,normalized_output_tokens,p_note
  );

  if p_decision = 'indeterminate' then
    insert into public.real_editorial_events (
      pilot_id,run_id,event_type,state,payload
    ) values (
      p_pilot_id,p_run_id,'real.editorial.remote_call.human_decided',null,
      jsonb_strip_nulls(jsonb_build_object(
        'actorId',p_actor_id,'callId',p_call_id,'decision',p_decision,
        'recognizedCostEur',0,'note',p_note
      ))
    );
    return resolution_id;
  end if;

  if p_decision = 'cancel_permanently' then
    next_state := 'cancelled';
    update public.real_editorial_runs
       set state = 'cancelled',cancel_requested_at = now(),cancelled_at = now(),
           completed_at = now()
     where id = p_run_id and pilot_id = p_pilot_id;
    update public.real_editorial_pilots
       set state = 'cancelled'
     where id = p_pilot_id and current_run_id = p_run_id;
  else
    select * into budget
      from public.real_editorial_pilot_budgets
     where pilot_id = p_pilot_id for update;
    if not found then raise exception 'REAL_EDITORIAL_BUDGET_MISSING'; end if;

    released_reserve := case when reservation.state = 'unknown'
      then reservation.reserved_cost else 0 end;
    if budget.spent_cost + budget.reserved_cost - released_reserve + normalized_cost
       > budget.task_limit_cost
       or budget.spent_cost + budget.reserved_cost - released_reserve + normalized_cost
       > budget.batch_limit_cost
       or budget.spent_cost + budget.reserved_cost - released_reserve + normalized_cost
       > budget.daily_limit_cost then
      raise exception 'HUMAN_RESOLUTION_BUDGET_EXCEEDED';
    end if;

    update public.real_editorial_pilot_budgets
       set reserved_cost = reserved_cost - released_reserve,
           spent_cost = spent_cost + normalized_cost
     where pilot_id = p_pilot_id;
    update public.real_editorial_call_reservations
       set state = 'failed',calculated_cost = normalized_cost,
           reconciled_at = now()
     where id = reservation.id;

    select coalesce(max(sequence),0) + 1 into next_sequence
      from public.real_editorial_provider_calls where call_id = p_call_id;
    insert into public.real_editorial_provider_calls (
      call_id,sequence,reservation_id,pilot_id,run_id,stage,operation,provider_id,
      model,state,attempt,retry_of_call_id,input_tokens,output_tokens,tool_calls,
      tools,credits,estimated_cost,reserved_cost,calculated_cost,currency,tariff_id,
      sanitized_error,prompt_version,schema_version,input_hash
    ) values (
      p_call_id,next_sequence,reservation.id,p_pilot_id,p_run_id,reservation.stage,
      reservation.operation,reservation.provider_id,reservation.model,'failed',
      reservation.attempt,reservation.retry_of_call_id,normalized_input_tokens,
      normalized_output_tokens,1,'[]'::jsonb,normalized_credits,
      reservation.estimated_cost,reservation.reserved_cost,normalized_cost,
      reservation.currency,reservation.tariff_id,
      case when p_decision = 'no_consumption'
        then 'HUMAN_CONFIRMED_NO_CONSUMPTION'
        else 'HUMAN_CONFIRMED_CONSUMPTION' end,
      reservation.prompt_version,reservation.schema_version,reservation.input_hash
    );

    next_state := 'preflight';
    update public.real_editorial_runs
       set state = 'preflight',cancel_requested_at = null,cancelled_at = null,
           completed_at = null
     where id = p_run_id and pilot_id = p_pilot_id;
    update public.real_editorial_pilots
       set state = 'preflight'
     where id = p_pilot_id and current_run_id = p_run_id;
  end if;

  update public.real_editorial_ambiguous_calls
     set resolved_at = now(),terminal_decision = p_decision,
         terminal_resolution_id = resolution_id
   where call_id = p_call_id;
  update public.real_editorial_incidents
     set resolved_at = coalesce(resolved_at,now())
   where id = ambiguity.incident_id;

  insert into public.real_editorial_events (
    pilot_id,run_id,event_type,state,payload
  ) values (
    p_pilot_id,p_run_id,'real.editorial.remote_call.human_decided',next_state,
    jsonb_strip_nulls(jsonb_build_object(
      'actorId',p_actor_id,'callId',p_call_id,'decision',p_decision,
      'recognizedCostEur',normalized_cost,'credits',normalized_credits,
      'inputTokens',normalized_input_tokens,'outputTokens',normalized_output_tokens,
      'note',p_note
    ))
  );
  return resolution_id;
end;
$$;

revoke all on function public.resolve_real_editorial_ambiguous_call(
  text,uuid,uuid,uuid,uuid,text,numeric,numeric,bigint,bigint,text
) from public,anon,authenticated;

grant execute on function public.resolve_real_editorial_ambiguous_call(
  text,uuid,uuid,uuid,uuid,text,numeric,numeric,bigint,bigint,text
) to service_role;
