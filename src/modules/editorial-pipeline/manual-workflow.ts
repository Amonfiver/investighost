import { createHash, randomUUID } from 'node:crypto'
import {
  EditorialDraftBundleSchema,
  EditorialResearchRequestSchema,
  EditorialResearchRunSchema,
  ResearchDestinationResultSchema,
  ResearchEventSchema,
  type EditorialDraftBundle,
  type EditorialResearchRequest,
  type EditorialResearchRun,
  type GeographicEntity,
  type ResearchDestinationResult,
  type ResearchEvent,
  type ResearchStage,
} from '@shared/editorial-contracts'
import {
  ManualDestinationCorrectionSchema,
  ManualDestinationQuerySchema,
  ManualDraftDecisionSchema,
  ManualDraftReviewSchema,
  ManualExecutionActionSchema,
  ManualResearchStartSchema,
  ManualSectionEditSchema,
  ManualSectionRegenerationSchema,
  type ManualDestinationCorrection,
  type ManualDestinationQuery,
  type ManualDestinationResolution,
  type ManualDraftDecision,
  type ManualDraftReview,
  type ManualExecutionAction,
  type ManualResearchStart,
  type ManualSectionEdit,
  type ManualSectionRegeneration,
  type ManualSimulationScenario,
} from '@shared/manual-contracts'
import type {
  EditorialDraftVersionSummary,
  EditorialExecutionControl,
  EditorialExecutionScaffold,
  EditorialResearchRepository,
  EditorialResearchSummary,
} from './repository'
import { GeographicResolver } from './geography'
import { MockEditorialSourceProvider } from './mock-source-provider'
import { SourceAcquisitionService, SourceProviderError, type EditorialSourceProvider } from './source-providers'
import { MockFactualStructuringProvider } from './mock-factual-provider'
import { FactualStructuringService, type FactualProposal, type FactualStructuringProvider } from './factual-structuring'
import { MockEditorialGenerationProvider } from './mock-editorial-provider'
import { EditorialGenerationService, type EditorialGenerationProvider } from './editorial-generation'
import { RevisiatorService } from './quality-review'
import {
  ManualDraftsCheckpointSchema,
  ManualFactsCheckpointSchema,
  ManualCheckpointError,
  ManualQualityCheckpointSchema,
  ManualSourcesCheckpointSchema,
  manualConfigurationHash,
  readManualCheckpoint,
  saveManualCheckpoint,
} from './manual-checkpoints'

export type ManualWorkflowErrorCode =
  | 'DESTINATION_AMBIGUOUS'
  | 'DESTINATION_NOT_FOUND'
  | 'RESEARCH_NOT_FOUND'
  | 'DRAFT_NOT_FOUND'
  | 'SECTION_NOT_FOUND'
  | 'INVALID_STATE'
  | 'QUALITY_GATE_FAILED'
  | 'INVALID_INPUT'
  | 'ALREADY_RUNNING'
  | 'ATTEMPTS_EXHAUSTED'
  | 'CANCELLED'
  | 'BUDGET_EXCEEDED'
  | 'CHECKPOINT_INVALID'

export class ManualWorkflowError extends Error {
  constructor(readonly code: ManualWorkflowErrorCode, message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'ManualWorkflowError'
  }
}

export interface ManualPipelineProviders {
  source: EditorialSourceProvider
  factual: FactualStructuringProvider
  editorial: EditorialGenerationProvider
}

export interface ManualWorkflowDependencies {
  now?: () => Date
  id?: () => string
  providers?: (destination: GeographicEntity, scenario: ManualSimulationScenario, attempt: number) => ManualPipelineProviders
  ownerProcess?: string
  sleep?: (milliseconds: number) => Promise<void>
  leaseMs?: number
  retryBackoffMs?: number[]
  beforeStage?: (stage: ResearchStage, attempt: number) => Promise<void>
}

const CONFIGURATION_VERSION = 'manual-v2'
const CONTRACT_VERSION = '3i-v1'

export class ManualResearchService {
  private readonly now: () => Date
  private readonly id: () => string
  private readonly providers: (destination: GeographicEntity, scenario: ManualSimulationScenario, attempt: number) => ManualPipelineProviders
  private readonly ownerProcess: string
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly leaseMs: number
  private readonly retryBackoffMs: number[]
  private readonly beforeStage: (stage: ResearchStage, attempt: number) => Promise<void>
  private readonly activeControllers = new Map<string, AbortController>()

  constructor(
    private readonly repository: EditorialResearchRepository,
    private readonly resolver: GeographicResolver,
    dependencies: ManualWorkflowDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date())
    this.id = dependencies.id ?? randomUUID
    this.providers = dependencies.providers ?? createManualMockProviders
    this.ownerProcess = dependencies.ownerProcess ?? `manual-electron:${process.pid}`
    this.sleep = dependencies.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
    this.leaseMs = dependencies.leaseMs ?? 30_000
    this.retryBackoffMs = dependencies.retryBackoffMs ?? [0, 250, 1_000, 3_000, 10_000]
    this.beforeStage = dependencies.beforeStage ?? (async () => undefined)
  }

  async resolveDestination(candidate: ManualDestinationQuery): Promise<ManualDestinationResolution> {
    const input = ManualDestinationQuerySchema.parse(candidate)
    return this.resolver.resolve(input)
  }

  async correctDestination(candidate: ManualDestinationCorrection): Promise<ManualDestinationResolution> {
    const input = ManualDestinationCorrectionSchema.parse(candidate)
    return this.resolver.applyHumanCorrection(input.query, {
      actorId: input.actorId,
      candidateId: input.candidateId,
      reason: input.reason,
    })
  }

  async start(candidate: ManualResearchStart): Promise<ResearchDestinationResult> {
    let input: ManualResearchStart
    try {
      input = ManualResearchStartSchema.parse(candidate)
    } catch (error) {
      throw new ManualWorkflowError('INVALID_INPUT', 'La configuración Manual no es válida', error)
    }
    const existing = await this.repository.findByIdempotencyKey(input.idempotencyKey)
    if (existing) return existing
    const existingScaffold = await this.repository.findScaffoldByIdempotencyKey(input.idempotencyKey)
    if (existingScaffold) {
      throw new ManualWorkflowError('ALREADY_RUNNING', 'La misma clave idempotente ya tiene una ejecución; usa reanudar o reintentar')
    }

    const resolution = await this.resolveDestination({
      query: input.destinationQuery,
      countryCode: input.countryCode,
      regionCode: input.regionCode,
      type: input.destinationType,
    })
    if (resolution.status === 'ambiguous') {
      throw new ManualWorkflowError('DESTINATION_AMBIGUOUS', 'El destino requiere una selección humana antes de investigar')
    }
    if (resolution.status === 'not_found') {
      throw new ManualWorkflowError('DESTINATION_NOT_FOUND', resolution.reason)
    }

    const startedAt = this.now()
    const request = EditorialResearchRequestSchema.parse({
      id: deterministicUuid(`manual-request:${input.idempotencyKey}`),
      destinationId: resolution.entity.id,
      destinationQuerySnapshot: input.destinationQuery,
      profiles: input.profiles,
      language: input.language,
      depth: input.depth,
      notes: input.notes || undefined,
      options: {
        budgetLimit: input.budgetLimit,
        maxAttempts: input.maxAttempts,
        simulation: true,
        simulationScenario: input.simulationScenario ?? 'happy_path',
      },
      configurationVersion: CONFIGURATION_VERSION,
      idempotencyKey: input.idempotencyKey,
      actorId: input.actorId,
      state: 'queued',
      version: 1,
      createdAt: startedAt,
      updatedAt: startedAt,
    })
    const run = EditorialResearchRunSchema.parse({
      id: deterministicUuid(`manual-run:${request.id}:1`),
      requestId: request.id,
      stage: 'destination_resolution',
      providerId: 'manual-mock-pipeline',
      model: 'deterministic-local-fixtures-v1',
      promptVersion: 'profiles-v1',
      contractVersion: CONTRACT_VERSION,
      attempt: 1,
      estimatedCost: 0,
      currency: 'EUR',
      inputUnits: 0,
      outputUnits: 0,
      startedAt,
      state: 'running',
      createdAt: startedAt,
      updatedAt: startedAt,
    })
    const scaffold = { destination: resolution.entity, request, run }
    try {
      await this.repository.saveScaffold(scaffold)
    } catch (error) {
      if (errorCode(error) === 'IDEMPOTENCY_CONFLICT' && await this.repository.findScaffoldByIdempotencyKey(input.idempotencyKey)) {
        throw new ManualWorkflowError('ALREADY_RUNNING', 'La investigación idempotente ya fue creada por otra ejecución', error)
      }
      throw error
    }
    await this.repository.saveExecutionControl({
      requestId: request.id,
      maxAttempts: input.maxAttempts,
      budgetLimit: input.budgetLimit,
      spentCost: 0,
      createdAt: startedAt,
      updatedAt: startedAt,
    })
    return this.execute(scaffold, [])
  }

  async resume(candidate: ManualExecutionAction): Promise<ResearchDestinationResult> {
    const input = ManualExecutionActionSchema.parse(candidate)
    const completed = await this.repository.getByRequestId(input.requestId)
    if (completed) return completed
    const scaffold = await this.repository.getScaffold(input.requestId)
    if (!scaffold) throw new ManualWorkflowError('RESEARCH_NOT_FOUND', 'No existe una ejecución Manual que reanudar')
    if (scaffold.request.state === 'failed') throw new ManualWorkflowError('INVALID_STATE', 'Una ejecución fallida requiere reintento explícito')
    if (scaffold.request.state === 'cancelled') throw new ManualWorkflowError('INVALID_STATE', 'Una ejecución cancelada no puede reanudarse')
    await this.ensureControl(scaffold.request)
    scaffold.request.state = stageRequestState(scaffold.run.stage)
    scaffold.request.updatedAt = this.now()
    scaffold.run.state = 'running'
    scaffold.run.completedAt = undefined
    scaffold.run.errorCode = undefined
    scaffold.run.errorMessage = undefined
    scaffold.run.updatedAt = scaffold.request.updatedAt
    await this.repository.updateExecution(scaffold.request, scaffold.run)
    const runs = await this.repository.listRuns(input.requestId)
    return this.execute(scaffold, runs.filter(run => run.id !== scaffold.run.id))
  }

  async retry(candidate: ManualExecutionAction): Promise<ResearchDestinationResult> {
    const input = ManualExecutionActionSchema.parse(candidate)
    const scaffold = await this.repository.getScaffold(input.requestId)
    if (!scaffold) throw new ManualWorkflowError('RESEARCH_NOT_FOUND', 'No existe una ejecución Manual que reintentar')
    if (!['failed', 'retry_pending'].includes(scaffold.request.state)) {
      throw new ManualWorkflowError('INVALID_STATE', 'Solo una ejecución fallida o pendiente admite reintento')
    }
    const control = await this.ensureControl(scaffold.request)
    if (scaffold.run.attempt >= control.maxAttempts) {
      throw new ManualWorkflowError('ATTEMPTS_EXHAUSTED', `Se alcanzó el máximo de ${control.maxAttempts} intentos`)
    }
    const delayMs = Math.max(0, control.nextRetryAt ? control.nextRetryAt.getTime() - this.now().getTime() : 0)
    if (delayMs > 0) await this.sleep(delayMs)
    const retriedAt = this.now()
    const nextAttempt = scaffold.run.attempt + 1
    const previousRuns = await this.repository.listRuns(input.requestId)
    const request = EditorialResearchRequestSchema.parse({
      ...scaffold.request,
      actorId: input.actorId,
      state: 'queued',
      version: scaffold.request.version + 1,
      updatedAt: retriedAt,
    })
    const run = EditorialResearchRunSchema.parse({
      ...scaffold.run,
      id: deterministicUuid(`manual-run:${request.id}:${nextAttempt}`),
      attempt: nextAttempt,
      stage: 'destination_resolution',
      state: 'running',
      estimatedCost: 0,
      actualCost: undefined,
      inputUnits: 0,
      outputUnits: 0,
      startedAt: retriedAt,
      completedAt: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      recoveryFromRunId: scaffold.run.id,
      cancelledBy: undefined,
      createdAt: retriedAt,
      updatedAt: retriedAt,
    })
    const nextControl: EditorialExecutionControl = {
      ...control,
      cancelRequestedAt: undefined,
      cancelledBy: undefined,
      nextRetryAt: undefined,
      lastHeartbeatAt: retriedAt,
      updatedAt: retriedAt,
    }
    const next = { destination: scaffold.destination, request, run }
    await this.repository.saveScaffold(next)
    await this.repository.saveExecutionControl(nextControl)
    return this.execute(next, previousRuns)
  }

  async cancel(candidate: ManualExecutionAction): Promise<void> {
    const input = ManualExecutionActionSchema.parse(candidate)
    const scaffold = await this.repository.getScaffold(input.requestId)
    if (!scaffold) throw new ManualWorkflowError('RESEARCH_NOT_FOUND', 'No existe una ejecución Manual que cancelar')
    if (['completed', 'cancelled'].includes(scaffold.request.state)) {
      throw new ManualWorkflowError('INVALID_STATE', 'La ejecución ya está en un estado terminal')
    }
    const control = await this.ensureControl(scaffold.request)
    const cancelledAt = this.now()
    await this.repository.saveExecutionControl({
      ...control,
      cancelRequestedAt: cancelledAt,
      cancelledBy: input.actorId,
      updatedAt: cancelledAt,
    })
    const controller = this.activeControllers.get(input.requestId)
    if (controller) {
      controller.abort()
      return
    }
    scaffold.request.state = 'cancelled'
    scaffold.request.version += 1
    scaffold.request.updatedAt = cancelledAt
    scaffold.run.state = 'cancelled'
    scaffold.run.cancelledBy = input.actorId
    scaffold.run.completedAt = cancelledAt
    scaffold.run.updatedAt = cancelledAt
    await this.repository.updateExecution(scaffold.request, scaffold.run)
    await this.repository.appendEvents([this.event(scaffold.request, scaffold.run, 'manual.execution.cancelled', scaffold.run.stage, { recovered: true })])
  }

  private async execute(scaffold: EditorialExecutionScaffold, previousRuns: EditorialResearchRun[]): Promise<ResearchDestinationResult> {
    const { destination, request, run } = scaffold
    const lockToken = this.id()
    const lockAt = this.now()
    const locked = await this.repository.acquireExecutionLock(
      request.id, lockToken, new Date(lockAt.getTime() + this.leaseMs), this.ownerProcess,
    )
    if (!locked) throw new ManualWorkflowError('ALREADY_RUNNING', 'La investigación ya está siendo ejecutada por otro proceso')
    const controller = new AbortController()
    this.activeControllers.set(request.id, controller)
    const events: ResearchEvent[] = []
    let incurredCost = 0
    let incurredUsage: ResearchDestinationResult['usage'] = []
    const record = async (event: ResearchEvent) => {
      events.push(event)
      await this.repository.appendEvents([event])
    }

    try {
      const control = await this.requireControl(request.id)
      const configurationHash = manualConfigurationHash(request)
      const providers = this.providers(destination, simulationScenario(request), run.attempt)
      await record(this.event(request, run, run.attempt > 1 ? 'manual.execution.retried' : 'manual.destination.resolved', 'destination_resolution', { attempt: run.attempt }))

      const savedSources = await readManualCheckpoint(this.repository, request.id, 'source_reading', ManualSourcesCheckpointSchema, configurationHash)
      const savedFacts = await readManualCheckpoint(this.repository, request.id, 'fact_structuring', ManualFactsCheckpointSchema, configurationHash)
      let sources: ResearchDestinationResult['sources']
      let facts: ResearchDestinationResult['facts']
      let places: ResearchDestinationResult['places']
      let activities: ResearchDestinationResult['activities']
      let sourceUsage: ResearchDestinationResult['usage']
      let sourceCost: number
      let documents: Awaited<ReturnType<SourceAcquisitionService['acquire']>>['documents']

      if (savedSources) {
        sources = savedSources.snapshot.sources.map(source => ({ ...source, runId: run.id }))
        documents = savedSources.snapshot.documents.map(document => ({
          ...document,
          source: { ...document.source, runId: run.id },
        }))
        sourceUsage = savedSources.snapshot.usage.map(item => ({ ...item, runId: run.id, id: this.id(), createdAt: this.now() }))
        sourceCost = savedSources.snapshot.actualCost
        await record(this.event(request, run, 'manual.stage.reused', 'source_reading', { fromAttempt: savedSources.checkpoint.attempt }))
      } else {
        await this.setProgress(request, run, 'researching', 'source_discovery', lockToken, controller.signal)
        const currentControl = await this.requireControl(request.id)
        const availableBudget = currentControl.budgetLimit - currentControl.spentCost
        this.assertBudget(currentControl.spentCost, 0.01, currentControl.budgetLimit)
        const sourceResult = await new SourceAcquisitionService(providers.source, {
          timeoutMs: 5_000,
          maxAttempts: Math.min(control.maxAttempts, 3),
          backoffMs: [0, 100, 400],
          maxQueries: 4,
          maxResultsPerQuery: 5,
          maxSources: 8,
          budgetLimit: availableBudget,
          costs: { discovery: 0.01, reading: 0.02, evaluation: 0.01 },
        }, { now: this.now, id: this.id }).acquire({
          requestId: request.id,
          runId: run.id,
          actorId: request.actorId,
          correlationId: request.idempotencyKey,
          destination,
          queries: buildQueries(destination.name),
          language: request.language,
          signal: controller.signal,
        })
        sources = sourceResult.sources
        documents = sourceResult.documents
        sourceUsage = sourceResult.usage
        sourceCost = sourceResult.actualCost
        incurredCost += sourceResult.actualCost
        incurredUsage = [...incurredUsage, ...sourceResult.usage]
        for (const event of sourceResult.events) await record(event)
        await saveManualCheckpoint(this.repository, {
          requestId: request.id, runId: run.id, stage: 'source_reading', attempt: run.attempt, createdAt: this.now(),
          snapshot: { kind: 'manual-sources-v1', configurationHash, completedAt: this.now(), sources, documents, usage: sourceUsage, estimatedCost: sourceResult.estimatedCost, actualCost: sourceCost, currency: sourceResult.currency },
        })
        await this.updateSpent(currentControl, currentControl.spentCost + sourceResult.actualCost)
      }

      if (savedFacts) {
        facts = savedFacts.snapshot.facts
        places = savedFacts.snapshot.places
        activities = savedFacts.snapshot.activities
        await record(this.event(request, run, 'manual.stage.reused', 'fact_structuring', { fromAttempt: savedFacts.checkpoint.attempt }))
      } else {
        await this.setProgress(request, run, 'structuring', 'fact_structuring', lockToken, controller.signal)
        const factualResult = await new FactualStructuringService(providers.factual, this.repository, this.now).structure({
          requestId: request.id,
          runId: run.id,
          destinationId: destination.id,
          language: request.language,
          attempt: run.attempt,
          documents,
          signal: controller.signal,
        })
        facts = factualResult.facts
        places = factualResult.places
        activities = factualResult.activities
        await saveManualCheckpoint(this.repository, {
          requestId: request.id, runId: run.id, stage: 'fact_structuring', attempt: run.attempt, createdAt: this.now(),
          snapshot: { kind: 'manual-facts-v1', configurationHash, completedAt: this.now(), facts, places, activities },
        })
        await record(this.event(request, run, 'manual.facts.structured', 'fact_structuring', { facts: facts.length, places: places.length, activities: activities.length }))
      }

      const savedDrafts = await readManualCheckpoint(this.repository, request.id, 'profile_generation', ManualDraftsCheckpointSchema, configurationHash)
      let drafts: ResearchDestinationResult['drafts']
      let editorialUsage: ResearchDestinationResult['usage']
      let editorialCost: number
      if (savedDrafts) {
        drafts = savedDrafts.snapshot.drafts.map(bundle => ({ ...bundle, draft: { ...bundle.draft, runId: run.id } }))
        editorialUsage = savedDrafts.snapshot.usage.map(item => ({ ...item, runId: run.id, id: this.id(), createdAt: this.now() }))
        editorialCost = savedDrafts.snapshot.actualCost
        await record(this.event(request, run, 'manual.stage.reused', 'profile_generation', { fromAttempt: savedDrafts.checkpoint.attempt }))
      } else {
        await this.setProgress(request, run, 'validating', 'profile_generation', lockToken, controller.signal)
        const currentControl = await this.requireControl(request.id)
        this.assertBudget(currentControl.spentCost, request.profiles.length * 0.08, currentControl.budgetLimit)
        const editorialResult = await new EditorialGenerationService(providers.editorial, {
          fullDraftCost: 0.08,
          sectionRegenerationCost: 0.02,
          budgetLimit: currentControl.budgetLimit - currentControl.spentCost,
          currency: 'EUR',
        }, { now: this.now, id: this.id }).generate({
          requestId: request.id,
          runId: run.id,
          actorId: request.actorId,
          destinationName: destination.name,
          language: request.language,
          facts, places, activities,
          profiles: request.profiles,
          signal: controller.signal,
        })
        drafts = editorialResult.drafts
        editorialUsage = editorialResult.usage
        editorialCost = editorialResult.actualCost
        incurredCost += editorialResult.actualCost
        incurredUsage = [...incurredUsage, ...editorialResult.usage]
        await saveManualCheckpoint(this.repository, {
          requestId: request.id, runId: run.id, stage: 'profile_generation', attempt: run.attempt, createdAt: this.now(),
          snapshot: { kind: 'manual-drafts-v1', configurationHash, completedAt: this.now(), drafts, usage: editorialUsage, estimatedCost: editorialResult.estimatedCost, actualCost: editorialCost, currency: editorialResult.currency },
        })
        await this.updateSpent(currentControl, currentControl.spentCost + editorialResult.actualCost)
        await record(this.event(request, run, 'manual.drafts.generated', 'profile_generation', { profiles: request.profiles }))
      }

      await this.setProgress(request, run, 'validating', 'quality_review', lockToken, controller.signal)
      const savedQuality = await readManualCheckpoint(this.repository, request.id, 'quality_review', ManualQualityCheckpointSchema, configurationHash)
      const quality = savedQuality?.snapshot ?? new RevisiatorService(this.now).review({
        destinationName: destination.name,
        language: request.language,
        requestedProfiles: request.profiles,
        sources, facts, drafts,
      })
      if (!savedQuality) {
        await saveManualCheckpoint(this.repository, {
          requestId: request.id, runId: run.id, stage: 'quality_review', attempt: run.attempt, createdAt: this.now(),
          snapshot: { kind: 'manual-quality-v1', configurationHash, completedAt: this.now(), reviews: quality.reviews, checks: quality.checks },
        })
      }
      await record(this.event(request, run, 'manual.quality.completed', 'quality_review', { reused: Boolean(savedQuality) }))
      await this.setProgress(request, run, 'validating', 'human_review', lockToken, controller.signal)
      await record(this.event(request, run, 'manual.awaiting_human_review', 'human_review', {}))

      const completedAt = this.now()
      const usage = [...sourceUsage, ...editorialUsage]
      const totalCost = sourceCost + editorialCost
      const completedRequest = EditorialResearchRequestSchema.parse({ ...request, state: 'completed', version: request.version + 1, updatedAt: completedAt })
      const completedRun = EditorialResearchRunSchema.parse({
        ...run,
        stage: 'human_review', state: 'completed', estimatedCost: totalCost, actualCost: totalCost,
        inputUnits: usage.reduce((sum, item) => sum + item.inputUnits, 0),
        outputUnits: usage.reduce((sum, item) => sum + item.outputUnits, 0),
        completedAt, updatedAt: completedAt,
      })
      const result = ResearchDestinationResultSchema.parse({
        request: completedRequest,
        run: completedRun,
        previousRuns,
        destination,
        sources, facts, places, activities, drafts,
        qualityReviews: quality.reviews,
        qualityChecks: quality.checks,
        usage,
        events,
      })
      await this.repository.save(result)
      const completedControl = await this.requireControl(request.id)
      await this.repository.saveExecutionControl({ ...completedControl, nextRetryAt: undefined, lastHeartbeatAt: completedAt, updatedAt: completedAt })
      return result
    } catch (error) {
      const failedAt = this.now()
      const cancelled = controller.signal.aborted || errorCode(error) === 'CANCELLED'
      const failedRequest = EditorialResearchRequestSchema.parse({
        ...request,
        state: cancelled ? 'cancelled' : 'failed',
        version: request.version + 1,
        updatedAt: failedAt,
      })
      const failedRun = EditorialResearchRunSchema.parse({
        ...run,
        state: cancelled ? 'cancelled' : 'failed',
        estimatedCost: incurredCost,
        actualCost: incurredCost,
        inputUnits: incurredUsage.reduce((sum, item) => sum + item.inputUnits, 0),
        outputUnits: incurredUsage.reduce((sum, item) => sum + item.outputUnits, 0),
        errorCode: cancelled ? undefined : errorCode(error),
        errorMessage: cancelled ? undefined : errorMessage(error),
        cancelledBy: cancelled ? (await this.repository.getExecutionControl(request.id))?.cancelledBy ?? request.actorId : undefined,
        completedAt: failedAt,
        updatedAt: failedAt,
      })
      const event = this.event(failedRequest, failedRun, cancelled ? 'manual.execution.cancelled' : 'manual.execution.failed', run.stage, {
        attempt: run.attempt,
        errorCode: cancelled ? 'CANCELLED' : errorCode(error),
      })
      await this.repository.updateExecution(failedRequest, failedRun).catch(() => undefined)
      await this.repository.appendEvents([event]).catch(() => undefined)
      const control = await this.repository.getExecutionControl(request.id).catch(() => null)
      if (control) {
        const delay = this.retryBackoffMs[Math.min(run.attempt, this.retryBackoffMs.length - 1)] ?? 0
        await this.repository.saveExecutionControl({
          ...control,
          nextRetryAt: cancelled ? undefined : new Date(failedAt.getTime() + delay),
          lastHeartbeatAt: failedAt,
          updatedAt: failedAt,
        }).catch(() => undefined)
      }
      if (cancelled) throw new ManualWorkflowError('CANCELLED', 'La ejecución Manual fue cancelada de forma segura', error)
      throw error
    } finally {
      this.activeControllers.delete(request.id)
      await this.repository.releaseExecutionLock(request.id, lockToken).catch(() => false)
    }
  }

  list(limit = 100): Promise<EditorialResearchSummary[]> {
    return this.repository.list(limit)
  }

  get(requestId: string): Promise<ResearchDestinationResult | null> {
    return this.repository.getByRequestId(requestId)
  }

  listDraftVersions(requestId: string): Promise<EditorialDraftVersionSummary[]> {
    return this.repository.listDraftVersions(requestId)
  }

  async editSection(candidate: ManualSectionEdit): Promise<ResearchDestinationResult> {
    const input = ManualSectionEditSchema.parse(candidate)
    const result = await this.requireResult(input.requestId)
    const current = this.requireDraft(result, input.draftId)
    if (!['ready', 'changes_requested', 'rejected'].includes(current.draft.state)) {
      throw new ManualWorkflowError('INVALID_STATE', 'Solo puede editarse un borrador listo, devuelto o rechazado')
    }
    const section = current.sections.find(item => item.id === input.sectionId)
    if (!section) throw new ManualWorkflowError('SECTION_NOT_FOUND', 'La sección no pertenece al borrador actual')
    const nextVersion = current.draft.contentVersion + 1
    const changedAt = this.now()
    const draftId = deterministicUuid(`${current.draft.id}:human:${nextVersion}:${input.heading}:${input.content}`)
    const next = EditorialDraftBundleSchema.parse({
      draft: {
        ...current.draft,
        id: draftId,
        contentVersion: nextVersion,
        state: 'ready',
        previousDraftId: current.draft.id,
        regenerationReason: input.reason,
        humanEdited: true,
        updatedBy: input.actorId,
        version: current.draft.version + 1,
        createdAt: changedAt,
        updatedAt: changedAt,
      },
      sections: current.sections.map((item, position) => ({
        ...item,
        id: deterministicUuid(`${draftId}:section:${item.kind}:${position}`),
        draftId,
        heading: item.id === section.id ? input.heading : item.heading,
        content: item.id === section.id ? input.content : item.content,
        humanEdited: item.id === section.id || item.humanEdited,
        regenerationReason: item.id === section.id ? input.reason : item.regenerationReason,
        version: item.id === section.id ? item.version + 1 : item.version,
        createdAt: changedAt,
        updatedAt: changedAt,
      })),
    })
    return this.replaceDraftAndReview(result, current, next, input.actorId, 'manual.section.edited', { sectionKind: section.kind, reason: input.reason })
  }

  async regenerateSection(candidate: ManualSectionRegeneration): Promise<ResearchDestinationResult> {
    const input = ManualSectionRegenerationSchema.parse(candidate)
    const result = await this.requireResult(input.requestId)
    const current = this.requireDraft(result, input.draftId)
    if (!['ready', 'changes_requested', 'rejected'].includes(current.draft.state)) {
      throw new ManualWorkflowError('INVALID_STATE', 'Solo puede regenerarse un borrador listo, devuelto o rechazado')
    }
    const control = await this.ensureControl(result.request)
    this.assertBudget(control.spentCost, 0.02, control.budgetLimit)
    const generated = await new EditorialGenerationService(this.providers(result.destination, simulationScenario(result.request), result.run.attempt).editorial, {
      fullDraftCost: 0.08,
      sectionRegenerationCost: 0.02,
      budgetLimit: control.budgetLimit - control.spentCost,
      currency: 'EUR',
    }, { now: this.now, id: this.id }).regenerateSection({
      requestId: result.request.id,
      runId: result.run.id,
      actorId: input.actorId,
      destinationName: result.destination.name,
      language: result.request.language,
      facts: result.facts,
      places: result.places,
      activities: result.activities,
      current,
      sectionId: input.sectionId,
      reason: input.reason,
    })
    const next = generated.drafts[0]
    const updated = await this.replaceDraftAndReview(
      result,
      current,
      next,
      input.actorId,
      'manual.section.regenerated',
      { reason: input.reason },
      { usage: generated.usage, estimatedCost: generated.estimatedCost, actualCost: generated.actualCost },
    )
    await this.updateSpent(control, control.spentCost + generated.actualCost)
    return updated
  }

  async submitForReview(candidate: ManualDraftReview): Promise<ResearchDestinationResult> {
    const input = ManualDraftReviewSchema.parse(candidate)
    const result = await this.requireResult(input.requestId)
    const bundle = this.requireDraft(result, input.draftId)
    if (bundle.draft.state !== 'ready') throw new ManualWorkflowError('INVALID_STATE', 'El borrador debe estar listo para iniciar revisión')
    const review = result.qualityReviews.find(item => item.draftId === bundle.draft.id && item.draftVersion === bundle.draft.contentVersion)
    if (!review || !['passed', 'passed_with_warnings'].includes(review.outcome)) {
      throw new ManualWorkflowError('QUALITY_GATE_FAILED', 'RevisIAtor exige resolver los controles antes de la revisión humana')
    }
    return this.changeDraftState(result, bundle, 'in_review', input.actorId, 'manual.review.started', {})
  }

  async decide(candidate: ManualDraftDecision): Promise<ResearchDestinationResult> {
    const input = ManualDraftDecisionSchema.parse(candidate)
    const result = await this.requireResult(input.requestId)
    const bundle = this.requireDraft(result, input.draftId)
    if (bundle.draft.state !== 'in_review') throw new ManualWorkflowError('INVALID_STATE', 'La decisión exige un borrador en revisión')
    return this.changeDraftState(result, bundle, input.decision, input.actorId, `manual.review.${input.decision}`, { comment: input.comment })
  }

  private async setProgress(
    request: EditorialResearchRequest,
    run: EditorialResearchRun,
    requestState: EditorialResearchRequest['state'],
    stage: ResearchStage,
    lockToken: string,
    signal: AbortSignal,
  ): Promise<void> {
    await this.assertNotCancelled(request.id, signal)
    request.state = requestState
    request.updatedAt = this.now()
    run.stage = stage
    run.updatedAt = request.updatedAt
    const renewed = await this.repository.renewExecutionLock(
      request.id, lockToken, new Date(request.updatedAt.getTime() + this.leaseMs),
    )
    if (!renewed) throw new ManualWorkflowError('ALREADY_RUNNING', 'Se perdió el lease de la ejecución Manual')
    await this.repository.updateExecution(request, run)
    const control = await this.requireControl(request.id)
    await this.repository.saveExecutionControl({ ...control, lastHeartbeatAt: request.updatedAt, updatedAt: request.updatedAt })
    await this.beforeStage(stage, run.attempt)
  }

  private async assertNotCancelled(requestId: string, signal: AbortSignal): Promise<void> {
    const control = await this.requireControl(requestId)
    if (signal.aborted || control.cancelRequestedAt) {
      throw new ManualWorkflowError('CANCELLED', 'La cancelación Manual fue solicitada')
    }
  }

  private async requireControl(requestId: string): Promise<EditorialExecutionControl> {
    const control = await this.repository.getExecutionControl(requestId)
    if (!control) throw new ManualWorkflowError('INVALID_STATE', 'La ejecución no tiene control durable de resiliencia')
    return control
  }

  private async ensureControl(request: EditorialResearchRequest): Promise<EditorialExecutionControl> {
    const existing = await this.repository.getExecutionControl(request.id)
    if (existing) return existing
    const maxAttempts = Number(request.options.maxAttempts ?? 3)
    const budgetLimit = Number(request.options.budgetLimit ?? 2)
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5 || !Number.isFinite(budgetLimit) || budgetLimit < 0.1) {
      throw new ManualWorkflowError('INVALID_STATE', 'La solicitud no permite reconstruir su control de resiliencia')
    }
    const control: EditorialExecutionControl = {
      requestId: request.id,
      maxAttempts,
      budgetLimit,
      spentCost: 0,
      createdAt: request.createdAt,
      updatedAt: this.now(),
    }
    await this.repository.saveExecutionControl(control)
    return control
  }

  private async updateSpent(control: EditorialExecutionControl, spentCost: number): Promise<void> {
    const updatedAt = this.now()
    await this.repository.saveExecutionControl({ ...control, spentCost, lastHeartbeatAt: updatedAt, updatedAt })
  }

  private assertBudget(spent: number, next: number, limit: number): void {
    if (spent + next > limit) {
      throw new ManualWorkflowError('BUDGET_EXCEEDED', `El coste ${spent + next} EUR supera el presupuesto global ${limit} EUR`)
    }
  }

  private async requireResult(requestId: string): Promise<ResearchDestinationResult> {
    const result = await this.repository.getByRequestId(requestId)
    if (!result) throw new ManualWorkflowError('RESEARCH_NOT_FOUND', 'No existe una investigación completa con ese identificador')
    return result
  }

  private requireDraft(result: ResearchDestinationResult, draftId: string): EditorialDraftBundle {
    const bundle = result.drafts.find(item => item.draft.id === draftId)
    if (!bundle) throw new ManualWorkflowError('DRAFT_NOT_FOUND', 'El borrador no es la versión actual de la investigación')
    return bundle
  }

  private async replaceDraftAndReview(
    result: ResearchDestinationResult,
    current: EditorialDraftBundle,
    next: EditorialDraftBundle,
    actorId: string,
    eventType: string,
    payload: Record<string, unknown>,
    extra: { usage: ResearchDestinationResult['usage']; estimatedCost: number; actualCost: number } = {
      usage: [], estimatedCost: 0, actualCost: 0,
    },
  ): Promise<ResearchDestinationResult> {
    const changedAt = this.now()
    const drafts = result.drafts.map(item => item.draft.id === current.draft.id ? next : item)
    const quality = new RevisiatorService(this.now).review({
      destinationName: result.destination.name,
      language: result.request.language,
      requestedProfiles: result.request.profiles,
      sources: result.sources,
      facts: result.facts,
      drafts,
    })
    const updated = ResearchDestinationResultSchema.parse({
      ...result,
      request: { ...result.request, version: result.request.version + 1, updatedAt: changedAt },
      run: {
        ...result.run,
        estimatedCost: result.run.estimatedCost + extra.estimatedCost,
        actualCost: (result.run.actualCost ?? 0) + extra.actualCost,
        outputUnits: result.run.outputUnits + extra.usage.reduce((sum, item) => sum + item.outputUnits, 0),
        updatedAt: changedAt,
      },
      drafts,
      qualityReviews: quality.reviews,
      qualityChecks: quality.checks,
      usage: [...result.usage, ...extra.usage],
      events: [...result.events, this.event(result.request, result.run, eventType, 'human_review', { ...payload, draftId: next.draft.id, actorId })],
    })
    await this.repository.save(updated)
    return updated
  }

  private async changeDraftState(
    result: ResearchDestinationResult,
    current: EditorialDraftBundle,
    state: EditorialDraftBundle['draft']['state'],
    actorId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<ResearchDestinationResult> {
    const changedAt = this.now()
    const drafts = result.drafts.map(item => item.draft.id === current.draft.id ? {
      ...item,
      draft: {
        ...item.draft,
        state,
        updatedBy: actorId,
        version: item.draft.version + 1,
        updatedAt: changedAt,
      },
    } : item)
    const updated = ResearchDestinationResultSchema.parse({
      ...result,
      request: { ...result.request, version: result.request.version + 1, updatedAt: changedAt },
      run: { ...result.run, updatedAt: changedAt },
      drafts,
      events: [...result.events, this.event(result.request, result.run, eventType, 'human_review', { ...payload, draftId: current.draft.id, actorId })],
    })
    await this.repository.save(updated)
    return updated
  }

  private event(
    request: EditorialResearchRequest,
    run: EditorialResearchRun,
    type: string,
    stage: ResearchStage,
    payload: Record<string, unknown>,
  ): ResearchEvent {
    return ResearchEventSchema.parse({
      id: this.id(),
      requestId: request.id,
      runId: run.id,
      type,
      stage,
      actorId: request.actorId,
      correlationId: request.idempotencyKey,
      payload,
      occurredAt: this.now(),
    })
  }
}

export function createManualMockProviders(
  destination: GeographicEntity,
  scenario: ManualSimulationScenario = 'happy_path',
  attempt = 1,
): ManualPipelineProviders {
  const queries = buildQueries(destination.name)
  const overviewUrl = `https://fixtures.investighost.local/${destination.slug}/official-overview`
  const practicalUrl = `https://fixtures.investighost.local/${destination.slug}/practical-life`
  const sourceSeeds = [
    {
      queries: [queries[0]],
      url: overviewUrl,
      title: `${destination.name}: contexto territorial sintético`,
      publisher: 'Investighost local fixtures',
      content: `${destination.name} dispone de un contexto territorial, patrimonial y natural que debe verificarse antes de planificar rutas. La preparación y la seguridad dependen de las condiciones locales.`,
      publishedAt: new Date('2026-07-20T10:00:00.000Z'),
      evaluation: { accepted: scenario !== 'insufficient_sources', sourceType: 'official' as const, territorialScope: 'destination' as const, freshness: 'current' as const, reliability: 0.95, reason: scenario === 'insufficient_sources' ? 'Fixture rechazado para probar fuentes insuficientes' : 'Fuente oficial sintética local' },
    },
    {
      queries: [queries[1]],
      url: practicalUrl,
      title: `${destination.name}: movilidad, costes y servicios sintéticos`,
      publisher: 'Investighost local fixtures',
      content: scenario === 'broken_source' || scenario === 'insufficient_sources'
        ? undefined
        : `La movilidad, los costes y los servicios de ${destination.name} requieren comprobación práctica. El presupuesto puede cambiar por temporada y conviene consultar accesibilidad y horarios.`,
      httpStatus: scenario === 'broken_source' || scenario === 'insufficient_sources' ? 404 : 200,
      publishedAt: new Date('2026-07-20T11:00:00.000Z'),
      evaluation: { accepted: true, sourceType: 'tourism' as const, territorialScope: 'local' as const, freshness: 'current' as const, reliability: 0.85, reason: 'Fuente turística sintética local' },
    },
  ]
  const source = new MockEditorialSourceProvider(sourceSeeds, {
    latencyMs: scenario === 'slow_interruptible' ? 1_000 : 0,
  })
  const selectedSource: EditorialSourceProvider = scenario === 'provider_unavailable' && attempt === 1
    ? {
      id: 'mock-source-provider-unavailable',
      model: 'deterministic-provider-outage-v1',
      simulation: true,
      discover: async () => { throw new SourceProviderError('PERMANENT', 'Proveedor sintético no disponible', false) },
      read: request => source.read(request),
      evaluate: request => source.evaluate(request),
    }
    : source
  return {
    source: selectedSource,
    factual: new MockFactualStructuringProvider([
      { sourceUrl: overviewUrl, proposal: overviewProposal(destination.name) },
      { sourceUrl: practicalUrl, proposal: practicalProposal(destination.name) },
    ]),
    editorial: new MockEditorialGenerationProvider(),
  }
}

function overviewProposal(destinationName: string): FactualProposal {
  return {
    facts: [
      { canonicalKey: 'destination.identity', value: destinationName, statement: `${destinationName} es la identidad territorial canónica resuelta para esta investigación`, category: 'geography', confidence: 0.99, volatility: 'stable' },
      { canonicalKey: 'destination.nature', value: 'route-context', statement: `El entorno de ${destinationName} permite plantear recorridos cuya dificultad debe comprobarse sobre el terreno`, category: 'nature', confidence: 0.88, volatility: 'seasonal' },
      { canonicalKey: 'destination.safety', value: 'conditions', statement: `La seguridad en ${destinationName} depende de revisar condiciones, desnivel y meteorología antes de cada recorrido`, category: 'safety', confidence: 0.92, volatility: 'seasonal' },
    ],
    places: [{ canonicalKey: 'territorial-center', name: `Entorno de ${destinationName}`, category: 'nature', factKeys: ['destination.identity', 'destination.nature'], profileRelevance: { adventure: 0.95, student: 0.55 } }],
    activities: [{ canonicalKey: 'prepared-route', name: `Recorrido preparado por ${destinationName}`, audienceProfiles: ['adventure'], durationMinutes: 120, costBand: 'free', season: 'Consultar condiciones actuales', requirements: ['Calzado adecuado', 'Agua'], accessibility: ['Confirmar desnivel y firme'], riskNotes: ['Revisar meteorología y condiciones'], factKeys: ['destination.nature', 'destination.safety'] }],
  }
}

function practicalProposal(destinationName: string): FactualProposal {
  return {
    facts: [
      { canonicalKey: 'daily.transport', value: 'verify-local-options', statement: `La movilidad cotidiana en ${destinationName} exige confirmar horarios y opciones locales`, category: 'logistics', confidence: 0.86, volatility: 'seasonal' },
      { canonicalKey: 'daily.budget', value: 'seasonal-costs', statement: `El presupuesto de estancia en ${destinationName} puede variar por temporada y debe compararse antes del viaje`, category: 'cost', confidence: 0.82, volatility: 'seasonal' },
      { canonicalKey: 'daily.services', value: 'local-services', statement: `Los servicios útiles para una estancia en ${destinationName} deben localizarse y verificar su horario`, category: 'service', confidence: 0.84, volatility: 'seasonal' },
      { canonicalKey: 'daily.accessibility', value: 'verify-access', statement: `La accesibilidad de rutas y servicios en ${destinationName} requiere consulta previa según las necesidades personales`, category: 'accessibility', confidence: 0.9, volatility: 'seasonal' },
    ],
    places: [{ canonicalKey: 'daily-services', name: `Servicios centrales de ${destinationName}`, category: 'service', factKeys: ['daily.services', 'daily.accessibility'], profileRelevance: { adventure: 0.45, student: 0.95 } }],
    activities: [{ canonicalKey: 'daily-planning', name: `Planificación cotidiana en ${destinationName}`, audienceProfiles: ['student'], durationMinutes: 60, costBand: 'budget', season: 'Comparar antes de la estancia', requirements: ['Consultar horarios', 'Preparar presupuesto'], accessibility: ['Confirmar accesos'], riskNotes: ['No asumir disponibilidad'], factKeys: ['daily.transport', 'daily.budget', 'daily.services', 'daily.accessibility'] }],
  }
}

function buildQueries(destinationName: string): [string, string] {
  return [`${destinationName} contexto y seguridad`, `${destinationName} movilidad costes y servicios`]
}

function stageRequestState(stage: ResearchStage): EditorialResearchRequest['state'] {
  if (stage === 'destination_resolution') return 'queued'
  if (stage === 'source_discovery' || stage === 'source_reading') return 'researching'
  if (stage === 'fact_structuring') return 'structuring'
  return 'validating'
}

function simulationScenario(request: EditorialResearchRequest): ManualSimulationScenario {
  const value = request.options.simulationScenario
  return ['happy_path', 'insufficient_sources', 'broken_source', 'provider_unavailable', 'slow_interruptible'].includes(String(value))
    ? value as ManualSimulationScenario
    : 'happy_path'
}

function deterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4]
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`
}

function errorCode(error: unknown): string {
  if (error instanceof ManualCheckpointError) return error.code
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code.slice(0, 120)
  return 'MANUAL_PIPELINE_FAILED'
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2000)
}
