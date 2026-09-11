-- Align the Investighost-owned outbox with the deployed Trawel ingress wire contract.
-- No Trawel table, remote project, Library record, or publication state is touched.

alter table public.real_editorial_trawel_deliveries
  add column source_mapping_id text,
  add column canonical_destination_id text;

update public.real_editorial_trawel_deliveries
   set source_mapping_id = destination_mapping_id::text,
       canonical_destination_id = investighost_canonical_destination_id::text
 where source_mapping_id is null;

alter table public.real_editorial_trawel_deliveries
  alter column destination_mapping_id drop not null,
  alter column investighost_canonical_destination_id drop not null,
  alter column source_mapping_id set not null,
  alter column canonical_destination_id set not null;

alter table public.real_editorial_trawel_deliveries
  drop constraint real_editorial_trawel_deliveries_protocol_schema_check,
  add constraint real_editorial_trawel_deliveries_protocol_schema_check
    check (protocol_schema in ('investighost-trawel-editorial-delivery-v2', 'v2'));

create or replace function public.real_editorial_enqueue_trawel_delivery_v2(p_payload jsonb)
returns public.real_editorial_trawel_deliveries
language plpgsql security definer set search_path = public
as $$
declare result public.real_editorial_trawel_deliveries%rowtype;
declare profile text;
declare profile_payload jsonb;
begin
  if p_payload->>'schemaVersion' <> 'v2'
    or p_payload->>'handoffKey' !~ '^[a-f0-9]{64}$'
    or p_payload->>'payloadFingerprint' !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_payload->'profiles') <> 'object'
    or not (p_payload->'profiles' ? 'adventure' and p_payload->'profiles' ? 'student') then
    raise exception 'VALIDATION_ERROR: invalid Trawel ingress V2 payload';
  end if;

  insert into public.real_editorial_trawel_deliveries (
    protocol_schema, handoff_key, payload_fingerprint, source_mapping_id,
    canonical_destination_id, target_snapshot, payload, state
  ) values (
    p_payload->>'schemaVersion', p_payload->>'handoffKey', p_payload->>'payloadFingerprint',
    p_payload->>'mappingId', p_payload->>'canonicalDestinationId',
    p_payload->'profiles'->'adventure'->'metadata'->'investighost'->'target', p_payload, 'PENDING'
  ) on conflict (handoff_key) do nothing returning * into result;

  if result.id is null then
    select * into result from public.real_editorial_trawel_deliveries where handoff_key = p_payload->>'handoffKey';
    if result.payload_fingerprint <> p_payload->>'payloadFingerprint' then
      raise exception 'IDEMPOTENCY_CONFLICT: handoff key has different payload';
    end if;
    return result;
  end if;

  foreach profile in array array['adventure', 'student'] loop
    profile_payload := p_payload->'profiles'->profile;
    insert into public.real_editorial_trawel_delivery_sources(
      delivery_id, profile, library_entry_id, version_hash, content_hash, approval_reference
    ) values (
      result.id, profile,
      (profile_payload->'metadata'->'investighost'->>'libraryEntryId')::uuid,
      profile_payload->'metadata'->'investighost'->'currentApproved'->>'versionHash',
      profile_payload->'metadata'->'investighost'->'currentApproved'->>'contentHash',
      jsonb_build_object('decisionId', profile_payload->'metadata'->'investighost'->'currentApproved'->>'approvalDecisionId')
    );
  end loop;
  return result;
end $$;

revoke all on function public.real_editorial_enqueue_trawel_delivery_v2(jsonb) from public, anon, authenticated;
grant execute on function public.real_editorial_enqueue_trawel_delivery_v2(jsonb) to service_role;
