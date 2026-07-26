import { describe, expect, it, vi } from 'vitest'
import OpenAI, { OpenAI as NamedOpenAI } from 'openai'
import type { Response as OpenAIResponse } from 'openai/resources/responses/responses'
import {
  assertLiveProviderNetworkPermit,
  issueLiveProviderNetworkPermit,
  LiveProviderAccessError,
  type LiveProviderNetworkPermit,
} from '@modules/real-pipeline/live-provider-access'
import {
  inspectInstalledOpenAIResponsesCapability,
  inspectOpenAIResponsesClient,
  OpenAISdkResponsesClient,
} from '@modules/real-pipeline/openai-responses-client'
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

function openAIRequest() {
  return {
    model: 'gpt-5.6-luna',
    input: [
      { role: 'system' as const, content: 'Solo fixture.' },
      { role: 'user' as const, content: '{}' },
    ],
    text: {
      format: {
        type: 'json_schema' as const,
        name: 'fixture',
        strict: true as const,
        schema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
    },
    max_output_tokens: 100,
    store: false as const,
  }
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

  it('detecta responses.create en las construcciones default y named del SDK instalado sin red', () => {
    const fetchImplementation = vi.fn(async () => {
      throw new Error('NETWORK_MUST_NOT_RUN')
    })
    const options = {
      apiKey: 'sk-synthetic-capability-only',
      maxRetries: 0,
      fetch: fetchImplementation,
    }
    const defaultClient = new OpenAI(options)
    const namedClient = new NamedOpenAI(options)

    expect(inspectOpenAIResponsesClient(defaultClient)).toMatchObject({
      sdkVersion: '6.34.0',
      status: 'available',
      available: true,
    })
    expect(inspectOpenAIResponsesClient(namedClient)).toMatchObject({
      status: 'available',
      available: true,
    })
    expect(inspectInstalledOpenAIResponsesCapability()).toMatchObject({
      sdkVersion: '6.34.0',
      status: 'available',
      available: true,
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('distingue cliente mal construido, Responses ausente y create ausente', () => {
    expect(inspectInstalledOpenAIResponsesCapability(() => ({}))).toMatchObject({
      status: 'sdk_incompatible',
      available: false,
    })
    expect(() => new OpenAISdkResponsesClient(openAICredential, permit(), {
      clientFactory: () => null,
    })).toThrow(expect.objectContaining({ code: 'CLIENT_INVALID' }))
    expect(() => new OpenAISdkResponsesClient(openAICredential, permit(), {
      clientFactory: () => ({}),
    })).toThrow(expect.objectContaining({ code: 'RESPONSES_UNAVAILABLE' }))
    expect(() => new OpenAISdkResponsesClient(openAICredential, permit(), {
      clientFactory: () => ({ responses: {} }),
    })).toThrow(expect.objectContaining({ code: 'RESPONSES_CREATE_UNAVAILABLE' }))
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
    const response = await client.create(openAIRequest(), signal)

    expect(requests).toEqual([
      expect.objectContaining({
        request: expect.objectContaining({
          model: 'gpt-5.6-luna',
          max_output_tokens: 100,
        }),
        signal,
      }),
    ])
    expect(JSON.stringify(requests)).not.toContain(openAICredential)
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

  it.each([
    ['credencial inválida', { status: 401, code: 'invalid_api_key' }, 'AUTHENTICATION_ERROR'],
    ['modelo ausente', { status: 404, code: 'model_not_found', param: 'model' }, 'MODEL_UNAVAILABLE'],
    ['rechazo HTTP remoto', { status: 500, requestID: 'request-synthetic' }, 'REMOTE_HTTP_ERROR'],
  ])('clasifica %s sin confundirlo con un método ausente', async (_label, sdkError, code) => {
    const client = new OpenAISdkResponsesClient(openAICredential, permit(), {
      clientFactory: () => ({
        responses: {
          create: async () => {
            throw sdkError
          },
        },
      }),
    })

    await expect(client.create(openAIRequest(), new AbortController().signal))
      .rejects.toMatchObject({ code })
  })

  it('conserva metadatos sanitizados de un HTTP 400 sin clasificarlo como red', async () => {
    const client = new OpenAISdkResponsesClient(openAICredential, permit(), {
      clientFactory: () => ({
        responses: {
          create: async () => {
            throw {
              status: 400,
              requestID: 'req_schema_synthetic',
              error: {
                type: 'invalid_request_error',
                code: 'invalid_json_schema',
                param: 'text.format.schema',
                message: 'Invalid schema for response_format: object must be closed.',
              },
            }
          },
        },
      }),
    })

    await expect(client.create(openAIRequest(), new AbortController().signal))
      .rejects.toMatchObject({
        code: 'REMOTE_HTTP_ERROR',
        remoteError: {
          status: 400,
          type: 'invalid_request_error',
          code: 'invalid_json_schema',
          param: 'text.format.schema',
          requestId: 'req_schema_synthetic',
          message: 'Invalid schema for response_format: object must be closed.',
        },
        providerUsage: {
          providerRequestIds: ['req_schema_synthetic'],
          calculatedCost: 0,
          credits: 0,
        },
      })
  })

  it('rechaza un payload incompatible sin invocar responses.create', async () => {
    const create = vi.fn()
    const client = new OpenAISdkResponsesClient(openAICredential, permit(), {
      clientFactory: () => ({ responses: { create } }),
    })
    const request = { ...openAIRequest(), response_format: { type: 'json_object' } }

    await expect(client.create(
      request as Parameters<OpenAISdkResponsesClient['create']>[0],
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(create).not.toHaveBeenCalled()
  })

  it('distingue una respuesta remota inválida de la ausencia de Responses', async () => {
    const client = new OpenAISdkResponsesClient(openAICredential, permit(), {
      clientFactory: () => ({
        responses: {
          create: async () => ({
            id: 'resp_invalid_state',
            status: 'queued',
            error: null,
            output: [],
          }),
        },
      }),
    })

    await expect(client.create(openAIRequest(), new AbortController().signal))
      .rejects.toMatchObject({ code: 'REMOTE_INVALID_RESPONSE' })
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
      await client.create(openAIRequest(), new AbortController().signal)
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(Error)
    expect(failure).toMatchObject({ code: 'CLIENT_ERROR' })
    expect(String(failure)).not.toContain(openAICredential)
  })

  it('sanea también el cuerpo remoto antes de exponer sus metadatos', async () => {
    const client = new OpenAISdkResponsesClient(openAICredential, permit(), {
      clientFactory: () => ({
        responses: {
          create: async () => {
            throw {
              status: 400,
              requestID: 'req_sanitized',
              error: {
                type: 'invalid_request_error',
                code: 'invalid_json_schema',
                param: 'text.format.schema',
                message: `Authorization Bearer ${openAICredential}`,
              },
            }
          },
        },
      }),
    })

    let failure: unknown
    try {
      await client.create(openAIRequest(), new AbortController().signal)
    } catch (error) {
      failure = error
    }

    expect(JSON.stringify(failure)).not.toContain(openAICredential)
    expect(failure).toMatchObject({
      remoteError: { message: '[redacted] [redacted]' },
    })
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
