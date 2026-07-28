import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const migrationPath = 'supabase/migrations/20260726013000_real_editorial_ambiguous_call_resolution.sql'

describe('timeout Tavily durable en Supabase local', () => {
  integrationTest('bloquea el resultado ambiguo y reutiliza su respuesta tardía sin duplicar', () => {
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
  '94000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000002',
  'morella-real-editorial-pilot-v1',
  'integration-tavily-timeout-prepare',
  '9494949494949494949494949494949494949494949494949494949494949494',
  'integration-tavily-timeout',
  :'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000,"depth":"standard"},{"profile":"student","enabled":true,"targetWords":1800,"depth":"deep"}]'::jsonb
);
select public.confirm_real_editorial_budget(
  '94000000-0000-4000-8000-000000000001','2099-07-28'
);
select public.acquire_real_editorial_guard(
  'real-editorial:94000000-0000-4000-8000-000000000002',
  '94000000-0000-4000-8000-000000000003',
  now() + interval '10 minutes'
);

select public.reserve_real_editorial_call(
  'integration-tavily-timeout:attempt:1',
  'real-editorial:94000000-0000-4000-8000-000000000002',
  '94000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000002',
  'real-editorial-task:94000000-0000-4000-8000-000000000001',
  'real-editorial-batch:94000000-0000-4000-8000-000000000001',
  'researching_round_2','research','tavily','search-and-extract',1,null::uuid,
  0.048000000,'EUR','morella-v1-tavily-search',
  'morella-real-editorial-v1','real-editorial-snapshot-v1',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
) as reservation_one \gset
select call_id as call_one from public.real_editorial_call_reservations
 where id = :'reservation_one'::uuid \gset
select public.start_real_editorial_call(:'reservation_one'::uuid);

insert into public.real_editorial_events (
  pilot_id,run_id,event_type,state,payload
) values (
  '94000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000002',
  'real.editorial.tavily.request.started',
  null,
  jsonb_build_object(
    'version','tavily-request-v1',
    'correlationId',repeat('c',64),
    'requestHash',repeat('d',64),
    'pathname','/search',
    'query','Morella patrimonio oficial',
    'round',2,
    'requestIndex',1,
    'timeoutMs',60000,
    'reservationId',:'reservation_one'::uuid,
    'callId',:'call_one'::uuid,
    'attempt',1,
    'providerState','dispatch_initiated',
    'retrySafe',false
  )
);

select public.settle_real_editorial_call(
  :'reservation_one'::uuid,'unknown',null,null,0,0,1,'[]'::jsonb,0,
  'TIMEOUT',null
);

do $$
begin
  if (select state from public.real_editorial_call_reservations
       where idempotency_key = 'integration-tavily-timeout:attempt:1') <> 'unknown' then
    raise exception 'AMBIGUOUS_RESERVATION_NOT_RETAINED';
  end if;
  if (select reserved_cost from public.real_editorial_pilot_budgets
       where pilot_id = '94000000-0000-4000-8000-000000000001') <> 0.048 then
    raise exception 'AMBIGUOUS_COST_GUARD_NOT_RETAINED';
  end if;
  if (select spent_cost from public.real_editorial_pilot_budgets
       where pilot_id = '94000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'AMBIGUOUS_COST_WAS_ASSUMED';
  end if;
  if not exists (
    select 1 from public.real_editorial_ambiguous_calls
     where call_id = (
       select call_id from public.real_editorial_call_reservations
        where idempotency_key = 'integration-tavily-timeout:attempt:1'
     ) and resolved_at is null
  ) then raise exception 'AMBIGUOUS_CALL_NOT_RECORDED'; end if;
  begin
    perform public.reserve_real_editorial_call(
      'integration-tavily-timeout:attempt:2',
      'real-editorial:94000000-0000-4000-8000-000000000002',
      '94000000-0000-4000-8000-000000000001',
      '94000000-0000-4000-8000-000000000002',
      'real-editorial-task:94000000-0000-4000-8000-000000000001',
      'real-editorial-batch:94000000-0000-4000-8000-000000000001',
      'researching_round_2','research','tavily','search-and-extract',2,
      (select call_id from public.real_editorial_call_reservations
        where idempotency_key = 'integration-tavily-timeout:attempt:1'),
      0.048000000,'EUR','morella-v1-tavily-search',
      'morella-real-editorial-v1','real-editorial-snapshot-v1',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
    raise exception 'AMBIGUOUS_RETRY_WAS_NOT_BLOCKED';
  exception when others then
    if sqlerrm not in (
      'AMBIGUOUS_TIMEOUT_NOT_RETRYABLE',
      'AMBIGUOUS_CALL_REQUIRES_HUMAN_RESOLUTION'
    ) then raise; end if;
  end;
end;
$$;

insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
) values (
  '94000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000002',
  'tavily_result',
  'request-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  1,
  jsonb_build_object(
    'version','tavily-request-v1',
    'correlationId',repeat('c',64),
    'requestHash',repeat('d',64),
    'pathname','/search',
    'query','Morella patrimonio oficial',
    'round',2,
    'requestIndex',1,
    'originCallId',:'call_one'::uuid,
    'originReservationId',:'reservation_one'::uuid,
    'originAttempt',1,
    'responseStatus',200,
    'responseBody',jsonb_build_object(
      'request_id','synthetic-late-request',
      'results',jsonb_build_array(),
      'usage',jsonb_build_object('credits',1)
    )
  ),
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
);
insert into public.real_editorial_events (
  pilot_id,run_id,event_type,state,payload
) values (
  '94000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000002',
  'real.editorial.tavily.request.late_completed',
  null,
  jsonb_build_object(
    'correlationId',repeat('c',64),
    'query','Morella patrimonio oficial',
    'providerState','late_response_persisted',
    'providerRequestId','synthetic-late-request',
    'credits',1,
    'retrySafe',true
  )
);

select public.resolve_real_editorial_ambiguous_call(
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '94000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000002',
  :'call_one'::uuid,
  '94000000-0000-4000-8000-000000000004',
  'consumption_confirmed',0.008,1,0,0,'Consumo sintético confirmado por request ID.'
);

select public.reserve_real_editorial_call(
  'integration-tavily-timeout:attempt:2',
  'real-editorial:94000000-0000-4000-8000-000000000002',
  '94000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000002',
  'real-editorial-task:94000000-0000-4000-8000-000000000001',
  'real-editorial-batch:94000000-0000-4000-8000-000000000001',
  'researching_round_2','research','tavily','search-and-extract',2,
  :'call_one'::uuid,0.048000000,'EUR','morella-v1-tavily-search',
  'morella-real-editorial-v1','real-editorial-snapshot-v1',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
) as reservation_two \gset
select public.reserve_real_editorial_call(
  'integration-tavily-timeout:attempt:2',
  'real-editorial:94000000-0000-4000-8000-000000000002',
  '94000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000002',
  'real-editorial-task:94000000-0000-4000-8000-000000000001',
  'real-editorial-batch:94000000-0000-4000-8000-000000000001',
  'researching_round_2','research','tavily','search-and-extract',2,
  :'call_one'::uuid,0.048000000,'EUR','morella-v1-tavily-search',
  'morella-real-editorial-v1','real-editorial-snapshot-v1',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
) as repeated_reservation_two \gset

do $$
begin
  if (select count(*) from public.real_editorial_call_reservations
       where idempotency_key = 'integration-tavily-timeout:attempt:2') <> 1 then
    raise exception 'RETRY_RESERVATION_NOT_IDEMPOTENT';
  end if;
  if (select count(*) from public.real_editorial_call_reservations
       where idempotency_key like 'integration-tavily-timeout:attempt:%') <> 2 then
    raise exception 'RESERVATION_DUPLICATED';
  end if;
  if (select spent_cost from public.real_editorial_pilot_budgets
       where pilot_id = '94000000-0000-4000-8000-000000000001') <> 0.008 then
    raise exception 'CONFIRMED_COST_NOT_RECONCILED';
  end if;
  if (select reserved_cost from public.real_editorial_pilot_budgets
       where pilot_id = '94000000-0000-4000-8000-000000000001') <> 0.048 then
    raise exception 'CONTROLLED_RETRY_NOT_RESERVED_ONCE';
  end if;
  if (select count(*) from public.real_editorial_artifacts
       where run_id = '94000000-0000-4000-8000-000000000002'
         and artifact_kind = 'tavily_result'
         and artifact_key =
           'request-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc') <> 1 then
    raise exception 'LATE_RESULT_NOT_DURABLE_OR_DUPLICATED';
  end if;
  if (select count(*) from public.real_editorial_events
       where run_id = '94000000-0000-4000-8000-000000000002'
         and event_type = 'real.editorial.tavily.request.started'
         and payload->>'query' = 'Morella patrimonio oficial') <> 1 then
    raise exception 'QUERY_WAS_REPEATED';
  end if;
  if exists (
    select 1 from public.real_editorial_artifacts
     where run_id = '94000000-0000-4000-8000-000000000002'
       and artifact_kind = 'tavily_result' and artifact_key = 'round-2'
  ) then raise exception 'WORKFLOW_CONTINUED_UNEXPECTEDLY'; end if;
  if exists (
    select 1 from public.real_editorial_call_reservations
     where run_id = '94000000-0000-4000-8000-000000000002'
       and provider_id = 'openai'
  ) then raise exception 'OPENAI_WAS_INVOKED'; end if;
  if (select publication_count from public.real_editorial_pilots
       where id = '94000000-0000-4000-8000-000000000001') <> 0
    or (select trawel_connected from public.real_editorial_pilots
        where id = '94000000-0000-4000-8000-000000000001') <> false
    or (select automatic_enabled from public.real_editorial_pilots
        where id = '94000000-0000-4000-8000-000000000001') <> false then
    raise exception 'EXTERNAL_BOUNDARIES_CHANGED';
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
