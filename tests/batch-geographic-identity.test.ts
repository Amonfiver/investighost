import { describe, expect, it } from 'vitest'
import { GeographicResolver, MemoryGeographyCatalogRepository } from '@modules/editorial-pipeline/geography'
import { BatchGeographicIdentityService } from '@modules/factory-batches/geographic-identity'
import { DestinationBatchService, EditorialBatchWorker, MemoryDestinationBatchRepository, type BatchEditorialPhasePort } from '@modules/factory-batches'

describe('new batch canonical identity', () => {
  it('NEW_JSON_DESTINATION_GETS_CANONICAL_IDENTITY and retry retains the same durable Segovia job', async () => {
    const repository = new MemoryDestinationBatchRepository()
    const resolver = new GeographicResolver(new MemoryGeographyCatalogRepository([]), 'fixture-v1')
    const importer = new DestinationBatchService(repository, resolver)
    const imported = await importer.importJson(JSON.stringify({ batchName: 'Piloto real Segovia', destinations: [{ name: 'Segovia', country: 'España' }] }))
    const first = imported.jobs[0]!
    expect(first.canonicalDestinationId).toBeUndefined()
    const identities = new Map<string, string>()
    const identity = new BatchGeographicIdentityService(resolver, {
      find: async (country, name) => identities.get(`${country}:${name}`) ?? null,
      create: async input => { identities.set(`${input.countryCode}:${input.normalizedName}`, input.id); return input.id },
    })
    const phases: BatchEditorialPhasePort = { run: async context => {
      if (context.phase === 'IDENTITY') return { canonicalDestinationId: await identity.ensure(context.job) }
      if (context.phase === 'RESEARCH') return { artifactRef: 'research-boundary' }
      return { artifactRef: context.phase }
    } }
    const worker = new EditorialBatchWorker(repository, phases, { workerId: 'segovia-fixture' })
    await worker.runJob(first.id)
    const completed = await repository.getJob(first.id)
    expect(completed).toMatchObject({ id: first.id, canonicalDestinationId: expect.any(String) })
    expect(completed?.artifactRefs.RESEARCH).toBe('research-boundary')
    expect(identities.size).toBe(1)
  })
})
