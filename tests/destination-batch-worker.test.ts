import { describe, expect, it } from 'vitest'
import { GeographicResolver, MemoryGeographyCatalogRepository } from '@modules/editorial-pipeline/geography'
import {
  BatchWorkerPhaseError,
  DestinationBatchService,
  EditorialBatchWorker,
  MemoryDestinationBatchRepository,
  type BatchEditorialPhaseContext,
  type BatchEditorialPhasePort,
} from '@modules/factory-batches'

const phases = ['IDENTITY', 'RESEARCH', 'ANALYSIS', 'STUDENT', 'ADVENTURE', 'VISUALS', 'AUTO_REVIEW'] as const

class FixturePhasePort implements BatchEditorialPhasePort {
  readonly calls: string[] = []
  private readonly attempts = new Map<string, number>()
  constructor(private readonly behavior: Record<string, 'success' | 'transient-analysis' | 'terminal-student'> = {}, private readonly phaseCost = 0.1) {}
  async run(context: BatchEditorialPhaseContext) {
    const key = `${context.job.originalName}:${context.phase}`
    this.calls.push(key)
    const attempt = (this.attempts.get(key) ?? 0) + 1
    this.attempts.set(key, attempt)
    if (this.behavior[context.job.originalName] === 'transient-analysis' && context.phase === 'ANALYSIS' && attempt === 1) {
      throw new BatchWorkerPhaseError('NETWORK_TIMEOUT', 'TRANSIENT', 'fixture transient analysis')
    }
    if (this.behavior[context.job.originalName] === 'terminal-student' && context.phase === 'STUDENT') {
      throw new BatchWorkerPhaseError('INSUFFICIENT_EVIDENCE', 'TERMINAL', 'fixture terminal evidence failure')
    }
    return {
      artifactRef: `${context.job.id}:${context.phase}:v1`,
      actualCost: this.phaseCost,
      ...(context.phase === 'VISUALS' ? { visualReviewState: 'READY_FOR_HUMAN_VISUAL_REVIEW' as const } : {}),
    }
  }
}

async function fixture(maxCostPerDestination?: number, maxCostPerBatch?: number) {
  const repository = new MemoryDestinationBatchRepository()
  const service = new DestinationBatchService(repository, new GeographicResolver(new MemoryGeographyCatalogRepository([]), 'fixture-v1'))
  const imported = await service.importJson(JSON.stringify({
    batch: { name: `worker-${maxCostPerDestination ?? 'none'}-${maxCostPerBatch ?? 'none'}`, ...(maxCostPerDestination === undefined ? {} : { maxCostPerDestination }), ...(maxCostPerBatch === undefined ? {} : { maxCostPerBatch }) },
    destinations: [
      { name: 'Éxito', country: 'España' }, { name: 'Transitorio', country: 'España' },
      { name: 'Terminal', country: 'España' }, { name: 'Reutilizado', country: 'España' },
    ],
  }))
  const reused = imported.jobs.find(job => job.originalName === 'Reutilizado')!
  await repository.updateJob({ ...reused, status: 'REUSED', reusePolicy: 'CAN_REUSE_EXISTING', retryable: false, updatedAt: new Date() })
  return { repository, service, batch: imported.batch, jobs: imported.jobs }
}

describe('EditorialBatchWorker', () => {
  it('claims one job at a time and progresses durable artifacts to READY_FOR_REVIEW', async () => {
    const { repository, batch, jobs } = await fixture()
    const port = new FixturePhasePort({ Transitorio: 'transient-analysis', Terminal: 'terminal-student' })
    const worker = new EditorialBatchWorker(repository, port, { workerId: 'fixture-worker' })
    const results = await worker.runBatch(batch.id)
    const success = await repository.getJob(jobs.find(job => job.originalName === 'Éxito')!.id)
    const transient = await repository.getJob(jobs.find(job => job.originalName === 'Transitorio')!.id)
    const terminal = await repository.getJob(jobs.find(job => job.originalName === 'Terminal')!.id)
    const reused = await repository.getJob(jobs.find(job => job.originalName === 'Reutilizado')!.id)
    expect(results).toHaveLength(3)
    expect(success).toMatchObject({ status: 'READY_FOR_REVIEW', completedPhases: phases, actualCost: 0.7 })
    expect(success?.artifactRefs.visualReviewState).toBe('READY_FOR_HUMAN_VISUAL_REVIEW')
    expect(transient).toMatchObject({ status: 'FAILED', currentPhase: 'ANALYSIS', retryable: true, completedPhases: ['IDENTITY', 'RESEARCH'] })
    expect(terminal).toMatchObject({ status: 'FAILED', currentPhase: 'STUDENT', retryable: false, completedPhases: ['IDENTITY', 'RESEARCH', 'ANALYSIS'] })
    expect(reused).toMatchObject({ status: 'REUSED' })
    expect(port.calls.some(value => value.startsWith('Reutilizado:'))).toBe(false)
  })

  it('retries only the failed phase and does not duplicate completed research or analysis', async () => {
    const { repository, service, batch, jobs } = await fixture()
    const port = new FixturePhasePort({ Transitorio: 'transient-analysis' })
    const worker = new EditorialBatchWorker(repository, port, { workerId: 'fixture-worker' })
    const target = jobs.find(job => job.originalName === 'Transitorio')!
    await worker.runJob(target.id)
    await service.retry(target.id)
    const retried = await worker.runJob(target.id)
    expect(retried.job).toMatchObject({ status: 'READY_FOR_REVIEW', attemptCount: 2, completedPhases: phases })
    expect(port.calls.filter(value => value === 'Transitorio:RESEARCH')).toHaveLength(1)
    expect(port.calls.filter(value => value === 'Transitorio:ANALYSIS')).toHaveLength(2)
    expect(await repository.totalActualCost(batch.id)).toBeCloseTo(0.7)
  })

  it('recovers stale processing leases and resumes from the persisted phase after restart', async () => {
    const { repository, batch, jobs } = await fixture()
    const now = new Date('2026-09-23T10:00:00.000Z')
    const target = jobs.find(job => job.originalName === 'Éxito')!
    const claimed = await repository.claimJob(target.id, 'dead-worker', 1, now)
    await repository.updateJob({ ...claimed!, completedPhases: ['IDENTITY', 'RESEARCH'], currentPhase: 'ANALYSIS', artifactRefs: { IDENTITY: 'identity', RESEARCH: 'research' }, actualCost: 0.2, updatedAt: now })
    const port = new FixturePhasePort()
    const restarted = new EditorialBatchWorker(repository, port, { workerId: 'new-worker', now: () => new Date('2026-09-23T10:01:00.000Z') })
    const result = await restarted.runNextBatchJob(batch.id)
    expect(result.job).toMatchObject({ status: 'READY_FOR_REVIEW', completedPhases: phases, attemptCount: 2 })
    expect(port.calls).not.toContain('Éxito:IDENTITY')
    expect(port.calls).not.toContain('Éxito:RESEARCH')
    expect(port.calls).toContain('Éxito:ANALYSIS')
  })

  it('stops a batch safely at its durable batch cost limit and leaves later work queued', async () => {
    const { repository, batch, jobs } = await fixture(undefined, 0.15)
    const worker = new EditorialBatchWorker(repository, new FixturePhasePort({}, 0.1), { workerId: 'budget-worker' })
    const first = await worker.runNextBatchJob(batch.id)
    const next = await worker.runNextBatchJob(batch.id)
    expect(first.job).toMatchObject({ status: 'QUEUED', completedPhases: ['IDENTITY'], lastFailure: 'BATCH_COST_LIMIT_REACHED' })
    expect(next).toMatchObject({ processed: false, budgetBlocked: true })
    expect(await repository.getJob(jobs.find(job => job.originalName === 'Transitorio')!.id)).toMatchObject({ status: 'QUEUED' })
  })

  it('enforces per-destination cost limits without blocking another job', async () => {
    const { repository, jobs } = await fixture(0.05)
    const worker = new EditorialBatchWorker(repository, new FixturePhasePort({}, 0.1), { workerId: 'cost-worker' })
    await worker.runJob(jobs.find(job => job.originalName === 'Éxito')!.id)
    const next = await worker.runJob(jobs.find(job => job.originalName === 'Transitorio')!.id)
    expect(next.job).toMatchObject({ status: 'FAILED', retryable: false, lastFailure: expect.stringContaining('DESTINATION_COST_LIMIT_REACHED') })
    expect(await repository.getJob(jobs.find(job => job.originalName === 'Terminal')!.id)).toMatchObject({ status: 'QUEUED' })
  })

  it('is idempotent for a READY_FOR_REVIEW job and refuses a concurrent second claim', async () => {
    const { repository, batch, jobs } = await fixture()
    const port = new FixturePhasePort()
    const first = new EditorialBatchWorker(repository, port, { workerId: 'one' })
    const second = new EditorialBatchWorker(repository, port, { workerId: 'two' })
    const target = jobs.find(job => job.originalName === 'Éxito')!
    const [one, two] = await Promise.all([first.runJob(target.id), second.runJob(target.id)])
    expect([one.processed, two.processed].filter(Boolean)).toHaveLength(1)
    const calls = port.calls.length
    await first.runJob(target.id)
    expect(port.calls).toHaveLength(calls)
    expect(await repository.getJob(target.id)).toMatchObject({ status: 'READY_FOR_REVIEW' })
    expect(await repository.totalActualCost(batch.id)).toBeCloseTo(0.7)
  })
})
