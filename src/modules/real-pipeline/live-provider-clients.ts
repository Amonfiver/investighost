import type { ProviderCenterSnapshot } from '@shared/provider-center-contracts'
import {
  PROVIDER_PRICING_CATALOG,
  pricingEntriesFor,
  tariffStatus,
} from '@shared/provider-pricing-catalog'
import { ProviderCenterError, type ProviderCenterService } from './provider-center'
import {
  issueLiveProviderNetworkPermit,
  type LiveProviderAccessInputSchema,
} from './live-provider-access'
import { OpenAIIntelligenceEngine } from './openai-intelligence-engine'
import { OpenAISdkResponsesClient } from './openai-responses-client'
import { TavilyFetchTransport, TavilyResearchTool } from './tavily-research-tool'
import type { z } from 'zod'

type LiveProviderGateInput = Omit<
  z.input<typeof LiveProviderAccessInputSchema>,
  'providerCenter'
>

export interface LiveProviderClients {
  tavily: TavilyResearchTool
  openai: OpenAIIntelligenceEngine
}

export async function withLiveProviderClients<T>(
  providerCenter: ProviderCenterService,
  gate: LiveProviderGateInput,
  operation: (clients: LiveProviderClients) => Promise<T>,
): Promise<T> {
  const providerSnapshot = providerCenter.snapshot()
  const permit = issueLiveProviderNetworkPermit({
    ...gate,
    providerCenter: providerSnapshot,
  })

  return providerCenter.withCredential('tavily', async tavilyCredential =>
    providerCenter.withCredential('openai', async (openAICredential, selectedModel) => {
      const tariff = requireOpenAITariff(providerSnapshot, selectedModel)
      const tavily = new TavilyResearchTool(
        new TavilyFetchTransport({
          credential: tavilyCredential,
          networkPermit: permit,
        }),
        {},
        { simulation: false },
      )
      const openai = new OpenAIIntelligenceEngine(
        new OpenAISdkResponsesClient(openAICredential, permit),
        {
          model: selectedModel,
          inputCostPerMillion: tariff.inputPerMillion ?? 0,
          cachedInputCostPerMillion: tariff.cachedInputPerMillion ?? 0,
          outputCostPerMillion: tariff.outputPerMillion ?? 0,
          currency: tariff.currency,
          simulation: false,
        },
      )
      return operation({ tavily, openai })
    }),
  )
}

function requireOpenAITariff(
  providerSnapshot: ProviderCenterSnapshot,
  selectedModel: string,
) {
  const provider = providerSnapshot.providers.find(entry => entry.id === 'openai')
  const tariff = pricingEntriesFor('openai', selectedModel, PROVIDER_PRICING_CATALOG)
    .find(entry => entry.operation === 'responses')
  if (
    !provider
    || provider.tariffStatus !== 'current'
    || !tariff
    || tariffStatus(tariff, new Date()) !== 'current'
  ) {
    throw new ProviderCenterError('INVALID_MODEL', 'La tarifa OpenAI seleccionada no está vigente')
  }
  return tariff
}
