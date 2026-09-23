import type { DestinationBatch, DestinationBatchJob, DestinationJobPhase } from '@shared/factory-batch-contracts'

/**
 * Small application boundary over the already-existing real research, analysis,
 * drafting, visual and review services. The batch worker owns orchestration;
 * the injected phase implementation remains the single owner of provider calls,
 * provenance, Library revisions and the cost ledger.
 */
export interface BatchEditorialPhaseContext {
  batch: DestinationBatch
  job: DestinationBatchJob
  phase: Exclude<DestinationJobPhase, 'DELIVERY'>
}

export interface BatchEditorialPhaseResult {
  /** Durable identifier owned by the delegated module, never a duplicate blob. */
  artifactRef?: string
  /** Internal durable draft key, needed when a later redo reviews a previous
   * regenerated sibling profile. Never rendered as a user-facing identifier. */
  artifactKey?: string
  /** Cost already recorded by the delegated real-pipeline ledger for this phase. */
  actualCost?: number
  /** Visual work is reviewable locally; it is not a public Trawel media URL. */
  visualReviewState?: 'READY_FOR_HUMAN_VISUAL_REVIEW' | 'PARTIAL' | 'EMPTY'
  warnings?: string[]
}

export interface BatchEditorialPhasePort {
  run(context: BatchEditorialPhaseContext): Promise<BatchEditorialPhaseResult>
}

export type ExistingEditorialPhaseServices = {
  [Phase in Exclude<DestinationJobPhase, 'DELIVERY'>]: (context: BatchEditorialPhaseContext) => Promise<BatchEditorialPhaseResult>
}

/**
 * Production composition point. It deliberately delegates rather than
 * reimplementing Tavily, analysis routing, profile generation, visual rights
 * or automatic review. Runtime wiring supplies the existing service calls.
 */
export class DelegatingEditorialPhasePort implements BatchEditorialPhasePort {
  constructor(private readonly services: ExistingEditorialPhaseServices) {}

  run(context: BatchEditorialPhaseContext): Promise<BatchEditorialPhaseResult> {
    return this.services[context.phase](context)
  }
}

export class BatchWorkerPhaseError extends Error {
  constructor(
    readonly code: string,
    readonly classification: 'TRANSIENT' | 'TERMINAL',
    message: string,
  ) {
    super(message)
    this.name = 'BatchWorkerPhaseError'
  }
}

export function classifyBatchWorkerError(error: unknown): BatchWorkerPhaseError {
  if (error instanceof BatchWorkerPhaseError) return error
  const message = error instanceof Error ? error.message : String(error)
  const code = message.split(':')[0].trim() || 'WORKER_PHASE_FAILED'
  const transient = /(TIMEOUT|RATE_LIMIT|TEMPORARY|NETWORK|UNAVAILABLE|STORAGE_FAILURE|ECONNRESET)/i.test(code)
  return new BatchWorkerPhaseError(code, transient ? 'TRANSIENT' : 'TERMINAL', message)
}
