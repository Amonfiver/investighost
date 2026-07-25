import OpenAI from 'openai'
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses'
import {
  OpenAIIntelligenceError,
  type OpenAIResponseEnvelope,
  type OpenAIResponseRequest,
  type OpenAIResponsesClient,
} from './openai-intelligence-engine'
import {
  assertLiveProviderNetworkPermit,
  type LiveProviderNetworkPermit,
} from './live-provider-access'

interface OpenAISdkClient {
  responses: {
    create(
      request: ResponseCreateParamsNonStreaming,
      options: { signal: AbortSignal },
    ): Promise<Response>
  }
}

export interface OpenAISdkResponsesClientDependencies {
  clientFactory?: (credential: string) => OpenAISdkClient
}

export class OpenAISdkResponsesClient implements OpenAIResponsesClient {
  private readonly client: OpenAISdkClient

  constructor(
    credential: string,
    private readonly networkPermit: LiveProviderNetworkPermit,
    dependencies: OpenAISdkResponsesClientDependencies = {},
  ) {
    assertLiveProviderNetworkPermit(networkPermit)
    this.client = (dependencies.clientFactory ?? defaultClientFactory)(credential)
  }

  async create(
    request: OpenAIResponseRequest,
    signal: AbortSignal,
  ): Promise<OpenAIResponseEnvelope> {
    assertLiveProviderNetworkPermit(this.networkPermit)
    let response: Response
    try {
      response = await this.client.responses.create(
        request as ResponseCreateParamsNonStreaming,
        { signal },
      )
    } catch {
      throw new OpenAIIntelligenceError(
        'PROVIDER_ERROR',
        'OpenAI Responses no está disponible',
      )
    }
    if (response.error) {
      throw new OpenAIIntelligenceError(
        'PROVIDER_ERROR',
        'OpenAI Responses devolvió un error',
      )
    }
    if (response.status !== 'completed' && response.status !== 'incomplete') {
      throw new OpenAIIntelligenceError(
        'PROVIDER_ERROR',
        'OpenAI Responses no terminó en un estado conciliable',
      )
    }
    const refusal = response.output
      .filter(item => item.type === 'message')
      .flatMap(item => item.content)
      .find(item => item.type === 'refusal')
    return {
      id: response.id,
      status: response.status,
      output_text: response.output_text || undefined,
      refusal: refusal?.type === 'refusal' ? refusal.refusal : undefined,
      incomplete_details: response.incomplete_details?.reason
        ? { reason: response.incomplete_details.reason }
        : undefined,
      usage: {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
        input_tokens_details: {
          cached_tokens: response.usage?.input_tokens_details.cached_tokens ?? 0,
        },
      },
    }
  }
}

function defaultClientFactory(credential: string): OpenAISdkClient {
  return new OpenAI({ apiKey: credential }) as OpenAISdkClient
}
