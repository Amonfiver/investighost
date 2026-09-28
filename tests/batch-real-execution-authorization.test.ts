import { describe, expect, it } from 'vitest'
import {
  BatchJobExecutionAuthorizationRegistry,
  DestinationBatchService,
  MemoryDestinationBatchRepository,
  requiresBatchProviderAuthorizationRecovery,
} from '@modules/factory-batches'
import { GeographicResolver, MemoryGeographyCatalogRepository } from '@modules/editorial-pipeline/geography'
import { buildFactoryBatchTechnicalDiagnostic } from '../src/main/factory-batch-diagnostics'
import type { ProviderCenterSnapshot } from '@shared/provider-center-contracts'

const providerCenter = (externalCallsAllowed = true): ProviderCenterSnapshot => ({
  secureStorageAvailable: true, simulationOnly: !externalCallsAllowed, realClientsAvailable: true, externalCallsAllowed,
  pricingCatalogVersion: 'fixture', providers: [
    { id: 'tavily', displayName: 'Tavily', category: 'research_tool', configured: true, credentialMask: '••••', active: true, selectedModel: 'search-and-extract', availableModels: ['search-and-extract'], tariffStatus: 'current', tariffVerifiedAt: '2026-09-27T00:00:00.000Z', tariffReviewAfter: '2026-10-27T00:00:00.000Z', tariffCurrency: 'USD', tariffSummary: 'fixture', connectionState: 'not_tested' },
    { id: 'deepseek', displayName: 'DeepSeek', category: 'intelligence_engine', configured: true, credentialMask: '••••', active: true, selectedModel: 'deepseek-chat', availableModels: ['deepseek-chat'], tariffStatus: 'current', tariffVerifiedAt: '2026-09-27T00:00:00.000Z', tariffReviewAfter: '2026-10-27T00:00:00.000Z', tariffCurrency: 'USD', tariffSummary: 'fixture', connectionState: 'not_tested' },
    { id: 'openai', displayName: 'OpenAI', category: 'intelligence_engine', configured: false, credentialMask: null, active: false, selectedModel: null, availableModels: [], tariffStatus: 'unknown', tariffVerifiedAt: null, tariffReviewAfter: null, tariffCurrency: null, tariffSummary: null, connectionState: 'not_configured' },
  ],
})

async function failedSegovia() {
  const repository = new MemoryDestinationBatchRepository()
  const service = new DestinationBatchService(repository, new GeographicResolver(new MemoryGeographyCatalogRepository([]), 'fixture-v1'))
  const imported = await service.importJson(JSON.stringify({ batchName: 'Piloto real Segovia', destinations: [{ name: 'Segovia', country: 'España' }] }))
  const job = imported.jobs[0]!
  const failed = await repository.updateJob({
    ...job, status: 'FAILED', currentPhase: 'RESEARCH', completedPhases: ['IDENTITY'], canonicalDestinationId: '90000000-0000-4000-8000-000000000099',
    attemptCount: 3, retryable: false, actualCost: 0,
    lastFailure: 'BATCH_PROVIDER_AUTHORIZATION_REQUIRED: falta la capability explícita de ejecución batch',
    failureDiagnostic: { code: 'BATCH_PROVIDER_AUTHORIZATION_REQUIRED', phase: 'RESEARCH', operation: 'BATCH_EDITORIAL_PHASE', cause: 'BATCH_PROVIDER_AUTHORIZATION_REQUIRED: token=should-never-render', retryable: false, occurredAt: new Date('2026-09-27T10:00:00.000Z') },
    updatedAt: new Date('2026-09-27T10:00:00.000Z'),
  })
  return { repository, service, job: failed }
}

describe('real batch execution authorization', () => {
  it('NETWORK_ENABLED_IS_NOT_JOB_AUTHORIZATION and authorization remains scoped to the same job', async () => {
    const { job } = await failedSegovia()
    const environment: NodeJS.ProcessEnv = {}
    const registry = new BatchJobExecutionAuthorizationRegistry(environment)
    expect(registry.status(job)).toEqual({ state: 'NOT_AUTHORIZED' })
    expect(registry.authorize(job).state).toBe('AUTHORIZED')
    expect(registry.status(job).state).toBe('AUTHORIZED')
    expect(environment.INVESTIGHOST_REAL_BATCH_EXECUTION_TOKEN).toMatch(/^[A-Za-z0-9_-]{24,}$/)
    expect(registry.status({ ...job, id: '90000000-0000-4000-8000-000000000098' })).toEqual({ state: 'NOT_AUTHORIZED' })
  })

  it('MISSING_BATCH_AUTHORIZATION remains retryable without duplicating the durable job, then authorization allows the same job to queue', async () => {
    const { service, job } = await failedSegovia()
    expect(requiresBatchProviderAuthorizationRecovery(job)).toBe(true)
    const read = await service.read(job.batchId)
    expect(read.jobs[0]).toMatchObject({ id: job.id, retryable: true, attemptCount: 3 })
    const retried = await service.retry(job.id)
    expect(retried.job).toMatchObject({ id: job.id, batchId: job.batchId, status: 'QUEUED', currentPhase: 'RESEARCH', attemptCount: 3 })
  })

  it('TECH_DETAILS expose actionable public state but redact secrets and authorization material', async () => {
    const { job } = await failedSegovia()
    const diagnostics = buildFactoryBatchTechnicalDiagnostic(job, providerCenter(), { state: 'NOT_AUTHORIZED' })
    expect(diagnostics).toMatchObject({
      errorCode: 'BATCH_PROVIDER_AUTHORIZATION_REQUIRED', phase: 'RESEARCH', operation: 'BATCH_EDITORIAL_PHASE',
      jobId: job.id, batchId: job.batchId, attempt: 3, expectedProvider: 'tavily', providerActive: true,
      credentialConfigured: true, networkGate: 'ENABLED', authorizationState: 'NOT_AUTHORIZED', retryable: true,
      suggestedAction: 'Autoriza la ejecución real de este lote/job antes de reintentar.',
    })
    expect(JSON.stringify(diagnostics)).not.toContain('should-never-render')
    expect(JSON.stringify(diagnostics)).not.toContain('INVESTIGHOST_REAL_BATCH_EXECUTION_TOKEN')
    expect(JSON.stringify(diagnostics)).not.toContain('x-internal-editorial-secret')
  })

  it('reports blocked network independently of public provider configuration', async () => {
    const { job } = await failedSegovia()
    const diagnostics = buildFactoryBatchTechnicalDiagnostic(job, providerCenter(false), { state: 'NOT_AUTHORIZED' })
    expect(diagnostics).toMatchObject({ executionMode: 'SIMULATED', networkGate: 'BLOCKED', providerActive: true, credentialConfigured: true })
  })

  it('TECH_DETAILS expose reservation reconciliation facts without credentials', async () => {
    const { job } = await failedSegovia()
    const diagnostics = buildFactoryBatchTechnicalDiagnostic(job, providerCenter(), { state: 'AUTHORIZED' }, {
      reservationId: '90000000-0000-4000-8000-000000000077', reservationState: 'started', reservedAmount: 0.02,
      committedAmount: 0.048, expectedReservationState: 'reserved | started', requestedTransition: 'started → unknown', ledgerState: 'RESERVED', ambiguityResolution: null,
    })
    expect(diagnostics.reservation).toMatchObject({ reservationState: 'started', reservedAmount: 0.02, committedAmount: 0.048 })
    expect(JSON.stringify(diagnostics)).not.toContain('token=should-never-render')
  })
})
