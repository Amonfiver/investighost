-- Falla cerrado si una conciliación intenta persistir secretos o hashes inválidos.

alter table public.real_editorial_call_reservations
  add constraint real_editorial_reservations_calculated_cost_nonnegative
  check (calculated_cost is null or calculated_cost >= 0);

alter table public.real_editorial_provider_calls
  add constraint real_editorial_calls_calculated_cost_nonnegative
  check (calculated_cost is null or calculated_cost >= 0),
  add constraint real_editorial_calls_remote_id_length
  check (remote_id is null or length(remote_id) <= 240),
  add constraint real_editorial_calls_sanitized_error
  check (
    sanitized_error is null
    or (
      length(sanitized_error) between 1 and 500
      and sanitized_error !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
    )
  ),
  add constraint real_editorial_calls_output_hash
  check (output_hash is null or output_hash ~ '^[a-f0-9]{64}$');
