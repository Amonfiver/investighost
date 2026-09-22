-- Wikimedia Commons Discovery V1. Candidates are internal evidence only and
-- cannot be projected as public Visual Bridge assets without a later workflow.

create table public.real_editorial_visual_candidates (
  id uuid primary key default gen_random_uuid(),
  canonical_destination_id uuid not null,
  provider text not null check (provider in ('wikimedia_commons')),
  provider_asset_id text not null,
  canonical_title text not null,
  source_page_url text not null,
  original_media_url text,
  mime_type text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  byte_size bigint check (byte_size is null or byte_size > 0),
  creator text,
  uploader text,
  source_name text not null check (source_name = 'Wikimedia Commons'),
  license_short_name text,
  license_url text,
  usage_terms text,
  attribution_text text,
  description text,
  requested_category text not null check (requested_category in ('landmark', 'landscape', 'culture', 'food', 'people-life', 'atmosphere', 'detail')),
  requested_role text not null check (requested_role in ('hero', 'highlight', 'gallery')),
  discovered_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  provider_metadata_hash text not null check (provider_metadata_hash ~ '^[a-f0-9]{64}$'),
  normalized_license text not null check (normalized_license in ('PUBLIC_DOMAIN', 'CC0', 'CC_BY_4_0', 'CC_BY_3_0', 'CC_BY_SA', 'CC_BY_ND', 'CC_BY_NC', 'ALL_RIGHTS_RESERVED', 'CUSTOM', 'UNKNOWN')),
  state text not null check (state in ('DISCOVERED', 'ELIGIBLE', 'REFERENCE_ONLY', 'REJECTED')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_destination_id, provider, provider_asset_id),
  check (state <> 'ELIGIBLE' or (creator is not null and license_short_name is not null and license_url is not null and attribution_text is not null and original_media_url is not null)),
  check (state <> 'REJECTED' or rejection_reason is not null)
);

create index real_editorial_visual_candidates_destination_state_idx
  on public.real_editorial_visual_candidates (canonical_destination_id, state, last_seen_at desc);

create or replace function public.real_editorial_upsert_visual_candidate(p_candidate jsonb)
returns public.real_editorial_visual_candidates
language plpgsql security definer set search_path = public
as $$
declare result public.real_editorial_visual_candidates%rowtype;
begin
  if p_candidate->>'provider' <> 'wikimedia_commons'
    or coalesce(nullif(trim(p_candidate->>'destinationId'), ''), '') = ''
    or coalesce(nullif(trim(p_candidate->>'providerAssetId'), ''), '') = ''
    or coalesce(nullif(trim(p_candidate->>'canonicalTitle'), ''), '') = ''
    or coalesce(nullif(trim(p_candidate->>'sourcePageUrl'), ''), '') = ''
    or p_candidate->>'providerMetadataHash' !~ '^[a-f0-9]{64}$' then
    raise exception 'VALIDATION_ERROR: invalid visual candidate';
  end if;

  insert into public.real_editorial_visual_candidates (
    id, canonical_destination_id, provider, provider_asset_id, canonical_title, source_page_url, original_media_url,
    mime_type, width, height, byte_size, creator, uploader, source_name, license_short_name, license_url,
    usage_terms, attribution_text, description, requested_category, requested_role, discovered_at,
    provider_metadata_hash, normalized_license, state, rejection_reason
  ) values (
    (p_candidate->>'candidateId')::uuid, (p_candidate->>'destinationId')::uuid, p_candidate->>'provider', p_candidate->>'providerAssetId',
    p_candidate->>'canonicalTitle', p_candidate->>'sourcePageUrl', nullif(p_candidate->>'originalMediaUrl', ''),
    nullif(p_candidate->>'mimeType', ''), nullif(p_candidate->>'width', '')::integer, nullif(p_candidate->>'height', '')::integer,
    nullif(p_candidate->>'byteSize', '')::bigint, nullif(p_candidate->>'creator', ''), nullif(p_candidate->>'uploader', ''),
    p_candidate->>'sourceName', nullif(p_candidate->>'licenseShortName', ''), nullif(p_candidate->>'licenseUrl', ''),
    nullif(p_candidate->>'usageTerms', ''), nullif(p_candidate->>'attributionText', ''), nullif(p_candidate->>'description', ''),
    p_candidate->>'requestedCategory', p_candidate->>'requestedRole', (p_candidate->>'discoveredAt')::timestamptz,
    p_candidate->>'providerMetadataHash', p_candidate->>'normalizedLicense', p_candidate->>'state', nullif(p_candidate->>'rejectionReason', '')
  ) on conflict (canonical_destination_id, provider, provider_asset_id) do update set
    canonical_title = excluded.canonical_title, source_page_url = excluded.source_page_url, original_media_url = excluded.original_media_url,
    mime_type = excluded.mime_type, width = excluded.width, height = excluded.height, byte_size = excluded.byte_size,
    creator = excluded.creator, uploader = excluded.uploader, license_short_name = excluded.license_short_name,
    license_url = excluded.license_url, usage_terms = excluded.usage_terms, attribution_text = excluded.attribution_text,
    description = excluded.description, requested_category = excluded.requested_category, requested_role = excluded.requested_role,
    last_seen_at = now(), provider_metadata_hash = excluded.provider_metadata_hash, normalized_license = excluded.normalized_license,
    state = excluded.state, rejection_reason = excluded.rejection_reason, updated_at = now()
  returning * into result;
  return result;
end;
$$;

alter table public.real_editorial_visual_candidates enable row level security;
revoke all on public.real_editorial_visual_candidates from public, anon, authenticated;
grant select, insert, update, delete on public.real_editorial_visual_candidates to service_role;
revoke all on function public.real_editorial_upsert_visual_candidate(jsonb) from public, anon, authenticated;
grant execute on function public.real_editorial_upsert_visual_candidate(jsonb) to service_role;
