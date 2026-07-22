alter table public.editorial_research_runs
  add column failure_classification text
  check (failure_classification in ('data_quality','provider','persistence','checkpoint','budget','cancellation','pipeline'));

update public.editorial_research_runs
set failure_classification = case
  when error_code = 'NO_ACCEPTED_SOURCES' then 'data_quality'
  when error_code in ('PERMANENT','PROVIDER_UNAVAILABLE','TIMEOUT','CIRCUIT_OPEN') then 'provider'
  when error_code like '%DATABASE%' or error_code like '%PERSISTENCE%' or error_code like 'SUPABASE_%' then 'persistence'
  when error_code like '%CHECKPOINT%' then 'checkpoint'
  when error_code like '%BUDGET%' or error_code like '%ATTEMPTS%' then 'budget'
  when error_code = 'CANCELLED' then 'cancellation'
  else 'pipeline'
end
where state = 'failed';

alter table public.editorial_research_runs
  add constraint editorial_research_runs_failed_classification_check
  check (state <> 'failed' or failure_classification is not null);
