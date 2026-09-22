-- Extends the existing version transaction to accept the immutable
-- pre-approval BATCH_JOB Library origin. Pilot validation is unchanged.

create or replace function public.real_editorial_library_create_version(p_command jsonb)
returns jsonb
language plpgsql volatile strict
security definer set search_path = public
as $$
declare
  operation_key text := p_command->>'operationKey';
  request_fingerprint text := p_command->>'requestFingerprint';
  entry_id uuid := (p_command->>'libraryEntryId')::uuid;
  actor_id uuid := (p_command->'actor'->>'actorId')::uuid;
  owner jsonb;
  entry public.real_editorial_library_entries%rowtype;
  transfer public.real_editorial_library_transfers%rowtype;
  previous public.real_editorial_library_versions%rowtype;
  previous_state text;
  origin_hash text;
  head_hash text;
  version_id uuid := gen_random_uuid();
  revision_id uuid := gen_random_uuid();
  version_number integer;
  version_hash text;
  content_hash text;
  revision_hash text;
  title text;
  content text;
  created_at timestamptz := transaction_timestamp();
  revision_payload jsonb;
  revision_operation_key text;
  revision_fingerprint text;
begin
  perform public.real_editorial_library_assert_request('create_version',p_command);
  if actor_id::text <> '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
     or p_command->>'actorRoleSnapshot' <> 'local_owner:edit'
     or p_command->'actor'->>'roleSnapshot' <> p_command->>'actorRoleSnapshot' then
    raise exception 'ACTOR_NOT_AUTHORIZED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('library-operation:' || operation_key,0));
  perform pg_advisory_xact_lock(hashtextextended('library-entry:' || entry_id::text,0));
  owner := public.real_editorial_library_operation_owner(operation_key);
  if owner is not null then
    if owner->>'kind' <> 'version' or owner->>'fingerprint' <> request_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    select * into previous from public.real_editorial_library_versions
      where id = (owner->>'versionId')::uuid;
    select to_jsonb(r) into strict revision_payload
      from public.real_editorial_library_version_revisions r
      where r.version_id = previous.id order by r.revision_number limit 1;
    return jsonb_build_object(
      'status','ok','operation','create_version','reused',true,
      'versionId',previous.id,'revisionId',revision_payload->>'id','state','draft',
      'versionHash',previous.version_hash,'revisionHash',revision_payload->>'revision_hash',
      'traceabilityHash',null,'decisionTargetHash',null
    );
  end if;
  select e.* into entry from public.real_editorial_library_entries e where e.id = entry_id;
  if not found then raise exception 'LIBRARY_ENTRY_NOT_FOUND'; end if;
  if entry.origin = 'real_editorial_batch_job' then
    if entry.execution_owner_id is null
       or entry.status <> 'candidate'
       or entry.editorial_state <> 'candidate'
       or entry.library_state <> 'candidate'
       or entry.publication_state <> 'unpublished' then
      raise exception 'ORIGIN_REFERENCE_INVALID: batch candidate boundary violated';
    end if;
  else
    select t.* into transfer from public.real_editorial_library_transfers t where t.id = entry.transfer_id;
    if not found then raise exception 'ORIGIN_REFERENCE_INVALID: transfer missing'; end if;
    if entry.status <> 'approved_unpublished'
       or entry.editorial_state <> 'approved'
       or entry.library_state <> 'ready_for_library'
       or entry.publication_state <> 'unpublished'
       or transfer.publication_count <> 0
       or transfer.provider_calls_performed <> 0
       or transfer.reservations_created <> 0
       or transfer.ledger_cost <> 0
       or transfer.trawel_connected
       or transfer.automatic_enabled then
      raise exception 'ORIGIN_REFERENCE_INVALID: library boundary violated';
    end if;
  end if;
  if p_command->>'canonicalizationContract' <> 'investighost-library-c14n-v1'
     or p_command->>'contentSchemaContract' <> 'investighost-library-content-v1' then
    raise exception 'HASH_MISMATCH: unsupported contract';
  end if;
  origin_hash := public.real_editorial_library_origin_hash(entry);
  select v.* into previous from public.real_editorial_library_versions v
    where v.library_entry_id = entry_id order by v.version_number desc limit 1;
  if found then
    previous_state := public.real_editorial_library_effective_state(previous.id);
    if previous_state not in ('changes_requested','approved','rejected','abandoned') then
      raise exception 'VERSION_ALREADY_OPEN';
    end if;
    head_hash := (
      select d.decision_target_hash from public.real_editorial_library_version_decisions d
       where d.version_id = previous.id
         and d.decision_type in ('approve','request_changes','reject','abandon')
       order by d.sequence desc limit 1
    );
    version_number := previous.version_number + 1;
  else
    head_hash := origin_hash;
    version_number := 2;
  end if;
  if head_hash is null or head_hash <> p_command->>'expectedHeadHash' then
    raise exception 'HASH_MISMATCH: expected head differs';
  end if;
  title := public.real_editorial_library_canonical_title(p_command->>'title');
  content := public.real_editorial_library_canonical_content(p_command->>'content');
  content_hash := public.real_editorial_library_content_hash(entry.profile,entry.language,title,content);
  version_hash := public.real_editorial_library_hash(jsonb_build_object(
    'schema','investighost-library-version-v1','entryId',entry.id,'versionId',version_id,
    'versionNumber',version_number,'parentVersionId',case when version_number = 2 then null else previous.id end,
    'parentHash',head_hash,'createdBy',actor_id,
    'createdAt',public.real_editorial_library_timestamp(created_at),
    'creationReason',btrim(p_command->>'creationReason')
  ));
  revision_hash := public.real_editorial_library_hash(jsonb_build_object(
    'schema','investighost-library-revision-v1','versionHash',version_hash,'revisionId',revision_id,
    'revisionNumber',1,'previousRevisionId',null,'previousRevisionHash',null,
    'contentHash',content_hash,'createdBy',actor_id,
    'createdAt',public.real_editorial_library_timestamp(created_at),
    'reason',btrim(p_command->>'creationReason')
  ));
  revision_payload := jsonb_build_object('versionId',version_id,'revisionId',revision_id,'revisionHash',revision_hash);
  revision_operation_key := public.real_editorial_library_hash(jsonb_build_object('kind','initial-revision','payload',revision_payload));
  revision_fingerprint := public.real_editorial_library_request_fingerprint('initial_revision',revision_payload);
  insert into public.real_editorial_library_versions (
    id,library_entry_id,version_number,parent_version_id,parent_origin_version_hash,parent_hash,
    version_hash,canonicalization_contract,creation_reason,created_by_actor_id,created_at,
    operation_key,request_fingerprint,publication_state
  ) values (
    version_id,entry.id,version_number,case when version_number = 2 then null else previous.id end,
    origin_hash,head_hash,version_hash,'investighost-library-c14n-v1',btrim(p_command->>'creationReason'),
    actor_id,created_at,operation_key,request_fingerprint,'unpublished'
  );
  insert into public.real_editorial_library_version_revisions (
    id,version_id,revision_number,previous_revision_id,expected_previous_revision_hash,title,content,
    content_schema_contract,canonicalization_contract,content_hash,revision_hash,change_summary,
    created_by_actor_id,created_at,operation_key,request_fingerprint
  ) values (
    revision_id,version_id,1,null,null,title,content,'investighost-library-content-v1',
    'investighost-library-c14n-v1',content_hash,revision_hash,btrim(p_command->>'creationReason'),
    actor_id,created_at,revision_operation_key,revision_fingerprint
  );
  perform public.real_editorial_library_seed_baseline(version_id,revision_id,actor_id,created_at);
  return jsonb_build_object(
    'status','ok','operation','create_version','reused',false,
    'versionId',version_id,'revisionId',revision_id,'state','draft',
    'versionHash',version_hash,'revisionHash',revision_hash,
    'traceabilityHash',null,'decisionTargetHash',null
  );
end;
$$;
