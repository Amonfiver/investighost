import { ResearchDestinationResultSchema, type ResearchDestinationResult } from '@shared/editorial-contracts'
import {
  EditorialRepositoryError,
  type EditorialResearchRepository,
  type EditorialResearchSummary,
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
    return [...this.results.values()]
      .sort((left, right) => right.request.updatedAt.getTime() - left.request.updatedAt.getTime())
      .slice(0, limit)
      .map(result => ({
        requestId: result.request.id,
        destinationId: result.request.destinationId,
        destinationQuery: result.request.destinationQuerySnapshot,
        profiles: [...result.request.profiles],
        state: result.request.state,
        version: result.request.version,
        createdAt: new Date(result.request.createdAt),
        updatedAt: new Date(result.request.updatedAt),
      }))
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
