import { execFileSync } from 'node:child_process'
import { describe, it } from 'vitest'

const integrationTest = process.env.RUN_REAL_EDITORIAL_INTEGRATION === '1' ? it : it.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'

describe('segunda destinación editorial real en Supabase local', () => {
  integrationTest('aísla Albarracín, valida policy y revierte toda la prueba', () => {
    const sql = String.raw`
\set ON_ERROR_STOP on
begin;

create temporary table morella_before as
select jsonb_build_object(
  'pilots',(select jsonb_agg(to_jsonb(p) order by p.id) from public.real_editorial_pilots p
    where p.policy_id='morella-real-editorial-pilot-v1'),
  'runs',(select jsonb_agg(to_jsonb(r) order by r.id) from public.real_editorial_runs r
    join public.real_editorial_pilots p on p.id=r.pilot_id
    where p.policy_id='morella-real-editorial-pilot-v1'),
  'budgets',(select jsonb_agg(to_jsonb(b) order by b.pilot_id) from public.real_editorial_pilot_budgets b
    join public.real_editorial_pilots p on p.id=b.pilot_id
    where p.policy_id='morella-real-editorial-pilot-v1'),
  'artifacts',(select count(*) from public.real_editorial_artifacts a
    join public.real_editorial_pilots p on p.id=a.pilot_id
    where p.policy_id='morella-real-editorial-pilot-v1'),
  'calls',(select count(*) from public.real_editorial_provider_calls c
    join public.real_editorial_pilots p on p.id=c.pilot_id
    where p.policy_id='morella-real-editorial-pilot-v1'),
  'reservations',(select count(*) from public.real_editorial_call_reservations c
    join public.real_editorial_pilots p on p.id=c.pilot_id
    where p.policy_id='morella-real-editorial-pilot-v1'),
  'events',(select count(*) from public.real_editorial_events e
    join public.real_editorial_pilots p on p.id=e.pilot_id
    where p.policy_id='morella-real-editorial-pilot-v1')
) snapshot;

select id as albarracin_id from public.geographic_entities
 where normalized_name='albarracin' and country_code='ES'
   and entity_type='locality' and status='active' \gset

select public.prepare_real_editorial_pilot(
  'e2040000-0000-4000-8000-000000000001',
  'e2040000-0000-4000-8000-000000000002',
  'albarracin-real-editorial-e2e04-v1',
  'synthetic-e2e04-albarracin-prepare',
  repeat('a',64),
  'synthetic-e2e04-albarracin',
  :'albarracin_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000,"depth":"standard"},{"profile":"student","enabled":true,"targetWords":1800,"depth":"deep"}]'::jsonb
) as first_id;

select public.prepare_real_editorial_pilot(
  'e2040000-0000-4000-8000-000000000099',
  'e2040000-0000-4000-8000-000000000098',
  'albarracin-real-editorial-e2e04-v1',
  'synthetic-e2e04-albarracin-prepare',
  repeat('a',64),
  'synthetic-e2e04-albarracin',
  :'albarracin_id'::uuid,
  '[{"profile":"adventure","enabled":true,"targetWords":1000,"depth":"standard"},{"profile":"student","enabled":true,"targetWords":1800,"depth":"deep"}]'::jsonb
) as repeated_id;

do $$
begin
  if (select count(*) from public.real_editorial_pilots
       where preparation_key='synthetic-e2e04-albarracin-prepare') <> 1
     or not exists (select 1 from public.real_editorial_pilots
       where id='e2040000-0000-4000-8000-000000000001') then
    raise exception 'E2E04_PREPARATION_NOT_IDEMPOTENT';
  end if;
  begin
    perform public.prepare_real_editorial_pilot(
      'e2040000-0000-4000-8000-000000000003',
      'e2040000-0000-4000-8000-000000000004',
      'albarracin-real-editorial-e2e04-v1',
      'synthetic-e2e04-crossed-destination',
      repeat('b',64),
      'synthetic-e2e04-crossed-destination',
      (select id from public.geographic_entities
        where normalized_name='morella' and country_code='ES' and entity_type='locality'),
      '[]'::jsonb
    );
    raise exception 'E2E04_CROSSED_DESTINATION_ACCEPTED';
  exception when others then
    if sqlerrm <> 'REAL_EDITORIAL_DESTINATION_MISMATCH' then raise; end if;
  end;
end;
$$;

select public.confirm_real_editorial_budget(
  'e2040000-0000-4000-8000-000000000001','2099-08-08'
);

do $$
begin
  if not exists (
    select 1 from public.real_editorial_pilots p
    join public.real_editorial_runs r on r.id=p.current_run_id
    join public.real_editorial_pilot_budgets b on b.pilot_id=p.id
    where p.id='e2040000-0000-4000-8000-000000000001'
      and p.policy_id='albarracin-real-editorial-e2e04-v1'
      and p.destination_name='Albarracín'
      and p.normalized_destination='albarracin'
      and p.country_code='ES' and p.destination_type='locality'
      and p.state='preflight' and p.budget_confirmed
      and p.publication_count=0 and not p.trawel_connected and not p.automatic_enabled
      and r.prompt_version='albarracin-real-editorial-v1'
      and b.task_limit_cost=0.2 and b.batch_limit_cost=0.2 and b.daily_limit_cost=0.2
  ) then raise exception 'E2E04_DURABLE_IDENTITY_INVALID'; end if;
  if exists (select 1 from public.real_editorial_provider_calls
      where pilot_id='e2040000-0000-4000-8000-000000000001')
     or exists (select 1 from public.real_editorial_call_reservations
      where pilot_id='e2040000-0000-4000-8000-000000000001') then
    raise exception 'E2E04_PREPARATION_CALLED_PROVIDER';
  end if;
  if (select snapshot from morella_before) is distinct from (
    select jsonb_build_object(
      'pilots',(select jsonb_agg(to_jsonb(p) order by p.id) from public.real_editorial_pilots p
        where p.policy_id='morella-real-editorial-pilot-v1'),
      'runs',(select jsonb_agg(to_jsonb(r) order by r.id) from public.real_editorial_runs r
        join public.real_editorial_pilots p on p.id=r.pilot_id
        where p.policy_id='morella-real-editorial-pilot-v1'),
      'budgets',(select jsonb_agg(to_jsonb(b) order by b.pilot_id) from public.real_editorial_pilot_budgets b
        join public.real_editorial_pilots p on p.id=b.pilot_id
        where p.policy_id='morella-real-editorial-pilot-v1'),
      'artifacts',(select count(*) from public.real_editorial_artifacts a
        join public.real_editorial_pilots p on p.id=a.pilot_id
        where p.policy_id='morella-real-editorial-pilot-v1'),
      'calls',(select count(*) from public.real_editorial_provider_calls c
        join public.real_editorial_pilots p on p.id=c.pilot_id
        where p.policy_id='morella-real-editorial-pilot-v1'),
      'reservations',(select count(*) from public.real_editorial_call_reservations c
        join public.real_editorial_pilots p on p.id=c.pilot_id
        where p.policy_id='morella-real-editorial-pilot-v1'),
      'events',(select count(*) from public.real_editorial_events e
        join public.real_editorial_pilots p on p.id=e.pilot_id
        where p.policy_id='morella-real-editorial-pilot-v1')
    )
  ) then raise exception 'E2E04_CHANGED_MORELLA'; end if;
end;
$$;

rollback;
`
    execFileSync(dockerExecutable, [
      'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X',
    ], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  }, 120_000)
})
