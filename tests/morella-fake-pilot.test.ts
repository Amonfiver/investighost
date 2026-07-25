import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  CostLedgerService,
  createProviderCallPayloadFingerprint,
  FullRealEditorialPipeline,
  LedgeredWorkflowCallExecutor,
  MemoryCostLedgerRepository,
  MemoryRealWorkflowCheckpointStore,
  OpenAIIntelligenceEngine,
  ControlledRealWorkflow,
  TavilyResearchTool,
  type LedgeredCallMetadataFactory,
  type OpenAIResponseEnvelope,
  type OpenAIResponseRequest,
  type OpenAIResponsesClient,
  type TavilyHttpResponse,
  type TavilyTransport,
} from '@modules/real-pipeline'
import {
  defaultRealProfileSettings,
  missionProfilesFromSettings,
} from '@shared/real-profile-settings'
import type { RealResearchMission } from '@shared/real-pipeline-contracts'

const timestamp = '2026-07-25T13:00:00.000Z'

class QueueTavilyTransport implements TavilyTransport {
  readonly calls: string[] = []
  active = 0
  maxActive = 0

  constructor(private readonly responses: TavilyHttpResponse[]) {}

  async post(pathname: '/search' | '/extract'): Promise<TavilyHttpResponse> {
    this.calls.push(pathname)
    this.active += 1
    this.maxActive = Math.max(this.maxActive, this.active)
    try {
      const response = this.responses.shift()
      if (!response) throw new Error('Fixture Tavily agotado')
      return structuredClone(response)
    } finally {
      this.active -= 1
    }
  }
}

class QueueOpenAIClient implements OpenAIResponsesClient {
  readonly requests: OpenAIResponseRequest[] = []
  active = 0
  maxActive = 0

  constructor(private readonly responses: Array<OpenAIResponseEnvelope | Error>) {}

  async create(request: OpenAIResponseRequest): Promise<OpenAIResponseEnvelope> {
    this.requests.push(request)
    this.active += 1
    this.maxActive = Math.max(this.maxActive, this.active)
    try {
      const response = this.responses.shift()
      if (response instanceof Error) throw response
      if (!response) throw new Error('Fixture OpenAI agotado')
      return structuredClone(response)
    } finally {
      this.active -= 1
    }
  }
}

function openAIResponse(output: unknown): OpenAIResponseEnvelope {
  return {
    id: `response-${createHash('sha256').update(JSON.stringify(output)).digest('hex').slice(0, 12)}`,
    status: 'completed',
    output_text: JSON.stringify(output),
    usage: { input_tokens: 500, output_tokens: 250 },
  }
}

function coverage(profile: 'adventure' | 'student') {
  return {
    profile,
    score: 0.95,
    sufficient: true,
    requirements: profile === 'adventure'
      ? { routes: 1, specific_places: 1, access: 1, duration: 1, costs: 0.9, season: 0.9, risks: 0.9 }
      : { history: 1, dates: 1, population: 0.9, monuments: 1, culture: 1, daily_life: 0.9 },
    warnings: [],
  }
}

function analysisRoundOne() {
  const currentGap = {
    id: 'gap-morella-access',
    topic: 'access',
    description: 'Falta frecuencia actual del autobús.',
    importance: 'critical',
    requiredForProfiles: ['adventure'],
    resolvableWithResearch: true,
  }
  const query = {
    id: 'query-morella-access',
    gapId: currentGap.id,
    query: 'Morella frecuencia autobús actual',
    rationale: 'Cerrar una carencia práctica crítica.',
  }
  return {
    claims: [{
      id: 'claim-morella-walls',
      topic: 'heritage',
      statement: 'Morella conserva un recinto amurallado y castillo.',
      evidenceIds: ['evidence-morella'],
      confidence: 0.95,
      suitableProfiles: ['adventure', 'student'],
    }],
    contradictions: [],
    coverage: {
      score: 0.72,
      sufficient: false,
      topics: [{ topic: 'access', required: true, coverage: 0.2, evidenceIds: [] }],
    },
    profileCoverage: [{ ...coverage('adventure'), sufficient: false, score: 0.6 }, coverage('student')],
    gaps: [currentGap],
    proposedQueries: [query],
    decision: { action: 'continue_focused', nextRound: 2, reason: 'Carencia crítica.', queries: [query] },
  }
}

function analysisRoundTwo() {
  return {
    claims: [
      {
        id: 'claim-morella-walls',
        topic: 'heritage',
        statement: 'Morella conserva un recinto amurallado y castillo.',
        evidenceIds: ['evidence-morella'],
        confidence: 0.95,
        suitableProfiles: ['adventure', 'student'],
      },
      {
        id: 'claim-morella-bus',
        topic: 'access',
        statement: 'La fuente focalizada documenta el acceso en autobús.',
        evidenceIds: ['evidence-access'],
        confidence: 0.9,
        suitableProfiles: ['adventure', 'student'],
      },
    ],
    contradictions: [],
    coverage: {
      score: 0.95,
      sufficient: true,
      topics: [{ topic: 'access', required: true, coverage: 1, evidenceIds: ['evidence-access'] }],
    },
    profileCoverage: [coverage('adventure'), coverage('student')],
    gaps: [],
    proposedQueries: [],
    decision: { action: 'stop_ready', reason: 'Cobertura suficiente.', queries: [] },
  }
}

function draft(profile: 'adventure' | 'student', words: number) {
  const label = profile === 'adventure' ? 'ruta' : 'historia'
  return {
    profile,
    title: profile === 'adventure' ? 'Morella entre murallas' : 'Morella, aula de historia',
    content: Array.from({ length: words }, (_, index) => `${label}${index + 1}`).join(' '),
    approximateWordCount: words,
    coverage: coverage(profile),
  }
}

function review() {
  return {
    outcome: 'passed',
    issues: [],
    profileCoverage: [coverage('adventure'), coverage('student')],
  }
}

function tavilyFixtures(): TavilyHttpResponse[] {
  const initialUrl = 'https://fixtures.investighost.local/morella/official'
  const focusedUrl = 'https://fixtures.investighost.local/morella/access'
  const evidenceContent = Array.from({ length: 1_200 }, (_, index) => `evidencia${index + 1}`).join(' ')
  return [
    {
      status: 200,
      body: {
        request_id: 'tavily-search-round-1',
        results: [{ url: initialUrl, title: 'Morella oficial', content: '', score: 0.95 }],
        usage: { credits: 0 },
      },
    },
    {
      status: 200,
      body: {
        request_id: 'tavily-extract-round-1',
        results: [{ url: initialUrl, raw_content: evidenceContent }],
        failed_results: [],
        usage: { credits: 0 },
      },
    },
    {
      status: 200,
      body: {
        request_id: 'tavily-search-round-2',
        results: [{ url: focusedUrl, title: 'Acceso focalizado', content: '', score: 0.92 }],
        usage: { credits: 0 },
      },
    },
    {
      status: 200,
      body: {
        request_id: 'tavily-extract-round-2',
        results: [{ url: focusedUrl, raw_content: 'Acceso sintético actualizado en autobús.' }],
        failed_results: [],
        usage: { credits: 0 },
      },
    },
  ]
}

function mission(): RealResearchMission {
  const settings = defaultRealProfileSettings(new Date(timestamp))
  return {
    requestId: 'request-morella-fake',
    runId: 'run-morella-fake',
    taskId: 'task-morella-fake',
    destination: {
      canonicalId: 'destination-morella',
      name: 'Morella',
      countryCode: 'ES',
      type: 'locality',
    },
    language: 'es',
    profiles: missionProfilesFromSettings(settings),
    depth: 'deep',
    round: 1,
    objectives: ['patrimonio, cultura y vida práctica'],
    focusedQueries: [],
    limits: {
      maxRounds: 2,
      maxFocusedQueriesPerRound: 2,
      maxSources: 10,
      maxCharactersPerSource: 100_000,
      maxProviderCalls: 10,
      maxInputTokens: 30_000,
      maxOutputTokens: 10_000,
      taskBudgetEur: 0.2,
      batchBudgetEur: 0.2,
      dailyBudgetEur: 0.2,
    },
    createdAt: timestamp,
  }
}

function metadataFactory(): LedgeredCallMetadataFactory {
  return {
    create: (operationId, attempt, estimatedCost, retryOfCallId) => {
      const research = operationId.includes(':research')
      const stage = operationId.split(':').slice(-2).join('_')
      const operation = operationId.split(':').at(-1) ?? 'unknown'
      const providerId = research ? 'tavily' : 'openai'
      const model = research ? 'search-and-extract' : 'structured-responses'
      const tariffId = research ? 'tariff-tavily-synthetic' : 'tariff-openai-synthetic'
      return {
        idempotencyKey: `${operationId}:attempt:${attempt}`,
        executionId: 'execution-morella-fake',
        requestId: 'request-morella-fake',
        runId: 'run-morella-fake',
        taskId: 'task-morella-fake',
        batchId: 'batch-morella-fake',
        stage,
        operation,
        providerId,
        model,
        attempt,
        retryOfCallId,
        estimatedCost,
        currency: 'EUR',
        tariffId,
        promptVersion: 'morella-fake-v1',
        schemaVersion: 'real-v1',
        inputHash: createProviderCallPayloadFingerprint({
          executionId: 'execution-morella-fake',
          requestId: 'request-morella-fake',
          runId: 'run-morella-fake',
          taskId: 'task-morella-fake',
          batchId: 'batch-morella-fake',
          budgetDate: '2026-07-25',
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
          promptVersion: 'morella-fake-v1',
          schemaVersion: 'real-v1',
          payloadHash: createHash('sha256').update(operationId).digest('hex'),
          maxInputTokens: 200_000,
          maxOutputTokens: 50_000,
          maxToolCalls: research ? 2 : 1,
          maxCredits: research ? 10 : 0,
          tools: research ? ['search', 'extract'] : ['structured-output'],
        }),
      }
    },
  }
}

async function pilot(openAIQueue: Array<OpenAIResponseEnvelope | Error>) {
  const tavilyTransport = new QueueTavilyTransport(tavilyFixtures())
  const openAIClient = new QueueOpenAIClient(openAIQueue)
  const tavily = new TavilyResearchTool(tavilyTransport, {}, { now: () => new Date(timestamp) })
  const openAI = new OpenAIIntelligenceEngine(openAIClient, {
    model: 'structured-responses',
    promptVersion: 'morella-fake-v1',
    schemaVersion: 'real-v1',
    inputCostPerMillionEur: 0,
    outputCostPerMillionEur: 0,
  })
  const ledgerRepository = new MemoryCostLedgerRepository(
    { task: 0.2, batch: 0.2, daily: 0.2, currency: 'EUR' },
    {
      now: () => new Date(timestamp),
      id: (() => {
        let id = 0
        return () => `pilot-ledger-${++id}`
      })(),
    },
  )
  const ledger = new CostLedgerService(ledgerRepository, { now: () => new Date(timestamp) })
  expect(await ledger.acquireExecution(
    'execution-morella-fake',
    'lease-morella-fake',
    new Date('2026-07-25T14:00:00.000Z'),
  )).toBe(true)
  const calls = new LedgeredWorkflowCallExecutor(ledger, metadataFactory(), 0.2)
  const checkpoints = new MemoryRealWorkflowCheckpointStore()
  const workflow = new ControlledRealWorkflow(
    { researchTool: tavily, intelligenceEngine: openAI },
    checkpoints,
    calls,
    {
      researchCostPerRound: 0.03,
      analysisCostPerRound: 0.03,
      now: () => new Date(timestamp),
    },
  )
  const full = new FullRealEditorialPipeline(
    workflow,
    openAI,
    calls,
    { draftingCost: 0.05, reviewCost: 0.02 },
  )
  return {
    full,
    tavilyTransport,
    openAIClient,
    ledgerRepository,
    calls,
    checkpoints,
  }
}

function successfulOpenAIQueue(): OpenAIResponseEnvelope[] {
  return [
    openAIResponse(analysisRoundOne()),
    openAIResponse(analysisRoundTwo()),
    openAIResponse(draft('adventure', 1_000)),
    openAIResponse(draft('student', 1_800)),
    openAIResponse(review()),
  ]
}

describe('piloto integral Morella sin red', () => {
  it('completa dos rondas, dos borradores, revisión y ledger con 0,19 EUR simulados', async () => {
    const runtime = await pilot(successfulOpenAIQueue())
    const settings = defaultRealProfileSettings(new Date(timestamp))
    const result = await runtime.full.execute(mission(), settings, new AbortController().signal)
    const entries = await runtime.ledgerRepository.entries()
    const terminal = entries.filter(entry => ['succeeded', 'failed'].includes(entry.state))

    expect(result.research).toMatchObject({
      state: 'ready_for_drafting',
      completedRounds: [1, 2],
    })
    expect(result.research.dossier.sources).toHaveLength(2)
    expect(result.research.queryHashes).toHaveLength(2)
    expect(result.drafts.map(item => [item.profile, item.approximateWordCount])).toEqual([
      ['adventure', 1_000],
      ['student', 1_800],
    ])
    expect(result.review.outcome).toBe('passed')
    expect(result.evidenceAssessment.every(item => item.sufficient)).toBe(true)
    expect(runtime.calls.snapshot().spentCost).toBeCloseTo(0.19, 8)
    const taskBudget = runtime.ledgerRepository.budgetSnapshot().task
    expect(taskBudget.reserved).toBe(0)
    expect(taskBudget.spent).toBeCloseTo(0.19, 8)
    expect(terminal).toHaveLength(6)
    expect(terminal.every(entry => entry.state === 'succeeded')).toBe(true)
    expect(result).toMatchObject({
      publicationCount: 0,
      regenerationCount: 0,
      externalEffects: false,
    })
    expect(runtime.tavilyTransport.calls).toEqual(['/search', '/extract', '/search', '/extract'])
    expect(runtime.tavilyTransport.maxActive).toBe(1)
    expect(runtime.openAIClient.maxActive).toBe(1)
  })

  it('registra una incidencia, reanuda sin repetir Tavily y no duplica coste', async () => {
    const runtime = await pilot([
      new Error('incidencia sintética de análisis'),
      ...successfulOpenAIQueue(),
    ])
    const settings = defaultRealProfileSettings(new Date(timestamp))
    await expect(runtime.full.execute(
      mission(),
      settings,
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    expect(runtime.tavilyTransport.calls).toEqual(['/search', '/extract'])
    expect((await runtime.checkpoints.load('task-morella-fake'))?.state).toBe('analyzing_round_1')

    const result = await runtime.full.execute(mission(), settings, new AbortController().signal)
    const entries = await runtime.ledgerRepository.entries()
    const failed = entries.find(entry => entry.state === 'failed')
    const retried = entries.find(entry => entry.retryOfCallId === failed?.callId)

    expect(result.review.outcome).toBe('passed')
    expect(runtime.tavilyTransport.calls).toEqual(['/search', '/extract', '/search', '/extract'])
    expect(runtime.calls.snapshot().spentCost).toBeCloseTo(0.19, 8)
    expect(failed).toBeDefined()
    expect(retried).toMatchObject({ attempt: 2, state: 'reserved' })
    expect(entries.filter(entry => entry.state === 'succeeded')).toHaveLength(6)
  })

  it('mantiene proveedores simulados, sin loops ni efectos externos', async () => {
    const runtime = await pilot(successfulOpenAIQueue())
    const result = await runtime.full.execute(
      mission(),
      defaultRealProfileSettings(new Date(timestamp)),
      new AbortController().signal,
    )

    expect(result.research.completedRounds).toEqual([1, 2])
    expect(runtime.openAIClient.requests).toHaveLength(5)
    expect(runtime.openAIClient.requests.every(request => !('tools' in request))).toBe(true)
    expect(JSON.stringify(runtime.openAIClient.requests)).not.toContain('web_search')
    expect(result.publicationCount).toBe(0)
    expect(result.externalEffects).toBe(false)
  })
})
