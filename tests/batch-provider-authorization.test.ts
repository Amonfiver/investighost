import { describe, expect, it } from 'vitest'
import {
  REAL_BATCH_EXECUTION_TOKEN_ENV,
  readBatchJobProviderAuthorization,
} from '@modules/factory-batches/batch-provider-authorization'
import { issueLiveProviderNetworkPermit } from '@modules/real-pipeline/live-provider-access'
import { REAL_EDITORIAL_FEATURE_TOKEN } from '@shared/real-editorial-pilot-contracts'
import type { ProviderCenterSnapshot } from '@shared/provider-center-contracts'

const batchToken = 'batch_execution_token_for_tests_2026'
const owner = {
  type: 'BATCH_JOB' as const,
  id: '71000000-0000-4000-8000-000000000001',
  batchId: '71000000-0000-4000-8000-000000000002',
  destinationId: '71000000-0000-4000-8000-000000000003',
  policyId: 'factory-batch-real-v1',
}

function environment(token: string = batchToken): NodeJS.ProcessEnv {
  return { [REAL_BATCH_EXECUTION_TOKEN_ENV]: token }
}

function providerCenter(): ProviderCenterSnapshot {
  return {
    secureStorageAvailable: true, simulationOnly: true, realClientsAvailable: true,
    externalCallsAllowed: false, pricingCatalogVersion: '2026-07-25.1',
    providers: [
      { id: 'tavily', displayName: 'Tavily', category: 'research_tool', configured: true, credentialMask: '••••••••', active: true, selectedModel: 'search-and-extract', availableModels: ['search-and-extract'], tariffStatus: 'current', tariffVerifiedAt: '2026-07-25T00:00:00.000+02:00', tariffReviewAfter: '2026-08-25T00:00:00.000+02:00', tariffCurrency: 'USD', tariffSummary: 'Tarifa Tavily oficial', connectionState: 'not_tested' },
      { id: 'openai', displayName: 'OpenAI', category: 'intelligence_engine', configured: true, credentialMask: '••••••••', active: true, selectedModel: 'gpt-5.6-luna', availableModels: ['gpt-5.6-luna'], tariffStatus: 'current', tariffVerifiedAt: '2026-07-25T00:00:00.000+02:00', tariffReviewAfter: '2026-08-25T00:00:00.000+02:00', tariffCurrency: 'USD', tariffSummary: 'Tarifa OpenAI oficial', connectionState: 'not_tested' },
    ],
  }
}

function gate(token: string = batchToken) {
  return {
    featureToken: token, providerCenter: providerCenter(),
    preflightStatus: 'ready_for_real_batch_execution' as const,
    executionOwner: owner, taskAuthorized: true, budgetReserved: true,
    globalGuardAcquired: true, intelligenceProviderIds: ['openai' as const],
  }
}

describe('batch real provider authorization', () => {
  it('accepts only the configured batch capability for a BATCH_JOB owner', () => {
    expect(readBatchJobProviderAuthorization(environment())).toMatchObject({ enabled: true })
    expect(() => issueLiveProviderNetworkPermit(gate(), environment())).not.toThrow()
  })

  it.each([
    ['missing batch token', gate(), {}],
    ['invalid batch token', gate('invalid'), environment()],
    ['pilot token for batch', gate(REAL_EDITORIAL_FEATURE_TOKEN), environment()],
  ])('denies %s', (_label, input, env) => {
    expect(() => issueLiveProviderNetworkPermit(input, env)).toThrow(
      expect.objectContaining({ code: 'REAL_FEATURE_DISABLED' }),
    )
  })

  it('does not let the batch capability authorize a pilot route', () => {
    expect(() => issueLiveProviderNetworkPermit({
      ...gate(), preflightStatus: 'ready_for_real_editorial_pilot' as const,
      executionOwner: { type: 'PILOT' as const, id: owner.id },
    }, environment())).toThrow(expect.objectContaining({ code: 'REAL_FEATURE_DISABLED' }))
  })

  it('fails closed before a missing provider could be used', () => {
    const snapshot = providerCenter()
    snapshot.providers = snapshot.providers.filter(provider => provider.id !== 'tavily')
    expect(() => issueLiveProviderNetworkPermit({ ...gate(), providerCenter: snapshot }, environment()))
      .toThrow(expect.objectContaining({ code: 'PROVIDER_NOT_CONFIGURED' }))
  })
})
