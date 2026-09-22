-- BATCH_JOB pre-approval candidates use the existing Library entry/version/
-- revision tables. Historical pilot rows retain their exact origin semantics.

alter table public.real_editorial_library_entries
  add column if not exists execution_owner_id uuid
    references public.real_editorial_executions(id) on delete restrict;

alter table public.real_editorial_library_entries
  alter column transfer_id drop not null,
  alter column pilot_id drop not null,
  alter column run_id drop not null,
  alter column final_review_artifact_id drop not null,
  alter column final_review_hash drop not null,
  alter column final_review_version drop not null,
  alter column final_review_created_at drop not null,
  alter column terminal_decision_id drop not null,
  alter column review_outcome drop not null,
  alter column approval_actor_id drop not null,
  alter column transfer_actor_id drop not null,
  alter column final_run_cost drop not null,
  alter column approved_at drop not null;

alter table public.real_editorial_library_entries
  drop constraint if exists real_editorial_library_entries_status_check,
  drop constraint if exists real_editorial_library_entries_editorial_state_check,
  drop constraint if exists real_editorial_library_entries_library_state_check,
  drop constraint if exists real_editorial_library_entries_origin_check,
  drop constraint if exists real_editorial_library_entries_review_outcome_check,
  drop constraint if exists real_editorial_library_entries_warnings_check,
  drop constraint if exists real_editorial_library_entries_gaps_check,
  drop constraint if exists real_editorial_library_entries_contradictions_check,
  drop constraint if exists real_editorial_library_entries_claims_check,
  drop constraint if exists real_editorial_library_entries_evidence_check,
  drop constraint if exists real_editorial_library_entries_sources_check;

alter table public.real_editorial_library_entries
  add constraint real_editorial_library_entries_status_check
    check (status in ('approved_unpublished','candidate')),
  add constraint real_editorial_library_entries_editorial_state_check
    check (editorial_state in ('approved','candidate')),
  add constraint real_editorial_library_entries_library_state_check
    check (library_state in ('ready_for_library','candidate')),
  add constraint real_editorial_library_entries_origin_check
    check (origin in ('real_editorial_pilot','real_editorial_batch_job')),
  add constraint real_editorial_library_entries_review_outcome_check
    check (review_outcome is null or review_outcome = 'passed_with_warnings'),
  add constraint real_editorial_library_entries_warnings_check
    check (jsonb_typeof(warnings) = 'array'),
  add constraint real_editorial_library_entries_gaps_check
    check (jsonb_typeof(gaps) = 'array'),
  add constraint real_editorial_library_entries_contradictions_check
    check (jsonb_typeof(contradictions) = 'array'),
  add constraint real_editorial_library_entries_claims_check
    check (jsonb_typeof(claims) = 'array'),
  add constraint real_editorial_library_entries_evidence_check
    check (jsonb_typeof(evidence) = 'array'),
  add constraint real_editorial_library_entries_sources_check
    check (jsonb_typeof(sources) = 'array'),
  add constraint real_editorial_library_entries_owner_check check (
    (execution_owner_id is null and transfer_id is not null and pilot_id is not null and run_id is not null)
    or
    (execution_owner_id is not null and transfer_id is null and pilot_id is null and run_id is null)
  );

create unique index if not exists real_editorial_library_entries_batch_owner_profile_idx
  on public.real_editorial_library_entries(execution_owner_id, profile)
  where execution_owner_id is not null;

-- Preserve the v1 hash byte-for-byte for pilot entries. Batch candidates have
-- their own explicit origin version and no terminal approval reference yet.
create or replace function public.real_editorial_library_origin_hash(
  p_entry public.real_editorial_library_entries
) returns text
language sql immutable strict
set search_path = public
as $$
  select case when p_entry.origin = 'real_editorial_batch_job' then
    public.real_editorial_library_hash(jsonb_build_object(
      'schema','investighost-library-origin-batch-v1',
      'entryId',p_entry.id,
      'entryKey',p_entry.entry_key,
      'executionOwnerId',p_entry.execution_owner_id,
      'profile',p_entry.profile,
      'language',p_entry.language,
      'contentHash',public.real_editorial_library_content_hash(
        p_entry.profile,p_entry.language,
        public.real_editorial_library_canonical_title(p_entry.title),
        public.real_editorial_library_canonical_content(p_entry.content)
      ),
      'sourceArtifactId',p_entry.source_artifact_id,
      'sourceArtifactHash',p_entry.source_artifact_hash
    ))
  else
    public.real_editorial_library_hash(jsonb_build_object(
      'schema','investighost-library-origin-v1',
      'entryId',p_entry.id,
      'entryKey',p_entry.entry_key,
      'profile',p_entry.profile,
      'language',p_entry.language,
      'contentHash',public.real_editorial_library_content_hash(
        p_entry.profile,p_entry.language,
        public.real_editorial_library_canonical_title(p_entry.title),
        public.real_editorial_library_canonical_content(p_entry.content)
      ),
      'sourceArtifactId',p_entry.source_artifact_id,
      'sourceArtifactHash',p_entry.source_artifact_hash,
      'finalReviewHash',p_entry.final_review_hash,
      'terminalDecisionId',p_entry.terminal_decision_id
    ))
  end
$$;

-- Materializes only the immutable v1 Library origin. The regular versioning
-- transaction creates the draft version/revision immediately afterwards.
create or replace function public.real_editorial_library_create_batch_candidate(
  p_execution_owner_id uuid,
  p_profile text,
  p_entry_key text,
  p_source_artifact_id uuid,
  p_destination_name text,
  p_country_code text,
  p_destination_type text
) returns jsonb
language plpgsql volatile strict
security definer set search_path = public
as $$
declare
  execution public.real_editorial_executions%rowtype;
  artifact public.real_editorial_artifacts%rowtype;
  existing public.real_editorial_library_entries%rowtype;
  entry public.real_editorial_library_entries%rowtype;
  expected_kind text;
  title text;
  content text;
begin
  if p_profile not in ('student','adventure') then raise exception 'PROFILE_INVALID'; end if;
  if p_entry_key !~ '^[a-f0-9]{64}$' then raise exception 'ENTRY_KEY_INVALID'; end if;
  expected_kind := case when p_profile = 'student' then 'draft_student' else 'draft_adventure' end;
  select * into execution from public.real_editorial_executions
   where id = p_execution_owner_id and owner_type = 'BATCH_JOB';
  if not found then raise exception 'BATCH_EXECUTION_NOT_FOUND'; end if;
  select * into artifact from public.real_editorial_artifacts
   where id = p_source_artifact_id
     and execution_owner_id = p_execution_owner_id
     and artifact_kind = expected_kind
     and artifact_key = p_profile;
  if not found then raise exception 'SOURCE_ARTIFACT_INVALID'; end if;
  title := artifact.payload->>'title';
  content := artifact.payload->>'content';
  if title is null or length(btrim(title)) = 0 or content is null or length(btrim(content)) = 0 then
    raise exception 'SOURCE_ARTIFACT_INVALID';
  end if;
  select * into existing from public.real_editorial_library_entries
   where entry_key = p_entry_key;
  if found then
    if existing.execution_owner_id <> p_execution_owner_id
       or existing.profile <> p_profile
       or existing.source_artifact_id <> p_source_artifact_id
       or existing.source_artifact_hash <> artifact.payload_hash then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'libraryEntryId',existing.id,
      'originHash',public.real_editorial_library_origin_hash(existing),
      'reused',true
    );
  end if;
  insert into public.real_editorial_library_entries (
    id,entry_key,transfer_id,pilot_id,run_id,execution_owner_id,
    canonical_destination_id,destination_name,country_code,destination_type,
    profile,title,content,editorial_version,language,status,editorial_state,
    library_state,publication_state,origin,source_artifact_id,source_artifact_kind,
    source_artifact_key,source_artifact_version,source_artifact_hash,
    source_artifact_created_at,final_review_artifact_id,final_review_hash,
    final_review_version,final_review_created_at,terminal_decision_id,review_outcome,
    review_payload,warnings,gaps,contradictions,claims,evidence,sources,
    approval_actor_id,transfer_actor_id,final_run_cost,currency,approved_at,created_at
  ) values (
    gen_random_uuid(),p_entry_key,null,null,null,p_execution_owner_id,
    execution.destination_id,btrim(p_destination_name),upper(btrim(p_country_code)),p_destination_type,
    p_profile,btrim(title),public.real_editorial_library_canonical_content(content),artifact.version,
    'es-ES','candidate','candidate','candidate','unpublished','real_editorial_batch_job',
    artifact.id,artifact.artifact_kind,artifact.artifact_key,artifact.version,artifact.payload_hash,
    artifact.created_at,null,null,null,null,null,null,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb,
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,null,null,null,'EUR',null,transaction_timestamp()
  ) returning * into entry;
  return jsonb_build_object(
    'libraryEntryId',entry.id,
    'originHash',public.real_editorial_library_origin_hash(entry),
    'reused',false
  );
end;
$$;

revoke all on function public.real_editorial_library_create_batch_candidate(uuid,text,text,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.real_editorial_library_create_batch_candidate(uuid,text,text,uuid,text,text,text)
  to service_role;
