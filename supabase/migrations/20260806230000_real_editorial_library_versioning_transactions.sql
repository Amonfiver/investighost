-- BIB-V02: canonicalizacion, hashes y transacciones autoritativas para v2+.
-- No expone IPC/UI, no publica y no modifica real_editorial_library_entries.

do $$
begin
  if exists (select 1 from public.real_editorial_library_versions)
     or exists (select 1 from public.real_editorial_library_version_revisions)
     or exists (select 1 from public.real_editorial_library_version_findings)
     or exists (select 1 from public.real_editorial_library_version_decisions) then
    raise exception 'BIB_V02_REQUIRES_EMPTY_VERSIONING_TABLES';
  end if;
end $$;

alter table public.real_editorial_library_versions
  add column request_fingerprint text not null
    check (request_fingerprint ~ '^[a-f0-9]{64}$');
alter table public.real_editorial_library_version_revisions
  add column request_fingerprint text not null
    check (request_fingerprint ~ '^[a-f0-9]{64}$');
alter table public.real_editorial_library_version_findings
  add column request_fingerprint text not null
    check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  add column is_baseline boolean not null default false,
  add column result_traceability_hash text null
    check (
      result_traceability_hash is null
      or result_traceability_hash ~ '^[a-f0-9]{64}$'
    );

comment on column public.real_editorial_library_version_findings.is_baseline is
  'True solo para la fotografia heredada creada automaticamente; submit exige que cada finding efectivo haya sido reconciliado.';
comment on column public.real_editorial_library_version_findings.result_traceability_hash is
  'Snapshot de resultado para recuperar exactamente un reconcile reintentado.';

create function public.real_editorial_library_jcs(p_value jsonb)
returns text
language plpgsql immutable strict
set search_path = public
as $$
declare
  kind text := jsonb_typeof(p_value);
  result text;
begin
  if kind in ('null','boolean','number','string') then
    return p_value::text;
  elsif kind = 'array' then
    select '[' || coalesce(string_agg(public.real_editorial_library_jcs(value),',' order by ordinal), '') || ']'
      into result
      from jsonb_array_elements(p_value) with ordinality as items(value,ordinal);
    return result;
  elsif kind = 'object' then
    select '{' || coalesce(string_agg(to_jsonb(key)::text || ':' ||
      public.real_editorial_library_jcs(value),',' order by key collate "C"), '') || '}'
      into result
      from jsonb_each(p_value);
    return result;
  end if;
  raise exception 'HASH_MISMATCH: unsupported canonical JSON value';
end $$;

create function public.real_editorial_library_hash(p_value jsonb)
returns text
language sql immutable strict
set search_path = public,extensions
as $$
  select encode(extensions.digest(
    convert_to(public.real_editorial_library_jcs(p_value),'UTF8'),
    'sha256'
  ),'hex')
$$;

create function public.real_editorial_library_timestamp(p_value timestamptz)
returns text
language sql immutable strict
set search_path = public
as $$
  select to_char(p_value at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create function public.real_editorial_library_normalize_unicode(p_value text)
returns text
language plpgsql immutable strict
set search_path = public
as $$
declare value text := p_value;
begin
  if left(value,1) = chr(65279) then value := substr(value,2); end if;
  -- PostgreSQL UTF-8 rechaza NUL antes de construir un valor text.
  value := normalize(value,NFC);
  value := replace(replace(value,chr(13) || chr(10),chr(10)),chr(13),chr(10));
  return value;
end $$;

create function public.real_editorial_library_canonical_title(p_value text)
returns text
language plpgsql immutable strict
set search_path = public
as $$
declare
  whitespace text := chr(9) || chr(10) || chr(11) || chr(12) || chr(32)
    || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194)
    || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199)
    || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233)
    || chr(8239) || chr(8287) || chr(12288) || chr(65279);
  value text;
begin
  value := btrim(public.real_editorial_library_normalize_unicode(p_value),whitespace);
  if length(value) not between 1 and 500 or position(chr(10) in value) > 0 then
    raise exception 'HASH_MISMATCH: invalid canonical title';
  end if;
  return value;
end $$;

create function public.real_editorial_library_canonical_content(p_value text)
returns text
language plpgsql immutable strict
set search_path = public
as $$
declare
  value text;
  canonical text;
begin
  value := public.real_editorial_library_normalize_unicode(p_value);
  select string_agg(rtrim(line,chr(9) || chr(32)),chr(10) order by ordinal)
    into canonical
    from unnest(string_to_array(value,chr(10))) with ordinality as lines(line,ordinal);
  canonical := rtrim(coalesce(canonical,''),chr(10)) || chr(10);
  if length(canonical) not between 1 and 100000
     or length(btrim(canonical,chr(9) || chr(10) || chr(32))) = 0 then
    raise exception 'HASH_MISMATCH: invalid canonical content';
  end if;
  return canonical;
end $$;

create function public.real_editorial_library_content_hash(
  p_profile text,
  p_language text,
  p_title text,
  p_content text
) returns text
language sql immutable strict
set search_path = public
as $$
  select public.real_editorial_library_hash(jsonb_build_object(
    'schema','investighost-library-content-v1',
    'canonicalization','investighost-library-c14n-v1',
    'profile',p_profile,
    'language',p_language,
    'title',p_title,
    'content',p_content
  ))
$$;

create function public.real_editorial_library_origin_hash(
  p_entry public.real_editorial_library_entries
) returns text
language sql immutable strict
set search_path = public
as $$
  select public.real_editorial_library_hash(jsonb_build_object(
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
$$;

create function public.real_editorial_library_request_fingerprint(
  p_operation text,
  p_payload jsonb
) returns text
language sql immutable strict
set search_path = public
as $$
  select public.real_editorial_library_hash(jsonb_build_object(
    'schema','investighost-library-request-v1',
    'operation',p_operation,
    'payload',p_payload
  ))
$$;

create function public.real_editorial_library_assert_request(
  p_operation text,
  p_command jsonb
) returns void
language plpgsql immutable strict
set search_path = public
as $$
declare calculated text;
begin
  if coalesce(p_command->>'operationKey','') !~ '^[a-f0-9]{64}$'
     or coalesce(p_command->>'requestFingerprint','') !~ '^[a-f0-9]{64}$' then
    raise exception 'HASH_MISMATCH: invalid operation metadata';
  end if;
  calculated := public.real_editorial_library_request_fingerprint(
    p_operation,
    p_command - 'operationKey' - 'requestFingerprint' - 'actorRoleSnapshot'
  );
  if calculated <> p_command->>'requestFingerprint' then
    raise exception 'HASH_MISMATCH: request fingerprint mismatch';
  end if;
end $$;

create function public.real_editorial_library_effective_state(p_version_id uuid)
returns text
language plpgsql stable strict
security definer set search_path = public
as $$
declare
  state text := 'draft';
  item record;
  expected_sequence integer := 1;
begin
  if not exists (select 1 from public.real_editorial_library_versions where id = p_version_id) then
    raise exception 'VERSION_NOT_FOUND';
  end if;
  for item in
    select sequence,decision_type,expected_previous_state,resulting_state
      from public.real_editorial_library_version_decisions
     where version_id = p_version_id order by sequence
  loop
    if item.sequence <> expected_sequence or item.expected_previous_state <> state then
      raise exception 'INVALID_STATE_TRANSITION: corrupt decision chain';
    end if;
    state := item.resulting_state;
    expected_sequence := expected_sequence + 1;
  end loop;
  return state;
end $$;

create function public.real_editorial_library_traceability_hash(
  p_version_id uuid,
  p_revision_id uuid
) returns text
language plpgsql stable strict
security definer set search_path = public
as $$
declare
  origin_hash text;
  effective jsonb;
begin
  select parent_origin_version_hash into origin_hash
    from public.real_editorial_library_versions where id = p_version_id;
  if origin_hash is null then raise exception 'VERSION_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'findingKey',finding_key,'findingHash',finding_hash
    ) order by finding_key),'[]'::jsonb)
    into effective
    from (
      select distinct on (finding_key) finding_key,finding_hash
        from public.real_editorial_library_version_findings
       where version_id = p_version_id and revision_id = p_revision_id
       order by finding_key,sequence desc
    ) latest;
  return public.real_editorial_library_hash(jsonb_build_object(
    'schema','investighost-library-traceability-v1',
    'originVersionHash',origin_hash,
    'findings',effective
  ));
end $$;

create function public.real_editorial_library_decision_target_hash(
  p_version_hash text,
  p_revision_hash text,
  p_traceability_hash text
) returns text
language sql immutable strict
set search_path = public
as $$
  select public.real_editorial_library_hash(jsonb_build_object(
    'schema','investighost-library-review-target-v1',
    'versionHash',p_version_hash,
    'revisionHash',p_revision_hash,
    'traceabilityHash',p_traceability_hash
  ))
$$;

create function public.real_editorial_library_operation_owner(p_operation_key text)
returns jsonb
language sql stable strict
security definer set search_path = public
as $$
  select value from (
    select jsonb_build_object(
      'kind','version','id',id,'versionId',id,'revisionId',null,
      'fingerprint',request_fingerprint
    ) as value from public.real_editorial_library_versions where operation_key = p_operation_key
    union all
    select jsonb_build_object(
      'kind','revision','id',id,'versionId',version_id,'revisionId',id,
      'fingerprint',request_fingerprint
    ) from public.real_editorial_library_version_revisions where operation_key = p_operation_key
    union all
    select jsonb_build_object(
      'kind','finding','id',id,'versionId',version_id,'revisionId',revision_id,
      'fingerprint',request_fingerprint
    ) from public.real_editorial_library_version_findings where operation_key = p_operation_key
    union all
    select jsonb_build_object(
      'kind','decision','id',id,'versionId',version_id,'revisionId',revision_id,
      'fingerprint',request_fingerprint
    ) from public.real_editorial_library_version_decisions where operation_key = p_operation_key
  ) candidates limit 1
$$;

create function public.real_editorial_library_origin_contains(
  p_values jsonb,
  p_reference_id text
) returns boolean
language sql immutable strict
set search_path = public
as $$
  select exists (
    select 1 from jsonb_array_elements(p_values) item
     where coalesce(
       item->>'id',item->>'claimId',item->>'evidenceId',item->>'sourceId',
       public.real_editorial_library_hash(item)
     ) = p_reference_id
  )
$$;

create function public.real_editorial_library_all_refs_exist(
  p_values jsonb,
  p_references jsonb
) returns boolean
language sql immutable strict
set search_path = public
as $$
  select not exists (
    select 1 from jsonb_array_elements_text(p_references) ref
     where not public.real_editorial_library_origin_contains(p_values,ref)
  )
$$;

create function public.real_editorial_library_finding_hash(
  p_version_hash text,
  p_revision_hash text,
  p_finding_id uuid,
  p_finding_key text,
  p_sequence integer,
  p_supersedes_finding_id uuid,
  p_finding jsonb,
  p_actor_id uuid,
  p_created_at timestamptz
) returns text
language sql immutable
set search_path = public
as $$
  select public.real_editorial_library_hash(jsonb_build_object(
    'schema','investighost-library-finding-v1',
    'versionHash',p_version_hash,
    'revisionHash',p_revision_hash,
    'findingId',p_finding_id,
    'findingKey',p_finding_key,
    'sequence',p_sequence,
    'supersedesFindingId',p_supersedes_finding_id,
    'sourceFindingType',p_finding->>'sourceFindingType',
    'sourceFindingId',p_finding->>'sourceFindingId',
    'origin',p_finding->>'origin',
    'disposition',p_finding->>'disposition',
    'claimRelation',p_finding->>'claimRelation',
    'supportStatus',p_finding->>'supportStatus',
    'subjectText',p_finding->>'subjectText',
    'diffAnchor',p_finding->'diffAnchor',
    'claimIds',p_finding->'claimIds',
    'evidenceReferences',p_finding->'evidenceReferences',
    'sourceIds',p_finding->'sourceIds',
    'editorDeclaration',p_finding->>'editorDeclaration',
    'justification',p_finding->>'justification',
    'createdBy',p_actor_id,
    'createdAt',public.real_editorial_library_timestamp(p_created_at)
  ))
$$;

create function public.real_editorial_library_seed_baseline(
  p_version_id uuid,
  p_revision_id uuid,
  p_actor_id uuid,
  p_created_at timestamptz
) returns void
language plpgsql volatile strict
security definer set search_path = public
as $$
declare
  entry public.real_editorial_library_entries%rowtype;
  version_hash text;
  revision_hash text;
  kind text;
  values_json jsonb;
  item jsonb;
  source_id text;
  finding_id uuid;
  finding_key text;
  finding jsonb;
  finding_hash text;
  internal_payload jsonb;
  internal_key text;
  internal_fingerprint text;
begin
  select e.*
    into entry
    from public.real_editorial_library_versions v
    join public.real_editorial_library_entries e on e.id = v.library_entry_id
    join public.real_editorial_library_version_revisions r
      on r.id = p_revision_id and r.version_id = v.id
   where v.id = p_version_id;
  if not found then raise exception 'REVISION_NOT_FOUND'; end if;
  select v.version_hash,r.revision_hash
    into version_hash,revision_hash
    from public.real_editorial_library_versions v
    join public.real_editorial_library_version_revisions r
      on r.id = p_revision_id and r.version_id = v.id
   where v.id = p_version_id;

  foreach kind in array array['warning','gap','contradiction','claim'] loop
    values_json := case kind
      when 'warning' then entry.warnings
      when 'gap' then entry.gaps
      when 'contradiction' then entry.contradictions
      else entry.claims end;
    for item in select value from jsonb_array_elements(values_json) loop
      source_id := coalesce(
        item->>'id',item->>'claimId',item->>'evidenceId',item->>'sourceId',
        public.real_editorial_library_hash(item)
      );
      finding_key := kind || ':' || source_id;
      finding_id := gen_random_uuid();
      finding := jsonb_build_object(
        'sourceFindingType',kind,
        'sourceFindingId',source_id,
        'origin','inherited',
        'disposition','pending',
        'claimRelation',case when kind = 'claim' then 'preserved' else 'not_applicable' end,
        'supportStatus',case when kind = 'claim' then 'supported' else 'not_applicable' end,
        'subjectText',coalesce(
          item->>'statement',item->>'description',item->>'message',item#>>'{}'
        ),
        'diffAnchor','null'::jsonb,
        'claimIds',case when kind = 'claim' then jsonb_build_array(source_id) else '[]'::jsonb end,
        'evidenceReferences','[]'::jsonb,
        'sourceIds','[]'::jsonb,
        'editorDeclaration','Pendiente de reconciliacion editorial',
        'justification',''
      );
      finding_hash := public.real_editorial_library_finding_hash(
        version_hash,revision_hash,finding_id,finding_key,1,null,
        finding,p_actor_id,p_created_at
      );
      internal_payload := jsonb_build_object(
        'revisionId',p_revision_id,'findingKey',finding_key,'findingHash',finding_hash
      );
      internal_key := public.real_editorial_library_hash(
        jsonb_build_object('kind','baseline-finding','payload',internal_payload)
      );
      internal_fingerprint := public.real_editorial_library_request_fingerprint(
        'baseline_finding',internal_payload
      );
      insert into public.real_editorial_library_version_findings (
        id,version_id,revision_id,finding_key,sequence,supersedes_finding_id,
        source_finding_type,source_finding_id,origin,disposition,claim_relation,
        support_status,subject_text,diff_anchor,claim_ids,evidence_references,
        source_ids,editor_declaration,justification,finding_hash,
        created_by_actor_id,created_at,operation_key,request_fingerprint,is_baseline
      ) values (
        finding_id,p_version_id,p_revision_id,finding_key,1,null,
        kind,source_id,'inherited','pending',
        case when kind = 'claim' then 'preserved' else 'not_applicable' end,
        case when kind = 'claim' then 'supported' else 'not_applicable' end,
        finding->>'subjectText','{}'::jsonb,finding->'claimIds','[]'::jsonb,'[]'::jsonb,
        finding->>'editorDeclaration','',finding_hash,p_actor_id,p_created_at,
        internal_key,internal_fingerprint,true
      );
    end loop;
  end loop;
end $$;

create function public.real_editorial_library_assert_findings_ready(
  p_version_id uuid,
  p_revision_id uuid
) returns void
language plpgsql stable strict
security definer set search_path = public
as $$
begin
  if exists (
    select 1 from (
      select distinct on (finding_key) *
        from public.real_editorial_library_version_findings
       where version_id = p_version_id and revision_id = p_revision_id
       order by finding_key,sequence desc
    ) effective where is_baseline
  ) then
    raise exception 'FINDINGS_NOT_RECONCILED';
  end if;
  if exists (
    select 1 from (
      select distinct on (finding_key) *
        from public.real_editorial_library_version_findings
       where version_id = p_version_id and revision_id = p_revision_id
       order by finding_key,sequence desc
    ) effective
     where source_finding_type = 'claim'
       and claim_relation in ('new','modified')
       and support_status = 'unsupported'
  ) then
    raise exception 'UNSUPPORTED_CLAIM_BLOCKS_APPROVAL';
  end if;
end $$;

create function public.real_editorial_library_create_version(p_command jsonb)
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
      'versionHash',previous.version_hash,
      'revisionHash',revision_payload->>'revision_hash',
      'traceabilityHash',null,'decisionTargetHash',null
    );
  end if;

  select e.* into entry
    from public.real_editorial_library_entries e
   where e.id = entry_id;
  if not found then raise exception 'LIBRARY_ENTRY_NOT_FOUND'; end if;
  select t.* into transfer
    from public.real_editorial_library_transfers t
   where t.id = entry.transfer_id;
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
      select d.decision_target_hash
        from public.real_editorial_library_version_decisions d
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
  content_hash := public.real_editorial_library_content_hash(
    entry.profile,entry.language,title,content
  );
  version_hash := public.real_editorial_library_hash(jsonb_build_object(
    'schema','investighost-library-version-v1',
    'entryId',entry.id,
    'versionId',version_id,
    'versionNumber',version_number,
    'parentVersionId',case when version_number = 2 then null else previous.id end,
    'parentHash',head_hash,
    'createdBy',actor_id,
    'createdAt',public.real_editorial_library_timestamp(created_at),
    'creationReason',btrim(p_command->>'creationReason')
  ));
  revision_hash := public.real_editorial_library_hash(jsonb_build_object(
    'schema','investighost-library-revision-v1',
    'versionHash',version_hash,
    'revisionId',revision_id,
    'revisionNumber',1,
    'previousRevisionId',null,
    'previousRevisionHash',null,
    'contentHash',content_hash,
    'createdBy',actor_id,
    'createdAt',public.real_editorial_library_timestamp(created_at),
    'reason',btrim(p_command->>'creationReason')
  ));
  revision_payload := jsonb_build_object(
    'versionId',version_id,'revisionId',revision_id,'revisionHash',revision_hash
  );
  revision_operation_key := public.real_editorial_library_hash(
    jsonb_build_object('kind','initial-revision','payload',revision_payload)
  );
  revision_fingerprint := public.real_editorial_library_request_fingerprint(
    'initial_revision',revision_payload
  );

  insert into public.real_editorial_library_versions (
    id,library_entry_id,version_number,parent_version_id,parent_origin_version_hash,
    parent_hash,version_hash,canonicalization_contract,creation_reason,
    created_by_actor_id,created_at,operation_key,request_fingerprint,publication_state
  ) values (
    version_id,entry.id,version_number,
    case when version_number = 2 then null else previous.id end,
    origin_hash,head_hash,version_hash,'investighost-library-c14n-v1',
    btrim(p_command->>'creationReason'),actor_id,created_at,operation_key,
    request_fingerprint,'unpublished'
  );
  insert into public.real_editorial_library_version_revisions (
    id,version_id,revision_number,previous_revision_id,expected_previous_revision_hash,
    title,content,content_schema_contract,canonicalization_contract,content_hash,
    revision_hash,change_summary,created_by_actor_id,created_at,operation_key,
    request_fingerprint
  ) values (
    revision_id,version_id,1,null,null,title,content,'investighost-library-content-v1',
    'investighost-library-c14n-v1',content_hash,revision_hash,
    btrim(p_command->>'creationReason'),actor_id,created_at,revision_operation_key,
    revision_fingerprint
  );
  perform public.real_editorial_library_seed_baseline(
    version_id,revision_id,actor_id,created_at
  );
  return jsonb_build_object(
    'status','ok','operation','create_version','reused',false,
    'versionId',version_id,'revisionId',revision_id,'state','draft',
    'versionHash',version_hash,'revisionHash',revision_hash,
    'traceabilityHash',null,'decisionTargetHash',null
  );
end $$;

-- Cada save es un snapshot completo; la revision previa solo se referencia por CAS.
create function public.real_editorial_library_save_revision(p_command jsonb)
returns jsonb
language plpgsql volatile strict
security definer set search_path = public
as $$
declare
  operation_key text := p_command->>'operationKey';
  request_fingerprint text := p_command->>'requestFingerprint';
  target_version_id uuid := (p_command->>'versionId')::uuid;
  actor_id uuid := (p_command->'actor'->>'actorId')::uuid;
  owner jsonb;
  version public.real_editorial_library_versions%rowtype;
  entry public.real_editorial_library_entries%rowtype;
  previous public.real_editorial_library_version_revisions%rowtype;
  inserted public.real_editorial_library_version_revisions%rowtype;
  state text;
  title text;
  content text;
  content_hash text;
  revision_hash text;
  new_revision_id uuid := gen_random_uuid();
  created_at timestamptz := transaction_timestamp();
begin
  perform public.real_editorial_library_assert_request('save_revision',p_command);
  if actor_id::text <> '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
     or p_command->>'actorRoleSnapshot' <> 'local_owner:edit'
     or p_command->'actor'->>'roleSnapshot' <> p_command->>'actorRoleSnapshot' then
    raise exception 'ACTOR_NOT_AUTHORIZED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('library-operation:' || operation_key,0));
  perform pg_advisory_xact_lock(hashtextextended('library-version:' || target_version_id::text,0));
  owner := public.real_editorial_library_operation_owner(operation_key);
  if owner is not null then
    if owner->>'kind' <> 'revision' or owner->>'fingerprint' <> request_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    select r.* into inserted from public.real_editorial_library_version_revisions r
     where r.id = (owner->>'revisionId')::uuid;
    select v.* into version from public.real_editorial_library_versions v
     where v.id = inserted.version_id;
    return jsonb_build_object(
      'status','ok','operation','save_revision','reused',true,
      'versionId',version.id,'revisionId',inserted.id,'state','draft',
      'versionHash',version.version_hash,'revisionHash',inserted.revision_hash,
      'traceabilityHash',null,'decisionTargetHash',null
    );
  end if;
  select v.* into version from public.real_editorial_library_versions v
   where v.id = target_version_id;
  if not found then raise exception 'VERSION_NOT_FOUND'; end if;
  state := public.real_editorial_library_effective_state(target_version_id);
  if state <> 'draft' or p_command->>'expectedState' <> 'draft' then
    raise exception 'STALE_VERSION_STATE';
  end if;
  select r.* into previous from public.real_editorial_library_version_revisions r
   where r.version_id = target_version_id order by r.revision_number desc limit 1;
  if not found then raise exception 'REVISION_NOT_FOUND'; end if;
  if previous.revision_hash <> p_command->>'expectedPreviousRevisionHash' then
    raise exception 'STALE_REVISION';
  end if;
  if p_command->>'canonicalizationContract' <> 'investighost-library-c14n-v1'
     or p_command->>'contentSchemaContract' <> 'investighost-library-content-v1' then
    raise exception 'HASH_MISMATCH: unsupported contract';
  end if;
  select e.* into entry from public.real_editorial_library_entries e
   where e.id = version.library_entry_id;
  title := public.real_editorial_library_canonical_title(p_command->>'title');
  content := public.real_editorial_library_canonical_content(p_command->>'content');
  content_hash := public.real_editorial_library_content_hash(entry.profile,entry.language,title,content);
  revision_hash := public.real_editorial_library_hash(jsonb_build_object(
    'schema','investighost-library-revision-v1','versionHash',version.version_hash,
    'revisionId',new_revision_id,'revisionNumber',previous.revision_number + 1,
    'previousRevisionId',previous.id,'previousRevisionHash',previous.revision_hash,
    'contentHash',content_hash,'createdBy',actor_id,
    'createdAt',public.real_editorial_library_timestamp(created_at),
    'reason',btrim(p_command->>'changeSummary')
  ));
  insert into public.real_editorial_library_version_revisions (
    id,version_id,revision_number,previous_revision_id,expected_previous_revision_hash,
    title,content,content_schema_contract,canonicalization_contract,content_hash,
    revision_hash,change_summary,created_by_actor_id,created_at,operation_key,request_fingerprint
  ) values (
    new_revision_id,target_version_id,previous.revision_number + 1,previous.id,
    previous.revision_hash,title,content,'investighost-library-content-v1',
    'investighost-library-c14n-v1',content_hash,revision_hash,
    btrim(p_command->>'changeSummary'),actor_id,created_at,operation_key,request_fingerprint
  ) returning * into inserted;
  perform public.real_editorial_library_seed_baseline(
    target_version_id,new_revision_id,actor_id,created_at
  );
  return jsonb_build_object(
    'status','ok','operation','save_revision','reused',false,
    'versionId',version.id,'revisionId',inserted.id,'state','draft',
    'versionHash',version.version_hash,'revisionHash',inserted.revision_hash,
    'traceabilityHash',null,'decisionTargetHash',null
  );
end $$;

create function public.real_editorial_library_traceability_hash_with(
  p_version_id uuid,
  p_revision_id uuid,
  p_finding_key text,
  p_finding_hash text
) returns text
language plpgsql stable strict
security definer set search_path = public
as $$
declare origin_hash text; effective jsonb;
begin
  select parent_origin_version_hash into origin_hash
    from public.real_editorial_library_versions where id = p_version_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'findingKey',finding_key,'findingHash',finding_hash
    ) order by finding_key),'[]'::jsonb)
    into effective
    from (
      select finding_key,finding_hash from (
        select distinct on (finding_key) finding_key,finding_hash
          from public.real_editorial_library_version_findings
         where version_id = p_version_id and revision_id = p_revision_id
           and finding_key <> p_finding_key
         order by finding_key,sequence desc
      ) prior
      union all select p_finding_key,p_finding_hash
    ) combined;
  return public.real_editorial_library_hash(jsonb_build_object(
    'schema','investighost-library-traceability-v1',
    'originVersionHash',origin_hash,'findings',effective
  ));
end $$;

create function public.real_editorial_library_reconcile_finding(p_command jsonb)
returns jsonb
language plpgsql volatile strict
security definer set search_path = public
as $$
#variable_conflict use_variable
declare
  operation_key text := p_command->>'operationKey';
  request_fingerprint text := p_command->>'requestFingerprint';
  version_id uuid := (p_command->>'versionId')::uuid;
  revision_id uuid := (p_command->>'revisionId')::uuid;
  actor_id uuid := (p_command->'actor'->>'actorId')::uuid;
  finding jsonb := p_command->'finding';
  owner jsonb;
  version public.real_editorial_library_versions%rowtype;
  revision public.real_editorial_library_version_revisions%rowtype;
  entry public.real_editorial_library_entries%rowtype;
  prior public.real_editorial_library_version_findings%rowtype;
  inserted public.real_editorial_library_version_findings%rowtype;
  current_trace text;
  result_trace text;
  finding_id uuid := gen_random_uuid();
  finding_hash text;
  sequence integer;
  created_at timestamptz := transaction_timestamp();
  source_values jsonb;
  evidence_ref jsonb;
begin
  perform public.real_editorial_library_assert_request('reconcile_findings',p_command);
  if actor_id::text <> '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
     or p_command->>'actorRoleSnapshot' <> 'local_owner:edit'
     or p_command->'actor'->>'roleSnapshot' <> p_command->>'actorRoleSnapshot' then
    raise exception 'ACTOR_NOT_AUTHORIZED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('library-operation:' || operation_key,0));
  perform pg_advisory_xact_lock(hashtextextended('library-version:' || version_id::text,0));
  owner := public.real_editorial_library_operation_owner(operation_key);
  if owner is not null then
    if owner->>'kind' <> 'finding' or owner->>'fingerprint' <> request_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    select * into inserted from public.real_editorial_library_version_findings
     where id = (owner->>'id')::uuid;
    select * into version from public.real_editorial_library_versions where id = inserted.version_id;
    select * into revision from public.real_editorial_library_version_revisions where id = inserted.revision_id;
    return jsonb_build_object(
      'status','ok','operation','reconcile_findings','reused',true,
      'versionId',version.id,'revisionId',revision.id,'state','draft',
      'versionHash',version.version_hash,'revisionHash',revision.revision_hash,
      'traceabilityHash',inserted.result_traceability_hash,'decisionTargetHash',null
    );
  end if;
  select * into version from public.real_editorial_library_versions v where v.id = version_id;
  if not found then raise exception 'VERSION_NOT_FOUND'; end if;
  if public.real_editorial_library_effective_state(version_id) <> 'draft'
     or p_command->>'expectedState' <> 'draft' then
    raise exception 'STALE_VERSION_STATE';
  end if;
  select * into revision from public.real_editorial_library_version_revisions r
   where r.id = revision_id and r.version_id = version_id;
  if not found then raise exception 'REVISION_NOT_FOUND'; end if;
  if revision.id <> (
    select r.id from public.real_editorial_library_version_revisions r
     where r.version_id = version_id order by r.revision_number desc limit 1
  ) or revision.revision_hash <> p_command->>'expectedRevisionHash' then
    raise exception 'STALE_REVISION';
  end if;
  current_trace := public.real_editorial_library_traceability_hash(version_id,revision_id);
  if current_trace <> p_command->>'expectedTraceabilityHash' then
    raise exception 'HASH_MISMATCH: traceability CAS differs';
  end if;
  select * into entry from public.real_editorial_library_entries
   where id = version.library_entry_id;

  if finding->>'origin' = 'inherited' then
    source_values := case finding->>'sourceFindingType'
      when 'warning' then entry.warnings
      when 'gap' then entry.gaps
      when 'contradiction' then entry.contradictions
      when 'claim' then entry.claims
      else null end;
    if source_values is null or not public.real_editorial_library_origin_contains(
      source_values,finding->>'sourceFindingId'
    ) then raise exception 'ORIGIN_REFERENCE_INVALID: inherited finding'; end if;
  elsif finding->>'origin' <> 'new' then
    raise exception 'ORIGIN_REFERENCE_INVALID: finding origin';
  end if;
  if (finding->>'origin' = 'inherited'
      and not public.real_editorial_library_all_refs_exist(entry.claims,finding->'claimIds'))
     or not public.real_editorial_library_all_refs_exist(entry.sources,finding->'sourceIds') then
    raise exception 'ORIGIN_REFERENCE_INVALID: claim or source reference';
  end if;
  for evidence_ref in select value from jsonb_array_elements(finding->'evidenceReferences') loop
    if evidence_ref->>'kind' not in ('evidence','source') then
      raise exception 'ORIGIN_REFERENCE_INVALID: evidence kind';
    end if;
    if evidence_ref->>'kind' = 'evidence' and not public.real_editorial_library_origin_contains(
      entry.evidence,evidence_ref->>'referenceId'
    ) then raise exception 'ORIGIN_REFERENCE_INVALID: evidence reference'; end if;
    if evidence_ref->>'kind' = 'source' and not public.real_editorial_library_origin_contains(
      entry.sources,evidence_ref->>'referenceId'
    ) then raise exception 'ORIGIN_REFERENCE_INVALID: source evidence reference'; end if;
  end loop;
  if jsonb_typeof(finding->'diffAnchor') <> 'null'
     and finding->'diffAnchor'->>'revisionHash' <> revision.revision_hash then
    raise exception 'STALE_REVISION: diff anchor';
  end if;

  select * into prior from public.real_editorial_library_version_findings f
   where f.version_id = version_id and f.revision_id = revision_id
     and f.finding_key = finding->>'findingKey'
   order by f.sequence desc limit 1;
  sequence := case when found then prior.sequence + 1 else 1 end;
  finding_hash := public.real_editorial_library_finding_hash(
    version.version_hash,revision.revision_hash,finding_id,finding->>'findingKey',sequence,
    case when prior.id is null then null else prior.id end,finding,actor_id,created_at
  );
  result_trace := public.real_editorial_library_traceability_hash_with(
    version_id,revision_id,finding->>'findingKey',finding_hash
  );
  insert into public.real_editorial_library_version_findings (
    id,version_id,revision_id,finding_key,sequence,supersedes_finding_id,
    source_finding_type,source_finding_id,origin,disposition,claim_relation,support_status,
    subject_text,diff_anchor,claim_ids,evidence_references,source_ids,editor_declaration,
    justification,finding_hash,created_by_actor_id,created_at,operation_key,
    request_fingerprint,is_baseline,result_traceability_hash
  ) values (
    finding_id,version_id,revision_id,finding->>'findingKey',sequence,prior.id,
    finding->>'sourceFindingType',finding->>'sourceFindingId',finding->>'origin',
    finding->>'disposition',finding->>'claimRelation',finding->>'supportStatus',
    finding->>'subjectText',case when jsonb_typeof(finding->'diffAnchor') = 'null'
      then '{}'::jsonb else finding->'diffAnchor' end,
    finding->'claimIds',finding->'evidenceReferences',finding->'sourceIds',
    finding->>'editorDeclaration',finding->>'justification',finding_hash,actor_id,created_at,
    operation_key,request_fingerprint,false,result_trace
  ) returning * into inserted;
  return jsonb_build_object(
    'status','ok','operation','reconcile_findings','reused',false,
    'versionId',version.id,'revisionId',revision.id,'state','draft',
    'versionHash',version.version_hash,'revisionHash',revision.revision_hash,
    'traceabilityHash',result_trace,'decisionTargetHash',null
  );
end $$;

create function public.real_editorial_library_submit_for_review(p_command jsonb)
returns jsonb
language plpgsql volatile strict
security definer set search_path = public
as $$
declare
  operation_key text := p_command->>'operationKey';
  request_fingerprint text := p_command->>'requestFingerprint';
  target_version_id uuid := (p_command->>'versionId')::uuid;
  target_revision_id uuid := (p_command->>'revisionId')::uuid;
  actor_id uuid := (p_command->'actor'->>'actorId')::uuid;
  owner jsonb;
  version public.real_editorial_library_versions%rowtype;
  revision public.real_editorial_library_version_revisions%rowtype;
  decision public.real_editorial_library_version_decisions%rowtype;
  trace_hash text;
  target_hash text;
  decision_id uuid := gen_random_uuid();
  created_at timestamptz := transaction_timestamp();
begin
  perform public.real_editorial_library_assert_request('submit_for_review',p_command);
  if actor_id::text <> '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
     or p_command->>'actorRoleSnapshot' <> 'local_owner:submit'
     or p_command->'actor'->>'roleSnapshot' <> p_command->>'actorRoleSnapshot' then
    raise exception 'ACTOR_NOT_AUTHORIZED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('library-operation:' || operation_key,0));
  perform pg_advisory_xact_lock(hashtextextended('library-version:' || target_version_id::text,0));
  owner := public.real_editorial_library_operation_owner(operation_key);
  if owner is not null then
    if owner->>'kind' <> 'decision' or owner->>'fingerprint' <> request_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    select * into decision from public.real_editorial_library_version_decisions
     where id = (owner->>'id')::uuid and decision_type = 'submit_for_review';
    if not found then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    select * into version from public.real_editorial_library_versions v where v.id = decision.version_id;
    return jsonb_build_object(
      'status','ok','operation','submit_for_review','reused',true,
      'versionId',version.id,'revisionId',decision.revision_id,'state','ready_for_review',
      'versionHash',version.version_hash,'revisionHash',decision.revision_hash,
      'traceabilityHash',decision.traceability_hash,
      'decisionTargetHash',decision.decision_target_hash
    );
  end if;
  select * into version from public.real_editorial_library_versions v
   where v.id = target_version_id;
  if not found then raise exception 'VERSION_NOT_FOUND'; end if;
  if public.real_editorial_library_effective_state(target_version_id) <> 'draft'
     or p_command->>'expectedState' <> 'draft' then
    raise exception 'STALE_VERSION_STATE';
  end if;
  select * into revision from public.real_editorial_library_version_revisions r
   where r.id = target_revision_id and r.version_id = target_version_id;
  if not found then raise exception 'REVISION_NOT_FOUND'; end if;
  if revision.id <> (
    select r.id from public.real_editorial_library_version_revisions r
     where r.version_id = target_version_id order by r.revision_number desc limit 1
  ) or revision.revision_hash <> p_command->>'expectedRevisionHash' then
    raise exception 'STALE_REVISION';
  end if;
  trace_hash := public.real_editorial_library_traceability_hash(
    target_version_id,target_revision_id
  );
  if trace_hash <> p_command->>'expectedTraceabilityHash' then
    raise exception 'HASH_MISMATCH: traceability CAS differs';
  end if;
  perform public.real_editorial_library_assert_findings_ready(
    target_version_id,target_revision_id
  );
  target_hash := public.real_editorial_library_decision_target_hash(
    version.version_hash,revision.revision_hash,trace_hash
  );
  insert into public.real_editorial_library_version_decisions (
    id,version_id,revision_id,sequence,decision_type,expected_previous_state,
    resulting_state,revision_hash,traceability_hash,decision_target_hash,aggregate_hash,
    request_fingerprint,reason,actor_id,actor_role_snapshot,affected_finding_keys,
    change_instructions,accepted_risk_finding_keys,separation_of_duties_exception,
    separation_of_duties_reason,publication_count,trawel_connected,automatic_enabled,
    created_at,operation_key
  ) values (
    decision_id,target_version_id,target_revision_id,1,'submit_for_review','draft',
    'ready_for_review',revision.revision_hash,trace_hash,target_hash,target_hash,
    request_fingerprint,btrim(p_command->>'reason'),actor_id,
    p_command->>'actorRoleSnapshot','[]','[]','[]',false,null,0,false,false,
    created_at,operation_key
  ) returning * into decision;
  return jsonb_build_object(
    'status','ok','operation','submit_for_review','reused',false,
    'versionId',version.id,'revisionId',decision.revision_id,'state','ready_for_review',
    'versionHash',version.version_hash,'revisionHash',decision.revision_hash,
    'traceabilityHash',decision.traceability_hash,
    'decisionTargetHash',decision.decision_target_hash
  );
end $$;

create function public.real_editorial_library_decide_version(p_command jsonb)
returns jsonb
language plpgsql volatile strict
security definer set search_path = public
as $$
declare
  operation_key text := p_command->>'operationKey';
  request_fingerprint text := p_command->>'requestFingerprint';
  target_version_id uuid := (p_command->>'versionId')::uuid;
  target_revision_id uuid := (p_command->>'revisionId')::uuid;
  actor_id uuid := (p_command->'actor'->>'actorId')::uuid;
  action text := p_command->>'decisionType';
  owner jsonb;
  version public.real_editorial_library_versions%rowtype;
  revision public.real_editorial_library_version_revisions%rowtype;
  submit public.real_editorial_library_version_decisions%rowtype;
  decision public.real_editorial_library_version_decisions%rowtype;
  state text;
  trace_hash text;
  target_hash text;
  resulting_state text;
  accepted_risks jsonb;
  decision_id uuid := gen_random_uuid();
  created_at timestamptz := transaction_timestamp();
begin
  perform public.real_editorial_library_assert_request('decide_version',p_command);
  if action not in ('approve','request_changes','reject','abandon')
     or actor_id::text <> '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
     or p_command->>'actorRoleSnapshot' <> 'local_owner:' || action
     or p_command->'actor'->>'roleSnapshot' <> p_command->>'actorRoleSnapshot' then
    raise exception 'ACTOR_NOT_AUTHORIZED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('library-operation:' || operation_key,0));
  perform pg_advisory_xact_lock(hashtextextended('library-version:' || target_version_id::text,0));
  owner := public.real_editorial_library_operation_owner(operation_key);
  if owner is not null then
    if owner->>'kind' <> 'decision' or owner->>'fingerprint' <> request_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    select * into decision from public.real_editorial_library_version_decisions d
     where d.id = (owner->>'id')::uuid and d.decision_type = action;
    if not found then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    select * into version from public.real_editorial_library_versions v where v.id = decision.version_id;
    return jsonb_build_object(
      'status','ok','operation','decide_version','reused',true,
      'versionId',version.id,'revisionId',decision.revision_id,
      'state',decision.resulting_state,'versionHash',version.version_hash,
      'revisionHash',decision.revision_hash,'traceabilityHash',decision.traceability_hash,
      'decisionTargetHash',decision.decision_target_hash
    );
  end if;
  select * into version from public.real_editorial_library_versions v
   where v.id = target_version_id;
  if not found then raise exception 'VERSION_NOT_FOUND'; end if;
  state := public.real_editorial_library_effective_state(target_version_id);
  if state <> p_command->>'expectedPreviousState' then
    raise exception 'STALE_VERSION_STATE';
  end if;
  if action = 'abandon' then
    if state <> 'draft' then raise exception 'INVALID_STATE_TRANSITION'; end if;
    select * into revision from public.real_editorial_library_version_revisions r
     where r.id = target_revision_id and r.version_id = target_version_id;
    if not found or revision.id <> (
      select r.id from public.real_editorial_library_version_revisions r
       where r.version_id = target_version_id order by r.revision_number desc limit 1
    ) then raise exception 'STALE_REVISION'; end if;
    trace_hash := public.real_editorial_library_traceability_hash(
      target_version_id,target_revision_id
    );
    target_hash := public.real_editorial_library_decision_target_hash(
      version.version_hash,revision.revision_hash,trace_hash
    );
    resulting_state := 'abandoned';
  else
    if state <> 'ready_for_review' then raise exception 'INVALID_STATE_TRANSITION'; end if;
    select * into submit from public.real_editorial_library_version_decisions d
     where d.version_id = target_version_id and d.decision_type = 'submit_for_review';
    if not found or submit.revision_id <> target_revision_id then
      raise exception 'STALE_REVISION';
    end if;
    select * into revision from public.real_editorial_library_version_revisions r
     where r.id = submit.revision_id;
    trace_hash := submit.traceability_hash;
    target_hash := submit.decision_target_hash;
    resulting_state := case action
      when 'approve' then 'approved'
      when 'request_changes' then 'changes_requested'
      else 'rejected' end;
  end if;
  if target_hash <> p_command->>'expectedDecisionTargetHash' then
    raise exception 'STALE_DECISION_TARGET';
  end if;
  if action = 'approve' then
    perform public.real_editorial_library_assert_findings_ready(
      target_version_id,target_revision_id
    );
    if actor_id = version.created_by_actor_id then
      if coalesce((p_command->>'separationOfDutiesException')::boolean,false) is not true
         or length(btrim(coalesce(p_command->>'separationOfDutiesReason',''))) = 0 then
        raise exception 'ACTOR_NOT_AUTHORIZED: self approval requires audited exception';
      end if;
    elsif coalesce((p_command->>'separationOfDutiesException')::boolean,false) then
      raise exception 'ACTOR_NOT_AUTHORIZED: unnecessary separation exception';
    end if;
    select coalesce(jsonb_agg(finding_key order by finding_key),'[]'::jsonb)
      into accepted_risks from (
        select distinct on (finding_key) finding_key,disposition
          from public.real_editorial_library_version_findings
         where version_id = target_version_id and revision_id = target_revision_id
         order by finding_key,sequence desc
      ) effective where disposition = 'accepted_risk';
    if accepted_risks <> coalesce(p_command->'acceptedRiskFindingKeys','[]'::jsonb) then
      raise exception 'FINDINGS_NOT_RECONCILED: accepted risks differ';
    end if;
  elsif coalesce((p_command->>'separationOfDutiesException')::boolean,false) then
    raise exception 'ACTOR_NOT_AUTHORIZED: exception only applies to approve';
  end if;
  if action = 'request_changes'
     and jsonb_array_length(coalesce(p_command->'affectedFindingKeys','[]'::jsonb)) = 0
     and jsonb_array_length(coalesce(p_command->'changeInstructions','[]'::jsonb)) = 0 then
    raise exception 'FINDINGS_NOT_RECONCILED: request changes needs detail';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(
      coalesce(p_command->'affectedFindingKeys','[]'::jsonb)
    ) requested(finding_key)
     where not exists (
       select 1 from public.real_editorial_library_version_findings f
        where f.version_id = target_version_id
          and f.revision_id = target_revision_id
          and f.finding_key = requested.finding_key
     )
  ) then
    raise exception 'FINDINGS_NOT_RECONCILED: affected finding does not exist';
  end if;
  insert into public.real_editorial_library_version_decisions (
    id,version_id,revision_id,sequence,decision_type,expected_previous_state,
    resulting_state,revision_hash,traceability_hash,decision_target_hash,aggregate_hash,
    request_fingerprint,reason,actor_id,actor_role_snapshot,affected_finding_keys,
    change_instructions,accepted_risk_finding_keys,separation_of_duties_exception,
    separation_of_duties_reason,publication_count,trawel_connected,automatic_enabled,
    created_at,operation_key
  ) values (
    decision_id,target_version_id,target_revision_id,
    case when action = 'abandon' then 1 else 2 end,
    action,state,resulting_state,revision.revision_hash,trace_hash,target_hash,target_hash,
    request_fingerprint,btrim(p_command->>'reason'),actor_id,p_command->>'actorRoleSnapshot',
    coalesce(p_command->'affectedFindingKeys','[]'::jsonb),
    coalesce(p_command->'changeInstructions','[]'::jsonb),
    coalesce(p_command->'acceptedRiskFindingKeys','[]'::jsonb),
    coalesce((p_command->>'separationOfDutiesException')::boolean,false),
    p_command->>'separationOfDutiesReason',0,false,false,created_at,operation_key
  ) returning * into decision;
  return jsonb_build_object(
    'status','ok','operation','decide_version','reused',false,
    'versionId',version.id,'revisionId',decision.revision_id,
    'state',decision.resulting_state,'versionHash',version.version_hash,
    'revisionHash',decision.revision_hash,'traceabilityHash',decision.traceability_hash,
    'decisionTargetHash',decision.decision_target_hash
  );
end $$;

create function public.real_editorial_library_current_approved(p_library_entry_id uuid)
returns jsonb
language plpgsql stable strict
security definer set search_path = public
as $$
declare
  entry public.real_editorial_library_entries%rowtype;
  version public.real_editorial_library_versions%rowtype;
  revision public.real_editorial_library_version_revisions%rowtype;
  origin_content_hash text;
  origin_hash text;
  canonical_title text;
  canonical_content text;
begin
  select * into entry from public.real_editorial_library_entries e
   where e.id = p_library_entry_id;
  if not found then return null; end if;
  select v.* into version from public.real_editorial_library_versions v
   where v.library_entry_id = p_library_entry_id
     and public.real_editorial_library_effective_state(v.id) = 'approved'
   order by v.version_number desc limit 1;
  if found then
    select r.* into revision from public.real_editorial_library_version_revisions r
     join public.real_editorial_library_version_decisions d
       on d.version_id = version.id and d.revision_id = r.id
      and d.decision_type = 'approve'
     limit 1;
    return jsonb_build_object(
      'source','derived','libraryEntryId',entry.id,'versionId',version.id,
      'versionNumber',version.version_number,'revisionId',revision.id,
      'title',revision.title,'content',revision.content,'contentHash',revision.content_hash,
      'versionHash',version.version_hash,'revisionHash',revision.revision_hash,
      'publicationState','unpublished'
    );
  end if;
  canonical_title := public.real_editorial_library_canonical_title(entry.title);
  canonical_content := public.real_editorial_library_canonical_content(entry.content);
  origin_content_hash := public.real_editorial_library_content_hash(
    entry.profile,entry.language,canonical_title,canonical_content
  );
  origin_hash := public.real_editorial_library_origin_hash(entry);
  return jsonb_build_object(
    'source','origin_v1','libraryEntryId',entry.id,'versionId',null,
    'versionNumber',1,'revisionId',null,'title',canonical_title,'content',canonical_content,
    'contentHash',origin_content_hash,'versionHash',origin_hash,'revisionHash',null,
    'publicationState','unpublished'
  );
end $$;

revoke all on function public.real_editorial_library_create_version(jsonb)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_save_revision(jsonb)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_reconcile_finding(jsonb)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_submit_for_review(jsonb)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_decide_version(jsonb)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_current_approved(uuid)
  from public,anon,authenticated;

grant execute on function public.real_editorial_library_create_version(jsonb) to service_role;
grant execute on function public.real_editorial_library_save_revision(jsonb) to service_role;
grant execute on function public.real_editorial_library_reconcile_finding(jsonb) to service_role;
grant execute on function public.real_editorial_library_submit_for_review(jsonb) to service_role;
grant execute on function public.real_editorial_library_decide_version(jsonb) to service_role;
grant execute on function public.real_editorial_library_current_approved(uuid) to service_role;

-- Las escrituras siguen confinadas a los RPC security-definer; no se amplian grants de tabla.
revoke all on function public.real_editorial_library_jcs(jsonb)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_hash(jsonb)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_timestamp(timestamptz)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_normalize_unicode(text)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_canonical_title(text)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_canonical_content(text)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_content_hash(text,text,text,text)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_origin_hash(
  public.real_editorial_library_entries
) from public,anon,authenticated;
revoke all on function public.real_editorial_library_request_fingerprint(text,jsonb)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_assert_request(text,jsonb)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_effective_state(uuid)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_traceability_hash(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_traceability_hash_with(uuid,uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_decision_target_hash(text,text,text)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_operation_owner(text)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_origin_contains(jsonb,text)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_all_refs_exist(jsonb,jsonb)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_finding_hash(
  text,text,uuid,text,integer,uuid,jsonb,uuid,timestamptz
) from public,anon,authenticated;
revoke all on function public.real_editorial_library_seed_baseline(uuid,uuid,uuid,timestamptz)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_assert_findings_ready(uuid,uuid)
  from public,anon,authenticated;
