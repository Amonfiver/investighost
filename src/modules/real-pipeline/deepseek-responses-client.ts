import OpenAI from 'openai'
import type { LiveProviderNetworkPermit } from './live-provider-access'
import {
  OpenAISdkResponsesClient,
  type OpenAISdkResponsesClientDependencies,
} from './openai-responses-client'

export const DEEPSEEK_RESPONSES_BASE_URL = 'https://api.deepseek.com'

/**
 * DeepSeek expone Responses compatible con el SDK OpenAI. Este adapter solo
 * cambia transporte/identidad; la validación JSON Schema sigue siendo local.
 */
export class DeepSeekResponsesClient extends OpenAISdkResponsesClient {
  constructor(
    credential: string,
    networkPermit: LiveProviderNetworkPermit,
    dependencies: OpenAISdkResponsesClientDependencies = {},
  ) {
    super(credential, networkPermit, dependencies, {
      providerLabel: 'DeepSeek',
      baseURL: DEEPSEEK_RESPONSES_BASE_URL,
    })
  }
}

export function deepSeekSdkClientFactory(credential: string): OpenAI {
  return new OpenAI({
    apiKey: credential,
    baseURL: DEEPSEEK_RESPONSES_BASE_URL,
    maxRetries: 0,
  })
}
