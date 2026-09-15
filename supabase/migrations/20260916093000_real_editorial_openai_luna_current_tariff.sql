-- Snapshot append-only; las reservas y receipts históricos conservan su tarifa.
insert into public.real_editorial_tariffs (
  id,provider_id,model,operation,currency,unit_scale,input_unit_cost,
  cached_input_unit_cost,output_unit_cost,credit_unit_cost,effective_from,
  source_reference,fx_policy_version
) values (
  'openai-gpt-5.6-luna-2026-09-16',
  'openai','gpt-5.6-luna','responses','EUR',1000000,
  0.200000000,0.020000000,1.200000000,0,
  '2026-09-16T00:00:00.000Z',
  'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
  'real-editorial-fx-2026-07-25.1'
) on conflict (id) do nothing;
