-- Development-only smoke fixtures are explicitly marked at rest. The marker is
-- never inferred from a destination or batch name and is false for all imports.
alter table public.editorial_destination_batches
  add column if not exists smoke_fixture boolean not null default false;

create index if not exists editorial_destination_batches_smoke_fixture_idx
  on public.editorial_destination_batches(smoke_fixture) where smoke_fixture;
