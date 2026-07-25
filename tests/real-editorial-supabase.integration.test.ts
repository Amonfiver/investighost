import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip

describe('ruta editorial real en Supabase local', () => {
  integrationTest('persiste, discrimina, concilia y revierte sin tocar Manual ni 10D', () => {
    const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
    const sql = String.raw`
\set ON_ERROR_STOP on
begin;

create temp table baseline as
select
  (select count(*) from public.editorial_research_requests) as manual_requests,
  (select count(*) from public.editorial_research_runs) as manual_runs,
  (select count(*) from public.editorial_drafts) as manual_drafts,
  (select count(*) from public.provider_call_reservations) as connectivity_reservations,
  (select coalesce(sum(spent_cost),0) from public.real_task_budgets) as connectivity_spent,
  (select count(*) from public.real_editorial_pilots) as real_pilots,
  (select count(*) from public.editorial_work_items where mode = 'manual') as manual_work_items,
  (select count(*) from public.editorial_work_items where mode = 'real_editorial_pilot') as real_work_items;

select id as morella_id from public.geographic_entities
 where normalized_name = 'morella' and country_code = 'ES' and entity_type = 'locality'
 limit 1 \gset

select public.prepare_real_editorial_pilot(
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000002',
  'morella-real-editorial-pilot-v1',
  'integration-morella-initial',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'integration-initial',
  :'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000,"depth":"standard"},{"profile":"student","enabled":true,"targetWords":1800,"depth":"deep"}]'::jsonb
) as prepared_id \gset

select public.confirm_real_editorial_budget(
  '85000000-0000-4000-8000-000000000001',
  '2099-07-25'
);

do $$
declare same_id uuid;
begin
  select public.prepare_real_editorial_pilot(
    '85000000-0000-4000-8000-000000000099',
    '85000000-0000-4000-8000-000000000098',
    'morella-real-editorial-pilot-v1',
    'integration-morella-initial',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'integration-initial',
    (select id from public.geographic_entities
      where normalized_name = 'morella' and country_code = 'ES' and entity_type = 'locality'
      limit 1),
    '[{"profile":"adventure","enabled":true,"targetWords":1000,"depth":"standard"},{"profile":"student","enabled":true,"targetWords":1800,"depth":"deep"}]'::jsonb
  ) into same_id;
  if same_id <> '85000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'PREPARATION_IDEMPOTENCY_FAILED';
  end if;
  begin
    perform public.prepare_real_editorial_pilot(
      '85000000-0000-4000-8000-000000000003',
      '85000000-0000-4000-8000-000000000004',
      'morella-real-editorial-pilot-v1',
      'integration-morella-duplicate',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'integration-duplicate',
      (select id from public.geographic_entities
        where normalized_name = 'morella' and country_code = 'ES' and entity_type = 'locality'
        limit 1),
      '[]'::jsonb
    );
    raise exception 'DUPLICATE_WAS_NOT_BLOCKED';
  exception when others then
    if sqlerrm <> 'DUPLICATE_REAL_EDITORIAL_PILOT' then raise; end if;
  end;
end;
$$;

select public.prepare_real_editorial_pilot(
  '85000000-0000-4000-8000-000000000005',
  '85000000-0000-4000-8000-000000000006',
  'morella-real-editorial-pilot-v1',
  'integration-morella-variant',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'integration-variant',
  :'morella_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000,"depth":"standard"},{"profile":"student","enabled":true,"targetWords":1800,"depth":"deep"}]'::jsonb
);

insert into public.real_editorial_artifacts (
  pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
) values
  (
    '85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002',
    'mission','initial',1,'{"destination":"Morella","mode":"real_editorial_pilot"}',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
  ),
  (
    '85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002',
    'round','round-1',1,'{"round":1,"sources":1}',
    'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
  ),
  (
    '85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002',
    'master_knowledge','master',1,'{"revision":1,"claims":[]}',
    'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  ),
  (
    '85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002',
    'draft_adventure','adventure',1,'{"profile":"adventure","words":1000}',
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  ),
  (
    '85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002',
    'draft_student','student',1,'{"profile":"student","words":1800}',
    '1111111111111111111111111111111111111111111111111111111111111111'
  ),
  (
    '85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002',
    'final_review','final',1,'{"outcome":"passed"}',
    '2222222222222222222222222222222222222222222222222222222222222222'
  ),
  (
    '85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002',
    'checkpoint','workflow',1,'{"version":"real-workflow-v1","completedRound":1}',
    '3333333333333333333333333333333333333333333333333333333333333333'
  );

select public.acquire_real_editorial_guard(
  'real-editorial:85000000-0000-4000-8000-000000000002',
  '85000000-0000-4000-8000-000000000007',
  now() + interval '5 minutes'
) as guard_acquired \gset
\if :guard_acquired
\else
  \quit 51
\endif

select public.reserve_real_editorial_call(
  'integration-editorial-call',
  'real-editorial:85000000-0000-4000-8000-000000000002',
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000002',
  'real-editorial-task:85000000-0000-4000-8000-000000000001',
  'real-editorial-batch:85000000-0000-4000-8000-000000000001',
  'researching_round_1','research','tavily','search-and-extract',1,null::uuid,
  0.030000000,'EUR','morella-v1-tavily-search',
  'morella-real-editorial-v1','real-editorial-snapshot-v1',
  '4444444444444444444444444444444444444444444444444444444444444444'
) as reservation_id \gset

select public.start_real_editorial_call(:'reservation_id'::uuid);
select public.settle_real_editorial_call(
  :'reservation_id'::uuid,'succeeded',0.020000000,'fake-remote',0,0,1,
  '["search"]'::jsonb,0,null,
  '5555555555555555555555555555555555555555555555555555555555555555'
);

select public.reserve_real_editorial_call(
  'integration-editorial-sanitization',
  'real-editorial:85000000-0000-4000-8000-000000000002',
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000002',
  'real-editorial-task:85000000-0000-4000-8000-000000000001',
  'real-editorial-batch:85000000-0000-4000-8000-000000000001',
  'researching_round_1','research','tavily','search-and-extract',1,null::uuid,
  0.048000000,'EUR','morella-v1-tavily-search',
  'morella-real-editorial-v1','real-editorial-snapshot-v1',
  '6666666666666666666666666666666666666666666666666666666666666666'
) as sanitization_reservation_id \gset
select public.start_real_editorial_call(:'sanitization_reservation_id'::uuid);
do $$
begin
  begin
    perform public.settle_real_editorial_call(
      (select id from public.real_editorial_call_reservations
        where idempotency_key = 'integration-editorial-sanitization'),
      'failed',0.008000000,'sanitized-tavily-request',0,0,1,
      '["search"]'::jsonb,1,'Authorization: Bearer synthetic-secret',null
    );
    raise exception 'SECRET_SANITIZATION_DID_NOT_FIRE';
  exception when check_violation then
    null;
  end;
end;
$$;
select public.settle_real_editorial_call(
  :'sanitization_reservation_id'::uuid,'failed',0.008000000,'sanitized-tavily-request',0,0,1,
  '["search"]'::jsonb,1,'NO_VALID_HTTPS_SOURCES',null
);

update public.real_editorial_runs
 set state = 'pending_human_review',current_round = 2,accumulated_cost = 0.020000000,completed_at = now()
 where id = '85000000-0000-4000-8000-000000000002';
update public.real_editorial_pilots
 set state = 'pending_human_review'
 where id = '85000000-0000-4000-8000-000000000001';

do $$
declare
  base baseline%rowtype;
  editorial_count integer;
  manual_mode_count integer;
  real_mode_count integer;
  pending integer;
  spent numeric;
begin
  select * into base from baseline;
  if (select count(*) from public.editorial_research_requests) <> base.manual_requests
    or (select count(*) from public.editorial_research_runs) <> base.manual_runs
    or (select count(*) from public.editorial_drafts) <> base.manual_drafts then
    raise exception 'MANUAL_HISTORY_CHANGED';
  end if;
  if (select count(*) from public.provider_call_reservations) <> base.connectivity_reservations
    or (select coalesce(sum(spent_cost),0) from public.real_task_budgets) <> base.connectivity_spent then
    raise exception 'CONNECTIVITY_10D_CHANGED';
  end if;
  select count(*) into editorial_count from public.real_editorial_pilots;
  select count(*) into manual_mode_count from public.editorial_work_items where mode = 'manual';
  select count(*) into real_mode_count from public.editorial_work_items where mode = 'real_editorial_pilot';
  select count(*) into pending from public.real_editorial_call_reservations
   where state in ('reserved','started','unknown');
  select spent_cost into spent from public.real_editorial_pilot_budgets
   where pilot_id = '85000000-0000-4000-8000-000000000001';
  if editorial_count <> base.real_pilots + 2
    or manual_mode_count <> base.manual_work_items
    or real_mode_count <> base.real_work_items + 2 then
    raise exception 'MODE_DISCRIMINATOR_FAILED';
  end if;
  if pending <> 0 or spent <> 0.028 then raise exception 'EDITORIAL_LEDGER_NOT_RECONCILED'; end if;
  if (select state from public.real_editorial_pilots
      where id = '85000000-0000-4000-8000-000000000001') <> 'pending_human_review' then
    raise exception 'PENDING_HUMAN_REVIEW_MISSING';
  end if;
  if (select publication_count from public.real_editorial_pilots
      where id = '85000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'PUBLICATION_BOUNDARY_FAILED';
  end if;
end;
$$;

do $$
begin
  begin
    update public.real_editorial_artifacts set version = 2
     where pilot_id = '85000000-0000-4000-8000-000000000001';
    raise exception 'APPEND_ONLY_TRIGGER_DID_NOT_FIRE';
  exception when others then
    if sqlerrm <> 'REAL_EDITORIAL_APPEND_ONLY' then raise; end if;
  end;
end;
$$;

select public.release_real_editorial_guard('85000000-0000-4000-8000-000000000007');
rollback;
select 'real-editorial-integration-ok';
`
    const output = execFileSync(
      dockerExecutable,
      ['exec', '-i', 'supabase_db_investighost', 'psql', '-U', 'postgres', '-d', 'postgres'],
      { input: sql, encoding: 'utf8' },
    )

    expect(output).toContain('real-editorial-integration-ok')
  })
})
