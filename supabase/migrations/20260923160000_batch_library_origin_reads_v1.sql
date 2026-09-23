-- Batch candidates are pre-approval Library entries and therefore have no
-- pilot transfer. The historical origin reader was still assuming a transfer
-- for every entry, which prevented normal draft-version projections after a
-- BATCH_JOB candidate had been created.

create or replace function public.real_editorial_library_origin_v1(p_library_entry_id uuid)
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
  select e.* into entry from public.real_editorial_library_entries e where e.id = p_library_entry_id;
  if not found then raise exception 'LIBRARY_ENTRY_NOT_FOUND'; end if;
  canonical_title := public.real_editorial_library_canonical_title(entry.title);
  canonical_content := public.real_editorial_library_canonical_content(entry.content);
  content_hash := public.real_editorial_library_content_hash(entry.profile,entry.language,canonical_title,canonical_content);
  origin_hash := public.real_editorial_library_origin_hash(entry);

  if entry.origin = 'real_editorial_batch_job' then
    if entry.publication_state <> 'unpublished' then
      raise exception 'INVALID_VERSION_HISTORY: publication boundary violated';
    end if;
    return jsonb_build_object(
      'libraryEntryId',entry.id,'entryKey',entry.entry_key,'versionNumber',1,
      'profile',entry.profile,'language',entry.language,'title',canonical_title,'content',canonical_content,
      'contentHash',content_hash,'originVersionHash',origin_hash,
      'sourceArtifact',jsonb_build_object('artifactId',entry.source_artifact_id,'kind',entry.source_artifact_kind,'key',entry.source_artifact_key,'version',entry.source_artifact_version,'hash',entry.source_artifact_hash,'createdAt',entry.source_artifact_created_at),
      'finalReviewArtifact',null,'terminalDecisionId',null,'transfer',null,
      'reviewOutcome',entry.review_outcome,'reviewPayload',entry.review_payload,'warnings',entry.warnings,
      'gaps',entry.gaps,'contradictions',entry.contradictions,'claims',entry.claims,'evidence',entry.evidence,'sources',entry.sources,
      'approvalActorId',null,'transferActorId',null,'approvedAt',null,'createdAt',entry.created_at,'publicationState','unpublished'
    );
  end if;

  select t.* into transfer from public.real_editorial_library_transfers t where t.id = entry.transfer_id;
  if not found then raise exception 'INVALID_VERSION_HISTORY: transfer missing'; end if;
  if entry.publication_state <> 'unpublished' or transfer.publication_count <> 0 or transfer.trawel_connected or transfer.automatic_enabled then
    raise exception 'INVALID_VERSION_HISTORY: publication boundary violated';
  end if;
  return jsonb_build_object(
    'libraryEntryId',entry.id,'entryKey',entry.entry_key,'versionNumber',1,'profile',entry.profile,'language',entry.language,
    'title',canonical_title,'content',canonical_content,'contentHash',content_hash,'originVersionHash',origin_hash,
    'sourceArtifact',jsonb_build_object('artifactId',entry.source_artifact_id,'kind',entry.source_artifact_kind,'key',entry.source_artifact_key,'version',entry.source_artifact_version,'hash',entry.source_artifact_hash,'createdAt',entry.source_artifact_created_at),
    'finalReviewArtifact',jsonb_build_object('artifactId',entry.final_review_artifact_id,'kind','final_review','key','final','version',entry.final_review_version,'hash',entry.final_review_hash,'createdAt',entry.final_review_created_at),
    'terminalDecisionId',entry.terminal_decision_id,'transfer',jsonb_build_object('transferId',transfer.id,'snapshotArtifactId',transfer.snapshot_artifact_id,'snapshotHash',transfer.snapshot_hash,'terminalDecisionId',transfer.terminal_decision_id,'transferredAt',transfer.transferred_at,'publicationCount',transfer.publication_count,'trawelConnected',transfer.trawel_connected,'automaticEnabled',transfer.automatic_enabled),
    'reviewOutcome',entry.review_outcome,'reviewPayload',entry.review_payload,'warnings',entry.warnings,'gaps',entry.gaps,'contradictions',entry.contradictions,'claims',entry.claims,'evidence',entry.evidence,'sources',entry.sources,'approvalActorId',entry.approval_actor_id,'transferActorId',entry.transfer_actor_id,'approvedAt',entry.approved_at,'createdAt',entry.created_at,'publicationState','unpublished'
  );
end $$;

grant execute on function public.real_editorial_library_origin_v1(uuid) to service_role;
