import { describe, expect, it } from 'vitest'
import { DestinationBatchJobSchema } from '@shared/factory-batch-contracts'
import { assessRemediatedFailure } from '@modules/factory-batches'
import { buildFactoryBatchTechnicalDiagnostic } from '../src/main/factory-batch-diagnostics'

const job = DestinationBatchJobSchema.parse({
  id: '2efade2d-b011-4cc2-a51d-ce2a095036c1', batchId: '7efab485-086e-4687-8610-5a5d96a11b9d', inputIndex: 0,
  originalName: 'Segovia', country: 'España', normalizedName: 'segovia', normalizedCountry: 'ES', normalizedIdentity: 'segovia|ES', canonicalDestinationId: 'fb90002f-7c20-43a0-b709-5bf8f76dda17',
  identityState: 'NEW', reusePolicy: 'NEEDS_NEW_PRODUCTION', status: 'FAILED', currentPhase: 'ANALYSIS', completedPhases: ['IDENTITY', 'RESEARCH'], artifactRefs: {}, attemptCount: 9, retryable: false,
  lastFailure: 'INCOMPLETE: La respuesta quedó incompleta (max_output_tokens)',
  failureDiagnostic: { code: 'INCOMPLETE', phase: 'ANALYSIS', operation: 'analysis.stage_b', cause: 'INCOMPLETE|type=incomplete|code=max_output_tokens|message=truncated', retryable: false, occurredAt: new Date('2026-10-04T12:46:54.000Z') },
  actualCost: 0, createdAt: new Date('2026-10-04T12:00:00.000Z'), updatedAt: new Date('2026-10-04T12:47:00.000Z'),
})

const resume = {
  researchCorpusExists: true, analysisArtifactExists: false, analysisStagesCompleted: [], resumeFromStage: 'analysis.stage_a' as const, nextStage: 'analysis.stage_a' as const,
  expectedProvider: 'deepseek' as const, previousAmbiguousUsageResolved: true, terminalAnalysisRetryAuthorized: false,
}
const reservation = { reservationState: 'failed', reservationOperation: 'analysis.stage_b' }
const providers = { externalCallsAllowed: true, providers: [{ id: 'deepseek' as const, active: true, configured: true }] } as never

describe('remediated historical failures', () => {
  it('HISTORICAL_INCOMPLETE_WITHOUT_REMEDIATION_CANNOT_REQUEST_AUTH and MISSING_REMEDIATION_BLOCKS_AUTH_REQUEST', () => {
    expect(assessRemediatedFailure({ job: { ...job, lastFailure: 'INCOMPLETE: other deterministic failure', failureDiagnostic: { ...job.failureDiagnostic!, cause: 'INCOMPLETE|code=other' } }, resume, lastReservation: reservation, ambiguityPending: false, activeReservation: false })).toBeNull()
  })

  it('HISTORICAL_INCOMPLETE_WITH_MATCHING_REMEDIATION_CAN_REQUEST_AUTH without a git SHA heuristic', () => {
    const remediation = assessRemediatedFailure({ job, resume, lastReservation: reservation, ambiguityPending: false, activeReservation: false })
    expect(remediation).toMatchObject({ available: true, key: 'analysis.stage_b.max_output_tokens.bounded-output', version: 'analysis-stage-b-bounded-output-v1', failurePolicyVersion: 'analysis-stage-b-unbounded-output-v0' })
    const diagnostic = buildFactoryBatchTechnicalDiagnostic(job, providers, { state: 'NOT_AUTHORIZED' }, null, resume, null, remediation)
    expect(diagnostic).toMatchObject({ safeToRetryWithoutAuthorization: false, safeToRequestAuthorization: true, providerCallAllowed: false, retryable: false, expectedProvider: 'deepseek', nextStage: 'analysis.stage_a', reusedResearchCorpus: true })
    expect(diagnostic.suggestedAction).toContain('causa técnica')
  })

  it('IDEMPOTENCY_CONFLICT_AFTER_THE_SAME_STAGE_B_MAX_OUTPUT_FAILURE retains the explicit remediation only', () => {
    const conflict = {
      ...job,
      attemptCount: 10,
      lastFailure: 'IDEMPOTENCY_CONFLICT: La clave idempotente ya pertenece a otra reserva',
      failureDiagnostic: { ...job.failureDiagnostic!, code: 'IDEMPOTENCY_CONFLICT', operation: 'analysis.stage_a', cause: 'IDEMPOTENCY_CONFLICT' },
    }
    const remediation = assessRemediatedFailure({
      job: conflict,
      resume,
      lastReservation: { ...reservation, incompleteReason: 'INCOMPLETE|type=incomplete|code=max_output_tokens|message=truncated' },
      ambiguityPending: false,
      activeReservation: false,
    })
    expect(remediation).toMatchObject({ available: true, key: 'analysis.stage_b.max_output_tokens.bounded-output' })
  })

  it('AFTER_AUTH_PROVIDER_CALL_BECOMES_ALLOWED while OLD_AUTHORIZATION_IS_NOT_REUSED', () => {
    const remediation = assessRemediatedFailure({ job, resume, lastReservation: reservation, ambiguityPending: false, activeReservation: false })
    const before = buildFactoryBatchTechnicalDiagnostic(job, providers, { state: 'NOT_AUTHORIZED' }, null, resume, null, remediation)
    const after = buildFactoryBatchTechnicalDiagnostic(job, providers, { state: 'AUTHORIZED', authorizedAt: '2026-10-04T13:00:00.000Z' }, null, resume, null, remediation)
    expect(before.providerCallAllowed).toBe(false)
    expect(after.providerCallAllowed).toBe(true)
    expect(after.safeToRetryWithoutAuthorization).toBe(false)
  })

  it('ACTIVE_AMBIGUITY_BLOCKS_AUTH_REQUEST and ACTIVE_RESERVATION_BLOCKS_AUTH_REQUEST', () => {
    expect(assessRemediatedFailure({ job, resume, lastReservation: reservation, ambiguityPending: true, activeReservation: false })?.available).toBe(false)
    expect(assessRemediatedFailure({ job, resume, lastReservation: reservation, ambiguityPending: false, activeReservation: true })?.available).toBe(false)
  })

  it('STAGE_A_MISSING_ARTIFACT_RESUMES_AT_STAGE_A while research remains reusable and Tavily is not selected', () => {
    const remediation = assessRemediatedFailure({ job, resume, lastReservation: reservation, ambiguityPending: false, activeReservation: false })
    const diagnostic = buildFactoryBatchTechnicalDiagnostic(job, providers, { state: 'NOT_AUTHORIZED' }, null, resume, null, remediation)
    expect(diagnostic.resumeFromStage).toBe('analysis.stage_a')
    expect(diagnostic.reusedResearchCorpus).toBe(true)
    expect(diagnostic.expectedProvider).toBe('deepseek')
  })
})
