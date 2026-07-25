import { describe, expect, it, vi } from 'vitest'
import type { Response as OpenAIResponse } from 'openai/resources/responses/responses'
import {
  assertLiveProviderNetworkPermit,
  issueLiveProviderNetworkPermit,
  LiveProviderAccessError,
  type LiveProviderNetworkPermit,
} from '@modules/real-pipeline/live-provider-access'
import { OpenAISdkResponsesClient } from '@modules/real-pipeline/openai-responses-client'
import { REAL_EXECUTION_FEATURE_TOKEN } from '@modules/real-pipeline/real-pilot-gate'
import {
  TavilyFetchTransport,
  TavilyResearchError,
} from '@modules/real-pipeline/tavily-research-tool'
import type { ProviderCenterSnapshot } from '@shared/provider-center-contracts'
import { REAL_EDITORIAL_FEATURE_TOKEN } from '@shared/real-editorial-pilot-contracts'

const tavilyCredential = 'synthetic-tavily-live-key'
const openAICredential = 'synthetic-openai-live-key'

function providerCenter(): ProviderCenterSnapshot {
  return {
    secureStorageAvailable: true,
    simulationOnly: true,
    realClientsAvailable: true,
    externalCallsAllowed: false,
    pricingCatalogVersion: '2026-07-25.1',
    providers: [
      {
        id: 'tavily',
        displayName: 'Tavily',
        category: 'research_tool',
        configured: true,
        credentialMask: '••••••••',
        active: true,
        selectedModel: 'search-and-extract',
        availableModels: ['search-and-extract'],
        tariffStatus: 'current',
        tariffVerifiedAt: '2026-07-25T00:00:00.000+02:00',
        tariffReviewAfter: '2026-08-25T00:00:00.000+02:00',
        tariffCurrency: 'USD',
        tariffSummary: 'Tarifa Tavily oficial',
        connectionState: 'not_tested',
      },
      {
        id: 'openai',
        displayName: 'OpenAI',
        category: 'intelligence_engine',
        configured: true,
        credentialMask: '••••••••',
        active: true,
        selectedModel: 'gpt-5.6-luna',
        availableModels: ['gpt-5.6-luna'],
        tariffStatus: 'current',
        tariffVerifiedAt: '2026-07-25T00:00:00.000+02:00',
        tariffReviewAfter: '2026-08-25T00:00:00.000+02:00',
        tariffCurrency: 'USD',
        tariffSummary: 'Tarifa OpenAI oficial',
        connectionState: 'not_tested',
      },
    ],
  }
}

function gate(overrides: Record<string, unknown> = {}) {
  return {
    featureToken: REAL_EXECUTION_FEATURE_TOKEN,
    providerCenter: providerCenter(),
    preflightStatus: 'ready_for_live_connectivity_check',
    taskAuthorized: true,
    budgetReserved: true,
    globalGuardAcquired: true,
    ...overrides,
  }
}

function permit(): LiveProviderNetworkPermit {
  return issueLiveProviderNetworkPermit(gate())
}

describe('clientes reales cerrados por permisos e inyectables sin red', () => {
  it('mantiene el cliente inaccesible con feature flag apagada', () => {
    expect(() => issueLiveProviderNetworkPermit(gate({
      featureToken: 'false',
    }))).toThrow(expect.objectContaining({ code: 'REAL_FEATURE_DISABLED' }))
  })

  it('mantiene el cliente inaccesible sin preflight válido', () => {
    expect(() => issueLiveProviderNetworkPermit(gate({
      preflightStatus: 'blocked',
    }))).toThrow(expect.objectContaining({ code: 'PREFLIGHT_REQUIRED' }))
  })

  it('separa los permisos de conectividad y ejecución editorial', () => {
    expect(() => issueLiveProviderNetworkPermit(gate({
      featureToken: REAL_EDITORIAL_FEATURE_TOKEN,
    }))).toThrow(expect.objectContaining({ code: 'REAL_FEATURE_DISABLED' }))
    expect(() => issueLiveProviderNetworkPermit(gate({
      featureToken: REAL_EXECUTION_FEATURE_TOKEN,
      preflightStatus: 'ready_for_real_editorial_pilot',
    }))).toThrow(expect.objectContaining({ code: 'REAL_FEATURE_DISABLED' }))
    expect(() => issueLiveProviderNetworkPermit(gate({
      featureToken: REAL_EDITORIAL_FEATURE_TOKEN,
      preflightStatus: 'ready_for_real_editorial_pilot',
    }))).not.toThrow()
  })

  it('no emite permiso con tarifa caducada aunque se falsifique el estado textual', () => {
    const snapshot = providerCenter()
    snapshot.providers = snapshot.providers.map(provider =>
      provider.id === 'openai' ? { ...provider, tariffStatus: 'stale' } : provider)

    expect(() => issueLiveProviderNetworkPermit(gate({
      providerCenter: snapshot,
    }))).toThrow(expect.objectContaining({ code: 'PREFLIGHT_REQUIRED' }))
  })

  it.each([
    ['sin autorización humana', { taskAuthorized: false }, 'TASK_AUTHORIZATION_REQUIRED'],
    ['sin reserva', { budgetReserved: false }, 'BUDGET_RESERVATION_REQUIRED'],
    ['sin guarda', { globalGuardAcquired: false }, 'GLOBAL_GUARD_REQUIRED'],
  ])('bloquea %s', (_label, patch, code) => {
    expect(() => issueLiveProviderNetworkPermit(gate(patch))).toThrow(
      expect.objectContaining({ code }),
    )
  })

  it('no acepta permisos fabricados por un consumidor', () => {
    const fabricated = {} as LiveProviderNetworkPermit

    expect(() => assertLiveProviderNetworkPermit(fabricated)).toThrow(
      expect.objectContaining({ code: 'INVALID_NETWORK_PERMIT' }),
    )
  })

  it('Tavily usa endpoint oficial y Bearer sin introducir la clave en el body', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetchImplementation = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} })
      return new Response(JSON.stringify({
        request_id: 'synthetic-request-id',
        results: [],
        usage: { credits: 1 },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    const transport = new TavilyFetchTransport({
      credential: tavilyCredential,
      networkPermit: permit(),
      fetchImplementation,
    })

    const result = await transport.post(
      '/search',
      { query: 'Morella', include_usage: true },
      new AbortController().signal,
    )

    expect(result.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.tavily.com/search')
    expect(calls[0].init.headers).toMatchObject({
      authorization: `Bearer ${tavilyCredential}`,
      'content-type': 'application/json',
    })
    expect(calls[0].init.body).not.toContain(tavilyCredential)
  })

  it('Tavily no invoca fetch sin permiso emitido', async () => {
    const fetchImplementation = vi.fn()
    const transport = new TavilyFetchTransport({
      credential: tavilyCredential,
      fetchImplementation,
    })

    await expect(transport.post('/search', {}, new AbortController().signal))
      .rejects.toBeInstanceOf(TavilyResearchError)
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('OpenAI usa Responses, señal y uso cacheado con cliente SDK falso', async () => {
    const requests: unknown[] = []
    const client = new OpenAISdkResponsesClient(openAICredential, permit(), {
      clientFactory: credential => {
        expect(credential).toBe(openAICredential)
        return {
          responses: {
            create: async (request, options) => {
              requests.push({ request, signal: options.signal })
              return {
                id: 'resp_synthetic',
                status: 'completed',
                error: null,
                output_text: '{"ok":true}',
                output: [],
                incomplete_details: null,
                usage: {
                  input_tokens: 100,
                  output_tokens: 25,
                  total_tokens: 125,
                  input_tokens_details: { cached_tokens: 40 },
                  output_tokens_details: { reasoning_tokens: 0 },
                },
              } as unknown as OpenAIResponse
            },
          },
        }
      },
    })
    const signal = new AbortController().signal
    const response = await client.create({
      model: 'gpt-5.6-luna',
      input: [
        { role: 'system', content: 'Solo fixture.' },
        { role: 'user', content: '{}' },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'fixture',
          strict: true,
          schema: { type: 'object', additionalProperties: false },
        },
      },
      max_output_tokens: 100,
      store: false,
    }, signal)

    expect(requests).toEqual([
      expect.objectContaining({
        request: expect.objectContaining({
          model: 'gpt-5.6-luna',
          max_output_tokens: 100,
        }),
        signal,
      }),
    ])
    expect(response).toMatchObject({
      id: 'resp_synthetic',
      status: 'completed',
      output_text: '{"ok":true}',
      usage: {
        input_tokens: 100,
        output_tokens: 25,
        input_tokens_details: { cached_tokens: 40 },
      },
    })
  })

  it('OpenAI sanea un error SDK que contiene el secreto sintético', async () => {
    const client = new OpenAISdkResponsesClient(openAICredential, permit(), {
      clientFactory: () => ({
        responses: {
          create: async () => {
            throw new Error(`fallo interno ${openAICredential}`)
          },
        },
      }),
    })

    let failure: unknown
    try {
      await client.create({
        model: 'gpt-5.6-luna',
        input: [
          { role: 'system', content: 'Fixture.' },
          { role: 'user', content: '{}' },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'fixture',
            strict: true,
            schema: { type: 'object' },
          },
        },
        max_output_tokens: 10,
        store: false,
      }, new AbortController().signal)
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).not.toContain(openAICredential)
  })

  it('marca los errores del gate como no reintentables', () => {
    let failure: unknown
    try {
      issueLiveProviderNetworkPermit(gate({ budgetReserved: false }))
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(LiveProviderAccessError)
    expect(failure).toMatchObject({ retryable: false })
  })
})
