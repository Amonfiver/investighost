import { createHash } from 'node:crypto'
import { ResearchDestinationResultSchema, type ResearchDestinationResult, type ResearchEvent } from '@shared/editorial-contracts'
import {
  EditorialRepositoryError,
  type EditorialResearchRepository,
  type EditorialResearchSummary,
  type EditorialDraftVersionSummary,
  type EditorialExecutionControl,
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
  private readonly controls = new Map<string, EditorialExecutionControl>()
  private readonly runs = new Map<string, EditorialExecutionScaffold['run']>()
  private readonly events = new Map<string, ResearchEvent>()

  async saveScaffold(scaffold: EditorialExecutionScaffold): Promise<void> {
    this.scaffolds.set(scaffold.request.id, structuredClone(scaffold))
    this.runs.set(scaffold.run.id, structuredClone(scaffold.run))
  }

  async updateExecution(request: EditorialExecutionScaffold['request'], run: EditorialExecutionScaffold['run']): Promise<void> {
    const scaffold = this.scaffolds.get(request.id)
    if (scaffold) this.scaffolds.set(request.id, structuredClone({ ...scaffold, request, run }))
    this.runs.set(run.id, structuredClone(run))
  }

  async getScaffold(requestId: string): Promise<EditorialExecutionScaffold | null> {
    const scaffold = this.scaffolds.get(requestId)
    return scaffold ? structuredClone(scaffold) : null
  }

  async findScaffoldByIdempotencyKey(idempotencyKey: string): Promise<EditorialExecutionScaffold | null> {
    const scaffold = [...this.scaffolds.values()].find(item => item.request.idempotencyKey === idempotencyKey)
    return scaffold ? structuredClone(scaffold) : null
  }

  async listRuns(requestId: string): Promise<EditorialExecutionScaffold['run'][]> {
    return [...this.runs.values()].filter(run => run.requestId === requestId)
      .sort((left, right) => left.attempt - right.attempt)
      .map(run => structuredClone(run))
  }

  async saveExecutionControl(control: EditorialExecutionControl): Promise<void> {
    this.controls.set(control.requestId, structuredClone(control))
  }

  async getExecutionControl(requestId: string): Promise<EditorialExecutionControl | null> {
    const control = this.controls.get(requestId)
    return control ? structuredClone(control) : null
  }

  async appendEvents(events: ResearchEvent[]): Promise<void> {
    for (const event of events) this.events.set(event.id, structuredClone(event))
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
    this.runs.set(result.run.id, structuredClone(result.run))
    for (const run of result.previousRuns) this.runs.set(run.id, structuredClone(run))
    for (const event of result.events) this.events.set(event.id, structuredClone(event))
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
    const snapshot = JSON.parse(JSON.stringify(result)) as Record<string, unknown>
    this.checkpoints.set(`${result.run.id}:${result.run.stage}:${result.run.attempt}`, {
      id: deterministicUuid(`${result.run.id}:${result.run.stage}:${result.run.attempt}:aggregate`),
      requestId: result.request.id,
      runId: result.run.id,
      stage: result.run.stage,
      attempt: result.run.attempt,
      snapshot,
      snapshotHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
      createdAt: result.request.updatedAt,
    })
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

  async getStageCheckpoint(requestId: string, stage: EditorialStageCheckpoint['stage'], attempt?: number): Promise<EditorialStageCheckpoint | null> {
    const checkpoints = [...this.checkpoints.values()]
      .filter(checkpoint => checkpoint.requestId === requestId && checkpoint.stage === stage && (attempt === undefined || checkpoint.attempt === attempt))
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

  async renewExecutionLock(requestId: string, lockToken: string, expiresAt: Date): Promise<boolean> {
    const existing = this.locks.get(requestId)
    if (!existing || existing.token !== lockToken || existing.expiresAt <= new Date()) return false
    existing.expiresAt = new Date(expiresAt)
    return true
  }

  private checkpointKey(checkpoint: EditorialStageCheckpoint): string {
    return `${checkpoint.runId}:${checkpoint.stage}:${checkpoint.attempt}`
  }
}

function deterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4]
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`
}
