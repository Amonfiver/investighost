-- Revisión humana terminal del resultado editorial real.
-- No ejecuta proveedores, no modifica el ledger y no integra Biblioteca, Trawel o publicación.

alter table public.real_editorial_pilots
  drop constraint real_editorial_pilots_state_check,
  add constraint real_editorial_pilots_state_check check (state in (
    'queued','preflight','researching_round_1','evaluating_round_1',
    'researching_round_2','evaluating_round_2','generating_adventure',
    'generating_student','final_review','pending_human_review',
    'human_approved','changes_requested','human_rejected',
    'ready_for_human_review','review_required','failed','cancelled'
  ));

alter table public.real_editorial_runs
  drop constraint real_editorial_runs_state_check,
  add constraint real_editorial_runs_state_check check (state in (
    'queued','preflight','researching_round_1','evaluating_round_1',
    'researching_round_2','evaluating_round_2','generating_adventure',
    'generating_student','final_review','pending_human_review',
    'human_approved','changes_requested','human_rejected',
    'ready_for_human_review','review_required','failed','cancelled'
  ));

create table public.real_editorial_terminal_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_key text not null unique check (decision_key ~ '^[a-f0-9]{64}$'),
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null unique references public.real_editorial_runs(id) on delete restrict,
  snapshot_artifact_id uuid not null references public.real_editorial_artifacts(id) on delete restrict,
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  adventure_artifact_id uuid not null references public.real_editorial_artifacts(id) on delete restrict,
  adventure_hash text not null check (adventure_hash ~ '^[a-f0-9]{64}$'),
  student_artifact_id uuid not null references public.real_editorial_artifacts(id) on delete restrict,
  student_hash text not null check (student_hash ~ '^[a-f0-9]{64}$'),
  review_artifact_id uuid not null references public.real_editorial_artifacts(id) on delete restrict,
  review_hash text not null check (review_hash ~ '^[a-f0-9]{64}$'),
  actor_id uuid not null,
  decision text not null check (decision in (
    'approve_editorial_result','request_changes','reject_editorial_result'
  )),
  reason text not null check (
    length(btrim(reason)) between 1 and 500
    and reason !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ),
  observations text not null check (
    length(btrim(observations)) between 1 and 2000
    and observations !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ),
  affected_profiles jsonb not null check (
    jsonb_typeof(affected_profiles) = 'array'
    and jsonb_array_length(affected_profiles) between 1 and 2
  ),
  profile_comments jsonb not null check (jsonb_typeof(profile_comments) = 'array'),
  warnings_accepted boolean not null,
  resulting_state text not null check (
    resulting_state in ('human_approved','changes_requested','human_rejected')
  ),
  spent_cost numeric(18,9) not null check (spent_cost >= 0),
  reserved_cost numeric(18,9) not null check (reserved_cost = 0),
  maximum_cost numeric(18,9) not null check (maximum_cost >= spent_cost),
  automated_work_remaining numeric(18,9) not null default 0
    check (automated_work_remaining = 0),
  projected_total_cost numeric(18,9) not null check (projected_total_cost = spent_cost),
  shortfall_cost numeric(18,9) not null check (shortfall_cost >= 0),
  provider_calls_performed integer not null default 0 check (provider_calls_performed = 0),
  reservations_created integer not null default 0 check (reservations_created = 0),
  publication_count integer not null default 0 check (publication_count = 0),
  trawel_connected boolean not null default false check (trawel_connected = false),
  automatic_enabled boolean not null default false check (automatic_enabled = false),
  decided_at timestamptz not null default now(),
  check (
    (decision = 'approve_editorial_result'
      and warnings_accepted and resulting_state = 'human_approved')
    or (decision = 'request_changes'
      and not warnings_accepted and resulting_state = 'changes_requested')
    or (decision = 'reject_editorial_result'
      and not warnings_accepted and resulting_state = 'human_rejected')
  )
);

alter table public.real_editorial_terminal_decisions enable row level security;
revoke all on table public.real_editorial_terminal_decisions from public,anon,authenticated;
grant select on table public.real_editorial_terminal_decisions to service_role;

create trigger real_editorial_terminal_decisions_append_only
  before update or delete on public.real_editorial_terminal_decisions
  for each row execute function public.prevent_real_editorial_append_mutation();

create or replace function public.resolve_real_editorial_terminal_review(
  p_decision_key text,
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
  p_actor_id uuid,
  p_decision text,
  p_reason text,
  p_observations text,
  p_affected_profiles jsonb,
  p_profile_comments jsonb,
  p_warnings_accepted boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing public.real_editorial_terminal_decisions%rowtype;
  snapshot public.real_editorial_artifacts%rowtype;
  adventure public.real_editorial_artifacts%rowtype;
  student public.real_editorial_artifacts%rowtype;
  review public.real_editorial_artifacts%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  decision_id uuid := gen_random_uuid();
  resulting_state text;
  snapshot_adventure jsonb;
  snapshot_student jsonb;
  projected_total numeric;
  shortfall numeric;
begin
  if p_decision_key !~ '^[a-f0-9]{64}$' then
    raise exception 'TERMINAL_DECISION_KEY_INVALID';
  end if;
  if p_decision not in (
    'approve_editorial_result','request_changes','reject_editorial_result'
  ) then raise exception 'TERMINAL_DECISION_INVALID'; end if;
  if p_reason is null
     or length(btrim(p_reason)) not between 1 and 500
     or p_reason ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])' then
    raise exception 'TERMINAL_DECISION_REASON_INVALID';
  end if;
  if p_observations is null
     or length(btrim(p_observations)) not between 1 and 2000
     or p_observations ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])' then
    raise exception 'TERMINAL_DECISION_OBSERVATIONS_INVALID';
  end if;
  if jsonb_typeof(p_affected_profiles) <> 'array'
     or jsonb_array_length(p_affected_profiles) not between 1 and 2
     or exists (
       select 1 from jsonb_array_elements_text(p_affected_profiles) profile
        where profile not in ('adventure','student')
     )
     or (select count(distinct profile)
           from jsonb_array_elements_text(p_affected_profiles) profile)
        <> jsonb_array_length(p_affected_profiles) then
    raise exception 'TERMINAL_DECISION_PROFILES_INVALID';
  end if;
  if jsonb_typeof(p_profile_comments) <> 'array' then
    raise exception 'TERMINAL_DECISION_COMMENTS_INVALID';
  end if;
  if p_decision = 'request_changes' then
    if jsonb_array_length(p_profile_comments) <> jsonb_array_length(p_affected_profiles)
       or exists (
         select 1 from jsonb_array_elements(p_profile_comments) item
          where jsonb_typeof(item) <> 'object'
             or item->>'profile' not in ('adventure','student')
             or not p_affected_profiles ? (item->>'profile')
             or item->>'comment' is null
             or length(btrim(item->>'comment')) not between 1 and 2000
             or item->>'comment' ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
       )
       or (select count(distinct item->>'profile')
             from jsonb_array_elements(p_profile_comments) item)
          <> jsonb_array_length(p_profile_comments) then
      raise exception 'TERMINAL_DECISION_COMMENTS_INVALID';
    end if;
  elsif jsonb_array_length(p_profile_comments) <> 0
        or p_affected_profiles <> '["adventure","student"]'::jsonb then
    raise exception 'TERMINAL_DECISION_PROFILES_INVALID';
  end if;
  if (p_decision = 'approve_editorial_result') is distinct from p_warnings_accepted then
    raise exception 'TERMINAL_DECISION_WARNINGS_INVALID';
  end if;

  resulting_state := case p_decision
    when 'approve_editorial_result' then 'human_approved'
    when 'request_changes' then 'changes_requested'
    else 'human_rejected'
  end;

  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-terminal-review:' || p_run_id::text,0)
  );

  select * into existing from public.real_editorial_terminal_decisions
   where decision_key = p_decision_key;
  if found then
    if existing.pilot_id = p_pilot_id
       and existing.run_id = p_run_id
       and existing.snapshot_artifact_id = p_snapshot_artifact_id
       and existing.snapshot_hash = p_snapshot_hash
       and existing.adventure_artifact_id = p_adventure_artifact_id
       and existing.adventure_hash = p_adventure_hash
       and existing.student_artifact_id = p_student_artifact_id
       and existing.student_hash = p_student_hash
       and existing.review_artifact_id = p_review_artifact_id
       and existing.review_hash = p_review_hash
       and existing.actor_id = p_actor_id
       and existing.decision = p_decision
       and existing.reason = p_reason
       and existing.observations = p_observations
       and existing.affected_profiles = p_affected_profiles
       and existing.profile_comments = p_profile_comments
       and existing.warnings_accepted = p_warnings_accepted then
      return existing.id;
    end if;
    raise exception 'TERMINAL_DECISION_IDEMPOTENCY_CONFLICT';
  end if;
  if exists (
    select 1 from public.real_editorial_terminal_decisions where run_id = p_run_id
  ) then raise exception 'TERMINAL_DECISION_ALREADY_RESOLVED'; end if;

  if not exists (
    select 1 from public.real_editorial_pilots
     where id = p_pilot_id and current_run_id = p_run_id
       and state = 'pending_human_review'
       and publication_count = 0 and not trawel_connected and not automatic_enabled
  ) or not exists (
    select 1 from public.real_editorial_runs
     where id = p_run_id and pilot_id = p_pilot_id
       and state = 'pending_human_review' and current_round = 2
  ) then raise exception 'TERMINAL_DECISION_STATE_CHANGED'; end if;
  if exists (
    select 1 from public.real_editorial_execution_guard
     where guard_name = 'morella-real-editorial'
       and owner_execution_id is not null and expires_at > now()
  ) or exists (
    select 1 from public.real_editorial_call_reservations
     where pilot_id = p_pilot_id and run_id = p_run_id
       and state in ('reserved','started','unknown')
  ) then raise exception 'TERMINAL_DECISION_PENDING_EFFECTS'; end if;

  select * into snapshot from public.real_editorial_artifacts
   where id = p_snapshot_artifact_id;
  select * into adventure from public.real_editorial_artifacts
   where id = p_adventure_artifact_id;
  select * into student from public.real_editorial_artifacts
   where id = p_student_artifact_id;
  select * into review from public.real_editorial_artifacts
   where id = p_review_artifact_id;
  if snapshot.id is null or adventure.id is null or student.id is null or review.id is null then
    raise exception 'TERMINAL_DECISION_RESULT_MISSING';
  end if;
  if snapshot.pilot_id <> p_pilot_id or snapshot.run_id <> p_run_id
     or snapshot.artifact_kind <> 'checkpoint' or snapshot.artifact_key <> 'pipeline'
     or snapshot.payload_hash <> p_snapshot_hash
     or exists (
       select 1 from public.real_editorial_artifacts later
        where later.run_id = p_run_id and later.artifact_kind = 'checkpoint'
          and later.artifact_key = 'pipeline' and later.version > snapshot.version
     )
     or adventure.pilot_id <> p_pilot_id or adventure.run_id <> p_run_id
     or adventure.artifact_kind <> 'draft_adventure' or adventure.artifact_key <> 'adventure'
     or adventure.version <> 1 or adventure.payload_hash <> p_adventure_hash
     or student.pilot_id <> p_pilot_id or student.run_id <> p_run_id
     or student.artifact_kind <> 'draft_student' or student.artifact_key <> 'student'
     or student.version <> 1 or student.payload_hash <> p_student_hash
     or review.pilot_id <> p_pilot_id or review.run_id <> p_run_id
     or review.artifact_kind <> 'final_review' or review.artifact_key <> 'final'
     or review.version <> 1 or review.payload_hash <> p_review_hash then
    raise exception 'TERMINAL_DECISION_ARTIFACT_CHANGED';
  end if;
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
     or snapshot_adventure is distinct from adventure.payload
     or snapshot_student is distinct from student.payload
     or snapshot.payload->'review' is distinct from review.payload then
    raise exception 'TERMINAL_DECISION_ARTIFACT_CHANGED';
  end if;

  select * into budget from public.real_editorial_pilot_budgets
   where pilot_id = p_pilot_id for update;
  if not found or budget.reserved_cost <> 0 then
    raise exception 'TERMINAL_DECISION_PENDING_EFFECTS';
  end if;
  projected_total := budget.spent_cost;
  shortfall := greatest(0,projected_total - budget.task_limit_cost);

  insert into public.real_editorial_terminal_decisions (
    id,decision_key,pilot_id,run_id,snapshot_artifact_id,snapshot_hash,
    adventure_artifact_id,adventure_hash,student_artifact_id,student_hash,
    review_artifact_id,review_hash,actor_id,decision,reason,observations,
    affected_profiles,profile_comments,warnings_accepted,resulting_state,
    spent_cost,reserved_cost,maximum_cost,automated_work_remaining,
    projected_total_cost,shortfall_cost
  ) values (
    decision_id,p_decision_key,p_pilot_id,p_run_id,p_snapshot_artifact_id,p_snapshot_hash,
    p_adventure_artifact_id,p_adventure_hash,p_student_artifact_id,p_student_hash,
    p_review_artifact_id,p_review_hash,p_actor_id,p_decision,p_reason,p_observations,
    p_affected_profiles,p_profile_comments,p_warnings_accepted,resulting_state,
    budget.spent_cost,budget.reserved_cost,budget.task_limit_cost,0,
    projected_total,shortfall
  );

  update public.real_editorial_runs
     set state = resulting_state,accumulated_cost = budget.spent_cost,
         completed_at = coalesce(completed_at,now()),updated_at = now()
   where id = p_run_id and pilot_id = p_pilot_id;
  update public.real_editorial_pilots
     set state = resulting_state,updated_at = now()
   where id = p_pilot_id and current_run_id = p_run_id;
  insert into public.real_editorial_events (
    pilot_id,run_id,event_type,state,payload
  ) values (
    p_pilot_id,p_run_id,'real.editorial.terminal.human_decided',resulting_state,
    jsonb_build_object(
      'decisionId',decision_id,'decisionKey',p_decision_key,'actorId',p_actor_id,
      'decision',p_decision,'resultingState',resulting_state,
      'snapshotArtifactId',p_snapshot_artifact_id,'snapshotHash',p_snapshot_hash,
      'adventureArtifactId',p_adventure_artifact_id,'adventureHash',p_adventure_hash,
      'studentArtifactId',p_student_artifact_id,'studentHash',p_student_hash,
      'reviewArtifactId',p_review_artifact_id,'reviewHash',p_review_hash,
      'affectedProfiles',p_affected_profiles,'profileComments',p_profile_comments,
      'warningsAccepted',p_warnings_accepted,'automatedWorkRemainingEur',0,
      'projectedTotalCostEur',projected_total,'shortfallCostEur',shortfall,
      'providerCallsPerformed',0,'reservationsCreated',0,'publicationCount',0,
      'trawelConnected',false,'automaticEnabled',false,
      'libraryIntegration','not_started'
    )
  );
  return decision_id;
end;
$$;

revoke all on function public.resolve_real_editorial_terminal_review(
  text,uuid,uuid,uuid,text,uuid,text,uuid,text,uuid,text,uuid,text,text,text,
  jsonb,jsonb,boolean
) from public,anon,authenticated;
grant execute on function public.resolve_real_editorial_terminal_review(
  text,uuid,uuid,uuid,text,uuid,text,uuid,text,uuid,text,uuid,text,text,text,
  jsonb,jsonb,boolean
) to service_role;
