import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const migrationPath =
  'supabase/migrations/20260730210000_real_editorial_source_limit_recovery.sql'
const timestamp = '2099-07-30T10:00:00.000Z'

function source(round: 1 | 2, index: number, score: number) {
  return {
    id: `integration-source-${round}-${index}`,
    round,
    url: `https://example.test/${round}/${index}`,
    normalizedUrl: `https://example.test/${round}/${index}`,
    title: `Fuente sintética ${round}-${index}`,
    capturedAt: timestamp,
    contentHash: index.toString(16).repeat(64).slice(0, 64),
    score,
    content: `Contenido sintético de la fuente ${round}-${index}.`,
  }
}

const roundOneSources = [
  source(1, 1, 0.7),
  source(1, 2, 0.6),
  source(1, 3, 0.5),
]
const roundTwoSources = [
  source(2, 6, 0.4),
  source(2, 3, 0.7),
  source(2, 1, 0.95),
  source(2, 5, 0.5),
  source(2, 2, 0.8),
  source(2, 4, 0.6),
]
const selectedRoundTwo = [...roundTwoSources]
  .sort((left, right) => right.score - left.score
    || left.normalizedUrl.localeCompare(right.normalizedUrl)
    || left.id.localeCompare(right.id))
  .slice(0, 5)

const checkpoint = {
  version: 'real-workflow-v1',
  taskId: 'integration-source-limit-task',
  state: 'researching_round_2',
  initialMission: {
    limits: { maxSources: 8 },
  },
  completedRound: 1,
  dossier: {
    requestId: 'integration-source-limit-request',
    runId: '99000000-0000-4000-8000-000000000002',
    taskId: 'integration-source-limit-task',
    destinationId: 'integration-morella',
    rounds: [1],
    sources: roundOneSources,
    evidence: [],
    generatedAt: timestamp,
  },
  nextRoundQueries: [{
    id: 'integration-query',
    gapId: 'integration-gap',
    query: 'Morella información focalizada sintética',
    rationale: 'Completar la cobertura sintética.',
  }],
  providerCalls: 5,
  simulatedCost: 0.107838,
  updatedAt: timestamp,
}
const recoveredCheckpoint = {
  ...checkpoint,
  state: 'analyzing_round_2',
  dossier: {
    ...checkpoint.dossier,
    rounds: [1, 2],
    sources: [...roundOneSources, ...selectedRoundTwo],
    generatedAt: '2099-07-30T10:01:00.000Z',
  },
  providerCalls: 9,
  simulatedCost: 0.155838,
  updatedAt: '2099-07-30T10:02:00.000Z',
}
const roundTwoResult = {
  round: 2,
  sources: roundTwoSources,
  providerRequestIds: ['request-1', 'request-2', 'request-3', 'request-4'],
  failures: [],
  usageUnits: 6,
  credits: 6,
}

function json(value: unknown): string {
  return JSON.stringify(value).replaceAll("'", "''")
}

describe('recuperación del máximo global en Supabase local', () => {
  integrationTest('recupera una vez, conserva ledger y deja OpenAI pendiente', () => {
    const schemaPresent = execFileSync(dockerExecutable, [
      'exec',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-AtXc',
      `select to_regclass('public.real_editorial_source_limit_recoveries') is not null`,
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
  '99000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002',
  'morella-real-editorial-pilot-v1',
  'integration-source-limit-recovery-prepare',
  '9999999999999999999999999999999999999999999999999999999999999999',
  'integration-source-limit-recovery',
  :'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000},{"profile":"student","enabled":true,"targetWords":1800}]'::jsonb
);
select public.confirm_real_editorial_budget(
  '99000000-0000-4000-8000-000000000001','2099-07-30'
);

update public.real_editorial_pilot_budgets
   set task_limit_cost = 0.270000000,
       batch_limit_cost = 0.270000000,
       daily_limit_cost = 0.270000000,
       spent_cost = 0.155838000,
       reserved_cost = 0
 where pilot_id = '99000000-0000-4000-8000-000000000001';
update public.real_editorial_pilots
   set state = 'researching_round_2'
 where id = '99000000-0000-4000-8000-000000000001';
update public.real_editorial_runs
   set state = 'researching_round_2',
       current_round = 1,
       checkpoint_version = 2,
       accumulated_cost = 0.107838000
 where id = '99000000-0000-4000-8000-000000000002';

insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash,created_at
) values (
  '99000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002',
  'checkpoint','workflow',9,
  '${json(checkpoint)}'::jsonb,
  repeat('a',64),'2099-07-30T10:00:00.000Z'
),(
  '99000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002',
  'tavily_result','round-2',1,
  '${json(roundTwoResult)}'::jsonb,
  repeat('b',64),'2099-07-30T10:01:00.000Z'
);

insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash,created_at
)
select
  '99000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002',
  'source_accepted',source->>'id',1,source,repeat('c',64),
  '2099-07-30T10:01:00.000Z'::timestamptz
from jsonb_array_elements('${json(roundTwoSources)}'::jsonb) source;

insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash,created_at
)
select
  '99000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002',
  'extracted_document',source->>'id',1,
  jsonb_build_object(
    'sourceId',source->>'id',
    'normalizedUrl',source->>'normalizedUrl',
    'content',source->>'content',
    'contentHash',source->>'contentHash'
  ),
  repeat('d',64),'2099-07-30T10:01:00.000Z'::timestamptz
from jsonb_array_elements('${json(roundTwoSources)}'::jsonb) source;

insert into public.real_editorial_call_reservations (
  id,call_id,idempotency_key,execution_id,pilot_id,run_id,task_id,batch_id,
  stage,operation,provider_id,model,attempt,estimated_cost,reserved_cost,
  calculated_cost,currency,tariff_id,state,prompt_version,schema_version,
  input_hash,reconciled_at
) values (
  '99000000-0000-4000-8000-000000000010',
  '99000000-0000-4000-8000-000000000011',
  'integration-source-limit-tavily-attempt-2',
  'real-editorial:99000000-0000-4000-8000-000000000002',
  '99000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002',
  'real-editorial-task:99000000-0000-4000-8000-000000000001',
  'real-editorial-batch:99000000-0000-4000-8000-000000000001',
  '2_research','research','tavily','search-and-extract',2,
  0.048000000,0.048000000,0.048000000,'EUR','morella-v1-tavily-search',
  'reconciled','morella-real-editorial-v1','real-editorial-snapshot-v1',
  repeat('e',64),'2099-07-30T10:01:00.000Z'
);

insert into public.real_editorial_provider_calls (
  call_id,sequence,reservation_id,pilot_id,run_id,stage,operation,provider_id,
  model,state,attempt,input_tokens,output_tokens,tool_calls,tools,credits,
  estimated_cost,reserved_cost,calculated_cost,currency,tariff_id,
  prompt_version,schema_version,input_hash,output_hash,created_at
)
select
  '99000000-0000-4000-8000-000000000011',sequence,
  '99000000-0000-4000-8000-000000000010',
  '99000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002',
  '2_research','research','tavily','search-and-extract','succeeded',2,
  0,0,1,'["search"]'::jsonb,1.5,0.012000000,0.012000000,0.012000000,
  'EUR','morella-v1-tavily-search','morella-real-editorial-v1',
  'real-editorial-snapshot-v1',repeat('e',64),repeat('f',64),
  '2099-07-30T10:01:00.000Z'::timestamptz
from generate_series(1,4) sequence;

insert into public.real_editorial_incidents (
  id,pilot_id,run_id,code,classification,message,created_at
) values (
  '99000000-0000-4000-8000-000000000003',
  '99000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002',
  'LIMIT_EXCEEDED','human_required',
  'El expediente supera el máximo global de fuentes y necesita una selección durable antes de continuar.',
  '2099-07-30T10:01:01.000Z'
);

do $$
begin
  if not exists (
    select 1 from public.real_editorial_incidents
     where id = '99000000-0000-4000-8000-000000000003'
       and resolved_at is null
  ) then raise exception 'RESUME_WAS_NOT_BLOCKED_BEFORE_RECOVERY'; end if;
end;
$$;

create temporary table integration_source_limit_recovery_ids (
  attempt integer primary key,
  recovery_id uuid not null
) on commit drop;

insert into integration_source_limit_recovery_ids
select 1,public.recover_real_editorial_source_limit(
  repeat('1',64),
  '99000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002',
  '99000000-0000-4000-8000-000000000003',
  '99000000-0000-4000-8000-000000000004',
  'Seleccionar cinco fuentes sintéticas sin repetir proveedores.',
  9,repeat('a',64),repeat('b',64),10,
  '${json(recoveredCheckpoint)}'::jsonb,repeat('2',64)
);

insert into integration_source_limit_recovery_ids
select 2,public.recover_real_editorial_source_limit(
  repeat('1',64),
  '99000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002',
  '99000000-0000-4000-8000-000000000003',
  '99000000-0000-4000-8000-000000000004',
  'Seleccionar cinco fuentes sintéticas sin repetir proveedores.',
  9,repeat('a',64),repeat('b',64),10,
  '${json(recoveredCheckpoint)}'::jsonb,repeat('2',64)
);

do $$
begin
  if (select count(distinct recovery_id)
        from integration_source_limit_recovery_ids) <> 1 then
    raise exception 'SOURCE_LIMIT_RECOVERY_NOT_IDEMPOTENT';
  end if;
  begin
    perform public.recover_real_editorial_source_limit(
      repeat('3',64),
      '99000000-0000-4000-8000-000000000001',
      '99000000-0000-4000-8000-000000000002',
      '99000000-0000-4000-8000-000000000003',
      '99000000-0000-4000-8000-000000000004',
      'Motivo incompatible.',9,repeat('a',64),repeat('b',64),10,
      '${json(recoveredCheckpoint)}'::jsonb,repeat('2',64)
    );
    raise exception 'INCOMPATIBLE_SOURCE_LIMIT_RECOVERY_ACCEPTED';
  exception when others then
    if sqlerrm <> 'SOURCE_LIMIT_RECOVERY_ALREADY_APPLIED' then raise; end if;
  end;
end;
$$;

do $$
declare
  recovery public.real_editorial_source_limit_recoveries%rowtype;
  durable_run public.real_editorial_runs%rowtype;
  durable_pilot public.real_editorial_pilots%rowtype;
  durable_budget public.real_editorial_pilot_budgets%rowtype;
begin
  select * into recovery
    from public.real_editorial_source_limit_recoveries
   where pilot_id = '99000000-0000-4000-8000-000000000001';
  select * into durable_run
    from public.real_editorial_runs
   where id = '99000000-0000-4000-8000-000000000002';
  select * into durable_pilot
    from public.real_editorial_pilots
   where id = '99000000-0000-4000-8000-000000000001';
  select * into durable_budget
    from public.real_editorial_pilot_budgets
   where pilot_id = '99000000-0000-4000-8000-000000000001';

  if (select count(*) from public.real_editorial_source_limit_recoveries
       where pilot_id = durable_pilot.id) <> 1 then
    raise exception 'SOURCE_LIMIT_RECOVERY_DUPLICATED';
  end if;
  if jsonb_array_length(recovery.existing_sources) <> 3
     or jsonb_array_length(recovery.candidate_sources) <> 6
     or jsonb_array_length(recovery.selected_sources) <> 5
     or jsonb_array_length(recovery.excluded_sources) <> 1
     or recovery.excluded_sources#>>'{0,id}' <> 'integration-source-2-6'
     or recovery.excluded_sources#>>'{0,reason}'
        <> 'global_source_limit_exhausted' then
    raise exception 'SOURCE_LIMIT_SELECTION_TRACE_INVALID';
  end if;
  if recovery.spent_cost <> 0.155838000
     or recovery.reserved_cost <> 0
     or durable_budget.spent_cost <> 0.155838000
     or durable_budget.reserved_cost <> 0
     or durable_budget.task_limit_cost <> 0.270000000 then
    raise exception 'SOURCE_LIMIT_RECOVERY_CHANGED_LEDGER';
  end if;
  if durable_run.state <> 'evaluating_round_2'
     or durable_run.current_round <> 1
     or durable_run.checkpoint_version <> 10
     or durable_run.accumulated_cost <> 0.155838000
     or durable_pilot.state <> 'evaluating_round_2' then
    raise exception 'SOURCE_LIMIT_RECOVERY_STATE_INVALID';
  end if;
  if (select payload->>'state' from public.real_editorial_artifacts
       where run_id = durable_run.id and artifact_kind = 'checkpoint'
         and artifact_key = 'workflow' order by version desc limit 1)
       <> 'analyzing_round_2'
     or (select jsonb_array_length(payload#>'{dossier,sources}')
           from public.real_editorial_artifacts
          where run_id = durable_run.id and artifact_kind = 'checkpoint'
            and artifact_key = 'workflow' order by version desc limit 1) <> 8 then
    raise exception 'SOURCE_LIMIT_RECOVERY_CHECKPOINT_INVALID';
  end if;
  if (select count(*) from public.real_editorial_provider_calls
       where run_id = durable_run.id) <> 4
     or (select count(*) from public.real_editorial_call_reservations
          where run_id = durable_run.id) <> 1
     or (select count(*) from public.real_editorial_artifacts
          where run_id = durable_run.id and artifact_kind = 'source_accepted') <> 6
     or (select count(*) from public.real_editorial_artifacts
          where run_id = durable_run.id and artifact_kind = 'extracted_document') <> 6
     or exists (
       select 1 from public.real_editorial_artifacts
        where run_id = durable_run.id and artifact_kind = 'round'
          and artifact_key = 'round-2'
     ) then
    raise exception 'SOURCE_LIMIT_RECOVERY_CREATED_WORK_OR_REMOVED_AUDIT';
  end if;
  if (select count(*) from public.real_editorial_events
       where run_id = durable_run.id
         and event_type = 'real.editorial.source_limit.human_recovered') <> 1 then
    raise exception 'SOURCE_LIMIT_RECOVERY_EVENT_INVALID';
  end if;
  if exists (
    select 1 from public.real_editorial_incidents
     where id = recovery.incident_id and resolved_at is null
  ) then raise exception 'SOURCE_LIMIT_INCIDENT_REMAINS_OPEN'; end if;
end;
$$;

rollback;
`
    execFileSync(dockerExecutable, [
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
  }, 30_000)
})
