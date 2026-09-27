-- Durable, sanitized diagnostics for Factory V1 batch jobs.  Existing rows
-- remain valid and are projected compatibly from last_failure until retried.
alter table public.editorial_destination_batch_jobs
  add column if not exists failure_diagnostic jsonb null
  check (failure_diagnostic is null or jsonb_typeof(failure_diagnostic) = 'object');
