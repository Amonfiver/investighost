import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_LEDGER_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip

describe('ledger real en Supabase local', () => {
  integrationTest('reserva, inicia, concilia y protege el ledger dentro de una transacción reversible', () => {
    const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
    const sql = String.raw`
\set ON_ERROR_STOP on
begin;

insert into public.provider_tariffs (
  id,provider_id,model,operation,version,currency,unit_scale,credit_unit_cost,effective_from,source_reference
) values (
  '75000000-0000-4000-8000-000000000001','synthetic','fixture','search',1,'EUR',1,0.050000000,
  '2026-07-25T00:00:00Z','synthetic integration tariff'
);
insert into public.real_task_budgets (task_id,request_id,currency,limit_cost)
values ('integration-task','integration-request','EUR',0.200000000);
insert into public.real_batch_budgets (batch_id,currency,limit_cost)
values ('integration-batch','EUR',0.500000000);
insert into public.real_daily_budgets (budget_date,currency,limit_cost)
values ('2026-07-25','EUR',1.000000000);

select public.acquire_real_execution_guard(
  'integration-execution',
  '75000000-0000-4000-8000-000000000002',
  now() + interval '5 minutes'
) as guard_acquired \gset
\if :guard_acquired
\else
  \quit 41
\endif

select public.reserve_provider_call(
  'integration-idempotency','integration-execution','integration-request','integration-run',
  'integration-task','integration-batch','2026-07-25','researching_round_1','search',
  'synthetic','fixture',1,null::uuid,0.080000000,'EUR',
  '75000000-0000-4000-8000-000000000001','mission-v1','real-v1',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
) as reservation_id \gset

select public.start_provider_call(:'reservation_id'::uuid);
select public.settle_provider_call(
  :'reservation_id'::uuid,'succeeded',0.050000000,'synthetic-remote',0,0,1,
  '["search"]'::jsonb,1,null,
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
);

do $$
declare
  ledger_rows integer;
  reservation_state text;
  task_reserved numeric;
  task_spent numeric;
begin
  select count(*) into ledger_rows from public.provider_calls
   where reservation_id = (
     select id from public.provider_call_reservations where idempotency_key = 'integration-idempotency'
   );
  select state into reservation_state from public.provider_call_reservations
   where idempotency_key = 'integration-idempotency';
  select reserved_cost,spent_cost into task_reserved,task_spent
    from public.real_task_budgets where task_id = 'integration-task';
  if ledger_rows <> 3 or reservation_state <> 'reconciled' or task_reserved <> 0 or task_spent <> 0.05 then
    raise exception 'REAL_LEDGER_INTEGRATION_ASSERTION_FAILED';
  end if;
end;
$$;

do $$
begin
  begin
    update public.provider_calls set state = 'failed'
     where reservation_id = (
       select id from public.provider_call_reservations where idempotency_key = 'integration-idempotency'
     );
    raise exception 'APPEND_ONLY_TRIGGER_DID_NOT_FIRE';
  exception when others then
    if sqlerrm <> 'REAL_LEDGER_APPEND_ONLY' then
      raise;
    end if;
  end;
end;
$$;

select public.release_real_execution_guard('75000000-0000-4000-8000-000000000002');
rollback;
select 'real-ledger-integration-ok';
`
    const output = execFileSync(
      dockerExecutable,
      ['exec', '-i', 'supabase_db_investighost', 'psql', '-U', 'postgres', '-d', 'postgres'],
      { input: sql, encoding: 'utf8' },
    )

    expect(output).toContain('real-ledger-integration-ok')
  })
})
