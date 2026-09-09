import { describe, expect, it } from 'vitest'
import {
  ControlledRealWorkflow,
  MemoryRealWorkflowCheckpointStore,
  MemoryWorkflowCallExecutor,
  queryHash,
  type WorkflowCallExecutor,
} from '@modules/real-pipeline/real-workflow'
import type {
  IntelligenceDraft,
  IntelligenceEngine,
  IntelligenceReview,
  IntelligenceRoundAnalysis,
  ResearchTool,
  ResearchToolResult,
} from '@modules/real-pipeline/ports'
import type {
  RealResearchMission,
  RealResearchSource,
} from '@shared/real-pipeline-contracts'

const timestamp = '2026-07-25T12:00:00.000Z'

function mission(overrides: Partial<RealResearchMission> = {}): RealResearchMission {
  return {
    requestId: 'request-morella',
    runId: 'run-morella',
    taskId: 'task-morella',
    destination: {
      canonicalId: 'destination-morella',
      name: 'Morella',
      countryCode: 'ES',
      type: 'locality',
    },
    language: 'es',
    profiles: [
      { profile: 'adventure', enabled: true, targetWords: 1_000 },
      { profile: 'student', enabled: true, targetWords: 1_800 },
    ],
    depth: 'deep',
    round: 1,
    objectives: ['patrimonio principal'],
    focusedQueries: [],
    limits: {
      maxRounds: 2,
      maxFocusedQueriesPerRound: 4,
      maxSources: 20,
      maxCharactersPerSource: 100_000,
      maxProviderCalls: 8,
      maxInputTokens: 40_000,
      maxOutputTokens: 12_000,
      taskBudgetEur: 0.2,
      batchBudgetEur: 0.5,
      dailyBudgetEur: 1,
    },
    createdAt: timestamp,
    ...overrides,
  }
}

function source(round: 1 | 2, suffix: string): RealResearchSource {
  return {
    id: `source-${suffix}`,
    round,
    url: `https://example.test/${suffix}`,
    normalizedUrl: `https://example.test/${suffix}`,
    title: `Fuente ${suffix}`,
    capturedAt: timestamp,
    contentHash: (suffix === 'shared' ? 'a' : 'b').repeat(64),
    score: 0.9,
    content: `Contenido sintético ${suffix}.`,
  }
}

class FakeResearchTool implements ResearchTool {
  readonly id = 'tavily-fake'
  readonly model = 'fixture'
  readonly simulation = true
  calls: number[] = []

  constructor(private readonly includeDuplicate = false) {}

  async research(input: RealResearchMission): Promise<ResearchToolResult> {
    this.calls.push(input.round)
    const sources = input.round === 1
      ? [source(1, 'shared')]
      : this.includeDuplicate
        ? [{ ...source(1, 'shared'), round: 2 as const }, source(2, 'focused')]
        : [source(2, 'focused')]
    return {
      round: input.round,
      sources,
      providerRequestIds: [`search-${input.round}`, `extract-${input.round}`],
      failures: [],
      usageUnits: 0,
      credits: 0,
    }
  }
}

class GlobalLimitResearchTool implements ResearchTool {
  readonly id = 'tavily-global-limit-fake'
  readonly model = 'fixture'
  readonly simulation = true
  readonly receivedLimits: number[] = []

  async research(input: RealResearchMission): Promise<ResearchToolResult> {
    this.receivedLimits.push(input.limits.maxSources)
    const sources = input.round === 1
      ? [
          { ...source(1, 'round-one-a'), score: 0.7 },
          { ...source(1, 'round-one-b'), score: 0.6 },
          { ...source(1, 'round-one-c'), score: 0.5 },
        ]
      : [
          { ...source(2, 'round-two-sixth'), score: 0.4 },
          { ...source(2, 'round-two-third'), score: 0.7 },
          { ...source(2, 'round-two-first'), score: 0.95 },
          { ...source(2, 'round-two-fifth'), score: 0.5 },
          { ...source(2, 'round-two-second'), score: 0.8 },
          { ...source(2, 'round-two-fourth'), score: 0.6 },
        ]
    return {
      round: input.round,
      sources,
      providerRequestIds: [`request-${input.round}`],
      failures: [],
      usageUnits: 1,
      credits: 1,
    }
  }
}

class FakeIntelligenceEngine implements IntelligenceEngine {
  readonly id = 'openai-fake'
  readonly model = 'fixture'
  readonly simulation = true
  calls: number[] = []

  constructor(
    private readonly analyses: (IntelligenceRoundAnalysis | Error)[],
  ) {}

  async analyze(input: RealResearchMission): Promise<IntelligenceRoundAnalysis> {
    this.calls.push(input.round)
    const next = this.analyses.shift()
    if (next instanceof Error) throw next
    if (!next) throw new Error('Análisis fake no configurado')
    return {
      ...structuredClone(next),
      masterKnowledge: { ...structuredClone(next.masterKnowledge), revision: input.round },
    }
  }

  async draft(): Promise<IntelligenceDraft[]> {
    return []
  }

  async review(): Promise<IntelligenceReview> {
    return {
      outcome: 'passed',
      issues: [],
      promptVersion: 'fixture',
      schemaVersion: 'fixture',
      usage: { inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: 'EUR' },
    }
  }
}

function gap(importance: 'low' | 'medium' | 'high' | 'critical' = 'high') {
  return {
    id: `gap-${importance}`,
    topic: 'access',
    description: 'Falta acceso actualizado.',
    importance,
    requiredForProfiles: ['adventure' as const],
    resolvableWithResearch: true,
  }
}

function analysis(options: {
  sufficient?: boolean
  importance?: 'low' | 'medium' | 'high' | 'critical'
  query?: string
  continueAfter?: boolean
  estimatedCost?: number
} = {}): IntelligenceRoundAnalysis {
  const sufficient = options.sufficient ?? false
  const currentGap = gap(options.importance ?? 'high')
  const queries = sufficient ? [] : [{
    id: 'query-focused',
    gapId: currentGap.id,
    query: options.query ?? 'Morella autobús frecuencia actual',
    rationale: 'Completar acceso.',
  }]
  return {
    masterKnowledge: {
      requestId: 'request-morella',
      destinationId: 'destination-morella',
      revision: 1,
      claims: [{
        id: 'claim-one',
        topic: 'heritage',
        statement: 'Morella conserva murallas.',
        evidenceIds: ['evidence-one'],
        confidence: 0.9,
        suitableProfiles: ['adventure', 'student'],
      }],
      contradictions: [],
      generatedAt: timestamp,
    },
    coverage: {
      score: sufficient ? 0.95 : 0.6,
      sufficient,
      topics: [{ topic: 'access', required: true, coverage: sufficient ? 1 : 0.3, evidenceIds: [] }],
    },
    proposedQueries: queries,
    gaps: sufficient ? [] : [currentGap],
    decision: sufficient
      ? { action: 'stop_ready', reason: 'Suficiente.', queries: [] }
      : options.continueAfter === false
        ? {
          action: 'stop_review_required',
          reason: 'Revisión.',
          unresolvedGapIds: [currentGap.id],
          queries: [],
        }
        : { action: 'continue_focused', nextRound: 2, reason: 'Ampliar.', queries },
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      estimatedCost: options.estimatedCost ?? 0,
      currency: 'EUR',
    },
  }
}

class WorkflowCallExecutorWithExistingSpend implements WorkflowCallExecutor {
  private readonly calls: MemoryWorkflowCallExecutor

  constructor(
    private readonly dailyBudget: number,
    private readonly existingSpend: number,
  ) {
    this.calls = new MemoryWorkflowCallExecutor(dailyBudget - existingSpend)
  }

  execute<T>(
    operationId: string,
    estimatedCost: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.calls.execute(operationId, estimatedCost, operation)
  }

  canReserve(estimatedCost: number): boolean {
    return this.existingSpend + this.calls.snapshot().spentCost + estimatedCost <= this.dailyBudget
  }

  canExecute(operationId: string, estimatedCost: number): boolean {
    return this.calls.snapshot().operationIds.includes(operationId) || this.canReserve(estimatedCost)
  }

  snapshot() {
    const snapshot = this.calls.snapshot()
    return {
      operationIds: snapshot.operationIds,
      spentCost: Number((this.existingSpend + snapshot.spentCost).toFixed(9)),
    }
  }
}

function setup(
  analyses: Array<IntelligenceRoundAnalysis | Error>,
  options: {
    duplicate?: boolean
    taskBudget?: number
    dailyBudget?: number
    researchCostPerRound?: number
    analysisCostPerRound?: number
    completionCostAfterFirstRound?: number
    budgetLimit?: number
    ledgerBudgetAuthoritative?: boolean
    existingSpend?: number
  } = {},
) {
  const research = new FakeResearchTool(options.duplicate)
  const intelligence = new FakeIntelligenceEngine(analyses)
  const checkpoints = new MemoryRealWorkflowCheckpointStore()
  const calls = options.existingSpend === undefined
    ? new MemoryWorkflowCallExecutor(options.dailyBudget ?? 1)
    : new WorkflowCallExecutorWithExistingSpend(
        options.dailyBudget ?? 1,
        options.existingSpend,
      )
  const workflow = new ControlledRealWorkflow(
    { researchTool: research, intelligenceEngine: intelligence },
    checkpoints,
    calls,
    {
      researchCostPerRound: options.researchCostPerRound ?? 0.06,
      analysisCostPerRound: options.analysisCostPerRound ?? 0.04,
      completionCostAfterFirstRound: options.completionCostAfterFirstRound ?? 0,
      budgetLimit: options.budgetLimit ?? Number.POSITIVE_INFINITY,
      ledgerBudgetAuthoritative: options.ledgerBudgetAuthoritative ?? false,
      now: () => new Date(timestamp),
    },
  )
  return {
    workflow,
    research,
    intelligence,
    checkpoints,
    calls,
    initialMission: mission(options.taskBudget === undefined
      ? {}
      : { limits: { ...mission().limits, taskBudgetEur: options.taskBudget } }),
  }
}

describe('orquestador real de dos rondas focalizadas', () => {
  it('termina en redacción cuando la ronda 1 es suficiente', async () => {
    const context = setup([analysis({ sufficient: true })])
    const result = await context.workflow.execute(context.initialMission, new AbortController().signal)

    expect(result).toMatchObject({
      state: 'ready_for_drafting',
      completedRounds: [1],
      providerCalls: 3,
      simulatedCost: 0.1,
    })
    expect(context.research.calls).toEqual([1])
  })

  it('no deja que una cobertura alta salte un bloqueo seguro de Aventura', async () => {
    const unsafeAnalysis = analysis({ importance: 'critical' })
    unsafeAnalysis.coverage = {
      ...unsafeAnalysis.coverage,
      score: 0.95,
      sufficient: true,
    }
    unsafeAnalysis.decision = { action: 'stop_ready', reason: 'Cobertura alta.', queries: [] }
    unsafeAnalysis.gaps[0] = {
      ...unsafeAnalysis.gaps[0]!,
      editorialContext: {
        affectedSection: 'ruta',
        centrality: 'critical',
        omittable: false,
        contextualizable: false,
        canBeDeclaredUnverified: false,
        temporalSensitivity: 'variable',
        inventionRisk: 'critical',
        evidenceThreshold: 'primary_required',
        estimatedUsefulEvidenceProbability: 0.2,
        estimatedMaterialChangeProbability: 0.8,
      },
    }
    const context = setup([unsafeAnalysis])
    const result = await context.workflow.execute(context.initialMission, new AbortController().signal)

    expect(result.state).toBe('review_required')
    expect(result.editorialSufficiency).toMatchObject({ status: 'unsafe_to_write' })
    expect(context.research.calls).toEqual([1])
  })

  it('ejecuta una única ronda 2 para una carencia relevante', async () => {
    const context = setup([analysis({ importance: 'high' }), analysis({ sufficient: true })])
    const result = await context.workflow.execute(context.initialMission, new AbortController().signal)

    expect(result).toMatchObject({
      state: 'ready_for_drafting',
      completedRounds: [1, 2],
      providerCalls: 6,
      simulatedCost: 0.2,
    })
    expect(context.research.calls).toEqual([1, 2])
    expect(context.intelligence.calls).toEqual([1, 2])
  })

  it('bloquea cualquier propuesta de tercera ronda', async () => {
    const context = setup([analysis({ importance: 'critical' }), analysis({ importance: 'critical' })])
    await expect(context.workflow.execute(
      context.initialMission,
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'THIRD_ROUND_BLOCKED' })
    expect(context.research.calls).toEqual([1, 2])
  })

  it('detecta consultas equivalentes y no repite investigación', async () => {
    const context = setup([analysis({
      importance: 'high',
      query: 'principal patrimonio de Morella',
    })])
    const result = await context.workflow.execute(context.initialMission, new AbortController().signal)

    expect(result.state).toBe('review_required')
    expect(context.research.calls).toEqual([1])
    expect(queryHash('Morella patrimonio principal')).toBe(queryHash('principal patrimonio de Morella'))
  })

  it('detiene antes de ronda 2 si no queda presupuesto de tarea', async () => {
    const context = setup([analysis({ importance: 'critical' })], { taskBudget: 0.15 })
    const result = await context.workflow.execute(context.initialMission, new AbortController().signal)

    expect(result.state).toBe('review_required')
    expect(context.research.calls).toEqual([1])
    expect(result.simulatedCost).toBe(0.1)
  })

  it('exige decisión humana antes de otra llamada si el coste restante no cabe en 0,20 EUR', async () => {
    const context = setup([analysis({ importance: 'critical' })], {
      dailyBudget: 0.2,
      researchCostPerRound: 0.05,
      analysisCostPerRound: 0.049838,
      completionCostAfterFirstRound: 0.13,
      budgetLimit: 0.2,
    })

    await expect(context.workflow.execute(
      context.initialMission,
      new AbortController().signal,
    )).rejects.toMatchObject({
      code: 'BUDGET_EXCEEDED',
      message: expect.stringContaining('faltan 0.029838 EUR'),
    })

    expect(context.research.calls).toEqual([1])
    expect(context.intelligence.calls).toEqual([1])
    expect(await context.checkpoints.load(context.initialMission.taskId)).toMatchObject({
      state: 'review_required',
      completedRound: 1,
      simulatedCost: 0.099838,
    })
    expect(context.calls.snapshot().spentCost).toBeCloseTo(0.099838, 9)
  })

  it('abre la barrera presupuestaria completa aunque la reserva de ronda 2 ya no quepa', async () => {
    const context = setup([analysis({
      importance: 'critical',
      estimatedCost: 0.097406,
    })], {
      dailyBudget: 0.2,
      existingSpend: 0.105406,
      researchCostPerRound: 0.048,
      analysisCostPerRound: 0.022,
      completionCostAfterFirstRound: 0.13,
      budgetLimit: 0.2,
      ledgerBudgetAuthoritative: true,
    })

    await expect(context.workflow.execute(
      context.initialMission,
      new AbortController().signal,
    )).rejects.toMatchObject({
      code: 'BUDGET_EXCEEDED',
      budgetRequirement: {
        remainingEstimatedCostEur: 0.205406,
        spentCostEur: 0.175406,
        availableCostEur: 0.024594,
        shortfallCostEur: 0.180812,
      },
    })

    expect(context.research.calls).toEqual([1])
    expect(context.intelligence.calls).toEqual([1])
    const checkpoint = await context.checkpoints.load(context.initialMission.taskId)
    expect(checkpoint).toMatchObject({
      state: 'review_required',
      completedRound: 1,
      nextRoundQueries: [{ id: 'query-focused' }],
      simulatedCost: 0.175406,
      lastAnalysisCost: 0.097406,
    })
    expect(checkpoint?.queryHashes).toContain(queryHash('Morella autobús frecuencia actual'))
  })

  it('amplía una carencia crítica y manda a revisión si sigue abierta', async () => {
    const context = setup([
      analysis({ importance: 'critical' }),
      analysis({ importance: 'critical', continueAfter: false }),
    ])
    const result = await context.workflow.execute(context.initialMission, new AbortController().signal)

    expect(result.state).toBe('review_required')
    expect(result.completedRounds).toEqual([1, 2])
    expect(result.unresolvedGaps[0].importance).toBe('critical')
  })

  it('no amplía una carencia secundaria', async () => {
    const context = setup([analysis({ importance: 'medium' })])
    const result = await context.workflow.execute(context.initialMission, new AbortController().signal)

    expect(result.state).toBe('ready_for_drafting')
    expect(context.research.calls).toEqual([1])
  })

  it('reanuda desde checkpoint sin repetir investigación ni coste', async () => {
    const context = setup([new Error('fallo sintético'), analysis({ sufficient: true })])
    await expect(context.workflow.execute(
      context.initialMission,
      new AbortController().signal,
    )).rejects.toThrow('fallo sintético')

    const restarted = new ControlledRealWorkflow(
      { researchTool: context.research, intelligenceEngine: context.intelligence },
      context.checkpoints,
      context.calls,
      {
        researchCostPerRound: 0.06,
        analysisCostPerRound: 0.04,
        now: () => new Date(timestamp),
      },
    )
    const result = await restarted.execute(context.initialMission, new AbortController().signal)

    expect(result.state).toBe('ready_for_drafting')
    expect(context.research.calls).toEqual([1])
    expect(context.calls.snapshot()).toMatchObject({ spentCost: 0.1 })
  })

  it('conserva cancelación en el checkpoint', async () => {
    const context = setup([analysis({ sufficient: true })])
    const controller = new AbortController()
    controller.abort()

    await expect(context.workflow.execute(context.initialMission, controller.signal)).rejects.toMatchObject({
      code: 'CANCELLED',
    })
    expect((await context.checkpoints.load(context.initialMission.taskId))?.state).toBe('cancelled')
    expect(context.research.calls).toEqual([])
  })

  it('deduplica fuentes entre rondas', async () => {
    const context = setup(
      [analysis({ importance: 'high' }), analysis({ sufficient: true })],
      { duplicate: true },
    )
    const result = await context.workflow.execute(context.initialMission, new AbortController().signal)

    expect(result.dossier.sources.map(item => item.normalizedUrl)).toEqual([
      'https://example.test/shared',
      'https://example.test/focused',
    ])
  })

  it('aplica las plazas globales a la ronda focalizada y limita el dossier', async () => {
    const research = new GlobalLimitResearchTool()
    const intelligence = new FakeIntelligenceEngine([
      analysis({ importance: 'high' }),
      analysis({ sufficient: true }),
    ])
    const workflow = new ControlledRealWorkflow(
      { researchTool: research, intelligenceEngine: intelligence },
      new MemoryRealWorkflowCheckpointStore(),
      new MemoryWorkflowCallExecutor(1),
      {
        researchCostPerRound: 0.01,
        analysisCostPerRound: 0.01,
        now: () => new Date(timestamp),
      },
    )
    const initialMission = mission({
      limits: { ...mission().limits, maxSources: 8 },
    })

    const result = await workflow.execute(initialMission, new AbortController().signal)

    expect(research.receivedLimits).toEqual([8, 5])
    expect(result.dossier.sources).toHaveLength(8)
    expect(result.dossier.sources.filter(item => item.round === 2).map(item => item.id))
      .toEqual([
        'source-round-two-first',
        'source-round-two-second',
        'source-round-two-third',
        'source-round-two-fourth',
        'source-round-two-fifth',
      ])
    expect(result.dossier.sources.map(item => item.id))
      .not.toContain('source-round-two-sixth')
  })

  it('releer un resultado terminal no duplica llamadas ni coste', async () => {
    const context = setup([analysis({ sufficient: true })])
    const first = await context.workflow.execute(context.initialMission, new AbortController().signal)
    const second = await context.workflow.execute(context.initialMission, new AbortController().signal)

    expect(second).toEqual(first)
    expect(context.research.calls).toEqual([1])
    expect(context.intelligence.calls).toEqual([1])
    expect(context.calls.snapshot()).toMatchObject({
      operationIds: ['task-morella:round:1:research', 'task-morella:round:1:analysis'],
      spentCost: 0.1,
    })
  })
})
