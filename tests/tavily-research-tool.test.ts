import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_REAL_TAVILY_TIMEOUT_MS,
  MAX_REAL_TAVILY_TIMEOUT_MS,
  MIN_REAL_TAVILY_TIMEOUT_MS,
  readRealTavilyTimeoutPolicy,
  REAL_TAVILY_TIMEOUT_ENV,
  TavilyFetchTransport,
  TavilyResearchTool,
  type TavilyHttpResponse,
  type TavilyRequestFailureState,
  type TavilyRequestIdentity,
  type TavilyRequestJournal,
  type TavilyTransport,
} from '@modules/real-pipeline/tavily-research-tool'
import type { ProviderCallExecutionContext } from '@modules/real-pipeline'
import type { RealResearchMission } from '@shared/real-pipeline-contracts'

const timestamp = '2026-07-25T11:00:00.000Z'

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
    profiles: [{ profile: 'adventure', enabled: true, targetWords: 1_000 }],
    depth: 'standard',
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

function search(results = [{
  url: 'https://example.test/morella?utm_source=fixture&b=2&a=1#top',
  title: 'Morella oficial',
  content: 'Resumen',
  score: 0.92,
}], requestId = 'search-request', credits = 1): TavilyHttpResponse {
  return { status: 200, body: { request_id: requestId, results, usage: { credits } } }
}

function extract(
  results = [{
    url: 'https://example.test/morella?utm_source=fixture&b=2&a=1#top',
    raw_content: 'Contenido completo y sintético de Morella.',
  }],
  failedResults: Array<{ url: string; error: string }> = [],
  requestId = 'extract-request',
  credits = 2,
): TavilyHttpResponse {
  return {
    status: 200,
    body: { request_id: requestId, results, failed_results: failedResults, usage: { credits } },
  }
}

class FixtureTransport implements TavilyTransport {
  readonly calls: Array<{ pathname: string; body: Record<string, unknown> }> = []
  constructor(
    private readonly responses: TavilyHttpResponse[],
    private readonly behavior?: (signal: AbortSignal) => Promise<TavilyHttpResponse>,
    readonly abortGuarantee: 'best_effort' | 'confirmed' = 'best_effort',
  ) {}

  async post(pathname: '/search' | '/extract', body: Record<string, unknown>, signal: AbortSignal) {
    this.calls.push({ pathname, body })
    if (this.behavior) return this.behavior(signal)
    const response = this.responses.shift()
    if (!response) throw new Error('Fixture no configurado')
    return response
  }
}

function tool(transport: TavilyTransport, limits: Record<string, number> = {}) {
  return new TavilyResearchTool(transport, limits, { now: () => new Date(timestamp) })
}

const executionContext: ProviderCallExecutionContext = {
  operationId: 'task-morella:round:2:research',
  reservationId: 'reservation-tavily-1',
  callId: 'call-tavily-1',
  attempt: 1,
}

class MemoryTavilyRequestJournal implements TavilyRequestJournal {
  readonly responses = new Map<string, TavilyHttpResponse>()
  readonly startedRequests: TavilyRequestIdentity[] = []
  readonly completedRequests: Array<{ identity: TavilyRequestIdentity; late: boolean }> = []
  readonly reusedRequests: TavilyRequestIdentity[] = []
  readonly failures: TavilyRequestFailureState[] = []

  async load(identity: TavilyRequestIdentity) {
    const response = this.responses.get(identity.correlationId)
    return response ? { response: structuredClone(response), billable: false } : undefined
  }

  async started(identity: TavilyRequestIdentity) {
    this.startedRequests.push(structuredClone(identity))
  }

  async completed(
    identity: TavilyRequestIdentity,
    response: TavilyHttpResponse,
    late: boolean,
  ) {
    this.responses.set(identity.correlationId, structuredClone(response))
    this.completedRequests.push({ identity: structuredClone(identity), late })
  }

  async reused(identity: TavilyRequestIdentity) {
    this.reusedRequests.push(structuredClone(identity))
  }

  async failed(_identity: TavilyRequestIdentity, state: TavilyRequestFailureState) {
    this.failures.push(structuredClone(state))
  }
}

class FailingDiagnosticJournal extends MemoryTavilyRequestJournal {
  override async failed() {
    throw new Error('JOURNAL_DIAGNOSTIC_FAILURE')
  }
}

describe('Tavily ResearchTool sin red', () => {
  it('aplica una política de timeout acotada, configurable y segura', () => {
    expect(readRealTavilyTimeoutPolicy({})).toEqual({
      timeoutMs: DEFAULT_REAL_TAVILY_TIMEOUT_MS,
      source: 'default',
    })
    expect(readRealTavilyTimeoutPolicy({
      [REAL_TAVILY_TIMEOUT_ENV]: String(MIN_REAL_TAVILY_TIMEOUT_MS),
    })).toEqual({
      timeoutMs: MIN_REAL_TAVILY_TIMEOUT_MS,
      source: 'environment',
    })
    expect(readRealTavilyTimeoutPolicy({
      [REAL_TAVILY_TIMEOUT_ENV]: String(MAX_REAL_TAVILY_TIMEOUT_MS + 1),
    })).toEqual({
      timeoutMs: DEFAULT_REAL_TAVILY_TIMEOUT_MS,
      source: 'invalid_environment_fallback',
    })
    expect(readRealTavilyTimeoutPolicy({
      [REAL_TAVILY_TIMEOUT_ENV]: '10s',
    })).toEqual({
      timeoutMs: DEFAULT_REAL_TAVILY_TIMEOUT_MS,
      source: 'invalid_environment_fallback',
    })
  })

  it('ejecuta Search y Extract, normaliza, hashea y conserva score', async () => {
    const transport = new FixtureTransport([search(), extract()])
    const result = await tool(transport).research(mission(), new AbortController().signal)

    expect(transport.calls.map(call => call.pathname)).toEqual(['/search', '/extract'])
    expect(result.sources[0]).toMatchObject({
      normalizedUrl: 'https://example.test/morella?a=1&b=2',
      title: 'Morella oficial',
      score: 0.92,
      content: 'Contenido completo y sintético de Morella.',
    })
    expect(result.sources[0].contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.urlSanitization).toEqual({
      totalReceived: 2,
      accepted: 2,
      discarded: 0,
      discardReasons: {},
    })
  })

  it('devuelve un error específico sin invocar Extract cuando no hay ninguna URL válida', async () => {
    const transport = new FixtureTransport([search([])])
    await expect(tool(transport).research(
      mission(),
      new AbortController().signal,
    )).rejects.toMatchObject({
      code: 'NO_VALID_HTTPS_SOURCES',
      urlSanitization: {
        totalReceived: 0,
        accepted: 0,
        discarded: 0,
      },
    })

    expect(transport.calls).toHaveLength(1)
  })

  it('conserva HTTPS y descarta HTTP individualmente sin llamadas adicionales', async () => {
    const validUrl = 'https://example.test/morella'
    const transport = new FixtureTransport([
      search([
        { url: validUrl, title: 'Válida', content: '', score: 0.9 },
        { url: 'http://insecure.example/morella', title: 'HTTP', content: '', score: 0.8 },
      ]),
      extract([{ url: validUrl, raw_content: 'Contenido HTTPS.' }]),
    ])
    const result = await tool(transport).research(mission(), new AbortController().signal)

    expect(result.sources.map(source => source.url)).toEqual([validUrl])
    expect(result.urlSanitization).toEqual({
      totalReceived: 3,
      accepted: 2,
      discarded: 1,
      discardReasons: { http: 1 },
    })
    expect(transport.calls.map(call => call.pathname)).toEqual(['/search', '/extract'])
  })

  it.each([
    ['', 'empty'],
    ['/morella/patrimonio', 'relative'],
    ['https://exa mple.test/morella', 'malformed'],
    ['ftp://example.test/morella', 'unsupported_scheme'],
  ])('descarta la URL %j como %s y no intenta Extract', async (url, reason) => {
    const transport = new FixtureTransport([
      search([{ url, title: 'Inválida', content: '', score: 0.9 }]),
    ])

    await expect(tool(transport).research(
      mission(),
      new AbortController().signal,
    )).rejects.toMatchObject({
      code: 'NO_VALID_HTTPS_SOURCES',
      urlSanitization: {
        totalReceived: 1,
        accepted: 0,
        discarded: 1,
        discardReasons: { [reason]: 1 },
      },
      providerUsage: {
        providerRequestIds: ['search-request'],
        credits: 1,
        calculatedCost: 0.008,
        toolCalls: 1,
      },
    })
    expect(transport.calls.map(call => call.pathname)).toEqual(['/search'])
  })

  it('agrega todos los motivos cuando todos los resultados son inválidos', async () => {
    const transport = new FixtureTransport([
      search([
        { url: '', title: 'Vacía', content: '', score: 0.9 },
        { url: '../relative', title: 'Relativa', content: '', score: 0.8 },
        { url: 'https://bad host.test', title: 'Malformada', content: '', score: 0.7 },
        { url: 'http://example.test', title: 'HTTP', content: '', score: 0.6 },
        { url: 'mailto:info@example.test', title: 'Otro esquema', content: '', score: 0.5 },
      ]),
    ])

    await expect(tool(transport).research(
      mission(),
      new AbortController().signal,
    )).rejects.toMatchObject({
      code: 'NO_VALID_HTTPS_SOURCES',
      urlSanitization: {
        totalReceived: 5,
        accepted: 0,
        discarded: 5,
        discardReasons: {
          empty: 1,
          relative: 1,
          malformed: 1,
          http: 1,
          unsupported_scheme: 1,
        },
      },
    })
    expect(transport.calls).toHaveLength(1)
  })

  it('registra una fuente rota sin inventar contenido', async () => {
    const brokenUrl = 'https://example.test/morella'
    const transport = new FixtureTransport([
      search([{ url: brokenUrl, title: 'Rota', content: '', score: 0.5 }]),
      extract([], [{ url: brokenUrl, error: 'EXTRACT_UNAVAILABLE' }]),
    ])
    await expect(tool(transport).research(
      mission(),
      new AbortController().signal,
    )).rejects.toMatchObject({
      code: 'INSUFFICIENT_VALID_SOURCES',
      urlSanitization: {
        totalReceived: 2,
        accepted: 1,
        discarded: 1,
        discardReasons: { extraction_failed: 1 },
      },
      providerUsage: {
        providerRequestIds: ['search-request', 'extract-request'],
        credits: 3,
        calculatedCost: 0.024,
        toolCalls: 2,
      },
    })
  })

  it('deduplica variantes técnicas de una URL y conserva el score superior', async () => {
    const base = 'https://example.test/morella'
    const transport = new FixtureTransport([
      search([
        { url: `${base}?utm_source=one`, title: 'Primera', content: '', score: 0.4 },
        { url: `${base}#fragment`, title: 'Mejor', content: '', score: 0.9 },
      ]),
      extract([{ url: base, raw_content: 'Contenido único.' }]),
    ])
    const result = await tool(transport).research(mission(), new AbortController().signal)

    expect((transport.calls[1].body.urls as string[])).toHaveLength(1)
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({ title: 'Mejor', score: 0.9 })
    expect(result.urlSanitization).toMatchObject({
      totalReceived: 3,
      accepted: 2,
      discarded: 1,
      discardReasons: { duplicate: 1 },
    })
  })

  it('acepta extracción parcial y conserva fallos por separado', async () => {
    const one = 'https://example.test/one'
    const two = 'https://example.test/two'
    const transport = new FixtureTransport([
      search([
        { url: one, title: 'Uno', content: '', score: 0.9 },
        { url: two, title: 'Dos', content: '', score: 0.8 },
      ]),
      extract([{ url: one, raw_content: 'Contenido uno.' }], [{ url: two, error: 'BROKEN_SOURCE' }]),
    ])
    const result = await tool(transport).research(mission(), new AbortController().signal)

    expect(result.sources.map(source => source.title)).toEqual(['Uno'])
    expect(result.failures.map(failure => failure.url)).toEqual([two])
  })

  it('corta por timeout y aborta el transporte', async () => {
    let aborted = false
    const transport = new FixtureTransport([], signal => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true
        reject(new Error('abortado'))
      }, { once: true })
    }))

    await expect(tool(transport, { timeoutMs: 5 }).research(
      mission(),
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(aborted).toBe(true)
  })

  it('libera el reintento solo cuando el transporte confirma la cancelación', async () => {
    const journal = new MemoryTavilyRequestJournal()
    const transport = new FixtureTransport([], signal => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('abortado')), { once: true })
    }), 'confirmed')
    const research = new TavilyResearchTool(transport, { timeoutMs: 5 }, {
      now: () => new Date(timestamp),
      requestJournal: journal,
    })

    await expect(research.research(
      mission({ round: 2, focusedQueries: ['Morella patrimonio oficial'] }),
      new AbortController().signal,
      executionContext,
    )).rejects.toMatchObject({
      code: 'TIMEOUT_CANCELLED',
      requestState: {
        providerOutcome: 'cancelled_confirmed',
        retrySafe: true,
        query: 'Morella patrimonio oficial',
      },
    })
    expect(journal.failures).toEqual([
      expect.objectContaining({
        providerOutcome: 'cancelled_confirmed',
        retrySafe: true,
      }),
    ])
    expect(journal.responses).toHaveLength(0)
  })

  it('mantiene ambigua una cancelación humana tras iniciar el envío', async () => {
    const controller = new AbortController()
    const transport = new FixtureTransport([], signal => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('abortado')), { once: true })
    }))
    const execution = tool(transport).research(mission(), controller.signal)
    controller.abort()

    await expect(execution).rejects.toMatchObject({ code: 'NETWORK_AMBIGUOUS' })
  })

  it('persiste una respuesta tardía y la reutiliza sin repetir Search ni su coste', async () => {
    const journal = new MemoryTavilyRequestJournal()
    const lateTransport = new FixtureTransport([], async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
      return search(undefined, 'late-search-request', 1)
    })
    const firstTool = new TavilyResearchTool(lateTransport, { timeoutMs: 5 }, {
      now: () => new Date(timestamp),
      requestJournal: journal,
    })
    const roundTwoMission = mission({
      round: 2,
      focusedQueries: ['Morella patrimonio oficial'],
    })

    await expect(firstTool.research(
      roundTwoMission,
      new AbortController().signal,
      executionContext,
    )).rejects.toMatchObject({
      code: 'TIMEOUT',
      requestState: {
        providerOutcome: 'ambiguous',
        retrySafe: false,
        query: 'Morella patrimonio oficial',
      },
    })
    await vi.waitFor(() => {
      expect(journal.completedRequests).toEqual([
        expect.objectContaining({ late: true }),
      ])
    })
    expect(journal.failures).toEqual([
      expect.objectContaining({ providerOutcome: 'ambiguous', retrySafe: false }),
    ])

    const resumedTransport = new FixtureTransport([
      extract(undefined, [], 'resumed-extract-request', 2),
    ])
    const resumedTool = new TavilyResearchTool(resumedTransport, { timeoutMs: 5 }, {
      now: () => new Date(timestamp),
      requestJournal: journal,
    })
    const result = await resumedTool.research(
      roundTwoMission,
      new AbortController().signal,
      {
        ...executionContext,
        reservationId: 'reservation-tavily-2',
        callId: 'call-tavily-2',
        attempt: 2,
      },
    )

    expect(resumedTransport.calls.map(call => call.pathname)).toEqual(['/extract'])
    expect(journal.reusedRequests).toHaveLength(1)
    expect(result.providerRequestIds).toEqual([
      'late-search-request',
      'resumed-extract-request',
    ])
    expect(result.credits).toBe(3)
    expect(result.billableProviderRequestIds).toEqual(['resumed-extract-request'])
    expect(result.billableCredits).toBe(2)
  })

  it('no degrada un timeout ambiguo a fallo sin coste si falla el evento diagnóstico', async () => {
    const journal = new FailingDiagnosticJournal()
    const transport = new FixtureTransport([], signal => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('abortado')), { once: true })
    }))
    const research = new TavilyResearchTool(transport, { timeoutMs: 5 }, {
      now: () => new Date(timestamp),
      requestJournal: journal,
    })

    await expect(research.research(
      mission({ round: 2, focusedQueries: ['Morella patrimonio oficial'] }),
      new AbortController().signal,
      executionContext,
    )).rejects.toMatchObject({
      code: 'TIMEOUT',
      requestState: {
        providerOutcome: 'ambiguous',
        retrySafe: false,
      },
    })
  })

  it.each([
    [429, 'RATE_LIMITED'],
    [500, 'PROVIDER_ERROR'],
  ])('clasifica HTTP %i como %s', async (status, code) => {
    const transport = new FixtureTransport([{ status, body: {} }])
    await expect(tool(transport).research(
      mission(),
      new AbortController().signal,
    )).rejects.toMatchObject({ code })
  })

  it('rechaza payload inválido sin usar datos parciales', async () => {
    const transport = new FixtureTransport([{ status: 200, body: { results: 'invalid' } }])
    await expect(tool(transport).research(
      mission(),
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('suma créditos y conserva todos los request ID', async () => {
    const transport = new FixtureTransport([
      search(undefined, 'search-id', 1.5),
      extract(undefined, [], 'extract-id', 2.5),
    ])
    const result = await tool(transport).research(mission(), new AbortController().signal)

    expect(result.credits).toBe(4)
    expect(result.usageUnits).toBe(4)
    expect(result.providerRequestIds).toEqual(['search-id', 'extract-id'])
  })

  it('limita el número de URLs antes de Extract', async () => {
    const results = [1, 2, 3].map(index => ({
      url: `https://example.test/${index}`,
      title: `Fuente ${index}`,
      content: '',
      score: 1 - index / 10,
    }))
    const transport = new FixtureTransport([
      search(results),
      extract(results.slice(0, 2).map(result => ({ url: result.url, raw_content: result.title }))),
    ])
    const result = await tool(transport, { maxUrls: 2 }).research(mission(), new AbortController().signal)

    expect(transport.calls[1].body.urls).toEqual([
      'https://example.test/1',
      'https://example.test/2',
    ])
    expect(result.sources).toHaveLength(2)
  })

  it('trunca contenido al primer límite de caracteres', async () => {
    const transport = new FixtureTransport([
      search(),
      extract([{
        url: 'https://example.test/morella?utm_source=fixture&b=2&a=1#top',
        raw_content: '1234567890',
      }]),
    ])
    const result = await tool(transport, { maxCharactersPerSource: 5 }).research(
      mission(),
      new AbortController().signal,
    )

    expect(result.sources[0].content).toBe('12345')
  })

  it('mantiene fetch real desactivado por defecto', async () => {
    const fetchImplementation = vi.fn()
    const transport = new TavilyFetchTransport({
      credential: 'synthetic-only',
      fetchImplementation,
    })

    await expect(transport.post('/search', {}, new AbortController().signal)).rejects.toMatchObject({
      code: 'NETWORK_DISABLED',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })
})
