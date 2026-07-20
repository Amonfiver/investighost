create table public.geographic_entities (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.geographic_entities(id) on delete restrict,
  entity_type text not null check (entity_type in ('country','region','locality','zone')),
  name text not null check (length(name) between 1 and 160),
  normalized_name text not null check (length(normalized_name) between 1 and 160),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  region_code text check (length(region_code) <= 20),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  source_name text not null check (length(source_name) between 1 and 120),
  source_version text not null check (length(source_version) between 1 and 80),
  source_license text not null check (length(source_license) between 1 and 160),
  status text not null check (status in ('active','deprecated')),
  resolution_method text not null check (resolution_method in ('exact','alias','tolerant','human')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((entity_type = 'country' and parent_id is null) or (entity_type <> 'country' and parent_id is not null)),
  check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null)),
  unique (entity_type,country_code,slug)
);

create table public.geographic_aliases (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.geographic_entities(id) on delete cascade,
  alias text not null check (length(alias) between 1 and 160),
  normalized_alias text not null check (length(normalized_alias) between 1 and 160),
  source_version text not null check (length(source_version) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (entity_id,normalized_alias)
);

create table public.editorial_research_requests (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.geographic_entities(id) on delete restrict,
  destination_query_snapshot text not null check (length(destination_query_snapshot) between 1 and 300),
  profiles text[] not null check (cardinality(profiles) between 1 and 2 and profiles <@ array['adventure','student']::text[]),
  language text not null check (language ~ '^[a-z]{2}$'),
  depth text not null check (depth in ('standard','deep')),
  notes text check (length(notes) <= 2000),
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  configuration_version text not null check (length(configuration_version) between 1 and 80),
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 200),
  actor_id uuid not null,
  state text not null check (state in ('draft','queued','researching','structuring','validating','completed','retry_pending','failed','cancelled')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.editorial_research_runs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.editorial_research_requests(id) on delete cascade,
  stage text not null check (stage in ('destination_resolution','source_discovery','source_reading','fact_structuring','profile_generation','quality_review','human_review')),
  provider_id text not null check (length(provider_id) between 1 and 80),
  model text not null check (length(model) between 1 and 120),
  prompt_version text not null check (length(prompt_version) between 1 and 80),
  contract_version text not null check (length(contract_version) between 1 and 80),
  attempt integer not null check (attempt > 0),
  estimated_cost numeric(14,6) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(14,6) check (actual_cost >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  input_units bigint not null default 0 check (input_units >= 0),
  output_units bigint not null default 0 check (output_units >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text check (length(error_code) <= 120),
  error_message text check (length(error_message) <= 2000),
  recovery_from_run_id uuid references public.editorial_research_runs(id) on delete set null,
  cancelled_by uuid,
  state text not null check (state in ('queued','running','checkpointed','completed','retry_pending','failed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or started_at is null or completed_at >= started_at),
  check (state <> 'failed' or error_code is not null),
  unique (request_id,stage,attempt)
);

create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.editorial_research_runs(id) on delete cascade,
  url text not null check (url ~ '^https://'),
  normalized_url text not null check (normalized_url ~ '^https://'),
  title text not null check (length(title) between 1 and 500),
  author text check (length(author) <= 200),
  publisher text check (length(publisher) <= 200),
  published_at timestamptz,
  query text not null check (length(query) between 1 and 500),
  source_type text not null check (source_type in ('official','tourism','heritage','news','academic','blog','reviews','other')),
  territorial_scope text not null check (territorial_scope in ('destination','local','regional','national','global')),
  freshness text not null check (freshness in ('current','dated','unknown')),
  reliability numeric(4,3) not null check (reliability between 0 and 1),
  duplicate_of_id uuid references public.research_sources(id) on delete set null,
  status text not null check (status in ('discovered','read','accepted','rejected','unavailable')),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id,fingerprint)
);

create table public.research_facts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.editorial_research_requests(id) on delete cascade,
  destination_id uuid not null references public.geographic_entities(id) on delete restrict,
  statement text not null check (length(statement) between 1 and 5000),
  category text not null check (category in ('geography','history','culture','nature','logistics','cost','safety','accessibility','service','other')),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  contradiction text not null check (contradiction in ('none','suspected','confirmed')),
  volatility text not null check (volatility in ('stable','seasonal','volatile')),
  review_status text not null check (review_status in ('pending','verified','disputed','rejected')),
  valid_from timestamptz,
  valid_until timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create table public.research_fact_sources (
  fact_id uuid not null references public.research_facts(id) on delete cascade,
  source_id uuid not null references public.research_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (fact_id,source_id)
);

create table public.research_places (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.editorial_research_requests(id) on delete cascade,
  destination_id uuid not null references public.geographic_entities(id) on delete restrict,
  name text not null check (length(name) between 1 and 300),
  category text not null check (category in ('monument','museum','nature','experience','food','hidden_gem','neighborhood','service','other')),
  position integer not null check (position >= 0),
  adventure_relevance numeric(4,3) not null check (adventure_relevance between 0 and 1),
  student_relevance numeric(4,3) not null check (student_relevance between 0 and 1),
  status text not null check (status in ('candidate','accepted','rejected','duplicate')),
  duplicate_of_id uuid references public.research_places(id) on delete set null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id,position)
);

create table public.research_place_facts (
  place_id uuid not null references public.research_places(id) on delete cascade,
  fact_id uuid not null references public.research_facts(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (place_id,fact_id)
);

create table public.research_place_sources (
  place_id uuid not null references public.research_places(id) on delete cascade,
  source_id uuid not null references public.research_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (place_id,source_id)
);

create table public.research_activities (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.editorial_research_requests(id) on delete cascade,
  destination_id uuid not null references public.geographic_entities(id) on delete restrict,
  name text not null check (length(name) between 1 and 300),
  audience_profiles text[] not null check (cardinality(audience_profiles) between 1 and 2 and audience_profiles <@ array['adventure','student']::text[]),
  duration_minutes integer check (duration_minutes > 0),
  cost_band text not null check (cost_band in ('free','budget','moderate','high','unknown')),
  season text check (length(season) <= 200),
  requirements text[] not null default '{}',
  accessibility text[] not null default '{}',
  risk_notes text[] not null default '{}',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.research_activity_facts (
  activity_id uuid not null references public.research_activities(id) on delete cascade,
  fact_id uuid not null references public.research_facts(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (activity_id,fact_id)
);

create table public.research_activity_sources (
  activity_id uuid not null references public.research_activities(id) on delete cascade,
  source_id uuid not null references public.research_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (activity_id,source_id)
);

create table public.editorial_drafts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.editorial_research_requests(id) on delete cascade,
  run_id uuid not null references public.editorial_research_runs(id) on delete restrict,
  profile text not null check (profile in ('adventure','student')),
  title text not null check (length(title) between 1 and 300),
  introduction text not null check (length(introduction) between 1 and 5000),
  prompt_version text not null check (length(prompt_version) between 1 and 80),
  content_version integer not null check (content_version > 0),
  state text not null check (state in ('generating','ready','in_review','changes_requested','approved','rejected','archived')),
  human_edited boolean not null default false,
  created_by uuid not null,
  updated_by uuid not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id,profile,content_version)
);

create table public.editorial_sections (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.editorial_drafts(id) on delete cascade,
  kind text not null check (kind in ('overview','highlights','route','practical','risks','budget','daily_life','study','sources','other')),
  heading text not null check (length(heading) between 1 and 300),
  content text not null check (length(content) between 1 and 20000),
  position integer not null check (position >= 0),
  prompt_version text not null check (length(prompt_version) between 1 and 80),
  human_edited boolean not null default false,
  regeneration_reason text check (length(regeneration_reason) <= 1000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id,position)
);

create table public.editorial_section_facts (
  section_id uuid not null references public.editorial_sections(id) on delete cascade,
  fact_id uuid not null references public.research_facts(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (section_id,fact_id)
);

create table public.editorial_section_sources (
  section_id uuid not null references public.editorial_sections(id) on delete cascade,
  source_id uuid not null references public.research_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (section_id,source_id)
);

create table public.quality_reviews (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.editorial_drafts(id) on delete cascade,
  draft_version integer not null check (draft_version > 0),
  outcome text not null check (outcome in ('passed','passed_with_warnings','changes_requested','blocked','rejected')),
  rule_version text not null check (length(rule_version) between 1 and 80),
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (draft_id,draft_version,rule_version)
);

create table public.quality_checks (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.quality_reviews(id) on delete cascade,
  code text not null check (length(code) between 1 and 120),
  severity text not null check (severity in ('info','warning','error','blocker')),
  result text not null check (result in ('passed','warning','failed')),
  evidence text not null check (length(evidence) between 1 and 5000),
  correction text check (length(correction) <= 5000),
  responsible text not null check (responsible in ('system','editor','reviewer')),
  rule_version text not null check (length(rule_version) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (review_id,code)
);

create table public.provider_usage (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.editorial_research_runs(id) on delete cascade,
  stage text not null check (stage in ('destination_resolution','source_discovery','source_reading','fact_structuring','profile_generation','quality_review','human_review')),
  provider_id text not null check (length(provider_id) between 1 and 80),
  model text not null check (length(model) between 1 and 120),
  input_units bigint not null default 0 check (input_units >= 0),
  output_units bigint not null default 0 check (output_units >= 0),
  estimated_cost numeric(14,6) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(14,6) check (actual_cost >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  budget_limit numeric(14,6) not null check (budget_limit >= 0),
  cause text not null check (length(cause) between 1 and 300),
  created_at timestamptz not null default now()
);

create table public.research_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.editorial_research_requests(id) on delete cascade,
  run_id uuid references public.editorial_research_runs(id) on delete set null,
  event_type text not null check (length(event_type) between 1 and 120),
  stage text check (stage in ('destination_resolution','source_discovery','source_reading','fact_structuring','profile_generation','quality_review','human_review')),
  actor_id uuid,
  correlation_id text not null check (length(correlation_id) between 1 and 200),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.stage_checkpoints (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.editorial_research_requests(id) on delete cascade,
  run_id uuid not null references public.editorial_research_runs(id) on delete cascade,
  stage text not null check (stage in ('destination_resolution','source_discovery','source_reading','fact_structuring','profile_generation','quality_review','human_review')),
  attempt integer not null check (attempt > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (run_id,stage,attempt)
);

create table public.execution_locks (
  request_id uuid primary key references public.editorial_research_requests(id) on delete cascade,
  lock_token uuid not null unique,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  owner_process text not null check (length(owner_process) between 1 and 200),
  check (expires_at > acquired_at)
);

create index geographic_entities_lookup_idx on public.geographic_entities(country_code,normalized_name) where status = 'active';
create index geographic_aliases_lookup_idx on public.geographic_aliases(normalized_alias);
create index editorial_requests_state_updated_idx on public.editorial_research_requests(state,updated_at desc);
create index editorial_runs_request_created_idx on public.editorial_research_runs(request_id,created_at desc);
create index research_sources_run_status_idx on public.research_sources(run_id,status,reliability desc);
create index research_facts_request_category_idx on public.research_facts(request_id,category,confidence desc);
create index research_places_request_position_idx on public.research_places(request_id,position);
create index research_activities_request_idx on public.research_activities(request_id);
create index editorial_drafts_request_profile_idx on public.editorial_drafts(request_id,profile,content_version desc);
create index quality_reviews_draft_idx on public.quality_reviews(draft_id,reviewed_at desc);
create index provider_usage_run_stage_idx on public.provider_usage(run_id,stage,created_at);
create index research_events_request_time_idx on public.research_events(request_id,occurred_at);
create index stage_checkpoints_request_time_idx on public.stage_checkpoints(request_id,created_at desc);
create index execution_locks_expiry_idx on public.execution_locks(expires_at);

create trigger geographic_entities_updated before update on public.geographic_entities for each row execute function public.set_updated_at();
create trigger editorial_research_requests_updated before update on public.editorial_research_requests for each row execute function public.set_updated_at();
create trigger editorial_research_runs_updated before update on public.editorial_research_runs for each row execute function public.set_updated_at();
create trigger research_sources_updated before update on public.research_sources for each row execute function public.set_updated_at();
create trigger research_facts_updated before update on public.research_facts for each row execute function public.set_updated_at();
create trigger research_places_updated before update on public.research_places for each row execute function public.set_updated_at();
create trigger research_activities_updated before update on public.research_activities for each row execute function public.set_updated_at();
create trigger editorial_drafts_updated before update on public.editorial_drafts for each row execute function public.set_updated_at();
create trigger editorial_sections_updated before update on public.editorial_sections for each row execute function public.set_updated_at();

create or replace function public.acquire_editorial_execution_lock(
  p_request_id uuid,
  p_lock_token uuid,
  p_expires_at timestamptz,
  p_owner_process text
) returns boolean language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  insert into public.execution_locks (request_id,lock_token,expires_at,owner_process)
  values (p_request_id,p_lock_token,p_expires_at,p_owner_process)
  on conflict (request_id) do update
    set lock_token = excluded.lock_token,
        acquired_at = now(),
        expires_at = excluded.expires_at,
        owner_process = excluded.owner_process
    where public.execution_locks.expires_at <= now()
       or public.execution_locks.lock_token = excluded.lock_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.release_editorial_execution_lock(
  p_request_id uuid,
  p_lock_token uuid
) returns boolean language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  delete from public.execution_locks where request_id = p_request_id and lock_token = p_lock_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.acquire_editorial_execution_lock(uuid,uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function public.release_editorial_execution_lock(uuid,uuid) from public,anon,authenticated;
grant execute on function public.acquire_editorial_execution_lock(uuid,uuid,timestamptz,text) to service_role;
grant execute on function public.release_editorial_execution_lock(uuid,uuid) to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'geographic_entities','geographic_aliases','editorial_research_requests','editorial_research_runs',
    'research_sources','research_facts','research_fact_sources','research_places','research_place_facts',
    'research_place_sources','research_activities','research_activity_facts','research_activity_sources',
    'editorial_drafts','editorial_sections','editorial_section_facts','editorial_section_sources',
    'quality_reviews','quality_checks','provider_usage','research_events','stage_checkpoints','execution_locks'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon,authenticated', table_name);
    execute format('grant select,insert,update,delete on table public.%I to service_role', table_name);
  end loop;
end;
$$;
