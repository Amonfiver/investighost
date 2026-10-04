import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import path from 'node:path'
import type { DestinationBatchJob } from '@shared/factory-batch-contracts'
import type { FactoryBatchTechnicalDiagnostic } from './factory-batch-diagnostics'

export const FACTORY_BATCH_DIAGNOSTIC_SCHEMA_VERSION = 'factory-batch-diagnostic-v1'

type Row = Record<string, unknown>

export type FactoryBatchDiagnosticEvent = {
  schemaVersion: typeof FACTORY_BATCH_DIAGNOSTIC_SCHEMA_VERSION
  eventId: string
  eventType: string
  timestamp: string
  jobId: string
  batchId: string
  destinationId: string | null
  executionId: string
  jobAttempt: number | 'UNKNOWN'
  stageAttempt: number | 'UNKNOWN'
  phase: string
  operation: string
  stage: string | null
  reservationId: string | null
  providerCallId: string | null
  data: Record<string, unknown>
}

export type FactoryBatchDiagnosticDossier = {
  schemaVersion: typeof FACTORY_BATCH_DIAGNOSTIC_SCHEMA_VERSION
  generatedAt: string
  job: DestinationBatchJob
  diagnostic: FactoryBatchTechnicalDiagnostic
  events: FactoryBatchDiagnosticEvent[]
  version: { applicationVersion: string; gitSha: string; branch: string; buildId: string }
}

/** A failed human reconciliation has no durable ledger transition, so it must
 * be represented explicitly in the append-only local diagnostic dossier. */
export type FactoryBatchAmbiguityResolutionFailure = {
  errorCode: string
  technicalCause: string
  reservationId: string
  providerCallId: string
  operation: string
  timestamp?: string
  expectedReservationId?: string
  receivedReservationId?: string
  expectedProviderCallId?: string
  receivedProviderCallId?: string
  mismatchField?: string
}

export type FactoryBatchAuthorizationGrantedEvent = {
  authorizedAt: string
  expectedProvider: string | null
  nextStage: string | null
}

export function buildFactoryBatchDiagnosticDossier(input: {
  job: DestinationBatchJob
  diagnostic: FactoryBatchTechnicalDiagnostic
  reservations: Row[]
  providerCalls: Row[]
  ambiguities: Row[]
  resolutions: Row[]
  artifacts: Row[]
  ambiguityResolutionFailure?: FactoryBatchAmbiguityResolutionFailure
  authorizationGranted?: FactoryBatchAuthorizationGrantedEvent
  outputPolicy?: { maxOutputTokensConfigured: number; maxOutputTokensSent: number; recommendedFix: string }
  version?: Partial<FactoryBatchDiagnosticDossier['version']>
  generatedAt?: string
}): FactoryBatchDiagnosticDossier {
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const version = { applicationVersion: input.version?.applicationVersion ?? 'UNKNOWN', gitSha: input.version?.gitSha ?? 'UNKNOWN', branch: input.version?.branch ?? 'UNKNOWN', buildId: input.version?.buildId ?? 'UNKNOWN' }
  const base = identity(input.job, input.diagnostic)
  const events: FactoryBatchDiagnosticEvent[] = []
  const add = (eventType: string, timestamp: unknown, data: Record<string, unknown>, override: Partial<Pick<FactoryBatchDiagnosticEvent, 'reservationId' | 'providerCallId' | 'stage' | 'operation' | 'phase' | 'jobAttempt' | 'stageAttempt'>> = {}) => {
    const event: Omit<FactoryBatchDiagnosticEvent, 'eventId'> = {
      schemaVersion: FACTORY_BATCH_DIAGNOSTIC_SCHEMA_VERSION,
      eventType, timestamp: asIso(timestamp, generatedAt), ...base, jobAttempt: override.jobAttempt ?? base.jobAttempt, stageAttempt: override.stageAttempt ?? 'UNKNOWN',
      phase: override.phase ?? base.phase, operation: override.operation ?? base.operation,
      stage: override.stage ?? null, reservationId: override.reservationId ?? null, providerCallId: override.providerCallId ?? null,
      data: sanitizeDiagnosticData({ ...data, version }),
    }
    events.push({ ...event, eventId: stableEventId(event) })
  }
  add('JOB_SNAPSHOT', input.job.updatedAt.toISOString(), {
    status: input.job.status, currentPhase: input.job.currentPhase, completedPhases: input.job.completedPhases,
    errorCode: input.diagnostic.errorCode, errorMessage: input.diagnostic.humanMessage,
    technicalCause: input.diagnostic.internalCauseSanitized, retryable: input.diagnostic.retryable,
    retryReason: input.diagnostic.retryReason, suggestedAction: input.diagnostic.suggestedAction,
    expected: { phase: input.diagnostic.phase, provider: input.diagnostic.expectedProvider, operation: input.diagnostic.operation, timeoutMs: input.diagnostic.timeout?.timeoutMs ?? null },
    actual: { phase: input.job.currentPhase, provider: input.diagnostic.reservation?.realProvider ?? null, operation: input.diagnostic.reservation?.reservationOperation ?? null },
    pipeline: { resumeCursor: input.diagnostic.resumeFromStage, nextStage: input.diagnostic.nextStage, researchReused: input.diagnostic.reusedResearchCorpus },
    authorization: { mode: input.diagnostic.executionMode, networkEnabled: input.diagnostic.networkGate === 'ENABLED', providerActive: input.diagnostic.providerActive, credentialConfigured: input.diagnostic.credentialConfigured, state: input.diagnostic.authorizationState },
  }, { reservationId: input.diagnostic.reservation?.reservationId ?? null, providerCallId: input.diagnostic.reservation?.providerCallId ?? null })
  if (input.job.lastFailure) add('JOB_FAILED', input.diagnostic.timestamp, { errorCode: input.diagnostic.errorCode, errorMessage: input.job.lastFailure, retryable: input.diagnostic.retryable, suggestedAction: input.diagnostic.suggestedAction })
  if (input.authorizationGranted) add('AUTHORIZATION_GRANTED', input.authorizationGranted.authorizedAt, {
    expectedProvider: input.authorizationGranted.expectedProvider,
    nextStage: input.authorizationGranted.nextStage,
    authorizationGrantId: `${input.job.id}:${input.authorizationGranted.authorizedAt}`,
  })
  const reservationAttempts = new Map(input.reservations.map(row => [asString(row.id), historicalAttempt(row.attempt)]))
  for (const row of input.reservations) add('RESERVATION_OBSERVED', row.created_at ?? row.updated_at, {
    reservationState: row.state ?? 'UNKNOWN', reservedAmount: row.reserved_cost ?? null, reservedCurrency: row.currency ?? null,
    calculatedCost: row.calculated_cost ?? null, provider: row.provider_id ?? null, model: row.model ?? null, attempt: row.attempt ?? null,
  }, { reservationId: asString(row.id), providerCallId: asString(row.call_id), stage: nullableString(row.stage), operation: nullableString(row.operation) ?? base.operation, jobAttempt: 'UNKNOWN', stageAttempt: historicalAttempt(row.attempt) })
  for (const row of input.providerCalls) {
    const incomplete = incompleteMetadata(row.sanitized_error)
    add(incomplete ? 'PROVIDER_CALL_INCOMPLETE' : String(row.state) === 'unknown' ? 'PROVIDER_CALL_TIMEOUT' : 'PROVIDER_CALL_OBSERVED', row.created_at, {
    provider: row.provider_id ?? null, model: row.model ?? null, state: row.state ?? 'UNKNOWN', requestDispatched: row.state === 'started' || row.state === 'unknown',
    remoteRequestId: row.remote_id ?? null, inputTokens: row.input_tokens ?? null, outputTokens: row.output_tokens ?? null,
    estimatedCost: row.estimated_cost ?? null, calculatedCost: row.calculated_cost ?? null, sanitizedError: row.sanitized_error ?? null,
    incompleteType: incomplete?.type ?? null, incompleteCode: incomplete?.code ?? null,
    maxOutputTokensConfigured: incomplete ? input.outputPolicy?.maxOutputTokensConfigured ?? null : null,
    maxOutputTokensSent: incomplete ? input.outputPolicy?.maxOutputTokensSent ?? null : null,
    recommendedFix: incomplete ? input.outputPolicy?.recommendedFix ?? null : null,
  }, { reservationId: asString(row.reservation_id), providerCallId: asString(row.call_id), stage: nullableString(row.stage), operation: nullableString(row.operation) ?? base.operation, jobAttempt: 'UNKNOWN', stageAttempt: historicalAttempt(row.attempt) })
  }
  for (const row of input.ambiguities) add(row.resolved_at ? 'AMBIGUITY_RESOLVED' : 'AMBIGUITY_DETECTED', row.resolved_at ?? row.opened_at, {
    remoteResult: row.resolved_at ? String(row.terminal_decision ?? 'UNKNOWN').toUpperCase() : 'INDETERMINATE', reconciliationRequired: !row.resolved_at,
    reconciliationDecision: row.terminal_decision ?? null,
  }, { reservationId: asString(row.reservation_id), providerCallId: asString(row.call_id), jobAttempt: 'UNKNOWN', stageAttempt: reservationAttempts.get(asString(row.reservation_id)) ?? 'UNKNOWN' })
  if (input.ambiguityResolutionFailure) {
    const failure = input.ambiguityResolutionFailure
    add('AMBIGUITY_RESOLUTION_FAILED', failure.timestamp ?? generatedAt, {
      errorCode: failure.errorCode,
      technicalCause: failure.technicalCause,
      expectedReservationId: failure.expectedReservationId ?? null,
      receivedReservationId: failure.receivedReservationId ?? null,
      expectedProviderCallId: failure.expectedProviderCallId ?? null,
      receivedProviderCallId: failure.receivedProviderCallId ?? null,
      mismatchField: failure.mismatchField ?? null,
      suggestedAction: 'Aplicar las migraciones locales requeridas y volver a intentar la resolución humana.',
    }, { reservationId: failure.reservationId, providerCallId: failure.providerCallId, operation: failure.operation, jobAttempt: 'UNKNOWN' })
  }
  for (const row of input.resolutions) add('HUMAN_RECONCILIATION_RECORDED', row.decided_at, {
    decision: row.decision ?? 'UNKNOWN', responseRecovered: row.response_recovered ?? null,
    evidenceSource: evidenceType(row.external_usage_evidence), evidenceLimitation: evidenceLimitation(row.external_usage_evidence),
    confirmedProviderCost: row.recognized_cost ?? null, prudentialAssumedCost: row.prudential_cost ?? null,
    accountingMode: row.decision === 'prudential_cost_assumed' ? 'PRUDENTIAL_MAX_ASSUMED' : null,
    providerCostConfirmed: row.provider_confirmed ?? null, insufficientEvidenceReason: row.reason ?? null,
  }, { reservationId: asString(row.reservation_id), providerCallId: asString(row.call_id), operation: nullableString(row.operation) ?? base.operation, jobAttempt: 'UNKNOWN', stageAttempt: reservationAttempts.get(asString(row.reservation_id)) ?? 'UNKNOWN' })
  for (const row of input.artifacts) add('ARTIFACT_REFERENCE_OBSERVED', row.created_at, {
    artifactId: row.id ?? null, kind: row.artifact_kind ?? null, key: row.artifact_key ?? null, version: row.version ?? null, payloadHash: row.payload_hash ?? null,
  }, { jobAttempt: 'UNKNOWN' })
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.eventId.localeCompare(b.eventId))
  return { schemaVersion: FACTORY_BATCH_DIAGNOSTIC_SCHEMA_VERSION, generatedAt, job: input.job, diagnostic: input.diagnostic, events, version }
}

export function renderFactoryBatchDiagnosticMarkdown(dossier: FactoryBatchDiagnosticDossier): string {
  const d = dossier.diagnostic
  const timeline = dossier.events.filter(event => ['JOB_FAILED', 'PROVIDER_CALL_TIMEOUT', 'AMBIGUITY_DETECTED', 'AMBIGUITY_RESOLUTION_FAILED', 'AMBIGUITY_RESOLVED', 'HUMAN_RECONCILIATION_RECORDED'].includes(event.eventType))
    .map(event => `- Job attempt ${event.jobAttempt}${event.stageAttempt === 'UNKNOWN' ? '' : ` · Stage attempt ${event.stageAttempt}`} · ${event.timestamp} · ${event.eventType}${event.data.errorCode ? ` · ${event.data.errorCode}` : ''}`).join('\n') || '- UNKNOWN'
  return `# Expediente diagnóstico — ${d.jobId}\n\n## Timeline\n${timeline}\n\n## CURRENT_STATUS\n\n- CURRENT_STATUS: ${dossier.job.status}\n- CURRENT_PHASE: ${d.phase}\n- CURRENT_STAGE: ${d.resumeFromStage ?? 'UNKNOWN'}\n- NEXT_STAGE: ${d.nextStage ?? 'UNKNOWN'}\n- EXPECTED_PROVIDER: ${d.expectedProvider ?? 'UNKNOWN'}\n- ACTUAL_PROVIDER_LAST_CALL: ${d.reservation?.realProvider ?? 'UNKNOWN'}\n- LAST_ERROR: ${d.internalCauseSanitized}\n- LAST_ERROR_CODE: ${d.errorCode}\n- LAST_RESERVATION: ${d.reservation?.reservationId ?? 'UNKNOWN'}\n- LAST_PROVIDER_CALL: ${d.reservation?.providerCallId ?? 'UNKNOWN'}\n- ACTIVE_RESERVATION: ${d.reservation?.reservationState === 'unknown' ? d.reservation.reservationId : 'NONE'}\n- AMBIGUITY_PENDING: ${d.reservation?.reservationState === 'unknown'}\n- REMOTE_RESULT: ${d.reservation?.reservationState === 'unknown' ? 'INDETERMINATE' : d.reservation?.ambiguityResolution?.prudential?.remoteResult ?? 'UNKNOWN'}\n- RECONCILIATION_REQUIRED: ${d.timeout?.reconciliationRequired ?? false}\n- AUTHORIZATION_STATE: ${d.authorizationState}\n- RESEARCH_REUSED: ${d.reusedResearchCorpus}\n- BUDGET_LIMIT: UNKNOWN\n- BUDGET_USED: ${d.reservation?.committedAmount ?? 'UNKNOWN'}\n- PRUDENTIAL_EXPOSURE: ${d.reservation?.ambiguityResolution?.prudential?.amount ?? 0} EUR\n- CONFIRMED_PROVIDER_COST: ${d.reservation?.ambiguityResolution?.evidence?.providerCost ?? 'UNKNOWN'} ${d.reservation?.ambiguityResolution?.evidence?.currency ?? ''}\n- SAFE_TO_RETRY: ${d.retryable && d.reservation?.reservationState !== 'unknown'}\n- NEXT_HUMAN_ACTION: ${d.suggestedAction}\n- GIT_SHA_CURRENT: ${dossier.version.gitSha}\n`
}

export function compactFactoryBatchDiagnosticSummary(dossier: FactoryBatchDiagnosticDossier): string {
  const d = dossier.diagnostic
  return [`JOB=${d.jobId}`, `ATTEMPT=${d.attempt}`, `STATUS=${dossier.job.status}`, `PHASE=${d.phase}`, `STAGE=${d.resumeFromStage ?? 'UNKNOWN'}`, `NEXT_STAGE=${d.nextStage ?? 'UNKNOWN'}`, `EXPECTED_PROVIDER=${d.expectedProvider ?? 'UNKNOWN'}`, `LAST_ERROR=${d.errorCode}`, `RESERVATION=${d.reservation?.reservationId ?? 'UNKNOWN'}`, `PROVIDER_CALL=${d.reservation?.providerCallId ?? 'UNKNOWN'}`, `LEDGER=${d.reservation?.ledgerState ?? 'UNKNOWN'}`, `REMOTE_RESULT=${d.reservation?.reservationState === 'unknown' ? 'INDETERMINATE' : 'UNKNOWN'}`, `RECONCILIATION=${d.timeout?.reconciliationRequired ?? false}`, `AUTHORIZATION=${d.authorizationState}`, `RESEARCH_REUSED=${d.reusedResearchCorpus}`, `BUDGET=${d.reservation?.committedAmount ?? 'UNKNOWN'}`, `PRUDENTIAL_EXPOSURE=${d.reservation?.ambiguityResolution?.prudential?.amount ?? 0}`, `SAFE_TO_RETRY=${d.retryable && d.reservation?.reservationState !== 'unknown'}`, `NEXT_HUMAN_ACTION=${d.suggestedAction}`, `GIT_SHA=${dossier.version.gitSha}`].join('\n')
}

export async function persistFactoryBatchDiagnosticDossier(baseDir: string, dossier: FactoryBatchDiagnosticDossier): Promise<{ jsonlPath: string; markdownPath: string }> {
  const dir = path.join(baseDir, 'diagnostics', 'jobs')
  await mkdir(dir, { recursive: true })
  const jsonlPath = path.join(dir, `${dossier.diagnostic.jobId}.jsonl`)
  const markdownPath = path.join(dir, `${dossier.diagnostic.jobId}.md`)
  const prior = await readFile(jsonlPath, 'utf8').catch(() => '')
  const known = new Set(prior.split('\n').flatMap(line => { try { return [String((JSON.parse(line) as { eventId?: unknown }).eventId ?? '')] } catch { return [] } }))
  const fresh = dossier.events.filter(event => !known.has(event.eventId)).map(event => JSON.stringify(event)).join('\n')
  if (fresh) await appendFile(jsonlPath, `${prior && !prior.endsWith('\n') ? '\n' : ''}${fresh}\n`, 'utf8')
  await writeFile(markdownPath, renderFactoryBatchDiagnosticMarkdown(dossier), 'utf8')
  return { jsonlPath, markdownPath }
}

function identity(job: DestinationBatchJob, diagnostic: FactoryBatchTechnicalDiagnostic) {
  return { jobId: job.id, batchId: job.batchId, destinationId: job.canonicalDestinationId ?? null, executionId: diagnostic.executionId, jobAttempt: job.attemptCount, phase: diagnostic.phase, operation: diagnostic.operation }
}
function stableEventId(value: Omit<FactoryBatchDiagnosticEvent, 'eventId'>): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function asIso(value: unknown, fallback: string): string { const date = value ? new Date(String(value)) : null; return date && !Number.isNaN(date.valueOf()) ? date.toISOString() : fallback }
function asString(value: unknown): string | null { return typeof value === 'string' ? value : null }
function nullableString(value: unknown): string | null { return typeof value === 'string' && value ? value : null }
function historicalAttempt(value: unknown): number | 'UNKNOWN' { return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 'UNKNOWN' }
function evidenceType(value: unknown): string | null { return value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Row).evidenceType === 'string' ? String((value as Row).evidenceType) : null }
function evidenceLimitation(value: unknown): string | null { return value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Row).limitation === 'string' ? String((value as Row).limitation) : null }
function incompleteMetadata(value: unknown): { type: string | null; code: string | null } | null {
  if (typeof value !== 'string' || !/^INCOMPLETE\|/i.test(value)) return null
  const parts = new Map(value.split('|').slice(1).map(part => {
    const index = part.indexOf('=')
    return index < 0 ? [part, ''] : [part.slice(0, index), part.slice(index + 1)]
  }))
  return { type: parts.get('type') ?? null, code: parts.get('code') ?? null }
}
export function sanitizeDiagnosticData(value: unknown): Record<string, unknown> { return sanitize(value) as Record<string, unknown> }
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize)
  if (!value || typeof value !== 'object') return typeof value === 'string'
    ? value.replace(/(?:sk-|tvly-|authorization\s*[:=]|bearer\s+|(?:access|refresh|session)[_-]?token\s*[:=]|token\s*[:=]|secret\s*[:=]|password\s*[:=]|cookie\s*[:=])[^\s,;]*/gi, '[REDACTED]')
    : value
  return Object.fromEntries(Object.entries(value as Row).flatMap(([key, item]) => isSensitiveDiagnosticKey(key) ? [] : [[key, sanitize(item)]]))
}

function isSensitiveDiagnosticKey(key: string): boolean {
  const normalized = key.toLowerCase()
  return /(?:api.*key|secret|authorization|cookie|password|prompt(?:content|text|payload)?|^content$)/i.test(key)
    || normalized === 'token'
    || (normalized.endsWith('token') && !normalized.endsWith('tokens'))
}
