create extension if not exists pgcrypto;

create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = timezone('utc', now()); return new; end;
$$;

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running','completed_with_errors','completed')),
  found_count integer not null default 0 check (found_count >= 0),
  created_at timestamptz not null default now(), completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.contribution_import_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete restrict,
  remote_id text not null unique check (length(remote_id) between 1 and 200),
  source_type text not null check (source_type in ('message','suggestion','recommendation','report','claim','photo','place')),
  status text not null check (status in ('pending','downloading','verifying','imported','deleting_remote','completed','retry_pending','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text check (length(last_error) <= 2000), next_retry_at timestamptz,
  remote_checksum text check (remote_checksum ~ '^[a-f0-9]{64}$'),
  local_checksum text check (local_checksum ~ '^[a-f0-9]{64}$'),
  remote_payload_size bigint check (remote_payload_size >= 0), local_payload_size bigint check (local_payload_size >= 0),
  downloaded_at timestamptz, verified_at timestamptz, deleted_remote_at timestamptz, completed_at timestamptz,
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 300),
  version integer not null check (version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.imported_contributions (
  id uuid primary key default gen_random_uuid(), job_id uuid not null unique references public.contribution_import_jobs(id) on delete restrict,
  remote_id text not null unique, source_type text not null check (source_type in ('message','suggestion','recommendation','report','claim','photo','place')),
  payload_json jsonb not null, payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_size bigint not null check (payload_size > 0), version integer not null check (version > 0),
  imported_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.contribution_files (
  id uuid primary key default gen_random_uuid(), contribution_id uuid not null references public.imported_contributions(id) on delete cascade,
  remote_file_id text not null, safe_storage_name text not null, storage_bucket text not null default 'investighost-contributions',
  storage_path text not null unique, mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  size bigint not null check (size between 1 and 20971520), sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz not null, deletion_status text not null default 'retained' check (deletion_status in ('retained','pending','deleted','failed')),
  deletion_attempt_count integer not null default 0 check (deletion_attempt_count >= 0), deletion_error text, deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(contribution_id, remote_file_id)
);

create table public.import_attempts (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.contribution_import_jobs(id) on delete cascade,
  operation text not null check (operation in ('download','verify','persist','delete_remote')),
  outcome text not null check (outcome in ('success','failure')), error_code text, error_message text,
  attempted_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.import_conflicts (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.contribution_import_jobs(id) on delete cascade,
  kind text not null check (kind in ('payload_hash','payload_size','file_hash','file_size','duplicate_version')),
  expected_value text, actual_value text, created_at timestamptz not null default now(), resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.local_backup_records (
  id uuid primary key default gen_random_uuid(), path text not null, database_sha256 text check (database_sha256 ~ '^[a-f0-9]{64}$'),
  file_count integer not null default 0 check (file_count >= 0), status text not null check (status in ('created','verified','failed')),
  created_at timestamptz not null default now(), verified_at timestamptz, updated_at timestamptz not null default now()
);

create index contribution_import_jobs_status_retry_idx on public.contribution_import_jobs(status,next_retry_at);
create index contribution_import_jobs_batch_idx on public.contribution_import_jobs(batch_id);
create index imported_contributions_source_idx on public.imported_contributions(source_type,imported_at desc);
create index contribution_files_contribution_idx on public.contribution_files(contribution_id);
create index import_attempts_job_idx on public.import_attempts(job_id,attempted_at desc);
create index import_conflicts_unresolved_idx on public.import_conflicts(job_id) where resolved_at is null;

create function public.persist_verified_contribution(p_contribution jsonb, p_files jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare contribution_uuid uuid; file_row jsonb;
begin
  insert into imported_contributions (id,job_id,remote_id,source_type,payload_json,payload_sha256,payload_size,version,imported_at)
  values ((p_contribution->>'id')::uuid,(p_contribution->>'job_id')::uuid,p_contribution->>'remote_id',p_contribution->>'source_type',
    p_contribution->'payload_json',p_contribution->>'payload_sha256',(p_contribution->>'payload_size')::bigint,
    (p_contribution->>'version')::integer,(p_contribution->>'imported_at')::timestamptz)
  on conflict (remote_id) do update set remote_id=excluded.remote_id
  returning id into contribution_uuid;
  for file_row in select value from jsonb_array_elements(p_files) loop
    insert into contribution_files (id,contribution_id,remote_file_id,safe_storage_name,storage_path,mime_type,size,sha256,verified_at)
    values ((file_row->>'id')::uuid,contribution_uuid,file_row->>'remote_file_id',file_row->>'safe_storage_name',file_row->>'storage_path',
      file_row->>'mime_type',(file_row->>'size')::bigint,file_row->>'sha256',(file_row->>'verified_at')::timestamptz)
    on conflict (contribution_id,remote_file_id) do nothing;
  end loop;
end;
$$;
revoke all on function public.persist_verified_contribution(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.persist_verified_contribution(jsonb,jsonb) to service_role;

create trigger import_batches_updated before update on public.import_batches for each row execute function public.set_updated_at();
create trigger contribution_import_jobs_updated before update on public.contribution_import_jobs for each row execute function public.set_updated_at();
create trigger imported_contributions_updated before update on public.imported_contributions for each row execute function public.set_updated_at();
create trigger contribution_files_updated before update on public.contribution_files for each row execute function public.set_updated_at();
create trigger import_attempts_updated before update on public.import_attempts for each row execute function public.set_updated_at();
create trigger import_conflicts_updated before update on public.import_conflicts for each row execute function public.set_updated_at();
create trigger local_backup_records_updated before update on public.local_backup_records for each row execute function public.set_updated_at();

alter table public.import_batches enable row level security;
alter table public.contribution_import_jobs enable row level security;
alter table public.imported_contributions enable row level security;
alter table public.contribution_files enable row level security;
alter table public.import_attempts enable row level security;
alter table public.import_conflicts enable row level security;
alter table public.local_backup_records enable row level security;
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on public.import_batches, public.contribution_import_jobs,
  public.imported_contributions, public.contribution_files, public.import_attempts,
  public.import_conflicts, public.local_backup_records to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('investighost-contributions','investighost-contributions',false,20971520,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
