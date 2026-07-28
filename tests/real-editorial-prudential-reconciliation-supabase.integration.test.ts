import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const migrationPath =
  'supabase/migrations/20260728213000_real_editorial_prudential_reconciliation.sql'

describe('conciliación prudencial Tavily en Supabase local', () => {
  integrationTest('concilia una vez, conserva indeterminate y solo habilita resume', () => {
    const schemaPresent = execFileSync(dockerExecutable, [
      'exec',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-AtXc',
      `select exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'real_editorial_call_human_resolutions'
           and column_name = 'prudential_cost'
      )`,
    ], { encoding: 'utf8' }).trim() === 't'
    const migration = schemaPresent ? '' : readFileSync(migrationPath, 'utf8')
    const sql = String.raw`
\set ON_ERROR_STOP on
begin;
${migration}

select id as morella_id
  from public.geographic_entities
 where normalized_name = 'morella'
   and country_code = 'ES'
   and entity_type = 'locality'
 limit 1 \gset

select public.prepare_real_editorial_pilot(
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000002',
  'morella-real-editorial-pilot-v1',
  'integration-prudential-reconciliation-prepare',
  '9898989898989898989898989898989898989898989898989898989898989898',
  'integration-prudential-reconciliation',
  :'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000,"depth":"standard"},{"profile":"student","enabled":true,"targetWords":1800,"depth":"deep"}]'::jsonb
);
select public.confirm_real_editorial_budget(
  '98000000-0000-4000-8000-000000000001','2099-07-28'
);

update public.real_editorial_pilot_budgets
   set task_limit_cost = 0.270000000,
       batch_limit_cost = 0.270000000,
       daily_limit_cost = 0.270000000,
       spent_cost = 0.099838000
 where pilot_id = '98000000-0000-4000-8000-000000000001';
update public.real_editorial_pilots
   set state = 'researching_round_2'
 where id = '98000000-0000-4000-8000-000000000001';
update public.real_editorial_runs
   set state = 'researching_round_2',
       current_round = 1,
       accumulated_cost = 0.099838000
 where id = '98000000-0000-4000-8000-000000000002';

select public.acquire_real_editorial_guard(
  'real-editorial:98000000-0000-4000-8000-000000000002',
  '98000000-0000-4000-8000-000000000003',
  now() + interval '10 minutes'
);

insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
) values (
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000002',
  'checkpoint','workflow',12,
  jsonb_build_object(
    'version','real-workflow-v1',
    'state','researching_round_2',
    'completedRound',1,
    'nextRoundQueries',jsonb_build_array(jsonb_build_object(
      'id','q1',
      'gapId','g1',
      'query','Morella turismo oficial horarios tarifas 2026',
      'rationale','Completar horarios y tarifas.'
    ))
  ),
  'abababababababababababababababababababababababababababababababab'
);

select public.reserve_real_editorial_call(
  'integration-prudential-tavily:attempt:1',
  'real-editorial:98000000-0000-4000-8000-000000000002',
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000002',
  'real-editorial-task:98000000-0000-4000-8000-000000000001',
  'real-editorial-batch:98000000-0000-4000-8000-000000000001',
  'researching_round_2','research','tavily','search-and-extract',1,null::uuid,
  0.048000000,'EUR','morella-v1-tavily-search',
  'morella-real-editorial-v1','real-editorial-snapshot-v1',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
) as reservation_id \gset
select call_id as call_id
  from public.real_editorial_call_reservations
 where id = :'reservation_id'::uuid \gset
select public.start_real_editorial_call(:'reservation_id'::uuid);

insert into public.real_editorial_events (
  pilot_id,run_id,event_type,state,payload
) values (
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000002',
  'real.editorial.tavily.request.started',
  null,
  jsonb_build_object(
    'version','tavily-request-v1',
    'correlationId',repeat('c',64),
    'requestHash',repeat('d',64),
    'pathname','/search',
    'query','Morella turismo oficial horarios tarifas 2026',
    'round',2,
    'requestIndex',1,
    'timeoutMs',60000,
    'reservationId',:'reservation_id'::uuid,
    'callId',:'call_id'::uuid,
    'attempt',1,
    'providerState','dispatch_initiated',
    'retrySafe',false
  )
);
select public.settle_real_editorial_call(
  :'reservation_id'::uuid,'unknown',null,null,0,0,1,'[]'::jsonb,0,
  'TIMEOUT',null
);
select public.release_real_editorial_guard(
  '98000000-0000-4000-8000-000000000003'
);

select public.resolve_real_editorial_ambiguous_call(
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000002',
  :'call_id'::uuid,
  '98000000-0000-4000-8000-000000000004',
  'indeterminate',null,null,null,null,
  'El panel sintético no permite determinar el consumo.'
) as indeterminate_id \gset

do $$
declare
  target_call uuid;
begin
  select call_id into target_call
    from public.real_editorial_call_reservations
   where idempotency_key = 'integration-prudential-tavily:attempt:1';
  if (select resolved_at from public.real_editorial_ambiguous_calls
       where call_id = target_call) is not null then
    raise exception 'INDETERMINATE_CLOSED_AMBIGUITY';
  end if;
  if (select reserved_cost from public.real_editorial_pilot_budgets
       where pilot_id = '98000000-0000-4000-8000-000000000001') <> 0.048 then
    raise exception 'INDETERMINATE_RELEASED_RESERVE';
  end if;
end;
$$;

do $$
declare
  target_call uuid;
begin
  select call_id into target_call
    from public.real_editorial_call_reservations
   where idempotency_key = 'integration-prudential-tavily:attempt:1';
  begin
    perform public.reconcile_real_editorial_ambiguous_call_prudential(
      repeat('b',64),
      '98000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000002',
      target_call,
      '98000000-0000-4000-8000-000000000004',
      -0.008,'EUR','Coste negativo sintético.',null,true
    );
    raise exception 'NEGATIVE_PRUDENTIAL_COST_ACCEPTED';
  exception when others then
    if sqlerrm <> 'PRUDENTIAL_COST_INVALID' then raise; end if;
  end;
  begin
    perform public.reconcile_real_editorial_ambiguous_call_prudential(
      repeat('c',64),
      '98000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000002',
      target_call,
      '98000000-0000-4000-8000-000000000004',
      0.049,'EUR','Coste superior a la reserva.',null,true
    );
    raise exception 'COST_ABOVE_RESERVATION_ACCEPTED';
  exception when others then
    if sqlerrm <> 'PRUDENTIAL_COST_ABOVE_RESERVATION' then raise; end if;
  end;
  begin
    perform public.reconcile_real_editorial_ambiguous_call_prudential(
      repeat('d',64),
      '98000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000002',
      target_call,
      '98000000-0000-4000-8000-000000000004',
      0.009,'EUR','Coste superior al máximo de subpetición.',null,true
    );
    raise exception 'COST_ABOVE_SUBREQUEST_MAXIMUM_ACCEPTED';
  exception when others then
    if sqlerrm <> 'PRUDENTIAL_COST_ABOVE_SUBREQUEST_MAXIMUM' then raise; end if;
  end;
  begin
    perform public.reconcile_real_editorial_ambiguous_call_prudential(
      repeat('e',64),
      '98000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000002',
      target_call,
      '98000000-0000-4000-8000-000000000004',
      0.008,'USD','Moneda incorrecta.',null,true
    );
    raise exception 'WRONG_CURRENCY_ACCEPTED';
  exception when others then
    if sqlerrm <> 'PRUDENTIAL_CURRENCY_INVALID' then raise; end if;
  end;
  begin
    perform public.reconcile_real_editorial_ambiguous_call_prudential(
      repeat('f',64),
      '98000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000002',
      target_call,
      null,
      0.008,'EUR','Actor vacío.',null,true
    );
    raise exception 'EMPTY_ACTOR_ACCEPTED';
  exception when others then
    if sqlerrm <> 'PRUDENTIAL_ACTOR_REQUIRED' then raise; end if;
  end;
  begin
    perform public.reconcile_real_editorial_ambiguous_call_prudential(
      repeat('1',64),
      '98000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000002',
      target_call,
      '98000000-0000-4000-8000-000000000004',
      0.008,'EUR','',null,true
    );
    raise exception 'EMPTY_REASON_ACCEPTED';
  exception when others then
    if sqlerrm <> 'PRUDENTIAL_REASON_INVALID' then raise; end if;
  end;
  begin
    perform public.reconcile_real_editorial_ambiguous_call_prudential(
      repeat('2',64),
      '98000000-0000-4000-8000-000000000099',
      '98000000-0000-4000-8000-000000000098',
      target_call,
      '98000000-0000-4000-8000-000000000004',
      0.008,'EUR','Piloto y run incorrectos.',null,true
    );
    raise exception 'WRONG_PILOT_RUN_ACCEPTED';
  exception when others then
    if sqlerrm <> 'AMBIGUOUS_CALL_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.reconcile_real_editorial_ambiguous_call_prudential(
      repeat('3',64),
      '98000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000002',
      '98000000-0000-4000-8000-000000000099',
      '98000000-0000-4000-8000-000000000004',
      0.008,'EUR','Llamada inexistente.',null,true
    );
    raise exception 'MISSING_CALL_ACCEPTED';
  exception when others then
    if sqlerrm <> 'AMBIGUOUS_CALL_NOT_FOUND' then raise; end if;
  end;
  begin
    update public.real_editorial_pilots
       set state = 'cancelled'
     where id = '98000000-0000-4000-8000-000000000001';
    update public.real_editorial_runs
       set state = 'cancelled'
     where id = '98000000-0000-4000-8000-000000000002';
    perform public.reconcile_real_editorial_ambiguous_call_prudential(
      repeat('6',64),
      '98000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000002',
      target_call,
      '98000000-0000-4000-8000-000000000004',
      0.008,'EUR','Estado no conciliable.',null,true
    );
    raise exception 'NON_RECONCILABLE_STATE_ACCEPTED';
  exception when others then
    if sqlerrm <> 'PRUDENTIAL_PILOT_STATE_INVALID' then raise; end if;
  end;
end;
$$;

select public.reconcile_real_editorial_ambiguous_call_prudential(
  '4444444444444444444444444444444444444444444444444444444444444444',
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000002',
  :'call_id'::uuid,
  '98000000-0000-4000-8000-000000000004',
  0.008,'EUR',
  'Tavily no ofrece evidencia granular y se asume el máximo de la subpetición.',
  'Conciliación sintética prudencial.',
  true
) as prudential_id \gset
select public.reconcile_real_editorial_ambiguous_call_prudential(
  '4444444444444444444444444444444444444444444444444444444444444444',
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000002',
  :'call_id'::uuid,
  '98000000-0000-4000-8000-000000000004',
  0.008,'EUR',
  'Tavily no ofrece evidencia granular y se asume el máximo de la subpetición.',
  'Conciliación sintética prudencial.',
  true
) as repeated_prudential_id \gset

do $$
declare
  target_call uuid;
  target_reservation uuid;
  prudential_resolution uuid;
begin
  select id,call_id into target_reservation,target_call
    from public.real_editorial_call_reservations
   where idempotency_key = 'integration-prudential-tavily:attempt:1';
  select id into prudential_resolution
    from public.real_editorial_call_human_resolutions
   where resolution_key =
     '4444444444444444444444444444444444444444444444444444444444444444';
  if prudential_resolution is null then
    raise exception 'PRUDENTIAL_DECISION_NOT_IDEMPOTENT';
  end if;
  if (select count(*) from public.real_editorial_call_human_resolutions
       where call_id = target_call
         and decision = 'indeterminate') <> 1 then
    raise exception 'INDETERMINATE_HISTORY_WAS_NOT_PRESERVED';
  end if;
  if (select count(*) from public.real_editorial_call_human_resolutions
       where call_id = target_call
         and decision = 'prudential_cost_assumed') <> 1 then
    raise exception 'PRUDENTIAL_DECISION_DUPLICATED';
  end if;
  if not exists (
    select 1 from public.real_editorial_call_human_resolutions
     where id = prudential_resolution
       and reservation_id = target_reservation
       and provider_id = 'tavily'
       and operation = 'research'
       and query = 'Morella turismo oficial horarios tarifas 2026'
       and recognized_cost = 0
       and prudential_cost = 0.008
       and released_reserve = 0.040
       and currency = 'EUR'
       and origin = 'human_prudential_reconciliation'
       and provider_confirmed = false
       and duplicate_charge_risk_accepted = true
       and checkpoint_version = 12
       and workflow_version = 'real-workflow-v1'
  ) then raise exception 'PRUDENTIAL_TRACE_INCOMPLETE'; end if;
  if (select spent_cost from public.real_editorial_pilot_budgets
       where pilot_id = '98000000-0000-4000-8000-000000000001') <> 0.107838 then
    raise exception 'PRUDENTIAL_COST_NOT_APPLIED_ONCE';
  end if;
  if (select reserved_cost from public.real_editorial_pilot_budgets
       where pilot_id = '98000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'PRUDENTIAL_RESERVE_NOT_RELEASED';
  end if;
  if (select task_limit_cost-spent_cost-reserved_cost
        from public.real_editorial_pilot_budgets
       where pilot_id = '98000000-0000-4000-8000-000000000001') <> 0.162162 then
    raise exception 'PRUDENTIAL_AVAILABLE_COST_INVALID';
  end if;
  if not exists (
    select 1 from public.real_editorial_ambiguous_calls
     where call_id = target_call
       and resolved_at is not null
       and terminal_decision = 'prudential_cost_assumed'
       and terminal_resolution_id = prudential_resolution
  ) then raise exception 'AMBIGUITY_NOT_CLOSED'; end if;
  if (select state from public.real_editorial_call_reservations
       where id = target_reservation) <> 'failed'
    or (select calculated_cost from public.real_editorial_call_reservations
        where id = target_reservation) <> 0.008 then
    raise exception 'RESERVATION_NOT_RECONCILED';
  end if;
  if not exists (
    select 1 from public.real_editorial_provider_calls
     where call_id = target_call
       and sanitized_error = 'HUMAN_PRUDENTIAL_COST_ASSUMED'
       and calculated_cost = 0.008
       and credits = 0
       and remote_id is null
  ) then raise exception 'PRUDENTIAL_LEDGER_ENTRY_MISSING'; end if;
  if not exists (
    select 1 from public.real_editorial_events
     where pilot_id = '98000000-0000-4000-8000-000000000001'
       and run_id = '98000000-0000-4000-8000-000000000002'
       and event_type = 'real.editorial.remote_call.prudentially_reconciled'
       and payload->>'providerConfirmed' = 'false'
       and payload->>'possibleDuplicateChargeAccepted' = 'true'
       and (payload->>'prudentialCostEur')::numeric = 0.008
  ) then raise exception 'PRUDENTIAL_EVENT_MISSING'; end if;
  if (select state from public.real_editorial_pilots
       where id = '98000000-0000-4000-8000-000000000001') <> 'preflight'
    or (select state from public.real_editorial_runs
        where id = '98000000-0000-4000-8000-000000000002') <> 'preflight' then
    raise exception 'CHECKPOINT_NOT_ENABLED_FOR_RESUME';
  end if;
  if not exists (
    select 1 from public.real_editorial_artifacts
     where run_id = '98000000-0000-4000-8000-000000000002'
       and artifact_kind = 'checkpoint'
       and artifact_key = 'workflow'
       and version = 12
  ) then raise exception 'CHECKPOINT_WAS_CHANGED'; end if;
  if exists (
    select 1 from public.real_editorial_ambiguous_calls
     where pilot_id = '98000000-0000-4000-8000-000000000001'
       and run_id = '98000000-0000-4000-8000-000000000002'
       and resolved_at is null
  ) then raise exception 'UNRESOLVED_AMBIGUITY_REMAINS'; end if;
  if (select owner_execution_id from public.real_editorial_execution_guard
       where guard_name = 'morella-real-editorial') is not null then
    raise exception 'GUARD_WAS_ACQUIRED';
  end if;
  if (select count(*) from public.real_editorial_pilots
       where id = '98000000-0000-4000-8000-000000000001') <> 1
    or (select count(*) from public.real_editorial_runs
        where id = '98000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'PILOT_OR_RUN_DUPLICATED';
  end if;
  if exists (
    select 1 from public.real_editorial_call_reservations
     where pilot_id = '98000000-0000-4000-8000-000000000001'
       and provider_id = 'openai'
  ) then raise exception 'OPENAI_WAS_INVOKED'; end if;
  if (select publication_count from public.real_editorial_pilots
       where id = '98000000-0000-4000-8000-000000000001') <> 0
    or (select trawel_connected from public.real_editorial_pilots
        where id = '98000000-0000-4000-8000-000000000001') <> false
    or (select automatic_enabled from public.real_editorial_pilots
        where id = '98000000-0000-4000-8000-000000000001') <> false then
    raise exception 'EXTERNAL_BOUNDARIES_CHANGED';
  end if;
  begin
    perform public.resolve_real_editorial_ambiguous_call(
      '5555555555555555555555555555555555555555555555555555555555555555',
      '98000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000002',
      target_call,
      '98000000-0000-4000-8000-000000000099',
      'no_consumption',null,null,null,null,'Decisión incompatible.'
    );
    raise exception 'INCOMPATIBLE_DECISION_ACCEPTED';
  exception when others then
    if sqlerrm <> 'AMBIGUOUS_CALL_ALREADY_RESOLVED' then raise; end if;
  end;
end;
$$;

select 'PRUDENTIAL_ROLLBACK_OK';
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
    expect(output).toContain('PRUDENTIAL_ROLLBACK_OK')
    expect(output).toContain('ROLLBACK')
  }, 30_000)
})
