-- BIB-V03: proyecciones internas de lectura para historial de versiones.
-- No crea tablas, no añade escrituras y no expone publicación, Trawel, Automatic o UI.

create function public.real_editorial_library_origin_v1(p_library_entry_id uuid)
returns jsonb
language plpgsql stable strict
security definer set search_path = public
as $$
declare
  entry public.real_editorial_library_entries%rowtype;
  transfer public.real_editorial_library_transfers%rowtype;
  canonical_title text;
  canonical_content text;
  content_hash text;
  origin_hash text;
begin
  select e.* into entry
    from public.real_editorial_library_entries e
   where e.id = p_library_entry_id;
  if not found then raise exception 'LIBRARY_ENTRY_NOT_FOUND'; end if;
  select t.* into transfer
    from public.real_editorial_library_transfers t
   where t.id = entry.transfer_id;
  if not found then raise exception 'INVALID_VERSION_HISTORY: transfer missing'; end if;
  if entry.publication_state <> 'unpublished'
     or transfer.publication_count <> 0
     or transfer.trawel_connected
     or transfer.automatic_enabled then
    raise exception 'INVALID_VERSION_HISTORY: publication boundary violated';
  end if;
  canonical_title := public.real_editorial_library_canonical_title(entry.title);
  canonical_content := public.real_editorial_library_canonical_content(entry.content);
  content_hash := public.real_editorial_library_content_hash(
    entry.profile,entry.language,canonical_title,canonical_content
  );
  origin_hash := public.real_editorial_library_origin_hash(entry);
  return jsonb_build_object(
    'libraryEntryId',entry.id,
    'entryKey',entry.entry_key,
    'versionNumber',1,
    'profile',entry.profile,
    'language',entry.language,
    'title',canonical_title,
    'content',canonical_content,
    'contentHash',content_hash,
    'originVersionHash',origin_hash,
    'sourceArtifact',jsonb_build_object(
      'artifactId',entry.source_artifact_id,
      'kind',entry.source_artifact_kind,
      'key',entry.source_artifact_key,
      'version',entry.source_artifact_version,
      'hash',entry.source_artifact_hash,
      'createdAt',entry.source_artifact_created_at
    ),
    'finalReviewArtifact',jsonb_build_object(
      'artifactId',entry.final_review_artifact_id,
      'kind','final_review',
      'key','final',
      'version',entry.final_review_version,
      'hash',entry.final_review_hash,
      'createdAt',entry.final_review_created_at
    ),
    'terminalDecisionId',entry.terminal_decision_id,
    'transfer',jsonb_build_object(
      'transferId',transfer.id,
      'snapshotArtifactId',transfer.snapshot_artifact_id,
      'snapshotHash',transfer.snapshot_hash,
      'terminalDecisionId',transfer.terminal_decision_id,
      'transferredAt',transfer.transferred_at,
      'publicationCount',transfer.publication_count,
      'trawelConnected',transfer.trawel_connected,
      'automaticEnabled',transfer.automatic_enabled
    ),
    'reviewOutcome',entry.review_outcome,
    'reviewPayload',entry.review_payload,
    'warnings',entry.warnings,
    'gaps',entry.gaps,
    'contradictions',entry.contradictions,
    'claims',entry.claims,
    'evidence',entry.evidence,
    'sources',entry.sources,
    'approvalActorId',entry.approval_actor_id,
    'transferActorId',entry.transfer_actor_id,
    'approvedAt',entry.approved_at,
    'createdAt',entry.created_at,
    'publicationState','unpublished'
  );
end $$;

create function public.real_editorial_library_list_finding_history(p_version_id uuid)
returns jsonb
language plpgsql stable strict
security definer set search_path = public
as $$
declare result jsonb;
begin
  perform public.real_editorial_library_assert_valid_history(p_version_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,
    'versionId',f.version_id,
    'revisionId',f.revision_id,
    'findingKey',f.finding_key,
    'sequence',f.sequence,
    'supersedesFindingId',f.supersedes_finding_id,
    'sourceFindingType',f.source_finding_type,
    'sourceFindingId',f.source_finding_id,
    'origin',f.origin,
    'disposition',f.disposition,
    'claimRelation',f.claim_relation,
    'supportStatus',f.support_status,
    'subjectText',f.subject_text,
    'diffAnchor',case when f.diff_anchor = '{}'::jsonb then 'null'::jsonb else f.diff_anchor end,
    'claimIds',f.claim_ids,
    'evidenceReferences',f.evidence_references,
    'sourceIds',f.source_ids,
    'editorDeclaration',f.editor_declaration,
    'justification',f.justification,
    'findingHash',f.finding_hash,
    'createdByActorId',f.created_by_actor_id,
    'createdAt',f.created_at,
    'operationKey',f.operation_key,
    'isBaseline',f.is_baseline,
    'resultTraceabilityHash',f.result_traceability_hash
  ) order by r.revision_number,f.finding_key,f.sequence,f.id),'[]'::jsonb)
  into result
  from public.real_editorial_library_version_findings f
  join public.real_editorial_library_version_revisions r on r.id = f.revision_id
  where f.version_id = p_version_id;
  return result;
end $$;

create function public.real_editorial_library_effective_findings(
  p_version_id uuid,
  p_revision_id uuid default null
) returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare
  revision public.real_editorial_library_version_revisions%rowtype;
  trace_hash text;
  result jsonb;
begin
  if p_version_id is null then raise exception 'VERSION_NOT_FOUND'; end if;
  perform public.real_editorial_library_assert_valid_history(p_version_id);
  if p_revision_id is null then
    select r.* into revision
      from public.real_editorial_library_version_revisions r
     where r.version_id = p_version_id
     order by r.revision_number desc limit 1;
  else
    select r.* into revision
      from public.real_editorial_library_version_revisions r
     where r.id = p_revision_id;
    if not found then raise exception 'REVISION_NOT_FOUND'; end if;
    if revision.version_id <> p_version_id then
      raise exception 'REVISION_VERSION_MISMATCH';
    end if;
  end if;
  if revision.id is null then raise exception 'REVISION_NOT_FOUND'; end if;
  trace_hash := public.real_editorial_library_traceability_hash(p_version_id,revision.id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,
    'versionId',f.version_id,
    'revisionId',f.revision_id,
    'findingKey',f.finding_key,
    'sequence',f.sequence,
    'supersedesFindingId',f.supersedes_finding_id,
    'sourceFindingType',f.source_finding_type,
    'sourceFindingId',f.source_finding_id,
    'origin',f.origin,
    'disposition',f.disposition,
    'claimRelation',f.claim_relation,
    'supportStatus',f.support_status,
    'subjectText',f.subject_text,
    'diffAnchor',case when f.diff_anchor = '{}'::jsonb then 'null'::jsonb else f.diff_anchor end,
    'claimIds',f.claim_ids,
    'evidenceReferences',f.evidence_references,
    'sourceIds',f.source_ids,
    'editorDeclaration',f.editor_declaration,
    'justification',f.justification,
    'findingHash',f.finding_hash,
    'createdByActorId',f.created_by_actor_id,
    'createdAt',f.created_at,
    'operationKey',f.operation_key,
    'isBaseline',f.is_baseline,
    'resultTraceabilityHash',f.result_traceability_hash,
    'effectiveTraceabilityHash',trace_hash
  ) order by f.finding_key),'[]'::jsonb) into result
  from (
    select distinct on (finding_key) *
      from public.real_editorial_library_version_findings
     where version_id = p_version_id and revision_id = revision.id
     order by finding_key,sequence desc,id desc
  ) f;
  return jsonb_build_object(
    'versionId',p_version_id,
    'revisionId',revision.id,
    'traceabilityHash',trace_hash,
    'items',result
  );
end $$;

create function public.real_editorial_library_list_decisions(p_version_id uuid)
returns jsonb
language plpgsql stable strict
security definer set search_path = public
as $$
declare result jsonb;
begin
  perform public.real_editorial_library_assert_valid_history(p_version_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,
    'versionId',d.version_id,
    'revisionId',d.revision_id,
    'sequence',d.sequence,
    'decisionType',d.decision_type,
    'expectedPreviousState',d.expected_previous_state,
    'resultingState',d.resulting_state,
    'revisionHash',d.revision_hash,
    'traceabilityHash',d.traceability_hash,
    'decisionTargetHash',d.decision_target_hash,
    'aggregateHash',d.aggregate_hash,
    'reason',d.reason,
    'actorId',d.actor_id,
    'actorRoleSnapshot',d.actor_role_snapshot,
    'affectedFindingKeys',d.affected_finding_keys,
    'changeInstructions',d.change_instructions,
    'acceptedRiskFindingKeys',d.accepted_risk_finding_keys,
    'separationOfDutiesException',d.separation_of_duties_exception,
    'separationOfDutiesReason',d.separation_of_duties_reason,
    'publicationCount',d.publication_count,
    'trawelConnected',d.trawel_connected,
    'automaticEnabled',d.automatic_enabled,
    'createdAt',d.created_at,
    'operationKey',d.operation_key,
    'isTerminal',d.decision_type <> 'submit_for_review'
  ) order by d.sequence),'[]'::jsonb) into result
  from public.real_editorial_library_version_decisions d
  where d.version_id = p_version_id;
  return result;
end $$;

create function public.real_editorial_library_state_snapshot(p_version_id uuid)
returns jsonb
language plpgsql stable strict
security definer set search_path = public
as $$
declare
  version public.real_editorial_library_versions%rowtype;
  revision public.real_editorial_library_version_revisions%rowtype;
  state text;
  transitions jsonb;
  terminal jsonb;
  aggregate_hash text;
  trace_hash text;
  current_approved jsonb;
begin
  perform public.real_editorial_library_assert_valid_history(p_version_id);
  select v.* into version from public.real_editorial_library_versions v
   where v.id = p_version_id;
  select r.* into revision from public.real_editorial_library_version_revisions r
   where r.version_id = p_version_id order by r.revision_number desc limit 1;
  state := public.real_editorial_library_effective_state(p_version_id);
  transitions := public.real_editorial_library_list_decisions(p_version_id);
  select value into terminal from jsonb_array_elements(transitions) value
   where value->>'decisionType' <> 'submit_for_review'
   order by (value->>'sequence')::integer desc limit 1;
  select d.aggregate_hash into aggregate_hash
    from public.real_editorial_library_version_decisions d
   where d.version_id = p_version_id order by d.sequence desc limit 1;
  trace_hash := public.real_editorial_library_traceability_hash(p_version_id,revision.id);
  current_approved := public.real_editorial_library_current_approved(version.library_entry_id);
  return jsonb_build_object(
    'libraryEntryId',version.library_entry_id,
    'versionId',version.id,
    'versionNumber',version.version_number,
    'initialState','draft',
    'transitions',transitions,
    'terminalDecision',terminal,
    'effectiveState',state,
    'currentRevisionId',revision.id,
    'currentRevisionHash',revision.revision_hash,
    'traceabilityHash',trace_hash,
    'aggregateHash',aggregate_hash,
    'isTerminal',state in ('changes_requested','approved','rejected','abandoned'),
    'isCurrentApproved',coalesce(current_approved->>'versionId','') = version.id::text,
    'publicationState','unpublished'
  );
end $$;

create function public.real_editorial_library_assert_valid_history(p_version_id uuid)
returns void
language plpgsql stable strict
security definer set search_path = public
as $$
declare
  version public.real_editorial_library_versions%rowtype;
  parent public.real_editorial_library_versions%rowtype;
  entry public.real_editorial_library_entries%rowtype;
  revision record;
  prior_revision public.real_editorial_library_version_revisions%rowtype;
  finding record;
  prior_finding public.real_editorial_library_version_findings%rowtype;
  decision record;
  decision_revision public.real_editorial_library_version_revisions%rowtype;
  expected_revision_number integer := 1;
  expected_decision_sequence integer := 1;
  expected_state text := 'draft';
  calculated text;
  parent_terminal_hash text;
begin
  select v.* into version
    from public.real_editorial_library_versions v
   where v.id = p_version_id;
  if not found then raise exception 'VERSION_NOT_FOUND'; end if;
  select e.* into entry
    from public.real_editorial_library_entries e
   where e.id = version.library_entry_id;
  if not found then raise exception 'INVALID_VERSION_HISTORY: entry missing'; end if;

  calculated := public.real_editorial_library_origin_hash(entry);
  if calculated <> version.parent_origin_version_hash then
    raise exception 'HASH_MISMATCH: origin version hash';
  end if;
  if version.version_number = 2 then
    if version.parent_version_id is not null or version.parent_hash <> calculated then
      raise exception 'INVALID_VERSION_HISTORY: invalid v2 parent';
    end if;
  else
    select v.* into parent
      from public.real_editorial_library_versions v
     where v.id = version.parent_version_id
       and v.library_entry_id = version.library_entry_id
       and v.version_number = version.version_number - 1;
    if not found then raise exception 'INVALID_VERSION_HISTORY: parent mismatch'; end if;
    select d.decision_target_hash into parent_terminal_hash
      from public.real_editorial_library_version_decisions d
     where d.version_id = parent.id
       and d.decision_type in ('approve','request_changes','reject','abandon')
     order by d.sequence desc limit 1;
    if parent_terminal_hash is null or parent_terminal_hash <> version.parent_hash then
      raise exception 'INVALID_VERSION_HISTORY: parent head mismatch';
    end if;
  end if;
  calculated := public.real_editorial_library_hash(jsonb_build_object(
    'schema','investighost-library-version-v1',
    'entryId',version.library_entry_id,
    'versionId',version.id,
    'versionNumber',version.version_number,
    'parentVersionId',version.parent_version_id,
    'parentHash',version.parent_hash,
    'createdBy',version.created_by_actor_id,
    'createdAt',public.real_editorial_library_timestamp(version.created_at),
    'creationReason',version.creation_reason
  ));
  if calculated <> version.version_hash then
    raise exception 'HASH_MISMATCH: version hash';
  end if;

  for revision in
    select r.* from public.real_editorial_library_version_revisions r
     where r.version_id = version.id order by r.revision_number
  loop
    if revision.revision_number <> expected_revision_number then
      raise exception 'INVALID_VERSION_HISTORY: revision sequence';
    end if;
    if revision.revision_number = 1 then
      if revision.previous_revision_id is not null
         or revision.expected_previous_revision_hash is not null then
        raise exception 'INVALID_VERSION_HISTORY: initial revision parent';
      end if;
    else
      if prior_revision.id is null
         or revision.previous_revision_id <> prior_revision.id
         or revision.expected_previous_revision_hash <> prior_revision.revision_hash then
        raise exception 'INVALID_VERSION_HISTORY: revision chain';
      end if;
    end if;
    calculated := public.real_editorial_library_content_hash(
      entry.profile,entry.language,revision.title,revision.content
    );
    if calculated <> revision.content_hash then
      raise exception 'HASH_MISMATCH: revision content hash';
    end if;
    calculated := public.real_editorial_library_hash(jsonb_build_object(
      'schema','investighost-library-revision-v1',
      'versionHash',version.version_hash,
      'revisionId',revision.id,
      'revisionNumber',revision.revision_number,
      'previousRevisionId',revision.previous_revision_id,
      'previousRevisionHash',revision.expected_previous_revision_hash,
      'contentHash',revision.content_hash,
      'createdBy',revision.created_by_actor_id,
      'createdAt',public.real_editorial_library_timestamp(revision.created_at),
      'reason',revision.change_summary
    ));
    if calculated <> revision.revision_hash then
      raise exception 'HASH_MISMATCH: revision hash';
    end if;
    prior_revision := revision;
    expected_revision_number := expected_revision_number + 1;
  end loop;
  if expected_revision_number = 1 then
    raise exception 'INVALID_VERSION_HISTORY: version without revision';
  end if;

  for finding in
    select f.* from public.real_editorial_library_version_findings f
     join public.real_editorial_library_version_revisions r on r.id = f.revision_id
     where f.version_id = version.id
     order by r.revision_number,f.finding_key,f.sequence
  loop
    if finding.sequence = 1 then
      if finding.supersedes_finding_id is not null then
        raise exception 'INVALID_VERSION_HISTORY: initial finding parent';
      end if;
    else
      select f.* into prior_finding
        from public.real_editorial_library_version_findings f
       where f.version_id = finding.version_id
         and f.revision_id = finding.revision_id
         and f.finding_key = finding.finding_key
         and f.sequence = finding.sequence - 1;
      if not found or finding.supersedes_finding_id <> prior_finding.id then
        raise exception 'INVALID_VERSION_HISTORY: finding chain';
      end if;
    end if;
    select r.* into decision_revision
      from public.real_editorial_library_version_revisions r
     where r.id = finding.revision_id and r.version_id = version.id;
    if not found then raise exception 'INVALID_VERSION_HISTORY: finding revision'; end if;
    calculated := public.real_editorial_library_finding_hash(
      version.version_hash,decision_revision.revision_hash,finding.id,
      finding.finding_key,finding.sequence,finding.supersedes_finding_id,
      jsonb_build_object(
        'sourceFindingType',finding.source_finding_type,
        'sourceFindingId',finding.source_finding_id,
        'origin',finding.origin,
        'disposition',finding.disposition,
        'claimRelation',finding.claim_relation,
        'supportStatus',finding.support_status,
        'subjectText',finding.subject_text,
        'diffAnchor',case when finding.diff_anchor = '{}'::jsonb
          then 'null'::jsonb else finding.diff_anchor end,
        'claimIds',finding.claim_ids,
        'evidenceReferences',finding.evidence_references,
        'sourceIds',finding.source_ids,
        'editorDeclaration',finding.editor_declaration,
        'justification',finding.justification
      ),finding.created_by_actor_id,finding.created_at
    );
    if calculated <> finding.finding_hash then
      raise exception 'HASH_MISMATCH: finding hash';
    end if;
  end loop;

  for decision in
    select d.* from public.real_editorial_library_version_decisions d
     where d.version_id = version.id order by d.sequence
  loop
    if decision.sequence <> expected_decision_sequence
       or decision.expected_previous_state <> expected_state then
      raise exception 'INVALID_DECISION_HISTORY: decision chain';
    end if;
    select r.* into decision_revision
      from public.real_editorial_library_version_revisions r
     where r.id = decision.revision_id and r.version_id = version.id;
    if not found then raise exception 'INVALID_DECISION_HISTORY: revision target'; end if;
    if decision_revision.revision_hash <> decision.revision_hash then
      raise exception 'HASH_MISMATCH: decision revision hash';
    end if;
    calculated := public.real_editorial_library_traceability_hash(
      version.id,decision.revision_id
    );
    if calculated <> decision.traceability_hash then
      raise exception 'HASH_MISMATCH: decision traceability hash';
    end if;
    calculated := public.real_editorial_library_decision_target_hash(
      version.version_hash,decision.revision_hash,decision.traceability_hash
    );
    if calculated <> decision.decision_target_hash
       or calculated <> decision.aggregate_hash then
      raise exception 'HASH_MISMATCH: decision target hash';
    end if;
    expected_state := decision.resulting_state;
    expected_decision_sequence := expected_decision_sequence + 1;
  end loop;
end $$;

create function public.real_editorial_library_list_revisions(p_version_id uuid)
returns jsonb
language plpgsql stable strict
security definer set search_path = public
as $$
declare result jsonb;
begin
  perform public.real_editorial_library_assert_valid_history(p_version_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'versionId',r.version_id,
    'revisionNumber',r.revision_number,
    'previousRevisionId',r.previous_revision_id,
    'expectedPreviousRevisionHash',r.expected_previous_revision_hash,
    'title',r.title,
    'content',r.content,
    'contentSchemaContract',r.content_schema_contract,
    'canonicalizationContract',r.canonicalization_contract,
    'contentHash',r.content_hash,
    'revisionHash',r.revision_hash,
    'changeSummary',r.change_summary,
    'createdByActorId',r.created_by_actor_id,
    'createdAt',r.created_at,
    'operationKey',r.operation_key
  ) order by r.revision_number),'[]'::jsonb) into result
  from public.real_editorial_library_version_revisions r
  where r.version_id = p_version_id;
  return result;
end $$;

create function public.real_editorial_library_version_revision(
  p_version_id uuid,
  p_revision_id uuid
) returns jsonb
language plpgsql stable strict
security definer set search_path = public
as $$
declare revision public.real_editorial_library_version_revisions%rowtype;
begin
  perform public.real_editorial_library_assert_valid_history(p_version_id);
  select r.* into revision
    from public.real_editorial_library_version_revisions r
   where r.id = p_revision_id;
  if not found then raise exception 'REVISION_NOT_FOUND'; end if;
  if revision.version_id <> p_version_id then
    raise exception 'REVISION_VERSION_MISMATCH';
  end if;
  return jsonb_build_object(
    'id',revision.id,
    'versionId',revision.version_id,
    'revisionNumber',revision.revision_number,
    'previousRevisionId',revision.previous_revision_id,
    'expectedPreviousRevisionHash',revision.expected_previous_revision_hash,
    'title',revision.title,
    'content',revision.content,
    'contentSchemaContract',revision.content_schema_contract,
    'canonicalizationContract',revision.canonicalization_contract,
    'contentHash',revision.content_hash,
    'revisionHash',revision.revision_hash,
    'changeSummary',revision.change_summary,
    'createdByActorId',revision.created_by_actor_id,
    'createdAt',revision.created_at,
    'operationKey',revision.operation_key
  );
end $$;

create function public.real_editorial_library_current_approved_detail(
  p_library_entry_id uuid
) returns jsonb
language plpgsql stable strict
security definer set search_path = public
as $$
declare
  origin jsonb;
  current_content jsonb;
  approval public.real_editorial_library_version_decisions%rowtype;
begin
  origin := public.real_editorial_library_origin_v1(p_library_entry_id);
  current_content := public.real_editorial_library_current_approved(p_library_entry_id);
  if current_content is null then raise exception 'LIBRARY_ENTRY_NOT_FOUND'; end if;
  if current_content->>'source' = 'derived' then
    perform public.real_editorial_library_assert_valid_history(
      (current_content->>'versionId')::uuid
    );
    select d.* into approval
      from public.real_editorial_library_version_decisions d
     where d.version_id = (current_content->>'versionId')::uuid
       and d.decision_type = 'approve'
     order by d.sequence desc limit 1;
    if not found then raise exception 'INVALID_DECISION_HISTORY: approval missing'; end if;
  end if;
  return current_content || jsonb_build_object(
    'profile',origin->>'profile',
    'language',origin->>'language',
    'approvalDecisionId',case when approval.id is null then null else to_jsonb(approval.id) end,
    'approvedAt',case when approval.id is null
      then origin->'approvedAt' else to_jsonb(approval.created_at) end,
    'originV1',origin
  );
end $$;

create function public.real_editorial_library_list_versions(p_library_entry_id uuid)
returns jsonb
language plpgsql stable strict
security definer set search_path = public
as $$
declare
  entry public.real_editorial_library_entries%rowtype;
  version public.real_editorial_library_versions%rowtype;
  revision public.real_editorial_library_version_revisions%rowtype;
  state_snapshot jsonb;
  terminal jsonb;
  current_content jsonb;
  current_version_id uuid;
  finding_count integer;
  revision_count integer;
  display_state text;
  result jsonb := '[]'::jsonb;
begin
  select e.* into entry from public.real_editorial_library_entries e
   where e.id = p_library_entry_id;
  if not found then raise exception 'LIBRARY_ENTRY_NOT_FOUND'; end if;
  current_content := public.real_editorial_library_current_approved(p_library_entry_id);
  current_version_id := nullif(current_content->>'versionId','')::uuid;
  for version in
    select v.* from public.real_editorial_library_versions v
     where v.library_entry_id = p_library_entry_id
     order by v.version_number,v.id
  loop
    perform public.real_editorial_library_assert_valid_history(version.id);
    select r.* into revision
      from public.real_editorial_library_version_revisions r
     where r.version_id = version.id order by r.revision_number desc limit 1;
    select count(*) into revision_count
      from public.real_editorial_library_version_revisions r
     where r.version_id = version.id;
    select count(*) into finding_count from (
      select distinct on (f.finding_key) f.id
        from public.real_editorial_library_version_findings f
       where f.version_id = version.id and f.revision_id = revision.id
       order by f.finding_key,f.sequence desc,f.id desc
    ) effective;
    state_snapshot := public.real_editorial_library_state_snapshot(version.id);
    terminal := state_snapshot->'terminalDecision';
    display_state := case
      when current_version_id = version.id then 'approved_current'
      when state_snapshot->>'effectiveState' = 'approved' then 'superseded'
      else state_snapshot->>'effectiveState'
    end;
    result := result || jsonb_build_array(jsonb_build_object(
      'versionId',version.id,
      'libraryEntryId',version.library_entry_id,
      'versionNumber',version.version_number,
      'parentVersionId',version.parent_version_id,
      'parentReference',case when version.version_number = 2 then 'origin_v1' else 'derived' end,
      'parentHash',version.parent_hash,
      'originVersionHash',version.parent_origin_version_hash,
      'versionHash',version.version_hash,
      'createdByActorId',version.created_by_actor_id,
      'createdAt',version.created_at,
      'effectiveState',state_snapshot->>'effectiveState',
      'displayState',display_state,
      'currentRevisionId',revision.id,
      'currentRevisionNumber',revision.revision_number,
      'currentRevisionHash',revision.revision_hash,
      'revisionCount',revision_count,
      'effectiveFindingCount',finding_count,
      'terminalDecision',terminal,
      'isSuperseded',display_state = 'superseded',
      'isCurrentApproved',coalesce(current_version_id = version.id,false),
      'publicationState','unpublished'
    ));
  end loop;
  return result;
end $$;

create function public.real_editorial_library_versioning_summary(
  p_library_entry_id uuid
) returns jsonb
language plpgsql stable strict
security definer set search_path = public
as $$
declare
  origin jsonb;
  versions jsonb;
  latest jsonb;
  open_version jsonb;
  current_content jsonb;
begin
  origin := public.real_editorial_library_origin_v1(p_library_entry_id);
  versions := public.real_editorial_library_list_versions(p_library_entry_id);
  current_content := public.real_editorial_library_current_approved_detail(p_library_entry_id);
  if jsonb_array_length(versions) > 0 then
    latest := versions->(jsonb_array_length(versions) - 1);
    select value into open_version
      from jsonb_array_elements(versions) value
     where value->>'effectiveState' in ('draft','ready_for_review')
     order by (value->>'versionNumber')::integer desc limit 1;
  end if;
  return jsonb_build_object(
    'libraryEntryId',p_library_entry_id,
    'profile',origin->>'profile',
    'originalVersion',origin,
    'derivedVersionCount',jsonb_array_length(versions),
    'openVersion',open_version,
    'currentApproved',current_content,
    'latestVersion',latest,
    'latestEffectiveState',coalesce(latest->>'effectiveState','origin_approved'),
    'publication',jsonb_build_object(
      'entryState','unpublished',
      'currentApprovedState','unpublished',
      'publicationCount',0,
      'trawelConnected',false,
      'automaticEnabled',false
    )
  );
end $$;

create function public.real_editorial_library_version_detail(p_version_id uuid)
returns jsonb
language plpgsql stable strict
security definer set search_path = public
as $$
declare
  version public.real_editorial_library_versions%rowtype;
  entry public.real_editorial_library_entries%rowtype;
  versions jsonb;
  item jsonb;
  revisions jsonb;
  current_revision jsonb;
  state_snapshot jsonb;
  effective_findings jsonb;
  finding_history jsonb;
  decisions jsonb;
  terminal jsonb;
  parent_number integer;
  state text;
begin
  perform public.real_editorial_library_assert_valid_history(p_version_id);
  select v.* into version from public.real_editorial_library_versions v
   where v.id = p_version_id;
  select e.* into entry from public.real_editorial_library_entries e
   where e.id = version.library_entry_id;
  versions := public.real_editorial_library_list_versions(version.library_entry_id);
  select value into item from jsonb_array_elements(versions) value
   where value->>'versionId' = version.id::text;
  if item is null then raise exception 'INVALID_VERSION_HISTORY: list projection missing'; end if;
  revisions := public.real_editorial_library_list_revisions(version.id);
  current_revision := revisions->(jsonb_array_length(revisions) - 1);
  state_snapshot := public.real_editorial_library_state_snapshot(version.id);
  effective_findings := public.real_editorial_library_effective_findings(
    version.id,(current_revision->>'id')::uuid
  );
  finding_history := public.real_editorial_library_list_finding_history(version.id);
  decisions := public.real_editorial_library_list_decisions(version.id);
  terminal := state_snapshot->'terminalDecision';
  state := state_snapshot->>'effectiveState';
  if version.parent_version_id is not null then
    select v.version_number into parent_number
      from public.real_editorial_library_versions v
     where v.id = version.parent_version_id;
  end if;
  return jsonb_build_object(
    'version',item,
    'profile',entry.profile,
    'originV1',public.real_editorial_library_origin_v1(entry.id),
    'parent',jsonb_build_object(
      'source',case when version.parent_version_id is null then 'origin_v1' else 'derived' end,
      'versionId',version.parent_version_id,
      'versionNumber',coalesce(parent_number,1),
      'hash',version.parent_hash
    ),
    'revisions',revisions,
    'currentRevision',current_revision,
    'state',state_snapshot,
    'effectiveFindings',effective_findings,
    'findingHistory',finding_history,
    'decisions',decisions,
    'aggregateHash',state_snapshot->'aggregateHash',
    'acceptedRiskFindingKeys',coalesce(terminal->'acceptedRiskFindingKeys','[]'::jsonb),
    'separationOfDuties',case when terminal is null or terminal = 'null'::jsonb
      then null else jsonb_build_object(
      'exception',(terminal->>'separationOfDutiesException')::boolean,
      'reason',terminal->'separationOfDutiesReason',
      'actorRoleSnapshot',terminal->>'actorRoleSnapshot'
    ) end,
    'currentApproved',public.real_editorial_library_current_approved_detail(entry.id),
    'flags',jsonb_build_object(
      'editable',state = 'draft',
      'canSaveRevision',state = 'draft',
      'canReconcileFindings',state = 'draft',
      'canSubmitForReview',state = 'draft',
      'canDecide',state = 'ready_for_review',
      'canCreateNextVersion',state in ('changes_requested','approved','rejected','abandoned')
    ),
    'publicationState','unpublished'
  );
end $$;

create function public.real_editorial_library_timeline(p_library_entry_id uuid)
returns jsonb
language plpgsql stable strict
security definer set search_path = public
as $$
declare result jsonb;
begin
  perform public.real_editorial_library_origin_v1(p_library_entry_id);
  perform public.real_editorial_library_assert_valid_history(v.id)
    from public.real_editorial_library_versions v
   where v.library_entry_id = p_library_entry_id;
  with projected as (
    select
      'version_created'::text as event_type,
      v.created_at as occurred_at,
      v.id as version_id,
      v.version_number,
      null::uuid as revision_id,
      v.created_by_actor_id as actor_id,
      v.version_hash as target_hash,
      'Versión derivada creada'::text as description,
      'real_editorial_library_versions'::text as source_table,
      v.id as source_id,
      10 as sort_order,
      0 as source_sequence
    from public.real_editorial_library_versions v
    where v.library_entry_id = p_library_entry_id
    union all
    select
      'revision_saved',r.created_at,v.id,v.version_number,r.id,r.created_by_actor_id,
      r.revision_hash,
      case when r.revision_number = 1 then 'Revisión inicial creada'
        else 'Revisión editorial guardada' end,
      'real_editorial_library_version_revisions',r.id,20,r.revision_number
    from public.real_editorial_library_version_revisions r
    join public.real_editorial_library_versions v on v.id = r.version_id
    where v.library_entry_id = p_library_entry_id
    union all
    select
      'finding_reconciled',f.created_at,v.id,v.version_number,f.revision_id,
      f.created_by_actor_id,f.finding_hash,'Finding reconciliado: ' || f.finding_key,
      'real_editorial_library_version_findings',f.id,30,f.sequence
    from public.real_editorial_library_version_findings f
    join public.real_editorial_library_versions v on v.id = f.version_id
    where v.library_entry_id = p_library_entry_id and not f.is_baseline
    union all
    select
      d.decision_type,d.created_at,v.id,v.version_number,d.revision_id,d.actor_id,
      d.decision_target_hash,
      case d.decision_type
        when 'submit_for_review' then 'Versión enviada a revisión'
        when 'approve' then 'Versión aprobada internamente'
        when 'request_changes' then 'Cambios solicitados'
        when 'reject' then 'Versión rechazada'
        else 'Versión abandonada' end,
      'real_editorial_library_version_decisions',d.id,40,d.sequence
    from public.real_editorial_library_version_decisions d
    join public.real_editorial_library_versions v on v.id = d.version_id
    where v.library_entry_id = p_library_entry_id
  ), ordered as (
    select row_number() over (
      order by occurred_at,version_number,sort_order,source_sequence,source_id
    ) as ordinal,* from projected
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'ordinal',ordinal,
    'eventType',event_type,
    'timestamp',occurred_at,
    'versionId',version_id,
    'versionNumber',version_number,
    'revisionId',revision_id,
    'actorId',actor_id,
    'targetHash',target_hash,
    'description',description,
    'source',jsonb_build_object('table',source_table,'rowId',source_id)
  ) order by ordinal),'[]'::jsonb) into result from ordered;
  return jsonb_build_object(
    'libraryEntryId',p_library_entry_id,
    'events',result,
    'publicationState','unpublished'
  );
end $$;

comment on function public.real_editorial_library_effective_findings(uuid,uuid) is
  'Proyecta por finding_key la fila de mayor sequence; los empates imposibles por constraint se resuelven por id.';
comment on function public.real_editorial_library_timeline(uuid) is
  'Orden estable: timestamp, version_number, clase de evento, secuencia de origen y row id.';

revoke all on function public.real_editorial_library_origin_v1(uuid)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_assert_valid_history(uuid)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_list_revisions(uuid)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_version_revision(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_list_finding_history(uuid)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_effective_findings(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_list_decisions(uuid)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_state_snapshot(uuid)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_current_approved_detail(uuid)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_list_versions(uuid)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_versioning_summary(uuid)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_version_detail(uuid)
  from public,anon,authenticated;
revoke all on function public.real_editorial_library_timeline(uuid)
  from public,anon,authenticated;

grant execute on function public.real_editorial_library_origin_v1(uuid) to service_role;
grant execute on function public.real_editorial_library_list_revisions(uuid) to service_role;
grant execute on function public.real_editorial_library_version_revision(uuid,uuid) to service_role;
grant execute on function public.real_editorial_library_list_finding_history(uuid) to service_role;
grant execute on function public.real_editorial_library_effective_findings(uuid,uuid) to service_role;
grant execute on function public.real_editorial_library_list_decisions(uuid) to service_role;
grant execute on function public.real_editorial_library_state_snapshot(uuid) to service_role;
grant execute on function public.real_editorial_library_current_approved_detail(uuid) to service_role;
grant execute on function public.real_editorial_library_list_versions(uuid) to service_role;
grant execute on function public.real_editorial_library_versioning_summary(uuid) to service_role;
grant execute on function public.real_editorial_library_version_detail(uuid) to service_role;
grant execute on function public.real_editorial_library_timeline(uuid) to service_role;
