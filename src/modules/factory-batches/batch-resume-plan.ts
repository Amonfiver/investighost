import type { SupabaseClient } from '@supabase/supabase-js'
import type { DestinationBatchJob } from '@shared/factory-batch-contracts'

export type BatchResumePlan = {
  researchCorpusExists: boolean
  analysisArtifactExists: boolean
  resumeFromStage: 'analysis.stage_a' | null
  nextStage: 'research.round_1' | 'analysis.stage_a' | null
  expectedProvider: 'tavily' | 'deepseek' | null
  previousAmbiguousUsageResolved: boolean
  terminalAnalysisRetryAuthorized: boolean
}

type ResumeArtifacts = {
  checkpointPayload: unknown
  analysisArtifactExists: boolean
  ambiguity: { decision: string; responseRecovered: boolean } | null
}

/** Reads the existing generic durable artifacts rather than treating the batch
 * job's coarse phase as a provider cursor. Research and analysis share the
 * governed workflow, so a persisted analysing checkpoint is authoritative. */
export async function readBatchResumePlan(client: SupabaseClient, job: DestinationBatchJob): Promise<BatchResumePlan> {
  const { data: execution, error: executionError } = await client.from('real_editorial_executions').select('id')
    .eq('owner_type', 'BATCH_JOB').eq('owner_id', job.id).maybeSingle()
  if (executionError || !execution) return emptyResumePlan()
  const executionId = String((execution as { id: unknown }).id)
  const [{ data: checkpoint }, { data: analysis }, { data: ambiguity }] = await Promise.all([
    client.from('real_editorial_artifacts').select('payload').eq('execution_owner_id', executionId)
      .eq('artifact_kind', 'checkpoint').eq('artifact_key', 'workflow').order('version', { ascending: false }).limit(1).maybeSingle(),
    client.from('real_editorial_artifacts').select('id').eq('execution_owner_id', executionId)
      .eq('artifact_kind', 'coverage').eq('artifact_key', 'final').limit(1).maybeSingle(),
    client.from('real_editorial_ambiguous_calls').select('terminal_decision,terminal_resolution_id').eq('execution_owner_id', executionId)
      .eq('terminal_decision', 'consumption_confirmed').limit(1).maybeSingle(),
  ])
  const { data: resolution } = ambiguity?.terminal_resolution_id
    ? await client.from('real_editorial_call_human_resolutions').select('decision,response_recovered')
      .eq('id', ambiguity.terminal_resolution_id).maybeSingle()
    : { data: null }
  return deriveBatchResumePlan({
    checkpointPayload: checkpoint?.payload,
    analysisArtifactExists: Boolean(analysis),
    ambiguity: resolution && typeof resolution.decision === 'string'
      ? { decision: resolution.decision, responseRecovered: resolution.response_recovered === true }
      : null,
  })
}

export function deriveBatchResumePlan(artifacts: ResumeArtifacts): BatchResumePlan {
  const checkpoint = artifacts.checkpointPayload
  const hasDossier = Boolean(checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint)
    && (checkpoint as { dossier?: unknown }).dossier && typeof (checkpoint as { dossier?: unknown }).dossier === 'object')
  const state = checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint)
    ? (checkpoint as { state?: unknown }).state : null
  const resumeAnalysis = hasDossier && state === 'analyzing_round_1' && !artifacts.analysisArtifactExists
  const consumptionConfirmedResponseLost = artifacts.ambiguity?.decision === 'consumption_confirmed'
    && artifacts.ambiguity.responseRecovered === false
  return {
    researchCorpusExists: hasDossier,
    analysisArtifactExists: artifacts.analysisArtifactExists,
    resumeFromStage: resumeAnalysis ? 'analysis.stage_a' : null,
    nextStage: resumeAnalysis ? 'analysis.stage_a' : artifacts.analysisArtifactExists ? null : 'research.round_1',
    expectedProvider: resumeAnalysis ? 'deepseek' : artifacts.analysisArtifactExists ? null : 'tavily',
    previousAmbiguousUsageResolved: Boolean(artifacts.ambiguity),
    terminalAnalysisRetryAuthorized: resumeAnalysis && consumptionConfirmedResponseLost,
  }
}

function emptyResumePlan(): BatchResumePlan {
  return { researchCorpusExists: false, analysisArtifactExists: false, resumeFromStage: null, nextStage: 'research.round_1', expectedProvider: 'tavily', previousAmbiguousUsageResolved: false, terminalAnalysisRetryAuthorized: false }
}

/** The old reservation remains immutable.  This only makes the failed job
 * eligible to create the explicitly authorized next durable attempt. */
export function canRetryReconciledAnalysis(job: DestinationBatchJob, plan: BatchResumePlan): boolean {
  return job.status === 'FAILED'
    && plan.terminalAnalysisRetryAuthorized
    && /^LIMIT_EXCEEDED: La etapa durable anterior terminó; requiere una decisión humana antes de reintentarla/.test(job.lastFailure ?? '')
}
