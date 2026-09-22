-- Visual Bridge V1: Investighost owns visual semantics, rights and selections.
-- This migration is local to Investighost. It neither calls nor modifies Trawel.

create table public.real_editorial_visual_assets (
  id uuid primary key default gen_random_uuid(),
  canonical_destination_id uuid not null,
  lifecycle text not null check (lifecycle in ('PENDING', 'APPROVED', 'REJECTED')),
  rights_status text not null check (rights_status in ('UNKNOWN', 'PENDING', 'REFERENCE_ONLY', 'APPROVED_FOR_PUBLIC_USE', 'REJECTED')),
  usage_allowed boolean,
  rights_checked_at timestamptz,
  public_url text,
  storage_identity text,
  source_url text,
  source_name text,
  author text,
  license text,
  attribution_text text,
  associated_place text,
  category text not null check (category in ('landmark', 'landscape', 'culture', 'food', 'people-life', 'atmosphere', 'detail')),
  modes text[] not null check (cardinality(modes) between 1 and 2 and modes <@ array['adventure', 'student']::text[]),
  alt text,
  caption text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  mime_type text,
  checksum text check (checksum is null or checksum ~ '^[a-f0-9]{64}$'),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, canonical_destination_id),
  check (lifecycle <> 'APPROVED' or (
    rights_status = 'APPROVED_FOR_PUBLIC_USE' and usage_allowed is true and rights_checked_at is not null
    and public_url is not null and alt is not null and attribution_text is not null
  )),
  check (rights_status <> 'APPROVED_FOR_PUBLIC_USE' or lifecycle = 'APPROVED'),
  check (lifecycle = 'APPROVED' or public_url is null),
  check (lifecycle <> 'REJECTED' or rejection_reason is not null)
);

create index real_editorial_visual_assets_destination_idx
  on public.real_editorial_visual_assets (canonical_destination_id, lifecycle);
create unique index real_editorial_visual_assets_destination_checksum_unique
  on public.real_editorial_visual_assets (canonical_destination_id, checksum)
  where checksum is not null;

create table public.real_editorial_visual_packages (
  id uuid primary key default gen_random_uuid(),
  canonical_destination_id uuid not null,
  state text not null check (state in ('DRAFT', 'PARTIAL', 'APPROVED', 'REJECTED')),
  package_hash text check (package_hash is null or package_hash ~ '^[a-f0-9]{64}$'),
  rejection_reason text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (state <> 'APPROVED' or (package_hash is not null and approved_at is not null)),
  check (state <> 'REJECTED' or rejection_reason is not null)
);

create unique index real_editorial_visual_packages_approved_destination_unique
  on public.real_editorial_visual_packages (canonical_destination_id)
  where state = 'APPROVED';

create table public.real_editorial_visual_package_selections (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.real_editorial_visual_packages(id) on delete cascade,
  canonical_destination_id uuid not null,
  asset_id uuid not null,
  mode text not null check (mode in ('adventure', 'student')),
  role text not null check (role in ('hero', 'highlight', 'gallery')),
  priority integer not null check (priority >= 0),
  created_at timestamptz not null default now(),
  foreign key (asset_id, canonical_destination_id)
    references public.real_editorial_visual_assets(id, canonical_destination_id),
  unique (package_id, mode, role, priority)
);

create unique index real_editorial_visual_package_one_hero_per_mode
  on public.real_editorial_visual_package_selections (package_id, mode)
  where role = 'hero';
create index real_editorial_visual_package_selections_package_idx
  on public.real_editorial_visual_package_selections (package_id, mode, role, priority);

alter table public.real_editorial_visual_assets enable row level security;
alter table public.real_editorial_visual_packages enable row level security;
alter table public.real_editorial_visual_package_selections enable row level security;
revoke all on public.real_editorial_visual_assets, public.real_editorial_visual_packages,
  public.real_editorial_visual_package_selections from public, anon, authenticated;
grant select, insert, update, delete on public.real_editorial_visual_assets,
  public.real_editorial_visual_packages, public.real_editorial_visual_package_selections to service_role;
