-- Snapshot nuevo y append-only: los receipts/reservas históricos conservan
-- sus tariff_id y sus importes ya conciliados.
insert into public.real_editorial_tariffs (
  id,provider_id,model,operation,currency,unit_scale,input_unit_cost,
  cached_input_unit_cost,output_unit_cost,credit_unit_cost,effective_from,
  source_reference,fx_policy_version
) values
  (
    'deepseek-deepseek-flash-off-peak-2026-09-16',
    'deepseek','deepseek-flash','responses','EUR',1000000,
    0.150000000,0.003000000,0.600000000,0,
    '2026-09-16T00:00:00.000Z',
    'https://api-docs.deepseek.com/quick_start/pricing/',
    'real-editorial-fx-2026-07-25.1'
  ),
  (
    'deepseek-deepseek-flash-peak-2026-09-16',
    'deepseek','deepseek-flash','responses','EUR',1000000,
    0.300000000,0.006000000,1.200000000,0,
    '2026-09-16T00:00:01.000Z',
    'https://api-docs.deepseek.com/quick_start/pricing/',
    'real-editorial-fx-2026-07-25.1'
  )
on conflict (id) do nothing;
