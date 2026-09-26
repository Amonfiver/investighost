-- A single transaction makes the reviewed structured snapshot authoritative.
-- It never uploads media or calls Trawel.
create table if not exists public.real_editorial_structured_package_approvals (
  id uuid primary key default gen_random_uuid(),
  package_artifact_id uuid not null unique references public.real_editorial_artifacts(id),
  package_id uuid not null,
  execution_id uuid not null references public.real_editorial_executions(id),
  destination_id uuid not null,
  job_id uuid not null unique references public.editorial_destination_batch_jobs(id),
  student_revision_id uuid not null references public.real_editorial_library_version_revisions(id),
  adventure_revision_id uuid not null references public.real_editorial_library_version_revisions(id),
  visual_package_id uuid not null references public.real_editorial_visual_packages(id),
  reviewer_id uuid not null,
  reason text null,
  approved_at timestamptz not null default transaction_timestamp()
);

create or replace function public.factory_approve_structured_editorial_package(
  p_job_id uuid, p_structured_artifact_id uuid, p_package_id uuid,
  p_reviewer_id uuid, p_reason text
) returns jsonb
language plpgsql volatile strict security definer set search_path = public
as $$
declare
  job public.editorial_destination_batch_jobs%rowtype;
  execution public.real_editorial_executions%rowtype;
  artifact public.real_editorial_artifacts%rowtype;
  latest_artifact_id uuid;
  payload jsonb;
  prior public.real_editorial_structured_package_approvals%rowtype;
  item record;
  version_state text;
  submit_result jsonb;
  submit_target text;
  submit_command jsonb;
  approve_command jsonb;
  approval_id uuid := gen_random_uuid();
  now_value timestamptz := transaction_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended('structured-package-job:' || p_job_id::text, 0));
  select * into job from public.editorial_destination_batch_jobs where id = p_job_id for update;
  if not found or job.status <> 'READY_FOR_REVIEW' then raise exception 'BATCH_REVIEW_STATE_CHANGED'; end if;
  select * into prior from public.real_editorial_structured_package_approvals where job_id = p_job_id;
  if found then
    if prior.package_artifact_id <> p_structured_artifact_id then raise exception 'REVIEWED_PACKAGE_ID_MATCH_REQUIRED'; end if;
    return jsonb_build_object('approvalId',prior.id,'packageId',prior.package_id,'structuredPackageArtifactId',prior.package_artifact_id,'studentRevisionId',prior.student_revision_id,'adventureRevisionId',prior.adventure_revision_id,'visualPackageId',prior.visual_package_id,'approvedAt',public.real_editorial_library_timestamp(prior.approved_at),'reused',true);
  end if;
  select * into execution from public.real_editorial_executions where owner_type = 'BATCH_JOB' and owner_id = p_job_id;
  if not found then raise exception 'STRUCTURED_PACKAGE_EXECUTION_REQUIRED'; end if;
  select * into artifact from public.real_editorial_artifacts where id = p_structured_artifact_id and execution_owner_id = execution.id and artifact_kind = 'editorial_package' and artifact_key = 'structured/v1';
  if not found then raise exception 'REVIEWED_PACKAGE_ID_MATCH_REQUIRED'; end if;
  select id into latest_artifact_id from public.real_editorial_artifacts where execution_owner_id = execution.id and artifact_kind = 'editorial_package' and artifact_key = 'structured/v1' order by version desc limit 1;
  if latest_artifact_id <> p_structured_artifact_id then raise exception 'REVIEWED_PACKAGE_ID_MATCH_REQUIRED'; end if;
  payload := artifact.payload;
  if payload->>'packageId' <> p_package_id::text or payload->>'state' <> 'PACKAGE_READY_FOR_REVIEW' then raise exception 'PACKAGE_READINESS_REQUIRED'; end if;
  if payload #>> '{adventure,document,hero,asset,status}' <> 'RESOLVED' or jsonb_array_length(coalesce(payload #> '{visualResolution,unresolved}','[]'::jsonb)) <> 0 then raise exception 'PACKAGE_READINESS_REQUIRED'; end if;
  if payload #>> '{student,libraryRevision,revisionId}' <> job.artifact_refs->>'STUDENT' or payload #>> '{adventure,libraryRevision,revisionId}' <> job.artifact_refs->>'ADVENTURE' or payload->>'visualPackageId' <> job.artifact_refs->>'VISUALS' then raise exception 'MIXED_REVISIONS_BLOCKED'; end if;
  if p_reviewer_id::text <> '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11' then raise exception 'ACTOR_NOT_AUTHORIZED'; end if;
  for item in select v.id version_id, r.id revision_id, r.revision_hash from public.real_editorial_library_versions v join public.real_editorial_library_version_revisions r on r.version_id = v.id where r.id in ((payload #>> '{student,libraryRevision,revisionId}')::uuid, (payload #>> '{adventure,libraryRevision,revisionId}')::uuid) order by v.id loop
    perform pg_advisory_xact_lock(hashtextextended('library-version:' || item.version_id::text, 0));
    version_state := public.real_editorial_library_effective_state(item.version_id);
    if version_state = 'draft' then
      submit_command := jsonb_build_object('versionId',item.version_id,'revisionId',item.revision_id,'expectedState','draft','expectedRevisionHash',item.revision_hash,'expectedTraceabilityHash',public.real_editorial_library_traceability_hash(item.version_id,item.revision_id),'reason',coalesce(p_reason,'Aprobación humana del package estructurado.'),'actor',jsonb_build_object('actorId',p_reviewer_id,'roleSnapshot','local_owner:submit'),'actorRoleSnapshot','local_owner:submit','operationKey',encode(extensions.digest(convert_to('structured-submit:' || p_structured_artifact_id::text || ':' || item.version_id::text,'UTF8'),'sha256'),'hex'));
      submit_command := submit_command || jsonb_build_object('requestFingerprint',public.real_editorial_library_request_fingerprint('submit_for_review',submit_command - 'operationKey' - 'actorRoleSnapshot'));
      submit_result := public.real_editorial_library_submit_for_review(submit_command);
      submit_target := submit_result->>'decisionTargetHash';
    elsif version_state = 'ready_for_review' then
      select decision_target_hash into submit_target from public.real_editorial_library_version_decisions where version_id = item.version_id and decision_type = 'submit_for_review' order by sequence desc limit 1;
    else raise exception 'STALE_VERSION_STATE'; end if;
    approve_command := jsonb_build_object('versionId',item.version_id,'revisionId',item.revision_id,'decisionType','approve','expectedPreviousState','ready_for_review','expectedDecisionTargetHash',submit_target,'reason',coalesce(p_reason,'Aprobación humana del package estructurado.'),'affectedFindingKeys','[]'::jsonb,'changeInstructions','[]'::jsonb,'acceptedRiskFindingKeys','[]'::jsonb,'separationOfDutiesException',true,'separationOfDutiesReason','El propietario local aprueba el package atómico.','actor',jsonb_build_object('actorId',p_reviewer_id,'roleSnapshot','local_owner:approve'),'actorRoleSnapshot','local_owner:approve','operationKey',encode(extensions.digest(convert_to('structured-approve:' || p_structured_artifact_id::text || ':' || item.version_id::text,'UTF8'),'sha256'),'hex'));
    approve_command := approve_command || jsonb_build_object('requestFingerprint',public.real_editorial_library_request_fingerprint('decide_version',approve_command - 'operationKey' - 'actorRoleSnapshot'));
    perform public.real_editorial_library_decide_version(approve_command);
  end loop;
  insert into public.real_editorial_structured_package_approvals (id,package_artifact_id,package_id,execution_id,destination_id,job_id,student_revision_id,adventure_revision_id,visual_package_id,reviewer_id,reason,approved_at) values (approval_id,p_structured_artifact_id,p_package_id,execution.id,(payload->>'destinationId')::uuid,p_job_id,(payload #>> '{student,libraryRevision,revisionId}')::uuid,(payload #>> '{adventure,libraryRevision,revisionId}')::uuid,(payload->>'visualPackageId')::uuid,p_reviewer_id,p_reason,now_value);
  update public.editorial_destination_batch_jobs set status = 'APPROVED', retryable = false, last_failure = null, updated_at = now_value where id = p_job_id;
  return jsonb_build_object('approvalId',approval_id,'packageId',p_package_id,'structuredPackageArtifactId',p_structured_artifact_id,'studentRevisionId',payload #>> '{student,libraryRevision,revisionId}','adventureRevisionId',payload #>> '{adventure,libraryRevision,revisionId}','visualPackageId',payload->>'visualPackageId','approvedAt',public.real_editorial_library_timestamp(now_value),'reused',false);
end $$;

revoke all on function public.factory_approve_structured_editorial_package(uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.factory_approve_structured_editorial_package(uuid,uuid,uuid,uuid,text) to service_role;
