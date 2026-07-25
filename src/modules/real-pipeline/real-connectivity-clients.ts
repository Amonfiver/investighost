import OpenAI from 'openai'
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses'
import { z } from 'zod'
import { REAL_CONNECTIVITY_POLICY } from '@shared/real-connectivity-contracts'
import type { ProviderCenterService } from './provider-center'
import {
  issueLiveProviderNetworkPermit,
  type LiveProviderNetworkPermit,
} from './live-provider-access'
import {
  RealConnectivityProviderError,
  type OpenAIConnectivityResponse,
  type RealConnectivityNetworkPort,
  type TavilyConnectivityResponse,
} from './real-connectivity-check'
import { TavilyFetchTransport } from './tavily-research-tool'

const TavilyConnectivityResponseSchema = z.object({
  request_id: z.string().trim().min(1).max(240),
  results: z.array(z.object({
    url: z.string().url().refine(value => new URL(value).protocol === 'https:'),
  })).length(1),
  usage: z.object({
    credits: z.literal(1),
  }),
})

interface OpenAIConnectivitySdkClient {
  responses: {
    create(
      request: ResponseCreateParamsNonStreaming,
      options: { signal: AbortSignal },
    ): Promise<Response>
  }
}

export interface LiveRealConnectivityNetworkDependencies {
  fetchImplementation?: typeof fetch
  openAIClientFactory?: (credential: string) => OpenAIConnectivitySdkClient
  timeoutMs?: number
  nowMs?: () => number
}

export class LiveRealConnectivityNetwork implements RealConnectivityNetworkPort {
  private readonly timeoutMs: number
  private readonly nowMs: () => number

  constructor(
    private readonly providerCenter: ProviderCenterService,
    private readonly featureToken: string,
    private readonly dependencies: LiveRealConnectivityNetworkDependencies = {},
  ) {
    this.timeoutMs = dependencies.timeoutMs ?? 15_000
    this.nowMs = dependencies.nowMs ?? Date.now
  }

  async tavilySearch(signal: AbortSignal): Promise<TavilyConnectivityResponse> {
    const started = this.nowMs()
    return this.providerCenter.withCredential('tavily', async credential => {
      const permit = this.permit()
      const transport = new TavilyFetchTransport({
        credential,
        networkPermit: permit,
        fetchImplementation: this.dependencies.fetchImplementation,
      })
      let response
      try {
        response = await withAmbiguousTimeout(
          nextSignal => transport.post('/search', {
            query: REAL_CONNECTIVITY_POLICY.tavily.query,
            topic: 'general',
            search_depth: REAL_CONNECTIVITY_POLICY.tavily.searchDepth,
            max_results: REAL_CONNECTIVITY_POLICY.tavily.maxResults,
            include_answer: REAL_CONNECTIVITY_POLICY.tavily.includeAnswer,
            include_raw_content: REAL_CONNECTIVITY_POLICY.tavily.includeRawContent,
            include_images: REAL_CONNECTIVITY_POLICY.tavily.includeImages,
            auto_parameters: REAL_CONNECTIVITY_POLICY.tavily.autoParameters,
            include_usage: true,
          }, nextSignal),
          signal,
          this.timeoutMs,
          'TAVILY_AMBIGUOUS_TIMEOUT',
          () => this.nowMs() - started,
        )
      } catch (error) {
        if (error instanceof RealConnectivityProviderError) throw error
        throw new RealConnectivityProviderError(
          'TAVILY_NETWORK_AMBIGUOUS',
          'Tavily terminó sin resultado conciliable',
          'unknown',
          this.nowMs() - started,
        )
      }
      if ([401, 403].includes(response.status)) {
        throw providerHttpError('TAVILY_AUTH_REJECTED', 'Tavily rechazó la credencial', response.status, this.nowMs() - started)
      }
      if (response.status === 429) {
        throw providerHttpError('TAVILY_RATE_LIMITED', 'Tavily rechazó la llamada por límite', response.status, this.nowMs() - started)
      }
      if (response.status >= 500) {
        throw providerHttpError('TAVILY_SERVER_ERROR', 'Tavily no está disponible', response.status, this.nowMs() - started)
      }
      if (response.status < 200 || response.status >= 300) {
        throw providerHttpError('TAVILY_REQUEST_REJECTED', 'Tavily rechazó la llamada', response.status, this.nowMs() - started)
      }
      const parsed = TavilyConnectivityResponseSchema.safeParse(response.body)
      if (!parsed.success) {
        throw new RealConnectivityProviderError(
          'TAVILY_INVALID_RESPONSE',
          'Tavily devolvió un resultado de coste ambiguo',
          'unknown',
          this.nowMs() - started,
        )
      }
      return {
        remoteId: parsed.data.request_id,
        credits: parsed.data.usage.credits,
        url: parsed.data.results[0].url,
        durationMs: this.nowMs() - started,
      }
    })
  }

  async openAIResponse(signal: AbortSignal): Promise<OpenAIConnectivityResponse> {
    const started = this.nowMs()
    return this.providerCenter.withCredential('openai', async (credential, selectedModel) => {
      if (selectedModel !== REAL_CONNECTIVITY_POLICY.openai.model) {
        throw new RealConnectivityProviderError(
          'OPENAI_MODEL_MISMATCH',
          'El modelo activo no es gpt-5.6-luna',
          'failed',
          this.nowMs() - started,
        )
      }
      this.permit()
      const client = (this.dependencies.openAIClientFactory ?? defaultOpenAIClientFactory)(credential)
      let response: Response
      try {
        response = await withAmbiguousTimeout(
          nextSignal => client.responses.create({
            model: REAL_CONNECTIVITY_POLICY.openai.model,
            input: REAL_CONNECTIVITY_POLICY.openai.prompt,
            max_output_tokens: REAL_CONNECTIVITY_POLICY.openai.maxOutputTokens,
            store: REAL_CONNECTIVITY_POLICY.openai.store,
            reasoning: { effort: REAL_CONNECTIVITY_POLICY.openai.reasoningEffort },
          }, { signal: nextSignal }),
          signal,
          this.timeoutMs,
          'OPENAI_AMBIGUOUS_TIMEOUT',
          () => this.nowMs() - started,
        )
      } catch (error) {
        if (error instanceof RealConnectivityProviderError) throw error
        const status = providerStatus(error)
        if (status === 401 || status === 403) {
          throw providerHttpError('OPENAI_AUTH_REJECTED', 'OpenAI rechazó la credencial', status, this.nowMs() - started)
        }
        if (status === 429) {
          throw providerHttpError('OPENAI_RATE_LIMITED', 'OpenAI rechazó la llamada por límite', status, this.nowMs() - started)
        }
        if (status !== undefined && status >= 500) {
          throw providerHttpError('OPENAI_SERVER_ERROR', 'OpenAI no está disponible', status, this.nowMs() - started)
        }
        if (status !== undefined) {
          throw providerHttpError('OPENAI_REQUEST_REJECTED', 'OpenAI rechazó la llamada', status, this.nowMs() - started)
        }
        throw new RealConnectivityProviderError(
          'OPENAI_NETWORK_AMBIGUOUS',
          'OpenAI terminó sin resultado conciliable',
          'unknown',
          this.nowMs() - started,
        )
      }
      if (response.error) {
        throw new RealConnectivityProviderError(
          'OPENAI_RESPONSE_ERROR',
          'OpenAI devolvió un resultado de coste ambiguo',
          'unknown',
          this.nowMs() - started,
        )
      }
      if (response.status !== 'completed' && response.status !== 'incomplete') {
        throw new RealConnectivityProviderError(
          'OPENAI_INVALID_STATUS',
          'OpenAI no terminó en un estado conciliable',
          'unknown',
          this.nowMs() - started,
        )
      }
      return {
        remoteId: response.id,
        inputTokens: response.usage?.input_tokens ?? 0,
        cachedInputTokens: response.usage?.input_tokens_details.cached_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        outputText: response.output_text,
        durationMs: this.nowMs() - started,
      }
    })
  }

  private permit(): LiveProviderNetworkPermit {
    return issueLiveProviderNetworkPermit({
      featureToken: this.featureToken,
      providerCenter: this.providerCenter.snapshot(),
      preflightStatus: 'ready_for_live_connectivity_check',
      taskAuthorized: true,
      budgetReserved: true,
      globalGuardAcquired: true,
    })
  }
}

function defaultOpenAIClientFactory(credential: string): OpenAIConnectivitySdkClient {
  return new OpenAI({
    apiKey: credential,
    maxRetries: REAL_CONNECTIVITY_POLICY.maxRetries,
    timeout: 15_000,
  }) as OpenAIConnectivitySdkClient
}

function providerHttpError(
  code: string,
  message: string,
  status: number,
  durationMs: number,
): RealConnectivityProviderError {
  return new RealConnectivityProviderError(code, `${message} (HTTP ${status})`, 'failed', durationMs)
}

function providerStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined
  return typeof error.status === 'number' ? error.status : undefined
}

async function withAmbiguousTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal: AbortSignal,
  timeoutMs: number,
  timeoutCode: string,
  durationMs: () => number,
): Promise<T> {
  if (parentSignal.aborted) {
    throw new RealConnectivityProviderError(
      timeoutCode,
      'La llamada se canceló sin resultado conciliable',
      'unknown',
      durationMs(),
    )
  }
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  let parentListener: (() => void) | undefined
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort()
        reject(new RealConnectivityProviderError(
          timeoutCode,
          'La llamada agotó el tiempo y su facturación es ambigua',
          'unknown',
          durationMs(),
        ))
      }, timeoutMs)
    })
    const cancellationPromise = new Promise<never>((_, reject) => {
      parentListener = () => {
        controller.abort()
        reject(new RealConnectivityProviderError(
          timeoutCode,
          'La llamada se canceló sin resultado conciliable',
          'unknown',
          durationMs(),
        ))
      }
      parentSignal.addEventListener('abort', parentListener, { once: true })
    })
    return await Promise.race([
      operation(controller.signal),
      timeoutPromise,
      cancellationPromise,
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
    if (parentListener) parentSignal.removeEventListener('abort', parentListener)
  }
}
