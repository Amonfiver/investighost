import { describe, expect, it, vi } from 'vitest'
import { ProductionBatchEditorialPhasePort } from '@modules/factory-batches'
import type { DestinationBatch, DestinationBatchJob } from '@shared/factory-batch-contracts'

const now = new Date('2026-09-22T10:00:00.000Z')
const batch: DestinationBatch = {
  id: '73000000-0000-4000-8000-000000000001', name: 'España', normalizedName: 'espana', importFingerprint: 'b'.repeat(64), sourceOrigin: 'json_v1', status: 'IMPORTED', totalItems: 1, validItems: 1, newItems: 1, existingItems: 0, reusableItems: 0, ambiguousItems: 0, duplicateItems: 0, invalidItems: 0, failedItems: 0, maxCostPerDestination: 0.15, maxCostPerBatch: 0.4, importedAt: now, createdAt: now, updatedAt: now,
}
const job: DestinationBatchJob = {
  id: '73000000-0000-4000-8000-000000000002', batchId: batch.id, inputIndex: 0, originalName: 'Granada', country: 'España', region: 'Andalucía', normalizedName: 'granada', normalizedCountry: 'ES', normalizedRegion: 'andalucia', normalizedIdentity: 'granada|ES|andalucia', canonicalDestinationId: '73000000-0000-4000-8000-000000000003', identityState: 'NEW', reusePolicy: 'NEEDS_NEW_PRODUCTION', status: 'QUEUED', currentPhase: 'RESEARCH', completedPhases: [], artifactRefs: {}, attemptCount: 0, retryable: true, actualCost: 0, createdAt: now, updatedAt: now,
}

function geographyClient() {
  const rows: Record<string, unknown[]> = {
    geographic_entities: [{ id: job.canonicalDestinationId, parent_id: '73000000-0000-4000-8000-000000000004', entity_type: 'locality', name: 'Granada', normalized_name: 'granada', country_code: 'ES', region_code: 'AN', slug: 'granada', latitude: null, longitude: null, source_name: 'fixture', source_version: 'v1', source_license: 'test', source_snapshot_id: null, source_checked_at: null, status: 'active', resolution_method: 'exact', version: 1, created_at: now.toISOString(), updated_at: now.toISOString() }],
    geographic_aliases: [], geographic_external_ids: [],
  }
  return {
    from(table: string) {
      const result = { data: rows[table] ?? [], error: null }
      const chain: Record<string, unknown> = {
        eq: () => Promise.resolve(result),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      }
      return { select: () => chain }
    },
  } as never
}

describe('ProductionBatchEditorialPhasePort', () => {
  it('maps IDENTITY through the owner-neutral production port without a provider or fixture delegate', async () => {
    const providerCenter = vi.fn()
    const port = new ProductionBatchEditorialPhasePort({ client: geographyClient(), providerCenter })
    await expect(port.run({ batch, job, phase: 'IDENTITY' })).resolves.toEqual({ artifactRef: job.canonicalDestinationId })
    expect(providerCenter).not.toHaveBeenCalled()
  })

  it('fails closed before acquiring providers when the batch capability is absent', async () => {
    const providerCenter = vi.fn()
    const port = new ProductionBatchEditorialPhasePort({ client: geographyClient(), providerCenter, environment: {} })
    await expect(port.run({ batch, job, phase: 'RESEARCH' })).rejects.toThrow('BATCH_PROVIDER_AUTHORIZATION_REQUIRED')
    expect(providerCenter).not.toHaveBeenCalled()
  })
})
