import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const migrationPath =
  'supabase/migrations/20260809110000_real_editorial_coverage_budget_within_limit.sql'
const recoveryMigrationPath =
  'supabase/migrations/20260809113000_real_editorial_drafting_checkpoint_recovery.sql'

describe('presupuesto de cobertura dentro del máximo vigente', () => {
  integrationTest('habilita redacción sin ampliar 0,420000 EUR ni llamar proveedores', () => {
    const schemaPresent = execFileSync(dockerExecutable, [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-AtXc',
      "select to_regprocedure('public.resolve_real_editorial_coverage_budget_within_limit(text,uuid,uuid,uuid,text,numeric,text,text,integer,text,jsonb,text)') is not null",
    ], { encoding: 'utf8' }).trim() === 't'
    const migration = schemaPresent ? '' : readFileSync(migrationPath, 'utf8')
    const recoverySchemaPresent = execFileSync(dockerExecutable, [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-AtXc',
      "select to_regprocedure('public.reconcile_real_editorial_drafting_checkpoint_incident(text,uuid,uuid,uuid,uuid,uuid,uuid,text,integer,text)') is not null",
    ], { encoding: 'utf8' }).trim() === 't'
    const recoveryMigration = recoverySchemaPresent
      ? ''
      : readFileSync(recoveryMigrationPath, 'utf8')
    const sql = String.raw`
\set ON_ERROR_STOP on
begin;
${migration}
${recoveryMigration}

select id as destination_id from public.geographic_entities
 where normalized_name='morella' and country_code='ES' and entity_type='locality'
 limit 1 \gset
select public.prepare_real_editorial_pilot(
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'morella-real-editorial-pilot-v1',
  'integration-coverage-within-limit-prepare',repeat('9',64),
  'integration-coverage-within-limit',:'destination_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000,"depth":"standard"},{"profile":"student","enabled":true,"targetWords":1800,"depth":"deep"}]'::jsonb
);
select public.confirm_real_editorial_budget(
  'b2000000-0000-4000-8000-000000000001','2099-08-09'
);
update public.real_editorial_pilot_budgets
   set task_limit_cost=0.420000000,batch_limit_cost=0.420000000,
       daily_limit_cost=0.420000000,spent_cost=0.308318000,reserved_cost=0
 where pilot_id='b2000000-0000-4000-8000-000000000001';
update public.real_editorial_pilots set state='review_required'
 where id='b2000000-0000-4000-8000-000000000001';
update public.real_editorial_runs
   set state='review_required',current_round=2,checkpoint_version=8,
       accumulated_cost=0.308318000
 where id='b2000000-0000-4000-8000-000000000002';
insert into public.real_editorial_incidents (
  id,pilot_id,run_id,code,classification,message
) values (
  'b2000000-0000-4000-8000-000000000003',
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'REVIEW_REQUIRED','human_required','Revisión sintética de cobertura.'
);
insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
) values (
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002','checkpoint','workflow',8,
  jsonb_build_object(
    'version','real-workflow-v1','taskId','synthetic-coverage-within-limit',
    'state','review_required','completedRound',2,'nextRoundQueries','[]'::jsonb,
    'dossier',jsonb_build_object('sources',(
      select jsonb_agg(jsonb_build_object('id','source-' || value) order by value)
        from generate_series(1,8) value
    )),
    'unresolvedGaps',jsonb_build_array(
      jsonb_build_object('id','g1','requiredForProfiles',jsonb_build_array('adventure')),
      jsonb_build_object('id','g2','requiredForProfiles',jsonb_build_array('student'))
    ),
    'masterKnowledge',jsonb_build_object(
      'contradictions',jsonb_build_array('Contradicción uno.','Contradicción dos.')
    ),
    'coverage',jsonb_build_object('score',0.72,'sufficient',false),
    'lastDecision',jsonb_build_object('action','stop_review_required'),
    'updatedAt','2026-08-09T10:00:00.000Z'
  ),repeat('a',64)
);
insert into public.real_editorial_coverage_reviews (
  id,pilot_id,run_id,checkpoint_version,checkpoint_hash,status,coverage_score,
  gaps,contradictions,affected_profiles,opened_at,resolved_at
) values (
  'b2000000-0000-4000-8000-000000000004',
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',8,repeat('a',64),'accepted',0.72,
  '[{"id":"g1"},{"id":"g2"}]'::jsonb,
  '["Contradicción uno.","Contradicción dos."]'::jsonb,
  '["adventure","student"]'::jsonb,
  now(),now()
);
insert into public.real_editorial_coverage_decisions (
  id,decision_key,review_id,pilot_id,run_id,checkpoint_version,checkpoint_hash,
  actor_id,decision,reason,note,gap_dispositions,known_contradictions,
  affected_profiles,safety_constraints,risk_accepted,risk_statement,
  spent_cost,reserved_cost,maximum_cost,remaining_estimated_cost,
  projected_total_cost,shortfall_cost
) values (
  'b2000000-0000-4000-8000-000000000005',repeat('b',64),
  'b2000000-0000-4000-8000-000000000004',
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',8,repeat('a',64),
  'b2000000-0000-4000-8000-000000000006','accept_with_warnings',
  'Aceptación sintética de cobertura.',null,
  '[{"gapId":"g1","disposition":"accepted_unresolved"},{"gapId":"g2","disposition":"accepted_unresolved"}]'::jsonb,
  '["Contradicción uno.","Contradicción dos."]'::jsonb,
  '["adventure","student"]'::jsonb,
  '["avoid_categorical_contradictory_claims","mark_pending_or_variable_data","do_not_invent_operational_details","adapt_warnings_to_profile","preserve_evidence_traceability"]'::jsonb,
  true,'Los gaps permanecen abiertos.',0.308318000,0,0.420000000,
  0.060000000,0.368318000,0
);
update public.real_editorial_coverage_reviews
   set latest_decision_id='b2000000-0000-4000-8000-000000000005'
 where id='b2000000-0000-4000-8000-000000000004';
insert into public.real_editorial_budget_reviews (
  id,pilot_id,run_id,incident_id,status,initial_maximum_cost,
  opened_spent_cost,opened_reserved_cost,remaining_estimated_cost,currency,
  review_context,coverage_decision_id,checkpoint_version,checkpoint_hash
) values (
  'b2000000-0000-4000-8000-000000000007',
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'b2000000-0000-4000-8000-000000000003','pending',0.420000000,
  0.308318000,0,0.060000000,'EUR','coverage_acceptance',
  'b2000000-0000-4000-8000-000000000005',8,repeat('a',64)
);

with original as (
  select payload from public.real_editorial_artifacts
   where run_id='b2000000-0000-4000-8000-000000000002'
     and artifact_kind='checkpoint' and artifact_key='workflow' and version=8
), derived as (
  select jsonb_set(jsonb_set(jsonb_set(
    payload,'{state}','"ready_for_drafting"'::jsonb
  ),'{updatedAt}','"2026-08-09T10:05:00.000Z"'::jsonb),'{editorialConstraints}',
    jsonb_build_object(
      'decisionId','b2000000-0000-4000-8000-000000000005',
      'checkpointVersion',8,'checkpointHash',repeat('a',64),
      'mode','accept_with_warnings','unresolvedGapIds',jsonb_build_array('g1','g2'),
      'contradictions',jsonb_build_array('Contradicción uno.','Contradicción dos.'),
      'affectedProfiles',jsonb_build_array('adventure','student'),
      'safetyRules',jsonb_build_array(
        'avoid_categorical_contradictory_claims','mark_pending_or_variable_data',
        'do_not_invent_operational_details','adapt_warnings_to_profile',
        'preserve_evidence_traceability'
      )
    )
  ) as payload from original
)
select public.resolve_real_editorial_coverage_budget_within_limit(
  repeat('d',64),'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'b2000000-0000-4000-8000-000000000006','authorize_within_limit',0.420000000,
  'Autorizar coste sintético dentro del máximo vigente.','No amplía el límite.',
  9,repeat('a',64),derived.payload,repeat('c',64)
) from derived;

insert into public.real_editorial_incidents (
  id,pilot_id,run_id,code,classification,message
) values (
  'b2000000-0000-4000-8000-000000000008',
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'CHECKPOINT_INVALID','human_required','Fallo sintético previo a redacción.'
);
select public.reconcile_real_editorial_drafting_checkpoint_incident(
  repeat('e',64),'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'b2000000-0000-4000-8000-000000000008',
  'b2000000-0000-4000-8000-000000000005',
  (select id from public.real_editorial_budget_decisions
    where run_id='b2000000-0000-4000-8000-000000000002'
      and decision='authorize_within_limit'),
  'b2000000-0000-4000-8000-000000000006',
  'Recuperación sintética previa a redacción.',9,repeat('c',64)
);
select public.reconcile_real_editorial_drafting_checkpoint_incident(
  repeat('e',64),'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'b2000000-0000-4000-8000-000000000008',
  'b2000000-0000-4000-8000-000000000005',
  (select id from public.real_editorial_budget_decisions
    where run_id='b2000000-0000-4000-8000-000000000002'
      and decision='authorize_within_limit'),
  'b2000000-0000-4000-8000-000000000006',
  'Recuperación sintética previa a redacción.',9,repeat('c',64)
);
with derived as (
  select payload from public.real_editorial_artifacts
   where run_id='b2000000-0000-4000-8000-000000000002'
     and artifact_kind='checkpoint' and artifact_key='workflow' and version=9
)
select public.resolve_real_editorial_coverage_budget_within_limit(
  repeat('d',64),'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'b2000000-0000-4000-8000-000000000006','authorize_within_limit',0.420000000,
  'Autorizar coste sintético dentro del máximo vigente.','No amplía el límite.',
  9,repeat('a',64),derived.payload,repeat('c',64)
) from derived;

do $$
begin
  if (select count(*) from public.real_editorial_budget_decisions
       where run_id='b2000000-0000-4000-8000-000000000002'
         and decision='authorize_within_limit') <> 1
    or (select status from public.real_editorial_budget_reviews
        where id='b2000000-0000-4000-8000-000000000007') <> 'authorized'
    or (select state from public.real_editorial_pilots
        where id='b2000000-0000-4000-8000-000000000001') <> 'preflight'
    or (select payload->>'state' from public.real_editorial_artifacts
        where run_id='b2000000-0000-4000-8000-000000000002'
          and artifact_kind='checkpoint' and artifact_key='workflow' and version=9)
       <> 'ready_for_drafting' then
    raise exception 'COVERAGE_WITHIN_LIMIT_NOT_DURABLE';
  end if;
  if (select task_limit_cost from public.real_editorial_pilot_budgets
       where pilot_id='b2000000-0000-4000-8000-000000000001') <> 0.420000000
    or (select batch_limit_cost from public.real_editorial_pilot_budgets
        where pilot_id='b2000000-0000-4000-8000-000000000001') <> 0.420000000
    or (select daily_limit_cost from public.real_editorial_pilot_budgets
        where pilot_id='b2000000-0000-4000-8000-000000000001') <> 0.420000000
    or (select spent_cost from public.real_editorial_pilot_budgets
        where pilot_id='b2000000-0000-4000-8000-000000000001') <> 0.308318000
    or (select reserved_cost from public.real_editorial_pilot_budgets
        where pilot_id='b2000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'COVERAGE_WITHIN_LIMIT_CHANGED_BUDGET';
  end if;
  if (select count(*) from public.real_editorial_provider_calls
       where run_id='b2000000-0000-4000-8000-000000000002') <> 0
    or (select count(*) from public.real_editorial_call_reservations
        where run_id='b2000000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'COVERAGE_WITHIN_LIMIT_CALLED_PROVIDER';
  end if;
  if (select count(*) from public.real_editorial_drafting_checkpoint_recoveries
       where run_id='b2000000-0000-4000-8000-000000000002') <> 1
    or (select resolved_at from public.real_editorial_incidents
        where id='b2000000-0000-4000-8000-000000000008') is null then
    raise exception 'DRAFTING_CHECKPOINT_RECOVERY_NOT_IDEMPOTENT';
  end if;
end;
$$;
rollback;
select 'real-editorial-coverage-budget-within-limit-integration-ok';
`
    const output = execFileSync(dockerExecutable, [
      'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X',
    ], {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    })
    expect(output).toContain('real-editorial-coverage-budget-within-limit-integration-ok')
  }, 30_000)
})
