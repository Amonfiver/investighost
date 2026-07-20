import type {
  EditorialProfile,
  EditorialResearchRequest,
  EditorialResearchRun,
  GeographicEntity,
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
  stage?: ResearchStage
  runState?: EditorialResearchRun['state']
  errorCode?: string
  errorMessage?: string
  actualCost?: number
  currency?: string
  createdAt: Date
  updatedAt: Date
}

export interface EditorialExecutionScaffold {
  destination: GeographicEntity
  request: EditorialResearchRequest
  run: EditorialResearchRun
}

export interface EditorialDraftVersionSummary {
  id: string
  requestId: string
  profile: EditorialProfile
  title: string
  contentVersion: number
  state: ResearchDestinationResult['drafts'][number]['draft']['state']
  previousDraftId?: string
  reason?: string
  humanEdited: boolean
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
  saveScaffold(scaffold: EditorialExecutionScaffold): Promise<void>
  updateExecution(request: EditorialResearchRequest, run: EditorialResearchRun): Promise<void>
  save(result: ResearchDestinationResult): Promise<void>
  getByRequestId(requestId: string): Promise<ResearchDestinationResult | null>
  findByIdempotencyKey(idempotencyKey: string): Promise<ResearchDestinationResult | null>
  list(limit?: number): Promise<EditorialResearchSummary[]>
  listDraftVersions(requestId: string): Promise<EditorialDraftVersionSummary[]>
  saveCheckpoint(checkpoint: EditorialStageCheckpoint): Promise<void>
  getLatestCheckpoint(requestId: string): Promise<EditorialStageCheckpoint | null>
  acquireExecutionLock(requestId: string, lockToken: string, expiresAt: Date, ownerProcess: string): Promise<boolean>
  releaseExecutionLock(requestId: string, lockToken: string): Promise<boolean>
}
