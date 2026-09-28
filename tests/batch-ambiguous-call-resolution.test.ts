import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BatchAmbiguousCallResolutionSchema } from '@shared/factory-batch-contracts'

const migration = readFileSync(
  new URL('../supabase/migrations/20260928090000_factory_batch_ambiguous_usage_resolution.sql', import.meta.url),
  'utf8',
)

const evidence = {
  evidenceType: 'PROVIDER_USAGE_EXPORT' as const, provider: 'deepseek' as const, model: 'deepseek-flash',
  windowStart: '2026-09-27T20:00:00+02:00', windowEnd: '2026-09-27T21:00:00+02:00', apiKeyName: 'investighost',
  requestCount: 1, inputCacheMissTokens: 40341, outputTokens: 8036, providerCost: 0.01087275,
  currency: 'USD' as const, requestIdPresentInExport: false as const,
  limitation: 'Usage export aggregated hourly; request id not present. Same API key/window contained exactly one request.',
}

describe('resolución humana de consumo ambiguo batch', () => {
  it('CONFIRMED_CONSUMED requires external evidence and keeps RESPONSE_RECOVERED false', () => {
    const parsed = BatchAmbiguousCallResolutionSchema.parse({
      jobId: '2efade2d-b011-4cc2-a51d-ce2a095036c1', decision: 'CONSUMPTION_CONFIRMED', responseRecovered: false, evidence,
    })
    expect(parsed.evidence).toMatchObject({ requestCount: 1, inputCacheMissTokens: 40341, outputTokens: 8036, providerCost: 0.01087275, currency: 'USD' })
    expect(BatchAmbiguousCallResolutionSchema.safeParse({ ...parsed, responseRecovered: true }).success).toBe(false)
    expect(BatchAmbiguousCallResolutionSchema.safeParse({ ...parsed, evidence: undefined }).success).toBe(false)
  })

  it('CONFIRMED_NOT_CONSUMED and INDETERMINATE cannot carry a provider charge', () => {
    for (const decision of ['NO_CONSUMPTION', 'INDETERMINATE'] as const) {
      expect(BatchAmbiguousCallResolutionSchema.safeParse({ jobId: '2efade2d-b011-4cc2-a51d-ce2a095036c1', decision, responseRecovered: false, evidence }).success).toBe(false)
    }
  })

  it('API_KEY_SECRET_NOT_PERSISTED rejects secret-shaped evidence and migration preserves USD evidence separately from EUR ledger cost', () => {
    expect(BatchAmbiguousCallResolutionSchema.safeParse({
      jobId: '2efade2d-b011-4cc2-a51d-ce2a095036c1', decision: 'CONSUMPTION_CONFIRMED', responseRecovered: false,
      evidence: { ...evidence, apiKeyName: 'sk-secret-value' },
    }).success).toBe(false)
    expect(migration).toContain('external_usage_evidence')
    expect(migration).toContain("set state='failed'")
    expect(migration).toContain('response_recovered')
    expect(migration).toContain('reserved_cost = reserved_cost - reservation.reserved_cost')
  })
})
