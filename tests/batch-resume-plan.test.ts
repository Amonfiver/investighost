import { describe, expect, it } from 'vitest'
import { deriveBatchResumePlan } from '@modules/factory-batches'

describe('batch durable resume plan', () => {
  it('CONFIRMED_CONSUMED_RESPONSE_LOST_RESUMES_AT_ANALYSIS and DURABLE_RESEARCH_SKIPS_TAVILY', () => {
    const plan = deriveBatchResumePlan({
      checkpointPayload: { state: 'analyzing_round_1', dossier: { sources: [{ id: 'tavily-segovia' }], rounds: [1] } },
      analysisArtifactExists: false,
      ambiguityResolved: true,
    })
    expect(plan).toEqual({ researchCorpusExists: true, analysisArtifactExists: false, resumeFromStage: 'analysis.stage_a', nextStage: 'analysis.stage_a', expectedProvider: 'deepseek', previousAmbiguousUsageResolved: true })
  })

  it('uses Tavily only when no durable research corpus exists', () => {
    expect(deriveBatchResumePlan({ checkpointPayload: null, analysisArtifactExists: false, ambiguityResolved: false }))
      .toMatchObject({ researchCorpusExists: false, expectedProvider: 'tavily', nextStage: 'research.round_1' })
  })
})
