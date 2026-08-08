import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const migrationPath = 'supabase/migrations/20260808130000_real_editorial_round_one_budget_review_repair.sql'

describe('reparación durable de revisión presupuestaria tras ronda 1', () => {
  integrationTest('materializa solo la barrera económica y conserva estado, ledger y llamadas', () => {
    const schemaPresent = execFileSync(dockerExecutable, [
      'exec',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-AtXc',
      "select to_regprocedure('public.materialize_real_editorial_round_one_budget_review(uuid,uuid,integer,text)') is not null",
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
  '9d000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000002',
  'morella-real-editorial-pilot-v1',
  'integration-round-one-budget-repair-prepare',
  '9999999999999999999999999999999999999999999999999999999999999999',
  'integration-round-one-budget-repair',
  :'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000,"depth":"standard"},{"profile":"student","enabled":true,"targetWords":1800,"depth":"deep"}]'::jsonb
);
select public.confirm_real_editorial_budget(
  '9d000000-0000-4000-8000-000000000001','2099-08-08'
);
update public.real_editorial_pilot_budgets
   set spent_cost = 0.175406000
 where pilot_id = '9d000000-0000-4000-8000-000000000001';
update public.real_editorial_pilots set state = 'review_required'
 where id = '9d000000-0000-4000-8000-000000000001';
update public.real_editorial_runs
   set state = 'review_required',current_round = 1,accumulated_cost = 0.175406000
 where id = '9d000000-0000-4000-8000-000000000002';

insert into public.real_editorial_incidents (
  id,pilot_id,run_id,code,classification,message
) values (
  '9d000000-0000-4000-8000-000000000003',
  '9d000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000002',
  'REVIEW_REQUIRED','human_required',
  'Pausa sintética prematura tras ronda 1.'
);

insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
) values (
  '9d000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000002',
  'checkpoint','workflow',1,
  '{
    "version":"real-workflow-v1",
    "taskId":"integration-round-one-budget-repair-task",
    "configurationHash":"synthetic",
    "state":"review_required",
    "completedRound":1,
    "lastDecision":{
      "action":"continue_focused",
      "nextRound":2,
      "reason":"Ampliación focalizada sintética.",
      "queries":[
        {"id":"q-access","gapId":"g-access","query":"Acceso transporte y aparcamiento sintéticos","rationale":"Acceso."},
        {"id":"q-routes","gapId":"g-routes","query":"Distancia duración y dificultad sintéticas","rationale":"Rutas."},
        {"id":"q-hours","gapId":"g-hours","query":"Horarios temporadas y precios sintéticos","rationale":"Horarios."}
      ]
    },
    "nextRoundQueries":[],
    "queryHashes":[],
    "providerCalls":6,
    "simulatedCost":0.175406,
    "lastAnalysisCost":0.097406,
    "updatedAt":"2026-08-08T20:00:00.000Z"
  }'::jsonb,
  '9999999999999999999999999999999999999999999999999999999999999999'
);

select public.materialize_real_editorial_round_one_budget_review(
  '9d000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000002',
  1,
  '9999999999999999999999999999999999999999999999999999999999999999'
) as first_review_id \gset
select public.materialize_real_editorial_round_one_budget_review(
  '9d000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000002',
  1,
  '9999999999999999999999999999999999999999999999999999999999999999'
) as repeated_review_id \gset

do $$
begin
  if (select count(*) from public.real_editorial_budget_reviews
       where pilot_id = '9d000000-0000-4000-8000-000000000001') <> 1
    or (select remaining_estimated_cost from public.real_editorial_budget_reviews
        where pilot_id = '9d000000-0000-4000-8000-000000000001') <> 0.205406000
    or (select status from public.real_editorial_budget_reviews
        where pilot_id = '9d000000-0000-4000-8000-000000000001') <> 'pending'
    or (select review_context from public.real_editorial_budget_reviews
        where pilot_id = '9d000000-0000-4000-8000-000000000001') <> 'workflow_completion' then
    raise exception 'ROUND_ONE_BUDGET_REVIEW_INVALID';
  end if;
  if (select task_limit_cost from public.real_editorial_pilot_budgets
       where pilot_id = '9d000000-0000-4000-8000-000000000001') <> 0.2
    or (select spent_cost from public.real_editorial_pilot_budgets
        where pilot_id = '9d000000-0000-4000-8000-000000000001') <> 0.175406
    or (select reserved_cost from public.real_editorial_pilot_budgets
        where pilot_id = '9d000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_CHANGED_LEDGER';
  end if;
  if (select state from public.real_editorial_pilots
       where id = '9d000000-0000-4000-8000-000000000001') <> 'review_required'
    or (select state from public.real_editorial_runs
        where id = '9d000000-0000-4000-8000-000000000002') <> 'review_required' then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_CHANGED_STATE';
  end if;
  if (select count(*) from public.real_editorial_artifacts
       where run_id = '9d000000-0000-4000-8000-000000000002'
         and artifact_kind = 'checkpoint' and artifact_key = 'workflow') <> 1 then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_CHANGED_CHECKPOINT';
  end if;
  if (select count(*) from public.real_editorial_coverage_reviews
       where run_id = '9d000000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_OPENED_COVERAGE';
  end if;
  if (select count(*) from public.real_editorial_call_reservations
       where run_id = '9d000000-0000-4000-8000-000000000002') <> 0
    or (select count(*) from public.real_editorial_provider_calls
        where run_id = '9d000000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_CALLED_PROVIDER';
  end if;
  if (select resolved_at from public.real_editorial_incidents
       where id = '9d000000-0000-4000-8000-000000000003') is null
    or (select count(*) from public.real_editorial_incidents
        where run_id = '9d000000-0000-4000-8000-000000000002'
          and code = 'BUDGET_EXCEEDED' and classification = 'human_required'
          and resolved_at is null) <> 1 then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_INCIDENT_AUDIT_INVALID';
  end if;
  if (select count(*) from public.real_editorial_events
       where run_id = '9d000000-0000-4000-8000-000000000002'
         and event_type = 'real.editorial.budget.review_materialized'
         and payload->>'providerCalled' = 'false'
         and payload->>'workflowResumed' = 'false'
         and payload->>'budgetChanged' = 'false'
         and payload->>'coverageReviewOpened' = 'false') <> 1 then
    raise exception 'ROUND_ONE_BUDGET_REPAIR_AUDIT_EVENT_INVALID';
  end if;
end;
$$;

rollback;
select 'real-editorial-round-one-budget-review-repair-integration-ok';
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
    expect(output).toContain('real-editorial-round-one-budget-review-repair-integration-ok')
  }, 30_000)
})
