-- Proyección durable del resultado real aprobado hacia Biblioteca interna.
-- La operación crea dos entradas inmutables, no publica y no toca proveedores ni ledger.

alter table public.real_editorial_pilots
  drop constraint real_editorial_pilots_state_check,
  add constraint real_editorial_pilots_state_check check (state in (
    'queued','preflight','researching_round_1','evaluating_round_1',
    'researching_round_2','evaluating_round_2','generating_adventure',
    'generating_student','final_review','pending_human_review',
    'human_approved','ready_for_library','changes_requested','human_rejected',
    'ready_for_human_review','review_required','failed','cancelled'
  ));

alter table public.real_editorial_runs
  drop constraint real_editorial_runs_state_check,
  add constraint real_editorial_runs_state_check check (state in (
    'queued','preflight','researching_round_1','evaluating_round_1',
    'researching_round_2','evaluating_round_2','generating_adventure',
    'generating_student','final_review','pending_human_review',
    'human_approved','ready_for_library','changes_requested','human_rejected',
    'ready_for_human_review','review_required','failed','cancelled'
  ));

create table public.real_editorial_library_transfers (
  id uuid primary key,
  transfer_key text not null unique check (transfer_key ~ '^[a-f0-9]{64}$'),
  pilot_id uuid not null unique references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null unique references public.real_editorial_runs(id) on delete restrict,
  snapshot_artifact_id uuid not null references public.real_editorial_artifacts(id) on delete restrict,
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  adventure_artifact_id uuid not null unique references public.real_editorial_artifacts(id) on delete restrict,
  adventure_hash text not null check (adventure_hash ~ '^[a-f0-9]{64}$'),
  student_artifact_id uuid not null unique references public.real_editorial_artifacts(id) on delete restrict,
  student_hash text not null check (student_hash ~ '^[a-f0-9]{64}$'),
  review_artifact_id uuid not null references public.real_editorial_artifacts(id) on delete restrict,
  review_hash text not null check (review_hash ~ '^[a-f0-9]{64}$'),
  terminal_decision_id uuid not null unique
    references public.real_editorial_terminal_decisions(id) on delete restrict,
  approval_actor_id uuid not null,
  transfer_actor_id uuid not null,
  resulting_state text not null check (resulting_state = 'ready_for_library'),
  final_run_cost numeric(18,9) not null check (final_run_cost >= 0),
  currency text not null check (currency = 'EUR'),
  provider_calls_performed integer not null default 0 check (provider_calls_performed = 0),
  reservations_created integer not null default 0 check (reservations_created = 0),
  ledger_cost numeric(18,9) not null default 0 check (ledger_cost = 0),
  publication_count integer not null default 0 check (publication_count = 0),
  trawel_connected boolean not null default false check (not trawel_connected),
  automatic_enabled boolean not null default false check (not automatic_enabled),
  audit_event_id uuid not null unique,
  transferred_at timestamptz not null default now()
);

create table public.real_editorial_library_entries (
  id uuid primary key,
  entry_key text not null unique check (entry_key ~ '^[a-f0-9]{64}$'),
  transfer_id uuid not null references public.real_editorial_library_transfers(id) on delete restrict,
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  canonical_destination_id uuid not null references public.geographic_entities(id) on delete restrict,
  destination_name text not null check (length(btrim(destination_name)) between 1 and 200),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  destination_type text not null check (destination_type in ('country','region','locality','zone')),
  profile text not null check (profile in ('adventure','student')),
  title text not null check (length(btrim(title)) between 1 and 500),
  content text not null check (length(content) > 0),
  editorial_version integer not null check (editorial_version > 0),
  language text not null check (language = 'es-ES'),
  status text not null check (status = 'approved_unpublished'),
  editorial_state text not null check (editorial_state = 'approved'),
  library_state text not null check (library_state = 'ready_for_library'),
  publication_state text not null check (publication_state = 'unpublished'),
  origin text not null check (origin = 'real_editorial_pilot'),
  source_artifact_id uuid not null unique references public.real_editorial_artifacts(id) on delete restrict,
  source_artifact_kind text not null check (source_artifact_kind in ('draft_adventure','draft_student')),
  source_artifact_key text not null check (source_artifact_key in ('adventure','student')),
  source_artifact_version integer not null check (source_artifact_version > 0),
  source_artifact_hash text not null check (source_artifact_hash ~ '^[a-f0-9]{64}$'),
  source_artifact_created_at timestamptz not null,
  final_review_artifact_id uuid not null references public.real_editorial_artifacts(id) on delete restrict,
  final_review_hash text not null check (final_review_hash ~ '^[a-f0-9]{64}$'),
  final_review_version integer not null check (final_review_version > 0),
  final_review_created_at timestamptz not null,
  terminal_decision_id uuid not null references public.real_editorial_terminal_decisions(id) on delete restrict,
  review_outcome text not null check (review_outcome = 'passed_with_warnings'),
  review_payload jsonb not null check (jsonb_typeof(review_payload) = 'object'),
  warnings jsonb not null check (jsonb_typeof(warnings) = 'array' and jsonb_array_length(warnings) > 0),
  gaps jsonb not null check (jsonb_typeof(gaps) = 'array' and jsonb_array_length(gaps) > 0),
  contradictions jsonb not null check (
    jsonb_typeof(contradictions) = 'array' and jsonb_array_length(contradictions) > 0
  ),
  claims jsonb not null check (jsonb_typeof(claims) = 'array' and jsonb_array_length(claims) > 0),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0),
  sources jsonb not null check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) > 0),
  approval_actor_id uuid not null,
  transfer_actor_id uuid not null,
  final_run_cost numeric(18,9) not null check (final_run_cost >= 0),
  currency text not null check (currency = 'EUR'),
  approved_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (pilot_id,run_id,profile),
  check (
    (profile = 'adventure' and source_artifact_kind = 'draft_adventure'
      and source_artifact_key = 'adventure')
    or (profile = 'student' and source_artifact_kind = 'draft_student'
      and source_artifact_key = 'student')
  )
);

create index real_editorial_library_entries_filter_idx
  on public.real_editorial_library_entries (
    destination_name,profile,status,origin,created_at desc
  );

alter table public.real_editorial_library_transfers enable row level security;
alter table public.real_editorial_library_entries enable row level security;
revoke all on table public.real_editorial_library_transfers from public,anon,authenticated;
revoke all on table public.real_editorial_library_entries from public,anon,authenticated;
grant select on table public.real_editorial_library_transfers to service_role;
grant select on table public.real_editorial_library_entries to service_role;

create trigger real_editorial_library_transfers_append_only
  before update or delete on public.real_editorial_library_transfers
  for each row execute function public.prevent_real_editorial_append_mutation();
create trigger real_editorial_library_entries_append_only
  before update or delete on public.real_editorial_library_entries
  for each row execute function public.prevent_real_editorial_append_mutation();

create function public.move_approved_result_to_library(
  p_transfer_key text,
  p_pilot_id uuid,
  p_run_id uuid,
  p_snapshot_artifact_id uuid,
  p_snapshot_hash text,
  p_adventure_artifact_id uuid,
  p_adventure_hash text,
  p_student_artifact_id uuid,
  p_student_hash text,
  p_review_artifact_id uuid,
  p_review_hash text,
  p_terminal_decision_id uuid,
  p_actor_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing public.real_editorial_library_transfers%rowtype;
  pilot public.real_editorial_pilots%rowtype;
  run public.real_editorial_runs%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  decision public.real_editorial_terminal_decisions%rowtype;
  snapshot public.real_editorial_artifacts%rowtype;
  adventure public.real_editorial_artifacts%rowtype;
  student public.real_editorial_artifacts%rowtype;
  review public.real_editorial_artifacts%rowtype;
  snapshot_adventure jsonb;
  snapshot_student jsonb;
  latest_round jsonb;
  gaps_payload jsonb;
  contradictions_payload jsonb;
  claims_payload jsonb;
  evidence_payload jsonb;
  sources_payload jsonb;
  transfer_id uuid := gen_random_uuid();
  adventure_entry_id uuid := gen_random_uuid();
  student_entry_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  transferred_at timestamptz := now();
begin
  if p_transfer_key !~ '^[a-f0-9]{64}$' then
    raise exception 'LIBRARY_TRANSFER_KEY_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-library:' || p_run_id::text,0)
  );

  select * into existing from public.real_editorial_library_transfers
   where transfer_key = p_transfer_key;
  if found then
    if existing.pilot_id = p_pilot_id and existing.run_id = p_run_id
       and existing.snapshot_artifact_id = p_snapshot_artifact_id
       and existing.snapshot_hash = p_snapshot_hash
       and existing.adventure_artifact_id = p_adventure_artifact_id
       and existing.adventure_hash = p_adventure_hash
       and existing.student_artifact_id = p_student_artifact_id
       and existing.student_hash = p_student_hash
       and existing.review_artifact_id = p_review_artifact_id
       and existing.review_hash = p_review_hash
       and existing.terminal_decision_id = p_terminal_decision_id
       and existing.transfer_actor_id = p_actor_id
       and (select count(*) from public.real_editorial_library_entries e
             where e.transfer_id = existing.id) = 2
       and exists (
         select 1 from public.real_editorial_library_entries e
          where e.transfer_id = existing.id and e.profile = 'adventure'
            and e.source_artifact_id = p_adventure_artifact_id
            and e.source_artifact_hash = p_adventure_hash
       )
       and exists (
         select 1 from public.real_editorial_library_entries e
          where e.transfer_id = existing.id and e.profile = 'student'
            and e.source_artifact_id = p_student_artifact_id
            and e.source_artifact_hash = p_student_hash
       ) then
      return existing.id;
    end if;
    raise exception 'LIBRARY_TRANSFER_IDEMPOTENCY_CONFLICT';
  end if;

  if exists (
    select 1 from public.real_editorial_library_transfers
     where pilot_id = p_pilot_id or run_id = p_run_id
  ) or exists (
    select 1 from public.real_editorial_library_entries
     where source_artifact_id in (p_adventure_artifact_id,p_student_artifact_id)
        or (pilot_id = p_pilot_id and run_id = p_run_id
            and profile in ('adventure','student'))
  ) then raise exception 'LIBRARY_ORIGIN_CONFLICT'; end if;

  select * into pilot from public.real_editorial_pilots
   where id = p_pilot_id and current_run_id = p_run_id for update;
  select * into run from public.real_editorial_runs
   where id = p_run_id and pilot_id = p_pilot_id for update;
  if pilot.id is null or run.id is null
     or pilot.state <> 'human_approved' or run.state <> 'human_approved'
     or pilot.publication_count <> 0 or pilot.trawel_connected or pilot.automatic_enabled
     or run.current_round <> 2 then
    raise exception 'LIBRARY_TRANSFER_STATE_INVALID';
  end if;
  if exists (
    select 1 from public.real_editorial_execution_guard
     where guard_name = 'morella-real-editorial'
       and owner_execution_id is not null and expires_at > now()
  ) or exists (
    select 1 from public.real_editorial_call_reservations
     where pilot_id = p_pilot_id and run_id = p_run_id
       and state in ('reserved','started','unknown')
  ) then raise exception 'LIBRARY_TRANSFER_PENDING_EFFECTS'; end if;

  select * into budget from public.real_editorial_pilot_budgets
   where pilot_id = p_pilot_id for update;
  if budget.pilot_id is null or budget.reserved_cost <> 0
     or budget.spent_cost > budget.task_limit_cost then
    raise exception 'LIBRARY_TRANSFER_BUDGET_INVALID';
  end if;

  select * into decision from public.real_editorial_terminal_decisions
   where id = p_terminal_decision_id and pilot_id = p_pilot_id and run_id = p_run_id;
  if decision.id is null or decision.decision <> 'approve_editorial_result'
     or decision.resulting_state <> 'human_approved' or not decision.warnings_accepted
     or decision.publication_count <> 0 or decision.trawel_connected
     or decision.automatic_enabled or decision.provider_calls_performed <> 0
     or decision.reservations_created <> 0
     or decision.spent_cost <> budget.spent_cost or decision.reserved_cost <> 0 then
    raise exception 'LIBRARY_TRANSFER_APPROVAL_INVALID';
  end if;

  select * into snapshot from public.real_editorial_artifacts where id = p_snapshot_artifact_id;
  select * into adventure from public.real_editorial_artifacts where id = p_adventure_artifact_id;
  select * into student from public.real_editorial_artifacts where id = p_student_artifact_id;
  select * into review from public.real_editorial_artifacts where id = p_review_artifact_id;
  if snapshot.id is null or adventure.id is null or student.id is null or review.id is null
     or snapshot.pilot_id <> p_pilot_id or snapshot.run_id <> p_run_id
     or snapshot.artifact_kind <> 'checkpoint' or snapshot.artifact_key <> 'pipeline'
     or snapshot.payload_hash <> p_snapshot_hash
     or adventure.pilot_id <> p_pilot_id or adventure.run_id <> p_run_id
     or adventure.artifact_kind <> 'draft_adventure' or adventure.artifact_key <> 'adventure'
     or adventure.payload_hash <> p_adventure_hash
     or student.pilot_id <> p_pilot_id or student.run_id <> p_run_id
     or student.artifact_kind <> 'draft_student' or student.artifact_key <> 'student'
     or student.payload_hash <> p_student_hash
     or review.pilot_id <> p_pilot_id or review.run_id <> p_run_id
     or review.artifact_kind <> 'final_review' or review.artifact_key <> 'final'
     or review.payload_hash <> p_review_hash
     or decision.snapshot_artifact_id <> p_snapshot_artifact_id
     or decision.snapshot_hash <> p_snapshot_hash
     or decision.adventure_artifact_id <> p_adventure_artifact_id
     or decision.adventure_hash <> p_adventure_hash
     or decision.student_artifact_id <> p_student_artifact_id
     or decision.student_hash <> p_student_hash
     or decision.review_artifact_id <> p_review_artifact_id
     or decision.review_hash <> p_review_hash
     or exists (
       select 1 from public.real_editorial_artifacts later
        where later.run_id = p_run_id and later.artifact_kind = snapshot.artifact_kind
          and later.artifact_key = snapshot.artifact_key and later.version > snapshot.version
     ) or exists (
       select 1 from public.real_editorial_artifacts later
        where later.run_id = p_run_id and later.artifact_kind = adventure.artifact_kind
          and later.artifact_key = adventure.artifact_key and later.version > adventure.version
     ) or exists (
       select 1 from public.real_editorial_artifacts later
        where later.run_id = p_run_id and later.artifact_kind = student.artifact_kind
          and later.artifact_key = student.artifact_key and later.version > student.version
     ) or exists (
       select 1 from public.real_editorial_artifacts later
        where later.run_id = p_run_id and later.artifact_kind = review.artifact_kind
          and later.artifact_key = review.artifact_key and later.version > review.version
     ) then raise exception 'LIBRARY_TRANSFER_ARTIFACT_CHANGED'; end if;

  select item into snapshot_adventure from jsonb_array_elements(snapshot.payload->'drafts') item
   where item->>'profile' = 'adventure' limit 1;
  select item into snapshot_student from jsonb_array_elements(snapshot.payload->'drafts') item
   where item->>'profile' = 'student' limit 1;
  if snapshot.payload->>'state' <> 'pending_human_review'
     or snapshot.payload->>'currentRound' <> '2'
     or snapshot.payload->>'publicationCount' <> '0'
     or snapshot.payload->>'trawelConnected' <> 'false'
     or snapshot.payload->>'automaticEnabled' <> 'false'
     or snapshot.payload#>>'{review,outcome}' <> 'passed_with_warnings'
     or review.payload->>'outcome' <> 'passed_with_warnings'
     or public.project_terminal_payload_for_snapshot_v1_compatibility(
       'draft_adventure',snapshot_adventure
     ) is distinct from public.project_terminal_payload_for_snapshot_v1_compatibility(
       'draft_adventure',adventure.payload
     )
     or public.project_terminal_payload_for_snapshot_v1_compatibility(
       'draft_student',snapshot_student
     ) is distinct from public.project_terminal_payload_for_snapshot_v1_compatibility(
       'draft_student',student.payload
     )
     or public.project_terminal_payload_for_snapshot_v1_compatibility(
       'final_review',snapshot.payload->'review'
     ) is distinct from public.project_terminal_payload_for_snapshot_v1_compatibility(
       'final_review',review.payload
     ) then raise exception 'LIBRARY_TRANSFER_ARTIFACT_CHANGED'; end if;

  latest_round := snapshot.payload->'roundResults'
    ->(jsonb_array_length(snapshot.payload->'roundResults') - 1);
  gaps_payload := latest_round->'gaps';
  contradictions_payload := snapshot.payload#>'{masterKnowledge,contradictions}';
  claims_payload := snapshot.payload#>'{masterKnowledge,claims}';
  sources_payload := snapshot.payload#>'{dossier,sources}';
  select coalesce(jsonb_agg(payload order by artifact_key),'[]'::jsonb)
    into evidence_payload
    from public.real_editorial_artifacts evidence
   where evidence.pilot_id = p_pilot_id and evidence.run_id = p_run_id
     and evidence.artifact_kind = 'evidence'
     and not exists (
       select 1 from public.real_editorial_artifacts later
        where later.run_id = evidence.run_id and later.artifact_kind = 'evidence'
          and later.artifact_key = evidence.artifact_key
          and later.version > evidence.version
     );
  if latest_round->>'round' <> '2'
     or jsonb_typeof(gaps_payload) <> 'array' or jsonb_array_length(gaps_payload) = 0
     or jsonb_typeof(contradictions_payload) <> 'array'
     or jsonb_array_length(contradictions_payload) = 0
     or jsonb_typeof(claims_payload) <> 'array' or jsonb_array_length(claims_payload) = 0
     or jsonb_typeof(evidence_payload) <> 'array' or jsonb_array_length(evidence_payload) = 0
     or jsonb_typeof(sources_payload) <> 'array' or jsonb_array_length(sources_payload) = 0
     or exists (
       select 1
         from jsonb_array_elements(claims_payload) claim,
              jsonb_array_elements_text(claim->'evidenceIds') evidence_id
        where not exists (
          select 1 from jsonb_array_elements(sources_payload) source_item
           where source_item->>'id' = evidence_id
        )
     ) or exists (
       select 1 from jsonb_array_elements(evidence_payload) evidence_item
        where not exists (
          select 1 from jsonb_array_elements(claims_payload) claim
           where claim->>'id' = evidence_item->>'claimId'
        )
     ) or exists (
       select 1 from jsonb_array_elements(claims_payload) claim
        where not exists (
          select 1 from jsonb_array_elements(evidence_payload) evidence_item
           where evidence_item->>'claimId' = claim->>'id'
        )
     ) then raise exception 'LIBRARY_TRANSFER_TRACEABILITY_INVALID'; end if;

  insert into public.real_editorial_library_transfers (
    id,transfer_key,pilot_id,run_id,snapshot_artifact_id,snapshot_hash,
    adventure_artifact_id,adventure_hash,student_artifact_id,student_hash,
    review_artifact_id,review_hash,terminal_decision_id,approval_actor_id,
    transfer_actor_id,resulting_state,final_run_cost,currency,audit_event_id,transferred_at
  ) values (
    transfer_id,p_transfer_key,p_pilot_id,p_run_id,p_snapshot_artifact_id,p_snapshot_hash,
    p_adventure_artifact_id,p_adventure_hash,p_student_artifact_id,p_student_hash,
    p_review_artifact_id,p_review_hash,p_terminal_decision_id,decision.actor_id,
    p_actor_id,'ready_for_library',budget.spent_cost,'EUR',event_id,transferred_at
  );

  insert into public.real_editorial_library_entries (
    id,entry_key,transfer_id,pilot_id,run_id,canonical_destination_id,
    destination_name,country_code,destination_type,profile,title,content,
    editorial_version,language,status,editorial_state,library_state,publication_state,origin,
    source_artifact_id,source_artifact_kind,source_artifact_key,
    source_artifact_version,source_artifact_hash,source_artifact_created_at,
    final_review_artifact_id,final_review_hash,final_review_version,
    final_review_created_at,terminal_decision_id,review_outcome,review_payload,
    warnings,gaps,contradictions,claims,evidence,sources,approval_actor_id,transfer_actor_id,
    final_run_cost,currency,approved_at,created_at
  ) values
  (
    adventure_entry_id,encode(extensions.digest(p_transfer_key || ':adventure','sha256'),'hex'),
    transfer_id,p_pilot_id,p_run_id,pilot.canonical_destination_id,pilot.destination_name,
    pilot.country_code,pilot.destination_type,'adventure',adventure.payload->>'title',
    adventure.payload->>'content',adventure.version,'es-ES','approved_unpublished','approved',
    'ready_for_library','unpublished','real_editorial_pilot',adventure.id,
    adventure.artifact_kind,adventure.artifact_key,adventure.version,adventure.payload_hash,
    adventure.created_at,review.id,review.payload_hash,review.version,review.created_at,
    decision.id,'passed_with_warnings',review.payload,review.payload->'issues',gaps_payload,
    contradictions_payload,claims_payload,evidence_payload,sources_payload,decision.actor_id,p_actor_id,
    budget.spent_cost,'EUR',decision.decided_at,transferred_at
  ),
  (
    student_entry_id,encode(extensions.digest(p_transfer_key || ':student','sha256'),'hex'),
    transfer_id,p_pilot_id,p_run_id,pilot.canonical_destination_id,pilot.destination_name,
    pilot.country_code,pilot.destination_type,'student',student.payload->>'title',
    student.payload->>'content',student.version,'es-ES','approved_unpublished','approved',
    'ready_for_library','unpublished','real_editorial_pilot',student.id,
    student.artifact_kind,student.artifact_key,student.version,student.payload_hash,
    student.created_at,review.id,review.payload_hash,review.version,review.created_at,
    decision.id,'passed_with_warnings',review.payload,review.payload->'issues',gaps_payload,
    contradictions_payload,claims_payload,evidence_payload,sources_payload,decision.actor_id,p_actor_id,
    budget.spent_cost,'EUR',decision.decided_at,transferred_at
  );

  update public.real_editorial_runs
     set state = 'ready_for_library',updated_at = transferred_at
   where id = p_run_id and pilot_id = p_pilot_id;
  update public.real_editorial_pilots
     set state = 'ready_for_library',updated_at = transferred_at
   where id = p_pilot_id and current_run_id = p_run_id;
  insert into public.real_editorial_events (
    id,pilot_id,run_id,event_type,state,payload,occurred_at
  ) values (
    event_id,p_pilot_id,p_run_id,'real.editorial.library.added','ready_for_library',
    jsonb_build_object(
      'transferId',transfer_id,'transferKey',p_transfer_key,
      'entryIds',jsonb_build_array(adventure_entry_id,student_entry_id),
      'profiles',jsonb_build_array('adventure','student'),
      'sourceArtifactIds',jsonb_build_array(adventure.id,student.id),
      'sourceArtifactHashes',jsonb_build_array(adventure.payload_hash,student.payload_hash),
      'reviewArtifactId',review.id,'reviewHash',review.payload_hash,
      'terminalDecisionId',decision.id,'actorId',p_actor_id,
      'finalRunCostEur',budget.spent_cost,'libraryCostEur',0,
      'providerCallsPerformed',0,'reservationsCreated',0,'publicationCount',0,
      'trawelConnected',false,'automaticEnabled',false
    ),transferred_at
  );
  return transfer_id;
end;
$$;

revoke all on function public.move_approved_result_to_library(
  text,uuid,uuid,uuid,text,uuid,text,uuid,text,uuid,text,uuid,uuid
) from public,anon,authenticated;
grant execute on function public.move_approved_result_to_library(
  text,uuid,uuid,uuid,text,uuid,text,uuid,text,uuid,text,uuid,uuid
) to service_role;
