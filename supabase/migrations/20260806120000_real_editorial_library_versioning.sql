-- BIB-V01: esquema append-only para versiones editoriales internas de Biblioteca.
-- v1 permanece exclusivamente en real_editorial_library_entries; esta migracion
-- no crea datos, no publica y no introduce funciones transaccionales de dominio.

create table public.real_editorial_library_versions (
  id uuid primary key,
  library_entry_id uuid not null
    references public.real_editorial_library_entries(id) on delete restrict,
  version_number integer not null check (version_number >= 2),
  parent_version_id uuid null,
  parent_origin_version_hash text not null
    check (parent_origin_version_hash ~ '^[a-f0-9]{64}$'),
  parent_hash text not null check (parent_hash ~ '^[a-f0-9]{64}$'),
  version_hash text not null unique check (version_hash ~ '^[a-f0-9]{64}$'),
  canonicalization_contract text not null
    check (canonicalization_contract = 'investighost-library-c14n-v1'),
  creation_reason text not null
    check (length(btrim(creation_reason)) between 1 and 2000),
  created_by_actor_id uuid not null,
  created_at timestamptz not null default now(),
  operation_key text not null unique check (operation_key ~ '^[a-f0-9]{64}$'),
  publication_state text not null default 'unpublished'
    check (publication_state = 'unpublished'),
  unique (library_entry_id,version_number),
  unique (library_entry_id,parent_hash),
  unique (library_entry_id,id),
  foreign key (library_entry_id,parent_version_id)
    references public.real_editorial_library_versions(library_entry_id,id)
    on delete restrict,
  check (
    (version_number = 2 and parent_version_id is null
      and parent_hash = parent_origin_version_hash)
    or (version_number > 2 and parent_version_id is not null)
  )
);

comment on table public.real_editorial_library_versions is
  'Identidad y linaje inmutable de versiones derivadas v2+; una sola version abierta exige lock transaccional en BIB-V02.';
comment on column public.real_editorial_library_versions.parent_origin_version_hash is
  'Hash estable de la entrada v1; nunca implica copiar ni modificar la fila de origen.';
comment on column public.real_editorial_library_versions.parent_hash is
  'Hash del padre inmediato; la unicidad por entrada impide bifurcaciones.';
comment on column public.real_editorial_library_versions.publication_state is
  'Frontera negativa BIB-V01: toda version permanece sin publicar.';

create index real_editorial_library_versions_entry_number_idx
  on public.real_editorial_library_versions (library_entry_id,version_number desc);
create unique index real_editorial_library_versions_parent_idx
  on public.real_editorial_library_versions (library_entry_id,parent_version_id)
  where parent_version_id is not null;

create table public.real_editorial_library_version_revisions (
  id uuid primary key,
  version_id uuid not null
    references public.real_editorial_library_versions(id) on delete restrict,
  revision_number integer not null check (revision_number >= 1),
  previous_revision_id uuid null,
  expected_previous_revision_hash text null
    check (
      expected_previous_revision_hash is null
      or expected_previous_revision_hash ~ '^[a-f0-9]{64}$'
    ),
  title text not null check (
    length(title) between 1 and 500
    and title = btrim(title)
    and position(chr(10) in title) = 0
    and left(title,1) <> chr(65279)
  ),
  content text not null check (
    length(content) between 1 and 100000
    and length(btrim(content,chr(9) || chr(10) || ' ')) > 0
    and right(content,1) = chr(10)
    and right(content,2) <> chr(10) || chr(10)
    and content !~ ('[[:blank:]]+' || chr(10))
    and left(content,1) <> chr(65279)
  ),
  content_schema_contract text not null
    check (content_schema_contract = 'investighost-library-content-v1'),
  canonicalization_contract text not null
    check (canonicalization_contract = 'investighost-library-c14n-v1'),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  revision_hash text not null unique check (revision_hash ~ '^[a-f0-9]{64}$'),
  change_summary text not null
    check (length(btrim(change_summary)) between 1 and 2000),
  created_by_actor_id uuid not null,
  created_at timestamptz not null default now(),
  operation_key text not null unique check (operation_key ~ '^[a-f0-9]{64}$'),
  unique (version_id,revision_number),
  unique (version_id,id),
  foreign key (version_id,previous_revision_id)
    references public.real_editorial_library_version_revisions(version_id,id)
    on delete restrict,
  check (
    (revision_number = 1 and previous_revision_id is null
      and expected_previous_revision_hash is null)
    or (revision_number > 1 and previous_revision_id is not null
      and expected_previous_revision_hash is not null)
  ),
  check (position(chr(13) in title) = 0 and position(chr(13) in content) = 0)
);

comment on table public.real_editorial_library_version_revisions is
  'Snapshots completos e inmutables de cada guardado de una version derivada.';
comment on column public.real_editorial_library_version_revisions.expected_previous_revision_hash is
  'Token CAS; su coincidencia con la revision previa se comprobara transaccionalmente en BIB-V02.';

create unique index real_editorial_library_version_revisions_previous_idx
  on public.real_editorial_library_version_revisions (previous_revision_id)
  where previous_revision_id is not null;
create index real_editorial_library_version_revisions_version_number_idx
  on public.real_editorial_library_version_revisions (version_id,revision_number desc);

create table public.real_editorial_library_version_findings (
  id uuid primary key,
  version_id uuid not null
    references public.real_editorial_library_versions(id) on delete restrict,
  revision_id uuid not null,
  finding_key text not null check (length(btrim(finding_key)) between 1 and 500),
  sequence integer not null check (sequence >= 1),
  supersedes_finding_id uuid null,
  source_finding_type text not null
    check (source_finding_type in ('warning','gap','contradiction','claim')),
  source_finding_id text not null
    check (length(btrim(source_finding_id)) between 1 and 500),
  origin text not null check (origin in ('inherited','new')),
  disposition text not null check (disposition in (
    'pending','resolved_editorially','accepted_risk','not_applicable'
  )),
  claim_relation text not null check (claim_relation in (
    'preserved','removed','modified','new','not_applicable'
  )),
  support_status text not null check (support_status in (
    'supported','unsupported','not_applicable'
  )),
  subject_text text not null check (length(btrim(subject_text)) between 1 and 4000),
  diff_anchor jsonb not null default '{}'::jsonb
    check (jsonb_typeof(diff_anchor) = 'object'),
  claim_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(claim_ids) = 'array'),
  evidence_references jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_references) = 'array'),
  source_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_ids) = 'array'),
  editor_declaration text not null
    check (length(btrim(editor_declaration)) between 1 and 2000),
  justification text not null default '' check (length(justification) <= 2000),
  finding_hash text not null unique check (finding_hash ~ '^[a-f0-9]{64}$'),
  created_by_actor_id uuid not null,
  created_at timestamptz not null default now(),
  operation_key text not null unique check (operation_key ~ '^[a-f0-9]{64}$'),
  unique (revision_id,finding_key,sequence),
  unique (version_id,id),
  foreign key (version_id,revision_id)
    references public.real_editorial_library_version_revisions(version_id,id)
    on delete restrict,
  foreign key (version_id,supersedes_finding_id)
    references public.real_editorial_library_version_findings(version_id,id)
    on delete restrict,
  check (
    disposition = 'pending'
    or length(btrim(justification)) > 0
  ),
  check (
    (source_finding_type <> 'claim'
      and claim_relation = 'not_applicable'
      and support_status = 'not_applicable')
    or (source_finding_type = 'claim' and (
      (claim_relation = 'preserved' and origin = 'inherited'
        and support_status = 'supported')
      or (claim_relation = 'removed' and origin = 'inherited'
        and support_status = 'not_applicable' and disposition = 'not_applicable')
      or (claim_relation = 'modified' and origin = 'inherited'
        and support_status in ('supported','unsupported'))
      or (claim_relation = 'new' and origin = 'new'
        and support_status in ('supported','unsupported'))
    ))
  ),
  check (
    support_status <> 'unsupported' or disposition = 'pending'
  ),
  check (
    source_finding_type <> 'claim'
    or claim_relation not in ('new','modified')
    or support_status <> 'supported'
    or (
      jsonb_array_length(evidence_references) > 0
      and jsonb_array_length(source_ids) > 0
    )
  ),
  check (
    disposition not in ('resolved_editorially','not_applicable')
    or diff_anchor <> '{}'::jsonb
  )
);

comment on table public.real_editorial_library_version_findings is
  'Reconciliaciones append-only; la procedencia v1 referenciada permanece intacta.';
comment on column public.real_editorial_library_version_findings.evidence_references is
  'Solo referencias a evidencia ya capturada; la validacion de pertenencia queda para BIB-V02.';

create unique index real_editorial_library_version_findings_supersedes_idx
  on public.real_editorial_library_version_findings (supersedes_finding_id)
  where supersedes_finding_id is not null;
create index real_editorial_library_version_findings_revision_key_idx
  on public.real_editorial_library_version_findings (
    revision_id,finding_key,sequence desc
  );
create index real_editorial_library_version_findings_version_revision_idx
  on public.real_editorial_library_version_findings (version_id,revision_id);
create index real_editorial_library_version_findings_origin_idx
  on public.real_editorial_library_version_findings (
    source_finding_type,source_finding_id
  );

create table public.real_editorial_library_version_decisions (
  id uuid primary key,
  version_id uuid not null
    references public.real_editorial_library_versions(id) on delete restrict,
  revision_id uuid not null,
  sequence integer not null check (sequence >= 1),
  decision_type text not null check (decision_type in (
    'submit_for_review','approve','request_changes','reject','abandon'
  )),
  expected_previous_state text not null check (expected_previous_state in (
    'draft','ready_for_review','changes_requested','approved','rejected','abandoned'
  )),
  resulting_state text not null check (resulting_state in (
    'draft','ready_for_review','changes_requested','approved','rejected','abandoned'
  )),
  revision_hash text not null check (revision_hash ~ '^[a-f0-9]{64}$'),
  traceability_hash text not null check (traceability_hash ~ '^[a-f0-9]{64}$'),
  decision_target_hash text not null check (decision_target_hash ~ '^[a-f0-9]{64}$'),
  aggregate_hash text not null check (aggregate_hash ~ '^[a-f0-9]{64}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  actor_id uuid not null,
  actor_role_snapshot text not null
    check (length(btrim(actor_role_snapshot)) between 1 and 120),
  affected_finding_keys jsonb not null default '[]'::jsonb
    check (jsonb_typeof(affected_finding_keys) = 'array'),
  change_instructions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(change_instructions) = 'array'),
  accepted_risk_finding_keys jsonb not null default '[]'::jsonb
    check (jsonb_typeof(accepted_risk_finding_keys) = 'array'),
  separation_of_duties_exception boolean not null default false,
  separation_of_duties_reason text null
    check (
      separation_of_duties_reason is null
      or length(btrim(separation_of_duties_reason)) between 1 and 2000
    ),
  publication_count integer not null default 0 check (publication_count = 0),
  trawel_connected boolean not null default false check (not trawel_connected),
  automatic_enabled boolean not null default false check (not automatic_enabled),
  created_at timestamptz not null default now(),
  operation_key text not null unique check (operation_key ~ '^[a-f0-9]{64}$'),
  unique (version_id,sequence),
  foreign key (version_id,revision_id)
    references public.real_editorial_library_version_revisions(version_id,id)
    on delete restrict,
  check (decision_target_hash = aggregate_hash),
  check (
    (decision_type = 'submit_for_review'
      and expected_previous_state = 'draft' and resulting_state = 'ready_for_review')
    or (decision_type = 'approve'
      and expected_previous_state = 'ready_for_review' and resulting_state = 'approved')
    or (decision_type = 'request_changes'
      and expected_previous_state = 'ready_for_review'
      and resulting_state = 'changes_requested')
    or (decision_type = 'reject'
      and expected_previous_state = 'ready_for_review' and resulting_state = 'rejected')
    or (decision_type = 'abandon'
      and expected_previous_state = 'draft' and resulting_state = 'abandoned')
  ),
  check (
    (separation_of_duties_exception and separation_of_duties_reason is not null)
    or (not separation_of_duties_exception and separation_of_duties_reason is null)
  ),
  check (
    decision_type = 'approve' or not separation_of_duties_exception
  ),
  check (
    decision_type <> 'request_changes'
    or jsonb_array_length(affected_finding_keys) > 0
    or jsonb_array_length(change_instructions) > 0
  ),
  check (
    decision_type = 'request_changes'
    or jsonb_array_length(change_instructions) = 0
  )
);

comment on table public.real_editorial_library_version_decisions is
  'Eventos inmutables de estado y decision humana; aprobar no produce efectos externos.';
comment on column public.real_editorial_library_version_decisions.request_fingerprint is
  'Permite que BIB-V02 detecte una operation_key reutilizada con payload divergente.';

create unique index real_editorial_library_version_decisions_submit_idx
  on public.real_editorial_library_version_decisions (version_id)
  where decision_type = 'submit_for_review';
create unique index real_editorial_library_version_decisions_terminal_idx
  on public.real_editorial_library_version_decisions (version_id)
  where decision_type in ('approve','request_changes','reject','abandon');
create index real_editorial_library_version_decisions_version_sequence_idx
  on public.real_editorial_library_version_decisions (version_id,sequence desc);
create index real_editorial_library_version_decisions_revision_idx
  on public.real_editorial_library_version_decisions (revision_id);
create index real_editorial_library_version_decisions_state_idx
  on public.real_editorial_library_version_decisions (resulting_state,created_at desc);
create index real_editorial_library_version_decisions_target_idx
  on public.real_editorial_library_version_decisions (decision_target_hash);

alter table public.real_editorial_library_versions enable row level security;
alter table public.real_editorial_library_version_revisions enable row level security;
alter table public.real_editorial_library_version_findings enable row level security;
alter table public.real_editorial_library_version_decisions enable row level security;

revoke all on table public.real_editorial_library_versions
  from public,anon,authenticated;
revoke all on table public.real_editorial_library_version_revisions
  from public,anon,authenticated;
revoke all on table public.real_editorial_library_version_findings
  from public,anon,authenticated;
revoke all on table public.real_editorial_library_version_decisions
  from public,anon,authenticated;

grant select on table public.real_editorial_library_versions to service_role;
grant select on table public.real_editorial_library_version_revisions to service_role;
grant select on table public.real_editorial_library_version_findings to service_role;
grant select on table public.real_editorial_library_version_decisions to service_role;

create trigger real_editorial_library_versions_append_only
  before update or delete on public.real_editorial_library_versions
  for each row execute function public.prevent_real_editorial_append_mutation();
create trigger real_editorial_library_version_revisions_append_only
  before update or delete on public.real_editorial_library_version_revisions
  for each row execute function public.prevent_real_editorial_append_mutation();
create trigger real_editorial_library_version_findings_append_only
  before update or delete on public.real_editorial_library_version_findings
  for each row execute function public.prevent_real_editorial_append_mutation();
create trigger real_editorial_library_version_decisions_append_only
  before update or delete on public.real_editorial_library_version_decisions
  for each row execute function public.prevent_real_editorial_append_mutation();
