-- Batch-created Library candidates are intentionally pre-approval material.
-- They must never surface through the legacy origin-v1 fallback as current
-- approved content before a human decision creates an approved version.
create or replace function public.real_editorial_library_current_approved(p_library_entry_id uuid)
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

  if entry.origin = 'real_editorial_batch_job' then
    select v.* into version from public.real_editorial_library_versions v
     where v.library_entry_id = p_library_entry_id
       and public.real_editorial_library_effective_state(v.id) = 'approved'
     order by v.version_number desc limit 1;
    if not found then return null; end if;
  else
    select v.* into version from public.real_editorial_library_versions v
     where v.library_entry_id = p_library_entry_id
       and public.real_editorial_library_effective_state(v.id) = 'approved'
     order by v.version_number desc limit 1;
  end if;

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

revoke all on function public.real_editorial_library_current_approved(uuid)
  from public, anon, authenticated;
grant execute on function public.real_editorial_library_current_approved(uuid) to service_role;
