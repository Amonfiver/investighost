import OpenAI from 'openai'
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses'
import { VERSION as OPENAI_SDK_VERSION } from 'openai/version'
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
  clientFactory?: (credential: string) => unknown
}

export type OpenAIResponsesCapabilityStatus =
  | 'available'
  | 'sdk_incompatible'
  | 'client_construction_failed'
  | 'client_invalid'
  | 'responses_missing'
  | 'responses_create_missing'

export interface OpenAIResponsesCapability {
  sdkVersion: string
  status: OpenAIResponsesCapabilityStatus
  available: boolean
}

export class OpenAISdkResponsesClient implements OpenAIResponsesClient {
  private readonly client: OpenAISdkClient
  readonly capability: OpenAIResponsesCapability

  constructor(
    credential: string,
    private readonly networkPermit: LiveProviderNetworkPermit,
    dependencies: OpenAISdkResponsesClientDependencies = {},
  ) {
    assertLiveProviderNetworkPermit(networkPermit)
    let candidate: unknown
    try {
      candidate = (dependencies.clientFactory ?? defaultClientFactory)(credential)
    } catch {
      throw new OpenAIIntelligenceError(
        'CLIENT_INVALID',
        'El cliente OpenAI no pudo construirse',
      )
    }
    this.capability = inspectOpenAIResponsesClient(candidate)
    if (!this.capability.available) {
      throw capabilityError(this.capability, !dependencies.clientFactory)
    }
    this.client = candidate as OpenAISdkClient
  }

  async create(
    request: OpenAIResponseRequest,
    signal: AbortSignal,
  ): Promise<OpenAIResponseEnvelope> {
    assertLiveProviderNetworkPermit(this.networkPermit)
    const capability = inspectOpenAIResponsesClient(this.client)
    if (!capability.available) throw capabilityError(capability, false)
    let response: Response
    try {
      response = await this.client.responses.create(
        request as ResponseCreateParamsNonStreaming,
        { signal },
      )
    } catch (error) {
      throw classifyOpenAIError(error, signal)
    }
    if (response.error) {
      throw new OpenAIIntelligenceError(
        'REMOTE_RESPONSE_ERROR',
        'OpenAI Responses devolvió un error',
        providerUsage(response.id),
      )
    }
    if (response.status !== 'completed' && response.status !== 'incomplete') {
      throw new OpenAIIntelligenceError(
        'REMOTE_INVALID_RESPONSE',
        'OpenAI Responses no terminó en un estado conciliable',
        providerUsage(response.id),
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
          cached_tokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
        },
      },
    }
  }
}

export function inspectOpenAIResponsesClient(
  candidate: unknown,
  sdkVersion = OPENAI_SDK_VERSION,
): OpenAIResponsesCapability {
  try {
    if (!isRecord(candidate)) return capability(sdkVersion, 'client_invalid')
    if (!('responses' in candidate)) return capability(sdkVersion, 'responses_missing')
    if (!isRecord(candidate.responses)) return capability(sdkVersion, 'client_invalid')
    if (typeof candidate.responses.create !== 'function') {
      return capability(sdkVersion, 'responses_create_missing')
    }
    return capability(sdkVersion, 'available')
  } catch {
    return capability(sdkVersion, 'client_invalid')
  }
}

export function inspectInstalledOpenAIResponsesCapability(
  clientFactory: () => unknown = capabilityProbeClientFactory,
): OpenAIResponsesCapability {
  try {
    const detected = inspectOpenAIResponsesClient(clientFactory())
    return detected.status === 'responses_missing'
      ? capability(detected.sdkVersion, 'sdk_incompatible')
      : detected
  } catch {
    return capability(OPENAI_SDK_VERSION, 'client_construction_failed')
  }
}

function defaultClientFactory(credential: string): OpenAISdkClient {
  return new OpenAI({ apiKey: credential, maxRetries: 0 }) as OpenAISdkClient
}

function capabilityProbeClientFactory(): OpenAISdkClient {
  return new OpenAI({
    apiKey: 'sk-local-capability-probe-no-network',
    maxRetries: 0,
    fetch: async () => {
      throw new Error('La inspección local no permite red')
    },
  }) as OpenAISdkClient
}

function capability(
  sdkVersion: string,
  status: OpenAIResponsesCapabilityStatus,
): OpenAIResponsesCapability {
  return {
    sdkVersion,
    status,
    available: status === 'available',
  }
}

function capabilityError(
  detected: OpenAIResponsesCapability,
  installedClient: boolean,
): OpenAIIntelligenceError {
  if (installedClient && ['sdk_incompatible', 'responses_missing'].includes(detected.status)) {
    return new OpenAIIntelligenceError(
      'SDK_INCOMPATIBLE',
      `OpenAI SDK ${detected.sdkVersion} no expone Responses`,
    )
  }
  if (detected.status === 'responses_missing') {
    return new OpenAIIntelligenceError(
      'RESPONSES_UNAVAILABLE',
      'El cliente OpenAI no contiene el recurso Responses',
    )
  }
  if (detected.status === 'responses_create_missing') {
    return new OpenAIIntelligenceError(
      'RESPONSES_CREATE_UNAVAILABLE',
      'El recurso OpenAI Responses no contiene create',
    )
  }
  return new OpenAIIntelligenceError(
    'CLIENT_INVALID',
    'El cliente OpenAI tiene una estructura incompatible',
  )
}

function classifyOpenAIError(
  error: unknown,
  signal: AbortSignal,
): OpenAIIntelligenceError {
  if (error instanceof OpenAIIntelligenceError) return error
  if (signal.aborted || error instanceof OpenAI.APIUserAbortError) {
    return new OpenAIIntelligenceError('CANCELLED', 'La operación OpenAI fue cancelada')
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new OpenAIIntelligenceError('TIMEOUT', 'OpenAI superó el tiempo máximo')
  }
  const status = numberField(error, 'status')
  const code = stringField(error, 'code')
  const param = stringField(error, 'param')
  const usage = providerUsage(stringField(error, 'requestID'))
  if (status === 401 || code === 'invalid_api_key') {
    return new OpenAIIntelligenceError(
      'AUTHENTICATION_ERROR',
      'OpenAI rechazó la credencial',
      usage,
    )
  }
  if (code === 'model_not_found' || param === 'model') {
    return new OpenAIIntelligenceError(
      'MODEL_UNAVAILABLE',
      'OpenAI no admite el modelo seleccionado',
      usage,
    )
  }
  if (status !== undefined) {
    return new OpenAIIntelligenceError(
      'REMOTE_HTTP_ERROR',
      `OpenAI rechazó la petición (HTTP ${status})`,
      usage,
    )
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new OpenAIIntelligenceError(
      'NETWORK_AMBIGUOUS',
      'OpenAI no devolvió una respuesta de red conciliable',
    )
  }
  return new OpenAIIntelligenceError(
    'CLIENT_ERROR',
    'El cliente OpenAI falló antes de producir una respuesta clasificable',
  )
}

function providerUsage(requestId?: string): {
  providerRequestIds: string[]
  credits: number
  calculatedCost: number
  toolCalls: number
} {
  return {
    providerRequestIds: requestId ? [requestId.slice(0, 240)] : [],
    credits: 0,
    calculatedCost: 0,
    toolCalls: 1,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function numberField(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined
  return typeof value[key] === 'number' ? value[key] : undefined
}

function stringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined
  return typeof value[key] === 'string' ? value[key] : undefined
}
