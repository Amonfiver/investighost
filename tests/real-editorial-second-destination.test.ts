import { describe, expect, it } from 'vitest'
import {
  missionForPilot,
  realEditorialIdentityKey,
} from '@modules/real-pipeline'
import { evaluateRealEditorialPreflight } from '@modules/real-pipeline/real-editorial-preflight'
import {
  REAL_EDITORIAL_E2E04_POLICY,
  REAL_EDITORIAL_MORELLA_POLICY,
  RealEditorialPilotPolicySchema,
  RealEditorialPilotPrepareSchema,
  RealEditorialPilotRecordSchema,
} from '@shared/real-editorial-pilot-contracts'

const now = '2026-08-08T10:00:00.000Z'
const pilotId = '84000000-0000-4000-8000-000000000001'
const runId = '84000000-0000-4000-8000-000000000002'
const destinationId = '70000000-0000-4000-8000-000000000021'

function albarracinPilot() {
  return RealEditorialPilotRecordSchema.parse({
    id: pilotId,
    policyId: REAL_EDITORIAL_E2E04_POLICY.id,
    mode: 'real_editorial_pilot',
    taskOrigin: 'human_authorized',
    variantKey: 'e2e04',
    preparationKey: 'albarracin-real-editorial-e2e04-prepare',
    identityKey: realEditorialIdentityKey('e2e04', REAL_EDITORIAL_E2E04_POLICY),
    canonicalDestinationId: destinationId,
    destinationName: REAL_EDITORIAL_E2E04_POLICY.destination,
    normalizedDestination: REAL_EDITORIAL_E2E04_POLICY.normalizedDestination,
    countryCode: 'ES',
    destinationType: 'locality',
    language: 'es',
    pipelineVersion: 'real-editorial-v1',
    profiles: [
      { profile: 'adventure', enabled: true, targetWords: 1_000, depth: 'standard' },
      { profile: 'student', enabled: true, targetWords: 1_800, depth: 'deep' },
    ],
    state: 'preflight',
    budgetConfirmed: true,
    publicationCount: 0,
    trawelConnected: false,
    automaticEnabled: false,
    currentRunId: runId,
    version: 1,
    createdAt: now,
    updatedAt: now,
    budget: {
      pilotId,
      taskId: `real-editorial-task:${pilotId}`,
      batchId: `real-editorial-batch:${pilotId}`,
      dailyScopeId: `real-editorial-day:${pilotId}`,
      budgetDate: '2026-08-08',
      currency: 'EUR',
      targetCost: 0.125,
      warningCost: 0.16,
      taskLimitCost: 0.2,
      batchLimitCost: 0.2,
      dailyLimitCost: 0.2,
      manualExtensionCost: 0.25,
      technicalLimitCost: 0.5,
      reservedCost: 0,
      spentCost: 0,
      confirmedAt: now,
    },
  })
}

describe('segunda destinación editorial real E2E-04', () => {
  it('mantiene Morella como valor por defecto y exige Albarracín de forma explícita', () => {
    expect(RealEditorialPilotPrepareSchema.parse({}).policyId)
      .toBe(REAL_EDITORIAL_MORELLA_POLICY.id)
    expect(RealEditorialPilotPrepareSchema.parse({
      policyId: REAL_EDITORIAL_E2E04_POLICY.id,
    }).policyId).toBe(REAL_EDITORIAL_E2E04_POLICY.id)

    expect(RealEditorialPilotPolicySchema.safeParse(REAL_EDITORIAL_MORELLA_POLICY).success).toBe(true)
    expect(RealEditorialPilotPolicySchema.safeParse(REAL_EDITORIAL_E2E04_POLICY).success).toBe(true)
    expect(RealEditorialPilotPolicySchema.safeParse({
      ...REAL_EDITORIAL_E2E04_POLICY,
      destination: REAL_EDITORIAL_MORELLA_POLICY.destination,
      normalizedDestination: REAL_EDITORIAL_MORELLA_POLICY.normalizedDestination,
    }).success).toBe(false)
  })

  it('separa la identidad durable de ambos destinos con la misma variante', () => {
    const morella = realEditorialIdentityKey('e2e04', REAL_EDITORIAL_MORELLA_POLICY)
    const albarracin = realEditorialIdentityKey('e2e04', REAL_EDITORIAL_E2E04_POLICY)

    expect(morella).toMatch(/^[a-f0-9]{64}$/)
    expect(albarracin).toMatch(/^[a-f0-9]{64}$/)
    expect(albarracin).not.toBe(morella)
  })

  it('deriva la misión de Albarracín sin ampliar límites ni fronteras', () => {
    const mission = missionForPilot(albarracinPilot(), new Date(now))

    expect(mission).toMatchObject({
      requestId: pilotId,
      destination: {
        canonicalId: destinationId,
        name: 'Albarracín',
        countryCode: 'ES',
        type: 'locality',
      },
      language: 'es',
      round: 1,
      limits: {
        maxRounds: 2,
        maxFocusedQueriesPerRound: 3,
        maxSources: 8,
        taskBudgetEur: 0.2,
        batchBudgetEur: 0.2,
        dailyBudgetEur: 0.2,
      },
    })
    expect(mission.profiles.map(profile => [profile.profile, profile.targetWords])).toEqual([
      ['adventure', 1_000],
      ['student', 1_800],
    ])
  })

  it('preflight conserva red cerrada y publicación, Trawel y Automatic bloqueados', () => {
    const result = evaluateRealEditorialPreflight({
      policy: REAL_EDITORIAL_E2E04_POLICY,
      featureEnabled: true,
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
            tariffSummary: 'Tarifa oficial vigente',
            tariffSource: 'https://example.test/official',
            connectionState: 'not_tested',
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
            tariffSummary: 'Tarifa oficial vigente',
            tariffSource: 'https://example.test/official',
            connectionState: 'not_tested',
          },
        ],
      },
      repositoryAvailable: true,
      budgetValid: true,
      connectivityValidated: true,
      guardFree: true,
      activeExecutions: 0,
      pendingReservations: 0,
      recoverableReservations: 0,
      humanRequiredCalls: 0,
      budgetDecisionStatus: 'none',
      openAIResponsesCapability: {
        sdkVersion: 'synthetic-compatible',
        status: 'available',
        available: true,
      },
      openAIRequestContract: {
        valid: true,
        issueCount: 0,
        detail: 'Contrato local compatible.',
      },
      duplicateResolution: 'manual_only_coexists',
      boundaries: {
        regenerationBlocked: true,
        publicationBlocked: true,
        trawelConnected: false,
        automaticEnabled: false,
      },
    })

    expect(result).toMatchObject({
      status: 'ready_for_real_editorial_pilot',
      networkCallsPerformed: 0,
      researchExecutionAllowed: true,
      startActionEnabled: true,
      policy: {
        id: REAL_EDITORIAL_E2E04_POLICY.id,
        destination: 'Albarracín',
        maxPublications: 0,
        maxRegenerations: 0,
      },
    })
  })
})
