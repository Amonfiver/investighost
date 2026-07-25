import { describe, expect, it } from 'vitest'
import {
  MORELLA_REAL_PILOT_POLICY,
  REAL_EXECUTION_FEATURE_TOKEN,
  createClosedMorellaPilotPreflight,
  evaluateMorellaPilotPreflight,
  resolveRealExecutionFeatureFlag,
  type MorellaPilotPreflightInput,
} from '@modules/real-pipeline/real-pilot-gate'

function input(overrides: Partial<MorellaPilotPreflightInput> = {}): MorellaPilotPreflightInput {
  return {
    featureEnabled: true,
    destination: 'Morella',
    requestedTasks: 1,
    requestedConcurrency: 1,
    requestedBudgetEur: 0.20,
    manualBudgetExtensionApproved: false,
    requestedRounds: 2,
    requestedRegenerations: 0,
    requestedPublications: 0,
    providerCenter: {
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
          tariffSummary: 'Tarifa sintética vigente',
          connectionState: 'simulated_ok',
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
          tariffSummary: 'Tarifa sintética vigente',
          connectionState: 'simulated_ok',
        },
      ],
    },
    realConnections: { tavily: 'ok', openai: 'ok' },
    tariffsReady: { tavily: true, openai: true },
    budgetPersisted: true,
    balances: { tavily: 'sufficient', openai: 'sufficient' },
    supabase: 'ok',
    ledger: 'ok',
    globalGuard: 'available',
    activeRealTasks: 0,
    ...overrides,
  }
}

function status(result: ReturnType<typeof evaluateMorellaPilotPreflight>, code: string) {
  return result.checks.find(check => check.code === code)?.status
}

describe('puerta segura del piloto real Morella', () => {
  it('mantiene la feature flag desactivada salvo token explícito', () => {
    expect(resolveRealExecutionFeatureFlag()).toBe(false)
    expect(resolveRealExecutionFeatureFlag('true')).toBe(false)
    expect(resolveRealExecutionFeatureFlag(REAL_EXECUTION_FEATURE_TOKEN)).toBe(true)
  })

  it('expone la política cerrada del piloto único', () => {
    expect(MORELLA_REAL_PILOT_POLICY).toMatchObject({
      destination: 'Morella',
      maxTasks: 1,
      maxConcurrency: 1,
      initialBudgetEur: 0.20,
      warningBudgetEur: 0.16,
      manualExtensionBudgetEur: 0.25,
      absoluteBudgetEur: 0.50,
      maxRounds: 2,
      maxRegenerations: 0,
      maxPublications: 0,
    })
  })

  it('solo queda listo cuando todos los controles bloqueantes pasan', () => {
    const result = evaluateMorellaPilotPreflight(input())
    expect(result.ready).toBe(true)
    expect(result.checks.some(check => check.status === 'block')).toBe(false)
    expect(status(result, 'budget_warning')).toBe('warning')
  })

  it('queda bloqueado por defecto sin feature flag', () => {
    const result = evaluateMorellaPilotPreflight(input({ featureEnabled: false }))
    expect(result.ready).toBe(false)
    expect(status(result, 'feature_flag')).toBe('block')
  })

  it('crea una vista cerrada sin consultar red ni infraestructura', () => {
    const candidate = input()
    const result = createClosedMorellaPilotPreflight(candidate.providerCenter)
    expect(result.ready).toBe(false)
    expect(result.featureEnabled).toBe(false)
    expect(status(result, 'tavily_connection')).toBe('block')
    expect(status(result, 'supabase')).toBe('block')
    expect(status(result, 'zero_active_tasks')).toBe('block')
  })

  it.each(['Albarracín', 'Morella y Peñíscola'])('rechaza un destino fuera de whitelist: %s', destination => {
    const result = evaluateMorellaPilotPreflight(input({ destination }))
    expect(result.ready).toBe(false)
    expect(status(result, 'destination_whitelist')).toBe('block')
  })

  it('admite solo una tarea y concurrencia uno', () => {
    const result = evaluateMorellaPilotPreflight(input({ requestedTasks: 2, requestedConcurrency: 2 }))
    expect(status(result, 'single_task')).toBe('block')
    expect(status(result, 'concurrency')).toBe('block')
  })

  it('exige autorización humana para ampliar de 0,20 a 0,25 EUR', () => {
    expect(status(evaluateMorellaPilotPreflight(input({
      requestedBudgetEur: 0.25,
    })), 'budget')).toBe('block')
    expect(status(evaluateMorellaPilotPreflight(input({
      requestedBudgetEur: 0.25,
      manualBudgetExtensionApproved: true,
    })), 'budget')).toBe('pass')
  })

  it('bloquea el exceso del máximo ampliado y del límite absoluto', () => {
    expect(status(evaluateMorellaPilotPreflight(input({
      requestedBudgetEur: 0.26,
      manualBudgetExtensionApproved: true,
    })), 'budget')).toBe('block')
    expect(status(evaluateMorellaPilotPreflight(input({
      requestedBudgetEur: 0.51,
      manualBudgetExtensionApproved: true,
    })), 'budget')).toBe('block')
  })

  it('bloquea una tercera ronda, regeneración o publicación', () => {
    const result = evaluateMorellaPilotPreflight(input({
      requestedRounds: 3,
      requestedRegenerations: 1,
      requestedPublications: 1,
    }))
    expect(status(result, 'rounds')).toBe('block')
    expect(status(result, 'regeneration')).toBe('block')
    expect(status(result, 'publication')).toBe('block')
  })

  it('exige Tavily y OpenAI configurados, activos y con modelo de catálogo', () => {
    const candidate = input()
    candidate.providerCenter.providers = candidate.providerCenter.providers.map(provider => ({
      ...provider,
      configured: provider.id !== 'tavily',
      active: provider.id !== 'openai',
      selectedModel: provider.id === 'openai' ? 'modelo-ajeno' : provider.selectedModel,
    }))
    const result = evaluateMorellaPilotPreflight(candidate)
    expect(status(result, 'tavily_configured')).toBe('block')
    expect(status(result, 'openai_active')).toBe('block')
    expect(status(result, 'openai_model')).toBe('block')
  })

  it('no acepta la prueba simulada como conexión real', () => {
    const result = evaluateMorellaPilotPreflight(input({
      realConnections: { tavily: 'not_checked', openai: 'not_checked' },
    }))
    expect(result.ready).toBe(false)
    expect(status(result, 'tavily_connection')).toBe('block')
    expect(status(result, 'openai_connection')).toBe('block')
  })

  it('exige tarifas, presupuesto, Supabase, ledger y guarda', () => {
    const result = evaluateMorellaPilotPreflight(input({
      tariffsReady: { tavily: false, openai: true },
      budgetPersisted: false,
      supabase: 'failed',
      ledger: 'not_checked',
      globalGuard: 'busy',
    }))
    expect(status(result, 'tariffs')).toBe('block')
    expect(status(result, 'budget_persisted')).toBe('block')
    expect(status(result, 'supabase')).toBe('block')
    expect(status(result, 'ledger')).toBe('block')
    expect(status(result, 'global_guard')).toBe('block')
  })

  it('avisa si el saldo no es consultable y bloquea si es insuficiente', () => {
    const warning = evaluateMorellaPilotPreflight(input({
      balances: { tavily: 'not_consultable', openai: 'sufficient' },
    }))
    expect(warning.ready).toBe(true)
    expect(status(warning, 'tavily_balance')).toBe('warning')

    const blocked = evaluateMorellaPilotPreflight(input({
      balances: { tavily: 'sufficient', openai: 'insufficient' },
    }))
    expect(blocked.ready).toBe(false)
    expect(status(blocked, 'openai_balance')).toBe('block')
  })

  it('requiere cero tareas reales activas', () => {
    const result = evaluateMorellaPilotPreflight(input({ activeRealTasks: 1 }))
    expect(result.ready).toBe(false)
    expect(status(result, 'zero_active_tasks')).toBe('block')
  })
})
