-- Redo artifacts are accepted only from the same owner/kind. The candidate
-- stays in its existing pre-approval Library line; materialization saves a
-- new revision, retaining earlier revisions and the human gate.
create or replace function public.real_editorial_library_create_batch_candidate(
  p_execution_owner_id uuid, p_profile text, p_entry_key text, p_source_artifact_id uuid,
  p_destination_name text, p_country_code text, p_destination_type text
) returns jsonb language plpgsql volatile strict security definer set search_path = public as $$
declare execution public.real_editorial_executions%rowtype; artifact public.real_editorial_artifacts%rowtype;
  existing public.real_editorial_library_entries%rowtype; entry public.real_editorial_library_entries%rowtype;
  expected_kind text; title text; content text;
begin
  if p_profile not in ('student','adventure') then raise exception 'PROFILE_INVALID'; end if;
  if p_entry_key !~ '^[a-f0-9]{64}$' then raise exception 'ENTRY_KEY_INVALID'; end if;
  expected_kind := case when p_profile = 'student' then 'draft_student' else 'draft_adventure' end;
  select * into execution from public.real_editorial_executions where id = p_execution_owner_id and owner_type = 'BATCH_JOB';
  if not found then raise exception 'BATCH_EXECUTION_NOT_FOUND'; end if;
  select * into artifact from public.real_editorial_artifacts where id = p_source_artifact_id and execution_owner_id = p_execution_owner_id and artifact_kind = expected_kind and (artifact_key = p_profile or artifact_key like p_profile || '/redo/%');
  if not found then raise exception 'SOURCE_ARTIFACT_INVALID'; end if;
  title := artifact.payload->>'title'; content := artifact.payload->>'content';
  if title is null or length(btrim(title)) = 0 or content is null or length(btrim(content)) = 0 then raise exception 'SOURCE_ARTIFACT_INVALID'; end if;
  select * into existing from public.real_editorial_library_entries where entry_key = p_entry_key;
  if found then
    if existing.execution_owner_id <> p_execution_owner_id or existing.profile <> p_profile then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('libraryEntryId',existing.id,'originHash',public.real_editorial_library_origin_hash(existing),'reused',true);
  end if;
  insert into public.real_editorial_library_entries (
    id,entry_key,transfer_id,pilot_id,run_id,execution_owner_id,canonical_destination_id,destination_name,country_code,destination_type,
    profile,title,content,editorial_version,language,status,editorial_state,library_state,publication_state,origin,source_artifact_id,source_artifact_kind,
    source_artifact_key,source_artifact_version,source_artifact_hash,source_artifact_created_at,final_review_artifact_id,final_review_hash,
    final_review_version,final_review_created_at,terminal_decision_id,review_outcome,review_payload,warnings,gaps,contradictions,claims,evidence,sources,
    approval_actor_id,transfer_actor_id,final_run_cost,currency,approved_at,created_at
  ) values (
    gen_random_uuid(),p_entry_key,null,null,null,p_execution_owner_id,execution.destination_id,btrim(p_destination_name),upper(btrim(p_country_code)),p_destination_type,
    p_profile,btrim(title),public.real_editorial_library_canonical_content(content),artifact.version,'es-ES','candidate','candidate','candidate','unpublished','real_editorial_batch_job',
    artifact.id,artifact.artifact_kind,artifact.artifact_key,artifact.version,artifact.payload_hash,artifact.created_at,null,null,null,null,null,null,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb,
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,null,null,null,'EUR',null,transaction_timestamp()
  ) returning * into entry;
  return jsonb_build_object('libraryEntryId',entry.id,'originHash',public.real_editorial_library_origin_hash(entry),'reused',false);
end;
$$;
