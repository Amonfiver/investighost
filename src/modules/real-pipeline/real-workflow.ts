import { createHash } from 'node:crypto'
import {
  RealRoundResultSchema,
  RealResearchDossierSchema,
  RealResearchMissionSchema,
  type RealContinueDecision,
  type RealCoverage,
  type RealFocusedQuery,
  type RealKnowledgeGap,
  type RealMasterKnowledge,
  type RealResearchDossier,
  type RealResearchMission,
  type RealRoundNumber,
  type RealRoundResult,
} from '@shared/real-pipeline-contracts'
import type {
  IntelligenceRoundAnalysis,
  InvestighostRealWorkflow,
  ProviderCallExecutionContext,
  RealPipelineProviderSelection,
  ResearchToolResult,
} from './ports'
import {
  RealEditorialCoverageConstraintsSchema,
  type RealEditorialCoverageConstraints,
} from '@shared/real-editorial-pilot-contracts'
import {
  GlobalSourceLimitError,
  availableGlobalSourceSlots,
  selectSourcesWithinGlobalLimit,
} from './source-limit-recovery'

export type RealWorkflowState =
  | 'queued'
  | 'researching_round_1'
  | 'analyzing_round_1'
  | 'researching_round_2'
  | 'analyzing_round_2'
  | 'ready_for_drafting'
  | 'review_required'
  | 'cancelled'

export interface RealWorkflowCheckpoint {
  version: 'real-workflow-v1'
  taskId: string
  configurationHash: string
  state: RealWorkflowState
  initialMission: RealResearchMission
  completedRound: 0 | RealRoundNumber
  dossier?: RealResearchDossier
  masterKnowledge?: RealMasterKnowledge
  coverage?: RealCoverage
  lastDecision?: RealContinueDecision
  unresolvedGaps: RealKnowledgeGap[]
  nextRoundQueries: RealFocusedQuery[]
  queryHashes: string[]
  providerCalls: number
  simulatedCost: number
  lastAnalysisCost?: number
  editorialConstraints?: RealEditorialCoverageConstraints
  updatedAt: string
}

export interface RealWorkflowCheckpointStore {
  load(taskId: string): Promise<RealWorkflowCheckpoint | undefined>
  save(checkpoint: RealWorkflowCheckpoint): Promise<void>
}

interface StoredCheckpoint {
  payload: string
  sha256: string
}

export class MemoryRealWorkflowCheckpointStore implements RealWorkflowCheckpointStore {
  private readonly checkpoints = new Map<string, StoredCheckpoint>()

  async load(taskId: string): Promise<RealWorkflowCheckpoint | undefined> {
    const stored = this.checkpoints.get(taskId)
    if (!stored) return undefined
    if (sha256(stored.payload) !== stored.sha256) {
      throw new RealWorkflowError('CHECKPOINT_INVALID', 'El checkpoint no supera la verificación de integridad')
    }
    return JSON.parse(stored.payload) as RealWorkflowCheckpoint
  }

  async save(checkpoint: RealWorkflowCheckpoint): Promise<void> {
    const payload = JSON.stringify(checkpoint)
    this.checkpoints.set(checkpoint.taskId, { payload, sha256: sha256(payload) })
  }
}

export interface WorkflowCallExecutor {
  execute<T>(
    operationId: string,
    estimatedCost: number,
    operation: (context?: ProviderCallExecutionContext) => Promise<T>,
  ): Promise<T>
  canReserve(estimatedCost: number): boolean
  canExecute(operationId: string, estimatedCost: number): boolean
  snapshot(): { operationIds: string[]; spentCost: number }
}

export class MemoryWorkflowCallExecutor implements WorkflowCallExecutor {
  private readonly completed = new Map<string, unknown>()
  private readonly running = new Map<string, Promise<unknown>>()
  private spentCost = 0

  constructor(private readonly dailyBudget: number) {}

  async execute<T>(
    operationId: string,
    estimatedCost: number,
    operation: (context?: ProviderCallExecutionContext) => Promise<T>,
  ): Promise<T> {
    if (this.completed.has(operationId)) return structuredClone(this.completed.get(operationId)) as T
    const current = this.running.get(operationId)
    if (current) return structuredClone(await current) as T
    if (!this.canReserve(estimatedCost)) {
      throw new RealWorkflowError('BUDGET_EXCEEDED', 'El límite diario impide reservar la operación')
    }
    const promise = operation()
    this.running.set(operationId, promise)
    try {
      const result = await promise
      this.completed.set(operationId, structuredClone(result))
      this.spentCost = Number((this.spentCost + estimatedCost).toFixed(9))
      return structuredClone(result)
    } finally {
      this.running.delete(operationId)
    }
  }

  canReserve(estimatedCost: number): boolean {
    return this.spentCost + estimatedCost <= this.dailyBudget
  }

  canExecute(operationId: string, estimatedCost: number): boolean {
    return this.completed.has(operationId) || this.running.has(operationId) || this.canReserve(estimatedCost)
  }

  snapshot() {
    return { operationIds: [...this.completed.keys()], spentCost: this.spentCost }
  }
}

export interface RealWorkflowConfiguration {
  researchCostPerRound: number
  analysisCostPerRound: number
  completionCostAfterFirstRound: number
  budgetLimit: number
  ledgerBudgetAuthoritative: boolean
  now?: () => Date
}

const defaultConfiguration: RealWorkflowConfiguration = {
  researchCostPerRound: 0,
  analysisCostPerRound: 0,
  completionCostAfterFirstRound: 0,
  budgetLimit: Number.POSITIVE_INFINITY,
  ledgerBudgetAuthoritative: false,
}

export type RealWorkflowErrorCode =
  | 'INVALID_INITIAL_ROUND'
  | 'CHECKPOINT_INVALID'
  | 'CONFIGURATION_CHANGED'
  | 'CANCELLED'
  | 'LIMIT_EXCEEDED'
  | 'BUDGET_EXCEEDED'
  | 'THIRD_ROUND_BLOCKED'

export class RealWorkflowError extends Error {
  constructor(
    readonly code: RealWorkflowErrorCode,
    message: string,
    readonly budgetRequirement?: {
      remainingEstimatedCostEur: number
      spentCostEur: number
      availableCostEur: number
      shortfallCostEur: number
    },
  ) {
    super(message)
    this.name = 'RealWorkflowError'
  }
}

export interface RealWorkflowOutcome {
  state: Extract<RealWorkflowState, 'ready_for_drafting' | 'review_required'>
  completedRounds: RealRoundNumber[]
  dossier: RealResearchDossier
  masterKnowledge: RealMasterKnowledge
  coverage: RealCoverage
  unresolvedGaps: RealKnowledgeGap[]
  queryHashes: string[]
  providerCalls: number
  simulatedCost: number
  editorialConstraints?: RealEditorialCoverageConstraints
}

export class ControlledRealWorkflow implements InvestighostRealWorkflow {
  private readonly configuration: RealWorkflowConfiguration
  private readonly now: () => Date

  constructor(
    private readonly providers: RealPipelineProviderSelection,
    private readonly checkpoints: RealWorkflowCheckpointStore,
    private readonly callExecutor: WorkflowCallExecutor,
    configuration: Partial<RealWorkflowConfiguration> = {},
  ) {
    this.configuration = { ...defaultConfiguration, ...configuration }
    this.now = configuration.now ?? (() => new Date())
  }

  async execute(initialCandidate: RealResearchMission, signal: AbortSignal): Promise<RealWorkflowOutcome> {
    const initialMission = RealResearchMissionSchema.parse(initialCandidate)
    if (initialMission.round !== 1) {
      throw new RealWorkflowError('INVALID_INITIAL_ROUND', 'El workflow solo puede comenzar en la ronda 1')
    }
    const configurationHash = workflowConfigurationHash(initialMission)
    let checkpoint = await this.checkpoints.load(initialMission.taskId)
    if (checkpoint && checkpoint.configurationHash !== configurationHash) {
      throw new RealWorkflowError('CONFIGURATION_CHANGED', 'El checkpoint pertenece a otra configuración')
    }
    checkpoint ??= this.initialCheckpoint(initialMission, configurationHash)
    if (isTerminal(checkpoint)) return outcome(checkpoint)
    if (checkpoint.state === 'cancelled') {
      throw new RealWorkflowError('CANCELLED', 'La ejecución cancelada requiere una decisión humana para reanudarse')
    }

    try {
      if (checkpoint.completedRound === 0) {
        checkpoint = await this.runRound(initialMission, checkpoint, signal)
        const next = this.afterFirstRound(checkpoint)
        if (next.terminal) {
          checkpoint = { ...checkpoint, state: next.state, nextRoundQueries: [], updatedAt: this.now().toISOString() }
          await this.checkpoints.save(checkpoint)
          return outcome(checkpoint)
        }
        const completionCost = moneyValue(
          this.configuration.completionCostAfterFirstRound
          + Math.max(
            0,
            (checkpoint.lastAnalysisCost ?? this.configuration.analysisCostPerRound)
            - this.configuration.analysisCostPerRound,
          ),
        )
        if (completionCost > 0 && !this.callExecutor.canReserve(completionCost)) {
          const spentCost = this.callExecutor.snapshot().spentCost
          const availableCost = moneyValue(Math.max(
            0,
            this.configuration.budgetLimit - spentCost,
          ))
          const shortfallCost = moneyValue(Math.max(
            0,
            completionCost - availableCost,
          ))
          checkpoint = {
            ...checkpoint,
            state: 'review_required',
            nextRoundQueries: next.queries,
            queryHashes: [...checkpoint.queryHashes, ...next.queryHashes],
            simulatedCost: spentCost,
            updatedAt: this.now().toISOString(),
          }
          await this.checkpoints.save(checkpoint)
          throw new RealWorkflowError(
            'BUDGET_EXCEEDED',
            [
              `La estimación operativa para completar el piloto es ${money(
                completionCost,
              )} EUR adicionales`,
              `el ledger deja ${money(availableCost)} EUR disponibles`,
              `faltan ${money(shortfallCost)} EUR`,
              'se requiere decisión humana',
            ].join('; '),
            {
              remainingEstimatedCostEur: completionCost,
              spentCostEur: spentCost,
              availableCostEur: availableCost,
              shortfallCostEur: shortfallCost,
            },
          )
        }
        checkpoint = {
          ...checkpoint,
          state: 'researching_round_2',
          nextRoundQueries: next.queries,
          queryHashes: [...checkpoint.queryHashes, ...next.queryHashes],
          updatedAt: this.now().toISOString(),
        }
        await this.checkpoints.save(checkpoint)
      }

      if (checkpoint.completedRound === 1) {
        if (checkpoint.nextRoundQueries.length === 0) {
          throw new RealWorkflowError('THIRD_ROUND_BLOCKED', 'No existe una segunda ronda válida')
        }
        const secondMission = RealResearchMissionSchema.parse({
          ...initialMission,
          round: 2,
          focusedQueries: checkpoint.nextRoundQueries.map(query => query.query),
        })
        checkpoint = await this.runRound(secondMission, checkpoint, signal)
        checkpoint = {
          ...checkpoint,
          state: checkpoint.coverage?.sufficient ? 'ready_for_drafting' : 'review_required',
          nextRoundQueries: [],
          updatedAt: this.now().toISOString(),
        }
        await this.checkpoints.save(checkpoint)
      }

      return outcome(checkpoint)
    } catch (error) {
      if (signal.aborted || isCancellation(error)) {
        await this.checkpoints.save({
          ...checkpoint,
          state: 'cancelled',
          updatedAt: this.now().toISOString(),
        })
        throw new RealWorkflowError('CANCELLED', 'La ejecución fue cancelada')
      }
      throw error
    }
  }

  async executeRound(
    mission: RealResearchMission,
    accumulatedDossier: RealResearchDossier | undefined,
    signal: AbortSignal,
  ): Promise<RealRoundResult> {
    const checkpoint = this.initialCheckpoint(mission, workflowConfigurationHash({
      ...mission,
      round: 1,
      focusedQueries: [],
    }))
    const result = await this.runRound(mission, { ...checkpoint, dossier: accumulatedDossier }, signal)
    return RealRoundResultSchema.parse({
      round: mission.round,
      dossier: result.dossier,
      masterKnowledge: result.masterKnowledge,
      coverage: result.coverage,
      gaps: result.unresolvedGaps,
      proposedQueries: result.nextRoundQueries,
      completedAt: result.updatedAt,
    })
  }

  decide(result: RealRoundResult) {
    if (result.round === 2) {
      return result.coverage.sufficient
        ? { action: 'stop_ready' as const, reason: 'Cobertura suficiente tras la segunda ronda.', queries: [] }
        : {
          action: 'stop_review_required' as const,
          reason: 'La cobertura sigue siendo insuficiente tras la segunda ronda.',
          unresolvedGapIds: result.gaps.map(gap => gap.id),
          queries: [],
        }
    }
    if (result.coverage.sufficient) {
      return { action: 'stop_ready' as const, reason: 'Cobertura suficiente en la primera ronda.', queries: [] }
    }
    const queries = this.validFocusedQueries(result.gaps, result.proposedQueries, [])
    return queries.length > 0
      ? { action: 'continue_focused' as const, nextRound: 2 as const, reason: 'Ampliación focalizada necesaria.', queries }
      : {
        action: 'stop_review_required' as const,
        reason: 'No hay una ampliación focalizada válida.',
        unresolvedGapIds: result.gaps.map(gap => gap.id),
        queries: [],
      }
  }

  private async runRound(
    mission: RealResearchMission,
    checkpoint: RealWorkflowCheckpoint,
    signal: AbortSignal,
  ): Promise<RealWorkflowCheckpoint> {
    this.assertNotCancelled(signal)
    if (mission.round > 2) throw new RealWorkflowError('THIRD_ROUND_BLOCKED', 'Una tercera ronda está prohibida')
    const queryCount = mission.round === 1 ? mission.objectives.length : mission.focusedQueries.length
    const researchOperationId = `${mission.taskId}:round:${mission.round}:research`
    const analysisOperationId = `${mission.taskId}:round:${mission.round}:analysis`
    const analyzingState = mission.round === 1 ? 'analyzing_round_1' : 'analyzing_round_2'
    const researchAlreadyCheckpointed = checkpoint.state === analyzingState
      && Boolean(checkpoint.dossier?.rounds.includes(mission.round))
    const expectedResearchCalls = queryCount + 1
    const expectedCalls = (researchAlreadyCheckpointed ? 0 : expectedResearchCalls) + 1
    if (checkpoint.providerCalls + expectedCalls > mission.limits.maxProviderCalls) {
      throw new RealWorkflowError('LIMIT_EXCEEDED', 'La ronda supera el máximo de llamadas')
    }
    const estimatedRoundCost = (researchAlreadyCheckpointed ? 0 : this.configuration.researchCostPerRound)
      + this.configuration.analysisCostPerRound
    if ((!this.configuration.ledgerBudgetAuthoritative
        && checkpoint.simulatedCost + estimatedRoundCost > mission.limits.taskBudgetEur)
      || !this.callExecutor.canExecute(analysisOperationId, this.configuration.analysisCostPerRound)
      || (!researchAlreadyCheckpointed
        && !this.callExecutor.canExecute(researchOperationId, this.configuration.researchCostPerRound))) {
      throw new RealWorkflowError('BUDGET_EXCEEDED', 'No hay presupuesto para la ronda')
    }

    let providerCalls = checkpoint.providerCalls
    let simulatedCost = checkpoint.simulatedCost
    let dossier = checkpoint.dossier
    if (!researchAlreadyCheckpointed) {
      let availableSourceSlots: number
      try {
        availableSourceSlots = availableGlobalSourceSlots(
          checkpoint.dossier?.sources ?? [],
          mission.limits.maxSources,
        )
      } catch (error) {
        if (error instanceof GlobalSourceLimitError) {
          throw new RealWorkflowError('LIMIT_EXCEEDED', error.message)
        }
        throw error
      }
      if (availableSourceSlots === 0) {
        throw new RealWorkflowError(
          'LIMIT_EXCEEDED',
          'El expediente agotó el máximo global de fuentes antes de investigar',
        )
      }
      const providerMission = RealResearchMissionSchema.parse({
        ...mission,
        limits: {
          ...mission.limits,
          maxSources: availableSourceSlots,
        },
      })
      await this.checkpoints.save({
        ...checkpoint,
        state: mission.round === 1 ? 'researching_round_1' : 'researching_round_2',
        updatedAt: this.now().toISOString(),
      })
      const research = await this.callExecutor.execute(
        researchOperationId,
        this.configuration.researchCostPerRound,
        context => this.providers.researchTool.research(providerMission, signal, context),
      )
      providerCalls += research.providerRequestIds.length
      if (providerCalls + 1 > mission.limits.maxProviderCalls) {
        throw new RealWorkflowError('LIMIT_EXCEEDED', 'El proveedor superó el máximo de llamadas')
      }
      dossier = this.mergeDossier(mission, checkpoint.dossier, research)
      simulatedCost = this.callExecutor.snapshot().spentCost
      await this.checkpoints.save({
        ...checkpoint,
        state: analyzingState,
        dossier,
        providerCalls,
        simulatedCost,
        updatedAt: this.now().toISOString(),
      })
    }
    if (!dossier) throw new RealWorkflowError('CHECKPOINT_INVALID', 'Falta el expediente de la ronda')
    this.providers.intelligenceEngine.validateAnalyze?.(mission, dossier)
    const analysis = await this.callExecutor.execute(
      analysisOperationId,
      this.configuration.analysisCostPerRound,
      context => this.providers.intelligenceEngine.analyze(mission, dossier, signal, context),
    )
    this.assertAnalysisRound(mission.round, analysis)
    return {
      ...checkpoint,
      state: mission.round === 1 ? 'analyzing_round_1' : 'analyzing_round_2',
      completedRound: mission.round,
      dossier,
      masterKnowledge: analysis.masterKnowledge,
      coverage: analysis.coverage,
      lastDecision: analysis.decision,
      unresolvedGaps: analysis.gaps,
      nextRoundQueries: analysis.proposedQueries,
      providerCalls: providerCalls + 1,
      simulatedCost: this.callExecutor.snapshot().spentCost,
      lastAnalysisCost: moneyValue(analysis.usage.estimatedCost),
      updatedAt: this.now().toISOString(),
    }
  }

  private afterFirstRound(checkpoint: RealWorkflowCheckpoint):
    | { terminal: true; state: 'ready_for_drafting' | 'review_required' }
    | { terminal: false; queries: RealFocusedQuery[]; queryHashes: string[] } {
    if (checkpoint.coverage?.sufficient) return { terminal: true, state: 'ready_for_drafting' }
    if (checkpoint.lastDecision?.action === 'stop_ready') return { terminal: true, state: 'ready_for_drafting' }
    if (checkpoint.lastDecision?.action === 'stop_review_required') {
      return { terminal: true, state: 'review_required' }
    }
    const relevant = checkpoint.unresolvedGaps.filter(gap =>
      ['high', 'critical'].includes(gap.importance) && gap.resolvableWithResearch,
    )
    if (relevant.length === 0) return { terminal: true, state: 'ready_for_drafting' }
    const queries = this.validFocusedQueries(relevant, checkpoint.nextRoundQueries, checkpoint.queryHashes)
    if (queries.length === 0) return { terminal: true, state: 'review_required' }
    if (queries.length > checkpoint.initialMission.limits.maxFocusedQueriesPerRound) {
      return { terminal: true, state: 'review_required' }
    }
    const queryHashes = queries.map(query => queryHash(query.query))
    const secondRoundCost = this.configuration.researchCostPerRound + this.configuration.analysisCostPerRound
    const expectedCalls = queries.length + 2
    if (checkpoint.providerCalls + expectedCalls > checkpoint.initialMission.limits.maxProviderCalls
      || (!this.configuration.ledgerBudgetAuthoritative
        && (checkpoint.simulatedCost + secondRoundCost
          > checkpoint.initialMission.limits.taskBudgetEur
          || !this.callExecutor.canReserve(secondRoundCost)))) {
      return { terminal: true, state: 'review_required' }
    }
    return { terminal: false, queries, queryHashes }
  }

  private validFocusedQueries(
    gaps: RealKnowledgeGap[],
    proposed: RealFocusedQuery[],
    previousHashes: string[],
  ): RealFocusedQuery[] {
    const relevantIds = new Set(gaps.map(gap => gap.id))
    const hashes = new Set(previousHashes)
    const unique: RealFocusedQuery[] = []
    for (const query of proposed) {
      if (!relevantIds.has(query.gapId)) continue
      const hash = queryHash(query.query)
      if (hashes.has(hash)) continue
      hashes.add(hash)
      unique.push(query)
    }
    return unique
  }

  private mergeDossier(
    mission: RealResearchMission,
    current: RealResearchDossier | undefined,
    research: ResearchToolResult,
  ): RealResearchDossier {
    let sources: RealResearchDossier['sources']
    try {
      sources = selectSourcesWithinGlobalLimit(
        current?.sources ?? [],
        research.sources,
        mission.limits.maxSources,
      ).combinedSources
    } catch (error) {
      if (error instanceof GlobalSourceLimitError) {
        throw new RealWorkflowError('LIMIT_EXCEEDED', error.message)
      }
      throw error
    }
    const totalCharacters = sources.reduce((total, source) => total + source.content.length, 0)
    if (totalCharacters > mission.limits.maxSources * mission.limits.maxCharactersPerSource) {
      throw new RealWorkflowError('LIMIT_EXCEEDED', 'El expediente supera el máximo de contenido')
    }
    return RealResearchDossierSchema.parse({
      requestId: mission.requestId,
      runId: mission.runId,
      taskId: mission.taskId,
      destinationId: mission.destination.canonicalId,
      rounds: [...(current?.rounds ?? []), mission.round],
      sources,
      evidence: current?.evidence ?? [],
      generatedAt: this.now().toISOString(),
    })
  }

  private assertAnalysisRound(round: RealRoundNumber, analysis: IntelligenceRoundAnalysis): void {
    if (analysis.masterKnowledge.revision !== round) {
      throw new RealWorkflowError('CHECKPOINT_INVALID', 'El conocimiento no corresponde a la ronda ejecutada')
    }
    if (round === 2 && analysis.decision.action === 'continue_focused') {
      throw new RealWorkflowError('THIRD_ROUND_BLOCKED', 'El motor intentó iniciar una tercera ronda')
    }
  }

  private initialCheckpoint(
    mission: RealResearchMission,
    configurationHash: string,
  ): RealWorkflowCheckpoint {
    return {
      version: 'real-workflow-v1',
      taskId: mission.taskId,
      configurationHash,
      state: 'queued',
      initialMission: mission,
      completedRound: 0,
      unresolvedGaps: [],
      nextRoundQueries: [],
      queryHashes: mission.objectives.map(objective => queryHash(`${mission.destination.name} ${objective}`)),
      providerCalls: 0,
      simulatedCost: 0,
      updatedAt: this.now().toISOString(),
    }
  }

  private assertNotCancelled(signal: AbortSignal): void {
    if (signal.aborted) throw new RealWorkflowError('CANCELLED', 'La ejecución fue cancelada')
  }
}

function money(value: number): string {
  return value.toFixed(6)
}

function moneyValue(value: number): number {
  return Number(value.toFixed(9))
}

export function queryHash(query: string): string {
  const stopWords = new Set(['a', 'al', 'de', 'del', 'el', 'en', 'la', 'las', 'los', 'para', 'por', 'y'])
  const canonical = query
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .split(/\s+/)
    .filter(token => token && !stopWords.has(token))
    .sort()
    .join(' ')
  return sha256(canonical)
}

function workflowConfigurationHash(mission: RealResearchMission): string {
  return sha256(JSON.stringify({
    requestId: mission.requestId,
    runId: mission.runId,
    taskId: mission.taskId,
    destination: mission.destination,
    profiles: mission.profiles,
    language: mission.language,
    depth: mission.depth,
    objectives: mission.objectives,
    limits: mission.limits,
  }))
}

function isTerminal(
  checkpoint: RealWorkflowCheckpoint,
): checkpoint is RealWorkflowCheckpoint & { state: 'ready_for_drafting' | 'review_required' } {
  return checkpoint.state === 'ready_for_drafting' || checkpoint.state === 'review_required'
}

function outcome(checkpoint: RealWorkflowCheckpoint): RealWorkflowOutcome {
  if (!isTerminal(checkpoint) || !checkpoint.dossier || !checkpoint.masterKnowledge || !checkpoint.coverage) {
    throw new RealWorkflowError('CHECKPOINT_INVALID', 'El checkpoint terminal está incompleto')
  }
  const editorialConstraints = checkpoint.editorialConstraints
    ? RealEditorialCoverageConstraintsSchema.parse(checkpoint.editorialConstraints)
    : undefined
  return {
    state: checkpoint.state,
    completedRounds: checkpoint.dossier.rounds,
    dossier: checkpoint.dossier,
    masterKnowledge: checkpoint.masterKnowledge,
    coverage: checkpoint.coverage,
    unresolvedGaps: checkpoint.unresolvedGaps,
    queryHashes: checkpoint.queryHashes,
    providerCalls: checkpoint.providerCalls,
    simulatedCost: checkpoint.simulatedCost,
    editorialConstraints,
  }
}

function isCancellation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'CANCELLED')
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
