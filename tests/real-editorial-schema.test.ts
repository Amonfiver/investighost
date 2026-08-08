import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrations = [
  '20260725213000_real_editorial_pilot.sql',
  '20260725214500_real_editorial_prepare_idempotency.sql',
  '20260725215500_real_editorial_ledger_sanitization.sql',
  '20260725220500_real_editorial_prepare_concurrency.sql',
  '20260725221500_real_editorial_connectivity_evidence.sql',
  '20260726013000_real_editorial_ambiguous_call_resolution.sql',
  '20260727090000_real_editorial_budget_decision.sql',
  '20260728213000_real_editorial_prudential_reconciliation.sql',
  '20260730210000_real_editorial_source_limit_recovery.sql',
  '20260801120000_real_editorial_atomic_analysis_recovery.sql',
  '20260801180000_real_editorial_historical_incident_resolution.sql',
  '20260808120000_real_editorial_second_destination.sql',
  '20260808123000_real_editorial_openai_prudential_reconciliation.sql',
  '20260808130000_real_editorial_round_one_budget_review_repair.sql',
  '20260809100000_real_editorial_round_one_active_source_selection.sql',
]

async function migration(name: string): Promise<string> {
  return readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

describe('esquema durable del piloto editorial real', () => {
  it('separa modos, presupuesto, guarda y ledger del historial 10D', async () => {
    const sql = await migration(migrations[0])

    expect(sql).toContain('editorial_execution_modes')
    expect(sql).toContain("'manual','real_editorial_pilot','automatic'")
    expect(sql).toContain('real_editorial_pilot_budgets')
    expect(sql).toContain('real_editorial_execution_guard')
    expect(sql).toContain('real_editorial_call_reservations')
    expect(sql).not.toMatch(/(?:alter|drop|truncate)\s+table\s+public\.(?:provider_calls|provider_call_reservations|real_task_budgets|real_batch_budgets|real_daily_budgets)/i)
    expect(sql).not.toContain('connectivity-check-10d-task')
  })

  it('fija la política Morella y sus fronteras negativas', async () => {
    const sql = await migration(migrations[0])

    expect(sql).toContain('0.125000000,0.160000000,0.200000000,0.250000000,0.500000000')
    expect(sql).toContain('max_rounds = 2')
    expect(sql).toContain('max_initial_searches between 1 and 4')
    expect(sql).toContain('max_focused_queries between 1 and 3')
    expect(sql).toContain('max_accepted_sources between 1 and 8')
    expect(sql).toContain('max_concurrency = 1')
    expect(sql).toContain('max_regenerations = 0')
    expect(sql).toContain('publication_count integer not null default 0 check (publication_count = 0)')
    expect(sql).toContain('trawel_connected boolean not null default false check (trawel_connected = false)')
    expect(sql).toContain('automatic_enabled boolean not null default false check (automatic_enabled = false)')
  })

  it('incluye estado humano, artefactos, eventos, incidencias y append-only', async () => {
    const sql = await migration(migrations[0])

    expect(sql).toContain("'pending_human_review'")
    expect(sql).toContain("'ready_for_human_review'")
    expect(sql).toContain('create table public.real_editorial_artifacts')
    expect(sql).toContain('create table public.real_editorial_events')
    expect(sql).toContain('create table public.real_editorial_incidents')
    expect(sql).toContain('REAL_EDITORIAL_APPEND_ONLY')
    expect(sql).toContain('alter table public.%I enable row level security')
  })

  it('endurece idempotencia secuencial y concurrente', async () => {
    const [idempotency, concurrency] = await Promise.all([
      migration(migrations[1]),
      migration(migrations[3]),
    ])

    expect(idempotency).toContain('PREPARATION_IDEMPOTENCY_CONFLICT')
    expect(idempotency).toContain('DUPLICATE_REAL_EDITORIAL_PILOT')
    expect(concurrency).toContain("'real-editorial-preparation:' || p_preparation_key")
    expect(concurrency).toContain("'real-editorial-identity:' || p_identity_key")
  })

  it('impide persistir coste negativo, secretos o hashes inválidos', async () => {
    const sql = await migration(migrations[2])

    expect(sql).toContain('real_editorial_calls_calculated_cost_nonnegative')
    expect(sql).toContain('real_editorial_calls_sanitized_error')
    expect(sql).toContain('api[_ -]?key|authorization|bearer[[:space:]]')
    expect(sql).toContain("output_hash is null or output_hash ~ '^[a-f0-9]{64}$'")
  })

  it('materializa la evidencia 10D sin reutilizar su presupuesto o guarda', async () => {
    const sql = await migration(migrations[4])

    expect(sql).toContain('real_editorial_connectivity_evidence')
    expect(sql).toContain("'connectivity_check'")
    expect(sql).toContain("calls.task_id = 'connectivity-check-10d-task'")
    expect(sql).not.toMatch(/update\s+public\.(?:provider_calls|provider_call_reservations|real_task_budgets)/i)
    expect(sql).toContain('real_editorial_connectivity_evidence_append_only')
  })

  it('añade resolución humana append-only y bloquea retries ambiguos', async () => {
    const sql = await migration(migrations[5])

    expect(sql).toContain('create table public.real_editorial_ambiguous_calls')
    expect(sql).toContain('create table public.real_editorial_call_human_resolutions')
    expect(sql).toContain('real_editorial_human_resolutions_append_only')
    expect(sql).toContain('AMBIGUOUS_CALL_REQUIRES_HUMAN_RESOLUTION')
    expect(sql).toContain('resolve_real_editorial_ambiguous_call')
    expect(sql).toContain("'real.editorial.remote_call.human_decided'")
    expect(sql).toContain("'LEGACY_OPENAI_PROVIDER_ERROR'")
    expect(sql).toContain('HUMAN_RESOLUTION_BUDGET_EXCEEDED')
    expect(sql).not.toMatch(/(?:drop|truncate)\s+table/i)
  })

  it('añade decisión presupuestaria humana sin duplicar identidad ni ledger', async () => {
    const sql = await migration(migrations[6])

    expect(sql).toContain('create table public.real_editorial_budget_reviews')
    expect(sql).toContain('create table public.real_editorial_budget_decisions')
    expect(sql).toContain('real_editorial_budget_decisions_append_only')
    expect(sql).toContain('open_real_editorial_budget_review')
    expect(sql).toContain('resolve_real_editorial_budget_review')
    expect(sql).toContain('BUDGET_EXTENSION_BELOW_LEDGER')
    expect(sql).toContain('BUDGET_EXTENSION_BELOW_TOTAL_ESTIMATE')
    expect(sql).toContain('BUDGET_DECISION_IDEMPOTENCY_CONFLICT')
    expect(sql).toContain("'real.editorial.budget.human_decided'")
    expect(sql).toContain("set task_limit_cost = normalized_new_maximum")
    expect(sql).toContain('batch_limit_cost = normalized_new_maximum')
    expect(sql).toContain('daily_limit_cost = normalized_new_maximum')
    expect(sql).not.toMatch(/insert into public\.real_editorial_(?:pilots|runs|pilot_budgets)/i)
    expect(sql).not.toMatch(/(?:delete|truncate)\s+from\s+public\.real_editorial/i)
    expect(sql).not.toMatch(/api\.tavily|api\.openai|fetch\(/i)
  })

  it('concilia prudencialmente una subpetición sin afirmar consumo confirmado', async () => {
    const sql = await migration(migrations[7])

    expect(sql).toContain('prudential_cost_assumed')
    expect(sql).toContain('reconcile_real_editorial_ambiguous_call_prudential')
    expect(sql).toContain('tariff.credit_unit_cost / tariff.unit_scale')
    expect(sql).toContain('PRUDENTIAL_COST_ABOVE_RESERVATION')
    expect(sql).toContain('PRUDENTIAL_COST_ABOVE_SUBREQUEST_MAXIMUM')
    expect(sql).toContain('PRUDENTIAL_PROVIDER_RESULT_BECAME_DURABLE')
    expect(sql).toContain("'human_prudential_reconciliation'")
    expect(sql).toContain("'providerConfirmed',false")
    expect(sql).toContain("'possibleDuplicateChargeAccepted',true")
    expect(sql).toContain("'HUMAN_PRUDENTIAL_COST_ASSUMED'")
    expect(sql).not.toMatch(/insert into public\.real_editorial_(?:pilots|runs)\b/i)
    expect(sql).not.toMatch(/(?:delete|truncate)\s+from/i)
    expect(sql).not.toMatch(/api\.tavily|api\.openai|fetch\(/i)
  })

  it('materializa la revisión presupuestaria omitida sin ejecutar ni decidir ronda 2', async () => {
    const sql = await migration(migrations[13])

    expect(sql).toContain('materialize_real_editorial_round_one_budget_review')
    expect(sql).toContain('ROUND_ONE_BUDGET_REPAIR_CHECKPOINT_CHANGED')
    expect(sql).toContain("checkpoint.payload->>'completedRound' <> '1'")
    expect(sql).toContain("checkpoint.payload#>>'{lastDecision,action}' <> 'continue_focused'")
    expect(sql).toContain("jsonb_array_length(focused_queries) <> 3")
    expect(sql).toContain('0.048000000 + greatest(0.022000000,analysis_cost)')
    expect(sql).toContain("'real.editorial.budget.review_materialized'")
    expect(sql).toContain("'providerCalled',false")
    expect(sql).toContain("'workflowResumed',false")
    expect(sql).toContain("'budgetChanged',false")
    expect(sql).toContain("'coverageReviewOpened',false")
    expect(sql).not.toMatch(/update\s+public\.real_editorial_pilot_budgets/i)
    expect(sql).not.toMatch(/insert into\s+public\.real_editorial_coverage_reviews/i)
    expect(sql).not.toMatch(/api\.tavily|api\.openai|fetch\(/i)
  })

  it('añade selección activa append-only sin ampliar fuentes ni borrar historia', async () => {
    const sql = await migration(migrations[14])

    expect(sql).toContain('create table public.real_editorial_round_one_source_selections')
    expect(sql).toContain('create table public.real_editorial_round_one_source_selection_items')
    expect(sql).toContain('select_real_editorial_round_one_active_sources')
    expect(sql).toContain('round-one-active-source-selection-v1')
    expect(sql).toContain('maximum_sources = 8')
    expect(sql).toContain('original_active_count = 8')
    expect(sql).toContain('retained_count = 5')
    expect(sql).toContain('deselected_count = 3')
    expect(sql).toContain('historical_sources_mutated boolean not null default false')
    expect(sql).toContain("'historicalSourcesMutated',false")
    expect(sql).toContain("'providerCalled',false")
    expect(sql).toContain("'workflowResumed',false")
    expect(sql).not.toMatch(/update\s+public\.real_editorial_(?:source_accepted|extracted_document)/i)
    expect(sql).not.toMatch(/delete\s+from\s+public\.real_editorial/i)
    expect(sql).not.toMatch(/update\s+public\.real_editorial_pilot_budgets/i)
    expect(sql).not.toMatch(/api\.tavily|api\.openai|fetch\(/i)
  })

  it('recupera un exceso global de fuentes sin repetir proveedores ni ledger', async () => {
    const sql = await migration(migrations[8])

    expect(sql).toContain('create table public.real_editorial_source_limit_recoveries')
    expect(sql).toContain('recover_real_editorial_source_limit')
    expect(sql).toContain('real_editorial_source_limit_recoveries_append_only')
    expect(sql).toContain("'global_source_limit_exhausted'")
    expect(sql).toContain("'analyzing_round_2'")
    expect(sql).toContain("'evaluating_round_2'")
    expect(sql).toContain('checkpoint_version = p_recovered_checkpoint_version')
    expect(sql).toContain('accumulated_cost = budget.spent_cost')
    expect(sql).toContain("'real.editorial.source_limit.human_recovered'")
    expect(sql).toContain('SOURCE_LIMIT_RECOVERY_IDEMPOTENCY_CONFLICT')
    expect(sql).toContain('SOURCE_LIMIT_RECOVERY_ANALYSIS_ALREADY_STARTED')
    expect(sql).not.toMatch(/insert into public\.real_editorial_call_reservations/i)
    expect(sql).not.toMatch(/insert into public\.real_editorial_provider_calls/i)
    expect(sql).not.toMatch(/update public\.real_editorial_pilot_budgets/i)
    expect(sql).not.toMatch(/(?:delete|truncate)\s+from/i)
    expect(sql).not.toMatch(/api\.tavily|api\.openai|fetch\(/i)
  })

  it('registra OpenAI antes de persistir atómicamente y recupera el parcial sin proveedores', async () => {
    const sql = await migration(migrations[9])

    expect(sql).toContain('create table public.real_editorial_analysis_provider_receipts')
    expect(sql).toContain('record_real_editorial_analysis_response')
    expect(sql).toContain('persist_real_editorial_analysis')
    expect(sql).toContain('ANALYSIS_ARTIFACT_CONFLICT')
    expect(sql).toContain("'^round-' || p_round::text")
    expect(sql).toContain('create table public.real_editorial_partial_analysis_recoveries')
    expect(sql).toContain('recover_real_editorial_partial_analysis')
    expect(sql).toContain('jsonb_array_length(partial_artifacts) = 38')
    expect(sql).toContain("'HUMAN_PRUDENTIAL_RESPONSE_RECEIVED_PERSISTENCE_FAILED'")
    expect(sql).toContain("'providerCalled',false")
    expect(sql).toContain("'workflowResumed',false")
    expect(sql).not.toMatch(/insert into public\.real_editorial_call_reservations/i)
    expect(sql).not.toMatch(/(?:delete|truncate)\s+from/i)
    expect(sql).not.toMatch(/api\.tavily|api\.openai|fetch\(/i)
  })

  it('resuelve incidentes históricos con evidencia sin tocar ledger ni ejecutar trabajo', async () => {
    const sql = await migration(migrations[10])

    expect(sql).toContain('real_editorial_historical_incident_resolution_batches')
    expect(sql).toContain('real_editorial_historical_incident_resolutions')
    expect(sql).toContain('resolve_real_editorial_historical_incidents')
    expect(sql).toContain('HISTORICAL_INCIDENT_EVIDENCE_INSUFFICIENT')
    expect(sql).toContain('HISTORICAL_INCIDENT_IDEMPOTENCY_CONFLICT')
    expect(sql).toContain("'durable_mission_reused'")
    expect(sql).toContain("'equivalent_query_reused'")
    expect(sql).toContain("'providerCalled',false")
    expect(sql).toContain("'workflowResumed',false")
    expect(sql).not.toMatch(/insert into public\.real_editorial_call_reservations/i)
    expect(sql).not.toMatch(/insert into public\.real_editorial_provider_calls/i)
    expect(sql).not.toMatch(/update public\.real_editorial_pilot_budgets/i)
    expect(sql).not.toMatch(/insert into public\.real_editorial_artifacts/i)
    expect(sql).not.toMatch(/(?:delete|truncate)\s+from/i)
    expect(sql).not.toMatch(/api\.tavily|api\.openai|fetch\(/i)
  })

  it('añade Albarracín como segunda policy cerrada sin ejecutar ni publicar', async () => {
    const sql = await migration(migrations[11])

    expect(sql).toContain('REAL_EDITORIAL_PREVIOUS_POLICY_UNEXPECTED')
    expect(sql).toContain("normalized_destination text not null default 'morella'")
    expect(sql).toContain('alter column normalized_destination drop default')
    expect(sql).toContain("'albarracin-real-editorial-e2e04-v1','Albarracín','albarracin','ES','locality'")
    expect(sql).toContain("selected_destination.name <> selected_policy.destination_name")
    expect(sql).toContain("selected_destination.normalized_name <> selected_policy.normalized_destination")
    expect(sql).toContain("selected_destination.country_code <> selected_policy.country_code")
    expect(sql).toContain("selected_destination.entity_type <> selected_policy.destination_type")
    expect(sql).toContain("'real-editorial-preparation:' || p_preparation_key")
    expect(sql).toContain("'real-editorial-identity:' || p_identity_key")
    expect(sql).toContain('PREPARATION_IDEMPOTENCY_CONFLICT')
    expect(sql).toContain('DUPLICATE_REAL_EDITORIAL_PILOT')
    expect(sql).toContain('selected_policy.normalized_destination || \'-real-editorial-v1\'')
    expect(sql).not.toMatch(/insert into public\.real_editorial_(?:provider_calls|call_reservations|artifacts)/i)
    expect(sql).not.toMatch(/update public\.real_editorial_pilot_policies/i)
    expect(sql).not.toMatch(/(?:delete|truncate)\s+from/i)
    expect(sql).not.toMatch(/api\.tavily|api\.openai|fetch\(|publication_count\s*=\s*[1-9]/i)
  })

  it('concilia OpenAI por el máximo reservado sin afirmar consumo remoto', async () => {
    const sql = await migration(migrations[12])

    expect(sql).toContain('reconcile_real_editorial_openai_ambiguous_call_prudential')
    expect(sql).toContain("reservation.provider_id <> 'openai'")
    expect(sql).toContain("reservation.operation <> 'analysis'")
    expect(sql).toContain('derived_cost := reservation.reserved_cost')
    expect(sql).toContain('p_prudential_cost <> derived_cost')
    expect(sql).toContain("'human_prudential_reconciliation',false,true")
    expect(sql).toContain("'providerConfirmed',false")
    expect(sql).toContain('real_editorial_analysis_provider_receipts')
    expect(sql).toContain("state in ('succeeded','reconciled')")
    expect(sql).not.toMatch(/provider_confirmed\s*,?\s*true/i)
    expect(sql).not.toMatch(/api\.openai|fetch\(|publication_count\s*=\s*[1-9]/i)
    expect(sql).not.toMatch(/(?:delete|truncate)\s+from/i)
  })
})
