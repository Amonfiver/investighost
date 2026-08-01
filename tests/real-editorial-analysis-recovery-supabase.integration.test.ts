import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const migrationPath =
  'supabase/migrations/20260801120000_real_editorial_atomic_analysis_recovery.sql'

describe('análisis atómico y recuperación parcial en Supabase local', () => {
  integrationTest('valida rollback, idempotencia y las 38 filas sin proveedores', () => {
    const schemaPresent = execFileSync(dockerExecutable, [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-AtXc',
      `select to_regclass('public.real_editorial_partial_analysis_recoveries') is not null`,
    ], { encoding: 'utf8' }).trim() === 't'
    const migration = schemaPresent ? '' : readFileSync(migrationPath, 'utf8')
    const sql = String.raw`
\set ON_ERROR_STOP on
begin;
${migration}

select id as morella_id from public.geographic_entities
 where normalized_name = 'morella' and country_code = 'ES'
   and entity_type = 'locality' limit 1 \gset

select public.prepare_real_editorial_pilot(
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000002',
  'morella-real-editorial-pilot-v1','integration-atomic-analysis-prepare',
  repeat('a',64),'integration-atomic-analysis',:'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000},{"profile":"student","enabled":true,"targetWords":1800}]'::jsonb
);
select public.confirm_real_editorial_budget(
  'a3000000-0000-4000-8000-000000000001','2099-08-01'
);
insert into public.real_editorial_call_reservations (
  id,call_id,idempotency_key,execution_id,pilot_id,run_id,task_id,batch_id,
  stage,operation,provider_id,model,attempt,estimated_cost,reserved_cost,currency,
  tariff_id,state,prompt_version,schema_version,input_hash
) values (
  'a3000000-0000-4000-8000-000000000020',
  'a3000000-0000-4000-8000-000000000021','integration-atomic-openai-attempt-1',
  'real-editorial:a3000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000002',
  'real-editorial-task:a3000000-0000-4000-8000-000000000001',
  'real-editorial-batch:a3000000-0000-4000-8000-000000000001',
  '2_analysis','analysis','openai','gpt-5.6-luna',1,0.022,0.022,'EUR',
  'morella-v1-openai-responses','started','morella-real-editorial-v1',
  'real-editorial-snapshot-v1',repeat('1',64)
);
insert into public.real_editorial_provider_calls (
  call_id,sequence,reservation_id,pilot_id,run_id,stage,operation,provider_id,
  model,state,attempt,estimated_cost,reserved_cost,currency,tariff_id,
  prompt_version,schema_version,input_hash
) values (
  'a3000000-0000-4000-8000-000000000021',2,
  'a3000000-0000-4000-8000-000000000020',
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000002','2_analysis','analysis','openai',
  'gpt-5.6-luna','started',1,0.022,0.022,'EUR','morella-v1-openai-responses',
  'morella-real-editorial-v1','real-editorial-snapshot-v1',repeat('1',64)
);

select public.record_real_editorial_analysis_response(
  repeat('2',64),'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000002',2,
  'a3000000-0000-4000-8000-000000000021',
  'a3000000-0000-4000-8000-000000000020',1,'resp-integration',
  '{"masterKnowledge":{"revision":2},"proposedQueries":[]}'::jsonb,
  repeat('3',64),'{"inputTokens":100,"outputTokens":20,"estimatedCost":0.001}'::jsonb
) as receipt_id \gset

select public.persist_real_editorial_analysis(
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000002',2,:'receipt_id'::uuid,
  '[
    {"kind":"round","key":"round-2","version":1,"payload":{"round":2,"analysis":{"complete":true}},"payloadHash":"4444444444444444444444444444444444444444444444444444444444444444"},
    {"kind":"query","key":"round-2/q1","version":1,"payload":{"id":"q1","gapId":"g1","query":"diagnóstica","rationale":"final","generatingRound":2,"queryOrdinal":1,"actionable":false},"payloadHash":"5555555555555555555555555555555555555555555555555555555555555555"}
  ]'::jsonb
);
select public.persist_real_editorial_analysis(
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000002',2,:'receipt_id'::uuid,
  '[
    {"kind":"round","key":"round-2","version":1,"payload":{"round":2,"analysis":{"complete":true}},"payloadHash":"4444444444444444444444444444444444444444444444444444444444444444"},
    {"kind":"query","key":"round-2/q1","version":1,"payload":{"id":"q1","gapId":"g1","query":"diagnóstica","rationale":"final","generatingRound":2,"queryOrdinal":1,"actionable":false},"payloadHash":"5555555555555555555555555555555555555555555555555555555555555555"}
  ]'::jsonb
);
do $$
begin
  begin
    perform public.persist_real_editorial_analysis(
      'a3000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000002',2,
      (select id from public.real_editorial_analysis_provider_receipts
        where call_id='a3000000-0000-4000-8000-000000000021'),
      '[
        {"kind":"round","key":"round-2","version":1,"payload":{"round":2,"analysis":{"complete":false}},"payloadHash":"6666666666666666666666666666666666666666666666666666666666666666"},
        {"kind":"gap","key":"round-2/should-not-exist","version":1,"payload":{"id":"x"},"payloadHash":"7777777777777777777777777777777777777777777777777777777777777777"}
      ]'::jsonb
    );
    raise exception 'ATOMIC_CONFLICT_ACCEPTED';
  exception when others then
    if sqlerrm <> 'ANALYSIS_ARTIFACT_CONFLICT' then raise; end if;
  end;
  if exists (select 1 from public.real_editorial_artifacts
      where run_id = 'a3000000-0000-4000-8000-000000000002'
        and artifact_key = 'round-2/should-not-exist') then
    raise exception 'ATOMIC_BATCH_LEFT_PARTIAL_ARTIFACT';
  end if;
  if (select count(*) from public.real_editorial_artifacts
      where run_id = 'a3000000-0000-4000-8000-000000000002'
        and artifact_kind in ('round','query')) <> 2 then
    raise exception 'ATOMIC_BATCH_NOT_IDEMPOTENT';
  end if;
end;
$$;

select public.prepare_real_editorial_pilot(
  'b3000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000002',
  'morella-real-editorial-pilot-v1','integration-partial-analysis-prepare',
  repeat('b',64),'integration-partial-analysis',:'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000},{"profile":"student","enabled":true,"targetWords":1800}]'::jsonb
);
select public.confirm_real_editorial_budget(
  'b3000000-0000-4000-8000-000000000001','2099-08-01'
);
update public.real_editorial_pilot_budgets set
  task_limit_cost=0.27,batch_limit_cost=0.27,daily_limit_cost=0.27,
  spent_cost=0.155838,reserved_cost=0
 where pilot_id='b3000000-0000-4000-8000-000000000001';
update public.real_editorial_pilots set state='evaluating_round_2'
 where id='b3000000-0000-4000-8000-000000000001';
update public.real_editorial_runs set state='evaluating_round_2',current_round=1,
  checkpoint_version=14,accumulated_cost=0.155838
 where id='b3000000-0000-4000-8000-000000000002';
insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash,created_at
) values (
  'b3000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000002','checkpoint','workflow',14,
  '{"version":"real-workflow-v1","state":"analyzing_round_2","completedRound":1}'::jsonb,
  repeat('8',64),'2099-08-01T10:00:00Z'
);
insert into public.real_editorial_call_reservations (
  id,call_id,idempotency_key,execution_id,pilot_id,run_id,task_id,batch_id,
  stage,operation,provider_id,model,attempt,estimated_cost,reserved_cost,
  calculated_cost,currency,tariff_id,state,prompt_version,schema_version,input_hash,
  reconciled_at,created_at
) values (
  'b3000000-0000-4000-8000-000000000004',
  'b3000000-0000-4000-8000-000000000003','integration-partial-openai-attempt-1',
  'real-editorial:b3000000-0000-4000-8000-000000000002',
  'b3000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000002',
  'real-editorial-task:b3000000-0000-4000-8000-000000000001',
  'real-editorial-batch:b3000000-0000-4000-8000-000000000001',
  '2_analysis','analysis','openai','gpt-5.6-luna',1,0.022,0.022,0,'EUR',
  'morella-v1-openai-responses','failed','morella-real-editorial-v1',
  'real-editorial-snapshot-v1',repeat('9',64),'2099-08-01T10:02:00Z',
  '2099-08-01T10:00:30Z'
);
insert into public.real_editorial_provider_calls (
  call_id,sequence,reservation_id,pilot_id,run_id,stage,operation,provider_id,
  model,state,attempt,estimated_cost,reserved_cost,calculated_cost,currency,
  tariff_id,sanitized_error,prompt_version,schema_version,input_hash,created_at
) values
('b3000000-0000-4000-8000-000000000003',2,
 'b3000000-0000-4000-8000-000000000004','b3000000-0000-4000-8000-000000000001',
 'b3000000-0000-4000-8000-000000000002','2_analysis','analysis','openai',
 'gpt-5.6-luna','started',1,0.022,0.022,null,'EUR','morella-v1-openai-responses',
 null,'morella-real-editorial-v1','real-editorial-snapshot-v1',repeat('9',64),
 '2099-08-01T10:01:00Z'),
('b3000000-0000-4000-8000-000000000003',3,
 'b3000000-0000-4000-8000-000000000004','b3000000-0000-4000-8000-000000000001',
 'b3000000-0000-4000-8000-000000000002','2_analysis','analysis','openai',
 'gpt-5.6-luna','failed',1,0.022,0.022,0,'EUR','morella-v1-openai-responses',
 'VERSION_CONFLICT','morella-real-editorial-v1','real-editorial-snapshot-v1',repeat('9',64),
 '2099-08-01T10:01:59Z');

insert into public.real_editorial_artifacts (
  id,pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash,created_at
)
select
  ('b3' || lpad((gs+10)::text,6,'0') || '-0000-4000-8000-' || lpad((gs+10)::text,12,'0'))::uuid,
  'b3000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000002',
  case when gs=1 then 'master_knowledge' when gs=2 then 'coverage'
       when gs between 3 and 12 then 'fact' when gs between 13 and 22 then 'evidence'
       when gs between 23 and 27 then 'place' when gs=28 then 'activity'
       when gs between 29 and 34 then 'gap' else 'contradiction' end,
  case when gs >= 35 then 'round-2-' || (gs-34)::text else 'partial-' || gs::text end,
  case when gs >= 35 then 1 else 2 end,
  jsonb_build_object('partial',gs),repeat(substr(md5(gs::text),1,1),64),
  '2099-08-01T10:01:00Z'::timestamptz + gs * interval '1 millisecond'
from generate_series(1,38) gs;
insert into public.real_editorial_incidents (
  id,pilot_id,run_id,code,classification,message,created_at
) values (
  'b3000000-0000-4000-8000-000000000005',
  'b3000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000002','VERSION_CONFLICT','human_required',
  'El artefacto durable query/q1 v1 diverge en campos semánticos: query',
  '2099-08-01T10:02:00Z'
);

select jsonb_agg(jsonb_build_object(
  'id',id,'kind',artifact_kind,'key',artifact_key,'version',version,
  'payloadHash',payload_hash,'createdAt',created_at
) order by created_at) as partial_snapshot
from public.real_editorial_artifacts
where run_id='b3000000-0000-4000-8000-000000000002'
  and artifact_kind in (
    'master_knowledge','coverage','fact','evidence','place','activity','gap','contradiction'
  ) \gset

select public.recover_real_editorial_partial_analysis(
  repeat('c',64),'b3000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000002',
  'b3000000-0000-4000-8000-000000000005',
  'b3000000-0000-4000-8000-000000000003',
  'b3000000-0000-4000-8000-000000000004',
  'b3000000-0000-4000-8000-000000000006',
  'Decisión prudencial sintética.',0.022,14,:'partial_snapshot'::jsonb,repeat('d',64)
) as first_recovery;
select public.recover_real_editorial_partial_analysis(
  repeat('c',64),'b3000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000002',
  'b3000000-0000-4000-8000-000000000005',
  'b3000000-0000-4000-8000-000000000003',
  'b3000000-0000-4000-8000-000000000004',
  'b3000000-0000-4000-8000-000000000006',
  'Decisión prudencial sintética.',0.022,14,:'partial_snapshot'::jsonb,repeat('d',64)
) as second_recovery;

do $$
begin
  if (select count(*) from public.real_editorial_partial_analysis_recoveries
      where run_id='b3000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'RECOVERY_NOT_IDEMPOTENT';
  end if;
  if (select spent_cost from public.real_editorial_pilot_budgets
      where pilot_id='b3000000-0000-4000-8000-000000000001') <> 0.177838 then
    raise exception 'PRUDENTIAL_COST_NOT_RECONCILED_ONCE';
  end if;
  if (select count(*) from public.real_editorial_artifacts
      where run_id='b3000000-0000-4000-8000-000000000002'
        and artifact_kind in (
          'master_knowledge','coverage','fact','evidence','place','activity','gap','contradiction'
        )) <> 38 then raise exception 'PARTIAL_ARTIFACTS_CHANGED'; end if;
  if (select count(*) from public.real_editorial_call_reservations
      where run_id='b3000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'RECOVERY_CREATED_RESERVATION';
  end if;
  if exists (select 1 from public.real_editorial_incidents
      where id='b3000000-0000-4000-8000-000000000005' and resolved_at is null) then
    raise exception 'VERSION_CONFLICT_STILL_OPEN';
  end if;
  if (select count(*) from public.real_editorial_events
      where run_id='b3000000-0000-4000-8000-000000000002'
        and event_type='real.editorial.analysis.partial_recovered') <> 1 then
    raise exception 'RECOVERY_EVENT_INVALID';
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
