import { ResearchDestinationResultSchema, type ResearchDestinationResult } from '@shared/editorial-contracts'
import {
  EditorialRepositoryError,
  type EditorialResearchRepository,
  type EditorialResearchSummary,
  type EditorialDraftVersionSummary,
  type EditorialExecutionScaffold,
  type EditorialStageCheckpoint,
} from './repository'

interface MemoryLock {
  token: string
  expiresAt: Date
  ownerProcess: string
}

export class MemoryEditorialResearchRepository implements EditorialResearchRepository {
  private readonly results = new Map<string, ResearchDestinationResult>()
  private readonly requestByIdempotencyKey = new Map<string, string>()
  private readonly checkpoints = new Map<string, EditorialStageCheckpoint>()
  private readonly locks = new Map<string, MemoryLock>()
  private readonly scaffolds = new Map<string, EditorialExecutionScaffold>()
  private readonly draftVersions = new Map<string, EditorialDraftVersionSummary>()

  async saveScaffold(scaffold: EditorialExecutionScaffold): Promise<void> {
    this.scaffolds.set(scaffold.request.id, structuredClone(scaffold))
  }

  async updateExecution(request: EditorialExecutionScaffold['request'], run: EditorialExecutionScaffold['run']): Promise<void> {
    const scaffold = this.scaffolds.get(request.id)
    if (scaffold) this.scaffolds.set(request.id, structuredClone({ ...scaffold, request, run }))
  }

  async save(candidate: ResearchDestinationResult): Promise<void> {
    const result = ResearchDestinationResultSchema.parse(candidate)
    const indexedRequestId = this.requestByIdempotencyKey.get(result.request.idempotencyKey)
    if (indexedRequestId && indexedRequestId !== result.request.id) {
      throw new EditorialRepositoryError('IDEMPOTENCY_CONFLICT', 'La idempotency key pertenece a otra solicitud')
    }

    const existing = this.results.get(result.request.id)
    if (existing && result.request.version < existing.request.version) {
      throw new EditorialRepositoryError('VERSION_CONFLICT', 'La versión de solicitud es anterior a la persistida')
    }

    this.results.set(result.request.id, structuredClone(result))
    this.requestByIdempotencyKey.set(result.request.idempotencyKey, result.request.id)
    this.scaffolds.set(result.request.id, structuredClone({ destination: result.destination, request: result.request, run: result.run }))
    for (const { draft } of result.drafts) {
      this.draftVersions.set(draft.id, {
        id: draft.id,
        requestId: draft.requestId,
        profile: draft.profile,
        title: draft.title,
        contentVersion: draft.contentVersion,
        state: draft.state,
        previousDraftId: draft.previousDraftId,
        reason: draft.regenerationReason,
        humanEdited: draft.humanEdited,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      })
    }
  }

  async getByRequestId(requestId: string): Promise<ResearchDestinationResult | null> {
    const result = this.results.get(requestId)
    return result ? structuredClone(result) : null
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<ResearchDestinationResult | null> {
    const requestId = this.requestByIdempotencyKey.get(idempotencyKey)
    return requestId ? this.getByRequestId(requestId) : null
  }

  async list(limit = 100): Promise<EditorialResearchSummary[]> {
    return [...this.scaffolds.values()]
      .sort((left, right) => right.request.updatedAt.getTime() - left.request.updatedAt.getTime())
      .slice(0, limit)
      .map(scaffold => ({
        requestId: scaffold.request.id,
        destinationId: scaffold.request.destinationId,
        destinationQuery: scaffold.request.destinationQuerySnapshot,
        profiles: [...scaffold.request.profiles],
        state: scaffold.request.state,
        version: scaffold.request.version,
        stage: scaffold.run.stage,
        runState: scaffold.run.state,
        errorCode: scaffold.run.errorCode,
        errorMessage: scaffold.run.errorMessage,
        actualCost: scaffold.run.actualCost,
        currency: scaffold.run.currency,
        createdAt: new Date(scaffold.request.createdAt),
        updatedAt: new Date(scaffold.request.updatedAt),
      }))
  }

  async listDraftVersions(requestId: string): Promise<EditorialDraftVersionSummary[]> {
    return [...this.draftVersions.values()]
      .filter(draft => draft.requestId === requestId)
      .sort((left, right) => right.contentVersion - left.contentVersion || left.profile.localeCompare(right.profile))
      .map(draft => structuredClone(draft))
  }

  async saveCheckpoint(checkpoint: EditorialStageCheckpoint): Promise<void> {
    this.checkpoints.set(this.checkpointKey(checkpoint), structuredClone(checkpoint))
  }

  async getLatestCheckpoint(requestId: string): Promise<EditorialStageCheckpoint | null> {
    const checkpoints = [...this.checkpoints.values()]
      .filter(checkpoint => checkpoint.requestId === requestId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    return checkpoints[0] ? structuredClone(checkpoints[0]) : null
  }

  async acquireExecutionLock(requestId: string, lockToken: string, expiresAt: Date, ownerProcess: string): Promise<boolean> {
    const existing = this.locks.get(requestId)
    if (existing && existing.expiresAt > new Date() && existing.token !== lockToken) return false
    this.locks.set(requestId, { token: lockToken, expiresAt: new Date(expiresAt), ownerProcess })
    return true
  }

  async releaseExecutionLock(requestId: string, lockToken: string): Promise<boolean> {
    const existing = this.locks.get(requestId)
    if (!existing || existing.token !== lockToken) return false
    this.locks.delete(requestId)
    return true
  }

  private checkpointKey(checkpoint: EditorialStageCheckpoint): string {
    return `${checkpoint.runId}:${checkpoint.stage}:${checkpoint.attempt}`
  }
}
