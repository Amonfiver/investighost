import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const migrationPath =
  'supabase/migrations/20260802090000_real_editorial_terminal_review.sql'

describe('revisión humana terminal en Supabase local', () => {
  integrationTest('resuelve las tres decisiones de forma atómica e idempotente con rollback', () => {
    const schemaPresent = execFileSync(dockerExecutable, [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-AtXc',
      `select to_regclass('public.real_editorial_terminal_decisions') is not null`,
    ], { encoding: 'utf8' }).trim() === 't'
    const migration = schemaPresent ? '' : readFileSync(migrationPath, 'utf8')
    const sql = String.raw`
\set ON_ERROR_STOP on
begin;
${migration}

create temporary table real_morella_terminal_before as
select jsonb_build_object(
  'pilot',(select to_jsonb(p) from public.real_editorial_pilots p
    where p.id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'run',(select to_jsonb(r) from public.real_editorial_runs r
    where r.id='467dc951-26f5-45f6-895c-d2f06c496d6e'),
  'budget',(select to_jsonb(b) from public.real_editorial_pilot_budgets b
    where b.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'artifactCount',(select count(*) from public.real_editorial_artifacts a
    where a.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'providerCallCount',(select count(*) from public.real_editorial_provider_calls c
    where c.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'reservationCount',(select count(*) from public.real_editorial_call_reservations c
    where c.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'decisionCount',(select count(*) from public.real_editorial_terminal_decisions d
    where d.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03')
) as snapshot;

create function pg_temp.seed_terminal_result(
  p_pilot uuid,p_run uuid,p_prepare text,p_identity text,p_variant text,
  p_snapshot uuid,p_adventure uuid,p_student uuid,p_review uuid
) returns void language plpgsql as $$
declare
  destination_id uuid;
  adventure_payload jsonb := jsonb_build_object(
    'profile','adventure','title','Aventura sintética','content','Texto Aventura [c1].',
    'approximateWordCount',1000,'promptVersion','real-editorial-v1',
    'schemaVersion','real-intelligence-v1',
    'usage',jsonb_build_object('inputTokens',0,'outputTokens',0,'estimatedCost',0,'currency','EUR')
  );
  student_payload jsonb := jsonb_build_object(
    'profile','student','title','Estudiante sintético','content','Texto Estudiante [c1].',
    'approximateWordCount',1800,'promptVersion','real-editorial-v1',
    'schemaVersion','real-intelligence-v1',
    'usage',jsonb_build_object('inputTokens',0,'outputTokens',0,'estimatedCost',0,'currency','EUR')
  );
  review_payload jsonb := jsonb_build_object(
    'outcome','passed_with_warnings','issues',jsonb_build_array('Advertencia sintética.'),
    'promptVersion','real-editorial-v1','schemaVersion','real-intelligence-v1',
    'usage',jsonb_build_object('inputTokens',0,'outputTokens',0,'estimatedCost',0,'currency','EUR')
  );
begin
  select id into destination_id from public.geographic_entities
   where normalized_name='morella' and country_code='ES' and entity_type='locality' limit 1;
  perform public.prepare_real_editorial_pilot(
    p_pilot,p_run,'morella-real-editorial-pilot-v1',p_prepare,p_identity,p_variant,
    destination_id,
    '[{"profile":"adventure","enabled":true,"targetWords":1000},{"profile":"student","enabled":true,"targetWords":1800}]'::jsonb
  );
  perform public.confirm_real_editorial_budget(p_pilot,'2099-08-02');
  update public.real_editorial_pilot_budgets set
    task_limit_cost=0.35,batch_limit_cost=0.35,daily_limit_cost=0.35,
    spent_cost=0.310169,reserved_cost=0
   where pilot_id=p_pilot;
  update public.real_editorial_pilots set state='pending_human_review'
   where id=p_pilot;
  update public.real_editorial_runs set
    state='pending_human_review',current_round=2,checkpoint_version=16,
    accumulated_cost=0.310169,completed_at=now()
   where id=p_run;
  insert into public.real_editorial_artifacts (
    id,pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
  ) values
  (p_adventure,p_pilot,p_run,'draft_adventure','adventure',1,adventure_payload,repeat('1',64)),
  (p_student,p_pilot,p_run,'draft_student','student',1,student_payload,repeat('2',64)),
  (p_review,p_pilot,p_run,'final_review','final',1,review_payload,repeat('3',64)),
  (p_snapshot,p_pilot,p_run,'checkpoint','pipeline',1,
    jsonb_build_object(
      'state','pending_human_review','currentRound',2,'publicationCount',0,
      'trawelConnected',false,'automaticEnabled',false,
      'drafts',jsonb_build_array(adventure_payload,student_payload),'review',review_payload
    ),repeat('4',64));
end;
$$;

select pg_temp.seed_terminal_result(
  'b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002',
  'terminal-approve-prepare',repeat('a',64),'terminal-approve',
  'b2000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000004',
  'b2000000-0000-4000-8000-000000000005','b2000000-0000-4000-8000-000000000006'
);
select pg_temp.seed_terminal_result(
  'b2000000-0000-4000-8000-000000000011','b2000000-0000-4000-8000-000000000012',
  'terminal-changes-prepare',repeat('b',64),'terminal-changes',
  'b2000000-0000-4000-8000-000000000013','b2000000-0000-4000-8000-000000000014',
  'b2000000-0000-4000-8000-000000000015','b2000000-0000-4000-8000-000000000016'
);
select pg_temp.seed_terminal_result(
  'b2000000-0000-4000-8000-000000000021','b2000000-0000-4000-8000-000000000022',
  'terminal-reject-prepare',repeat('c',64),'terminal-reject',
  'b2000000-0000-4000-8000-000000000023','b2000000-0000-4000-8000-000000000024',
  'b2000000-0000-4000-8000-000000000025','b2000000-0000-4000-8000-000000000026'
);

select public.resolve_real_editorial_terminal_review(
  repeat('d',64),'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000003',repeat('4',64),
  'b2000000-0000-4000-8000-000000000004',repeat('1',64),
  'b2000000-0000-4000-8000-000000000005',repeat('2',64),
  'b2000000-0000-4000-8000-000000000006',repeat('3',64),
  '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11','approve_editorial_result',
  'Aprobación humana sintética.','Warnings revisados sin publicar.',
  '["adventure","student"]','[]',true
) as approved_id \gset
select public.resolve_real_editorial_terminal_review(
  repeat('d',64),'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000003',repeat('4',64),
  'b2000000-0000-4000-8000-000000000004',repeat('1',64),
  'b2000000-0000-4000-8000-000000000005',repeat('2',64),
  'b2000000-0000-4000-8000-000000000006',repeat('3',64),
  '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11','approve_editorial_result',
  'Aprobación humana sintética.','Warnings revisados sin publicar.',
  '["adventure","student"]','[]',true
) as repeated_approved_id \gset

do $$
declare approved public.real_editorial_terminal_decisions%rowtype;
begin
  select * into approved from public.real_editorial_terminal_decisions
   where decision_key=repeat('d',64);
  if (select count(*) from public.real_editorial_terminal_decisions
          where decision_key=repeat('d',64)) <> 1 then
    raise exception 'TERMINAL_APPROVAL_NOT_IDEMPOTENT';
  end if;
  if approved.decision <> 'approve_editorial_result'
     or approved.resulting_state <> 'human_approved'
     or not approved.warnings_accepted
     or approved.spent_cost <> 0.310169 or approved.reserved_cost <> 0
     or approved.maximum_cost <> 0.35 or approved.automated_work_remaining <> 0
     or approved.projected_total_cost <> 0.310169 or approved.shortfall_cost <> 0
     or approved.provider_calls_performed <> 0 or approved.reservations_created <> 0
     or approved.publication_count <> 0 or approved.trawel_connected
     or approved.automatic_enabled then
    raise exception 'TERMINAL_APPROVAL_INVALID';
  end if;
  if (select state from public.real_editorial_pilots
       where id='b2000000-0000-4000-8000-000000000001') <> 'human_approved'
     or (select state from public.real_editorial_runs
         where id='b2000000-0000-4000-8000-000000000002') <> 'human_approved'
     or (select count(*) from public.real_editorial_artifacts
         where run_id='b2000000-0000-4000-8000-000000000002') <> 4
     or (select spent_cost from public.real_editorial_pilot_budgets
         where pilot_id='b2000000-0000-4000-8000-000000000001') <> 0.310169
     or (select reserved_cost from public.real_editorial_pilot_budgets
         where pilot_id='b2000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'TERMINAL_APPROVAL_CHANGED_DURABLE_INPUTS';
  end if;
  begin
    perform public.resolve_real_editorial_terminal_review(
      repeat('d',64),'b2000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000003',repeat('4',64),
      'b2000000-0000-4000-8000-000000000004',repeat('1',64),
      'b2000000-0000-4000-8000-000000000005',repeat('2',64),
      'b2000000-0000-4000-8000-000000000006',repeat('3',64),
      '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11','reject_editorial_result',
      'Decisión incompatible.','No debe aceptarse.','["adventure","student"]','[]',false
    );
    raise exception 'TERMINAL_INCOMPATIBLE_DECISION_ACCEPTED';
  exception when others then
    if sqlerrm <> 'TERMINAL_DECISION_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
end;
$$;

select public.resolve_real_editorial_terminal_review(
  repeat('e',64),'b2000000-0000-4000-8000-000000000011',
  'b2000000-0000-4000-8000-000000000012','b2000000-0000-4000-8000-000000000013',repeat('4',64),
  'b2000000-0000-4000-8000-000000000014',repeat('1',64),
  'b2000000-0000-4000-8000-000000000015',repeat('2',64),
  'b2000000-0000-4000-8000-000000000016',repeat('3',64),
  '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11','request_changes',
  'Cambios humanos sintéticos.','Conservar versión uno sin regenerar.',
  '["student"]','[{"profile":"student","comment":"Diferenciar mejor el perfil Estudiante."}]',false
);
select public.resolve_real_editorial_terminal_review(
  repeat('f',64),'b2000000-0000-4000-8000-000000000021',
  'b2000000-0000-4000-8000-000000000022','b2000000-0000-4000-8000-000000000023',repeat('4',64),
  'b2000000-0000-4000-8000-000000000024',repeat('1',64),
  'b2000000-0000-4000-8000-000000000025',repeat('2',64),
  'b2000000-0000-4000-8000-000000000026',repeat('3',64),
  '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11','reject_editorial_result',
  'Rechazo humano sintético.','Conservar todo sin publicar.',
  '["adventure","student"]','[]',false
);

do $$
begin
  if (select state from public.real_editorial_runs
       where id='b2000000-0000-4000-8000-000000000012') <> 'changes_requested'
     or (select state from public.real_editorial_runs
         where id='b2000000-0000-4000-8000-000000000022') <> 'human_rejected' then
    raise exception 'TERMINAL_STATES_INVALID';
  end if;
  if (select profile_comments from public.real_editorial_terminal_decisions
       where run_id='b2000000-0000-4000-8000-000000000012')
       <> '[{"profile":"student","comment":"Diferenciar mejor el perfil Estudiante."}]'::jsonb then
    raise exception 'TERMINAL_PROFILE_COMMENTS_MISSING';
  end if;
  if (select count(*) from public.real_editorial_artifacts
       where run_id in ('b2000000-0000-4000-8000-000000000012',
                        'b2000000-0000-4000-8000-000000000022')) <> 8
     or (select count(*) from public.real_editorial_provider_calls
         where pilot_id::text like 'b2000000-%') <> 0
     or (select count(*) from public.real_editorial_call_reservations
         where pilot_id::text like 'b2000000-%') <> 0
     or (select sum(publication_count) from public.real_editorial_pilots
         where id::text like 'b2000000-%') <> 0
     or exists (select 1 from public.real_editorial_pilots
         where id::text like 'b2000000-%' and (trawel_connected or automatic_enabled)) then
    raise exception 'TERMINAL_DECISIONS_CREATED_EXTERNAL_EFFECTS';
  end if;
  if (select count(*) from public.real_editorial_events
       where pilot_id::text like 'b2000000-%'
         and event_type='real.editorial.terminal.human_decided') <> 3 then
    raise exception 'TERMINAL_AUDIT_EVENTS_MISSING';
  end if;
  if (select snapshot from real_morella_terminal_before) is distinct from (
    select jsonb_build_object(
      'pilot',(select to_jsonb(p) from public.real_editorial_pilots p
        where p.id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'run',(select to_jsonb(r) from public.real_editorial_runs r
        where r.id='467dc951-26f5-45f6-895c-d2f06c496d6e'),
      'budget',(select to_jsonb(b) from public.real_editorial_pilot_budgets b
        where b.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'artifactCount',(select count(*) from public.real_editorial_artifacts a
        where a.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'providerCallCount',(select count(*) from public.real_editorial_provider_calls c
        where c.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'reservationCount',(select count(*) from public.real_editorial_call_reservations c
        where c.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'decisionCount',(select count(*) from public.real_editorial_terminal_decisions d
        where d.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03')
    )
  ) then raise exception 'REAL_MORELLA_WAS_MODIFIED'; end if;
end;
$$;

rollback;
`
    const output = execFileSync(dockerExecutable, [
      'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X',
    ], { input: sql, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
    expect(output).toContain('ROLLBACK')
  }, 120_000)
})
