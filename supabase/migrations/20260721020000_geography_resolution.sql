create table public.geographic_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (length(provider) between 1 and 120),
  source_version text not null check (length(source_version) between 1 and 80),
  source_license text not null check (length(source_license) between 1 and 160),
  source_url text not null check (source_url ~ '^https://'),
  scope text not null check (length(scope) between 1 and 300),
  acquired_at timestamptz not null,
  status text not null check (status in ('active','superseded','rejected')),
  created_at timestamptz not null default now(),
  unique (provider,source_version,scope)
);

create table public.geographic_source_artifacts (
  snapshot_id uuid not null references public.geographic_source_snapshots(id) on delete cascade,
  artifact_name text not null check (length(artifact_name) between 1 and 200),
  source_url text not null check (source_url ~ '^https://'),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  upstream_last_modified timestamptz,
  primary key (snapshot_id,artifact_name)
);

alter table public.geographic_entities
  add column source_snapshot_id uuid references public.geographic_source_snapshots(id) on delete restrict,
  add column source_checked_at timestamptz;

create table public.geographic_external_ids (
  entity_id uuid not null references public.geographic_entities(id) on delete cascade,
  provider text not null check (length(provider) between 1 and 120),
  external_id text not null check (length(external_id) between 1 and 160),
  source_snapshot_id uuid references public.geographic_source_snapshots(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (entity_id,provider),
  unique (provider,external_id)
);

create table public.geographic_resolution_corrections (
  id uuid primary key default gen_random_uuid(),
  normalized_query text not null check (length(normalized_query) between 1 and 400),
  selected_entity_id uuid not null references public.geographic_entities(id) on delete restrict,
  catalog_version text not null check (length(catalog_version) between 1 and 80),
  actor_id uuid not null,
  reason text check (length(reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_query,catalog_version)
);

create index geographic_external_ids_lookup_idx on public.geographic_external_ids(provider,external_id);
create index geographic_corrections_entity_idx on public.geographic_resolution_corrections(selected_entity_id,updated_at desc);
create trigger geographic_resolution_corrections_updated before update on public.geographic_resolution_corrections
  for each row execute function public.set_updated_at();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'geographic_source_snapshots','geographic_source_artifacts',
    'geographic_external_ids','geographic_resolution_corrections'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated',table_name);
    execute format('grant all on table public.%I to service_role',table_name);
  end loop;
end $$;

insert into public.geographic_source_snapshots (
  id,provider,source_version,source_license,source_url,scope,acquired_at,status
) values (
  '72000000-0000-4000-8000-000000000001','GeoNames','geonames-2026-07-20',
  'Creative Commons Attribution 4.0','https://download.geonames.org/export/dump/',
  'MVP: Spain > Comunitat Valenciana > Morella','2026-07-21T00:37:57+02:00','active'
) on conflict (id) do nothing;

insert into public.geographic_source_artifacts (
  snapshot_id,artifact_name,source_url,sha256,upstream_last_modified
) values
('72000000-0000-4000-8000-000000000001','ES.zip','https://download.geonames.org/export/dump/ES.zip','7eabc21e26b96136e6228080eb9fdfb937a58badcae89378fa44488662780069','2026-07-20T01:26:59Z'),
('72000000-0000-4000-8000-000000000001','alternateNames-ES.zip','https://download.geonames.org/export/dump/alternatenames/ES.zip','1e648d98ef18163595dc70c615f4ccdbb0f8692b8a81389a9aa5d0ae53050ecf','2026-07-20T01:35:23Z'),
('72000000-0000-4000-8000-000000000001','admin1CodesASCII.txt','https://download.geonames.org/export/dump/admin1CodesASCII.txt','34784457b76b988a669dff7c3e4b104e4902c0875643cff019281ac79dfa2992','2026-07-20T01:32:12Z'),
('72000000-0000-4000-8000-000000000001','countryInfo.txt','https://download.geonames.org/export/dump/countryInfo.txt','93bafc525813f22e4711ff9ed6d626343094ce48c26388dc7c49189b3d7d5512','2026-07-20T01:32:12Z')
on conflict (snapshot_id,artifact_name) do nothing;

-- Las tablas puente pertenecen al agregado de solicitud. Al borrar el agregado,
-- cada relación debe desaparecer independientemente del orden de cascadas.
alter table public.research_fact_sources drop constraint research_fact_sources_source_id_fkey;
alter table public.research_fact_sources add constraint research_fact_sources_source_id_fkey
  foreign key (source_id) references public.research_sources(id) on delete cascade;
alter table public.research_place_facts drop constraint research_place_facts_fact_id_fkey;
alter table public.research_place_facts add constraint research_place_facts_fact_id_fkey
  foreign key (fact_id) references public.research_facts(id) on delete cascade;
alter table public.research_place_sources drop constraint research_place_sources_source_id_fkey;
alter table public.research_place_sources add constraint research_place_sources_source_id_fkey
  foreign key (source_id) references public.research_sources(id) on delete cascade;
alter table public.research_activity_facts drop constraint research_activity_facts_fact_id_fkey;
alter table public.research_activity_facts add constraint research_activity_facts_fact_id_fkey
  foreign key (fact_id) references public.research_facts(id) on delete cascade;
alter table public.research_activity_sources drop constraint research_activity_sources_source_id_fkey;
alter table public.research_activity_sources add constraint research_activity_sources_source_id_fkey
  foreign key (source_id) references public.research_sources(id) on delete cascade;
alter table public.editorial_section_facts drop constraint editorial_section_facts_fact_id_fkey;
alter table public.editorial_section_facts add constraint editorial_section_facts_fact_id_fkey
  foreign key (fact_id) references public.research_facts(id) on delete cascade;
alter table public.editorial_section_sources drop constraint editorial_section_sources_source_id_fkey;
alter table public.editorial_section_sources add constraint editorial_section_sources_source_id_fkey
  foreign key (source_id) references public.research_sources(id) on delete cascade;
alter table public.editorial_drafts drop constraint editorial_drafts_run_id_fkey;
alter table public.editorial_drafts add constraint editorial_drafts_run_id_fkey
  foreign key (run_id) references public.editorial_research_runs(id) on delete cascade;
