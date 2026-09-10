-- Additive Investighost-owned durable outbox for protocol V2. It does not touch V1,
-- Biblioteca, TENEMOS NOTICIA, or any publishing table.

create table public.real_editorial_trawel_deliveries (
  id uuid primary key default gen_random_uuid(),
  protocol_schema text not null check (protocol_schema = 'investighost-trawel-editorial-delivery-v2'),
  handoff_key text not null unique check (handoff_key ~ '^[a-f0-9]{64}$'),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  destination_mapping_id uuid not null,
  investighost_canonical_destination_id uuid not null,
  target_snapshot jsonb not null,
  payload jsonb not null,
  state text not null check (state in ('PENDING','DELIVERING','RETRYABLE','RECONCILING','CONFIRMED','CONFLICT','FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz null,
  lease_token uuid null,
  last_result_code text null,
  trawel_receipt_id text null,
  confirmed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lease_expires_at is null) = (lease_token is null)),
  check ((state = 'CONFIRMED') = (confirmed_at is not null))
);

create table public.real_editorial_trawel_delivery_sources (
  delivery_id uuid not null references public.real_editorial_trawel_deliveries(id) on delete restrict,
  profile text not null check (profile in ('adventure','student')),
  library_entry_id uuid not null,
  version_hash text not null check (version_hash ~ '^[a-f0-9]{64}$'),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  approval_reference jsonb not null,
  primary key (delivery_id, profile)
);

create table public.real_editorial_trawel_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.real_editorial_trawel_deliveries(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  started_at timestamptz not null,
  completed_at timestamptz null,
  outcome text not null,
  remote_status_code text null,
  trawel_receipt_id text null,
  correlation_id uuid not null,
  error_code text null,
  error_summary text null check (error_summary is null or length(error_summary) <= 500),
  unique (delivery_id, attempt_number)
);

create index real_editorial_trawel_deliveries_recovery_idx
  on public.real_editorial_trawel_deliveries(state, next_attempt_at);
create index real_editorial_trawel_delivery_attempts_lookup_idx
  on public.real_editorial_trawel_delivery_attempts(delivery_id, attempt_number);
create index real_editorial_trawel_delivery_sources_library_version_idx
  on public.real_editorial_trawel_delivery_sources(library_entry_id, version_hash);

create function public.real_editorial_enqueue_trawel_delivery(p_payload jsonb)
returns public.real_editorial_trawel_deliveries
language plpgsql security definer set search_path = public
as $$
declare result public.real_editorial_trawel_deliveries%rowtype;
declare row jsonb;
declare profile_count integer;
begin
  if p_payload->>'schema' <> 'investighost-trawel-editorial-delivery-v2'
    or p_payload->>'handoffKey' !~ '^[a-f0-9]{64}$'
    or p_payload->>'payloadFingerprint' !~ '^[a-f0-9]{64}$' then
    raise exception 'VALIDATION_ERROR: invalid V2 delivery payload';
  end if;
  if jsonb_typeof(p_payload->'rows') <> 'array' or jsonb_array_length(p_payload->'rows') <> 2 then
    raise exception 'VALIDATION_ERROR: V2 requires two rows';
  end if;
  select count(distinct value->>'profile') into profile_count from jsonb_array_elements(p_payload->'rows');
  if profile_count <> 2 or not (p_payload->'rows' @> '[{"profile":"adventure"},{"profile":"student"}]'::jsonb) then
    raise exception 'VALIDATION_ERROR: V2 requires adventure and student';
  end if;
  insert into public.real_editorial_trawel_deliveries (
    protocol_schema,handoff_key,payload_fingerprint,destination_mapping_id,
    investighost_canonical_destination_id,target_snapshot,payload,state
  ) values (
    p_payload->>'schema',p_payload->>'handoffKey',p_payload->>'payloadFingerprint',
    (p_payload->'mapping'->>'mappingId')::uuid,
    (p_payload->'mapping'->>'investighostCanonicalDestinationId')::uuid,
    p_payload->'mapping',p_payload,'PENDING'
  ) on conflict (handoff_key) do nothing returning * into result;
  if result.id is null then
    select * into result from public.real_editorial_trawel_deliveries where handoff_key = p_payload->>'handoffKey';
    if result.payload_fingerprint <> p_payload->>'payloadFingerprint' then
      raise exception 'IDEMPOTENCY_CONFLICT: handoff key has different payload';
    end if;
    return result;
  end if;
  for row in select value from jsonb_array_elements(p_payload->'rows') loop
    insert into public.real_editorial_trawel_delivery_sources(
      delivery_id,profile,library_entry_id,version_hash,content_hash,approval_reference
    ) values (result.id,row->>'profile',(row->>'libraryEntryId')::uuid,row->>'versionHash',row->>'contentHash',row->'approval');
  end loop;
  return result;
end $$;

create function public.real_editorial_acquire_trawel_delivery(
  p_delivery_id uuid, p_mode text, p_now timestamptz, p_lease_ms integer
) returns public.real_editorial_trawel_deliveries
language plpgsql security definer set search_path = public
as $$
declare result public.real_editorial_trawel_deliveries%rowtype;
begin
  if p_mode not in ('delivery','reconciliation') or p_lease_ms < 1 then
    raise exception 'VALIDATION_ERROR: invalid lease request';
  end if;
  update public.real_editorial_trawel_deliveries
     set state = case when p_mode = 'delivery' then 'DELIVERING' else 'RECONCILING' end,
         lease_token = gen_random_uuid(), lease_expires_at = p_now + make_interval(secs => p_lease_ms / 1000.0), updated_at = p_now
   where id = p_delivery_id and lease_token is null and next_attempt_at <= p_now
     and ((p_mode = 'delivery' and state in ('PENDING','RETRYABLE')) or (p_mode = 'reconciliation' and state = 'RECONCILING'))
  returning * into result;
  return result;
end $$;

create function public.real_editorial_recover_expired_trawel_delivery_leases(p_now timestamptz)
returns integer language plpgsql security definer set search_path = public
as $$ declare affected integer; begin
  update public.real_editorial_trawel_deliveries set state = 'RECONCILING', lease_token = null, lease_expires_at = null,
    next_attempt_at = p_now, last_result_code = 'LEASE_EXPIRED_AMBIGUOUS', updated_at = p_now
  where state = 'DELIVERING' and lease_expires_at <= p_now;
  get diagnostics affected = row_count; return affected;
end $$;

create function public.real_editorial_start_trawel_delivery_attempt(
  p_delivery_id uuid, p_correlation_id uuid, p_started_at timestamptz
) returns public.real_editorial_trawel_delivery_attempts
language plpgsql security definer set search_path = public
as $$ declare result public.real_editorial_trawel_delivery_attempts%rowtype; declare number integer; begin
  update public.real_editorial_trawel_deliveries set attempt_count = attempt_count + 1, updated_at = p_started_at
    where id = p_delivery_id returning attempt_count into number;
  if number is null then raise exception 'NOT_FOUND: delivery'; end if;
  insert into public.real_editorial_trawel_delivery_attempts(delivery_id,attempt_number,started_at,outcome,correlation_id)
    values(p_delivery_id,number,p_started_at,'STARTED',p_correlation_id) returning * into result;
  return result;
end $$;

create function public.real_editorial_transition_trawel_delivery(
  p_delivery_id uuid,p_lease_token uuid,p_state text,p_next_attempt_at timestamptz,p_last_result_code text,
  p_trawel_receipt_id text,p_confirmed_at timestamptz,p_now timestamptz
) returns public.real_editorial_trawel_deliveries
language plpgsql security definer set search_path = public
as $$ declare current_state text; declare result public.real_editorial_trawel_deliveries%rowtype; begin
  select state into current_state from public.real_editorial_trawel_deliveries where id=p_delivery_id and lease_token=p_lease_token and lease_expires_at >= p_now for update;
  if current_state is null then raise exception 'LEASE_LOST'; end if;
  if not ((current_state='DELIVERING' and p_state in ('CONFIRMED','RETRYABLE','RECONCILING','CONFLICT','FAILED'))
       or (current_state='RECONCILING' and p_state in ('CONFIRMED','RETRYABLE','CONFLICT','FAILED'))) then raise exception 'ILLEGAL_DELIVERY_TRANSITION'; end if;
  update public.real_editorial_trawel_deliveries set state=p_state, next_attempt_at=coalesce(p_next_attempt_at,next_attempt_at),
    last_result_code=p_last_result_code,trawel_receipt_id=coalesce(p_trawel_receipt_id,trawel_receipt_id),
    confirmed_at=case when p_state='CONFIRMED' then coalesce(p_confirmed_at,p_now) else null end,
    lease_token=null,lease_expires_at=null,updated_at=p_now where id=p_delivery_id returning * into result;
  return result;
end $$;

create function public.real_editorial_release_trawel_reconciliation(
  p_delivery_id uuid,p_lease_token uuid,p_next_attempt_at timestamptz,p_result_code text,p_now timestamptz
) returns public.real_editorial_trawel_deliveries
language plpgsql security definer set search_path = public
as $$ declare result public.real_editorial_trawel_deliveries%rowtype; begin
  update public.real_editorial_trawel_deliveries set lease_token=null,lease_expires_at=null,next_attempt_at=p_next_attempt_at,
    last_result_code=p_result_code,updated_at=p_now
  where id=p_delivery_id and state='RECONCILING' and lease_token=p_lease_token and lease_expires_at >= p_now returning * into result;
  if result.id is null then raise exception 'LEASE_LOST'; end if; return result;
end $$;

revoke all on public.real_editorial_trawel_deliveries, public.real_editorial_trawel_delivery_sources, public.real_editorial_trawel_delivery_attempts from public, anon, authenticated;
revoke all on function public.real_editorial_enqueue_trawel_delivery(jsonb) from public, anon, authenticated;
revoke all on function public.real_editorial_acquire_trawel_delivery(uuid,text,timestamptz,integer) from public, anon, authenticated;
revoke all on function public.real_editorial_recover_expired_trawel_delivery_leases(timestamptz) from public, anon, authenticated;
revoke all on function public.real_editorial_start_trawel_delivery_attempt(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.real_editorial_transition_trawel_delivery(uuid,uuid,text,timestamptz,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.real_editorial_release_trawel_reconciliation(uuid,uuid,timestamptz,text,timestamptz) from public, anon, authenticated;
grant execute on function public.real_editorial_enqueue_trawel_delivery(jsonb), public.real_editorial_acquire_trawel_delivery(uuid,text,timestamptz,integer), public.real_editorial_recover_expired_trawel_delivery_leases(timestamptz), public.real_editorial_start_trawel_delivery_attempt(uuid,uuid,timestamptz), public.real_editorial_transition_trawel_delivery(uuid,uuid,text,timestamptz,text,text,timestamptz,timestamptz), public.real_editorial_release_trawel_reconciliation(uuid,uuid,timestamptz,text,timestamptz) to service_role;
