-- Durable, idempotent human redo requests. Existing artifacts and Library
-- revisions are retained; the operation records the references it supersedes.
alter table public.editorial_destination_batch_jobs
  add column if not exists redo_operation_id uuid null,
  add column if not exists redo_scope text null check (redo_scope in ('STUDENT', 'ADVENTURE', 'VISUALS', 'EDITORIAL'));

create table if not exists public.editorial_destination_batch_redo_operations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.editorial_destination_batch_jobs(id) on delete restrict,
  scope text not null check (scope in ('STUDENT', 'ADVENTURE', 'VISUALS', 'EDITORIAL')),
  requested_by text not null,
  reason text null check (reason is null or char_length(reason) <= 1000),
  previous_artifact_refs jsonb not null,
  status text not null check (status in ('REQUESTED', 'COMPLETED', 'FAILED')),
  requested_at timestamptz not null,
  completed_at timestamptz null
);
create index if not exists editorial_destination_batch_redo_operations_job_idx
  on public.editorial_destination_batch_redo_operations(job_id, requested_at desc);
alter table public.editorial_destination_batch_redo_operations enable row level security;
revoke all on public.editorial_destination_batch_redo_operations from public, anon, authenticated;
grant select, insert, update on public.editorial_destination_batch_redo_operations to service_role;

create or replace function public.factory_request_destination_batch_redo(
  p_job_id uuid, p_scope text, p_requested_by text, p_reason text, p_now timestamptz
)
returns public.editorial_destination_batch_jobs
language plpgsql security definer set search_path = public as $$
declare target public.editorial_destination_batch_jobs; operation_id uuid; retained jsonb; refs jsonb;
begin
  select * into target from public.editorial_destination_batch_jobs where id = p_job_id for update;
  if target.id is null then raise exception 'BATCH_REDO_JOB_NOT_FOUND'; end if;
  if target.status in ('REDO_REQUIRED', 'PROCESSING') and target.redo_operation_id is not null then return target; end if;
  if target.status <> 'READY_FOR_REVIEW' then raise exception 'BATCH_REDO_NOT_ALLOWED'; end if;
  if p_scope = 'STUDENT' then retained := '["IDENTITY","RESEARCH","ANALYSIS","ADVENTURE","VISUALS"]'::jsonb; refs := target.artifact_refs - 'STUDENT' - 'STUDENT_ARTIFACT_KEY' - 'AUTO_REVIEW';
  elsif p_scope = 'ADVENTURE' then retained := '["IDENTITY","RESEARCH","ANALYSIS","STUDENT","VISUALS"]'::jsonb; refs := target.artifact_refs - 'ADVENTURE' - 'ADVENTURE_ARTIFACT_KEY' - 'AUTO_REVIEW';
  elsif p_scope = 'VISUALS' then retained := '["IDENTITY","RESEARCH","ANALYSIS","STUDENT","ADVENTURE"]'::jsonb; refs := target.artifact_refs - 'VISUALS' - 'visualReviewState' - 'AUTO_REVIEW';
  elsif p_scope = 'EDITORIAL' then retained := '["IDENTITY","RESEARCH","ANALYSIS","VISUALS"]'::jsonb; refs := target.artifact_refs - 'STUDENT' - 'STUDENT_ARTIFACT_KEY' - 'ADVENTURE' - 'ADVENTURE_ARTIFACT_KEY' - 'AUTO_REVIEW';
  else raise exception 'BATCH_REDO_SCOPE_INVALID'; end if;
  operation_id := gen_random_uuid();
  insert into public.editorial_destination_batch_redo_operations(id, job_id, scope, requested_by, reason, previous_artifact_refs, status, requested_at)
    values(operation_id, target.id, p_scope, p_requested_by, nullif(p_reason, ''), target.artifact_refs, 'REQUESTED', p_now);
  update public.editorial_destination_batch_jobs
     set status = 'REDO_REQUIRED', current_phase = case when p_scope in ('STUDENT','EDITORIAL') then 'STUDENT' when p_scope = 'ADVENTURE' then 'ADVENTURE' else 'VISUALS' end,
         completed_phases = retained, artifact_refs = refs, redo_operation_id = operation_id, redo_scope = p_scope,
         retryable = true, last_failure = null, updated_at = p_now
   where id = target.id returning * into target;
  return target;
end;
$$;

create or replace function public.factory_claim_destination_batch_job(
  p_job_id uuid, p_worker_id text, p_lease_seconds integer, p_now timestamptz
)
returns public.editorial_destination_batch_jobs
language plpgsql security definer set search_path = public as $$
declare claimed public.editorial_destination_batch_jobs;
begin
  update public.editorial_destination_batch_jobs
     set status = 'PROCESSING', claimed_by = p_worker_id, claim_token = gen_random_uuid(),
         claim_expires_at = p_now + make_interval(secs => greatest(1, p_lease_seconds)), attempt_count = attempt_count + 1,
         started_at = coalesce(started_at, p_now), updated_at = p_now
   where id = p_job_id and status in ('QUEUED', 'REDO_REQUIRED') returning * into claimed;
  return claimed;
end;
$$;

create or replace function public.factory_claim_next_destination_batch_job(
  p_batch_id uuid, p_worker_id text, p_lease_seconds integer, p_now timestamptz
)
returns public.editorial_destination_batch_jobs
language plpgsql security definer set search_path = public as $$
declare target_id uuid;
begin
  select id into target_id from public.editorial_destination_batch_jobs
   where batch_id = p_batch_id and status in ('QUEUED', 'REDO_REQUIRED')
   order by input_index for update skip locked limit 1;
  if target_id is null then return null; end if;
  return public.factory_claim_destination_batch_job(target_id, p_worker_id, p_lease_seconds, p_now);
end;
$$;

revoke all on function public.factory_request_destination_batch_redo(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.factory_request_destination_batch_redo(uuid, text, text, text, timestamptz) to service_role;
