import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, it } from 'vitest'

const integrationTest = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1' ? it : it.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const migration = readFileSync(
  'supabase/migrations/20260802170000_real_editorial_library_transition.sql',
  'utf8',
)

describe('incorporación editorial real a Biblioteca en Supabase local', () => {
  integrationTest('crea dos entradas atómicas, idempotentes y sin efectos externos con rollback', () => {
    const installed = execFileSync(dockerExecutable, [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-Atc',
      "select to_regclass('public.real_editorial_library_transfers')",
    ], { encoding: 'utf8' }).trim() === 'real_editorial_library_transfers'
    const sql = String.raw`
\set ON_ERROR_STOP on
begin;
${installed ? '' : migration}

create temporary table real_morella_library_before as
select jsonb_build_object(
  'pilot',(select to_jsonb(p) from public.real_editorial_pilots p
    where p.id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'run',(select to_jsonb(r) from public.real_editorial_runs r
    where r.id='467dc951-26f5-45f6-895c-d2f06c496d6e'),
  'budget',(select to_jsonb(b) from public.real_editorial_pilot_budgets b
    where b.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'artifacts',(select jsonb_agg(to_jsonb(a) order by a.id)
    from public.real_editorial_artifacts a
    where a.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'providerCalls',(select count(*) from public.real_editorial_provider_calls c
    where c.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'reservations',(select count(*) from public.real_editorial_call_reservations c
    where c.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
  'events',(select count(*) from public.real_editorial_events e
    where e.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03')
) as snapshot;

create function pg_temp.seed_library_candidate(
  p_pilot uuid,p_run uuid,p_suffix text,p_snapshot uuid,p_adventure uuid,
  p_student uuid,p_review uuid,p_evidence_one uuid,p_evidence_two uuid,
  p_resolve_approval boolean
) returns uuid language plpgsql as $$
declare
  destination_id uuid;
  decision_id uuid;
  adventure_payload jsonb := jsonb_build_object(
    'profile','adventure','title','Aventura sintética aprobada',
    'content','Texto Aventura exacto [c1].','approximateWordCount',1000,
    'promptVersion','real-editorial-v1','schemaVersion','real-intelligence-v1',
    'usage',jsonb_build_object('inputTokens',10,'outputTokens',20,
      'estimatedCost',0.01,'currency','USD','providerRequestIds',jsonb_build_array('resp-a'))
  );
  student_payload jsonb := jsonb_build_object(
    'profile','student','title','Estudiante sintético aprobado',
    'content','Texto Estudiante exacto [c2].','approximateWordCount',1800,
    'promptVersion','real-editorial-v1','schemaVersion','real-intelligence-v1',
    'usage',jsonb_build_object('inputTokens',30,'outputTokens',40,
      'estimatedCost',0.02,'currency','USD','providerRequestIds',jsonb_build_array('resp-s'))
  );
  review_payload jsonb := jsonb_build_object(
    'outcome','passed_with_warnings','issues',jsonb_build_array('Warning sintético aceptado.'),
    'promptVersion','real-editorial-v1','schemaVersion','real-intelligence-v1',
    'usage',jsonb_build_object('inputTokens',50,'outputTokens',60,
      'estimatedCost',0.01,'currency','USD','providerRequestIds',jsonb_build_array('resp-r'))
  );
  claims jsonb := jsonb_build_array(
    jsonb_build_object('id','c1','topic','historia','statement','Claim uno.',
      'evidenceIds',jsonb_build_array('e1'),'confidence',0.9,
      'suitableProfiles',jsonb_build_array('adventure','student')),
    jsonb_build_object('id','c2','topic','vida','statement','Claim dos.',
      'evidenceIds',jsonb_build_array('e2'),'confidence',0.8,
      'suitableProfiles',jsonb_build_array('adventure','student'))
  );
  contradictions jsonb := jsonb_build_array(
    'Contradicción uno.','Contradicción dos.','Contradicción tres.'
  );
  sources jsonb := jsonb_build_array(
    jsonb_build_object('id','e1','round',2,'url','https://example.com/morella-1',
      'normalizedUrl','https://example.com/morella-1','title','Fuente uno',
      'capturedAt','2026-08-02T16:00:00.000Z','contentHash',repeat('a',64),
      'score',0.9,'content','Contenido fuente uno.'),
    jsonb_build_object('id','e2','round',2,'url','https://example.com/morella-2',
      'normalizedUrl','https://example.com/morella-2','title','Fuente dos',
      'capturedAt','2026-08-02T16:00:00.000Z','contentHash',repeat('b',64),
      'score',0.8,'content','Contenido fuente dos.')
  );
  gaps jsonb := jsonb_build_array(
    jsonb_build_object('id','g1','topic','uno','description','Gap uno.',
      'importance','medium','requiredForProfiles',jsonb_build_array('adventure'),
      'resolvableWithResearch',false),
    jsonb_build_object('id','g2','topic','dos','description','Gap dos.',
      'importance','medium','requiredForProfiles',jsonb_build_array('student'),
      'resolvableWithResearch',false),
    jsonb_build_object('id','g3','topic','tres','description','Gap tres.',
      'importance','medium','requiredForProfiles',jsonb_build_array('adventure','student'),
      'resolvableWithResearch',false),
    jsonb_build_object('id','g4','topic','cuatro','description','Gap cuatro.',
      'importance','medium','requiredForProfiles',jsonb_build_array('adventure','student'),
      'resolvableWithResearch',false),
    jsonb_build_object('id','g5','topic','cinco','description','Gap cinco.',
      'importance','medium','requiredForProfiles',jsonb_build_array('adventure','student'),
      'resolvableWithResearch',false)
  );
begin
  select id into destination_id from public.geographic_entities
   where normalized_name='morella' and country_code='ES' and entity_type='locality' limit 1;
  perform public.prepare_real_editorial_pilot(
    p_pilot,p_run,'morella-real-editorial-pilot-v1','library-' || p_suffix,
    encode(digest('library-identity-' || p_suffix,'sha256'),'hex'),'library-' || p_suffix,
    destination_id,
    '[{"profile":"adventure","enabled":true,"targetWords":1000},{"profile":"student","enabled":true,"targetWords":1800}]'::jsonb
  );
  perform public.confirm_real_editorial_budget(p_pilot,'2099-08-02');
  update public.real_editorial_pilot_budgets set
    task_limit_cost=0.35,batch_limit_cost=0.35,daily_limit_cost=0.35,
    spent_cost=0.310169,reserved_cost=0
   where pilot_id=p_pilot;
  update public.real_editorial_pilots set state='pending_human_review' where id=p_pilot;
  update public.real_editorial_runs set state='pending_human_review',current_round=2,
    checkpoint_version=16,accumulated_cost=0.310169,completed_at=now() where id=p_run;
  insert into public.real_editorial_artifacts (
    id,pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
  ) values
  (p_adventure,p_pilot,p_run,'draft_adventure','adventure',1,adventure_payload,repeat('1',64)),
  (p_student,p_pilot,p_run,'draft_student','student',1,student_payload,repeat('2',64)),
  (p_review,p_pilot,p_run,'final_review','final',1,review_payload,repeat('3',64)),
  (p_evidence_one,p_pilot,p_run,'evidence','e1',1,
    jsonb_build_object('claimId','c1','statement','Claim uno.','evidenceIds',jsonb_build_array('e1'),
      'confidence',0.9),repeat('5',64)),
  (p_evidence_two,p_pilot,p_run,'evidence','e2',1,
    jsonb_build_object('claimId','c2','statement','Claim dos.','evidenceIds',jsonb_build_array('e2'),
      'confidence',0.8),repeat('6',64)),
  (p_snapshot,p_pilot,p_run,'checkpoint','pipeline',1,
    jsonb_build_object(
      'version','real-editorial-snapshot-v1','state','pending_human_review','currentRound',2,
      'publicationCount',0,'trawelConnected',false,'automaticEnabled',false,
      'drafts',jsonb_build_array(
        adventure_payload #- '{usage,providerRequestIds}',
        student_payload #- '{usage,providerRequestIds}'
      ),
      'review',review_payload #- '{usage,providerRequestIds}',
      'dossier',jsonb_build_object('sources',sources),
      'masterKnowledge',jsonb_build_object('claims',claims,'contradictions',contradictions),
      'roundResults',jsonb_build_array(jsonb_build_object(
        'round',2,'gaps',gaps,'masterKnowledge',jsonb_build_object(
          'claims',claims,'contradictions',contradictions
        )
      ))
    ),repeat('4',64));
  if not p_resolve_approval then return null; end if;
  select public.resolve_real_editorial_terminal_review(
    encode(digest('library-decision-' || p_suffix,'sha256'),'hex'),p_pilot,p_run,
    p_snapshot,repeat('4',64),p_adventure,repeat('1',64),p_student,repeat('2',64),
    p_review,repeat('3',64),'6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11',
    'approve_editorial_result','Aprobación sintética.','Warnings aceptados sin publicar.',
    '["adventure","student"]','[]',true
  ) into decision_id;
  return decision_id;
end;
$$;

select pg_temp.seed_library_candidate(
  'c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002','main',
  'c2000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000004',
  'c2000000-0000-4000-8000-000000000005','c2000000-0000-4000-8000-000000000006',
  'c2000000-0000-4000-8000-000000000007','c2000000-0000-4000-8000-000000000008',true
) as decision_id \gset

create temporary table synthetic_before as
select jsonb_build_object(
  'budget',(select to_jsonb(b) from public.real_editorial_pilot_budgets b
    where b.pilot_id='c2000000-0000-4000-8000-000000000001'),
  'artifacts',(select jsonb_agg(to_jsonb(a) order by a.id) from public.real_editorial_artifacts a
    where a.pilot_id='c2000000-0000-4000-8000-000000000001'),
  'providerCalls',(select count(*) from public.real_editorial_provider_calls c
    where c.pilot_id='c2000000-0000-4000-8000-000000000001'),
  'reservations',(select count(*) from public.real_editorial_call_reservations c
    where c.pilot_id='c2000000-0000-4000-8000-000000000001')
) snapshot;

select public.move_approved_result_to_library(
  repeat('7',64),'c2000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000003',repeat('4',64),
  'c2000000-0000-4000-8000-000000000004',repeat('1',64),
  'c2000000-0000-4000-8000-000000000005',repeat('2',64),
  'c2000000-0000-4000-8000-000000000006',repeat('3',64),
  :'decision_id','6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
) as transfer_id \gset
select public.move_approved_result_to_library(
  repeat('7',64),'c2000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000003',repeat('4',64),
  'c2000000-0000-4000-8000-000000000004',repeat('1',64),
  'c2000000-0000-4000-8000-000000000005',repeat('2',64),
  'c2000000-0000-4000-8000-000000000006',repeat('3',64),
  :'decision_id','6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
) as repeated_transfer_id \gset

do $$
declare
  adventure public.real_editorial_library_entries%rowtype;
  student public.real_editorial_library_entries%rowtype;
  transfer_uuid uuid;
  decision_uuid uuid;
begin
  select id,terminal_decision_id into transfer_uuid,decision_uuid
    from public.real_editorial_library_transfers
   where pilot_id='c2000000-0000-4000-8000-000000000001';
  select * into adventure from public.real_editorial_library_entries
   where transfer_id=transfer_uuid and profile='adventure';
  select * into student from public.real_editorial_library_entries
   where transfer_id=transfer_uuid and profile='student';
  if (select count(*) from public.real_editorial_library_transfers
          where pilot_id='c2000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.real_editorial_library_entries
          where pilot_id='c2000000-0000-4000-8000-000000000001') <> 2
     or adventure.title <> 'Aventura sintética aprobada'
     or adventure.content <> 'Texto Aventura exacto [c1].'
     or adventure.source_artifact_id <> 'c2000000-0000-4000-8000-000000000004'
     or adventure.source_artifact_hash <> repeat('1',64)
     or student.title <> 'Estudiante sintético aprobado'
     or student.content <> 'Texto Estudiante exacto [c2].'
     or student.source_artifact_id <> 'c2000000-0000-4000-8000-000000000005'
     or student.source_artifact_hash <> repeat('2',64)
     or adventure.status <> 'approved_unpublished' or student.status <> 'approved_unpublished'
     or adventure.publication_state <> 'unpublished' or student.publication_state <> 'unpublished'
     or adventure.origin <> 'real_editorial_pilot' or student.origin <> 'real_editorial_pilot'
     or adventure.review_outcome <> 'passed_with_warnings'
     or jsonb_array_length(adventure.warnings) <> 1
     or jsonb_array_length(adventure.gaps) <> 5
     or jsonb_array_length(adventure.contradictions) <> 3
     or jsonb_array_length(adventure.claims) <> 2
     or jsonb_array_length(adventure.evidence) <> 2
     or jsonb_array_length(adventure.sources) <> 2
     or adventure.final_run_cost <> 0.310169
     or adventure.terminal_decision_id <> decision_uuid
     or (select state from public.real_editorial_pilots
          where id='c2000000-0000-4000-8000-000000000001') <> 'ready_for_library'
     or (select state from public.real_editorial_runs
          where id='c2000000-0000-4000-8000-000000000002') <> 'ready_for_library'
     or (select count(*) from public.real_editorial_events
          where pilot_id='c2000000-0000-4000-8000-000000000001'
            and event_type='real.editorial.library.added') <> 1 then
    raise exception 'LIBRARY_TRANSFER_RESULT_INVALID';
  end if;
  if (select snapshot from synthetic_before) is distinct from (
    select jsonb_build_object(
      'budget',(select to_jsonb(b) from public.real_editorial_pilot_budgets b
        where b.pilot_id='c2000000-0000-4000-8000-000000000001'),
      'artifacts',(select jsonb_agg(to_jsonb(a) order by a.id) from public.real_editorial_artifacts a
        where a.pilot_id='c2000000-0000-4000-8000-000000000001'),
      'providerCalls',(select count(*) from public.real_editorial_provider_calls c
        where c.pilot_id='c2000000-0000-4000-8000-000000000001'),
      'reservations',(select count(*) from public.real_editorial_call_reservations c
        where c.pilot_id='c2000000-0000-4000-8000-000000000001')
    )
  ) then raise exception 'LIBRARY_TRANSFER_CHANGED_LEDGER_ARTIFACTS_OR_PROVIDERS'; end if;
end;
$$;

do $$
declare decision_uuid uuid;
  transfer_uuid uuid;
begin
  select terminal_decision_id,id into decision_uuid,transfer_uuid
    from public.real_editorial_library_transfers
   where pilot_id='c2000000-0000-4000-8000-000000000001';
  begin
    perform public.move_approved_result_to_library(
      repeat('7',64),'c2000000-0000-4000-8000-000000000001',
      'c2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000003',repeat('4',64),
      'c2000000-0000-4000-8000-000000000004',repeat('9',64),
      'c2000000-0000-4000-8000-000000000005',repeat('2',64),
      'c2000000-0000-4000-8000-000000000006',repeat('3',64),
      decision_uuid,'6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
    );
    raise exception 'LIBRARY_DIFFERENT_HASH_ACCEPTED';
  exception when others then
    if sqlerrm <> 'LIBRARY_TRANSFER_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  begin
    perform public.move_approved_result_to_library(
      repeat('8',64),'c2000000-0000-4000-8000-000000000001',
      'c2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000003',repeat('4',64),
      'c2000000-0000-4000-8000-000000000004',repeat('1',64),
      'c2000000-0000-4000-8000-000000000005',repeat('2',64),
      'c2000000-0000-4000-8000-000000000006',repeat('3',64),
      decision_uuid,'6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
    );
    raise exception 'LIBRARY_DIFFERENT_TRANSFER_ACCEPTED';
  exception when others then
    if sqlerrm <> 'LIBRARY_ORIGIN_CONFLICT' then raise; end if;
  end;
  begin
    insert into public.real_editorial_library_entries
    select gen_random_uuid(),repeat('9',64),transfer_id,pilot_id,run_id,canonical_destination_id,
      destination_name,country_code,destination_type,'student',title,content,editorial_version,
      language,status,editorial_state,library_state,publication_state,origin,source_artifact_id,
      'draft_adventure','adventure',source_artifact_version,source_artifact_hash,
      source_artifact_created_at,final_review_artifact_id,final_review_hash,final_review_version,
      final_review_created_at,terminal_decision_id,review_outcome,review_payload,warnings,gaps,
      contradictions,claims,evidence,sources,approval_actor_id,transfer_actor_id,final_run_cost,currency,
      approved_at,created_at
    from public.real_editorial_library_entries
    where transfer_id=transfer_uuid and profile='adventure';
    raise exception 'LIBRARY_PROFILE_MISMATCH_ACCEPTED';
  exception when check_violation or unique_violation then null;
  end;
  begin
    update public.real_editorial_library_entries set content='Contenido alterado.'
     where transfer_id=transfer_uuid and profile='adventure';
    raise exception 'LIBRARY_ORIGIN_MUTATION_ACCEPTED';
  exception when others then
    if sqlerrm <> 'REAL_EDITORIAL_APPEND_ONLY' then raise; end if;
  end;
end;
$$;

select pg_temp.seed_library_candidate(
  'c2000000-0000-4000-8000-000000000011','c2000000-0000-4000-8000-000000000012','missing-review',
  'c2000000-0000-4000-8000-000000000013','c2000000-0000-4000-8000-000000000014',
  'c2000000-0000-4000-8000-000000000015','c2000000-0000-4000-8000-000000000016',
  'c2000000-0000-4000-8000-000000000017','c2000000-0000-4000-8000-000000000018',true
) as missing_review_decision_id \gset

do $$
declare decision_uuid uuid;
begin
  select id into decision_uuid from public.real_editorial_terminal_decisions
   where pilot_id='c2000000-0000-4000-8000-000000000011';
  begin
    perform public.move_approved_result_to_library(
      repeat('a',64),'c2000000-0000-4000-8000-000000000011',
      'c2000000-0000-4000-8000-000000000012','c2000000-0000-4000-8000-000000000013',repeat('4',64),
      'c2000000-0000-4000-8000-000000000014',repeat('1',64),
      'c2000000-0000-4000-8000-000000000015',repeat('2',64),
      'c2000000-0000-4000-8000-000000000099',repeat('3',64),
      decision_uuid,'6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
    );
    raise exception 'LIBRARY_MISSING_REVIEW_ACCEPTED';
  exception when others then
    if sqlerrm <> 'LIBRARY_TRANSFER_ARTIFACT_CHANGED' then raise; end if;
  end;
end;
$$;

select pg_temp.seed_library_candidate(
  'c2000000-0000-4000-8000-000000000021','c2000000-0000-4000-8000-000000000022','not-approved',
  'c2000000-0000-4000-8000-000000000023','c2000000-0000-4000-8000-000000000024',
  'c2000000-0000-4000-8000-000000000025','c2000000-0000-4000-8000-000000000026',
  'c2000000-0000-4000-8000-000000000027','c2000000-0000-4000-8000-000000000028',false
);
do $$
begin
  begin
    perform public.move_approved_result_to_library(
      repeat('b',64),'c2000000-0000-4000-8000-000000000021',
      'c2000000-0000-4000-8000-000000000022','c2000000-0000-4000-8000-000000000023',repeat('4',64),
      'c2000000-0000-4000-8000-000000000024',repeat('1',64),
      'c2000000-0000-4000-8000-000000000025',repeat('2',64),
      'c2000000-0000-4000-8000-000000000026',repeat('3',64),
      'c2000000-0000-4000-8000-000000000029','6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
    );
    raise exception 'LIBRARY_NON_APPROVED_ACCEPTED';
  exception when others then
    if sqlerrm <> 'LIBRARY_TRANSFER_STATE_INVALID' then raise; end if;
  end;
end;
$$;

do $$
begin
  if exists (select 1 from public.real_editorial_library_entries where publication_state <> 'unpublished')
     or exists (select 1 from public.real_editorial_library_transfers
       where provider_calls_performed <> 0 or reservations_created <> 0 or ledger_cost <> 0
          or publication_count <> 0 or trawel_connected or automatic_enabled) then
    raise exception 'LIBRARY_EXTERNAL_BOUNDARIES_BROKEN';
  end if;
  if (select snapshot from real_morella_library_before) is distinct from (
    select jsonb_build_object(
      'pilot',(select to_jsonb(p) from public.real_editorial_pilots p
        where p.id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'run',(select to_jsonb(r) from public.real_editorial_runs r
        where r.id='467dc951-26f5-45f6-895c-d2f06c496d6e'),
      'budget',(select to_jsonb(b) from public.real_editorial_pilot_budgets b
        where b.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'artifacts',(select jsonb_agg(to_jsonb(a) order by a.id)
        from public.real_editorial_artifacts a
        where a.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'providerCalls',(select count(*) from public.real_editorial_provider_calls c
        where c.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'reservations',(select count(*) from public.real_editorial_call_reservations c
        where c.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03'),
      'events',(select count(*) from public.real_editorial_events e
        where e.pilot_id='480d9c05-3ef7-4c44-a6f1-7762b7179a03')
    )
  ) then raise exception 'REAL_MORELLA_WAS_MODIFIED'; end if;
end;
$$;

rollback;
`
    execFileSync(dockerExecutable, [
      'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X',
    ], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  }, 120_000)
})
