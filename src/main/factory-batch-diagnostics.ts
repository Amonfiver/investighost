import type { DestinationBatchJob } from '@shared/factory-batch-contracts'
import type { ProviderCenterSnapshot } from '@shared/provider-center-contracts'
import type { BatchJobExecutionAuthorizationStatus } from '@modules/factory-batches'
import type { BatchResumePlan } from '@modules/factory-batches'
import type { FailureRemediation } from '@modules/factory-batches'

export type FactoryBatchUsageEvidence = {
  evidenceType: string
  provider: string
  model: string
  requestCount: number
  inputCacheHitTokens?: number
  inputCacheMissTokens: number
  outputTokens: number
  providerCost: number
  currency: string
  limitation: string
}

export type FactoryBatchReservationDiagnostic = {
  reservationId: string
  reservationState: string
  providerCallId?: string | null
  realProvider?: string | null
  model?: string | null
  incompleteReason?: string | null
  reservationOperation?: string | null
  reservationAttempt?: number | null
  requestDispatched?: boolean
  callStartedAt?: string | null
  timeoutAt?: string | null
  remoteRequestId?: string | null
  responseHeadersReceived?: boolean | null
  responseBodyStarted?: boolean | null
  reservedAmount: number
  committedAmount: number
  expectedReservationState: string | null
  requestedTransition: string | null
  ledgerState: string
  ambiguityResolution: {
    decision: 'no_consumption' | 'consumption_confirmed' | 'indeterminate' | 'prudential_cost_assumed'
    responseRecovered: boolean
    resolvedAt: string | null
    evidence: FactoryBatchUsageEvidence | null
    prudential: {
      remoteResult: 'INDETERMINATE'
      accountingMode: 'PRUDENTIAL_MAX_ASSUMED'
      amount: number
      currency: 'EUR'
      providerCostConfirmed: false
      reason: string
    } | null
  } | null
}

export type FactoryBatchTimeoutDiagnostic = {
  type: 'TOTAL_REQUEST_TIMEOUT'
  timeoutMs: number
  timeoutSource: string
  ambiguousRemoteResult: boolean
  reconciliationRequired: boolean
}

export type FactoryBatchLimitDiagnostic = {
  type: 'DURABLE_STAGE_RETRY_POLICY'
  value: string
  currentValue: string
  scope: string
  requiresHumanOverride: boolean
  overrideAction: string
}

/** Public correlation facts for an allocation conflict. The raw idempotency
 * key remains local to the ledger and is never exported. */
export type FactoryBatchIdempotencyConflictDiagnostic = {
  operation: string
  stageAttemptRequested: number
  idempotencyKeyFingerprint: string
  conflictingReservationId: string
  conflictingProviderCallId: string | null
  conflictingOperation: string
  conflictingStageAttempt: number | null
  provider: string | null
  model: string | null
  requestDispatched: false
  costCreated: false
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
  expectedProvider: 'tavily' | 'deepseek' | null
  providerActive: boolean
  credentialConfigured: boolean
  authorizationState: 'AUTHORIZED' | 'NOT_AUTHORIZED'
  /** A new human consent may be requested; this never starts a provider call. */
  safeToRequestAuthorization: boolean
  /** A provider call is permitted only after a fresh scoped authorization. */
  providerCallAllowed: boolean
  /** Existing retry eligibility, excluding a new authorization request. */
  safeToRetryWithoutAuthorization: boolean
  remediation: Omit<FailureRemediation, 'available'> | null
  retryable: boolean
  retryReason: string | null
  internalCauseSanitized: string
  suggestedAction: string
  resumeFromStage: string | null
  reusedResearchCorpus: boolean
  nextStage: string | null
  previousAmbiguousUsageResolved: boolean
  reservation: FactoryBatchReservationDiagnostic | null
  limit: FactoryBatchLimitDiagnostic | null
  timeout: FactoryBatchTimeoutDiagnostic | null
  idempotencyConflict: FactoryBatchIdempotencyConflictDiagnostic | null
}

/** Projects durable batch facts plus public provider state.  This is a safe
 * diagnostic envelope: credentials, headers and execution capabilities never
 * enter it. */
export function buildFactoryBatchTechnicalDiagnostic(
  job: DestinationBatchJob,
  providers: ProviderCenterSnapshot,
  authorization: BatchJobExecutionAuthorizationStatus,
  reservation: FactoryBatchReservationDiagnostic | null = null,
  resume: BatchResumePlan | null = null,
  timeout: FactoryBatchTimeoutDiagnostic | null = null,
  remediation: FailureRemediation | null = null,
  idempotencyConflict: FactoryBatchIdempotencyConflictDiagnostic | null = null,
): FactoryBatchTechnicalDiagnostic {
  const persisted = job.failureDiagnostic
  const errorCode = persisted?.code ?? failureCode(job.lastFailure)
  const expectedProvider = resume?.expectedProvider ?? 'tavily'
  const provider = expectedProvider ? providers.providers.find(item => item.id === expectedProvider) : undefined
  const authorizationRequired = errorCode === 'BATCH_PROVIDER_AUTHORIZATION_REQUIRED'
  const terminalStageLimit = errorCode === 'LIMIT_EXCEEDED'
    && /La etapa durable anterior terminó; requiere una decisión humana antes de reintentarla/.test(persisted?.cause ?? job.lastFailure ?? '')
  const reconciledTerminalRetry = terminalStageLimit && Boolean(resume?.terminalAnalysisRetryAuthorized)
  const ordinaryRetry = job.retryable || authorizationRequired || reconciledTerminalRetry
  const safeToRequestAuthorization = Boolean(resume?.expectedProvider)
    && (ordinaryRetry || remediation?.available === true)
  const providerCallAllowed = safeToRequestAuthorization && authorization.state === 'AUTHORIZED'
  const limit = terminalStageLimit ? {
    type: 'DURABLE_STAGE_RETRY_POLICY' as const,
    value: 'HUMAN_RECONCILIATION_REQUIRED',
    currentValue: reconciledTerminalRetry ? 'HUMAN_RESOLVED_RESPONSE_LOST' : 'TERMINAL_STAGE_FAILED',
    scope: resume?.resumeFromStage ?? persisted?.operation ?? job.currentPhase,
    requiresHumanOverride: !reconciledTerminalRetry,
    overrideAction: reconciledTerminalRetry
      ? 'La conciliación humana ya permite una nueva llamada. Reintenta la etapa indicada.'
      : 'Resuelve la llamada ambigua o aporta la decisión humana requerida antes de reintentar.',
  } : null
  return {
    errorCode,
    humanMessage: authorizationRequired ? 'La ejecución del destino no está autorizada.' : 'No se pudo completar este destino.',
    phase: resume?.resumeFromStage ? 'ANALYSIS' : persisted?.phase ?? job.currentPhase,
    operation: resume?.resumeFromStage ?? persisted?.operation ?? 'BATCH_EDITORIAL_PHASE',
    jobId: job.id,
    batchId: job.batchId,
    destinationId: job.canonicalDestinationId ?? null,
    executionId: `factory-batch:${job.id}`,
    attempt: job.attemptCount,
    timestamp: (persisted?.occurredAt ?? job.updatedAt).toISOString(),
    executionMode: providers.externalCallsAllowed ? 'REAL' : 'SIMULATED',
    networkGate: providers.externalCallsAllowed ? 'ENABLED' : 'BLOCKED',
    expectedProvider,
    providerActive: Boolean(provider?.active),
    credentialConfigured: Boolean(provider?.configured),
    authorizationState: authorization.state,
    safeToRequestAuthorization,
    providerCallAllowed,
    safeToRetryWithoutAuthorization: ordinaryRetry,
    remediation: remediation ? { key: remediation.key, version: remediation.version, failurePolicyVersion: remediation.failurePolicyVersion, currentPolicyVersion: remediation.currentPolicyVersion, reason: remediation.reason } : null,
    retryable: ordinaryRetry,
    retryReason: authorizationRequired ? 'AUTHORIZATION_REQUIRED' : remediation?.available ? 'REMEDIATED_STAGE_B_MAX_OUTPUT' : reconciledTerminalRetry ? 'RECONCILED_RESPONSE_LOST' : job.retryable ? 'TRANSIENT_FAILURE' : null,
    internalCauseSanitized: sanitize(persisted?.cause ?? job.lastFailure ?? 'No disponible'),
    suggestedAction: authorizationRequired
      ? `Autoriza la ejecución real para ${providerLabel(expectedProvider)}${resume?.nextStage ? ` en ${resume.nextStage}` : ''} antes de reintentar.`
      : errorCode === 'INVALID_RESERVATION_STATE' && reservation?.reservationState === 'unknown'
        ? 'La llamada anterior tiene resultado remoto ambiguo. Confirma su consumo fuera de la app antes de autorizar otro intento.'
      : errorCode === 'TIMEOUT' && timeout?.reconciliationRequired
        ? 'La solicitud fue despachada localmente, pero el resultado remoto es ambiguo. Comprueba el usage de DeepSeek y resuelve el resultado ambiguo antes de reintentar.'
      : remediation?.available
        ? 'La causa técnica de este fallo fue corregida. Puedes autorizar una nueva ejecución. Research se reutilizará.'
      : reconciledTerminalRetry
        ? `La conciliación humana cerró una llamada sin respuesta recuperable. Reintenta ${resume?.nextStage ?? 'analysis.stage_a'}: se creará una nueva llamada DeepSeek sin repetir Research ni los stages durables previos.`
      : job.retryable ? 'Reintenta el trabajo cuando la causa indicada esté resuelta.' : 'Revisa la causa técnica antes de volver a intentarlo.',
    resumeFromStage: resume?.resumeFromStage ?? null,
    reusedResearchCorpus: resume?.researchCorpusExists ?? false,
    nextStage: resume?.nextStage ?? null,
    previousAmbiguousUsageResolved: resume?.previousAmbiguousUsageResolved ?? false,
    reservation,
    limit,
    timeout,
    idempotencyConflict,
  }
}

function providerLabel(provider: FactoryBatchTechnicalDiagnostic['expectedProvider']): string {
  return provider === 'deepseek' ? 'DeepSeek' : provider === 'tavily' ? 'Tavily' : 'el siguiente provider'
}

function failureCode(value: string | undefined): string {
  return value?.match(/[A-Z][A-Z0-9_]{2,}/)?.[0] ?? 'WORKER_PHASE_FAILED'
}

function sanitize(value: string): string {
  return value
    .replace(/(?:authorization|x-internal-editorial-secret|api[_-]?key|token)\s*[:=]\s*[^\s,;]+/gi, 'credential=[REDACTED]')
    .slice(0, 1000)
}
