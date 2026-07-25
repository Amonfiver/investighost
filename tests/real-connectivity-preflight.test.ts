import { describe, expect, it } from 'vitest'
import {
  evaluateRealConnectivityPreflight,
  type RealConnectivityPreflightInput,
} from '@modules/real-pipeline/real-connectivity-preflight'

function input(
  overrides: Partial<RealConnectivityPreflightInput> = {},
): RealConnectivityPreflightInput {
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
    destination: 'Morella',
    limits: {
      taskBudgetEur: 0.20,
      batchBudgetEur: 0.25,
      dailyBudgetEur: 0.50,
      warningBudgetEur: 0.16,
      manualExtensionBudgetEur: 0.25,
      absoluteBudgetEur: 0.50,
      maxRounds: 2,
      maxProviderCalls: 10,
      maxInputTokens: 30_000,
      maxOutputTokens: 10_000,
    },
    infrastructure: {
      supabaseLocalAvailable: true,
      ledgerAvailable: true,
      globalGuardFree: true,
      activeRealExecutions: 0,
    },
    boundaries: {
      regenerationBlocked: true,
      publicationBlocked: true,
      trawelConnected: false,
      automaticEnabled: false,
    },
    ...overrides,
  }
}

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
    tariffSummary: 'Tarifa oficial sintética para el test',
    tariffSource: 'https://example.test/official',
    connectionState: 'not_tested' as const,
  }
}

function mutateProvider(
  candidate: RealConnectivityPreflightInput,
  id: 'tavily' | 'openai',
  patch: Partial<RealConnectivityPreflightInput['providerCenter']['providers'][number]>,
) {
  candidate.providerCenter.providers = candidate.providerCenter.providers.map(entry =>
    entry.id === id ? { ...entry, ...patch } : entry)
  return candidate
}

describe('preflight real sin red', () => {
  it('queda preparado únicamente para una futura prueba de conectividad', () => {
    const result = evaluateRealConnectivityPreflight(input())

    expect(result.status).toBe('ready_for_live_connectivity_check')
    expect(result.checks.every(check => check.status !== 'block')).toBe(true)
    expect(result).toMatchObject({
      networkCallsPerformed: 0,
      researchExecutionAllowed: false,
      connectivityActionEnabled: false,
    })
  })

  it('distingue credenciales ausentes y safeStorage inseguro', () => {
    expect(evaluateRealConnectivityPreflight(mutateProvider(
      input(),
      'tavily',
      { configured: false, credentialMask: undefined },
    )).status).toBe('missing_credentials')
    expect(evaluateRealConnectivityPreflight(input({
      providerCenter: { ...input().providerCenter, secureStorageAvailable: false },
    })).status).toBe('unsafe_storage')
  })

  it('distingue proveedor inactivo, modelo ajeno y tarifa caducada', () => {
    expect(evaluateRealConnectivityPreflight(mutateProvider(
      input(),
      'openai',
      { active: false },
    )).status).toBe('provider_inactive')
    expect(evaluateRealConnectivityPreflight(mutateProvider(
      input(),
      'openai',
      { selectedModel: 'modelo-no-permitido' },
    )).status).toBe('missing_tariff')
    expect(evaluateRealConnectivityPreflight(mutateProvider(
      input(),
      'openai',
      { tariffStatus: 'stale' },
    )).status).toBe('missing_tariff')
  })

  it('distingue presupuesto inválido y feature flag apagada', () => {
    expect(evaluateRealConnectivityPreflight(input({
      limits: { ...input().limits, maxRounds: 3 },
    })).status).toBe('budget_invalid')
    expect(evaluateRealConnectivityPreflight(input({ featureEnabled: false })).status)
      .toBe('real_feature_disabled')
  })

  it.each([
    ['publicación', { publicationBlocked: false }],
    ['Trawel', { trawelConnected: true }],
    ['Automatic', { automaticEnabled: true }],
  ])('bloquea la frontera de %s', (_label, boundary) => {
    const result = evaluateRealConnectivityPreflight(input({
      boundaries: { ...input().boundaries, ...boundary },
    }))

    expect(result.status).toBe('blocked')
    expect(result.researchExecutionAllowed).toBe(false)
  })

  it('bloquea destino, guarda, ejecución activa, ledger o Supabase', () => {
    const candidate = input({
      destination: 'Albarracín',
      infrastructure: {
        supabaseLocalAvailable: false,
        ledgerAvailable: false,
        globalGuardFree: false,
        activeRealExecutions: 1,
      },
    })
    const result = evaluateRealConnectivityPreflight(candidate)

    expect(result.status).toBe('blocked')
    expect(result.checks.filter(check => check.status === 'block').map(check => check.code))
      .toEqual(expect.arrayContaining([
        'destination',
        'supabase_local',
        'ledger',
        'global_guard',
        'zero_active_executions',
      ]))
  })
})
