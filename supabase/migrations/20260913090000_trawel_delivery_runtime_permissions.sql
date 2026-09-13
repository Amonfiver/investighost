-- The durable V2 repository reads delivery snapshots and completes/list attempts
-- directly; all delivery state changes and attempt creation remain RPC-only.
grant select on table public.real_editorial_trawel_deliveries to service_role;
grant select, update on table public.real_editorial_trawel_delivery_attempts to service_role;
