import type { DestinationBatchJob } from '@shared/factory-batch-contracts'
import type { BatchResumePlan } from './batch-resume-plan'

/**
 * A named, versioned execution contract is deliberately used instead of a
 * source-control comparison.  A later binary alone must never make an old
 * provider failure spendable again.
 */
export const ANALYSIS_STAGE_B_BOUNDED_OUTPUT_POLICY_VERSION = 'analysis-stage-b-bounded-output-v1'
export const LEGACY_ANALYSIS_STAGE_B_UNBOUNDED_OUTPUT_POLICY_VERSION = 'analysis-stage-b-unbounded-output-v0'
export const ANALYSIS_STAGE_B_MAX_OUTPUT_REMEDIATION_KEY = 'analysis.stage_b.max_output_tokens.bounded-output'

export type FailureRemediation = {
  available: boolean
  key: typeof ANALYSIS_STAGE_B_MAX_OUTPUT_REMEDIATION_KEY
  version: typeof ANALYSIS_STAGE_B_BOUNDED_OUTPUT_POLICY_VERSION
  failurePolicyVersion: typeof LEGACY_ANALYSIS_STAGE_B_UNBOUNDED_OUTPUT_POLICY_VERSION
  currentPolicyVersion: typeof ANALYSIS_STAGE_B_BOUNDED_OUTPUT_POLICY_VERSION
  reason: string
}

export type RemediatedFailureEligibilityInput = {
  job: DestinationBatchJob
  resume: BatchResumePlan | null
  lastReservation: { reservationState: string; reservationOperation: string | null; incompleteReason?: string | null } | null
  ambiguityPending: boolean
  activeReservation: boolean
}

/** Returns an explicit allow-list match for the one historical failure that
 * the bounded Stage B contract remediates.  It intentionally says nothing
 * about other INCOMPLETE failures. */
export function assessRemediatedFailure(input: RemediatedFailureEligibilityInput): FailureRemediation | null {
  const code = input.job.failureDiagnostic?.code ?? failureCode(input.job.lastFailure)
  const cause = `${input.job.failureDiagnostic?.cause ?? ''}\n${input.job.lastFailure ?? ''}`
  const stageBMaxOutputFailure = ['INCOMPLETE', 'IDEMPOTENCY_CONFLICT'].includes(code)
    && input.lastReservation?.reservationOperation === 'analysis.stage_b'
    && /max_output_tokens/i.test(`${cause}\n${input.lastReservation?.incompleteReason ?? ''}`)
  if (!stageBMaxOutputFailure) return null

  const resumeIsIncompleteAnalysis = Boolean(input.resume?.researchCorpusExists)
    && input.resume?.analysisArtifactExists === false
    && input.resume?.expectedProvider === 'deepseek'
    && input.resume.resumeFromStage !== null
  const available = input.job.status === 'FAILED'
    && input.lastReservation?.reservationState === 'failed'
    && resumeIsIncompleteAnalysis
    && !input.ambiguityPending
    && !input.activeReservation

  return {
    available,
    key: ANALYSIS_STAGE_B_MAX_OUTPUT_REMEDIATION_KEY,
    version: ANALYSIS_STAGE_B_BOUNDED_OUTPUT_POLICY_VERSION,
    failurePolicyVersion: LEGACY_ANALYSIS_STAGE_B_UNBOUNDED_OUTPUT_POLICY_VERSION,
    currentPolicyVersion: ANALYSIS_STAGE_B_BOUNDED_OUTPUT_POLICY_VERSION,
    reason: available
      ? 'La policy Stage B acotada corrige explícitamente la respuesta incompleta histórica por max_output_tokens.'
      : 'La remediation existe, pero las precondiciones durables para solicitar una autorización nueva no se cumplen.',
  }
}

function failureCode(value: string | undefined): string {
  return value?.match(/[A-Z][A-Z0-9_]{2,}/)?.[0] ?? 'WORKER_PHASE_FAILED'
}
