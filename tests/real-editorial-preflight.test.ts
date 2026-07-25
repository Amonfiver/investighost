import { describe, expect, it } from 'vitest'
import { evaluateRealEditorialPreflight } from '@modules/real-pipeline'
import type { z } from 'zod'
import { RealEditorialPreflightInputSchema } from '@modules/real-pipeline/real-editorial-preflight'

type Input = z.infer<typeof RealEditorialPreflightInputSchema>

function provider(
  id: 'tavily' | 'openai',
  category: 'research_tool' | 'intelligence_engine',
  selectedModel: string,
) {
  return {
    id,
    displayName: id === 'tavily' ? 'Tavily' : 'OpenAI',
    category,
    configured: true,
    credentialMask: '••••••••' as const,
    active: true,
    selectedModel,
    availableModels: [selectedModel],
    tariffStatus: 'current' as const,
    tariffVerifiedAt: '2026-07-25T00:00:00.000+02:00',
    tariffReviewAfter: '2026-08-25T00:00:00.000+02:00',
    tariffCurrency: 'USD' as const,
    tariffSummary: 'Tarifa oficial vigente',
    tariffSource: 'https://example.test/official',
    connectionState: 'not_tested' as const,
  }
}

function input(overrides: Partial<Input> = {}): Input {
  return {
    featureEnabled: true,
    providerCenter: {
      secureStorageAvailable: true,
      simulationOnly: true,
      realClientsAvailable: true,
      externalCallsAllowed: false,
      pricingCatalogVersion: '2026-07-25.1',
      providers: [
        provider('tavily', 'research_tool', 'search-and-extract'),
        provider('openai', 'intelligence_engine', 'gpt-5.6-luna'),
      ],
    },
    repositoryAvailable: true,
    budgetValid: true,
    connectivityValidated: true,
    guardFree: true,
    activeExecutions: 0,
    pendingReservations: 0,
    humanRequiredCalls: 0,
    openAIResponsesCapability: {
      sdkVersion: '6.34.0',
      status: 'available',
      available: true,
    },
    duplicateResolution: 'manual_only_coexists',
    boundaries: {
      regenerationBlocked: true,
      publicationBlocked: true,
      trawelConnected: false,
      automaticEnabled: false,
    },
    ...overrides,
  }
}

describe('preflight editorial real independiente', () => {
  it('autoriza únicamente el piloto editorial cuando todos los gates pasan', () => {
    const result = evaluateRealEditorialPreflight(input())

    expect(result).toMatchObject({
      status: 'ready_for_real_editorial_pilot',
      researchExecutionAllowed: true,
      startActionEnabled: true,
      duplicateResolution: 'manual_only_coexists',
      networkCallsPerformed: 0,
    })
    expect(result.policy).toMatchObject({
      targetCostEur: 0.125,
      warningCostEur: 0.16,
      automaticStopCostEur: 0.2,
      dailyLimitCostEur: 0.2,
      maxRounds: 2,
      maxInitialSearches: 4,
      maxFocusedQueries: 3,
      maxAcceptedSources: 8,
      maxConcurrency: 1,
      maxRegenerations: 0,
      maxPublications: 0,
    })
  })

  it('se mantiene separado del preflight 10D y cerrado por su feature flag propia', () => {
    const result = evaluateRealEditorialPreflight(input({ featureEnabled: false }))

    expect(result.status).toBe('real_feature_disabled')
    expect(result.researchExecutionAllowed).toBe(false)
    expect(result.startActionEnabled).toBe(false)
    expect(result.checks.find(check => check.code === 'connectivity_validated')?.status).toBe('pass')
  })

  it('distingue credencial, proveedor, tarifa, presupuesto, repositorio y duplicado', () => {
    const mutate = (
      id: 'tavily' | 'openai',
      patch: Partial<Input['providerCenter']['providers'][number]>,
    ) => input({
      providerCenter: {
        ...input().providerCenter,
        providers: input().providerCenter.providers.map(item =>
          item.id === id ? { ...item, ...patch } : item),
      },
    })

    expect(evaluateRealEditorialPreflight(mutate('tavily', { configured: false })).status)
      .toBe('missing_credentials')
    expect(evaluateRealEditorialPreflight(mutate('openai', { active: false })).status)
      .toBe('provider_inactive')
    expect(evaluateRealEditorialPreflight(mutate('openai', { tariffStatus: 'stale' })).status)
      .toBe('missing_tariff')
    expect(evaluateRealEditorialPreflight(input({ budgetValid: false })).status)
      .toBe('budget_invalid')
    expect(evaluateRealEditorialPreflight(input({ repositoryAvailable: false })).status)
      .toBe('repository_unavailable')
    expect(evaluateRealEditorialPreflight(input({
      duplicateResolution: 'identical_real_pilot_exists',
    })).status).toBe('duplicate_requires_resolution')
  })

  it.each([
    ['guarda', { guardFree: false }],
    ['ejecución activa', { activeExecutions: 1 }],
    ['reserva pendiente', { pendingReservations: 1 }],
    ['decisión humana pendiente', { humanRequiredCalls: 1 }],
    ['conectividad', { connectivityValidated: false }],
  ])('bloquea por %s', (_label, override) => {
    expect(evaluateRealEditorialPreflight(input(override)).status).toBe('blocked')
  })

  it('bloquea un SDK sin Responses antes de autorizar gasto o red', () => {
    const result = evaluateRealEditorialPreflight(input({
      openAIResponsesCapability: {
        sdkVersion: 'synthetic-incompatible',
        status: 'sdk_incompatible',
        available: false,
      },
    }))

    expect(result.status).toBe('blocked')
    expect(result.startActionEnabled).toBe(false)
    expect(result.networkCallsPerformed).toBe(0)
    expect(result.checks.find(check => check.code === 'openai_responses_sdk')).toMatchObject({
      status: 'block',
    })
  })

  it.each([
    ['publicación', { publicationBlocked: false }],
    ['Trawel', { trawelConnected: true }],
    ['Automatic', { automaticEnabled: true }],
    ['regeneración', { regenerationBlocked: false }],
  ])('mantiene bloqueada la frontera de %s', (_label, boundary) => {
    const result = evaluateRealEditorialPreflight(input({
      boundaries: { ...input().boundaries, ...boundary },
    }))

    expect(result.status).toBe('blocked')
    expect(result.researchExecutionAllowed).toBe(false)
  })
})
