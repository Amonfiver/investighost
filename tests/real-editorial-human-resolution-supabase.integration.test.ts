import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const migrationPath = 'supabase/migrations/20260726013000_real_editorial_ambiguous_call_resolution.sql'

describe('resolución humana durable de llamadas ambiguas en Supabase local', () => {
  integrationTest('resuelve sin red, conserva historial e impide retries no autorizados', () => {
    const schemaPresent = execFileSync(dockerExecutable, [
      'exec',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-AtXc',
      "select to_regclass('public.real_editorial_ambiguous_calls') is not null",
    ], { encoding: 'utf8' }).trim() === 't'
    const migration = schemaPresent ? '' : readFileSync(migrationPath, 'utf8')
    const sql = String.raw`
\set ON_ERROR_STOP on
begin;
${migration}

select id as morella_id from public.geographic_entities
 where normalized_name = 'morella' and country_code = 'ES' and entity_type = 'locality'
 limit 1 \gset

select public.prepare_real_editorial_pilot(
  '93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002',
  'morella-real-editorial-pilot-v1',
  'integration-human-resolution-prepare',
  '9999999999999999999999999999999999999999999999999999999999999999',
  'integration-human-resolution',
  :'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000,"depth":"standard"},{"profile":"student","enabled":true,"targetWords":1800,"depth":"deep"}]'::jsonb
);
select public.confirm_real_editorial_budget(
  '93000000-0000-4000-8000-000000000001','2099-07-26'
);
select public.acquire_real_editorial_guard(
  'real-editorial:93000000-0000-4000-8000-000000000002',
  '93000000-0000-4000-8000-000000000003',
  now() + interval '10 minutes'
);

select public.reserve_real_editorial_call(
  'integration-human-call-a:attempt:1',
  'real-editorial:93000000-0000-4000-8000-000000000002',
  '93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002',
  'real-editorial-task:93000000-0000-4000-8000-000000000001',
  'real-editorial-batch:93000000-0000-4000-8000-000000000001',
  'evaluating_round_1','analysis','openai','gpt-5.6-luna',1,null::uuid,
  0.022000000,'EUR','morella-v1-openai-responses',
  'morella-real-editorial-v1','real-editorial-snapshot-v1',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
) as reservation_a \gset
select call_id as call_a from public.real_editorial_call_reservations
 where id = :'reservation_a'::uuid \gset
select public.start_real_editorial_call(:'reservation_a'::uuid);
select public.settle_real_editorial_call(
  :'reservation_a'::uuid,'unknown',null,null,0,0,1,'[]'::jsonb,0,
  'NETWORK_AMBIGUOUS',null
);

do $$
declare target_call uuid;
begin
  select call_id into target_call from public.real_editorial_call_reservations
   where idempotency_key = 'integration-human-call-a:attempt:1';
  if not exists (
    select 1 from public.real_editorial_ambiguous_calls
     where call_id = target_call and source_state = 'unknown' and resolved_at is null
  ) then raise exception 'UNKNOWN_CALL_WAS_NOT_REGISTERED'; end if;
  begin
    perform public.reserve_real_editorial_call(
      'integration-human-call-a:attempt:2',
      'real-editorial:93000000-0000-4000-8000-000000000002',
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000002',
      'real-editorial-task:93000000-0000-4000-8000-000000000001',
      'real-editorial-batch:93000000-0000-4000-8000-000000000001',
      'evaluating_round_1','analysis','openai','gpt-5.6-luna',2,target_call,
      0.022000000,'EUR','morella-v1-openai-responses',
      'morella-real-editorial-v1','real-editorial-snapshot-v1',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
    raise exception 'UNRESOLVED_RETRY_WAS_NOT_BLOCKED';
  exception when others then
    if sqlerrm not in (
      'AMBIGUOUS_TIMEOUT_NOT_RETRYABLE',
      'AMBIGUOUS_CALL_REQUIRES_HUMAN_RESOLUTION'
    ) then raise; end if;
  end;
end;
$$;

select public.resolve_real_editorial_ambiguous_call(
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002',
  :'call_a'::uuid,
  '93000000-0000-4000-8000-000000000004',
  'indeterminate',null,null,null,null,'Todavía no consta en el panel.'
) as indeterminate_id \gset
select public.resolve_real_editorial_ambiguous_call(
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002',
  :'call_a'::uuid,
  '93000000-0000-4000-8000-000000000004',
  'indeterminate',null,null,null,null,'Todavía no consta en el panel.'
) as repeated_indeterminate_id \gset

do $$
declare target_call uuid;
begin
  select call_id into target_call from public.real_editorial_call_reservations
   where idempotency_key = 'integration-human-call-a:attempt:1';
  if (select count(*) from public.real_editorial_call_human_resolutions
       where resolution_key = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') <> 1 then
    raise exception 'IDENTICAL_RESOLUTION_NOT_IDEMPOTENT';
  end if;
  if (select resolved_at from public.real_editorial_ambiguous_calls
       where call_id = target_call) is not null then
    raise exception 'INDETERMINATE_DECISION_CLOSED_REVIEW';
  end if;
  begin
    perform public.resolve_real_editorial_ambiguous_call(
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000002',
      target_call,'93000000-0000-4000-8000-000000000004',
      'consumption_confirmed',-0.01,0,1,0,null
    );
    raise exception 'NEGATIVE_COST_WAS_NOT_REJECTED';
  exception when others then
    if sqlerrm <> 'HUMAN_RESOLUTION_USAGE_INVALID' then raise; end if;
  end;
  begin
    perform public.resolve_real_editorial_ambiguous_call(
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000002',
      target_call,'93000000-0000-4000-8000-000000000004',
      'consumption_confirmed',0.201,0,1,0,null
    );
    raise exception 'OVER_BUDGET_COST_WAS_NOT_REJECTED';
  exception when others then
    if sqlerrm <> 'HUMAN_RESOLUTION_BUDGET_EXCEEDED' then raise; end if;
  end;
end;
$$;

select public.resolve_real_editorial_ambiguous_call(
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  '93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002',
  :'call_a'::uuid,
  '93000000-0000-4000-8000-000000000004',
  'no_consumption',null,null,null,null,'OpenAI no registra consumo.'
);

select public.reserve_real_editorial_call(
  'integration-human-call-a:attempt:2',
  'real-editorial:93000000-0000-4000-8000-000000000002',
  '93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002',
  'real-editorial-task:93000000-0000-4000-8000-000000000001',
  'real-editorial-batch:93000000-0000-4000-8000-000000000001',
  'evaluating_round_1','analysis','openai','gpt-5.6-luna',2,:'call_a'::uuid,
  0.022000000,'EUR','morella-v1-openai-responses',
  'morella-real-editorial-v1','real-editorial-snapshot-v1',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
) as retry_a \gset
select public.settle_real_editorial_call(
  :'retry_a'::uuid,'failed',0,null,0,0,0,'[]'::jsonb,0,'SYNTHETIC_NO_NETWORK',null
);

select public.reserve_real_editorial_call(
  'integration-human-call-b:attempt:1',
  'real-editorial:93000000-0000-4000-8000-000000000002',
  '93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002',
  'real-editorial-task:93000000-0000-4000-8000-000000000001',
  'real-editorial-batch:93000000-0000-4000-8000-000000000001',
  'generating_adventure','drafting','openai','gpt-5.6-luna',1,null::uuid,
  0.040000000,'EUR','morella-v1-openai-responses',
  'morella-real-editorial-v1','real-editorial-snapshot-v1',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
) as reservation_b \gset
select call_id as call_b from public.real_editorial_call_reservations
 where id = :'reservation_b'::uuid \gset
select public.start_real_editorial_call(:'reservation_b'::uuid);
select public.settle_real_editorial_call(
  :'reservation_b'::uuid,'unknown',null,null,0,0,1,'[]'::jsonb,0,
  'REMOTE_RESPONSE_ERROR',null
);
select public.resolve_real_editorial_ambiguous_call(
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002',
  :'call_b'::uuid,
  '93000000-0000-4000-8000-000000000004',
  'consumption_confirmed',0.005,0,120,30,'Consumo comprobado en OpenAI.'
);

do $$
declare target_call uuid;
begin
  select call_id into target_call from public.real_editorial_call_reservations
   where idempotency_key = 'integration-human-call-b:attempt:1';
  if (select spent_cost from public.real_editorial_pilot_budgets
       where pilot_id = '93000000-0000-4000-8000-000000000001') <> 0.005 then
    raise exception 'CONFIRMED_COST_NOT_APPLIED';
  end if;
  if (select reserved_cost from public.real_editorial_pilot_budgets
       where pilot_id = '93000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'AMBIGUOUS_RESERVE_NOT_RELEASED';
  end if;
  if (select state from public.real_editorial_runs
       where id = '93000000-0000-4000-8000-000000000002') <> 'preflight' then
    raise exception 'RUN_NOT_READY_TO_RESUME';
  end if;
  if not exists (
    select 1 from public.real_editorial_provider_calls
     where call_id = target_call and sanitized_error = 'HUMAN_CONFIRMED_CONSUMPTION'
       and calculated_cost = 0.005 and input_tokens = 120 and output_tokens = 30
  ) then raise exception 'HUMAN_RECONCILIATION_LEDGER_ENTRY_MISSING'; end if;
  if not exists (
    select 1 from public.real_editorial_events
     where pilot_id = '93000000-0000-4000-8000-000000000001'
       and event_type = 'real.editorial.remote_call.human_decided'
       and payload->>'actorId' = '93000000-0000-4000-8000-000000000004'
       and payload->>'decision' = 'consumption_confirmed'
  ) then raise exception 'HUMAN_DECISION_EVENT_MISSING'; end if;
  begin
    perform public.resolve_real_editorial_ambiguous_call(
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000002',
      target_call,'93000000-0000-4000-8000-000000000004',
      'no_consumption',null,null,null,null,null
    );
    raise exception 'INCOMPATIBLE_DOUBLE_RESOLUTION_NOT_REJECTED';
  exception when others then
    if sqlerrm <> 'AMBIGUOUS_CALL_ALREADY_RESOLVED' then raise; end if;
  end;
end;
$$;

select public.reserve_real_editorial_call(
  'integration-human-call-c:attempt:1',
  'real-editorial:93000000-0000-4000-8000-000000000002',
  '93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002',
  'real-editorial-task:93000000-0000-4000-8000-000000000001',
  'real-editorial-batch:93000000-0000-4000-8000-000000000001',
  'final_review','review','openai','gpt-5.6-luna',1,null::uuid,
  0.020000000,'EUR','morella-v1-openai-responses',
  'morella-real-editorial-v1','real-editorial-snapshot-v1',
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
) as reservation_c \gset
select call_id as call_c from public.real_editorial_call_reservations
 where id = :'reservation_c'::uuid \gset
select public.start_real_editorial_call(:'reservation_c'::uuid);
select public.settle_real_editorial_call(
  :'reservation_c'::uuid,'unknown',null,null,0,0,1,'[]'::jsonb,0,
  'NETWORK_AMBIGUOUS',null
);
select count(*) as call_entries_before_cancel
  from public.real_editorial_provider_calls where call_id = :'call_c'::uuid \gset
select public.resolve_real_editorial_ambiguous_call(
  '1111111111111111111111111111111111111111111111111111111111111111',
  '93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002',
  :'call_c'::uuid,
  '93000000-0000-4000-8000-000000000004',
  'cancel_permanently',null,null,null,null,'Cancelación operativa definitiva.'
);

do $$
begin
  if (select state from public.real_editorial_pilots
       where id = '93000000-0000-4000-8000-000000000001') <> 'cancelled'
    or (select state from public.real_editorial_runs
        where id = '93000000-0000-4000-8000-000000000002') <> 'cancelled' then
    raise exception 'PERMANENT_CANCEL_DID_NOT_CLOSE_RUN';
  end if;
  if (select count(*) from public.real_editorial_provider_calls
       where call_id = (
         select call_id from public.real_editorial_call_reservations
          where idempotency_key = 'integration-human-call-c:attempt:1'
       )) <> 3 then
    raise exception 'CANCEL_PERFORMED_PROVIDER_CALL';
  end if;
  if exists (
    select 1 from public.real_editorial_provider_calls
     where pilot_id = '93000000-0000-4000-8000-000000000001'
       and provider_id = 'tavily'
  ) then raise exception 'TAVILY_WAS_CALLED'; end if;
  if (select count(*) from public.real_editorial_pilots
       where id = '93000000-0000-4000-8000-000000000001') <> 1
    or (select count(*) from public.real_editorial_runs
        where id = '93000000-0000-4000-8000-000000000002') <> 1
    or (select count(*) from public.real_editorial_pilot_budgets
        where pilot_id = '93000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'PILOT_RUN_OR_BUDGET_DUPLICATED';
  end if;
end;
$$;

rollback;
`
    const output = execFileSync(dockerExecutable, [
      'exec',
      '-i',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-X',
    ], {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    })
    expect(output).toContain('ROLLBACK')
  }, 30_000)
})
