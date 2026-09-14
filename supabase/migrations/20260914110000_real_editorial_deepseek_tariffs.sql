-- El ledger editorial sólo admite EUR; la policy vigente aplica FX 1:1 para
-- estas tarifas USD. Se conservan ids y bandas del catálogo versionado.
insert into public.real_editorial_tariffs (
  id,provider_id,model,operation,currency,unit_scale,input_unit_cost,
  cached_input_unit_cost,output_unit_cost,credit_unit_cost,effective_from,
  source_reference,fx_policy_version
) values
  (
    'deepseek-deepseek-flash-off-peak-2026-08-16',
    'deepseek','deepseek-flash','responses','EUR',1000000,
    0.220000000,0.007000000,0.660000000,0,
    '2026-08-16T16:00:00.000Z',
    'https://api-docs.deepseek.com/quick_start/pricing/',
    'real-editorial-fx-2026-07-25.1'
  ),
  (
    'deepseek-deepseek-flash-peak-2026-08-16',
    'deepseek','deepseek-flash','responses','EUR',1000000,
    0.440000000,0.014000000,1.320000000,0,
    '2026-08-16T16:00:01.000Z',
    'https://api-docs.deepseek.com/quick_start/pricing/',
    'real-editorial-fx-2026-07-25.1'
  )
on conflict (id) do nothing;
