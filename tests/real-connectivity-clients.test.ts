import { describe, expect, it } from 'vitest'
import {
  REAL_CONNECTIVITY_POLICY,
} from '@shared/real-connectivity-contracts'
import {
  LiveRealConnectivityNetwork,
  REAL_EXECUTION_FEATURE_TOKEN,
  RealConnectivityProviderError,
} from '@modules/real-pipeline'
import type { ProviderCenterService } from '@modules/real-pipeline/provider-center'

describe('clientes de conectividad real bajo transporte simulado', () => {
  it('Tavily envía un único Search basic, máximo un resultado y nunca Extract', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = []
    const network = new LiveRealConnectivityNetwork(
      fakeProviderCenter(),
      REAL_EXECUTION_FEATURE_TOKEN,
      {
        fetchImplementation: async (input, init) => {
          requests.push({
            url: String(input),
            body: JSON.parse(String(init?.body)) as Record<string, unknown>,
          })
          return new Response(JSON.stringify({
            request_id: 'request-simulated-1',
            results: [{ url: 'https://www.morella.net/' }],
            usage: { credits: 1 },
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        },
      },
    )

    const result = await network.tavilySearch(new AbortController().signal)

    expect(result).toMatchObject({ credits: 1, url: 'https://www.morella.net/' })
    expect(requests).toEqual([{
      url: 'https://api.tavily.com/search',
      body: {
        query: 'official website Morella Spain',
        topic: 'general',
        search_depth: 'basic',
        max_results: 1,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        auto_parameters: false,
        include_usage: true,
      },
    }])
    expect(requests[0].url).not.toContain('/extract')
  })

  it('Tavily clasifica 401 sin reintentar', async () => {
    let calls = 0
    const network = new LiveRealConnectivityNetwork(
      fakeProviderCenter(),
      REAL_EXECUTION_FEATURE_TOKEN,
      {
        fetchImplementation: async () => {
          calls += 1
          return new Response('{}', { status: 401 })
        },
      },
    )

    await expect(network.tavilySearch(new AbortController().signal))
      .rejects.toMatchObject<RealConnectivityProviderError>({
        code: 'TAVILY_AUTH_REJECTED',
        kind: 'failed',
        retryable: false,
      })
    expect(calls).toBe(1)
  })

  it('OpenAI histórico usa el modelo resuelto, store false y cero herramientas', async () => {
    let captured: Record<string, unknown> | undefined
    const network = new LiveRealConnectivityNetwork(
      fakeProviderCenter(),
      REAL_EXECUTION_FEATURE_TOKEN,
      {
        openAIClientFactory: () => ({
          responses: {
            create: async request => {
              captured = request as unknown as Record<string, unknown>
              return {
                id: 'response-simulated-1',
                status: 'completed',
                error: null,
                output: [],
                output_text: 'CONEXION_OPENAI_OK',
                usage: {
                  input_tokens: 12,
                  output_tokens: 5,
                  input_tokens_details: { cached_tokens: 0 },
                },
              } as never
            },
          },
        }),
      },
    )

    const result = await network.intelligenceResponse({
      providerId: 'openai', model: 'gpt-5.6-luna', apiModel: 'gpt-5.6-luna', reasoningEffort: 'none',
    }, new AbortController().signal)

    expect(result.outputText).toBe('CONEXION_OPENAI_OK')
    expect(captured).toEqual({
      model: 'gpt-5.6-luna',
      input: REAL_CONNECTIVITY_POLICY.intelligence.prompt,
      max_output_tokens: REAL_CONNECTIVITY_POLICY.intelligence.maxOutputTokens,
      store: false,
    })
    expect(captured).not.toHaveProperty('tools')
  })

  it('OpenAI clasifica 429 y realiza una sola invocación SDK', async () => {
    let calls = 0
    const network = new LiveRealConnectivityNetwork(
      fakeProviderCenter(),
      REAL_EXECUTION_FEATURE_TOKEN,
      {
        openAIClientFactory: () => ({
          responses: {
            create: async () => {
              calls += 1
              throw Object.assign(new Error('rate limited'), { status: 429 })
            },
          },
        }),
      },
    )

    await expect(network.intelligenceResponse({
      providerId: 'openai', model: 'gpt-5.6-luna', apiModel: 'gpt-5.6-luna', reasoningEffort: 'none',
    }, new AbortController().signal))
      .rejects.toMatchObject<RealConnectivityProviderError>({
        code: 'INTELLIGENCE_RATE_LIMITED',
        kind: 'failed',
        retryable: false,
      })
    expect(calls).toBe(1)
  })

  it('DeepSeek usa el modelo API resuelto, store false y retries de transporte cero', async () => {
    let captured: Record<string, unknown> | undefined
    const network = new LiveRealConnectivityNetwork(
      fakeProviderCenter(),
      REAL_EXECUTION_FEATURE_TOKEN,
      {
        deepSeekClientFactory: () => ({ responses: { create: async request => {
          captured = request as unknown as Record<string, unknown>
          return {
            id: 'deepseek-response-1', status: 'completed', error: null, output: [], output_text: 'ok',
            usage: { input_tokens: 7, output_tokens: 3, input_tokens_details: { cached_tokens: 2 } },
          } as never
        } } }),
      },
    )
    const result = await network.intelligenceResponse({
      providerId: 'deepseek', model: 'deepseek-flash', apiModel: 'deepseek-v4-flash', reasoningEffort: 'none',
    }, new AbortController().signal)
    expect(result).toMatchObject({ inputTokens: 7, cachedInputTokens: 2, outputTokens: 3 })
    expect(captured).toMatchObject({ model: 'deepseek-v4-flash', store: false })
    expect(captured).not.toHaveProperty('tools')
    expect(REAL_CONNECTIVITY_POLICY.maxRetries).toBe(0)
  })
})

function fakeProviderCenter(): ProviderCenterService {
  const snapshot = {
    secureStorageAvailable: true,
    simulationOnly: true,
    realClientsAvailable: true,
    externalCallsAllowed: false,
    pricingCatalogVersion: '2026-07-25.1',
    providers: [
      provider('tavily', 'research_tool', 'search-and-extract'),
      provider('openai', 'intelligence_engine', 'gpt-5.6-luna'),
      provider('deepseek', 'intelligence_engine', 'deepseek-flash'),
    ],
  }
  return {
    snapshot: () => snapshot,
    withCredential: async (
      providerId: 'tavily' | 'openai' | 'deepseek',
      operation: (credential: string, selectedModel: string) => Promise<unknown>,
    ) => operation(
      providerId === 'tavily' ? 'credential-tavily-simulated' : `credential-${providerId}-simulated`,
      providerId === 'tavily' ? 'search-and-extract' : providerId === 'deepseek' ? 'deepseek-flash' : 'gpt-5.6-luna',
    ),
  } as unknown as ProviderCenterService
}

function provider(
  id: 'tavily' | 'openai' | 'deepseek',
  category: 'research_tool' | 'intelligence_engine',
  selectedModel: string,
) {
  return {
    id,
    displayName: id === 'tavily' ? 'Tavily' : id === 'deepseek' ? 'DeepSeek' : 'OpenAI',
    category,
    configured: true,
    credentialMask: '••••••••' as const,
    active: true,
    selectedModel,
    availableModels: [selectedModel],
    tariffStatus: 'current' as const,
    tariffEffectiveFrom: '2026-07-25T00:00:00.000+02:00',
    tariffVerifiedAt: '2026-07-25T00:00:00.000+02:00',
    tariffReviewAfter: '2026-08-25T00:00:00.000+02:00',
    tariffCurrency: 'USD' as const,
    tariffSummary: 'Tarifa oficial simulada',
    tariffSource: 'https://example.test/official',
    connectionState: 'simulated_ok' as const,
  }
}
