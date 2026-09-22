import { describe, expect, it } from 'vitest'
import {
  BatchExecutionContextMapper,
  FACTORY_BATCH_REAL_POLICY_ID,
} from '@modules/factory-batches'
import { MemoryGeographyCatalogRepository } from '@modules/editorial-pipeline/geography'
import type { DestinationBatch, DestinationBatchJob } from '@shared/factory-batch-contracts'

const now = new Date('2026-09-22T10:00:00.000Z')
const batch: DestinationBatch = {
  id: '72000000-0000-4000-8000-000000000001', name: 'España', normalizedName: 'espana',
  importFingerprint: 'a'.repeat(64), sourceOrigin: 'json_v1', status: 'IMPORTED',
  totalItems: 1, validItems: 1, newItems: 1, existingItems: 0, reusableItems: 0,
  ambiguousItems: 0, duplicateItems: 0, invalidItems: 0, failedItems: 0,
  maxCostPerDestination: 0.15, maxCostPerBatch: 0.4, importedAt: now, createdAt: now, updatedAt: now,
}
const job: DestinationBatchJob = {
  id: '72000000-0000-4000-8000-000000000002', batchId: batch.id, inputIndex: 0,
  originalName: 'Granada', country: 'España', region: 'Andalucía', normalizedName: 'granada', normalizedCountry: 'ES', normalizedRegion: 'andalucia', normalizedIdentity: 'granada|ES|andalucia',
  canonicalDestinationId: '72000000-0000-4000-8000-000000000003', identityState: 'NEW', reusePolicy: 'NEEDS_NEW_PRODUCTION', status: 'QUEUED', currentPhase: 'RESEARCH', completedPhases: [], artifactRefs: {}, attemptCount: 0, retryable: true, actualCost: 0, createdAt: now, updatedAt: now,
}

describe('BatchExecutionContextMapper', () => {
  it('maps arbitrary Granada batch data without a pilot enum or surrogate', async () => {
    const mapper = new BatchExecutionContextMapper(new MemoryGeographyCatalogRepository([{
      entity: {
        id: job.canonicalDestinationId!, parentId: '72000000-0000-4000-8000-000000000004', type: 'locality', name: 'Granada', normalizedName: 'granada', aliases: [], countryCode: 'ES', regionCode: 'AN', slug: 'granada', sourceName: 'fixture', sourceVersion: 'v1', sourceLicense: 'test', status: 'active', resolutionMethod: 'exact', ambiguityCandidateIds: [], version: 1, createdAt: now, updatedAt: now,
      }, hierarchy: [],
    }]))
    const context = await mapper.map(batch, job)
    expect(context).toMatchObject({
      owner: { type: 'BATCH_JOB', id: job.id }, destination: { name: 'Granada', countryCode: 'ES', destinationType: 'locality' },
      policy: { promptVersion: FACTORY_BATCH_REAL_POLICY_ID, limits: { taskBudgetEur: 0.15, batchBudgetEur: 0.4 } },
    })
    expect(context.executionId).not.toContain('pilot')
  })

  it('fails closed without a canonical destination', async () => {
    const mapper = new BatchExecutionContextMapper(new MemoryGeographyCatalogRepository([]))
    await expect(mapper.map(batch, { ...job, canonicalDestinationId: undefined })).rejects.toMatchObject({ code: 'CANONICAL_DESTINATION_REQUIRED' })
  })
})
