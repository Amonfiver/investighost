import { randomUUID } from 'node:crypto'
import {
  DestinationBatchJobSchema,
  type DestinationBatch,
  type DestinationBatchJob,
  type DestinationJobPhase,
} from '@shared/factory-batch-contracts'
import type { DestinationBatchRepository } from './contracts'
import { BatchWorkerPhaseError, classifyBatchWorkerError, type BatchEditorialPhasePort } from './editorial-phase-port'

const workerPhases = ['IDENTITY', 'RESEARCH', 'ANALYSIS', 'STUDENT', 'ADVENTURE', 'VISUALS', 'AUTO_REVIEW'] as const

export type BatchWorkerRunResult = {
  job: DestinationBatchJob | null
  processed: boolean
  budgetBlocked?: boolean
}

export type BatchWorkerOptions = {
  workerId?: string
  leaseMs?: number
  now?: () => Date
}

/** A concurrency-one, lease-backed orchestrator. Provider work stays in the injected phase port. */
export class EditorialBatchWorker {
  private readonly workerId: string
  private readonly leaseMs: number
  private readonly now: () => Date

  constructor(
    private readonly repository: DestinationBatchRepository,
    private readonly phases: BatchEditorialPhasePort,
    options: BatchWorkerOptions = {},
  ) {
    this.workerId = options.workerId ?? `factory-worker-${randomUUID()}`
    this.leaseMs = options.leaseMs ?? 60_000
    this.now = options.now ?? (() => new Date())
  }

  async runNextBatchJob(batchId: string): Promise<BatchWorkerRunResult> {
    await this.repository.recoverStaleClaims(this.now())
    const batch = await this.requireBatch(batchId)
    if (await this.batchBudgetReached(batch)) return { job: null, processed: false, budgetBlocked: true }
    if ((await this.repository.listJobs(batchId)).some(job => job.status === 'QUEUED' && job.lastFailure === 'BATCH_COST_LIMIT_REACHED')) {
      return { job: null, processed: false, budgetBlocked: true }
    }
    const claimed = await this.repository.claimNextJob(batchId, this.workerId, this.leaseMs, this.now())
    if (!claimed) return { job: null, processed: false }
    return { job: await this.executeClaimed(batch, claimed), processed: true }
  }

  async runBatch(batchId: string): Promise<BatchWorkerRunResult[]> {
    const results: BatchWorkerRunResult[] = []
    let acceptingWork = true
    while (acceptingWork) {
      const result = await this.runNextBatchJob(batchId)
      if (!result.processed) {
        acceptingWork = false
        if (results.length === 0) results.push(result)
      } else results.push(result)
    }
    return results
  }

  async runJob(jobId: string): Promise<BatchWorkerRunResult> {
    await this.repository.recoverStaleClaims(this.now())
    const existing = await this.repository.getJob(jobId)
    if (!existing || !['QUEUED', 'REDO_REQUIRED'].includes(existing.status)) return { job: existing, processed: false }
    const batch = await this.requireBatch(existing.batchId)
    if (await this.batchBudgetReached(batch)) return { job: existing, processed: false, budgetBlocked: true }
    const claimed = await this.repository.claimJob(jobId, this.workerId, this.leaseMs, this.now())
    if (!claimed) return { job: await this.repository.getJob(jobId), processed: false }
    return { job: await this.executeClaimed(batch, claimed), processed: true }
  }

  private async executeClaimed(batch: DestinationBatch, claimed: DestinationBatchJob): Promise<DestinationBatchJob> {
    const token = claimed.claimToken
    if (!token) throw new Error('DESTINATION_BATCH_CLAIM_TOKEN_REQUIRED')
    let job = claimed
    try {
      for (const phase of workerPhases) {
        if (job.completedPhases.includes(phase)) continue
        job = await this.renew(job, token)
        job = DestinationBatchJobSchema.parse({ ...job, currentPhase: phase, updatedAt: this.now() })
        job = await this.repository.updateJob(job)
        const result = await this.phases.run({ batch, job, phase })
        const phaseCost = Math.max(0, result.actualCost ?? 0)
        const nextCost = job.actualCost + phaseCost
        if (batch.maxCostPerDestination !== null && nextCost > batch.maxCostPerDestination) {
          throw new BatchWorkerPhaseError('DESTINATION_COST_LIMIT_REACHED', 'TERMINAL', 'El trabajo alcanzó su límite de coste antes de completar la fase.')
        }
        const batchCost = await this.repository.totalActualCost(batch.id)
        if (batch.maxCostPerBatch !== null && batchCost + phaseCost > batch.maxCostPerBatch) {
          throw new BatchBudgetStopError()
        }
        const refs = { ...job.artifactRefs }
        if (result.artifactRef) refs[phase] = result.artifactRef
        if (result.artifactKey && phase === 'STUDENT') refs.STUDENT_ARTIFACT_KEY = result.artifactKey
        if (result.artifactKey && phase === 'ADVENTURE') refs.ADVENTURE_ARTIFACT_KEY = result.artifactKey
        if (phase === 'VISUALS' && result.visualReviewState) refs.visualReviewState = result.visualReviewState
        const completedPhases = [...job.completedPhases, phase] as DestinationJobPhase[]
        const nextPhase = workerPhases[workerPhases.indexOf(phase) + 1] ?? 'AUTO_REVIEW'
        job = DestinationBatchJobSchema.parse({
          ...job, artifactRefs: refs, completedPhases, actualCost: nextCost,
          currentPhase: nextPhase, updatedAt: this.now(),
        })
        job = await this.repository.updateJob(job)
      }
      const completedRedoOperation = job.redoOperationId
      const released = await this.repository.releaseClaim(DestinationBatchJobSchema.parse({
        ...job, status: 'READY_FOR_REVIEW', currentPhase: 'AUTO_REVIEW', retryable: false,
        redoOperationId: undefined, redoScope: undefined, lastFailure: undefined, updatedAt: this.now(),
      }), token)
      if (completedRedoOperation) await this.repository.completeRedo(completedRedoOperation, 'COMPLETED', this.now())
      return released
    } catch (error) {
      if (error instanceof BatchBudgetStopError) {
        return this.repository.releaseClaim(DestinationBatchJobSchema.parse({
          ...job, status: 'QUEUED', retryable: true, lastFailure: error.code, updatedAt: this.now(),
        }), token)
      }
      const classified = classifyBatchWorkerError(error)
      const failedRedoOperation = job.redoOperationId
      const released = await this.repository.releaseClaim(DestinationBatchJobSchema.parse({
        ...job, status: 'FAILED', retryable: classified.classification === 'TRANSIENT',
        lastFailure: `${classified.code}: ${classified.message}`.slice(0, 2000), updatedAt: this.now(),
      }), token)
      if (failedRedoOperation) await this.repository.completeRedo(failedRedoOperation, 'FAILED', this.now())
      return released
    }
  }

  private async renew(job: DestinationBatchJob, token: string): Promise<DestinationBatchJob> {
    const renewed = await this.repository.renewClaim(job.id, token, this.leaseMs, this.now())
    if (!renewed) throw new BatchWorkerPhaseError('CLAIM_LOST', 'TRANSIENT', 'El lease del trabajo ya no pertenece a este worker.')
    return renewed
  }

  private async requireBatch(batchId: string): Promise<DestinationBatch> {
    const batch = await this.repository.getBatch(batchId)
    if (!batch) throw new Error('DESTINATION_BATCH_NOT_FOUND')
    return batch
  }

  private async batchBudgetReached(batch: DestinationBatch): Promise<boolean> {
    return batch.maxCostPerBatch !== null && await this.repository.totalActualCost(batch.id) >= batch.maxCostPerBatch
  }
}

class BatchBudgetStopError extends Error {
  readonly code = 'BATCH_COST_LIMIT_REACHED'
  constructor() { super('El lote alcanzó su límite de coste; el trabajo queda en cola sin repetir fases completadas.') }
}
