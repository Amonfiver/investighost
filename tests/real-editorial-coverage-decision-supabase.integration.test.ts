import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const migrationPath =
  'supabase/migrations/20260801210000_real_editorial_coverage_decision.sql'

describe('decisión de cobertura editorial en Supabase local', () => {
  integrationTest('valida las tres opciones, presupuesto y checkpoint con rollback', () => {
    const schemaPresent = execFileSync(dockerExecutable, [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-AtXc',
      `select to_regclass('public.real_editorial_coverage_decisions') is not null`,
    ], { encoding: 'utf8' }).trim() === 't'
    const migration = schemaPresent ? '' : readFileSync(migrationPath, 'utf8')
    const sql = String.raw`
\set ON_ERROR_STOP on
begin;
${migration}

create temporary table real_morella_before as
select jsonb_build_object(
  'pilot',(select to_jsonb(p) from public.real_editorial_pilots p
    where p.id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'budget',(select to_jsonb(b) from public.real_editorial_pilot_budgets b
    where b.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'coverageDecisionCount',(select count(*) from public.real_editorial_coverage_decisions d
    where d.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'budgetDecisionCount',(select count(*) from public.real_editorial_budget_decisions d
    where d.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'artifactCount',(select count(*) from public.real_editorial_artifacts a
    where a.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'providerCallCount',(select count(*) from public.real_editorial_provider_calls c
    where c.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03')
) as snapshot;

select id as morella_id from public.geographic_entities
 where normalized_name='morella' and country_code='ES' and entity_type='locality'
 limit 1 \gset

select public.prepare_real_editorial_pilot(
  'a9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000002',
  'morella-real-editorial-pilot-v1','integration-coverage-prepare',repeat('9',64),
  'integration-coverage',:'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000},{"profile":"student","enabled":true,"targetWords":1800}]'::jsonb
);
select public.confirm_real_editorial_budget(
  'a9000000-0000-4000-8000-000000000001','2099-08-01'
);
update public.real_editorial_pilot_budgets set
  task_limit_cost=0.27,batch_limit_cost=0.27,daily_limit_cost=0.27,
  spent_cost=0.258648,reserved_cost=0
 where pilot_id='a9000000-0000-4000-8000-000000000001';
update public.real_editorial_pilots set state='review_required'
 where id='a9000000-0000-4000-8000-000000000001';
update public.real_editorial_runs set state='review_required',current_round=2,
  checkpoint_version=15,accumulated_cost=0.258648
 where id='a9000000-0000-4000-8000-000000000002';
insert into public.real_editorial_incidents (
  id,pilot_id,run_id,code,classification,message
) values (
  'a9000000-0000-4000-8000-000000000003',
  'a9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000002',
  'REVIEW_REQUIRED','human_required','Cobertura sintética insuficiente tras ronda 2.'
);
insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
) values
(
  'a9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000002',
  'mission','initial',1,'{"synthetic":true}'::jsonb,repeat('1',64)
),
(
  'a9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000002',
  'checkpoint','workflow',15,
  '{
    "version":"real-workflow-v1",
    "taskId":"synthetic-coverage-task",
    "configurationHash":"synthetic",
    "state":"review_required",
    "completedRound":2,
    "lastDecision":{"action":"stop_review_required","reason":"Cobertura insuficiente."},
    "nextRoundQueries":[],
    "queryHashes":[],
    "providerCalls":4,
    "simulatedCost":0.258648,
    "lastAnalysisCost":0.080810,
    "coverage":{"score":0.78,"sufficient":false,"topics":[{"topic":"access","required":true,"coverage":0.62,"evidenceIds":[]}]},
    "unresolvedGaps":[
      {"id":"g1","topic":"castillo","description":"Horarios, tarifas y duración coherentes del castillo.","importance":"critical","requiredForProfiles":["adventure","student"],"resolvableWithResearch":true},
      {"id":"g2","topic":"autocaravanas","description":"Estado, ubicación, capacidad, tarifa y servicios del área.","importance":"critical","requiredForProfiles":["adventure"],"resolvableWithResearch":true},
      {"id":"g3","topic":"ruta","description":"Ruta verificable con distancia, desnivel, dificultad y seguridad.","importance":"high","requiredForProfiles":["adventure"],"resolvableWithResearch":true},
      {"id":"g4","topic":"acceso","description":"Transporte, aparcamiento, restricciones y accesibilidad.","importance":"high","requiredForProfiles":["adventure","student"],"resolvableWithResearch":true},
      {"id":"g5","topic":"vida-cotidiana","description":"Población, economía, servicios y vida cotidiana.","importance":"medium","requiredForProfiles":["student"],"resolvableWithResearch":true}
    ],
    "masterKnowledge":{"contradictions":[
      "Horarios y tarifas del castillo.",
      "Estado y condiciones del área de autocaravanas.",
      "Duración recomendada del castillo."
    ]},
    "updatedAt":"2099-08-01T12:00:00.000Z"
  }'::jsonb,
  repeat('f',64)
);

select public.resolve_real_editorial_coverage_review(
  repeat('1',64),
  'a9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000002',15,repeat('f',64),
  'a9000000-0000-4000-8000-000000000004',
  'keep_review_required','Mantener revisión sintética.',null,false
) as keep_id \gset
select public.resolve_real_editorial_coverage_review(
  repeat('1',64),
  'a9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000002',15,repeat('f',64),
  'a9000000-0000-4000-8000-000000000004',
  'keep_review_required','Mantener revisión sintética.',null,false
) as repeated_keep_id \gset

do $$
begin
  if (select count(*) from public.real_editorial_coverage_decisions
       where decision_key=repeat('1',64)) <> 1 then raise exception 'KEEP_DUPLICATED'; end if;
  if (select state from public.real_editorial_pilots
       where id='a9000000-0000-4000-8000-000000000001') <> 'review_required'
    or (select state from public.real_editorial_runs
        where id='a9000000-0000-4000-8000-000000000002') <> 'review_required'
    or (select status from public.real_editorial_coverage_reviews
        where run_id='a9000000-0000-4000-8000-000000000002') <> 'kept' then
    raise exception 'KEEP_CHANGED_STATE';
  end if;
  if (select spent_cost from public.real_editorial_pilot_budgets
       where pilot_id='a9000000-0000-4000-8000-000000000001') <> 0.258648
    or (select reserved_cost from public.real_editorial_pilot_budgets
        where pilot_id='a9000000-0000-4000-8000-000000000001') <> 0
    or (select task_limit_cost from public.real_editorial_pilot_budgets
        where pilot_id='a9000000-0000-4000-8000-000000000001') <> 0.27 then
    raise exception 'KEEP_CHANGED_LEDGER';
  end if;
  if (select count(*) from public.real_editorial_artifacts
       where run_id='a9000000-0000-4000-8000-000000000002'
         and artifact_kind='checkpoint' and artifact_key='workflow') <> 1 then
    raise exception 'KEEP_CHANGED_CHECKPOINT';
  end if;
  begin
    perform public.resolve_real_editorial_coverage_review(
      repeat('1',64),
      'a9000000-0000-4000-8000-000000000001',
      'a9000000-0000-4000-8000-000000000002',15,repeat('f',64),
      'a9000000-0000-4000-8000-000000000004',
      'accept_with_warnings','Decisión incompatible sintética.',null,true
    );
    raise exception 'INCOMPATIBLE_DECISION_ACCEPTED';
  exception when others then
    if sqlerrm <> 'COVERAGE_DECISION_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
end;
$$;

select public.resolve_real_editorial_coverage_review(
  repeat('2',64),
  'a9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000002',15,repeat('f',64),
  'a9000000-0000-4000-8000-000000000004',
  'accept_with_warnings','Aceptar cobertura sintética con riesgos conocidos.',
  'No ejecuta el piloto.',true
) as accept_id \gset
select public.resolve_real_editorial_coverage_review(
  repeat('2',64),
  'a9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000002',15,repeat('f',64),
  'a9000000-0000-4000-8000-000000000004',
  'accept_with_warnings','Aceptar cobertura sintética con riesgos conocidos.',
  'No ejecuta el piloto.',true
) as repeated_accept_id \gset

do $$
declare
  accepted public.real_editorial_coverage_decisions%rowtype;
  budget_review public.real_editorial_budget_reviews%rowtype;
begin
  select * into accepted from public.real_editorial_coverage_decisions
   where decision_key=repeat('2',64);
  if (select count(*) from public.real_editorial_coverage_decisions
       where decision_key=repeat('2',64)) <> 1 then
    raise exception 'ACCEPTANCE_NOT_IDEMPOTENT';
  end if;
  select * into budget_review from public.real_editorial_budget_reviews
   where coverage_decision_id=accepted.id;
  if accepted.decision <> 'accept_with_warnings'
     or jsonb_array_length(accepted.gap_dispositions) <> 5
     or exists (select 1 from jsonb_array_elements(accepted.gap_dispositions) item
                 where item->>'disposition' <> 'accepted_unresolved')
     or jsonb_array_length(accepted.known_contradictions) <> 3
     or jsonb_array_length(accepted.affected_profiles) <> 2
     or jsonb_array_length(accepted.safety_constraints) <> 5
     or not accepted.risk_accepted then
    raise exception 'ACCEPTANCE_DID_NOT_PRESERVE_WARNINGS';
  end if;
  if accepted.spent_cost <> 0.258648 or accepted.reserved_cost <> 0
     or accepted.maximum_cost <> 0.27
     or accepted.remaining_estimated_cost <> 0.06
     or accepted.projected_total_cost <> 0.318648
     or accepted.shortfall_cost <> 0.048648 then
    raise exception 'ACCEPTANCE_ESTIMATE_INVALID';
  end if;
  if budget_review.status <> 'pending'
     or budget_review.review_context <> 'coverage_acceptance'
     or budget_review.remaining_estimated_cost <> 0.06
     or budget_review.checkpoint_version <> 15
     or budget_review.checkpoint_hash <> repeat('f',64) then
    raise exception 'COVERAGE_BUDGET_REVIEW_INVALID';
  end if;
  if (select state from public.real_editorial_pilots
       where id='a9000000-0000-4000-8000-000000000001') <> 'review_required'
     or (select task_limit_cost from public.real_editorial_pilot_budgets
         where pilot_id='a9000000-0000-4000-8000-000000000001') <> 0.27
     or (select count(*) from public.real_editorial_artifacts
         where run_id='a9000000-0000-4000-8000-000000000002'
           and artifact_kind='checkpoint' and artifact_key='workflow') <> 1 then
    raise exception 'ACCEPTANCE_RESUMED_OR_CHANGED_BUDGET';
  end if;
end;
$$;

select public.resolve_real_editorial_coverage_budget_review(
  repeat('3',64),
  'a9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000002',
  'a9000000-0000-4000-8000-000000000004',
  'authorize_extension',0.318648,'Presupuesto sintético suficiente.',null,
  16,repeat('f',64),
  (
    select payload || jsonb_build_object(
      'state','ready_for_drafting',
      'nextRoundQueries','[]'::jsonb,
      'editorialConstraints',jsonb_build_object(
        'decisionId',:'accept_id',
        'checkpointVersion',15,
        'checkpointHash',repeat('f',64),
        'mode','accept_with_warnings',
        'unresolvedGapIds','["g1","g2","g3","g4","g5"]'::jsonb,
        'contradictions','["Horarios y tarifas del castillo.","Estado y condiciones del área de autocaravanas.","Duración recomendada del castillo."]'::jsonb,
        'affectedProfiles','["adventure","student"]'::jsonb,
        'safetyRules','["avoid_categorical_contradictory_claims","mark_pending_or_variable_data","do_not_invent_operational_details","adapt_warnings_to_profile","preserve_evidence_traceability"]'::jsonb
      ),
      'updatedAt','2099-08-01T13:00:00.000Z'
    )
    from public.real_editorial_artifacts
    where run_id='a9000000-0000-4000-8000-000000000002'
      and artifact_kind='checkpoint' and artifact_key='workflow' and version=15
  ),
  repeat('e',64)
) as budget_id \gset

do $$
begin
  if (select state from public.real_editorial_pilots
       where id='a9000000-0000-4000-8000-000000000001') <> 'preflight'
    or (select state from public.real_editorial_runs
        where id='a9000000-0000-4000-8000-000000000002') <> 'preflight' then
    raise exception 'AUTHORIZED_BUDGET_DID_NOT_ENABLE_SEPARATE_CONTINUATION';
  end if;
  if (select task_limit_cost from public.real_editorial_pilot_budgets
       where pilot_id='a9000000-0000-4000-8000-000000000001') <> 0.318648
    or (select spent_cost from public.real_editorial_pilot_budgets
        where pilot_id='a9000000-0000-4000-8000-000000000001') <> 0.258648
    or (select reserved_cost from public.real_editorial_pilot_budgets
        where pilot_id='a9000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'AUTHORIZED_BUDGET_LEDGER_INVALID';
  end if;
  if (select payload->>'state' from public.real_editorial_artifacts
       where run_id='a9000000-0000-4000-8000-000000000002'
         and artifact_kind='checkpoint' and artifact_key='workflow'
       order by version desc limit 1) <> 'ready_for_drafting'
    or (select payload->>'completedRound' from public.real_editorial_artifacts
        where run_id='a9000000-0000-4000-8000-000000000002'
          and artifact_kind='checkpoint' and artifact_key='workflow'
        order by version desc limit 1) <> '2'
    or (select payload->'nextRoundQueries' from public.real_editorial_artifacts
        where run_id='a9000000-0000-4000-8000-000000000002'
          and artifact_kind='checkpoint' and artifact_key='workflow'
        order by version desc limit 1) <> '[]'::jsonb then
    raise exception 'DIRECT_DRAFT_CHECKPOINT_INVALID';
  end if;
  if (select count(*) from public.real_editorial_call_reservations
       where pilot_id='a9000000-0000-4000-8000-000000000001') <> 0
    or (select count(*) from public.real_editorial_provider_calls
        where pilot_id='a9000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'DECISIONS_CALLED_PROVIDER';
  end if;
  if (select publication_count from public.real_editorial_pilots
       where id='a9000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'DECISIONS_PUBLISHED';
  end if;
end;
$$;

select public.prepare_real_editorial_pilot(
  'a9000000-0000-4000-8000-000000000011',
  'a9000000-0000-4000-8000-000000000012',
  'morella-real-editorial-pilot-v1','integration-coverage-reject-prepare',repeat('8',64),
  'integration-coverage-reject',:'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000},{"profile":"student","enabled":true,"targetWords":1800}]'::jsonb
);
select public.confirm_real_editorial_budget(
  'a9000000-0000-4000-8000-000000000011','2099-08-01'
);
update public.real_editorial_pilot_budgets set
  task_limit_cost=0.27,batch_limit_cost=0.27,daily_limit_cost=0.27,
  spent_cost=0.258648,reserved_cost=0
 where pilot_id='a9000000-0000-4000-8000-000000000011';
update public.real_editorial_pilots set state='review_required'
 where id='a9000000-0000-4000-8000-000000000011';
update public.real_editorial_runs set state='review_required',current_round=2,
  checkpoint_version=15,accumulated_cost=0.258648
 where id='a9000000-0000-4000-8000-000000000012';
insert into public.real_editorial_incidents (
  id,pilot_id,run_id,code,classification,message
) values (
  'a9000000-0000-4000-8000-000000000013',
  'a9000000-0000-4000-8000-000000000011',
  'a9000000-0000-4000-8000-000000000012',
  'REVIEW_REQUIRED','human_required','Cobertura sintética rechazada.'
);
insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
)
select
  'a9000000-0000-4000-8000-000000000011',
  'a9000000-0000-4000-8000-000000000012',
  artifact_kind,artifact_key,version,payload,repeat('d',64)
from public.real_editorial_artifacts
where run_id='a9000000-0000-4000-8000-000000000002'
  and artifact_kind='checkpoint' and artifact_key='workflow' and version=15;
select public.resolve_real_editorial_coverage_review(
  repeat('4',64),
  'a9000000-0000-4000-8000-000000000011',
  'a9000000-0000-4000-8000-000000000012',15,repeat('d',64),
  'a9000000-0000-4000-8000-000000000014',
  'reject_editorial_run','Rechazo editorial sintético.',null,false
);

do $$
begin
  if (select state from public.real_editorial_pilots
       where id='a9000000-0000-4000-8000-000000000011') <> 'cancelled'
    or (select state from public.real_editorial_runs
        where id='a9000000-0000-4000-8000-000000000012') <> 'cancelled' then
    raise exception 'REJECT_DID_NOT_CANCEL';
  end if;
  if (select count(*) from public.real_editorial_artifacts
       where run_id='a9000000-0000-4000-8000-000000000012') <> 1
    or (select publication_count from public.real_editorial_pilots
        where id='a9000000-0000-4000-8000-000000000011') <> 0 then
    raise exception 'REJECT_CHANGED_ARTIFACTS_OR_PUBLISHED';
  end if;
  if (select count(*) from public.real_editorial_provider_calls
       where pilot_id='a9000000-0000-4000-8000-000000000011') <> 0
    or (select spent_cost from public.real_editorial_pilot_budgets
        where pilot_id='a9000000-0000-4000-8000-000000000011') <> 0.258648 then
    raise exception 'REJECT_CALLED_PROVIDER_OR_CHANGED_COST';
  end if;
  if (select snapshot from real_morella_before) is distinct from (
    select jsonb_build_object(
      'pilot',(select to_jsonb(p) from public.real_editorial_pilots p
        where p.id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'budget',(select to_jsonb(b) from public.real_editorial_pilot_budgets b
        where b.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'coverageDecisionCount',(select count(*) from public.real_editorial_coverage_decisions d
        where d.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'budgetDecisionCount',(select count(*) from public.real_editorial_budget_decisions d
        where d.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'artifactCount',(select count(*) from public.real_editorial_artifacts a
        where a.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'providerCallCount',(select count(*) from public.real_editorial_provider_calls c
        where c.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03')
    )
  ) then raise exception 'REAL_MORELLA_WAS_MODIFIED'; end if;
end;
$$;

rollback;
select 'real-editorial-coverage-decision-integration-ok';
`
    const output = execFileSync(dockerExecutable, [
      'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X',
    ], {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    })
    expect(output).toContain('real-editorial-coverage-decision-integration-ok')
  }, 30_000)
})
