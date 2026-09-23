-- A batch candidate has no current approved publication until a human approves
-- one of its derived revisions. Make the existing read projections represent
-- that fact explicitly instead of treating the candidate as an origin fallback.
create or replace function public.real_editorial_library_current_approved_detail(
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
  if current_content is null then return null; end if;
  if current_content->>'source' = 'derived' then
    perform public.real_editorial_library_assert_valid_history((current_content->>'versionId')::uuid);
    select d.* into approval from public.real_editorial_library_version_decisions d
     where d.version_id = (current_content->>'versionId')::uuid
       and d.decision_type = 'approve'
     order by d.sequence desc limit 1;
    if not found then raise exception 'INVALID_DECISION_HISTORY: approval missing'; end if;
  end if;
  return current_content || jsonb_build_object(
    'profile',origin->>'profile','language',origin->>'language',
    'approvalDecisionId',case when approval.id is null then null else to_jsonb(approval.id) end,
    'approvedAt',case when approval.id is null then origin->'approvedAt' else to_jsonb(approval.created_at) end,
    'originV1',origin
  );
end $$;

create or replace function public.real_editorial_library_versioning_summary(
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
    select value into open_version from jsonb_array_elements(versions) value
     where value->>'effectiveState' in ('draft','ready_for_review')
     order by (value->>'versionNumber')::integer desc limit 1;
  end if;
  return jsonb_build_object(
    'libraryEntryId',p_library_entry_id,'profile',origin->>'profile','originalVersion',origin,
    'derivedVersionCount',jsonb_array_length(versions),'openVersion',open_version,
    'currentApproved',current_content,'latestVersion',latest,
    'latestEffectiveState',coalesce(latest->>'effectiveState',case when current_content is null then 'candidate' else 'origin_approved' end),
    'publication',jsonb_build_object(
      'entryState','unpublished','currentApprovedState',case when current_content is null then null else 'unpublished' end,
      'publicationCount',0,'trawelConnected',false,'automaticEnabled',false
    )
  );
end $$;

create or replace function public.real_editorial_library_version_detail(p_version_id uuid)
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
  select v.* into version from public.real_editorial_library_versions v where v.id = p_version_id;
  select e.* into entry from public.real_editorial_library_entries e where e.id = version.library_entry_id;
  versions := public.real_editorial_library_list_versions(version.library_entry_id);
  select value into item from jsonb_array_elements(versions) value where value->>'versionId' = version.id::text;
  if item is null then raise exception 'INVALID_VERSION_HISTORY: list projection missing'; end if;
  revisions := public.real_editorial_library_list_revisions(version.id);
  current_revision := revisions->(jsonb_array_length(revisions) - 1);
  state_snapshot := public.real_editorial_library_state_snapshot(version.id);
  effective_findings := public.real_editorial_library_effective_findings(version.id,(current_revision->>'id')::uuid);
  finding_history := public.real_editorial_library_list_finding_history(version.id);
  decisions := public.real_editorial_library_list_decisions(version.id);
  terminal := state_snapshot->'terminalDecision';
  state := state_snapshot->>'effectiveState';
  if version.parent_version_id is not null then
    select v.version_number into parent_number from public.real_editorial_library_versions v where v.id = version.parent_version_id;
  end if;
  return jsonb_build_object(
    'version',item,'profile',entry.profile,'originV1',public.real_editorial_library_origin_v1(entry.id),
    'parent',jsonb_build_object('source',case when version.parent_version_id is null then 'origin_v1' else 'derived' end,
      'versionId',version.parent_version_id,'versionNumber',coalesce(parent_number,1),'hash',version.parent_hash),
    'revisions',revisions,'currentRevision',current_revision,'state',state_snapshot,
    'effectiveFindings',effective_findings,'findingHistory',finding_history,'decisions',decisions,
    'aggregateHash',state_snapshot->'aggregateHash',
    'acceptedRiskFindingKeys',coalesce(terminal->'acceptedRiskFindingKeys','[]'::jsonb),
    'separationOfDuties',case when terminal is null or terminal = 'null'::jsonb then null else jsonb_build_object(
      'exception',(terminal->>'separationOfDutiesException')::boolean,'reason',terminal->'separationOfDutiesReason',
      'actorRoleSnapshot',terminal->>'actorRoleSnapshot') end,
    'currentApproved',public.real_editorial_library_current_approved_detail(entry.id),
    'flags',jsonb_build_object('editable',state = 'draft','canSaveRevision',state = 'draft',
      'canReconcileFindings',state = 'draft','canSubmitForReview',state = 'draft',
      'canDecide',state = 'ready_for_review','canCreateNextVersion',state in ('changes_requested','approved','rejected','abandoned')),
    'publicationState','unpublished'
  );
end $$;

revoke all on function public.real_editorial_library_current_approved_detail(uuid) from public, anon, authenticated;
revoke all on function public.real_editorial_library_versioning_summary(uuid) from public, anon, authenticated;
revoke all on function public.real_editorial_library_version_detail(uuid) from public, anon, authenticated;
grant execute on function public.real_editorial_library_current_approved_detail(uuid) to service_role;
grant execute on function public.real_editorial_library_versioning_summary(uuid) to service_role;
grant execute on function public.real_editorial_library_version_detail(uuid) to service_role;
