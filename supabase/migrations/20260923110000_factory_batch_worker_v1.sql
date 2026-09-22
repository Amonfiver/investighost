-- Factory V1 worker: a short lease prevents two local/process executions from
-- processing the same destination job. It does not start providers by itself.
alter table public.editorial_destination_batch_jobs
  add column claimed_by text null check (claimed_by is null or length(btrim(claimed_by)) between 1 and 160),
  add column claim_token uuid null,
  add column claim_expires_at timestamptz null,
  add column started_at timestamptz null,
  add check ((claim_token is null) = (claim_expires_at is null));

create index editorial_destination_batch_jobs_claim_idx
  on public.editorial_destination_batch_jobs(batch_id, status, claim_expires_at, input_index);

create or replace function public.factory_claim_destination_batch_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer,
  p_now timestamptz
)
returns public.editorial_destination_batch_jobs
language plpgsql
security definer
set search_path = public
as $$
declare claimed public.editorial_destination_batch_jobs;
begin
  update public.editorial_destination_batch_jobs
     set status = 'PROCESSING',
         attempt_count = attempt_count + 1,
         claimed_by = p_worker_id,
         claim_token = gen_random_uuid(),
         claim_expires_at = p_now + make_interval(secs => greatest(1, p_lease_seconds)),
         started_at = coalesce(started_at, p_now),
         updated_at = p_now
   where id = p_job_id and status = 'QUEUED'
  returning * into claimed;
  return claimed;
end;
$$;

create or replace function public.factory_claim_next_destination_batch_job(
  p_batch_id uuid,
  p_worker_id text,
  p_lease_seconds integer,
  p_now timestamptz
)
returns public.editorial_destination_batch_jobs
language plpgsql
security definer
set search_path = public
as $$
declare target_id uuid;
begin
  select id into target_id
    from public.editorial_destination_batch_jobs
   where batch_id = p_batch_id and status = 'QUEUED'
   order by input_index
   for update skip locked
   limit 1;
  if target_id is null then return null; end if;
  return public.factory_claim_destination_batch_job(target_id, p_worker_id, p_lease_seconds, p_now);
end;
$$;

create or replace function public.factory_renew_destination_batch_claim(
  p_job_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer,
  p_now timestamptz
)
returns public.editorial_destination_batch_jobs
language plpgsql
security definer
set search_path = public
as $$
declare renewed public.editorial_destination_batch_jobs;
begin
  update public.editorial_destination_batch_jobs
     set claim_expires_at = p_now + make_interval(secs => greatest(1, p_lease_seconds)),
         updated_at = p_now
   where id = p_job_id and status = 'PROCESSING' and claim_token = p_claim_token
  returning * into renewed;
  return renewed;
end;
$$;

create or replace function public.factory_recover_stale_destination_batch_claims(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare recovered integer;
begin
  update public.editorial_destination_batch_jobs
     set status = 'QUEUED',
         claimed_by = null,
         claim_token = null,
         claim_expires_at = null,
         last_failure = 'STALE_PROCESSING_RECOVERED',
         retryable = true,
         updated_at = p_now
   where status = 'PROCESSING' and claim_expires_at <= p_now;
  get diagnostics recovered = row_count;
  return recovered;
end;
$$;

revoke all on function public.factory_claim_destination_batch_job(uuid, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.factory_claim_next_destination_batch_job(uuid, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.factory_renew_destination_batch_claim(uuid, uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.factory_recover_stale_destination_batch_claims(timestamptz) from public, anon, authenticated;
grant execute on function public.factory_claim_destination_batch_job(uuid, text, integer, timestamptz) to service_role;
grant execute on function public.factory_claim_next_destination_batch_job(uuid, text, integer, timestamptz) to service_role;
grant execute on function public.factory_renew_destination_batch_claim(uuid, uuid, integer, timestamptz) to service_role;
grant execute on function public.factory_recover_stale_destination_batch_claims(timestamptz) to service_role;
