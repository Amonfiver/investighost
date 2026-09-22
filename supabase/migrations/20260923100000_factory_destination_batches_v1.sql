-- Factory V1: lote editorial durable. No inicia proveedores ni modifica Library/Trawel.
create table public.editorial_destination_batches (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 1 and 200),
  normalized_name text not null check (length(btrim(normalized_name)) between 1 and 200),
  import_fingerprint text not null unique check (import_fingerprint ~ '^[a-f0-9]{64}$'),
  source_origin text not null check (source_origin = 'json_v1'),
  status text not null check (status in ('IMPORTED','PROCESSING','COMPLETED','COMPLETED_WITH_ERRORS')),
  total_items integer not null check (total_items between 1 and 50),
  valid_items integer not null check (valid_items >= 0 and valid_items <= total_items),
  new_items integer not null default 0 check (new_items >= 0),
  existing_items integer not null default 0 check (existing_items >= 0),
  reusable_items integer not null default 0 check (reusable_items >= 0),
  ambiguous_items integer not null default 0 check (ambiguous_items >= 0),
  duplicate_items integer not null default 0 check (duplicate_items >= 0),
  invalid_items integer not null default 0 check (invalid_items >= 0),
  failed_items integer not null default 0 check (failed_items >= 0),
  max_cost_per_destination numeric(18,9) null check (max_cost_per_destination >= 0),
  max_cost_per_batch numeric(18,9) null check (max_cost_per_batch >= 0),
  imported_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (new_items + existing_items + ambiguous_items + duplicate_items + invalid_items <= total_items)
);

create table public.editorial_destination_batch_jobs (
  id uuid primary key,
  batch_id uuid not null references public.editorial_destination_batches(id) on delete restrict,
  input_index integer not null check (input_index >= 0),
  original_name text not null check (length(btrim(original_name)) between 1 and 160),
  country text not null check (length(btrim(country)) between 1 and 120),
  region text null check (region is null or length(btrim(region)) between 1 and 120),
  normalized_name text not null check (length(btrim(normalized_name)) between 1 and 160),
  normalized_country text not null check (length(btrim(normalized_country)) between 1 and 120),
  normalized_region text null check (normalized_region is null or length(btrim(normalized_region)) between 1 and 120),
  normalized_identity text not null check (length(btrim(normalized_identity)) between 1 and 600),
  canonical_destination_id uuid null references public.geographic_entities(id) on delete restrict,
  identity_state text not null check (identity_state in ('NEW','EXISTS','EXISTS_DELIVERED','EXISTS_WITH_APPROVED_CONTENT','AMBIGUOUS')),
  reuse_policy text not null check (reuse_policy in ('NEEDS_NEW_PRODUCTION','CAN_REUSE_EXISTING','WAIT_FOR_EXISTING','AMBIGUOUS')),
  existing_job_id uuid null references public.editorial_destination_batch_jobs(id) on delete restrict,
  status text not null check (status in ('QUEUED','PROCESSING','READY_FOR_REVIEW','APPROVED','REDO_REQUIRED','DELIVERED','FAILED','BLOCKED_AMBIGUOUS','REUSED')),
  current_phase text not null check (current_phase in ('IDENTITY','RESEARCH','ANALYSIS','STUDENT','ADVENTURE','VISUALS','AUTO_REVIEW','DELIVERY')),
  completed_phases jsonb not null default '[]'::jsonb check (jsonb_typeof(completed_phases) = 'array'),
  artifact_refs jsonb not null default '{}'::jsonb check (jsonb_typeof(artifact_refs) = 'object'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_failure text null check (last_failure is null or length(last_failure) <= 2000),
  retryable boolean not null default true,
  retry_requested_at timestamptz null,
  actual_cost numeric(18,9) not null default 0 check (actual_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, input_index),
  unique (batch_id, normalized_identity),
  check ((status = 'BLOCKED_AMBIGUOUS') = (identity_state = 'AMBIGUOUS')),
  check ((status = 'REUSED') = (reuse_policy in ('CAN_REUSE_EXISTING','WAIT_FOR_EXISTING')))
);

create table public.editorial_destination_batch_issues (
  id uuid primary key,
  batch_id uuid not null references public.editorial_destination_batches(id) on delete restrict,
  input_index integer not null check (input_index >= 0),
  kind text not null check (kind in ('INVALID_ROW','DUPLICATE_INPUT')),
  message text not null check (length(btrim(message)) between 1 and 1000),
  normalized_identity text null check (normalized_identity is null or length(normalized_identity) <= 600),
  created_at timestamptz not null default now(),
  unique (batch_id, input_index, kind)
);

create index editorial_destination_batch_jobs_batch_status_idx
  on public.editorial_destination_batch_jobs(batch_id, status, updated_at);
create index editorial_destination_batch_jobs_identity_idx
  on public.editorial_destination_batch_jobs(canonical_destination_id, normalized_identity, status);
create index editorial_destination_batch_issues_batch_idx
  on public.editorial_destination_batch_issues(batch_id, input_index);

create trigger editorial_destination_batches_updated before update on public.editorial_destination_batches
  for each row execute function public.set_updated_at();
create trigger editorial_destination_batch_jobs_updated before update on public.editorial_destination_batch_jobs
  for each row execute function public.set_updated_at();

alter table public.editorial_destination_batches enable row level security;
alter table public.editorial_destination_batch_jobs enable row level security;
alter table public.editorial_destination_batch_issues enable row level security;
revoke all on public.editorial_destination_batches, public.editorial_destination_batch_jobs, public.editorial_destination_batch_issues from public, anon, authenticated;
grant select, insert, update on public.editorial_destination_batches, public.editorial_destination_batch_jobs, public.editorial_destination_batch_issues to service_role;
