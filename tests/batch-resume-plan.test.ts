import { describe, expect, it } from 'vitest'
import { canRetryReconciledAnalysis, deriveBatchResumePlan } from '@modules/factory-batches'
import type { DestinationBatchJob } from '@shared/factory-batch-contracts'

const failedSegovia = (): DestinationBatchJob => ({
  id: '2efade2d-b011-4cc2-a51d-ce2a095036c1', batchId: '7efab485-086e-4687-8610-5a5d96a11b9d', inputIndex: 0,
  originalName: 'Segovia', country: 'España', normalizedName: 'segovia', normalizedCountry: 'espana', normalizedIdentity: 'segovia|espana',
  canonicalDestinationId: 'fb90002f-7c20-43a0-b709-5bf8f76dda17', identityState: 'NEW', reusePolicy: 'NEEDS_NEW_PRODUCTION',
  status: 'FAILED', currentPhase: 'RESEARCH', completedPhases: ['IDENTITY'], artifactRefs: {}, attemptCount: 6,
  retryable: false, actualCost: 0,
  lastFailure: 'LIMIT_EXCEEDED: La etapa durable anterior terminó; requiere una decisión humana antes de reintentarla',
  createdAt: new Date('2026-09-27T18:36:39.251Z'), updatedAt: new Date('2026-09-29T20:18:48.219Z'),
})

describe('batch durable resume plan', () => {
  it('CONFIRMED_CONSUMED_RESPONSE_LOST_RESUMES_AT_ANALYSIS and DURABLE_RESEARCH_SKIPS_TAVILY', () => {
    const plan = deriveBatchResumePlan({
      checkpointPayload: { state: 'analyzing_round_1', dossier: { sources: [{ id: 'tavily-segovia' }], rounds: [1] } },
      analysisArtifactExists: false,
      ambiguity: { decision: 'consumption_confirmed', responseRecovered: false },
    })
    expect(plan).toEqual({ researchCorpusExists: true, analysisArtifactExists: false, resumeFromStage: 'analysis.stage_a', nextStage: 'analysis.stage_a', expectedProvider: 'deepseek', previousAmbiguousUsageResolved: true, terminalAnalysisRetryAuthorized: true })
    expect(canRetryReconciledAnalysis(failedSegovia(), plan)).toBe(true)
  })

  it('uses Tavily only when no durable research corpus exists', () => {
    expect(deriveBatchResumePlan({ checkpointPayload: null, analysisArtifactExists: false, ambiguity: null }))
      .toMatchObject({ researchCorpusExists: false, expectedProvider: 'tavily', nextStage: 'research.round_1' })
  })

  it('NO_SILENT_LIMIT_BYPASS keeps a terminal analysis blocked without the exact human resolution', () => {
    const plan = deriveBatchResumePlan({
      checkpointPayload: { state: 'analyzing_round_1', dossier: { sources: [{ id: 'tavily-segovia' }] } },
      analysisArtifactExists: false,
      ambiguity: { decision: 'consumption_confirmed', responseRecovered: true },
    })
    expect(plan.terminalAnalysisRetryAuthorized).toBe(false)
    expect(canRetryReconciledAnalysis(failedSegovia(), plan)).toBe(false)
  })
})
