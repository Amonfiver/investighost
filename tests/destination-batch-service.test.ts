import { describe, expect, it } from 'vitest'
import { GeographicResolver, MemoryGeographyCatalogRepository } from '@modules/editorial-pipeline/geography'
import {
  DestinationBatchImportError,
  DestinationBatchService,
  MemoryDestinationBatchRepository,
} from '@modules/factory-batches'
import type { GeographicCatalogEntry } from '@modules/editorial-pipeline/geography'

const GRANADA_ID = '10000000-0000-4000-8000-000000000001'
const TOLEDO_ID = '10000000-0000-4000-8000-000000000002'

function entry(id: string, name: string): GeographicCatalogEntry {
  return {
    entity: {
      id, parentId: '10000000-0000-4000-8000-000000000099', type: 'locality', name, normalizedName: name,
      aliases: [], countryCode: 'ES', slug: name.toLocaleLowerCase('es').replace(/ó/g, 'o'), sourceName: 'fixture',
      sourceVersion: 'v1', sourceLicense: 'CC0', status: 'active', resolutionMethod: 'exact', ambiguityCandidateIds: [],
      version: 1, createdAt: new Date('2026-09-22T00:00:00Z'), updatedAt: new Date('2026-09-22T00:00:00Z'),
    }, hierarchy: [],
  }
}

function setup() {
  const repository = new MemoryDestinationBatchRepository()
  repository.seedExisting(GRANADA_ID, { hasApprovedContent: true, hasDeliveredContent: false })
  const geography = new GeographicResolver(new MemoryGeographyCatalogRepository([
    entry(GRANADA_ID, 'Granada'), entry(TOLEDO_ID, 'Toledo'), entry('10000000-0000-4000-8000-000000000003', 'Santiago'),
    entry('10000000-0000-4000-8000-000000000004', 'Santiago'),
  ]), 'fixture-v1')
  return { repository, service: new DestinationBatchService(repository, geography) }
}

function fixture() {
  return JSON.stringify({
    batch: { name: 'España · diez destinos' },
    destinations: [
      { name: 'Granada', country: 'España', region: 'Andalucía' },
      { name: 'Toledo', country: 'España', region: 'Castilla-La Mancha' },
      { name: 'Segovia', country: 'España' },
      { name: 'Córdoba', country: 'España' },
      { name: 'Santiago', country: 'España' },
      { name: '  Granada ', country: 'Spain', region: 'Andalucía' },
      { name: 'Cuenca', country: 'España' },
      { name: 'Ronda', country: 'España' },
      { name: 'Burgos', country: 'España' },
      { name: '', country: '' },
    ],
  })
}

describe('DestinationBatchService', () => {
  it('imports a 10-row fixture with row-level invalid and duplicate handling', async () => {
    const { service } = setup()
    const result = await service.importJson(fixture())
    expect(result.summary).toMatchObject({ total: 10, valid: 9, new: 6, existing: 1, reusable: 1, ambiguous: 1, duplicateInput: 1, invalid: 1, queued: 6 })
    expect(result.jobs).toHaveLength(8)
    expect(result.jobs.find(job => job.originalName === 'Granada')).toMatchObject({ status: 'REUSED', identityState: 'EXISTS_WITH_APPROVED_CONTENT' })
    expect(result.jobs.find(job => job.originalName === 'Santiago')).toMatchObject({ status: 'BLOCKED_AMBIGUOUS', retryable: false })
    expect(result.issues.map(issue => issue.kind).sort()).toEqual(['DUPLICATE_INPUT', 'INVALID_ROW'])
  })

  it('rejects invalid JSON and files above the V1 maximum', async () => {
    const { service } = setup()
    await expect(service.importJson('{not json')).rejects.toMatchObject({ code: 'INVALID_JSON' } satisfies Partial<DestinationBatchImportError>)
    await expect(service.importJson(JSON.stringify({ batch: { name: 'too many' }, destinations: Array.from({ length: 51 }, () => ({ name: 'A', country: 'España' })) })))
      .rejects.toMatchObject({ code: 'MAX_DESTINATIONS' } satisfies Partial<DestinationBatchImportError>)
  })

  it('replays the same normalized import without duplicating jobs, even if row order changes', async () => {
    const { service, repository } = setup()
    const first = await service.importJson(fixture())
    const reordered = JSON.parse(fixture()) as { batch: { name: string }; destinations: unknown[] }
    reordered.destinations.reverse()
    const replay = await service.importJson(JSON.stringify(reordered))
    expect(replay.idempotentReplay).toBe(true)
    expect(replay.batch.id).toBe(first.batch.id)
    expect((await repository.listJobs(first.batch.id)).length).toBe(8)
  })

  it('marks delivered content reusable and never queues it again', async () => {
    const { service, repository } = setup()
    repository.seedExisting(TOLEDO_ID, { hasApprovedContent: true, hasDeliveredContent: true })
    const result = await service.importJson(JSON.stringify({ batch: { name: 'delivered' }, destinations: [{ name: 'Toledo', country: 'España' }] }))
    expect(result.jobs[0]).toMatchObject({ identityState: 'EXISTS_DELIVERED', reusePolicy: 'CAN_REUSE_EXISTING', status: 'REUSED' })
  })

  it('keeps a failed job isolated and makes retry resume its recorded phase', async () => {
    const { service, repository } = setup()
    const result = await service.importJson(fixture())
    const queued = result.jobs.find(job => job.status === 'QUEUED')!
    const another = result.jobs.find(job => job.status === 'QUEUED' && job.id !== queued.id)!
    await repository.updateJob({ ...queued, status: 'FAILED', currentPhase: 'ANALYSIS', attemptCount: 2, lastFailure: 'fixture failure', retryable: true, updatedAt: new Date() })
    const retried = await service.retry(queued.id)
    expect(retried.resumedPhase).toBe('ANALYSIS')
    expect(retried.job).toMatchObject({ status: 'QUEUED', currentPhase: 'ANALYSIS', attemptCount: 2, retryable: true })
    expect(await repository.getJob(another.id)).toMatchObject({ status: 'QUEUED' })
  })

  it('exposes a durable read model to a later service instance', async () => {
    const { service, repository } = setup()
    const imported = await service.importJson(fixture())
    const later = new DestinationBatchService(repository, new GeographicResolver(new MemoryGeographyCatalogRepository([]), 'fixture-v1'))
    const read = await later.read(imported.batch.id)
    expect(read.batch.importFingerprint).toBe(imported.batch.importFingerprint)
    expect(read.countsByStatus.QUEUED).toBe(6)
    expect(read.issues).toHaveLength(2)
  })

  it('keeps original names while deriving deterministic normalized identities', async () => {
    const { service } = setup()
    const result = await service.importJson(JSON.stringify({ batch: { name: 'normalization' }, destinations: [{ name: '  Córdoba  ', country: ' España ', region: ' Andalucía ' }] }))
    expect(result.jobs[0]).toMatchObject({ originalName: 'Córdoba', normalizedIdentity: 'cordoba|ES|andalucia' })
  })
})
