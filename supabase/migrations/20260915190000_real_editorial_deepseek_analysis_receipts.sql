-- DeepSeek comparte el contrato Responses de analysis; conservar el receipt
-- evita perder una respuesta válida antes del ajuste económico durable.
create or replace function public.record_real_editorial_analysis_response(
  p_receipt_key text,
  p_pilot_id uuid,
  p_run_id uuid,
  p_round integer,
  p_call_id uuid,
  p_reservation_id uuid,
  p_attempt integer,
  p_remote_id text,
  p_analysis jsonb,
  p_analysis_hash text,
  p_usage jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing_receipt public.real_editorial_analysis_provider_receipts%rowtype;
  reservation public.real_editorial_call_reservations%rowtype;
  receipt_id uuid := gen_random_uuid();
begin
  if p_receipt_key !~ '^[a-f0-9]{64}$'
     or p_analysis_hash !~ '^[a-f0-9]{64}$'
     or p_round not between 1 and 2
     or p_attempt not between 1 and 10
     or jsonb_typeof(p_analysis) <> 'object'
     or jsonb_typeof(p_usage) <> 'object' then
    raise exception 'ANALYSIS_RECEIPT_INPUT_INVALID';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-analysis-receipt:' || p_call_id::text,0)
  );
  select * into existing_receipt
    from public.real_editorial_analysis_provider_receipts
   where receipt_key = p_receipt_key;
  if found then
    if existing_receipt.pilot_id = p_pilot_id
       and existing_receipt.run_id = p_run_id
       and existing_receipt.round = p_round
       and existing_receipt.call_id = p_call_id
       and existing_receipt.reservation_id = p_reservation_id
       and existing_receipt.attempt = p_attempt
       and existing_receipt.remote_id is not distinct from p_remote_id
       and existing_receipt.analysis_hash = p_analysis_hash
       and existing_receipt.analysis = p_analysis
       and existing_receipt.usage = p_usage then
      return existing_receipt.id;
    end if;
    raise exception 'ANALYSIS_RECEIPT_CONFLICT';
  end if;
  if exists (
    select 1 from public.real_editorial_analysis_provider_receipts
     where call_id = p_call_id or reservation_id = p_reservation_id
  ) then
    raise exception 'ANALYSIS_RECEIPT_CONFLICT';
  end if;
  select * into reservation
    from public.real_editorial_call_reservations
   where id = p_reservation_id
     and call_id = p_call_id
     and pilot_id = p_pilot_id
     and run_id = p_run_id
   for update;
  if not found
     or reservation.provider_id not in ('openai','deepseek')
     or reservation.operation <> 'analysis'
     or reservation.stage <> (p_round::text || '_analysis')
     or reservation.attempt <> p_attempt
     or reservation.state <> 'started' then
    raise exception 'ANALYSIS_RECEIPT_CALL_INVALID';
  end if;
  if not exists (
    select 1 from public.real_editorial_provider_calls
     where call_id = p_call_id and reservation_id = p_reservation_id and state = 'started'
  ) then
    raise exception 'ANALYSIS_RECEIPT_CALL_NOT_STARTED';
  end if;
  insert into public.real_editorial_analysis_provider_receipts (
    id,receipt_key,pilot_id,run_id,round,call_id,reservation_id,attempt,
    remote_id,analysis,analysis_hash,usage
  ) values (
    receipt_id,p_receipt_key,p_pilot_id,p_run_id,p_round,p_call_id,p_reservation_id,
    p_attempt,p_remote_id,p_analysis,p_analysis_hash,p_usage
  );
  return receipt_id;
end;
$$;

revoke all on function public.record_real_editorial_analysis_response(
  text,uuid,uuid,integer,uuid,uuid,integer,text,jsonb,text,jsonb
) from public,anon,authenticated;
grant execute on function public.record_real_editorial_analysis_response(
  text,uuid,uuid,integer,uuid,uuid,integer,text,jsonb,text,jsonb
) to service_role;
