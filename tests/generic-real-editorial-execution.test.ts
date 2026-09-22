import { describe, expect, it } from 'vitest'
import {
  GenericRealEditorialExecution,
  createGenericLedgerMetadataFactory,
  createGenericRealEditorialMission,
  executionContextForPilot,
  type GenericRealEditorialExecutionContext,
} from '@modules/real-pipeline'
import type { IntelligenceEngine } from '@modules/real-pipeline'
import type { RealEditorialPilotRecord } from '@shared/real-editorial-pilot-contracts'

const context: GenericRealEditorialExecutionContext = {
  owner: { type: 'BATCH_JOB', id: '91000000-0000-4000-8000-000000000001' },
  executionId: 'factory:91000000-0000-4000-8000-000000000001',
  runId: '91000000-0000-4000-8000-000000000002',
  taskId: 'factory-task:91000000-0000-4000-8000-000000000001',
  batchId: '91000000-0000-4000-8000-000000000003',
  destination: {
    destinationId: '91000000-0000-4000-8000-000000000004',
    name: 'Granada',
    countryCode: 'ES',
    region: 'Andalucía',
    destinationType: 'locality',
  },
  policy: {
    language: 'es',
    depth: 'deep',
    objectives: ['historia documentada', 'patrimonio verificable'],
    limits: {
      maxRounds: 2,
      maxFocusedQueriesPerRound: 3,
      maxSources: 8,
      maxCharactersPerSource: 100_000,
      maxProviderCalls: 12,
      maxInputTokens: 200_000,
      maxOutputTokens: 50_000,
      taskBudgetEur: 0.2,
      batchBudgetEur: 0.5,
      dailyBudgetEur: 1,
    },
    promptVersion: 'generic-editorial-v1',
  },
  budgetDate: '2026-09-22',
}

describe('GenericRealEditorialExecution', () => {
  it('accepts an arbitrary batch destination without the historical pilot enum', async () => {
    const calls: string[] = []
    const execution = new GenericRealEditorialExecution({
      RESEARCH: async value => { calls.push(`research:${value.destination.name}`); return { artifactRef: 'research-1' } },
      ANALYSIS: async () => { calls.push('analysis'); return { artifactRef: 'analysis-1' } },
      STUDENT: async () => { calls.push('student'); return { artifactRef: 'student-1' } },
      ADVENTURE: async () => { calls.push('adventure'); return { artifactRef: 'adventure-1' } },
      AUTO_REVIEW: async () => { calls.push('review'); return { artifactRef: 'review-1' } },
    })
    const signal = new AbortController().signal

    await execution.executeResearch(context, signal)
    await execution.executeAnalysis(context, signal)
    await execution.executeStudent(context, signal)
    await execution.executeAdventure(context, signal)
    await execution.executeReview(context, signal)

    expect(calls).toEqual(['research:Granada', 'analysis', 'student', 'adventure', 'review'])
    expect(createGenericRealEditorialMission(context, new Date('2026-09-22T10:00:00.000Z')))
      .toMatchObject({ destination: { name: 'Granada', countryCode: 'ES', canonicalId: context.destination.destinationId } })
  })

  it('uses a generic execution owner in provider ledger metadata', () => {
    const engine = {
      id: 'deepseek',
      model: 'deepseek-flash',
      simulation: true,
    } as IntelligenceEngine
    const metadata = createGenericLedgerMetadataFactory(context, engine).create(
      `${context.taskId}:round:1:analysis`,
      1,
      0.02,
      undefined,
      undefined,
    )

    expect(metadata.requestId).toBe(context.owner.id)
    expect(metadata.runId).toBe(context.runId)
    expect(metadata.batchId).toBe(context.batchId)
    expect(metadata.idempotencyKey).toContain(context.taskId)
    expect(metadata.inputHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('adapts the existing Cuenca pilot contract without changing its owner identity', () => {
    const pilot = {
      id: '91000000-0000-4000-8000-000000000010',
      policyId: 'cuenca-real-editorial-deepseek-benchmark-v1',
      canonicalDestinationId: '91000000-0000-4000-8000-000000000011',
      currentRunId: '91000000-0000-4000-8000-000000000012',
    } as RealEditorialPilotRecord
    const policy = {
      id: 'cuenca-real-editorial-deepseek-benchmark-v1' as const,
      destination: 'Cuenca',
      normalizedDestination: 'cuenca',
      countryCode: 'ES',
      destinationType: 'locality' as const,
    }
    const adapted = executionContextForPilot(pilot, policy as never)
    expect(adapted.owner).toEqual({ type: 'PILOT', id: pilot.id })
    expect(adapted.destination).toMatchObject({ name: 'Cuenca', destinationId: pilot.canonicalDestinationId })
  })
})
