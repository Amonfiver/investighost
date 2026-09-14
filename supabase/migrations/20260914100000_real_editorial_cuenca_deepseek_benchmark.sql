-- Destino controlado Cuenca para el benchmark editorial Tavily -> DeepSeek.
-- No altera los pilotos Morella/Albarracín ni activa ninguna llamada externa.

insert into public.geographic_entities (
  id,parent_id,entity_type,name,normalized_name,country_code,region_code,slug,
  latitude,longitude,source_name,source_version,source_license,source_snapshot_id,
  source_checked_at,status,resolution_method,version
) values (
  '70000000-0000-4000-8000-000000000030',
  '70000000-0000-4000-8000-000000000001',
  'locality','Cuenca','cuenca','ES',null,'cuenca',null,null,
  'Investighost controlled benchmark configuration','cuenca-deepseek-2026-09-14',
  'Curated project metadata',null,'2026-09-14T00:00:00Z',
  'active','exact',1
)
on conflict (id) do nothing;

insert into public.geographic_aliases (
  id,entity_id,alias,normalized_alias,source_version
) values (
  '71000000-0000-4000-8000-000000000030',
  '70000000-0000-4000-8000-000000000030',
  'Cuenca, España','cuenca espana','cuenca-deepseek-2026-09-14'
)
on conflict (id) do nothing;

insert into public.real_editorial_pilot_policies (
  id,destination_name,normalized_destination,country_code,destination_type,
  pipeline_version,target_cost,warning_cost,automatic_stop_cost,
  manual_extension_cost,technical_limit_cost,daily_limit_cost,currency,
  fx_policy_version,usd_to_eur,max_rounds,max_initial_searches,
  max_focused_queries,max_accepted_sources,max_concurrency,max_regenerations
) values (
  'cuenca-real-editorial-deepseek-benchmark-v1','Cuenca','cuenca','ES','locality',
  'real-editorial-v1',0.125000000,0.160000000,0.200000000,
  0.250000000,0.500000000,0.200000000,'EUR',
  'real-editorial-fx-2026-07-25.1',1.000000000,2,4,3,8,1,0
)
on conflict (id) do nothing;
