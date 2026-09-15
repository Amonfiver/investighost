import type { ProviderCenterSnapshot } from '@shared/provider-center-contracts'
import { pricingEntryAt, tariffStatus } from '@shared/provider-pricing-catalog'
import { ProviderCenterError, type ProviderCenterService } from './provider-center'
import { DeepSeekResponsesClient } from './deepseek-responses-client'
import { DEEPSEEK_ANALYSIS_ENVELOPE_INSTRUCTION, DeepSeekRoundAnalysisEnvelopeSchema, canonicalAnalysisFromDeepSeekEnvelope } from './deepseek-analysis-envelope'
import { readRealLlmRouting, type IntelligenceProviderId, type IntelligenceRoutingStage, type RealLlmRouting, type ResolvedIntelligenceRoute } from './llm-routing'
import { OpenAIIntelligenceEngine } from './openai-intelligence-engine'
import { OpenAISdkResponsesClient } from './openai-responses-client'
import { RoutedIntelligenceEngine } from './routed-intelligence-engine'
import { issueLiveProviderNetworkPermit, type LiveProviderAccessInputSchema } from './live-provider-access'
import { readRealTavilyTimeoutPolicy, TavilyFetchTransport, TavilyResearchTool, type TavilyRequestJournal } from './tavily-research-tool'
import type { z } from 'zod'

type LiveProviderGateInput = Omit<z.input<typeof LiveProviderAccessInputSchema>, 'providerCenter' | 'intelligenceProviderIds'>

export interface LiveProviderClients { tavily: TavilyResearchTool; intelligence: RoutedIntelligenceEngine }
export interface LiveProviderClientOptions { tavilyRequestJournal?: TavilyRequestJournal; environment?: NodeJS.ProcessEnv; routing?: RealLlmRouting }

export async function withLiveProviderClients<T>(providerCenter: ProviderCenterService, gate: LiveProviderGateInput, operation: (clients: LiveProviderClients) => Promise<T>, options: LiveProviderClientOptions = {}): Promise<T> {
  const routing = options.routing ?? readRealLlmRouting(options.environment)
  const snapshot = providerCenter.snapshot()
  const ids = [...new Set(Object.values(routing.routes).map(route => route.providerId))]
  assertRoutesConfigured(snapshot, routing)
  const permit = issueLiveProviderNetworkPermit({ ...gate, providerCenter: snapshot, intelligenceProviderIds: ids })
  return providerCenter.withCredential('tavily', tavilyCredential => withIntelligenceCredentials(providerCenter, ids, async credentials => {
    const tavily = new TavilyResearchTool(new TavilyFetchTransport({ credential: tavilyCredential, networkPermit: permit }), { timeoutMs: readRealTavilyTimeoutPolicy(options.environment).timeoutMs }, { simulation: false, requestJournal: options.tavilyRequestJournal })
    const stages = Object.fromEntries((Object.keys(routing.routes) as IntelligenceRoutingStage[]).map(stage => [stage, {
      route: routing.routes[stage], engine: createEngine(stage, routing.routes[stage], credentials[routing.routes[stage].providerId], permit),
    }])) as unknown as ConstructorParameters<typeof RoutedIntelligenceEngine>[0]
    return operation({ tavily, intelligence: new RoutedIntelligenceEngine(stages) })
  }))
}

function createEngine(stage: IntelligenceRoutingStage, route: ResolvedIntelligenceRoute, credential: string, permit: ReturnType<typeof issueLiveProviderNetworkPermit>): OpenAIIntelligenceEngine {
  const client = route.providerId === 'deepseek' ? new DeepSeekResponsesClient(credential, permit) : new OpenAISdkResponsesClient(credential, permit)
  return new OpenAIIntelligenceEngine(client, {
    providerId: route.providerId, model: route.apiModel, telemetryModel: route.model,
    maxOutputTokens: route.maxOutputTokens ?? 12_000, timeoutMs: route.timeoutMs ?? 30_000,
    reasoningEffort: route.reasoningEffort, temperature: route.temperature, topP: route.topP,
    currency: 'USD', simulation: false,
    costForUsage: usage => estimatedRouteCost(route, usage, usage.occurredAt),
    ...(stage === 'analysis' && route.providerId === 'deepseek' ? {
      analysisResponseSchema: DeepSeekRoundAnalysisEnvelopeSchema,
      analysisResponseTransformer: canonicalAnalysisFromDeepSeekEnvelope,
      analysisInstruction: DEEPSEEK_ANALYSIS_ENVELOPE_INSTRUCTION,
    } : {}),
  })
}

function estimatedRouteCost(route: ResolvedIntelligenceRoute, usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number }, now: Date): number {
  const tariff = pricingEntryAt(route.providerId, route.model, now)
  if (!tariff || tariffStatus(tariff, now) !== 'current') throw new ProviderCenterError('INVALID_MODEL', 'La tarifa del modelo seleccionado no está vigente')
  const cached = Math.min(usage.inputTokens, usage.cachedInputTokens)
  return (usage.inputTokens - cached) * (tariff.inputPerMillion ?? 0) / 1_000_000
    + cached * (tariff.cachedInputPerMillion ?? 0) / 1_000_000
    + usage.outputTokens * (tariff.outputPerMillion ?? 0) / 1_000_000
}

function assertRoutesConfigured(snapshot: ProviderCenterSnapshot, routing: RealLlmRouting): void {
  for (const route of Object.values(routing.routes)) {
    const provider = snapshot.providers.find(item => item.id === route.providerId)
    const tariff = pricingEntryAt(route.providerId, route.model, new Date())
    if (!provider?.configured || !provider.availableModels.includes(route.model) || !tariff || tariffStatus(tariff, new Date()) !== 'current') {
      throw new ProviderCenterError('NOT_CONFIGURED', 'El routing LLM refiere un proveedor, modelo o tarifa no disponible')
    }
  }
}

async function withIntelligenceCredentials<T>(providerCenter: ProviderCenterService, providerIds: IntelligenceProviderId[], operation: (credentials: Record<IntelligenceProviderId, string>) => Promise<T>, credentials: Partial<Record<IntelligenceProviderId, string>> = {}): Promise<T> {
  const [providerId, ...remaining] = providerIds
  if (!providerId) return operation(credentials as Record<IntelligenceProviderId, string>)
  return providerCenter.withCredential(providerId, credential => withIntelligenceCredentials(providerCenter, remaining, operation, { ...credentials, [providerId]: credential }), { requireActive: false })
}
