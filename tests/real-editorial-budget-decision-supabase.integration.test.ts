import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const migrationPath = 'supabase/migrations/20260727090000_real_editorial_budget_decision.sql'

describe('decisión presupuestaria editorial en Supabase local', () => {
  integrationTest('mantiene, amplía o cancela sin red, duplicados ni pérdida histórica', () => {
    const schemaPresent = execFileSync(dockerExecutable, [
      'exec',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-AtXc',
      "select to_regclass('public.real_editorial_budget_decisions') is not null",
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
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000002',
  'morella-real-editorial-pilot-v1',
  'integration-budget-decision-prepare',
  '1212121212121212121212121212121212121212121212121212121212121212',
  'integration-budget-decision',
  :'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000,"depth":"standard"},{"profile":"student","enabled":true,"targetWords":1800,"depth":"deep"}]'::jsonb
);
select public.confirm_real_editorial_budget(
  '96000000-0000-4000-8000-000000000001','2099-07-27'
);
update public.real_editorial_pilot_budgets
   set spent_cost = 0.099838000
 where pilot_id = '96000000-0000-4000-8000-000000000001';
update public.real_editorial_pilots
   set state = 'review_required'
 where id = '96000000-0000-4000-8000-000000000001';
update public.real_editorial_runs
   set state = 'review_required',current_round = 1,accumulated_cost = 0.099838000
 where id = '96000000-0000-4000-8000-000000000002';

insert into public.real_editorial_incidents (
  id,pilot_id,run_id,code,classification,message
) values (
  '96000000-0000-4000-8000-000000000003',
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000002',
  'BUDGET_EXCEEDED','human_required',
  'La estimación operativa para completar el piloto es 0.157838 EUR adicionales; el ledger deja 0.100162 EUR disponibles; faltan 0.057676 EUR; se requiere decisión humana'
);

insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
) values
(
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000002',
  'checkpoint','workflow',1,
  '{
    "version":"real-workflow-v1",
    "taskId":"integration-budget-task",
    "configurationHash":"synthetic",
    "state":"review_required",
    "completedRound":1,
    "lastDecision":{
      "action":"continue_focused",
      "nextRound":2,
      "reason":"Ampliación focalizada.",
      "queries":[{"id":"q3","gapId":"g3","query":"Morella rutas duración dificultad temporada y seguridad","rationale":"Obtener duración, dificultad, temporada y seguridad."}]
    },
    "nextRoundQueries":[],
    "queryHashes":["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    "providerCalls":2,
    "simulatedCost":0.099838,
    "lastAnalysisCost":0.049838,
    "updatedAt":"2026-07-26T01:37:38.128Z"
  }'::jsonb,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
),
(
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000002',
  'tavily_result','round-1',1,'{"round":1,"sources":[]}'::jsonb,
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
),
(
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000002',
  'round','round-1',1,'{"round":1,"analysis":{"decision":"synthetic"}}'::jsonb,
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
),
(
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000002',
  'query','q3',1,
  '{"id":"q3","gapId":"g3","query":"Morella rutas duración dificultad temporada y seguridad","rationale":"Obtener duración, dificultad, temporada y riesgos."}'::jsonb,
  '2bd7a5b5096725ea5a278195925bcad726cb58ce871da23beecf016a90d8a513'
);

select public.open_real_editorial_budget_review(
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000002',
  '96000000-0000-4000-8000-000000000003',
  0.157838000
) as review_id \gset

select public.resolve_real_editorial_budget_review(
  '1111111111111111111111111111111111111111111111111111111111111111',
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000002',
  '96000000-0000-4000-8000-000000000004',
  'keep_limit',0.200000000,'Mantener el bloqueo sintético.',null,
  null,null,null,null
) as keep_id \gset
select public.resolve_real_editorial_budget_review(
  '1111111111111111111111111111111111111111111111111111111111111111',
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000002',
  '96000000-0000-4000-8000-000000000004',
  'keep_limit',0.200000000,'Mantener el bloqueo sintético.',null,
  null,null,null,null
) as repeated_keep_id \gset

do $$
begin
  if (select count(*) from public.real_editorial_budget_decisions
       where decision_key = '1111111111111111111111111111111111111111111111111111111111111111') <> 1 then
    raise exception 'KEEP_LIMIT_NOT_IDEMPOTENT';
  end if;
  if (select state from public.real_editorial_pilots
       where id = '96000000-0000-4000-8000-000000000001') <> 'review_required'
    or (select state from public.real_editorial_runs
        where id = '96000000-0000-4000-8000-000000000002') <> 'review_required' then
    raise exception 'KEEP_LIMIT_REMOVED_BLOCK';
  end if;
  if (select task_limit_cost from public.real_editorial_pilot_budgets
       where pilot_id = '96000000-0000-4000-8000-000000000001') <> 0.2 then
    raise exception 'KEEP_LIMIT_CHANGED_BUDGET';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.resolve_real_editorial_budget_review(
      '2222222222222222222222222222222222222222222222222222222222222222',
      '96000000-0000-4000-8000-000000000001',
      '96000000-0000-4000-8000-000000000002',
      '96000000-0000-4000-8000-000000000004',
      'authorize_extension',-1,'Máximo negativo sintético.',null,
      2,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '{"state":"researching_round_2"}'::jsonb,
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
    );
    raise exception 'NEGATIVE_MAXIMUM_WAS_NOT_REJECTED';
  exception when others then
    if sqlerrm not in ('BUDGET_DECISION_MAXIMUM_INVALID','BUDGET_EXTENSION_NOT_GREATER') then raise; end if;
  end;
  begin
    perform public.resolve_real_editorial_budget_review(
      '3333333333333333333333333333333333333333333333333333333333333333',
      '96000000-0000-4000-8000-000000000001',
      '96000000-0000-4000-8000-000000000002',
      '96000000-0000-4000-8000-000000000004',
      'authorize_extension','NaN'::numeric,'Máximo no finito sintético.',null,
      2,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '{"state":"researching_round_2"}'::jsonb,
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
    );
    raise exception 'NON_FINITE_MAXIMUM_WAS_NOT_REJECTED';
  exception when others then
    if sqlerrm <> 'BUDGET_DECISION_MAXIMUM_INVALID' then raise; end if;
  end;
  begin
    perform public.resolve_real_editorial_budget_review(
      '4444444444444444444444444444444444444444444444444444444444444444',
      '96000000-0000-4000-8000-000000000001',
      '96000000-0000-4000-8000-000000000002',
      '96000000-0000-4000-8000-000000000004',
      'authorize_extension',0.050000000,'Máximo inferior al ledger.',null,
      2,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '{"state":"researching_round_2"}'::jsonb,
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
    );
    raise exception 'BELOW_LEDGER_MAXIMUM_WAS_NOT_REJECTED';
  exception when others then
    if sqlerrm not in ('BUDGET_EXTENSION_BELOW_LEDGER','BUDGET_EXTENSION_NOT_GREATER') then raise; end if;
  end;
  begin
    perform public.resolve_real_editorial_budget_review(
      '5555555555555555555555555555555555555555555555555555555555555555',
      '96000000-0000-4000-8000-000000000001',
      '96000000-0000-4000-8000-000000000002',
      '96000000-0000-4000-8000-000000000004',
      'authorize_extension',0.250000000,'Máximo inferior al total.',null,
      2,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '{"state":"researching_round_2"}'::jsonb,
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
    );
    raise exception 'BELOW_TOTAL_MAXIMUM_WAS_NOT_REJECTED';
  exception when others then
    if sqlerrm <> 'BUDGET_EXTENSION_BELOW_TOTAL_ESTIMATE' then raise; end if;
  end;
end;
$$;

select public.resolve_real_editorial_budget_review(
  '6666666666666666666666666666666666666666666666666666666666666666',
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000002',
  '96000000-0000-4000-8000-000000000004',
  'authorize_extension',0.270000000,'Ampliación humana sintética.',null,
  2,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '{
    "version":"real-workflow-v1",
    "taskId":"integration-budget-task",
    "configurationHash":"synthetic",
    "state":"researching_round_2",
    "completedRound":1,
    "lastDecision":{
      "action":"continue_focused",
      "nextRound":2,
      "reason":"Ampliación focalizada.",
      "queries":[{"id":"q3","gapId":"g3","query":"Morella rutas duración dificultad temporada y seguridad","rationale":"Obtener duración, dificultad, temporada y seguridad."}]
    },
    "nextRoundQueries":[{"id":"q3","gapId":"g3","query":"Morella rutas duración dificultad temporada y seguridad","rationale":"Obtener duración, dificultad, temporada y seguridad."}],
    "queryHashes":["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    "providerCalls":2,
    "simulatedCost":0.099838,
    "lastAnalysisCost":0.049838,
    "updatedAt":"2026-07-27T10:00:00.000Z"
  }'::jsonb,
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
) as extension_id \gset
select public.resolve_real_editorial_budget_review(
  '6666666666666666666666666666666666666666666666666666666666666666',
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000002',
  '96000000-0000-4000-8000-000000000004',
  'authorize_extension',0.270000000,'Ampliación humana sintética.',null,
  2,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  null,null
) as repeated_extension_id \gset

do $$
begin
  if (select count(*) from public.real_editorial_budget_decisions
       where decision_key = '6666666666666666666666666666666666666666666666666666666666666666') <> 1 then
    raise exception 'IDENTICAL_EXTENSION_NOT_IDEMPOTENT';
  end if;
  if (select task_limit_cost from public.real_editorial_pilot_budgets
       where pilot_id = '96000000-0000-4000-8000-000000000001') <> 0.27
    or (select batch_limit_cost from public.real_editorial_pilot_budgets
        where pilot_id = '96000000-0000-4000-8000-000000000001') <> 0.27
    or (select daily_limit_cost from public.real_editorial_pilot_budgets
        where pilot_id = '96000000-0000-4000-8000-000000000001') <> 0.27 then
    raise exception 'EXTENDED_LIMITS_NOT_SYNCHRONIZED';
  end if;
  if (select spent_cost from public.real_editorial_pilot_budgets
       where pilot_id = '96000000-0000-4000-8000-000000000001') <> 0.099838
    or (select reserved_cost from public.real_editorial_pilot_budgets
        where pilot_id = '96000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'LEDGER_HISTORY_CHANGED';
  end if;
  if (select state from public.real_editorial_pilots
       where id = '96000000-0000-4000-8000-000000000001') <> 'preflight'
    or (select state from public.real_editorial_runs
        where id = '96000000-0000-4000-8000-000000000002') <> 'preflight' then
    raise exception 'EXTENSION_DID_NOT_ENABLE_RESUME';
  end if;
  if (select count(*) from public.real_editorial_artifacts
       where run_id = '96000000-0000-4000-8000-000000000002'
         and artifact_kind = 'checkpoint' and artifact_key = 'workflow') <> 2
    or (select payload->>'state' from public.real_editorial_artifacts
        where run_id = '96000000-0000-4000-8000-000000000002'
          and artifact_kind = 'checkpoint' and artifact_key = 'workflow'
        order by version desc limit 1) <> 'researching_round_2' then
    raise exception 'CHECKPOINT_HISTORY_NOT_PRESERVED';
  end if;
  if (select count(*) from public.real_editorial_budget_decisions
       where decision_key = '6666666666666666666666666666666666666666666666666666666666666666') <> 1 then
    raise exception 'EXTENSION_DECISION_DUPLICATED';
  end if;
  if not exists (
    select 1 from public.real_editorial_events
     where pilot_id = '96000000-0000-4000-8000-000000000001'
       and event_type = 'real.editorial.budget.human_decided'
       and payload->>'decision' = 'authorize_extension'
       and payload->>'actorId' = '96000000-0000-4000-8000-000000000004'
  ) then raise exception 'BUDGET_AUTHORIZATION_EVENT_MISSING'; end if;
  if (select count(*) from public.real_editorial_pilots
       where id = '96000000-0000-4000-8000-000000000001') <> 1
    or (select count(*) from public.real_editorial_runs
        where id = '96000000-0000-4000-8000-000000000002') <> 1
    or (select count(*) from public.real_editorial_pilot_budgets
        where pilot_id = '96000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'PILOT_RUN_OR_BUDGET_DUPLICATED';
  end if;
  if (select count(*) from public.real_editorial_call_reservations
       where pilot_id = '96000000-0000-4000-8000-000000000001') <> 0
    or (select count(*) from public.real_editorial_provider_calls
        where pilot_id = '96000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'BUDGET_DECISION_CREATED_PROVIDER_CALL';
  end if;
  if (select count(*) from public.real_editorial_artifacts
       where run_id = '96000000-0000-4000-8000-000000000002'
         and artifact_kind = 'tavily_result' and artifact_key = 'round-1') <> 1
    or (select count(*) from public.real_editorial_artifacts
        where run_id = '96000000-0000-4000-8000-000000000002'
          and artifact_kind = 'round' and artifact_key = 'round-1') <> 1 then
    raise exception 'PERSISTED_PROVIDER_RESULTS_CHANGED';
  end if;
  if (select count(*) from public.real_editorial_artifacts
       where run_id = '96000000-0000-4000-8000-000000000002'
         and artifact_kind = 'query' and artifact_key = 'q3') <> 1
    or (select payload->>'rationale' from public.real_editorial_artifacts
        where run_id = '96000000-0000-4000-8000-000000000002'
          and artifact_kind = 'query' and artifact_key = 'q3') <>
       'Obtener duración, dificultad, temporada y riesgos.'
    or (select payload#>>'{nextRoundQueries,0,rationale}'
          from public.real_editorial_artifacts
         where run_id = '96000000-0000-4000-8000-000000000002'
           and artifact_kind = 'checkpoint' and artifact_key = 'workflow'
         order by version desc limit 1) <>
       'Obtener duración, dificultad, temporada y seguridad.' then
    raise exception 'FOCUSED_QUERY_COLLISION_FIXTURE_INVALID';
  end if;
  begin
    perform public.resolve_real_editorial_budget_review(
      '7777777777777777777777777777777777777777777777777777777777777777',
      '96000000-0000-4000-8000-000000000001',
      '96000000-0000-4000-8000-000000000002',
      '96000000-0000-4000-8000-000000000004',
      'authorize_extension',0.280000000,'Ampliación incompatible.',null,
      null,null,null,null
    );
    raise exception 'INCOMPATIBLE_EXTENSION_NOT_REJECTED';
  exception when others then
    if sqlerrm <> 'BUDGET_DECISION_ALREADY_TERMINAL' then raise; end if;
  end;
end;
$$;

select public.prepare_real_editorial_pilot(
  '96000000-0000-4000-8000-000000000011',
  '96000000-0000-4000-8000-000000000012',
  'morella-real-editorial-pilot-v1',
  'integration-budget-cancel-prepare',
  '3434343434343434343434343434343434343434343434343434343434343434',
  'integration-budget-cancel',
  :'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000,"depth":"standard"},{"profile":"student","enabled":true,"targetWords":1800,"depth":"deep"}]'::jsonb
);
select public.confirm_real_editorial_budget(
  '96000000-0000-4000-8000-000000000011','2099-07-27'
);
update public.real_editorial_pilots set state = 'review_required'
 where id = '96000000-0000-4000-8000-000000000011';
update public.real_editorial_runs set state = 'review_required',current_round = 1
 where id = '96000000-0000-4000-8000-000000000012';
insert into public.real_editorial_incidents (
  id,pilot_id,run_id,code,classification,message
) values (
  '96000000-0000-4000-8000-000000000013',
  '96000000-0000-4000-8000-000000000011',
  '96000000-0000-4000-8000-000000000012',
  'BUDGET_EXCEEDED','human_required',
  'La estimación operativa para completar el piloto es 0.157838 EUR adicionales.'
);
insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
) values (
  '96000000-0000-4000-8000-000000000011',
  '96000000-0000-4000-8000-000000000012',
  'checkpoint','workflow',1,'{"state":"review_required","completedRound":1}'::jsonb,
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
);
select public.open_real_editorial_budget_review(
  '96000000-0000-4000-8000-000000000011',
  '96000000-0000-4000-8000-000000000012',
  '96000000-0000-4000-8000-000000000013',
  0.157838000
);
select public.resolve_real_editorial_budget_review(
  '8888888888888888888888888888888888888888888888888888888888888888',
  '96000000-0000-4000-8000-000000000011',
  '96000000-0000-4000-8000-000000000012',
  '96000000-0000-4000-8000-000000000014',
  'cancel_permanently',0.200000000,'Cancelación definitiva sintética.',null,
  null,null,null,null
);

do $$
begin
  if (select state from public.real_editorial_pilots
       where id = '96000000-0000-4000-8000-000000000011') <> 'cancelled'
    or (select state from public.real_editorial_runs
        where id = '96000000-0000-4000-8000-000000000012') <> 'cancelled' then
    raise exception 'PERMANENT_CANCEL_DID_NOT_CLOSE_RUN';
  end if;
  if (select count(*) from public.real_editorial_artifacts
       where run_id = '96000000-0000-4000-8000-000000000012') <> 1 then
    raise exception 'PERMANENT_CANCEL_CHANGED_ARTIFACT_HISTORY';
  end if;
  if (select count(*) from public.real_editorial_provider_calls
       where pilot_id = '96000000-0000-4000-8000-000000000011') <> 0 then
    raise exception 'PERMANENT_CANCEL_PERFORMED_PROVIDER_CALL';
  end if;
end;
$$;

rollback;
select 'real-editorial-budget-decision-integration-ok';
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
    expect(output).toContain('real-editorial-budget-decision-integration-ok')
  }, 30_000)
})
