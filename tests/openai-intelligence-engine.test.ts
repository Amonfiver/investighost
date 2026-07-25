import { describe, expect, it } from 'vitest'
import {
  OpenAIIntelligenceEngine,
  type OpenAIResponseEnvelope,
  type OpenAIResponseRequest,
  type OpenAIResponsesClient,
} from '@modules/real-pipeline/openai-intelligence-engine'
import { OpenAIProfileCoverageSchema } from '@shared/openai-intelligence-contracts'
import type {
  RealMasterKnowledge,
  RealResearchDossier,
  RealResearchMission,
} from '@shared/real-pipeline-contracts'

const timestamp = '2026-07-25T11:30:00.000Z'
const hash = 'a'.repeat(64)

function profileCoverage(profile: 'adventure' | 'student', sufficient = true) {
  return {
    profile,
    score: sufficient ? 0.9 : 0.4,
    sufficient,
    requirements: profile === 'adventure'
      ? { routes: 1, specific_places: 1, access: 0.9, duration: 0.9, costs: 0.8, season: 0.8, risks: 0.8 }
      : { history: 1, dates: 0.9, population: 0.8, monuments: 1, culture: 0.9, daily_life: 0.8 },
    warnings: sufficient ? [] : ['Cobertura insuficiente'],
  }
}

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
    objectives: ['historia y patrimonio'],
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

function dossier(rounds: Array<1 | 2> = [1]): RealResearchDossier {
  return {
    requestId: 'request-morella',
    runId: 'run-morella',
    taskId: 'task-morella',
    destinationId: 'destination-morella',
    rounds,
    sources: [{
      id: 'source-official',
      round: rounds[rounds.length - 1],
      url: 'https://example.test/morella',
      normalizedUrl: 'https://example.test/morella',
      title: 'Fuente oficial sintética',
      capturedAt: timestamp,
      contentHash: hash,
      score: 0.95,
      content: 'Morella conserva murallas y castillo.',
    }],
    evidence: [{
      id: 'evidence-walls',
      statement: 'Morella conserva un recinto amurallado.',
      sourceIds: ['source-official'],
      confidence: 0.95,
      contradiction: 'none',
      freshness: 'current',
    }],
    generatedAt: timestamp,
  }
}

function analysisOutput(overrides: Record<string, unknown> = {}) {
  const gap = {
    id: 'gap-access',
    topic: 'access',
    description: 'Falta frecuencia de autobús.',
    importance: 'high',
    requiredForProfiles: ['adventure'],
    resolvableWithResearch: true,
  }
  return {
    claims: [{
      id: 'claim-walls',
      topic: 'heritage',
      statement: 'Morella conserva un recinto amurallado.',
      evidenceIds: ['evidence-walls'],
      confidence: 0.95,
      suitableProfiles: ['adventure', 'student'],
    }],
    contradictions: ['Dos fechas secundarias requieren contraste.'],
    coverage: {
      score: 0.72,
      sufficient: false,
      topics: [{ topic: 'access', required: true, coverage: 0.3, evidenceIds: [] }],
    },
    profileCoverage: [profileCoverage('adventure', false), profileCoverage('student')],
    gaps: [gap],
    proposedQueries: [{
      id: 'query-access',
      gapId: 'gap-access',
      query: 'Morella autobús frecuencia actual',
      rationale: 'Completar el acceso.',
    }],
    decision: {
      action: 'continue_focused',
      nextRound: 2,
      reason: 'Falta acceso actualizado.',
      queries: [{
        id: 'query-access',
        gapId: 'gap-access',
        query: 'Morella autobús frecuencia actual',
        rationale: 'Completar el acceso.',
      }],
    },
    ...overrides,
  }
}

function masterKnowledge(): RealMasterKnowledge {
  return {
    requestId: 'request-morella',
    destinationId: 'destination-morella',
    revision: 1,
    claims: analysisOutput().claims as RealMasterKnowledge['claims'],
    contradictions: ['Dos fechas secundarias requieren contraste.'],
    generatedAt: timestamp,
  }
}

function draftOutput(profile: 'adventure' | 'student', words: number) {
  return {
    profile,
    title: profile === 'adventure' ? 'Morella tras las murallas' : 'Morella, historia viva',
    content: profile === 'adventure'
      ? 'Ruta sintética con accesos, duración, costes, temporada y riesgos.'
      : 'Explicación sintética de historia, fechas, población, monumentos, cultura y vida cotidiana.',
    approximateWordCount: words,
    coverage: profileCoverage(profile),
  }
}

function response(
  output?: unknown,
  overrides: Partial<OpenAIResponseEnvelope> = {},
): OpenAIResponseEnvelope {
  return {
    id: 'response-synthetic',
    status: 'completed',
    output_text: output === undefined ? undefined : JSON.stringify(output),
    usage: { input_tokens: 1_000, output_tokens: 500 },
    ...overrides,
  }
}

class FakeResponsesClient implements OpenAIResponsesClient {
  readonly requests: OpenAIResponseRequest[] = []
  constructor(
    private readonly responses: OpenAIResponseEnvelope[] = [],
    private readonly behavior?: (signal: AbortSignal) => Promise<OpenAIResponseEnvelope>,
  ) {}

  async create(request: OpenAIResponseRequest, signal: AbortSignal): Promise<OpenAIResponseEnvelope> {
    this.requests.push(request)
    if (this.behavior) return this.behavior(signal)
    const next = this.responses.shift()
    if (!next) throw new Error('Respuesta fake no configurada')
    return next
  }
}

function engine(client: OpenAIResponsesClient, overrides: Record<string, number | string> = {}) {
  return new OpenAIIntelligenceEngine(client, {
    model: 'gpt-synthetic-structured',
    promptVersion: 'editorial-test-v2',
    schemaVersion: 'schema-test-v1',
    maxOutputTokens: 4_000,
    timeoutMs: 30,
    inputCostPerMillionEur: 1,
    outputCostPerMillionEur: 2,
    ...overrides,
  })
}

describe('OpenAI IntelligenceEngine estructurado y sin red', () => {
  it('crea conocimiento maestro correcto desde el expediente', async () => {
    const client = new FakeResponsesClient([response(analysisOutput())])
    const result = await engine(client).analyze(mission(), dossier(), new AbortController().signal)

    expect(result.masterKnowledge.claims[0].statement).toContain('amurallado')
    expect(result.masterKnowledge.revision).toBe(1)
    expect(result.coverage.score).toBe(0.72)
  })

  it('conserva contradicciones, carencias y consultas focalizadas', async () => {
    const result = await engine(new FakeResponsesClient([response(analysisOutput())])).analyze(
      mission(),
      dossier(),
      new AbortController().signal,
    )

    expect(result.masterKnowledge.contradictions).toHaveLength(1)
    expect(result.proposedQueries[0]).toMatchObject({
      gapId: 'gap-access',
      query: 'Morella autobús frecuencia actual',
    })
    expect(result.decision.action).toBe('continue_focused')
  })

  it('genera perfiles diferenciados con extensión solicitada y prompt versionado', async () => {
    const client = new FakeResponsesClient([
      response(draftOutput('adventure', 1_000)),
      response(draftOutput('student', 1_800)),
    ])
    const drafts = await engine(client).draft(mission(), masterKnowledge(), new AbortController().signal)

    expect(drafts.map(draft => [draft.profile, draft.approximateWordCount])).toEqual([
      ['adventure', 1_000],
      ['student', 1_800],
    ])
    expect(drafts[0].content).not.toBe(drafts[1].content)
    expect(drafts.every(draft => draft.promptVersion === 'editorial-test-v2')).toBe(true)
    expect(client.requests[0].input[1].content).toContain('"targetWords":1000')
    expect(client.requests[1].input[1].content).toContain('"targetWords":1800')
  })

  it('representa insuficiencia por perfil con requisitos distintos', () => {
    expect(OpenAIProfileCoverageSchema.parse(profileCoverage('adventure', false)).sufficient).toBe(false)
    expect(OpenAIProfileCoverageSchema.safeParse({
      ...profileCoverage('student'),
      requirements: { history: 1 },
    }).success).toBe(false)
  })

  it('realiza revisión final estructurada', async () => {
    const reviewOutput = {
      outcome: 'passed_with_warnings',
      issues: ['Revisar vigencia de transporte.'],
      profileCoverage: [profileCoverage('adventure'), profileCoverage('student')],
    }
    const result = await engine(new FakeResponsesClient([response(reviewOutput)])).review(
      mission(),
      masterKnowledge(),
      [
        { ...draftOutput('adventure', 1_000), promptVersion: 'v', schemaVersion: 'v', usage: { inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: 'EUR' } },
        { ...draftOutput('student', 1_800), promptVersion: 'v', schemaVersion: 'v', usage: { inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: 'EUR' } },
      ],
      new AbortController().signal,
    )

    expect(result).toMatchObject({
      outcome: 'passed_with_warnings',
      issues: ['Revisar vigencia de transporte.'],
    })
  })

  it('clasifica refusal sin exponer su texto', async () => {
    const client = new FakeResponsesClient([response(undefined, { refusal: 'contenido sensible' })])
    await expect(engine(client).analyze(
      mission(),
      dossier(),
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'REFUSAL' })
  })

  it('clasifica incomplete y no reintenta ambiguamente', async () => {
    const client = new FakeResponsesClient([response(undefined, {
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
    })])
    await expect(engine(client).analyze(
      mission(),
      dossier(),
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'INCOMPLETE' })
    expect(client.requests).toHaveLength(1)
  })

  it('rechaza JSON inválido y salida ajena al schema', async () => {
    const invalidJson = response()
    invalidJson.output_text = '{'
    await expect(engine(new FakeResponsesClient([invalidJson])).analyze(
      mission(),
      dossier(),
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })

    await expect(engine(new FakeResponsesClient([response({ arbitrary: true })])).analyze(
      mission(),
      dossier(),
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('impide que una ronda 2 proponga otra ampliación', async () => {
    await expect(engine(new FakeResponsesClient([response(analysisOutput())])).analyze(
      mission({ round: 2, focusedQueries: ['Morella acceso'], createdAt: timestamp }),
      dossier([1, 2]),
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('aplica timeout abortando el cliente', async () => {
    let aborted = false
    const client = new FakeResponsesClient([], signal => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true
        reject(new Error('abortado'))
      }, { once: true })
    }))
    await expect(engine(client, { timeoutMs: 5 }).analyze(
      mission(),
      dossier(),
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(aborted).toBe(true)
  })

  it('aplica cancelación humana abortando el cliente', async () => {
    const controller = new AbortController()
    const client = new FakeResponsesClient([], signal => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('abortado')), { once: true })
    }))
    const execution = engine(client).analyze(mission(), dossier(), controller.signal)
    controller.abort()
    await expect(execution).rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('mide tokens y calcula coste estimado con tarifa inyectada', async () => {
    const result = await engine(new FakeResponsesClient([response(analysisOutput())])).analyze(
      mission(),
      dossier(),
      new AbortController().signal,
    )
    expect(result.usage).toEqual({
      inputTokens: 1_000,
      outputTokens: 500,
      estimatedCost: 0.002,
      currency: 'EUR',
    })
  })

  it('envía modelo, límite y Structured Outputs sin navegación web', async () => {
    const client = new FakeResponsesClient([response(analysisOutput())])
    await engine(client).analyze(mission(), dossier(), new AbortController().signal)
    const request = client.requests[0]

    expect(request).toMatchObject({
      model: 'gpt-synthetic-structured',
      max_output_tokens: 4_000,
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    })
    expect(request.text.format.schema).toMatchObject({ type: 'object', additionalProperties: false })
    expect(request).not.toHaveProperty('tools')
    expect(JSON.stringify(request)).not.toContain('web_search')
    expect(request.input[0].content).toContain('editorial-test-v2')
  })
})
