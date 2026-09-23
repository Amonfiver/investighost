-- The original batch job checkpoint column is jsonb; keep the redo function
-- typed accordingly for databases that already applied the first migration.
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
