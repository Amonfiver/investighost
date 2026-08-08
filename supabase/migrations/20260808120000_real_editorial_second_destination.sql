-- E2E-04: segundo destino real aislado, sin alterar el piloto Morella existente.

do $$
begin
  if exists (
    select 1 from public.real_editorial_pilot_policies
     where id <> 'morella-real-editorial-pilot-v1'
        or destination_name <> 'Morella'
        or country_code <> 'ES'
        or destination_type <> 'locality'
  ) then
    raise exception using errcode = 'P0001', message = 'REAL_EDITORIAL_PREVIOUS_POLICY_UNEXPECTED';
  end if;
end $$;

alter table public.real_editorial_pilot_policies
  add column if not exists normalized_destination text not null default 'morella';

alter table public.real_editorial_pilot_policies
  alter column normalized_destination drop default;

alter table public.real_editorial_pilot_policies
  add constraint real_editorial_policy_normalized_destination_format
  check (normalized_destination ~ '^[a-z0-9]+( [a-z0-9]+)*$');

insert into public.geographic_entities (
  id,parent_id,entity_type,name,normalized_name,country_code,region_code,slug,
  latitude,longitude,source_name,source_version,source_license,source_snapshot_id,
  source_checked_at,status,resolution_method,version
) values
  (
    '70000000-0000-4000-8000-000000000001',null,
    'country','España','espana','ES',null,'espana',40.000000,-4.000000,
    'GeoNames','geonames-2026-07-20','Creative Commons Attribution 4.0',
    '72000000-0000-4000-8000-000000000001','2026-07-21T00:37:57+02:00',
    'active','exact',1
  ),
  (
    '70000000-0000-4000-8000-000000000020',
    '70000000-0000-4000-8000-000000000001',
    'region','Aragón','aragon','ES','52','aragon',41.500000,-0.500000,
    'Investighost authorized geographic catalog','e2e04-2026-08-08',
    'Curated project metadata',null,'2026-08-08T00:00:00+02:00',
    'active','exact',1
  ),
  (
    '70000000-0000-4000-8000-000000000021',
    '70000000-0000-4000-8000-000000000020',
    'locality','Albarracín','albarracin','ES','52','albarracin',40.407000,-1.444000,
    'Investighost authorized geographic catalog','e2e04-2026-08-08',
    'Curated project metadata',null,'2026-08-08T00:00:00+02:00',
    'active','exact',1
  )
on conflict (id) do nothing;

insert into public.geographic_aliases (
  id,entity_id,alias,normalized_alias,source_version
) values
  (
    '71000000-0000-4000-8000-000000000020',
    '70000000-0000-4000-8000-000000000021',
    'Albarracín','albarracin','e2e04-2026-08-08'
  ),
  (
    '71000000-0000-4000-8000-000000000021',
    '70000000-0000-4000-8000-000000000021',
    'Albarracín, Teruel, España','albarracin teruel espana','e2e04-2026-08-08'
  )
on conflict (id) do nothing;

insert into public.real_editorial_pilot_policies (
  id,destination_name,normalized_destination,country_code,destination_type,
  pipeline_version,target_cost,warning_cost,automatic_stop_cost,
  manual_extension_cost,technical_limit_cost,daily_limit_cost,currency,
  fx_policy_version,usd_to_eur,max_rounds,max_initial_searches,
  max_focused_queries,max_accepted_sources,max_concurrency,max_regenerations
) values (
  'albarracin-real-editorial-e2e04-v1','Albarracín','albarracin','ES','locality',
  'real-editorial-v1',0.125000000,0.160000000,0.200000000,
  0.250000000,0.500000000,0.200000000,'EUR',
  'real-editorial-fx-2026-07-25.1',1.000000000,2,4,3,8,1,0
)
on conflict (id) do nothing;

create or replace function public.prepare_real_editorial_pilot(
  p_pilot_id uuid,
  p_run_id uuid,
  p_policy_id text,
  p_preparation_key text,
  p_identity_key text,
  p_variant_key text,
  p_destination_id uuid,
  p_profiles jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing public.real_editorial_pilots%rowtype;
  selected_policy public.real_editorial_pilot_policies%rowtype;
  selected_destination public.geographic_entities%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-preparation:' || p_preparation_key,0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-identity:' || p_identity_key,0)
  );

  select * into selected_policy
    from public.real_editorial_pilot_policies
   where id = p_policy_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'REAL_EDITORIAL_POLICY_NOT_FOUND';
  end if;

  select * into selected_destination
    from public.geographic_entities
   where id = p_destination_id
     and status = 'active';
  if not found
     or selected_destination.name <> selected_policy.destination_name
     or selected_destination.normalized_name <> selected_policy.normalized_destination
     or selected_destination.country_code <> selected_policy.country_code
     or selected_destination.entity_type <> selected_policy.destination_type then
    raise exception using errcode = 'P0001', message = 'REAL_EDITORIAL_DESTINATION_MISMATCH';
  end if;

  select * into existing from public.real_editorial_pilots
   where preparation_key = p_preparation_key;
  if found then
    if existing.policy_id = p_policy_id
       and existing.identity_key = p_identity_key
       and existing.variant_key = p_variant_key
       and existing.canonical_destination_id = p_destination_id
       and existing.profile_configuration = p_profiles then
      return existing.id;
    end if;
    raise exception using errcode = 'P0001', message = 'PREPARATION_IDEMPOTENCY_CONFLICT';
  end if;
  if exists (select 1 from public.real_editorial_pilots where identity_key = p_identity_key) then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_REAL_EDITORIAL_PILOT';
  end if;

  insert into public.real_editorial_pilots (
    id,policy_id,mode,task_origin,variant_key,preparation_key,identity_key,
    canonical_destination_id,destination_name,normalized_destination,country_code,
    destination_type,language,pipeline_version,profile_configuration,state
  ) values (
    p_pilot_id,p_policy_id,'real_editorial_pilot','human_authorized',p_variant_key,
    p_preparation_key,p_identity_key,p_destination_id,selected_policy.destination_name,
    selected_policy.normalized_destination,selected_policy.country_code,
    selected_policy.destination_type,'es',selected_policy.pipeline_version,p_profiles,'queued'
  );
  insert into public.real_editorial_runs (
    id,pilot_id,attempt,state,prompt_version,schema_version
  ) values (
    p_run_id,p_pilot_id,1,'queued',
    selected_policy.normalized_destination || '-real-editorial-v1',
    'real-editorial-snapshot-v1'
  );
  update public.real_editorial_pilots
     set current_run_id = p_run_id
   where id = p_pilot_id;
  insert into public.real_editorial_events (pilot_id,run_id,event_type,state,payload)
  values (
    p_pilot_id,p_run_id,'real.editorial.pilot.prepared','queued',
    jsonb_build_object(
      'policyId',p_policy_id,
      'variantKey',p_variant_key,
      'mode','real_editorial_pilot',
      'destination',selected_policy.normalized_destination
    )
  );
  return p_pilot_id;
end;
$$;

revoke all on function public.prepare_real_editorial_pilot(
  uuid,uuid,text,text,text,text,uuid,jsonb
) from public,anon,authenticated;
grant execute on function public.prepare_real_editorial_pilot(
  uuid,uuid,text,text,text,text,uuid,jsonb
) to service_role;
