-- Materializa la evidencia 10D como prerrequisito auditable sin reutilizar su ledger.

create table public.real_editorial_connectivity_evidence (
  pilot_policy_id text not null
    references public.real_editorial_pilot_policies(id) on delete restrict,
  provider_id text not null check (provider_id in ('tavily','openai')),
  connectivity_call_id uuid not null,
  source_kind text not null check (source_kind = 'connectivity_check'),
  outcome text not null check (outcome = 'succeeded'),
  validated_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (pilot_policy_id,provider_id),
  unique (connectivity_call_id)
);

insert into public.real_editorial_connectivity_evidence (
  pilot_policy_id,provider_id,connectivity_call_id,source_kind,outcome,validated_at
)
select distinct on (calls.provider_id)
  'morella-real-editorial-pilot-v1',
  calls.provider_id,
  calls.call_id,
  'connectivity_check',
  'succeeded',
  calls.created_at
from public.provider_calls calls
where calls.task_id = 'connectivity-check-10d-task'
  and calls.provider_id in ('tavily','openai')
  and calls.state = 'succeeded'
order by calls.provider_id,calls.created_at desc;

alter table public.real_editorial_connectivity_evidence enable row level security;
revoke all on table public.real_editorial_connectivity_evidence
  from public,anon,authenticated;
grant select on table public.real_editorial_connectivity_evidence to service_role;

create trigger real_editorial_connectivity_evidence_append_only
  before update or delete on public.real_editorial_connectivity_evidence
  for each row execute function public.prevent_real_editorial_append_mutation();
