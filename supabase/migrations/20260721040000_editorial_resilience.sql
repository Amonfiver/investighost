create table public.editorial_execution_controls (
  request_id uuid primary key references public.editorial_research_requests(id) on delete cascade,
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  budget_limit numeric(14,6) not null check (budget_limit >= 0),
  spent_cost numeric(14,6) not null default 0 check (spent_cost >= 0),
  cancel_requested_at timestamptz,
  cancelled_by uuid,
  next_retry_at timestamptz,
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index editorial_execution_controls_retry_idx
  on public.editorial_execution_controls(next_retry_at)
  where next_retry_at is not null;

create trigger editorial_execution_controls_updated
  before update on public.editorial_execution_controls
  for each row execute function public.set_updated_at();

create or replace function public.renew_editorial_execution_lock(
  p_request_id uuid,
  p_lock_token uuid,
  p_expires_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  update public.execution_locks
     set expires_at = p_expires_at
   where request_id = p_request_id
     and lock_token = p_lock_token
     and expires_at > now()
     and p_expires_at > now();
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.renew_editorial_execution_lock(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.renew_editorial_execution_lock(uuid,uuid,timestamptz) to service_role;

alter table public.editorial_execution_controls enable row level security;
revoke all on table public.editorial_execution_controls from anon,authenticated;
grant select,insert,update,delete on table public.editorial_execution_controls to service_role;
