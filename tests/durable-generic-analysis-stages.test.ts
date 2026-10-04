import { describe, expect, it } from 'vitest'
import { DurableGenericIntelligenceEngine } from '@modules/real-pipeline/durable-generic-real-editorial-execution'
import type { IntelligenceEngine, IntelligenceRoundAnalysis } from '@modules/real-pipeline/ports'
import type { RealResearchDossier, RealResearchMission } from '@shared/real-pipeline-contracts'

const mission = { round: 1 } as RealResearchMission
const dossier = {} as RealResearchDossier
const usage = { providerId: 'deepseek', model: 'deepseek-flash', inputTokens: 1, outputTokens: 1, estimatedCost: 0, currency: 'EUR' as const }
const analysis = {} as IntelligenceRoundAnalysis

describe('durable generic multi-stage analysis checkpoints', () => {
  it('STAGE_A_SUCCEEDED_IS_DURABLY_COMPLETE and RETRY_STAGE_B_DOES_NOT_CALL_STAGE_A', async () => {
    const artifacts = new Map<string, { version: number; payload: unknown }>()
    const repository = {
      latestArtifact: async (_execution: string, _kind: string, key: string) => {
        const value = artifacts.get(key)
        return value ? { ...value } : undefined
      },
      appendArtifact: async (_execution: string, _kind: string, key: string, version: number, payload: unknown) => {
        artifacts.set(key, { version, payload })
      },
    }
    const calls: string[] = []
    let failStageB = true
    const delegate: IntelligenceEngine = {
      id: 'deepseek', model: 'deepseek-flash', simulation: true, analysisStrategy: 'deepseek_multi_stage', analysisStageIds: ['stage_a', 'stage_b'],
      analysisStageBudget: () => 0,
      analyze: async () => analysis,
      analyzeMultiStage: async (_mission, _dossier, _signal, executeStage) => {
        await executeStage('stage_a', async () => { calls.push('stage_a'); return { output: { claims: [] }, usage } })
        await executeStage('stage_b', async () => {
          calls.push('stage_b')
          if (failStageB) throw new Error('INCOMPLETE:max_output_tokens')
          return { output: { gaps: [] }, usage }
        })
        return analysis
      },
      draft: async () => [],
      review: async () => ({ outcome: 'passed', issues: [], promptVersion: 'test', schemaVersion: 'test', usage }),
    }
    const engine = new DurableGenericIntelligenceEngine(delegate, repository as never, 'execution-1')
    await expect(engine.analyzeMultiStage!(mission, dossier, new AbortController().signal, async (_stage, operation) => operation())).rejects.toThrow('INCOMPLETE')
    expect(calls).toEqual(['stage_a', 'stage_b'])
    expect(artifacts.get('analysis-stage/round-1/stage_a')?.payload).toMatchObject({ stage: 'stage_a', output: { claims: [] } })

    failStageB = false
    await engine.analyzeMultiStage!(mission, dossier, new AbortController().signal, async (_stage, operation) => operation())
    expect(calls).toEqual(['stage_a', 'stage_b', 'stage_b'])
    expect(artifacts.get('analysis-stage/round-1/stage_b')?.payload).toMatchObject({ stage: 'stage_b', output: { gaps: [] } })
  })
})
