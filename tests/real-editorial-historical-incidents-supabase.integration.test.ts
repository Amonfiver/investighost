import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const migrationPath =
  'supabase/migrations/20260801180000_real_editorial_historical_incident_resolution.sql'

describe('resolución histórica en Supabase local', () => {
  integrationTest('valida dos causas, idempotencia e invariantes dentro de BEGIN/ROLLBACK', () => {
    const schemaPresent = execFileSync(dockerExecutable, [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-AtXc',
      `select to_regclass('public.real_editorial_historical_incident_resolutions') is not null`,
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
  'incidentCount',(select count(*) from public.real_editorial_incidents i
    where i.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'resolvedIncidentCount',(select count(*) from public.real_editorial_incidents i
    where i.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03' and i.resolved_at is not null),
  'artifactCount',(select count(*) from public.real_editorial_artifacts a
    where a.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'providerCallCount',(select count(*) from public.real_editorial_provider_calls c
    where c.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03')
) as snapshot;

select id as morella_id from public.geographic_entities
 where normalized_name = 'morella' and country_code = 'ES'
   and entity_type = 'locality' limit 1 \gset

select public.prepare_real_editorial_pilot(
  'c5000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000002',
  'morella-real-editorial-pilot-v1','integration-historical-incidents-prepare',
  repeat('c',64),'integration-historical-incidents',:'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000},{"profile":"student","enabled":true,"targetWords":1800}]'::jsonb
);
select public.confirm_real_editorial_budget(
  'c5000000-0000-4000-8000-000000000001','2099-08-01'
);
update public.real_editorial_pilot_budgets set
  task_limit_cost=0.27,batch_limit_cost=0.27,daily_limit_cost=0.27,
  spent_cost=0.177838,reserved_cost=0
 where pilot_id='c5000000-0000-4000-8000-000000000001';
update public.real_editorial_pilots set state='evaluating_round_2'
 where id='c5000000-0000-4000-8000-000000000001';
update public.real_editorial_runs set state='evaluating_round_2',current_round=1,
  checkpoint_version=14,accumulated_cost=0.177838
 where id='c5000000-0000-4000-8000-000000000002';

insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash,created_at
) values
(
  'c5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002',
  'mission','initial',1,
  '{"runId":"c5000000-0000-4000-8000-000000000002","round":1,"createdAt":"2099-08-01T09:00:00.000Z"}',
  repeat('1',64),'2099-08-01T09:00:00Z'
),
(
  'c5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002',
  'checkpoint','workflow',2,
  '{"state":"queued","completedRound":0,"initialMission":{"runId":"c5000000-0000-4000-8000-000000000002","round":1,"createdAt":"2099-08-01T09:00:00.000Z"}}',
  repeat('2',64),'2099-08-01T10:00:00Z'
),
(
  'c5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002',
  'tavily_result','round-1',1,'{"round":1,"sources":[]}',repeat('3',64),
  '2099-08-01T10:01:30Z'
),
(
  'c5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002',
  'query','q3',1,
  '{"id":"q3","gapId":"gap-3","query":"itinerarios Morella","rationale":"riesgos"}',
  repeat('4',64),'2099-08-01T10:01:40Z'
),
(
  'c5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002',
  'checkpoint','workflow',11,
  '{"state":"researching_round_2","completedRound":1,"initialMission":{"runId":"c5000000-0000-4000-8000-000000000002","round":1,"createdAt":"2099-08-01T09:00:00.000Z"},"nextRoundQueries":[{"id":"q3","gapId":"gap-3","query":"itinerarios Morella","rationale":"seguridad"}]}',
  repeat('5',64),'2099-08-01T10:02:00Z'
),
(
  'c5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002',
  'tavily_result','round-2',1,'{"round":2,"sources":[]}',repeat('6',64),
  '2099-08-01T10:03:30Z'
),
(
  'c5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002',
  'checkpoint','workflow',14,
  '{"state":"analyzing_round_2","completedRound":1,"initialMission":{"runId":"c5000000-0000-4000-8000-000000000002","round":1,"createdAt":"2099-08-01T09:00:00.000Z"},"nextRoundQueries":[{"id":"q3","gapId":"gap-3","query":"itinerarios Morella","rationale":"riesgos"}],"dossier":{"sources":[{"id":1},{"id":2},{"id":3},{"id":4},{"id":5},{"id":6},{"id":7},{"id":8}]}}',
  repeat('7',64),'2099-08-01T10:04:00Z'
);

insert into public.real_editorial_incidents (
  id,pilot_id,run_id,code,classification,message,created_at
) values
(
  'c5000000-0000-4000-8000-000000000010',
  'c5000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000002','VERSION_CONFLICT','human_required',
  'La ejecución editorial real se detuvo; revisar el ledger y el checkpoint durable.',
  '2099-08-01T10:01:00Z'
),
(
  'c5000000-0000-4000-8000-000000000011',
  'c5000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000002','VERSION_CONFLICT','human_required',
  'La ejecución editorial real se detuvo; revisar el ledger y el checkpoint durable.',
  '2099-08-01T10:03:00Z'
);

create temporary table synthetic_before as
select jsonb_build_object(
  'spent',b.spent_cost,'reserved',b.reserved_cost,
  'checkpointVersion',(select max(version) from public.real_editorial_artifacts
    where run_id=b_run.id and artifact_kind='checkpoint' and artifact_key='workflow'),
  'checkpointHash',(select payload_hash from public.real_editorial_artifacts
    where run_id=b_run.id and artifact_kind='checkpoint' and artifact_key='workflow'
    order by version desc limit 1),
  'artifactCount',(select count(*) from public.real_editorial_artifacts
    where run_id=b_run.id),
  'reservationCount',(select count(*) from public.real_editorial_call_reservations
    where run_id=b_run.id),
  'providerCallCount',(select count(*) from public.real_editorial_provider_calls
    where run_id=b_run.id),
  'sourceCount',8
) as snapshot
from public.real_editorial_pilot_budgets b
join public.real_editorial_runs b_run on b_run.pilot_id=b.pilot_id
where b.pilot_id='c5000000-0000-4000-8000-000000000001';

create temporary table resolution_results(id uuid);
insert into resolution_results select public.resolve_real_editorial_historical_incidents(
  repeat('8',64),'c5000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000002',
  'c5000000-0000-4000-8000-000000000012','Resolución sintética con evidencia.',
  array['c5000000-0000-4000-8000-000000000010'::uuid,
        'c5000000-0000-4000-8000-000000000011'::uuid],14,repeat('7',64)
);
insert into resolution_results select public.resolve_real_editorial_historical_incidents(
  repeat('8',64),'c5000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000002',
  'c5000000-0000-4000-8000-000000000012','Resolución sintética con evidencia.',
  array['c5000000-0000-4000-8000-000000000010'::uuid,
        'c5000000-0000-4000-8000-000000000011'::uuid],14,repeat('7',64)
);

do $$
declare
  after_snapshot jsonb;
  real_after jsonb;
begin
  begin
    perform public.resolve_real_editorial_historical_incidents(
      repeat('9',64),'c5000000-0000-4000-8000-000000000001',
      'c5000000-0000-4000-8000-000000000002',
      'c5000000-0000-4000-8000-000000000012','Otra resolución incompatible.',
      array['c5000000-0000-4000-8000-000000000010'::uuid,
            'c5000000-0000-4000-8000-000000000011'::uuid],14,repeat('7',64)
    );
    raise exception 'INCOMPATIBLE_RESOLUTION_ACCEPTED';
  exception when others then
    if sqlerrm <> 'HISTORICAL_INCIDENT_ALREADY_RESOLVED' then raise; end if;
  end;
  if (select count(distinct id) from resolution_results) <> 1
     or (select count(*) from public.real_editorial_historical_incident_resolution_batches
          where run_id='c5000000-0000-4000-8000-000000000002') <> 1
     or (select count(*) from public.real_editorial_historical_incident_resolutions
          where run_id='c5000000-0000-4000-8000-000000000002'
            and classification='historical_non_blocking'
            and security_evaluation='passed') <> 2 then
    raise exception 'HISTORICAL_RESOLUTION_NOT_IDEMPOTENT';
  end if;
  if (select count(*) from public.real_editorial_incidents
      where run_id='c5000000-0000-4000-8000-000000000002'
        and code in ('VERSION_CONFLICT','PERSISTENCE_ERROR') and resolved_at is null) <> 0 then
    raise exception 'HISTORICAL_INCIDENT_STILL_BLOCKING';
  end if;
  select jsonb_build_object(
    'spent',b.spent_cost,'reserved',b.reserved_cost,
    'checkpointVersion',(select max(version) from public.real_editorial_artifacts
      where run_id=b_run.id and artifact_kind='checkpoint' and artifact_key='workflow'),
    'checkpointHash',(select payload_hash from public.real_editorial_artifacts
      where run_id=b_run.id and artifact_kind='checkpoint' and artifact_key='workflow'
      order by version desc limit 1),
    'artifactCount',(select count(*) from public.real_editorial_artifacts
      where run_id=b_run.id),
    'reservationCount',(select count(*) from public.real_editorial_call_reservations
      where run_id=b_run.id),
    'providerCallCount',(select count(*) from public.real_editorial_provider_calls
      where run_id=b_run.id),
    'sourceCount',jsonb_array_length((select payload #> '{dossier,sources}'
      from public.real_editorial_artifacts where run_id=b_run.id
        and artifact_kind='checkpoint' and artifact_key='workflow'
      order by version desc limit 1))
  ) into after_snapshot
  from public.real_editorial_pilot_budgets b
  join public.real_editorial_runs b_run on b_run.pilot_id=b.pilot_id
  where b.pilot_id='c5000000-0000-4000-8000-000000000001';
  if after_snapshot is distinct from (select snapshot from synthetic_before) then
    raise exception 'HISTORICAL_RESOLUTION_CHANGED_DURABLE_STATE';
  end if;
  if (select count(*) from public.real_editorial_events
      where run_id='c5000000-0000-4000-8000-000000000002'
        and event_type='real.editorial.incidents.historical_resolved'
        and payload->>'providerCalled'='false'
        and payload->>'workflowResumed'='false') <> 1 then
    raise exception 'HISTORICAL_RESOLUTION_EVENT_INVALID';
  end if;
  select jsonb_build_object(
    'pilot',(select to_jsonb(p) from public.real_editorial_pilots p
      where p.id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
    'budget',(select to_jsonb(b) from public.real_editorial_pilot_budgets b
      where b.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
    'incidentCount',(select count(*) from public.real_editorial_incidents i
      where i.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
    'resolvedIncidentCount',(select count(*) from public.real_editorial_incidents i
      where i.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03' and i.resolved_at is not null),
    'artifactCount',(select count(*) from public.real_editorial_artifacts a
      where a.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
    'providerCallCount',(select count(*) from public.real_editorial_provider_calls c
      where c.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03')
  ) into real_after;
  if real_after is distinct from (select snapshot from real_morella_before) then
    raise exception 'REAL_MORELLA_PILOT_WAS_MODIFIED';
  end if;
end;
$$;
rollback;
`
    execFileSync(dockerExecutable, [
      'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X',
    ], {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    })
  })
})
