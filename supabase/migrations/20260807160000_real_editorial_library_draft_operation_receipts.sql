-- BIB-V04: lectura interna para recuperar create/save confirmados por operation_key.
-- No crea estado nuevo ni modifica las transacciones autoritativas BIB-V02.

create function public.real_editorial_library_draft_operation_receipt(
  p_operation_key text
) returns jsonb
language plpgsql stable strict
security definer set search_path = public
as $$
declare
  owner jsonb;
  owner_count integer;
  version public.real_editorial_library_versions%rowtype;
  revision public.real_editorial_library_version_revisions%rowtype;
begin
  if p_operation_key !~ '^[a-f0-9]{64}$' then
    raise exception 'VALIDATION_ERROR: invalid operation key';
  end if;

  select count(*) into owner_count from (
    select id from public.real_editorial_library_versions
     where operation_key = p_operation_key
    union all
    select id from public.real_editorial_library_version_revisions
     where operation_key = p_operation_key
    union all
    select id from public.real_editorial_library_version_findings
     where operation_key = p_operation_key
    union all
    select id from public.real_editorial_library_version_decisions
     where operation_key = p_operation_key
  ) owners;
  if owner_count = 0 then return null; end if;
  if owner_count <> 1 then
    raise exception 'INVALID_VERSION_HISTORY: operation key has multiple owners';
  end if;

  owner := public.real_editorial_library_operation_owner(p_operation_key);
  if owner->>'kind' = 'version' then
    select v.* into version
      from public.real_editorial_library_versions v
     where v.id = (owner->>'versionId')::uuid;
    if not found then
      raise exception 'INVALID_VERSION_HISTORY: create receipt version missing';
    end if;
    perform public.real_editorial_library_assert_valid_history(version.id);
    select r.* into revision
      from public.real_editorial_library_version_revisions r
     where r.version_id = version.id and r.revision_number = 1;
    if not found then
      raise exception 'INVALID_VERSION_HISTORY: create receipt revision missing';
    end if;
    perform public.real_editorial_library_origin_v1(version.library_entry_id);
    return jsonb_build_object(
      'operation','create_draft',
      'operationKey',version.operation_key,
      'requestFingerprint',version.request_fingerprint,
      'actorId',version.created_by_actor_id,
      'libraryEntryId',version.library_entry_id,
      'versionId',version.id,
      'revisionId',revision.id,
      'versionHash',version.version_hash,
      'revisionHash',revision.revision_hash,
      'confirmedAt',version.created_at
    );
  end if;

  if owner->>'kind' = 'revision' then
    select r.* into revision
      from public.real_editorial_library_version_revisions r
     where r.id = (owner->>'revisionId')::uuid;
    if not found or revision.revision_number = 1 then
      raise exception 'INVALID_VERSION_HISTORY: save receipt revision invalid';
    end if;
    select v.* into version
      from public.real_editorial_library_versions v
     where v.id = revision.version_id;
    if not found then
      raise exception 'INVALID_VERSION_HISTORY: save receipt version missing';
    end if;
    perform public.real_editorial_library_assert_valid_history(version.id);
    perform public.real_editorial_library_origin_v1(version.library_entry_id);
    return jsonb_build_object(
      'operation','save_draft',
      'operationKey',revision.operation_key,
      'requestFingerprint',revision.request_fingerprint,
      'actorId',revision.created_by_actor_id,
      'libraryEntryId',version.library_entry_id,
      'versionId',version.id,
      'revisionId',revision.id,
      'versionHash',version.version_hash,
      'revisionHash',revision.revision_hash,
      'confirmedAt',revision.created_at
    );
  end if;

  raise exception 'IDEMPOTENCY_CONFLICT: operation belongs to another domain action';
end $$;

comment on function public.real_editorial_library_draft_operation_receipt(text) is
  'Recupera sin escribir un create/save confirmado; valida historia, hashes y frontera unpublished.';

revoke all on function public.real_editorial_library_draft_operation_receipt(text)
  from public,anon,authenticated;
grant execute on function public.real_editorial_library_draft_operation_receipt(text)
  to service_role;
