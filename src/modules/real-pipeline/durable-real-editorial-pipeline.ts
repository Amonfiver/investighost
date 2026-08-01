import { createHash, randomUUID } from 'node:crypto'
import {
  REAL_EDITORIAL_PILOT_POLICY,
  RealEditorialPilotSnapshotSchema,
  type RealEditorialPilotRecord,
  type RealEditorialPilotSnapshot,
} from '@shared/real-editorial-pilot-contracts'
import {
  RealResearchMissionSchema,
  RealRoundResultSchema,
  type RealResearchDossier,
  type RealResearchMission,
} from '@shared/real-pipeline-contracts'
import {
  defaultRealProfileSettings,
  missionProfilesFromSettings,
} from '@shared/real-profile-settings'
import { CostLedgerService, type CostLedgerRepository } from './cost-ledger'
import { FullRealEditorialPipeline } from './full-editorial-pipeline'
import {
  LedgeredWorkflowCallExecutor,
  type LedgeredCallMetadataFactory,
} from './ledgered-call-executor'
import type {
  IntelligenceDraft,
  IntelligenceEngine,
  IntelligenceReview,
  IntelligenceRoundAnalysis,
  ProviderCallExecutionContext,
  ProviderResultDiscardReason,
  ProviderResultSanitization,
  RealPipelineProviderSelection,
  ResearchTool,
  ResearchToolResult,
} from './ports'
import { createProviderCallPayloadFingerprint } from './provider-call-fingerprint'
import {
  realEditorialPayloadHash,
  RealEditorialRepositoryError,
  type RealEditorialPilotRepository,
  SupabaseRealWorkflowCheckpointStore,
} from './real-editorial-repository'
import { ControlledRealWorkflow } from './real-workflow'
import type {
  TavilyHttpResponse,
  TavilyJournaledResponse,
  TavilyRequestFailureState,
  TavilyRequestIdentity,
  TavilyRequestJournal,
} from './tavily-research-tool'

export const REAL_EDITORIAL_OPERATION_BUDGETS = {
  researchPerRound: 0.048,
  analysisPerRound: 0.022,
  drafting: 0.04,
  finalReview: 0.02,
} as const

export interface DurableRealEditorialDependencies {
  repository: RealEditorialPilotRepository
  ledgerRepository: CostLedgerRepository
  providers: RealPipelineProviderSelection
  now?: () => Date
  id?: () => string
  guardLease?: {
    executionId: string
    leaseToken: string
  }
}

export class DurableRealEditorialPipeline {
  private readonly now: () => Date
  private readonly id: () => string

  constructor(private readonly dependencies: DurableRealEditorialDependencies) {
    this.now = dependencies.now ?? (() => new Date())
    this.id = dependencies.id ?? randomUUID
  }

  async execute(pilot: RealEditorialPilotRecord, signal: AbortSignal): Promise<RealEditorialPilotSnapshot> {
    if (!pilot.budgetConfirmed || !pilot.budget) {
      throw new DurableRealEditorialError('BUDGET_REQUIRED', 'El piloto no tiene presupuesto confirmado')
    }
    if (pilot.state === 'pending_human_review') {
      const stored = await this.dependencies.repository.getResult(pilot.id)
      if (!stored) throw new DurableRealEditorialError(
        'CHECKPOINT_REQUIRED',
        'El piloto terminado no conserva su resultado',
      )
      return stored
    }

    const executionId = this.dependencies.guardLease?.executionId
      ?? `real-editorial:${pilot.currentRunId}`
    const leaseToken = this.dependencies.guardLease?.leaseToken ?? this.id()
    const ledger = new CostLedgerService(this.dependencies.ledgerRepository, { now: this.now })
    const acquired = this.dependencies.guardLease
      ? true
      : await ledger.acquireExecution(
        executionId,
        leaseToken,
        new Date(this.now().getTime() + 30 * 60 * 1_000),
      )
    if (!acquired) throw new DurableRealEditorialError('GUARD_BUSY', 'La guarda editorial está ocupada')

    try {
      const mission = await initialMissionForExecution(
        this.dependencies.repository,
        pilot,
        this.now,
      )
      await this.dependencies.repository.appendEvent(
        pilot.id,
        pilot.currentRunId,
        'real.editorial.execution.started',
        'researching_round_1',
        { executionId, mode: 'real_editorial_pilot' },
      )
      const durableProviders = durableProvidersFor(
        this.dependencies.providers,
        this.dependencies.repository,
        pilot,
      )
      const calls = new LedgeredWorkflowCallExecutor(
        ledger,
        metadataFactory(pilot, executionId),
        pilot.budget.taskLimitCost,
        operationId => durableOperationResultAvailable(
          this.dependencies.repository,
          pilot.currentRunId,
          operationId,
        ),
        pilot.budget.spentCost,
      )
      const workflow = new ControlledRealWorkflow(
        durableProviders,
        new SupabaseRealWorkflowCheckpointStore(
          this.dependencies.repository,
          pilot.id,
          pilot.currentRunId,
        ),
        calls,
        {
          researchCostPerRound: REAL_EDITORIAL_OPERATION_BUDGETS.researchPerRound,
          analysisCostPerRound: REAL_EDITORIAL_OPERATION_BUDGETS.analysisPerRound,
          completionCostAfterFirstRound:
            REAL_EDITORIAL_OPERATION_BUDGETS.researchPerRound
            + REAL_EDITORIAL_OPERATION_BUDGETS.analysisPerRound
            + REAL_EDITORIAL_OPERATION_BUDGETS.drafting
            + REAL_EDITORIAL_OPERATION_BUDGETS.finalReview,
          budgetLimit: pilot.budget.taskLimitCost,
          ledgerBudgetAuthoritative: true,
          now: this.now,
        },
      )
      const pipeline = new FullRealEditorialPipeline(
        workflow,
        durableProviders.intelligenceEngine,
        calls,
        {
          draftingCost: REAL_EDITORIAL_OPERATION_BUDGETS.drafting,
          reviewCost: REAL_EDITORIAL_OPERATION_BUDGETS.finalReview,
        },
      )
      const settings = defaultRealProfileSettings(this.now())
      const result = await pipeline.execute(mission, settings, signal)
      const roundResults = []
      for (const round of result.research.completedRounds) {
        const artifact = await this.dependencies.repository.latestArtifact(
          pilot.currentRunId,
          'round',
          `round-${round}`,
        )
        if (!artifact) throw new DurableRealEditorialError(
          'CHECKPOINT_REQUIRED',
          `Falta el resultado durable de la ronda ${round}`,
        )
        roundResults.push(RealRoundResultSchema.parse(artifact.payload))
      }
      const callSnapshot = calls.snapshot()
      const snapshot = RealEditorialPilotSnapshotSchema.parse({
        version: 'real-editorial-snapshot-v1',
        pilotId: pilot.id,
        runId: pilot.currentRunId,
        state: 'pending_human_review',
        currentRound: result.research.completedRounds.at(-1) ?? 0,
        mission,
        roundResults,
        dossier: result.research.dossier,
        masterKnowledge: result.research.masterKnowledge,
        coverage: result.research.coverage,
        drafts: result.drafts,
        review: result.review,
        limits: mission.limits,
        accumulatedCost: callSnapshot.spentCost,
        providerCalls: callSnapshot.operationIds.length,
        publicationCount: 0,
        regenerationCount: 0,
        trawelConnected: false,
        automaticEnabled: false,
        updatedAt: this.now().toISOString(),
      })
      await this.dependencies.repository.saveResult(snapshot)
      return snapshot
    } catch (error) {
      if (!signal.aborted) {
        const code = safeErrorCode(error)
        const incidentId = await this.dependencies.repository.recordIncident(
          pilot.id,
          pilot.currentRunId,
          code,
          incidentClassification(code),
          safeIncidentMessage(error),
        )
        const budgetRequirement = budgetRequirementFromError(error)
        if (code === 'BUDGET_EXCEEDED' && budgetRequirement) {
          await this.dependencies.repository.openBudgetReview(
            pilot.id,
            pilot.currentRunId,
            incidentId,
            budgetRequirement.remainingEstimatedCostEur,
          )
        }
        await this.dependencies.repository.appendEvent(
          pilot.id,
          pilot.currentRunId,
          'real.editorial.execution.halted',
          undefined,
          { code },
        )
      }
      throw error
    } finally {
      if (!this.dependencies.guardLease) await ledger.releaseExecution(leaseToken)
    }
  }
}

export type DurableRealEditorialErrorCode =
  | 'BUDGET_REQUIRED'
  | 'GUARD_BUSY'
  | 'CHECKPOINT_REQUIRED'

export class DurableRealEditorialError extends Error {
  readonly retryable = false

  constructor(readonly code: DurableRealEditorialErrorCode, message: string) {
    super(message)
    this.name = 'DurableRealEditorialError'
  }
}

export class DurableRealEditorialTavilyRequestJournal implements TavilyRequestJournal {
  constructor(
    private readonly repository: RealEditorialPilotRepository,
    private readonly pilotId: string,
    private readonly runId: string,
  ) {}

  async load(identity: TavilyRequestIdentity): Promise<TavilyJournaledResponse | undefined> {
    const artifact = await this.repository.latestArtifact(
      this.runId,
      'tavily_result',
      tavilyRequestArtifactKey(identity),
    )
    if (!artifact) return undefined
    if (artifact.version !== 1 || !isRecord(artifact.payload)) {
      throw new RealEditorialRepositoryError(
        'CHECKPOINT_INVALID',
        `La respuesta Tavily ${identity.correlationId} no conserva su contrato durable`,
      )
    }
    const payload = artifact.payload
    if (
      payload.version !== 'tavily-request-v1'
      || payload.correlationId !== identity.correlationId
      || payload.requestHash !== identity.requestHash
      || payload.pathname !== identity.pathname
      || typeof payload.responseStatus !== 'number'
      || !Number.isInteger(payload.responseStatus)
      || !('responseBody' in payload)
    ) {
      throw new RealEditorialRepositoryError(
        'VERSION_CONFLICT',
        `La respuesta Tavily ${identity.correlationId} diverge en identidad, etapa o payload`,
      )
    }
    return {
      response: {
        status: payload.responseStatus,
        body: structuredClone(payload.responseBody),
      },
      billable: false,
    }
  }

  async started(identity: TavilyRequestIdentity): Promise<void> {
    await this.repository.appendEvent(
      this.pilotId,
      this.runId,
      'real.editorial.tavily.request.started',
      undefined,
      {
        ...tavilyRequestEventPayload(identity),
        providerState: 'dispatch_initiated',
        retrySafe: false,
      },
    )
  }

  async completed(
    identity: TavilyRequestIdentity,
    response: TavilyHttpResponse,
    late: boolean,
  ): Promise<void> {
    await this.repository.appendArtifact(
      this.pilotId,
      this.runId,
      'tavily_result',
      tavilyRequestArtifactKey(identity),
      1,
      {
        version: 'tavily-request-v1',
        correlationId: identity.correlationId,
        requestHash: identity.requestHash,
        pathname: identity.pathname,
        query: identity.query ?? null,
        round: identity.round,
        requestIndex: identity.requestIndex,
        originCallId: identity.context.callId,
        originReservationId: identity.context.reservationId,
        originAttempt: identity.context.attempt,
        responseStatus: response.status,
        responseBody: response.body,
      },
    )
    await this.repository.appendEvent(
      this.pilotId,
      this.runId,
      late
        ? 'real.editorial.tavily.request.late_completed'
        : 'real.editorial.tavily.request.completed',
      undefined,
      {
        ...tavilyRequestEventPayload(identity),
        providerState: late ? 'late_response_persisted' : 'completed',
        providerRequestId: tavilyResponseRequestId(response),
        credits: tavilyResponseCredits(response),
        retrySafe: true,
      },
    )
  }

  async reused(identity: TavilyRequestIdentity, response: TavilyHttpResponse): Promise<void> {
    await this.repository.appendEvent(
      this.pilotId,
      this.runId,
      'real.editorial.tavily.request.reused',
      undefined,
      {
        ...tavilyRequestEventPayload(identity),
        providerState: 'durable_response_reused',
        providerRequestId: tavilyResponseRequestId(response),
        credits: tavilyResponseCredits(response),
        retrySafe: true,
      },
    )
  }

  async failed(
    identity: TavilyRequestIdentity,
    state: TavilyRequestFailureState,
  ): Promise<void> {
    await this.repository.appendEvent(
      this.pilotId,
      this.runId,
      state.providerOutcome === 'ambiguous'
        ? 'real.editorial.tavily.request.ambiguous'
        : state.providerOutcome === 'cancelled_confirmed'
          ? 'real.editorial.tavily.request.cancelled'
          : 'real.editorial.tavily.request.not_sent',
      undefined,
      {
        ...tavilyRequestEventPayload(identity),
        providerState: state.providerOutcome,
        retrySafe: state.retrySafe,
        detail: state.detail,
      },
    )
  }
}

function durableProvidersFor(
  providers: RealPipelineProviderSelection,
  repository: RealEditorialPilotRepository,
  pilot: RealEditorialPilotRecord,
): RealPipelineProviderSelection {
  return {
    researchTool: new DurableResearchTool(
      providers.researchTool,
      repository,
      pilot.id,
      pilot.currentRunId,
    ),
    intelligenceEngine: new DurableIntelligenceEngine(
      providers.intelligenceEngine,
      repository,
      pilot.id,
      pilot.currentRunId,
    ),
  }
}

function tavilyRequestArtifactKey(identity: TavilyRequestIdentity): string {
  return `request-${identity.correlationId}`
}

function tavilyRequestEventPayload(
  identity: TavilyRequestIdentity,
): Record<string, unknown> {
  return {
    version: identity.version,
    correlationId: identity.correlationId,
    requestHash: identity.requestHash,
    pathname: identity.pathname,
    query: identity.query,
    round: identity.round,
    requestIndex: identity.requestIndex,
    timeoutMs: identity.timeoutMs,
    operationId: identity.context.operationId,
    reservationId: identity.context.reservationId,
    callId: identity.context.callId,
    attempt: identity.context.attempt,
  }
}

function tavilyResponseRequestId(response: TavilyHttpResponse): string | undefined {
  return isRecord(response.body) && typeof response.body.request_id === 'string'
    ? response.body.request_id
    : undefined
}

function tavilyResponseCredits(response: TavilyHttpResponse): number | undefined {
  return isRecord(response.body)
    && isRecord(response.body.usage)
    && typeof response.body.usage.credits === 'number'
    ? response.body.usage.credits
    : undefined
}

class DurableResearchTool implements ResearchTool {
  readonly id: string
  readonly model: string
  readonly simulation: boolean

  constructor(
    private readonly delegate: ResearchTool,
    private readonly repository: RealEditorialPilotRepository,
    private readonly pilotId: string,
    private readonly runId: string,
  ) {
    this.id = delegate.id
    this.model = delegate.model
    this.simulation = delegate.simulation
  }

  async research(
    mission: RealResearchMission,
    signal: AbortSignal,
    context?: ProviderCallExecutionContext,
  ): Promise<ResearchToolResult> {
    const existing = await this.repository.latestArtifact(
      this.runId,
      'tavily_result',
      `round-${mission.round}`,
    )
    if (existing) return structuredClone(existing.payload) as ResearchToolResult
    let result: ResearchToolResult
    try {
      result = await this.delegate.research(mission, signal, context)
    } catch (error) {
      const summary = sanitizationFromError(error)
      if (summary?.discarded) await this.recordSanitization(mission, summary)
      throw error
    }
    const summary = sanitizedSummary(result.urlSanitization)
    if (summary?.discarded) {
      await this.recordSanitization(mission, summary)
    }
    await this.repository.saveResearchResult(this.pilotId, this.runId, mission, result)
    return result
  }

  private async recordSanitization(
    mission: RealResearchMission,
    summary: ProviderResultSanitization,
  ): Promise<void> {
    await this.repository.appendEvent(
      this.pilotId,
      this.runId,
      'real.editorial.tavily.results.filtered',
      undefined,
      {
        round: mission.round,
        totalReceived: summary.totalReceived,
        accepted: summary.accepted,
        discarded: summary.discarded,
        discardReasons: { ...summary.discardReasons },
      },
    )
  }
}

export class RealEditorialProviderPersistenceError extends Error {
  readonly code = 'PERSISTENCE_ERROR'
  readonly requestState = { providerOutcome: 'response_received' as const }
  readonly providerUsage

  constructor(
    message: string,
    analysis: IntelligenceRoundAnalysis,
    readonly cause: unknown,
  ) {
    super(message)
    this.name = 'RealEditorialProviderPersistenceError'
    this.providerUsage = {
      providerRequestIds: analysis.usage.providerRequestIds ?? [],
      credits: 0,
      calculatedCost: analysis.usage.estimatedCost,
      toolCalls: 1,
      inputTokens: analysis.usage.inputTokens,
      outputTokens: analysis.usage.outputTokens,
      outputHash: realEditorialPayloadHash(analysis),
    }
  }
}

class DurableIntelligenceEngine implements IntelligenceEngine {
  readonly id: string
  readonly model: string
  readonly simulation: boolean

  constructor(
    private readonly delegate: IntelligenceEngine,
    private readonly repository: RealEditorialPilotRepository,
    private readonly pilotId: string,
    private readonly runId: string,
  ) {
    this.id = delegate.id
    this.model = delegate.model
    this.simulation = delegate.simulation
  }

  validateAnalyze(
    mission: RealResearchMission,
    dossier: RealResearchDossier,
  ): void {
    this.delegate.validateAnalyze?.(mission, dossier)
  }

  async analyze(
    mission: RealResearchMission,
    dossier: RealResearchDossier,
    signal: AbortSignal,
    context?: ProviderCallExecutionContext,
  ): Promise<IntelligenceRoundAnalysis> {
    const existing = await this.repository.latestArtifact(
      this.runId,
      'round',
      `round-${mission.round}`,
    )
    if (existing && isRecord(existing.payload) && isRecord(existing.payload.analysis)) {
      return structuredClone(existing.payload.analysis) as unknown as IntelligenceRoundAnalysis
    }
    const analysis = await this.delegate.analyze(mission, dossier, signal)
    try {
      const providerReceiptId = context && this.repository.recordAnalysisProviderResponse
        ? await this.repository.recordAnalysisProviderResponse(
            this.pilotId,
            this.runId,
            mission,
            analysis,
            context,
          )
        : undefined
      await this.repository.saveAnalysis(
        this.pilotId,
        this.runId,
        mission,
        analysis,
        dossier,
        providerReceiptId,
      )
    } catch (error) {
      throw new RealEditorialProviderPersistenceError(
        'OpenAI devolvió una respuesta válida, pero su persistencia durable falló',
        analysis,
        error,
      )
    }
    return analysis
  }

  validateDraft(
    mission: RealResearchMission,
    knowledge: Parameters<IntelligenceEngine['draft']>[1],
  ): void {
    this.delegate.validateDraft?.(mission, knowledge)
  }

  async draft(
    mission: RealResearchMission,
    knowledge: Parameters<IntelligenceEngine['draft']>[1],
    signal: AbortSignal,
  ): Promise<IntelligenceDraft[]> {
    const stored = await Promise.all(['adventure', 'student'].map(profile =>
      this.repository.latestArtifact(
        this.runId,
        profile === 'adventure' ? 'draft_adventure' : 'draft_student',
        profile,
      )))
    if (stored.every(Boolean)) {
      return stored.map(artifact => structuredClone(artifact?.payload) as IntelligenceDraft)
    }
    const completedRound = await this.completedRound()
    await this.repository.updateState(
      this.pilotId,
      this.runId,
      'generating_adventure',
      completedRound,
    )
    const drafts = await this.delegate.draft(mission, knowledge, signal)
    await this.repository.saveDrafts(this.pilotId, this.runId, drafts)
    await this.repository.updateState(
      this.pilotId,
      this.runId,
      'generating_student',
      completedRound,
    )
    return drafts
  }

  validateReview(
    mission: RealResearchMission,
    knowledge: Parameters<IntelligenceEngine['review']>[1],
    drafts: IntelligenceDraft[],
  ): void {
    this.delegate.validateReview?.(mission, knowledge, drafts)
  }

  async review(
    mission: RealResearchMission,
    knowledge: Parameters<IntelligenceEngine['review']>[1],
    drafts: IntelligenceDraft[],
    signal: AbortSignal,
  ): Promise<IntelligenceReview> {
    const existing = await this.repository.latestArtifact(this.runId, 'final_review', 'final')
    if (existing) return structuredClone(existing.payload) as IntelligenceReview
    await this.repository.updateState(
      this.pilotId,
      this.runId,
      'final_review',
      await this.completedRound(),
    )
    const review = await this.delegate.review(mission, knowledge, drafts, signal)
    await this.repository.saveReview(this.pilotId, this.runId, review)
    return review
  }

  private async completedRound(): Promise<0 | 1 | 2> {
    const checkpoint = await this.repository.latestArtifact(this.runId, 'checkpoint', 'workflow')
    if (!checkpoint || !isRecord(checkpoint.payload)) return 0
    const value = checkpoint.payload.completedRound
    return value === 1 || value === 2 ? value : 0
  }
}

export function missionForPilot(
  pilot: RealEditorialPilotRecord,
  now = new Date(),
): RealResearchMission {
  const settings = defaultRealProfileSettings(now)
  return {
    requestId: pilot.id,
    runId: pilot.currentRunId,
    taskId: pilot.budget?.taskId ?? `real-editorial-task:${pilot.id}`,
    destination: {
      canonicalId: pilot.canonicalDestinationId,
      name: 'Morella',
      countryCode: 'ES',
      type: 'locality',
    },
    language: 'es',
    profiles: missionProfilesFromSettings(settings),
    depth: 'deep',
    round: 1,
    objectives: [
      'patrimonio e historia documentada',
      'lugares y actividades verificables',
      'acceso, duración, costes, temporada y riesgos',
      'cultura, población y vida cotidiana',
    ],
    focusedQueries: [],
    limits: {
      maxRounds: 2,
      maxFocusedQueriesPerRound: 3,
      maxSources: 8,
      maxCharactersPerSource: 100_000,
      maxProviderCalls: 12,
      maxInputTokens: 200_000,
      maxOutputTokens: 50_000,
      taskBudgetEur: 0.2,
      batchBudgetEur: 0.2,
      dailyBudgetEur: 0.2,
    },
    createdAt: now.toISOString(),
  }
}

async function initialMissionForExecution(
  repository: RealEditorialPilotRepository,
  pilot: RealEditorialPilotRecord,
  now: () => Date,
): Promise<RealResearchMission> {
  const existing = await repository.latestArtifact(
    pilot.currentRunId,
    'mission',
    'initial',
  )
  if (!existing) {
    const mission = missionForPilot(pilot, now())
    await repository.appendArtifact(
      pilot.id,
      pilot.currentRunId,
      'mission',
      'initial',
      1,
      mission,
    )
    return mission
  }
  if (existing.version !== 1) {
    throw new RealEditorialRepositoryError(
      'VERSION_CONFLICT',
      'La misión durable tiene una versión incompatible',
    )
  }
  const mission = RealResearchMissionSchema.parse(existing.payload)
  const expected = missionForPilot(pilot, new Date(mission.createdAt))
  if (realEditorialPayloadHash(expected) !== existing.payloadHash) {
    throw new RealEditorialRepositoryError(
      'VERSION_CONFLICT',
      'La misión durable no coincide con la identidad y configuración del piloto',
    )
  }
  return mission
}

function metadataFactory(
  pilot: RealEditorialPilotRecord,
  executionId: string,
): LedgeredCallMetadataFactory {
  if (!pilot.budget) throw new DurableRealEditorialError('BUDGET_REQUIRED', 'Falta el presupuesto editorial')
  return {
    create(operationId, attempt, estimatedCost, retryOfCallId) {
      const research = operationId.endsWith(':research')
      const providerId = research ? 'tavily' : 'openai'
      const model = research ? 'search-and-extract' : REAL_EDITORIAL_PILOT_POLICY.providers.model
      const tariffId = research
        ? 'morella-v1-tavily-search'
        : 'morella-v1-openai-responses'
      const operation = operationId.split(':').at(-1) ?? 'unknown'
      const stage = operationId.split(':').slice(-2).join('_')
      const payloadHash = createHash('sha256').update(JSON.stringify({
        operationId,
        pilotId: pilot.id,
        runId: pilot.currentRunId,
        policyId: pilot.policyId,
      })).digest('hex')
      return {
        idempotencyKey: `${operationId}:attempt:${attempt}`,
        executionId,
        requestId: pilot.id,
        runId: pilot.currentRunId,
        taskId: pilot.budget?.taskId ?? '',
        batchId: pilot.budget?.batchId ?? '',
        stage,
        operation,
        providerId,
        model,
        attempt,
        retryOfCallId,
        estimatedCost,
        currency: 'EUR',
        tariffId,
        promptVersion: 'morella-real-editorial-v1',
        schemaVersion: 'real-editorial-snapshot-v1',
        inputHash: createProviderCallPayloadFingerprint({
          executionId,
          requestId: pilot.id,
          runId: pilot.currentRunId,
          taskId: pilot.budget?.taskId ?? '',
          batchId: pilot.budget?.batchId ?? '',
          budgetDate: pilot.budget?.budgetDate,
          stage,
          operation,
          providerId,
          model,
          attempt,
          retryOfCallId,
          estimatedCost,
          reservedCost: estimatedCost,
          currency: 'EUR',
          tariffId,
          promptVersion: 'morella-real-editorial-v1',
          schemaVersion: 'real-editorial-snapshot-v1',
          payloadHash,
          maxInputTokens: 200_000,
          maxOutputTokens: 50_000,
          maxToolCalls: research ? 5 : 2,
          maxCredits: research ? 4 : 0,
          tools: research ? ['search', 'extract'] : ['structured-output'],
        }),
      }
    },
  }
}

function safeErrorCode(error: unknown): string {
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && typeof error.code === 'string'
    && /^[A-Z0-9_]{1,120}$/.test(error.code)
  ) return error.code
  return 'REAL_EDITORIAL_EXECUTION_HALTED'
}

function safeIncidentMessage(error: unknown): string {
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'LIMIT_EXCEEDED'
    && 'message' in error
    && typeof error.message === 'string'
    && /(?:expediente|fuente)/i.test(error.message)
  ) {
    return 'El expediente supera el máximo global de fuentes y necesita una selección durable antes de continuar.'
  }
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'BUDGET_EXCEEDED'
    && 'message' in error
    && typeof error.message === 'string'
  ) {
    return error.message.slice(0, 1_000)
  }
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'PERSISTENCE_ERROR'
    && 'message' in error
    && typeof error.message === 'string'
  ) {
    return error.message.slice(0, 1_000)
  }
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'VERSION_CONFLICT'
    && 'message' in error
    && typeof error.message === 'string'
  ) {
    return error.message.slice(0, 1_000)
  }
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && [
      'TIMEOUT',
      'TIMEOUT_CANCELLED',
      'NETWORK_AMBIGUOUS',
    ].includes(String(error.code))
    && 'message' in error
    && typeof error.message === 'string'
  ) {
    return error.message.slice(0, 1_000)
  }
  return 'La ejecución editorial real se detuvo; revisar el ledger y el checkpoint durable.'
}

function incidentClassification(
  code: string,
): 'recoverable' | 'ambiguous' | 'human_required' {
  if (code === 'TIMEOUT' || code === 'NETWORK_AMBIGUOUS') return 'ambiguous'
  if (code === 'TIMEOUT_CANCELLED') return 'recoverable'
  return 'human_required'
}

function budgetRequirementFromError(
  error: unknown,
): { remainingEstimatedCostEur: number } | undefined {
  if (!isRecord(error) || !isRecord(error.budgetRequirement)) return undefined
  const remaining = error.budgetRequirement.remainingEstimatedCostEur
  if (typeof remaining !== 'number' || !Number.isFinite(remaining) || remaining <= 0) {
    return undefined
  }
  return { remainingEstimatedCostEur: remaining }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function sanitizationFromError(error: unknown): ProviderResultSanitization | undefined {
  return isRecord(error) ? sanitizedSummary(error.urlSanitization) : undefined
}

const safeDiscardReasons: ProviderResultDiscardReason[] = [
  'empty',
  'relative',
  'malformed',
  'http',
  'unsupported_scheme',
  'credentials',
  'duplicate',
  'limit',
  'unmatched',
  'empty_content',
  'extraction_failed',
]

function sanitizedSummary(candidate: unknown): ProviderResultSanitization | undefined {
  if (!isRecord(candidate)) return undefined
  const summary = candidate
  if (
    typeof summary.totalReceived !== 'number'
    || typeof summary.accepted !== 'number'
    || typeof summary.discarded !== 'number'
    || !Number.isInteger(summary.totalReceived)
    || !Number.isInteger(summary.accepted)
    || !Number.isInteger(summary.discarded)
    || summary.totalReceived < 0
    || summary.accepted < 0
    || summary.discarded < 0
    || summary.totalReceived !== summary.accepted + summary.discarded
    || !isRecord(summary.discardReasons)
  ) return undefined
  const discardReasons: ProviderResultSanitization['discardReasons'] = {}
  for (const reason of safeDiscardReasons) {
    const count = summary.discardReasons[reason]
    if (typeof count === 'number' && Number.isInteger(count) && count > 0) {
      discardReasons[reason] = count
    }
  }
  if (Object.values(discardReasons).reduce((total, count) => total + (count ?? 0), 0) !== summary.discarded) {
    return undefined
  }
  return {
    totalReceived: summary.totalReceived,
    accepted: summary.accepted,
    discarded: summary.discarded,
    discardReasons,
  }
}

async function durableOperationResultAvailable(
  repository: RealEditorialPilotRepository,
  runId: string,
  operationId: string,
): Promise<boolean> {
  if (operationId.endsWith(':research')) {
    const round = operationId.includes(':round:2:') ? 2 : 1
    return Boolean(await repository.latestArtifact(runId, 'tavily_result', `round-${round}`))
  }
  if (operationId.endsWith(':analysis')) {
    const round = operationId.includes(':round:2:') ? 2 : 1
    return Boolean(await repository.latestArtifact(runId, 'round', `round-${round}`))
  }
  if (operationId.endsWith(':drafting')) {
    const [adventure, student] = await Promise.all([
      repository.latestArtifact(runId, 'draft_adventure', 'adventure'),
      repository.latestArtifact(runId, 'draft_student', 'student'),
    ])
    return Boolean(adventure && student)
  }
  if (operationId.endsWith(':final-review')) {
    return Boolean(await repository.latestArtifact(runId, 'final_review', 'final'))
  }
  return false
}
