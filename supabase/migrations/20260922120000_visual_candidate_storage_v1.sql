-- Visual Storage V1: candidates remain private until validated bytes, explicit
-- rights approval and durable public-object promotion have all succeeded.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('visual-staging-private', 'visual-staging-private', false, 20971520, array['image/jpeg','image/png','image/webp']),
  ('images-approved', 'images-approved', true, 20971520, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.real_editorial_visual_candidate_stages (
  candidate_id uuid primary key references public.real_editorial_visual_candidates(id) on delete cascade,
  state text not null check (state in ('STAGED', 'REJECTED')),
  staging_bucket text check (staging_bucket is null or staging_bucket = 'visual-staging-private'),
  staging_storage_identity text,
  checksum text check (checksum is null or checksum ~ '^[a-f0-9]{64}$'),
  detected_mime_type text check (detected_mime_type is null or detected_mime_type in ('image/jpeg','image/png','image/webp')),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  byte_size bigint check (byte_size is null or byte_size > 0),
  downloaded_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (state <> 'STAGED' or (
    staging_bucket is not null and staging_storage_identity is not null and checksum is not null
    and detected_mime_type is not null and width is not null and height is not null
    and byte_size is not null and downloaded_at is not null
  )),
  check (state <> 'REJECTED' or failure_code is not null)
);

create table public.real_editorial_visual_blobs (
  checksum text primary key check (checksum ~ '^[a-f0-9]{64}$'),
  storage_bucket text not null check (storage_bucket = 'images-approved'),
  storage_identity text not null unique,
  public_url text not null check (public_url ~ '^https://'),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  byte_size bigint not null check (byte_size > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.real_editorial_visual_asset_candidates (
  asset_id uuid not null references public.real_editorial_visual_assets(id) on delete cascade,
  candidate_id uuid not null references public.real_editorial_visual_candidates(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (asset_id, candidate_id)
);

alter table public.real_editorial_visual_packages add column if not exists workflow_key text;
create unique index real_editorial_visual_packages_workflow_unique
  on public.real_editorial_visual_packages (canonical_destination_id, workflow_key)
  where workflow_key is not null;

alter table public.real_editorial_visual_candidate_stages enable row level security;
alter table public.real_editorial_visual_blobs enable row level security;
alter table public.real_editorial_visual_asset_candidates enable row level security;
revoke all on public.real_editorial_visual_candidate_stages, public.real_editorial_visual_blobs,
  public.real_editorial_visual_asset_candidates from public, anon, authenticated;
grant select, insert, update, delete on public.real_editorial_visual_candidate_stages, public.real_editorial_visual_blobs,
  public.real_editorial_visual_asset_candidates to service_role;
