import { mkdtemp, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { describe, expect, it } from 'vitest'
import { DestinationBatchJobSchema } from '@shared/factory-batch-contracts'
import { buildFactoryBatchTechnicalDiagnostic } from '../src/main/factory-batch-diagnostics'
import { buildFactoryBatchDiagnosticDossier, compactFactoryBatchDiagnosticSummary, persistFactoryBatchDiagnosticDossier, renderFactoryBatchDiagnosticMarkdown } from '../src/main/factory-batch-diagnostic-dossier'

const job = DestinationBatchJobSchema.parse({
  id: '2efade2d-b011-4cc2-a51d-ce2a095036c1', batchId: '7efab485-086e-4687-8610-5a5d96a11b9d', inputIndex: 0,
  originalName: 'Segovia', country: 'España', normalizedName: 'segovia', normalizedCountry: 'ES', normalizedIdentity: 'segovia|ES', canonicalDestinationId: 'fb90002f-7c20-43a0-b709-5bf8f76dda17', identityState: 'NEW', reusePolicy: 'NEEDS_NEW_PRODUCTION', status: 'FAILED', currentPhase: 'ANALYSIS', completedPhases: ['IDENTITY', 'RESEARCH'], artifactRefs: {}, attemptCount: 8, retryable: false, lastFailure: 'TIMEOUT: DeepSeek superó 90000 ms', actualCost: 0, createdAt: new Date('2026-10-01T20:00:00.000Z'), updatedAt: new Date('2026-10-01T20:03:34.000Z'),
})

const providers = { externalCallsAllowed: true, providers: [{ id: 'deepseek' as const, active: true, configured: true }] } as never
const diagnostic = buildFactoryBatchTechnicalDiagnostic(job, providers, { state: 'NOT_AUTHORIZED' }, {
  reservationId: '9aaa90c7-7419-40d8-8448-463dfd44968f', reservationState: 'unknown', providerCallId: 'fa1342ce-b904-43a5-84fe-98f52c42b8b2', realProvider: 'deepseek', model: 'deepseek-flash', reservationOperation: 'analysis.stage_a', requestDispatched: true, reservedAmount: 0.02, committedAmount: 0.048, expectedReservationState: null, requestedTransition: null, ledgerState: 'AMBIGUOUS_PENDING', ambiguityResolution: null,
}, { researchCorpusExists: true, analysisArtifactExists: false, resumeFromStage: 'analysis.stage_a', nextStage: 'analysis.stage_a', expectedProvider: 'deepseek', previousAmbiguousUsageResolved: true, terminalAnalysisRetryAuthorized: false }, { type: 'TOTAL_REQUEST_TIMEOUT', timeoutMs: 90_000, timeoutSource: 'DEEPSEEK_ANALYSIS_DEFAULT', ambiguousRemoteResult: true, reconciliationRequired: true })

function dossier(ambiguityResolutionFailure?: {
  errorCode: string
  technicalCause: string
  reservationId: string
  providerCallId: string
  operation: string
  timestamp?: string
}) {
  return buildFactoryBatchDiagnosticDossier({ job, diagnostic, generatedAt: '2026-10-02T10:00:00.000Z', version: { gitSha: 'f79a620', branch: 'feat/investighost-real-pipeline' },
    reservations: [{ id: '9aaa90c7-7419-40d8-8448-463dfd44968f', call_id: 'fa1342ce-b904-43a5-84fe-98f52c42b8b2', state: 'unknown', reserved_cost: 0.02, currency: 'EUR', provider_id: 'deepseek', model: 'deepseek-flash', stage: '2_analysis.stage_a', operation: 'analysis.stage_a', attempt: 3, created_at: '2026-10-01T20:02:04.000Z' }],
    providerCalls: [{ call_id: 'fa1342ce-b904-43a5-84fe-98f52c42b8b2', reservation_id: '9aaa90c7-7419-40d8-8448-463dfd44968f', state: 'unknown', provider_id: 'deepseek', model: 'deepseek-flash', stage: '2_analysis.stage_a', operation: 'analysis.stage_a', sanitized_error: 'DeepSeek superó 90000 ms', created_at: '2026-10-01T20:03:34.000Z' }],
    ambiguities: [{ call_id: 'fa1342ce-b904-43a5-84fe-98f52c42b8b2', reservation_id: '9aaa90c7-7419-40d8-8448-463dfd44968f', opened_at: '2026-10-01T20:03:34.000Z' }], resolutions: [], artifacts: [{ id: 'research-artifact', artifact_kind: 'checkpoint', artifact_key: 'workflow', version: 8, payload_hash: 'a'.repeat(64), created_at: '2026-10-01T20:00:00.000Z' }], ambiguityResolutionFailure,
  })
}

describe('expediente diagnóstico durable batch', () => {
  it('DIAGNOSTIC_EVENTS_ARE_JOB_SCOPED_APPEND_ONLY_AND_HAVE_STABLE_IDS', () => {
    const first = dossier(), second = dossier()
    expect(first.schemaVersion).toBe('factory-batch-diagnostic-v1')
    expect(first.events.map(event => event.eventId)).toEqual(second.events.map(event => event.eventId))
    expect(first.events.every(event => event.jobId === job.id && event.batchId === job.batchId)).toBe(true)
    expect(first.events.some(event => event.eventType === 'JOB_FAILED')).toBe(true)
    expect(first.events.some(event => event.eventType === 'PROVIDER_CALL_TIMEOUT')).toBe(true)
    expect(first.events.some(event => event.eventType === 'AMBIGUITY_DETECTED')).toBe(true)
  })

  it('SEGOVIA_DOSSIER exports known durable facts and marks unavailable historical information UNKNOWN', () => {
    const markdown = renderFactoryBatchDiagnosticMarkdown(dossier())
    expect(markdown).toContain('CURRENT_STAGE: analysis.stage_a')
    expect(markdown).toContain('EXPECTED_PROVIDER: deepseek')
    expect(markdown).toContain('LAST_RESERVATION: 9aaa90c7-7419-40d8-8448-463dfd44968f')
    expect(markdown).toContain('LAST_PROVIDER_CALL: fa1342ce-b904-43a5-84fe-98f52c42b8b2')
    expect(markdown).toContain('BUDGET_LIMIT: UNKNOWN')
    expect(compactFactoryBatchDiagnosticSummary(dossier())).toContain('ATTEMPT=8')
  })

  it('DOSSIER_DISTINGUISHES_AUTH_ELIGIBILITY_FROM_RETRY_ELIGIBILITY', () => {
    const markdown = renderFactoryBatchDiagnosticMarkdown(dossier())
    const summary = compactFactoryBatchDiagnosticSummary(dossier())
    expect(markdown).toContain('SAFE_TO_REQUEST_AUTHORIZATION: false')
    expect(markdown).toContain('PROVIDER_CALL_ALLOWED: false')
    expect(summary).toContain('SAFE_TO_REQUEST_AUTHORIZATION=false')
    expect(summary).toContain('PROVIDER_CALL_ALLOWED=false')
  })

  it('HUMAN_MARKDOWN_EXPORT_MATCHES_STRUCTURED_SOURCE and never serializes secrets or prompt content', async () => {
    const value = dossier()
    const dir = await mkdtemp(path.join(os.tmpdir(), 'investighost-dossier-'))
    const first = await persistFactoryBatchDiagnosticDossier(dir, value)
    await persistFactoryBatchDiagnosticDossier(dir, value)
    const jsonl = await readFile(first.jsonlPath, 'utf8')
    const markdown = await readFile(first.markdownPath, 'utf8')
    expect(jsonl.split('\n').filter(Boolean)).toHaveLength(value.events.length)
    expect(markdown).toContain('CURRENT_STATUS')
    expect(`${jsonl}\n${markdown}`).not.toContain('sk-secret')
    expect(`${jsonl}\n${markdown}`).not.toContain('promptContent')
  })

  it('DIAGNOSTIC_DOSSIER_CAPTURES_RECONCILIATION_FAILURE without changing the selected ambiguity', () => {
    const value = dossier({
      errorCode: 'AMBIGUOUS_RESERVATION_MISMATCH',
      technicalCause: 'AMBIGUOUS_RESERVATION_MISMATCH',
      reservationId: '9aaa90c7-7419-40d8-8448-463dfd44968f',
      providerCallId: 'fa1342ce-b904-43a5-84fe-98f52c42b8b2',
      operation: 'prudential reconciliation',
      timestamp: '2026-10-03T18:00:00.000Z',
      expectedReservationId: '9aaa90c7-7419-40d8-8448-463dfd44968f',
      receivedReservationId: '9aaa90c7-7419-40d8-8448-463dfd44968f',
      expectedProviderCallId: 'fa1342ce-b904-43a5-84fe-98f52c42b8b2',
      receivedProviderCallId: 'fa1342ce-b904-43a5-84fe-98f52c42b8b2',
      mismatchField: 'backend reservation contract guard',
    })
    const event = value.events.find(item => item.eventType === 'AMBIGUITY_RESOLUTION_FAILED')
    expect(event).toMatchObject({
      reservationId: '9aaa90c7-7419-40d8-8448-463dfd44968f',
      providerCallId: 'fa1342ce-b904-43a5-84fe-98f52c42b8b2',
      operation: 'prudential reconciliation',
      data: {
        errorCode: 'AMBIGUOUS_RESERVATION_MISMATCH', technicalCause: 'AMBIGUOUS_RESERVATION_MISMATCH',
        expectedReservationId: '9aaa90c7-7419-40d8-8448-463dfd44968f', receivedReservationId: '9aaa90c7-7419-40d8-8448-463dfd44968f',
        expectedProviderCallId: 'fa1342ce-b904-43a5-84fe-98f52c42b8b2', receivedProviderCallId: 'fa1342ce-b904-43a5-84fe-98f52c42b8b2', mismatchField: 'backend reservation contract guard',
      },
    })
    expect(value.events.find(item => item.eventType === 'AMBIGUITY_DETECTED')?.data.reconciliationRequired).toBe(true)
  })

  it('DOSSIER_HISTORICAL_ATTEMPT_NOT_REPLACED_WITH_CURRENT_ATTEMPT', () => {
    const value = dossier()
    expect(value.events.find(item => item.eventType === 'RESERVATION_OBSERVED')?.jobAttempt).toBe('UNKNOWN')
    expect(value.events.find(item => item.eventType === 'RESERVATION_OBSERVED')?.stageAttempt).toBe(3)
    expect(value.events.find(item => item.eventType === 'PROVIDER_CALL_TIMEOUT')?.jobAttempt).toBe('UNKNOWN')
    expect(value.events.find(item => item.eventType === 'AMBIGUITY_DETECTED')?.jobAttempt).toBe('UNKNOWN')
    expect(value.events.find(item => item.eventType === 'AMBIGUITY_DETECTED')?.stageAttempt).toBe(3)
    expect(value.events.find(item => item.eventType === 'ARTIFACT_REFERENCE_OBSERVED')?.jobAttempt).toBe('UNKNOWN')
    expect(renderFactoryBatchDiagnosticMarkdown(value)).toContain('GIT_SHA_CURRENT: f79a620')
  })

  it('AUTHORIZATION_GRANTED is emitted only for an explicit authorization transition, never a dossier read', async () => {
    const withoutTransition = dossier()
    const withTransition = buildFactoryBatchDiagnosticDossier({
      job, diagnostic, generatedAt: '2026-10-02T10:00:00.000Z', reservations: [], providerCalls: [], ambiguities: [], resolutions: [], artifacts: [],
      authorizationGranted: { authorizedAt: '2026-10-02T10:05:00.000Z', expectedProvider: 'deepseek', nextStage: 'analysis.stage_a' },
    })
    expect(withoutTransition.events.some(event => event.eventType === 'AUTHORIZATION_GRANTED')).toBe(false)
    expect(withTransition.events.filter(event => event.eventType === 'AUTHORIZATION_GRANTED')).toHaveLength(1)
    const dir = await mkdtemp(path.join(os.tmpdir(), 'investighost-auth-dossier-'))
    await persistFactoryBatchDiagnosticDossier(dir, withTransition)
    await persistFactoryBatchDiagnosticDossier(dir, withTransition)
    const jsonl = await readFile(path.join(dir, 'diagnostics', 'jobs', `${job.id}.jsonl`), 'utf8')
    expect(jsonl.split('\n').filter(line => line.includes('AUTHORIZATION_GRANTED'))).toHaveLength(1)
  })

  it('INCOMPLETE_EVENT_EXPORTS_OUTPUT_LIMIT_METADATA without treating a completed provider result as ambiguity', () => {
    const value = buildFactoryBatchDiagnosticDossier({
      job: { ...job, attemptCount: 9, lastFailure: 'INCOMPLETE: max_output_tokens' }, diagnostic,
      generatedAt: '2026-10-04T12:47:00.000Z', reservations: [], ambiguities: [], resolutions: [], artifacts: [],
      outputPolicy: { maxOutputTokensConfigured: 12_000, maxOutputTokensSent: 12_000, recommendedFix: 'Stage B conciso' },
      providerCalls: [{ call_id: '0fe96e38-ee08-4cdd-abf4-dcf822ee95f4', reservation_id: '6435a9e1-0f6f-480a-bd04-613cb15e68ad', state: 'failed', provider_id: 'deepseek', model: 'deepseek-flash', stage: '1_analysis.stage_b', operation: 'analysis.stage_b', attempt: 1, remote_id: '381ddebe-f433-4d3e-ac2e-ad6d8b5dc1d3', input_tokens: 4908, output_tokens: 12000, calculated_cost: 0.0079362, sanitized_error: 'INCOMPLETE|type=incomplete|code=max_output_tokens|message=truncated', created_at: '2026-10-04T12:46:54.000Z' }],
    })
    expect(value.events.find(event => event.eventType === 'PROVIDER_CALL_INCOMPLETE')).toMatchObject({
      jobAttempt: 'UNKNOWN', stageAttempt: 1,
      data: { incompleteType: 'incomplete', incompleteCode: 'max_output_tokens', maxOutputTokensConfigured: 12_000, maxOutputTokensSent: 12_000, outputTokens: 12_000, inputTokens: 4908, calculatedCost: 0.0079362 },
    })
  })
})
