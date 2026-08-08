-- Selección humana, append-only, del conjunto activo antes de Tavily ronda 2.
-- Las ocho fuentes y artefactos históricos de ronda 1 permanecen inmutables.

create table public.real_editorial_round_one_source_selections (
  id uuid primary key default gen_random_uuid(),
  selection_key text not null unique check (selection_key ~ '^[a-f0-9]{64}$'),
  proposal_hash text not null unique check (proposal_hash ~ '^[a-f0-9]{64}$'),
  pilot_id uuid not null references public.real_editorial_pilots(id) on delete restrict,
  run_id uuid not null references public.real_editorial_runs(id) on delete restrict,
  incident_id uuid not null unique references public.real_editorial_incidents(id) on delete restrict,
  actor_id uuid not null,
  reason text not null check (
    length(btrim(reason)) between 1 and 500
    and reason !~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])'
  ),
  strategy_version text not null check (
    strategy_version = 'round-one-active-source-selection-v1'
  ),
  previous_checkpoint_version integer not null check (previous_checkpoint_version > 0),
  previous_checkpoint_hash text not null check (previous_checkpoint_hash ~ '^[a-f0-9]{64}$'),
  selected_checkpoint_version integer not null check (selected_checkpoint_version > 0),
  selected_checkpoint_hash text not null check (selected_checkpoint_hash ~ '^[a-f0-9]{64}$'),
  maximum_sources integer not null check (maximum_sources = 8),
  round_two_query_count integer not null check (round_two_query_count = 3),
  required_round_two_slots integer not null check (required_round_two_slots = 3),
  original_active_count integer not null check (original_active_count = 8),
  retained_count integer not null check (retained_count = 5),
  deselected_count integer not null check (deselected_count = 3),
  active_count_after_selection integer not null check (active_count_after_selection = 5),
  available_slots_after_selection integer not null check (available_slots_after_selection = 3),
  provider_calls_performed integer not null default 0 check (provider_calls_performed = 0),
  budget_changed boolean not null default false check (not budget_changed),
  historical_sources_mutated boolean not null default false check (not historical_sources_mutated),
  spent_cost numeric(18,9) not null check (spent_cost >= 0),
  reserved_cost numeric(18,9) not null check (reserved_cost = 0),
  current_maximum_cost numeric(18,9) not null check (current_maximum_cost >= 0),
  selected_at timestamptz not null default now(),
  unique (pilot_id,run_id,incident_id),
  check (selected_checkpoint_version = previous_checkpoint_version + 1),
  check (retained_count + deselected_count = original_active_count),
  check (active_count_after_selection + available_slots_after_selection = maximum_sources),
  check (active_count_after_selection + required_round_two_slots <= maximum_sources),
  check (spent_cost + reserved_cost <= current_maximum_cost)
);

create table public.real_editorial_round_one_source_selection_items (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null
    references public.real_editorial_round_one_source_selections(id) on delete restrict,
  source_id text not null,
  title text not null check (length(btrim(title)) between 1 and 500),
  normalized_url text not null check (normalized_url ~ '^https://'),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  source_score numeric not null check (source_score between 0 and 1),
  original_ordinal integer not null check (original_ordinal between 1 and 8),
  selection_rank integer not null check (selection_rank between 1 and 8),
  decision text not null check (decision in ('keep_active','deselect_active')),
  covered_gap_ids jsonb not null check (jsonb_typeof(covered_gap_ids) = 'array'),
  coverage_topics jsonb not null check (jsonb_typeof(coverage_topics) = 'array'),
  undercovered_coverage_topics jsonb not null check (
    jsonb_typeof(undercovered_coverage_topics) = 'array'
  ),
  claim_ids jsonb not null check (jsonb_typeof(claim_ids) = 'array'),
  reason text not null check (
    reason in ('current_gap_evidence_priority','lower_incremental_gap_coverage')
  ),
  unique (selection_id,source_id),
  unique (selection_id,original_ordinal),
  unique (selection_id,selection_rank),
  check (
    (decision = 'keep_active' and selection_rank <= 5
      and reason = 'current_gap_evidence_priority')
    or (decision = 'deselect_active' and selection_rank > 5
      and reason = 'lower_incremental_gap_coverage')
  )
);

create index real_editorial_round_one_source_selections_run_idx
  on public.real_editorial_round_one_source_selections(pilot_id,run_id,selected_at desc);

alter table public.real_editorial_round_one_source_selections enable row level security;
alter table public.real_editorial_round_one_source_selection_items enable row level security;

revoke all on table
  public.real_editorial_round_one_source_selections,
  public.real_editorial_round_one_source_selection_items
from public,anon,authenticated;

grant select on table
  public.real_editorial_round_one_source_selections,
  public.real_editorial_round_one_source_selection_items
to service_role;

create trigger real_editorial_round_one_source_selections_append_only
  before update or delete on public.real_editorial_round_one_source_selections
  for each row execute function public.prevent_real_editorial_append_mutation();

create trigger real_editorial_round_one_source_selection_items_append_only
  before update or delete on public.real_editorial_round_one_source_selection_items
  for each row execute function public.prevent_real_editorial_append_mutation();

create or replace function public.select_real_editorial_round_one_active_sources(
  p_selection_key text,
  p_proposal_hash text,
  p_pilot_id uuid,
  p_run_id uuid,
  p_incident_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_strategy_version text,
  p_previous_checkpoint_version integer,
  p_previous_checkpoint_hash text,
  p_selected_checkpoint_version integer,
  p_selected_checkpoint jsonb,
  p_selected_checkpoint_hash text,
  p_items jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing public.real_editorial_round_one_source_selections%rowtype;
  pilot public.real_editorial_pilots%rowtype;
  run public.real_editorial_runs%rowtype;
  budget public.real_editorial_pilot_budgets%rowtype;
  checkpoint public.real_editorial_artifacts%rowtype;
  selection_id uuid := gen_random_uuid();
  selected_at timestamptz := now();
  expected_retained_sources jsonb;
begin
  if p_selection_key !~ '^[a-f0-9]{64}$'
     or p_proposal_hash !~ '^[a-f0-9]{64}$'
     or p_selected_checkpoint_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_HASH_INVALID';
  end if;
  if p_reason is null
     or length(btrim(p_reason)) not between 1 and 500
     or p_reason ~* '(sk-|tvly-|api[_ -]?key|authorization|bearer[[:space:]])' then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_REASON_INVALID';
  end if;
  if p_strategy_version <> 'round-one-active-source-selection-v1' then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_STRATEGY_INVALID';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) <> 8 then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_ITEMS_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('real-editorial-round-one-source-selection:' || p_run_id::text,0)
  );

  select * into existing from public.real_editorial_round_one_source_selections
   where selection_key = p_selection_key;
  if found then
    if existing.pilot_id = p_pilot_id
       and existing.run_id = p_run_id
       and existing.incident_id = p_incident_id
       and existing.actor_id = p_actor_id
       and existing.reason = p_reason
       and existing.proposal_hash = p_proposal_hash
       and existing.previous_checkpoint_version = p_previous_checkpoint_version
       and existing.previous_checkpoint_hash = p_previous_checkpoint_hash then
      return existing.id;
    end if;
    raise exception 'ROUND_ONE_SOURCE_SELECTION_IDEMPOTENCY_CONFLICT';
  end if;
  if exists (
    select 1 from public.real_editorial_round_one_source_selections
     where incident_id = p_incident_id
  ) then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_ALREADY_APPLIED';
  end if;

  select * into pilot from public.real_editorial_pilots
   where id = p_pilot_id and current_run_id = p_run_id
   for update;
  select * into run from public.real_editorial_runs
   where id = p_run_id and pilot_id = p_pilot_id
   for update;
  if pilot.id is null or run.id is null
     or pilot.state <> 'preflight'
     or run.state <> 'preflight'
     or run.current_round <> 1 then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_STATE_CHANGED';
  end if;
  if exists (
    select 1 from public.real_editorial_execution_guard
     where owner_execution_id is not null and expires_at > now()
  ) then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_GUARD_BUSY';
  end if;
  if exists (
    select 1 from public.real_editorial_call_reservations
     where pilot_id = p_pilot_id and run_id = p_run_id
       and state in ('reserved','started','unknown')
  ) then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_PENDING_RESERVATIONS';
  end if;
  if exists (
    select 1 from public.real_editorial_artifacts
     where run_id = p_run_id and artifact_kind in ('tavily_result','round')
       and artifact_key = 'round-2'
  ) then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_ROUND_TWO_STARTED';
  end if;
  if not exists (
    select 1 from public.real_editorial_incidents
     where id = p_incident_id and pilot_id = p_pilot_id and run_id = p_run_id
       and code = 'LIMIT_EXCEEDED' and classification = 'human_required'
       and resolved_at is null
  ) then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_INCIDENT_INVALID';
  end if;

  select * into budget from public.real_editorial_pilot_budgets
   where pilot_id = p_pilot_id
   for update;
  if not found or budget.reserved_cost <> 0 then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_LEDGER_INVALID';
  end if;

  select * into checkpoint from public.real_editorial_artifacts
   where run_id = p_run_id and artifact_kind = 'checkpoint' and artifact_key = 'workflow'
   order by version desc limit 1;
  if not found
     or checkpoint.version <> p_previous_checkpoint_version
     or checkpoint.payload_hash <> p_previous_checkpoint_hash
     or checkpoint.payload->>'version' <> 'real-workflow-v1'
     or checkpoint.payload->>'state' <> 'researching_round_2'
     or checkpoint.payload->>'completedRound' <> '1'
     or checkpoint.payload#>>'{initialMission,limits,maxSources}' <> '8'
     or jsonb_array_length(checkpoint.payload#>'{dossier,sources}') <> 8
     or jsonb_array_length(checkpoint.payload->'nextRoundQueries') <> 3 then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_CHECKPOINT_CHANGED';
  end if;

  if (select count(distinct item->>'sourceId') from jsonb_array_elements(p_items) item) <> 8
     or (select count(distinct (item->>'originalOrdinal')::integer)
           from jsonb_array_elements(p_items) item) <> 8
     or (select count(distinct (item->>'rank')::integer)
           from jsonb_array_elements(p_items) item) <> 8
     or (select count(*) from jsonb_array_elements(p_items) item
          where item->>'decision' = 'keep_active') <> 5
     or (select count(*) from jsonb_array_elements(p_items) item
          where item->>'decision' = 'deselect_active') <> 3 then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_PARTITION_INVALID';
  end if;

  if exists (
    with sources as (
      select source,ordinality::integer as original_ordinal
        from jsonb_array_elements(checkpoint.payload#>'{dossier,sources}')
          with ordinality as source(source,ordinality)
    ), metrics as (
      select
        source,
        original_ordinal,
        coalesce((
          select jsonb_agg(claim->>'id' order by claim->>'id')
            from jsonb_array_elements(checkpoint.payload#>'{masterKnowledge,claims}') claim
           where (claim->'evidenceIds') ? (source->>'id')
        ),'[]'::jsonb) as claim_ids,
        coalesce((
          select jsonb_agg(topic->>'topic' order by topic->>'topic')
            from jsonb_array_elements(checkpoint.payload#>'{coverage,topics}') topic
           where (topic->'evidenceIds') ? (source->>'id')
        ),'[]'::jsonb) as coverage_topics,
        coalesce((
          select jsonb_agg(topic->>'topic' order by topic->>'topic')
            from jsonb_array_elements(checkpoint.payload#>'{coverage,topics}') topic
           where (topic->'evidenceIds') ? (source->>'id')
             and (topic->>'coverage')::numeric < 0.75
        ),'[]'::jsonb) as undercovered_topics
      from sources
    ), ranked as (
      select *,row_number() over (
        order by jsonb_array_length(undercovered_topics) desc,
          jsonb_array_length(claim_ids) desc,
          jsonb_array_length(coverage_topics) desc,
          (source->>'score')::numeric desc,
          source->>'id'
      )::integer as expected_rank
      from metrics
    )
    select 1
      from ranked
      left join lateral (
        select item from jsonb_array_elements(p_items) item
         where item->>'sourceId' = ranked.source->>'id'
      ) proposed on true
     where proposed.item is null
        or proposed.item->>'title' <> ranked.source->>'title'
        or proposed.item->>'normalizedUrl' <> ranked.source->>'normalizedUrl'
        or proposed.item->>'contentHash' <> ranked.source->>'contentHash'
        or (proposed.item->>'score')::numeric <> (ranked.source->>'score')::numeric
        or (proposed.item->>'originalOrdinal')::integer <> ranked.original_ordinal
        or (proposed.item->>'rank')::integer <> ranked.expected_rank
        or proposed.item->'claimIds' <> ranked.claim_ids
        or proposed.item->'coverageTopics' <> ranked.coverage_topics
        or proposed.item->'undercoveredCoverageTopics' <> ranked.undercovered_topics
        or proposed.item->>'decision' <> case when ranked.expected_rank <= 5
          then 'keep_active' else 'deselect_active' end
        or proposed.item->>'reason' <> case when ranked.expected_rank <= 5
          then 'current_gap_evidence_priority' else 'lower_incremental_gap_coverage' end
     limit 1
  ) then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_RANKING_INVALID';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) item
     where jsonb_typeof(item->'coveredGapIds') <> 'array'
        or exists (
          select 1 from jsonb_array_elements_text(item->'coveredGapIds') gap_id
           where not exists (
             select 1 from jsonb_array_elements(checkpoint.payload->'unresolvedGaps') gap
              where gap->>'id' = gap_id
           )
        )
  ) then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_GAP_TRACE_INVALID';
  end if;

  select jsonb_agg(source order by ordinality) into expected_retained_sources
    from jsonb_array_elements(checkpoint.payload#>'{dossier,sources}')
      with ordinality as original(source,ordinality)
   where exists (
     select 1 from jsonb_array_elements(p_items) item
      where item->>'sourceId' = source->>'id'
        and item->>'decision' = 'keep_active'
   );
  if p_selected_checkpoint_version <> checkpoint.version + 1
     or p_selected_checkpoint is null
     or p_selected_checkpoint->>'state' <> 'researching_round_2'
     or p_selected_checkpoint->>'completedRound' <> '1'
     or p_selected_checkpoint#>'{dossier,sources}' <> expected_retained_sources
     or jsonb_array_length(p_selected_checkpoint#>'{dossier,sources}') <> 5
     or p_selected_checkpoint->'nextRoundQueries' <> checkpoint.payload->'nextRoundQueries'
     or ((p_selected_checkpoint - 'updatedAt') #- '{dossier,sources}')
       <> ((checkpoint.payload - 'updatedAt') #- '{dossier,sources}') then
    raise exception 'ROUND_ONE_SOURCE_SELECTION_CHECKPOINT_INVALID';
  end if;

  insert into public.real_editorial_round_one_source_selections (
    id,selection_key,proposal_hash,pilot_id,run_id,incident_id,actor_id,reason,
    strategy_version,previous_checkpoint_version,previous_checkpoint_hash,
    selected_checkpoint_version,selected_checkpoint_hash,maximum_sources,
    round_two_query_count,required_round_two_slots,original_active_count,
    retained_count,deselected_count,active_count_after_selection,
    available_slots_after_selection,provider_calls_performed,budget_changed,
    historical_sources_mutated,spent_cost,reserved_cost,current_maximum_cost,selected_at
  ) values (
    selection_id,p_selection_key,p_proposal_hash,p_pilot_id,p_run_id,p_incident_id,
    p_actor_id,btrim(p_reason),p_strategy_version,checkpoint.version,checkpoint.payload_hash,
    p_selected_checkpoint_version,p_selected_checkpoint_hash,8,3,3,8,5,3,5,3,
    0,false,false,budget.spent_cost,budget.reserved_cost,budget.task_limit_cost,selected_at
  );

  insert into public.real_editorial_round_one_source_selection_items (
    selection_id,source_id,title,normalized_url,content_hash,source_score,
    original_ordinal,selection_rank,decision,covered_gap_ids,coverage_topics,
    undercovered_coverage_topics,claim_ids,reason
  )
  select
    selection_id,item->>'sourceId',item->>'title',item->>'normalizedUrl',
    item->>'contentHash',(item->>'score')::numeric,
    (item->>'originalOrdinal')::integer,(item->>'rank')::integer,item->>'decision',
    item->'coveredGapIds',item->'coverageTopics',item->'undercoveredCoverageTopics',
    item->'claimIds',item->>'reason'
  from jsonb_array_elements(p_items) item;

  insert into public.real_editorial_artifacts (
    pilot_id,run_id,artifact_kind,artifact_key,version,payload,payload_hash
  ) values (
    p_pilot_id,p_run_id,'checkpoint','workflow',p_selected_checkpoint_version,
    p_selected_checkpoint,p_selected_checkpoint_hash
  );
  update public.real_editorial_incidents
     set resolved_at = selected_at
   where id = p_incident_id;
  update public.real_editorial_runs
     set checkpoint_version = p_selected_checkpoint_version,
         accumulated_cost = budget.spent_cost
   where id = p_run_id and pilot_id = p_pilot_id;

  insert into public.real_editorial_events (
    pilot_id,run_id,event_type,state,payload,occurred_at
  ) values (
    p_pilot_id,p_run_id,'real.editorial.round_one_sources.human_selected','preflight',
    jsonb_build_object(
      'selectionId',selection_id,
      'proposalHash',p_proposal_hash,
      'actorId',p_actor_id,
      'strategyVersion',p_strategy_version,
      'previousCheckpointVersion',checkpoint.version,
      'selectedCheckpointVersion',p_selected_checkpoint_version,
      'maximumSources',8,
      'originalActiveCount',8,
      'retainedCount',5,
      'deselectedCount',3,
      'availableSlotsAfterSelection',3,
      'providerCalled',false,
      'workflowResumed',false,
      'budgetChanged',false,
      'historicalSourcesMutated',false
    ),selected_at
  );
  return selection_id;
end;
$$;

revoke all on function public.select_real_editorial_round_one_active_sources(
  text,text,uuid,uuid,uuid,uuid,text,text,integer,text,integer,jsonb,text,jsonb
) from public,anon,authenticated;

grant execute on function public.select_real_editorial_round_one_active_sources(
  text,text,uuid,uuid,uuid,uuid,text,text,integer,text,integer,jsonb,text,jsonb
) to service_role;
