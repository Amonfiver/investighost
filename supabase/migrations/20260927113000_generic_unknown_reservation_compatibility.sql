-- Generic batch executions share the reservation ledger with the historical
-- pilot flow.  Only pilot-owned reservations have the pilot/run identity that
-- the human ambiguity desk requires.  A generic owner must still be allowed
-- to settle an indeterminate remote outcome fail-closed as `unknown`.
create or replace function public.register_real_editorial_unknown_call()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.state = 'unknown'
     and old.state is distinct from 'unknown'
     and new.pilot_id is not null
     and new.run_id is not null then
    insert into public.real_editorial_ambiguous_calls (
      call_id,reservation_id,pilot_id,run_id,reason_code,source_state,opened_at
    ) values (
      new.call_id,new.id,new.pilot_id,new.run_id,'REMOTE_OUTCOME_UNKNOWN','unknown',now()
    ) on conflict (call_id) do nothing;
  end if;
  return new;
end;
$$;
