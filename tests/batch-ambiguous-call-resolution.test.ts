import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BatchAmbiguousCallResolutionSchema } from '@shared/factory-batch-contracts'
import { matchesSelectedBatchAmbiguity } from '@modules/factory-batches/ambiguous-call-resolution'

const currentReservationId = 'bc1bf749-a663-434a-bdfa-542a96f395b1'
const currentProviderCallId = '57609680-1d66-483c-b4ef-bce7b7f1725e'

const migration = readFileSync(
  new URL('../supabase/migrations/20260928090000_factory_batch_ambiguous_usage_resolution.sql', import.meta.url),
  'utf8',
)
const prudentialMigration = readFileSync(
  new URL('../supabase/migrations/20261002100000_factory_batch_prudential_ambiguous_call_resolution.sql', import.meta.url),
  'utf8',
)

const evidence = {
  evidenceType: 'PROVIDER_USAGE_EXPORT' as const, provider: 'deepseek' as const, model: 'deepseek-flash',
  windowStart: '2026-09-27T20:00:00+02:00', windowEnd: '2026-09-27T21:00:00+02:00', apiKeyName: 'investighost',
  requestCount: 1, inputCacheHitTokens: 640, inputCacheMissTokens: 40341, outputTokens: 8036, providerCost: 0.01087275,
  currency: 'USD' as const, requestIdPresentInExport: false as const,
  limitation: 'Usage export aggregated hourly; request id not present. Same API key/window contained exactly one request.',
}

describe('resolución humana de consumo ambiguo batch', () => {
  it('CONFIRMED_CONSUMED requires external evidence and keeps RESPONSE_RECOVERED false', () => {
    const parsed = BatchAmbiguousCallResolutionSchema.parse({
      jobId: '2efade2d-b011-4cc2-a51d-ce2a095036c1', reservationId: currentReservationId, providerCallId: currentProviderCallId, decision: 'CONSUMPTION_CONFIRMED', responseRecovered: false, evidence,
    })
    expect(parsed.evidence).toMatchObject({ requestCount: 1, inputCacheHitTokens: 640, inputCacheMissTokens: 40341, outputTokens: 8036, providerCost: 0.01087275, currency: 'USD' })
    expect(BatchAmbiguousCallResolutionSchema.safeParse({ ...parsed, responseRecovered: true }).success).toBe(false)
    expect(BatchAmbiguousCallResolutionSchema.safeParse({ ...parsed, evidence: undefined }).success).toBe(false)
  })

  it('CONFIRMED_NOT_CONSUMED and INDETERMINATE cannot carry a provider charge', () => {
    for (const decision of ['NO_CONSUMPTION', 'INDETERMINATE'] as const) {
      expect(BatchAmbiguousCallResolutionSchema.safeParse({ jobId: '2efade2d-b011-4cc2-a51d-ce2a095036c1', reservationId: currentReservationId, providerCallId: currentProviderCallId, decision, responseRecovered: false, evidence }).success).toBe(false)
    }
  })

  it('API_KEY_SECRET_NOT_PERSISTED rejects secret-shaped evidence and migration preserves USD evidence separately from EUR ledger cost', () => {
    expect(BatchAmbiguousCallResolutionSchema.safeParse({
      jobId: '2efade2d-b011-4cc2-a51d-ce2a095036c1', reservationId: currentReservationId, providerCallId: currentProviderCallId, decision: 'CONSUMPTION_CONFIRMED', responseRecovered: false,
      evidence: { ...evidence, apiKeyName: 'sk-secret-value' },
    }).success).toBe(false)
    expect(migration).toContain('external_usage_evidence')
    expect(migration).toContain("set state='failed'")
    expect(migration).toContain('response_recovered')
    expect(migration).toContain('reserved_cost = reserved_cost - reservation.reserved_cost')
  })

  it('CURRENT_AMBIGUITY_FORM_SCOPED_TO_RESERVATION_AND_PROVIDER_CALL', () => {
    const parsed = BatchAmbiguousCallResolutionSchema.parse({
      jobId: '2efade2d-b011-4cc2-a51d-ce2a095036c1', reservationId: currentReservationId, providerCallId: currentProviderCallId,
      decision: 'CONSUMPTION_CONFIRMED', responseRecovered: false, evidence,
    })
    expect(matchesSelectedBatchAmbiguity(parsed, { reservation_id: currentReservationId, call_id: currentProviderCallId })).toBe(true)
    expect(matchesSelectedBatchAmbiguity(parsed, { reservation_id: 'f3018e35-cab8-42d9-b7c3-cbff863377b2', call_id: '42e4c84d-80e6-4394-ac5e-db32f0e9dca2' })).toBe(false)
  })

  it('INDETERMINATE_REMOTE_RESULT_IS_NEITHER_CONFIRMED_CONSUMPTION_NOR_NON_CONSUMPTION and requires an explicit prudential decision', () => {
    const prudential = BatchAmbiguousCallResolutionSchema.parse({
      jobId: '2efade2d-b011-4cc2-a51d-ce2a095036c1', reservationId: currentReservationId, providerCallId: currentProviderCallId,
      decision: 'PRUDENTIAL_COST_ASSUMED', responseRecovered: false, prudentialCostEur: 0.02,
      currency: 'EUR', reason: 'El usage disponible no cubre de forma fiable la ventana de la llamada.', acceptsPotentialDuplicateCharge: true,
    })
    expect(prudential).toMatchObject({ decision: 'PRUDENTIAL_COST_ASSUMED', responseRecovered: false, prudentialCostEur: 0.02 })
    expect(prudential.evidence).toBeUndefined()
    expect(BatchAmbiguousCallResolutionSchema.safeParse({ ...prudential, reason: undefined }).success).toBe(false)
    expect(BatchAmbiguousCallResolutionSchema.safeParse({ ...prudential, evidence }).success).toBe(false)
  })

  it('PRUDENTIAL_ACCOUNTING_COUNTS_AGAINST_BUDGET without inventing confirmed provider cost or usage evidence', () => {
    expect(prudentialMigration).toContain('PRUDENTIAL_COST_MUST_EQUAL_RESERVED_MAXIMUM')
    expect(prudentialMigration).toContain("'providerCostConfirmed',false")
    expect(prudentialMigration).toContain("'remoteResult','indeterminate'")
    expect(prudentialMigration).toContain("'accountingPolicy','PRUDENTIAL_MAX_ASSUMED'")
    expect(prudentialMigration).toContain('spent_cost = spent_cost + p_prudential_cost')
    expect(prudentialMigration).toContain('reserved_cost = reserved_cost - reservation.reserved_cost')
    expect(prudentialMigration).toContain("terminal_decision = 'prudential_cost_assumed'")
    expect(prudentialMigration).toContain('HUMAN_RESOLUTION_BUDGET_EXCEEDED')
  })

  it('PRUDENTIAL_RPC_SIGNATURE_MATCHES_RUNTIME and is restricted to service_role', () => {
    expect(prudentialMigration).toContain('create function public.reconcile_generic_real_editorial_ambiguous_call_prudential(')
    expect(prudentialMigration).toContain('p_resolution_key text,')
    expect(prudentialMigration).toContain('p_execution_owner_id uuid,')
    expect(prudentialMigration).toContain('p_call_id uuid,')
    expect(prudentialMigration).toContain('p_reservation_id uuid,')
    expect(prudentialMigration).toContain('p_actor_id uuid,')
    expect(prudentialMigration).toContain('p_prudential_cost numeric,')
    expect(prudentialMigration).toContain('p_currency text,')
    expect(prudentialMigration).toContain('p_reason text,')
    expect(prudentialMigration).toContain('p_note text,')
    expect(prudentialMigration).toContain('p_duplicate_charge_risk_accepted boolean')
    expect(prudentialMigration).toContain('revoke all on function public.reconcile_generic_real_editorial_ambiguous_call_prudential')
    expect(prudentialMigration).toContain('to service_role;')
  })
})
