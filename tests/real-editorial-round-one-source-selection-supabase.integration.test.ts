import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const migrationPath = 'supabase/migrations/20260809100000_real_editorial_round_one_active_source_selection.sql'
const recoveryMigrationPath =
  'supabase/migrations/20260809103000_real_editorial_round_one_selection_checkpoint_recovery.sql'

describe('selección durable de fuentes activas de ronda 1', () => {
  integrationTest('libera tres plazas sin borrar historia, presupuesto ni proveedores', () => {
    const schemaPresent = execFileSync(dockerExecutable, [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-AtXc',
      "select to_regprocedure('public.select_real_editorial_round_one_active_sources(text,text,uuid,uuid,uuid,uuid,text,text,integer,text,integer,jsonb,text,jsonb)') is not null",
    ], { encoding: 'utf8' }).trim() === 't'
    const migration = schemaPresent ? '' : readFileSync(migrationPath, 'utf8')
    const recoverySchemaPresent = execFileSync(dockerExecutable, [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-AtXc',
      "select to_regprocedure('public.reconcile_real_editorial_source_selection_checkpoint(text,uuid,uuid,uuid,uuid,text,uuid[])') is not null",
    ], { encoding: 'utf8' }).trim() === 't'
    const recoveryMigration = recoverySchemaPresent
      ? ''
      : readFileSync(recoveryMigrationPath, 'utf8')
    const items = JSON.stringify([
      item(1, 1, 'keep_active', ['g-access', 'g-routes'], ['access', 'routes'], ['access', 'routes'], ['c1', 'c2']),
      item(2, 2, 'keep_active', ['g-access'], ['access'], ['access'], ['c1', 'c2']),
      item(3, 3, 'keep_active', ['g-routes'], ['routes'], ['routes'], ['c3']),
      item(4, 5, 'keep_active', ['g-season'], ['season'], ['season'], []),
      item(5, 4, 'keep_active', ['g-population', 'g-season'], ['population', 'season'], ['season'], []),
      item(6, 6, 'deselect_active', ['g-population'], ['population'], [], []),
      item(7, 7, 'deselect_active', [], [], [], []),
      item(8, 8, 'deselect_active', [], [], [], []),
    ])
    const sql = String.raw`
\set ON_ERROR_STOP on
begin;
${migration}
${recoveryMigration}

select id as morella_id from public.geographic_entities
 where normalized_name = 'morella' and country_code = 'ES' and entity_type = 'locality'
 limit 1 \gset
select public.prepare_real_editorial_pilot(
  'a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'morella-real-editorial-pilot-v1',
  'integration-round-one-active-source-selection-prepare',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
  'integration-round-one-active-source-selection',
  :'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000,"depth":"standard"},{"profile":"student","enabled":true,"targetWords":1800,"depth":"deep"}]'::jsonb
);
select public.confirm_real_editorial_budget(
  'a2000000-0000-4000-8000-000000000001','2099-08-09'
);
update public.real_editorial_pilot_budgets
   set spent_cost = 0.175406000,task_limit_cost = 0.420000000,
       batch_limit_cost = 0.420000000,daily_limit_cost = 0.420000000
 where pilot_id = 'a2000000-0000-4000-8000-000000000001';
update public.real_editorial_pilots set state = 'preflight'
 where id = 'a2000000-0000-4000-8000-000000000001';
update public.real_editorial_runs
   set state = 'preflight',current_round = 1,accumulated_cost = 0.175406000
 where id = 'a2000000-0000-4000-8000-000000000002';
insert into public.real_editorial_incidents (
  id,pilot_id,run_id,code,classification,message
) values (
  'a2000000-0000-4000-8000-000000000003',
  'a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'LIMIT_EXCEEDED','human_required',
  'El expediente sintético agotó el máximo antes de ronda 2.'
);

insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
)
select
  'a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'source_accepted','source-' || value,1,
  jsonb_build_object('id','source-' || value,'round',1,'original',true),
  repeat(value::text,64)
from generate_series(1,8) value;

insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
) values (
  'a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'checkpoint','workflow',1,
  jsonb_build_object(
    'version','real-workflow-v1',
    'taskId','synthetic-source-selection-task',
    'configurationHash',repeat('a',64),
    'state','researching_round_2',
    'initialMission',jsonb_build_object(
      'limits',jsonb_build_object('maxSources',8)
    ),
    'completedRound',1,
    'dossier',jsonb_build_object(
      'rounds',jsonb_build_array(1),
      'sources',(
        select jsonb_agg(jsonb_build_object(
          'id','source-' || value,
          'round',1,
          'title','Fuente sintética ' || value,
          'normalizedUrl','https://source-' || value || '.example.test/page',
          'contentHash',repeat(value::text,64),
          'score',(array[0.8,0.7,0.9,0.8,0.7,0.99,0.6,0.5])[value]
        ) order by value)
        from generate_series(1,8) value
      )
    ),
    'masterKnowledge',jsonb_build_object('claims',jsonb_build_array(
      jsonb_build_object('id','c1','evidenceIds',jsonb_build_array('source-1','source-2')),
      jsonb_build_object('id','c2','evidenceIds',jsonb_build_array('source-1','source-2')),
      jsonb_build_object('id','c3','evidenceIds',jsonb_build_array('source-3'))
    )),
    'coverage',jsonb_build_object('topics',jsonb_build_array(
      jsonb_build_object('topic','access','coverage',0.3,'evidenceIds',jsonb_build_array('source-1','source-2')),
      jsonb_build_object('topic','routes','coverage',0.2,'evidenceIds',jsonb_build_array('source-1','source-3')),
      jsonb_build_object('topic','season','coverage',0.4,'evidenceIds',jsonb_build_array('source-4','source-5')),
      jsonb_build_object('topic','population','coverage',0.8,'evidenceIds',jsonb_build_array('source-5','source-6'))
    )),
    'unresolvedGaps',jsonb_build_array(
      jsonb_build_object('id','g-access'),jsonb_build_object('id','g-routes'),
      jsonb_build_object('id','g-season'),jsonb_build_object('id','g-population')
    ),
    'nextRoundQueries',jsonb_build_array(
      jsonb_build_object('id','q1'),jsonb_build_object('id','q2'),jsonb_build_object('id','q3')
    ),
    'providerCalls',6,
    'simulatedCost',0.175406,
    'updatedAt','2026-08-09T08:00:00.000Z'
  ),
  repeat('a',64)
);

with checkpoint as (
  select payload from public.real_editorial_artifacts
   where run_id = 'a2000000-0000-4000-8000-000000000002'
     and artifact_kind = 'checkpoint' and artifact_key = 'workflow' and version = 1
), selected as (
  select jsonb_set(
    jsonb_set(payload,'{dossier,sources}',(
      select jsonb_agg(source order by ordinality)
        from jsonb_array_elements(payload#>'{dossier,sources}')
          with ordinality as original(source,ordinality)
       where source->>'id' in ('source-1','source-2','source-3','source-4','source-5')
    )),
    '{updatedAt}','"2026-08-09T08:05:00.000Z"'::jsonb
  ) as payload from checkpoint
)
select public.select_real_editorial_round_one_active_sources(
  repeat('c',64),repeat('b',64),
  'a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000003',
  'a2000000-0000-4000-8000-000000000004',
  'Selección humana sintética para liberar tres plazas.',
  'round-one-active-source-selection-v1',
  1,repeat('a',64),2,selected.payload,repeat('d',64),'${items}'::jsonb
) from selected;

insert into public.real_editorial_incidents (
  id,pilot_id,run_id,code,classification,message
) values
  (
    'a2000000-0000-4000-8000-000000000007',
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',
    'CHECKPOINT_INVALID','human_required','Fallo sintético de restauración 1.'
  ),
  (
    'a2000000-0000-4000-8000-000000000008',
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',
    'CHECKPOINT_INVALID','human_required','Fallo sintético de restauración 2.'
  );

select public.reconcile_real_editorial_source_selection_checkpoint(
  repeat('e',64),
  (select id from public.real_editorial_round_one_source_selections
    where run_id='a2000000-0000-4000-8000-000000000002'),
  'a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000004',
  'Recuperación sintética sin efectos de proveedor.',
  array[
    'a2000000-0000-4000-8000-000000000007'::uuid,
    'a2000000-0000-4000-8000-000000000008'::uuid
  ]
);
select public.reconcile_real_editorial_source_selection_checkpoint(
  repeat('e',64),
  (select id from public.real_editorial_round_one_source_selections
    where run_id='a2000000-0000-4000-8000-000000000002'),
  'a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000004',
  'Recuperación sintética sin efectos de proveedor.',
  array[
    'a2000000-0000-4000-8000-000000000007'::uuid,
    'a2000000-0000-4000-8000-000000000008'::uuid
  ]
);

with checkpoint as (
  select payload from public.real_editorial_artifacts
   where run_id = 'a2000000-0000-4000-8000-000000000002'
     and artifact_kind = 'checkpoint' and artifact_key = 'workflow' and version = 1
), selected as (
  select jsonb_set(
    jsonb_set(payload,'{dossier,sources}',(
      select jsonb_agg(source order by ordinality)
        from jsonb_array_elements(payload#>'{dossier,sources}')
          with ordinality as original(source,ordinality)
       where source->>'id' in ('source-1','source-2','source-3','source-4','source-5')
    )),
    '{updatedAt}','"2026-08-09T08:05:00.000Z"'::jsonb
  ) as payload from checkpoint
)
select public.select_real_editorial_round_one_active_sources(
  repeat('c',64),repeat('b',64),
  'a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000003',
  'a2000000-0000-4000-8000-000000000004',
  'Selección humana sintética para liberar tres plazas.',
  'round-one-active-source-selection-v1',
  1,repeat('a',64),2,selected.payload,repeat('d',64),'${items}'::jsonb
) from selected;

do $$
begin
  if (select count(*) from public.real_editorial_round_one_source_selections
       where run_id = 'a2000000-0000-4000-8000-000000000002') <> 1
    or (select count(*) from public.real_editorial_round_one_source_selection_items item
        join public.real_editorial_round_one_source_selections selection
          on selection.id = item.selection_id
        where selection.run_id = 'a2000000-0000-4000-8000-000000000002') <> 8 then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_NOT_IDEMPOTENT';
  end if;
  if (select count(*) from public.real_editorial_artifacts
       where run_id = 'a2000000-0000-4000-8000-000000000002'
         and artifact_kind = 'source_accepted') <> 8
    or (select count(*) from public.real_editorial_artifacts
        where run_id = 'a2000000-0000-4000-8000-000000000002'
          and artifact_kind = 'checkpoint' and artifact_key = 'workflow') <> 2
    or (select jsonb_array_length(payload#>'{dossier,sources}')
        from public.real_editorial_artifacts
        where run_id = 'a2000000-0000-4000-8000-000000000002'
          and artifact_kind = 'checkpoint' and artifact_key = 'workflow' and version = 1) <> 8
    or (select jsonb_array_length(payload#>'{dossier,sources}')
        from public.real_editorial_artifacts
        where run_id = 'a2000000-0000-4000-8000-000000000002'
          and artifact_kind = 'checkpoint' and artifact_key = 'workflow' and version = 2) <> 5 then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_CHANGED_HISTORY';
  end if;
  if (select task_limit_cost from public.real_editorial_pilot_budgets
       where pilot_id = 'a2000000-0000-4000-8000-000000000001') <> 0.42
    or (select spent_cost from public.real_editorial_pilot_budgets
        where pilot_id = 'a2000000-0000-4000-8000-000000000001') <> 0.175406
    or (select reserved_cost from public.real_editorial_pilot_budgets
        where pilot_id = 'a2000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_CHANGED_BUDGET';
  end if;
  if (select count(*) from public.real_editorial_provider_calls
       where run_id = 'a2000000-0000-4000-8000-000000000002') <> 0
    or (select count(*) from public.real_editorial_call_reservations
        where run_id = 'a2000000-0000-4000-8000-000000000002') <> 0
    or (select count(*) from public.real_editorial_artifacts
        where run_id = 'a2000000-0000-4000-8000-000000000002'
          and artifact_kind = 'tavily_result' and artifact_key = 'round-2') <> 0 then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_CALLED_PROVIDER';
  end if;
  if (select resolved_at from public.real_editorial_incidents
       where id = 'a2000000-0000-4000-8000-000000000003') is null
    or (select count(*) from public.real_editorial_events
        where run_id = 'a2000000-0000-4000-8000-000000000002'
          and event_type = 'real.editorial.round_one_sources.human_selected'
          and payload->>'providerCalled' = 'false'
          and payload->>'historicalSourcesMutated' = 'false') <> 1 then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_AUDIT_INVALID';
  end if;
  if (select count(*)
        from public.real_editorial_source_selection_checkpoint_recoveries
       where run_id = 'a2000000-0000-4000-8000-000000000002') <> 1
    or (select count(*)
          from public.real_editorial_source_selection_checkpoint_incidents item
          join public.real_editorial_source_selection_checkpoint_recoveries recovery
            on recovery.id = item.recovery_id
         where recovery.run_id = 'a2000000-0000-4000-8000-000000000002') <> 2
    or (select count(*) from public.real_editorial_incidents
         where id in (
           'a2000000-0000-4000-8000-000000000007',
           'a2000000-0000-4000-8000-000000000008'
         ) and resolved_at is null) <> 0 then
    raise exception 'ROUND_ONE_SELECTION_CHECKPOINT_RECOVERY_NOT_IDEMPOTENT';
  end if;
end;
$$;

rollback;
select 'real-editorial-round-one-source-selection-integration-ok';
`
    const output = execFileSync(dockerExecutable, [
      'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X',
    ], {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    })
    expect(output).toContain('real-editorial-round-one-source-selection-integration-ok')
  }, 30_000)
})

function item(
  source: number,
  rank: number,
  decision: 'keep_active' | 'deselect_active',
  coveredGapIds: string[],
  coverageTopics: string[],
  undercoveredCoverageTopics: string[],
  claimIds: string[],
) {
  return {
    sourceId: `source-${source}`,
    title: `Fuente sintética ${source}`,
    normalizedUrl: `https://source-${source}.example.test/page`,
    contentHash: String(source).repeat(64),
    score: [0.8, 0.7, 0.9, 0.8, 0.7, 0.99, 0.6, 0.5][source - 1],
    originalOrdinal: source,
    rank,
    decision,
    coveredGapIds,
    coverageTopics,
    undercoveredCoverageTopics,
    claimIds,
    reason: decision === 'keep_active'
      ? 'current_gap_evidence_priority'
      : 'lower_incremental_gap_coverage',
  }
}
