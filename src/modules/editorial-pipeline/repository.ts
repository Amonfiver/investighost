import type {
  ResearchDestinationResult,
  ResearchStage,
} from '@shared/editorial-contracts'

export type EditorialRepositoryErrorCode =
  | 'NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'VERSION_CONFLICT'
  | 'LOCKED'
  | 'PERSISTENCE_ERROR'

export class EditorialRepositoryError extends Error {
  constructor(
    readonly code: EditorialRepositoryErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'EditorialRepositoryError'
  }
}

export interface EditorialResearchSummary {
  requestId: string
  destinationId: string
  destinationQuery: string
  profiles: Array<'adventure' | 'student'>
  state: ResearchDestinationResult['request']['state']
  version: number
  createdAt: Date
  updatedAt: Date
}

export interface EditorialStageCheckpoint {
  id: string
  requestId: string
  runId: string
  stage: ResearchStage
  attempt: number
  snapshot: Record<string, unknown>
  snapshotHash: string
  createdAt: Date
}

export interface EditorialResearchRepository {
  save(result: ResearchDestinationResult): Promise<void>
  getByRequestId(requestId: string): Promise<ResearchDestinationResult | null>
  findByIdempotencyKey(idempotencyKey: string): Promise<ResearchDestinationResult | null>
  list(limit?: number): Promise<EditorialResearchSummary[]>
  saveCheckpoint(checkpoint: EditorialStageCheckpoint): Promise<void>
  getLatestCheckpoint(requestId: string): Promise<EditorialStageCheckpoint | null>
  acquireExecutionLock(requestId: string, lockToken: string, expiresAt: Date, ownerProcess: string): Promise<boolean>
  releaseExecutionLock(requestId: string, lockToken: string): Promise<boolean>
}
