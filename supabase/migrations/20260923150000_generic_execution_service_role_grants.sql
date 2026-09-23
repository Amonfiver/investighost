-- The local Investighost runtime uses the service-role client for the same
-- append-only execution tables already shared by pilots and BATCH_JOB owners.
-- The owner-neutral migration introduced the execution table but omitted these
-- runtime grants, which made durable BATCH_JOB execution fail before any
-- provider boundary could run. This remains local-only; no public client role
-- receives access.

grant select, insert, update, delete on public.real_editorial_executions to service_role;
grant select, insert, update, delete on public.real_editorial_artifacts to service_role;
grant select, insert, update, delete on public.real_editorial_call_reservations to service_role;
grant select, insert, update, delete on public.real_editorial_provider_calls to service_role;
grant select, insert, update, delete on public.real_editorial_events to service_role;

grant execute on function public.reserve_generic_real_editorial_call(
  uuid, text, text, text, text, text, text, text, text, integer, uuid,
  numeric, text, text, text, text, text
) to service_role;
grant execute on function public.start_generic_real_editorial_call(uuid) to service_role;
grant execute on function public.settle_generic_real_editorial_call(
  uuid, text, numeric, text, bigint, bigint, integer, numeric, text, text
) to service_role;
