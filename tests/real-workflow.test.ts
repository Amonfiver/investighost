import { describe, expect, it } from 'vitest'
import {
  ControlledRealWorkflow,
  MemoryRealWorkflowCheckpointStore,
  MemoryWorkflowCallExecutor,
  queryHash,
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
    usage: { inputTokens: 100, outputTokens: 50, estimatedCost: 0, currency: 'EUR' },
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
  } = {},
) {
  const research = new FakeResearchTool(options.duplicate)
  const intelligence = new FakeIntelligenceEngine(analyses)
  const checkpoints = new MemoryRealWorkflowCheckpointStore()
  const calls = new MemoryWorkflowCallExecutor(options.dailyBudget ?? 1)
  const workflow = new ControlledRealWorkflow(
    { researchTool: research, intelligenceEngine: intelligence },
    checkpoints,
    calls,
    {
      researchCostPerRound: options.researchCostPerRound ?? 0.06,
      analysisCostPerRound: options.analysisCostPerRound ?? 0.04,
      completionCostAfterFirstRound: options.completionCostAfterFirstRound ?? 0,
      budgetLimit: options.budgetLimit ?? Number.POSITIVE_INFINITY,
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
