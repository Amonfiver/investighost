import type { DestinationBatchJob } from '@shared/factory-batch-contracts'
import type { ProviderCenterSnapshot } from '@shared/provider-center-contracts'
import type { BatchJobExecutionAuthorizationStatus } from '@modules/factory-batches'

export type FactoryBatchReservationDiagnostic = {
  reservationId: string
  reservationState: string
  reservedAmount: number
  committedAmount: number
  expectedReservationState: string | null
  requestedTransition: string | null
  ledgerState: string
}

export type FactoryBatchTechnicalDiagnostic = {
  errorCode: string
  humanMessage: string
  phase: string
  operation: string
  jobId: string
  batchId: string
  destinationId: string | null
  executionId: string
  attempt: number
  timestamp: string
  executionMode: 'REAL' | 'SIMULATED'
  networkGate: 'ENABLED' | 'BLOCKED'
  expectedProvider: 'tavily'
  providerActive: boolean
  credentialConfigured: boolean
  authorizationState: 'AUTHORIZED' | 'NOT_AUTHORIZED'
  retryable: boolean
  retryReason: string | null
  internalCauseSanitized: string
  suggestedAction: string
  reservation: FactoryBatchReservationDiagnostic | null
}

/** Projects durable batch facts plus public provider state.  This is a safe
 * diagnostic envelope: credentials, headers and execution capabilities never
 * enter it. */
export function buildFactoryBatchTechnicalDiagnostic(
  job: DestinationBatchJob,
  providers: ProviderCenterSnapshot,
  authorization: BatchJobExecutionAuthorizationStatus,
  reservation: FactoryBatchReservationDiagnostic | null = null,
): FactoryBatchTechnicalDiagnostic {
  const persisted = job.failureDiagnostic
  const errorCode = persisted?.code ?? failureCode(job.lastFailure)
  const tavily = providers.providers.find(provider => provider.id === 'tavily')
  const authorizationRequired = errorCode === 'BATCH_PROVIDER_AUTHORIZATION_REQUIRED'
  return {
    errorCode,
    humanMessage: authorizationRequired ? 'La ejecución del destino no está autorizada.' : 'No se pudo completar este destino.',
    phase: persisted?.phase ?? job.currentPhase,
    operation: persisted?.operation ?? 'BATCH_EDITORIAL_PHASE',
    jobId: job.id,
    batchId: job.batchId,
    destinationId: job.canonicalDestinationId ?? null,
    executionId: `factory-batch:${job.id}`,
    attempt: job.attemptCount,
    timestamp: (persisted?.occurredAt ?? job.updatedAt).toISOString(),
    executionMode: providers.externalCallsAllowed ? 'REAL' : 'SIMULATED',
    networkGate: providers.externalCallsAllowed ? 'ENABLED' : 'BLOCKED',
    expectedProvider: 'tavily',
    providerActive: Boolean(tavily?.active),
    credentialConfigured: Boolean(tavily?.configured),
    authorizationState: authorization.state,
    retryable: job.retryable || authorizationRequired,
    retryReason: authorizationRequired ? 'AUTHORIZATION_REQUIRED' : job.retryable ? 'TRANSIENT_FAILURE' : null,
    internalCauseSanitized: sanitize(persisted?.cause ?? job.lastFailure ?? 'No disponible'),
    suggestedAction: authorizationRequired
      ? 'Autoriza la ejecución real de este lote/job antes de reintentar.'
      : errorCode === 'INVALID_RESERVATION_STATE' && reservation?.reservationState === 'unknown'
        ? 'La llamada anterior tiene resultado remoto ambiguo. Confirma su consumo fuera de la app antes de autorizar otro intento.'
      : job.retryable ? 'Reintenta el trabajo cuando la causa indicada esté resuelta.' : 'Revisa la causa técnica antes de volver a intentarlo.',
    reservation,
  }
}

function failureCode(value: string | undefined): string {
  return value?.match(/[A-Z][A-Z0-9_]{2,}/)?.[0] ?? 'WORKER_PHASE_FAILED'
}

function sanitize(value: string): string {
  return value
    .replace(/(?:authorization|x-internal-editorial-secret|api[_-]?key|token)\s*[:=]\s*[^\s,;]+/gi, 'credential=[REDACTED]')
    .slice(0, 1000)
}
