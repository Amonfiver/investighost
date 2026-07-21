import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { GeographicEntitySchema, type GeographicEntity, type ResearchStage } from '@shared/editorial-contracts'
import { GeographicResolver, MemoryGeographyCatalogRepository, type GeographicCatalogEntry } from '@modules/editorial-pipeline/geography'
import {
  createManualMockProviders,
  ManualResearchService,
  type ManualPipelineProviders,
  type ManualWorkflowDependencies,
} from '@modules/editorial-pipeline/manual-workflow'
import { MemoryEditorialResearchRepository } from '@modules/editorial-pipeline/memory-repository'
import type { EditorialStageCheckpoint } from '@modules/editorial-pipeline/repository'

const actorId = '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
const now = new Date('2026-07-21T14:00:00.000Z')

function catalog(): GeographicCatalogEntry[] {
  const country = GeographicEntitySchema.parse({
    id: '70000000-0000-4000-8000-000000000001', type: 'country', name: 'España', normalizedName: 'espana',
    aliases: ['España', 'Spain'], countryCode: 'ES', slug: 'espana', sourceName: 'GeoNames',
    sourceVersion: 'geonames-2026-07-20', sourceLicense: 'Creative Commons Attribution 4.0', status: 'active',
    resolutionMethod: 'exact', ambiguityCandidateIds: [], version: 1, createdAt: now, updatedAt: now,
  })
  const region = GeographicEntitySchema.parse({
    ...country, id: '70000000-0000-4000-8000-000000000002', parentId: country.id, type: 'region',
    name: 'Comunitat Valenciana', normalizedName: 'comunitat valenciana', aliases: ['Valencia'], regionCode: '60',
    slug: 'comunitat-valenciana',
  })
  const morella = GeographicEntitySchema.parse({
    ...region, id: '70000000-0000-4000-8000-000000000003', parentId: region.id, type: 'locality',
    name: 'Morella', normalizedName: 'morella', aliases: ['Morella', 'Morella, España'], slug: 'morella',
    externalIds: { geonames: '3116121' },
  })
  const node = (entity: GeographicEntity) => ({
    id: entity.id, type: entity.type, name: entity.name, normalizedName: entity.normalizedName,
    countryCode: entity.countryCode, regionCode: entity.regionCode,
  })
  return [
    { entity: country, hierarchy: [] },
    { entity: region, hierarchy: [node(country)] },
    { entity: morella, hierarchy: [node(country), node(region)] },
  ]
}

function setup(
  repository = new MemoryEditorialResearchRepository(),
  dependencies: ManualWorkflowDependencies = {},
) {
  const service = new ManualResearchService(
    repository,
    new GeographicResolver(new MemoryGeographyCatalogRepository(catalog()), 'geonames-2026-07-20'),
    { now: () => now, id: randomUUID, ownerProcess: 'manual-resilience-test', retryBackoffMs: [0], ...dependencies },
  )
  return { repository, service }
}

function input(overrides: Partial<ReturnType<typeof baseInput>> = {}) {
  return { ...baseInput(), ...overrides }
}

function baseInput() {
  return {
    destinationQuery: 'Morella', countryCode: 'ES', destinationType: 'locality' as const,
    profiles: ['adventure', 'student'] as const, language: 'es', depth: 'standard' as const,
    notes: 'Prueba sintética de resiliencia', budgetLimit: 2, maxAttempts: 3,
    idempotencyKey: randomUUID(), actorId,
  }
}

function unavailableProviders(destination: GeographicEntity): ManualPipelineProviders {
  const providers = createManualMockProviders(destination)
  return {
    ...providers,
    source: {
      id: 'unavailable-source-provider', model: 'failure-fixture-v1', simulation: true,
      discover: async () => { throw Object.assign(new Error('Proveedor no disponible'), { code: 'PROVIDER_UNAVAILABLE' }) },
      read: request => providers.source.read(request),
      evaluate: request => providers.source.evaluate(request),
    },
  }
}

describe('Manual resilience, cost and idempotency gate', () => {
  it('exposes reproducible acceptance fixtures for insufficient, broken and unavailable sources', async () => {
    const insufficient = setup()
    await expect(insufficient.service.start(input({ simulationScenario: 'insufficient_sources' })))
      .rejects.toMatchObject({ code: 'NO_ACCEPTED_SOURCES' })
    expect((await insufficient.repository.list())[0]).toMatchObject({ state: 'failed', errorCode: 'NO_ACCEPTED_SOURCES' })

    const broken = await setup().service.start(input({ simulationScenario: 'broken_source' }))
    expect(broken.sources.map(source => source.status)).toEqual(expect.arrayContaining(['accepted', 'unavailable']))
    expect(broken.request.options.simulationScenario).toBe('broken_source')

    const unavailable = setup()
    await expect(unavailable.service.start(input({ simulationScenario: 'provider_unavailable' })))
      .rejects.toMatchObject({ code: 'PERMANENT' })
    const failed = (await unavailable.repository.list())[0]
    expect(failed).toMatchObject({ state: 'failed', errorCode: 'PERMANENT' })
    const retried = await unavailable.service.retry({ requestId: failed.requestId, actorId })
    expect(retried.run).toMatchObject({ attempt: 2, state: 'completed' })
    expect(await unavailable.repository.list()).toHaveLength(1)
  })

  it('persists every completed stage, including source documents without depending on Storage', async () => {
    const { repository, service } = setup()
    const result = await service.start(input())
    const stages: ResearchStage[] = ['source_reading', 'fact_structuring', 'profile_generation', 'quality_review', 'human_review']
    for (const stage of stages) expect(await repository.getStageCheckpoint(result.request.id, stage)).not.toBeNull()
    const sourceCheckpoint = await repository.getStageCheckpoint(result.request.id, 'source_reading')
    expect(sourceCheckpoint?.snapshot).toMatchObject({ kind: 'manual-sources-v1' })
    expect(sourceCheckpoint?.snapshot.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ content: expect.stringContaining('Morella') }),
    ]))
  })

  it('recovers from a provider outage with a new run and preserves the failed attempt', async () => {
    let providerFactoryCalls = 0
    const { repository, service } = setup(new MemoryEditorialResearchRepository(), {
      providers: destination => providerFactoryCalls++ === 0
        ? unavailableProviders(destination)
        : createManualMockProviders(destination),
    })
    const key = randomUUID()
    await expect(service.start(input({ idempotencyKey: key }))).rejects.toMatchObject({ code: 'PERMANENT' })
    const failed = (await repository.list())[0]
    const recovered = await service.retry({ requestId: failed.requestId, actorId })
    expect(recovered.run).toMatchObject({ attempt: 2, state: 'completed' })
    expect(recovered.previousRuns).toHaveLength(1)
    expect(recovered.previousRuns[0]).toMatchObject({ attempt: 1, state: 'failed', errorCode: 'PERMANENT' })
  })

  it('resumes after an Electron interruption without repeating completed provider stages', async () => {
    let interrupted = false
    const repository = new MemoryEditorialResearchRepository()
    const first = setup(repository, {
      beforeStage: async stage => {
        if (stage === 'quality_review' && !interrupted) {
          interrupted = true
          throw Object.assign(new Error('Electron cerrado durante la ejecución'), { code: 'ELECTRON_INTERRUPTED' })
        }
      },
    }).service
    await expect(first.start(input())).rejects.toMatchObject({ code: 'ELECTRON_INTERRUPTED' })
    const failed = (await repository.list())[0]
    const interruptedScaffold = await repository.getScaffold(failed.requestId)
    if (!interruptedScaffold) throw new Error('Falta scaffold interrumpido')
    interruptedScaffold.request.state = 'validating'
    interruptedScaffold.run.state = 'checkpointed'
    interruptedScaffold.run.errorCode = undefined
    interruptedScaffold.run.errorMessage = undefined
    interruptedScaffold.run.completedAt = undefined
    await repository.updateExecution(interruptedScaffold.request, interruptedScaffold.run)
    const restarted = setup(repository).service
    const recovered = await restarted.resume({ requestId: failed.requestId, actorId })
    expect(recovered.events.filter(event => event.type === 'manual.stage.reused').map(event => event.stage))
      .toEqual(expect.arrayContaining(['source_reading', 'fact_structuring', 'profile_generation']))
    expect(recovered.run).toMatchObject({ attempt: 1, state: 'completed' })
    expect(recovered.previousRuns).toHaveLength(0)
  })

  it('reconstructs a missing execution control after a restart between durable writes', async () => {
    class ControlWriteFailureRepository extends MemoryEditorialResearchRepository {
      fail = true
      override async saveExecutionControl(control: Parameters<MemoryEditorialResearchRepository['saveExecutionControl']>[0]): Promise<void> {
        if (this.fail) {
          this.fail = false
          throw Object.assign(new Error('Caída entre scaffold y control'), { code: 'DATABASE_UNAVAILABLE' })
        }
        return super.saveExecutionControl(control)
      }
    }
    const repository = new ControlWriteFailureRepository()
    const first = setup(repository).service
    await expect(first.start(input())).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
    const scaffold = (await repository.list())[0]
    const restarted = setup(repository).service
    const recovered = await restarted.resume({ requestId: scaffold.requestId, actorId })
    expect(recovered.request.state).toBe('completed')
    expect(await repository.getExecutionControl(scaffold.requestId)).toMatchObject({ maxAttempts: 3, budgetLimit: 2 })
  })

  it('persists a database failure and retries from the last valid checkpoint', async () => {
    class FailingRepository extends MemoryEditorialResearchRepository {
      failed = false
      override async saveCheckpoint(checkpoint: EditorialStageCheckpoint): Promise<void> {
        if (!this.failed && checkpoint.stage === 'profile_generation') {
          this.failed = true
          throw Object.assign(new Error('Base local no disponible'), { code: 'DATABASE_UNAVAILABLE' })
        }
        return super.saveCheckpoint(checkpoint)
      }
    }
    const repository = new FailingRepository()
    const { service } = setup(repository)
    await expect(service.start(input())).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
    const failed = (await repository.list())[0]
    expect(failed).toMatchObject({ state: 'failed', errorCode: 'DATABASE_UNAVAILABLE' })
    const recovered = await service.retry({ requestId: failed.requestId, actorId })
    expect(recovered.request.state).toBe('completed')
    expect(recovered.events.some(event => event.type === 'manual.stage.reused' && event.stage === 'fact_structuring')).toBe(true)
  })

  it('cancels an active execution, records the actor and releases its lock', async () => {
    let unblock: (() => void) | undefined
    const barrier = new Promise<void>(resolve => { unblock = resolve })
    const { repository, service } = setup(new MemoryEditorialResearchRepository(), {
      beforeStage: stage => stage === 'source_discovery' ? barrier : Promise.resolve(),
    })
    const startPromise = service.start(input())
    let summaries = await repository.list()
    for (let attempt = 0; summaries.length === 0 && attempt < 10; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 0))
      summaries = await repository.list()
    }
    const summary = summaries[0]
    if (!summary) throw new Error('La ejecución no llegó a persistir el scaffold')
    await service.cancel({ requestId: summary.requestId, actorId })
    unblock?.()
    await expect(startPromise).rejects.toMatchObject({ code: 'CANCELLED' })
    expect((await repository.list())[0]).toMatchObject({ state: 'cancelled', runState: 'cancelled' })
    expect((await repository.listRuns(summary.requestId))[0].cancelledBy).toBe(actorId)
  })

  it('allows only one accidental concurrent execution for the same idempotency key', async () => {
    const key = randomUUID()
    const { repository, service } = setup()
    const settled = await Promise.allSettled([
      service.start(input({ idempotencyKey: key })),
      service.start(input({ idempotencyKey: key })),
    ])
    expect(settled.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    expect(settled.filter(item => item.status === 'rejected')).toHaveLength(1)
    expect(settled.find(item => item.status === 'rejected')).toMatchObject({ reason: { code: 'ALREADY_RUNNING' } })
    expect(await repository.list()).toHaveLength(1)
  })

  it('bounds retries and keeps cumulative spend within the configured budget', async () => {
    const { repository, service } = setup(new MemoryEditorialResearchRepository(), { providers: unavailableProviders })
    await expect(service.start(input({ maxAttempts: 2 }))).rejects.toMatchObject({ code: 'PERMANENT' })
    const summary = (await repository.list())[0]
    await expect(service.retry({ requestId: summary.requestId, actorId })).rejects.toMatchObject({ code: 'PERMANENT' })
    await expect(service.retry({ requestId: summary.requestId, actorId })).rejects.toMatchObject({ code: 'ATTEMPTS_EXHAUSTED' })
    expect(await repository.listRuns(summary.requestId)).toHaveLength(2)

    const budgeted = setup()
    await expect(budgeted.service.start(input({ budgetLimit: 0.2 }))).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' })
    const budgetSummary = (await budgeted.repository.list())[0]
    const control = await budgeted.repository.getExecutionControl(budgetSummary.requestId)
    expect(control?.spentCost).toBeLessThanOrEqual(control?.budgetLimit ?? 0)
  })

  it('rejects a corrupted checkpoint instead of silently duplicating work', async () => {
    let interrupted = false
    const repository = new MemoryEditorialResearchRepository()
    const service = setup(repository, {
      beforeStage: async stage => {
        if (stage === 'quality_review' && !interrupted) {
          interrupted = true
          throw Object.assign(new Error('Interrupción sintética'), { code: 'ELECTRON_INTERRUPTED' })
        }
      },
    }).service
    await expect(service.start(input())).rejects.toMatchObject({ code: 'ELECTRON_INTERRUPTED' })
    const summary = (await repository.list())[0]
    const checkpoint = await repository.getStageCheckpoint(summary.requestId, 'source_reading')
    if (!checkpoint) throw new Error('Falta checkpoint de fuentes')
    await repository.saveCheckpoint({ ...checkpoint, snapshotHash: '0'.repeat(64) })
    await expect(service.retry({ requestId: summary.requestId, actorId })).rejects.toMatchObject({ code: 'CHECKPOINT_INVALID' })
  })
})
