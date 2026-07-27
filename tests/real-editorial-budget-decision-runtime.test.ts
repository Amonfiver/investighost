import { afterEach, describe, expect, it, vi } from 'vitest'
import { RealEditorialPilotRuntime } from '../src/main/real-editorial-pilot-runtime'
import type { SupabaseRealEditorialPilotRepository } from '@modules/real-pipeline'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  REAL_EDITORIAL_FEATURE_TOKEN,
  REAL_EDITORIAL_PILOT_POLICY,
  RealEditorialPilotRecordSchema,
} from '@shared/real-editorial-pilot-contracts'

const pilotId = '95000000-0000-4000-8000-000000000001'
const runId = '95000000-0000-4000-8000-000000000002'
const actorId = MANUAL_LOCAL_ACTOR_ID
const previousFlag = process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN

const pilot = RealEditorialPilotRecordSchema.parse({
  id: pilotId,
  policyId: REAL_EDITORIAL_PILOT_POLICY.id,
  mode: 'real_editorial_pilot',
  taskOrigin: 'human_authorized',
  variantKey: 'initial',
  preparationKey: 'morella-real-editorial-pilot-v1-initial-prepare',
  identityKey: 'b'.repeat(64),
  canonicalDestinationId: '95000000-0000-4000-8000-000000000003',
  destinationName: 'Morella',
  normalizedDestination: 'morella',
  countryCode: 'ES',
  destinationType: 'locality',
  language: 'es',
  pipelineVersion: 'real-editorial-v1',
  profiles: [
    { profile: 'adventure', enabled: true, targetWords: 1_000, depth: 'standard' },
    { profile: 'student', enabled: true, targetWords: 1_800, depth: 'deep' },
  ],
  state: 'review_required',
  budgetConfirmed: true,
  publicationCount: 0,
  trawelConnected: false,
  automaticEnabled: false,
  currentRunId: runId,
  version: 1,
  createdAt: '2026-07-26T01:00:00.000Z',
  updatedAt: '2026-07-26T01:37:38.152Z',
  budget: {
    pilotId,
    taskId: `real-editorial-task:${pilotId}`,
    batchId: `real-editorial-batch:${pilotId}`,
    dailyScopeId: `real-editorial-day:${pilotId}`,
    budgetDate: '2026-07-25',
    currency: 'EUR',
    targetCost: 0.125,
    warningCost: 0.16,
    taskLimitCost: 0.2,
    batchLimitCost: 0.2,
    dailyLimitCost: 0.2,
    manualExtensionCost: 0.25,
    technicalLimitCost: 0.5,
    reservedCost: 0,
    spentCost: 0.099838,
    confirmedAt: '2026-07-25T21:44:57.083Z',
  },
})

const input = {
  pilotId,
  runId,
  actorId,
  decision: 'authorize_extension' as const,
  newMaximumCostEur: 0.26,
  reason: 'Autorización humana sintética para la prueba sin red.',
  confirmed: true as const,
}

function setup(guardFree = true) {
  const resolveBudgetReview = vi.fn(async () => ({
    decisionId: '95000000-0000-4000-8000-000000000004',
    pilotId,
    runId,
    actorId,
    decision: 'authorize_extension' as const,
    previousMaximumCostEur: 0.2,
    newMaximumCostEur: 0.26,
    reason: input.reason,
    decidedAt: '2026-07-27T10:00:00.000Z',
    nextAction: 'resume_from_checkpoint' as const,
    review: {
      reviewId: '95000000-0000-4000-8000-000000000005',
      pilotId,
      runId,
      incidentId: '95000000-0000-4000-8000-000000000006',
      status: 'authorized' as const,
      currency: 'EUR' as const,
      source: 'real_editorial_pilot_budgets' as const,
      currentMaximumCostEur: 0.26,
      previousMaximumCostEur: 0.2,
      spentCostEur: 0.099838,
      reservedCostEur: 0,
      availableCostEur: 0.160162,
      remainingEstimatedCostEur: 0.157838,
      totalEstimatedCostEur: 0.257676,
      shortfallCostEur: 0,
      marginCostEur: 0.002324,
      openedAt: '2026-07-26T01:37:38.152Z',
      resolvedAt: '2026-07-27T10:00:00.000Z',
      tavilyRoundOnePersisted: true,
      openAIAnalysisRoundOnePersisted: true,
    },
  }))
  const repository = {
    getPilot: vi.fn(async () => pilot),
    inspect: vi.fn(async () => ({ guardFree })),
    resolveBudgetReview,
  } as unknown as SupabaseRealEditorialPilotRepository
  const client = {} as ConstructorParameters<typeof RealEditorialPilotRuntime>[1]
  return {
    runtime: new RealEditorialPilotRuntime(repository, client),
    resolveBudgetReview,
  }
}

afterEach(() => {
  if (previousFlag === undefined) delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
  else process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = previousFlag
})

describe('permiso local para decidir el presupuesto editorial', () => {
  it('rechaza con feature flag apagada antes de escribir', async () => {
    delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
    const target = setup()
    await expect(target.runtime.resolveBudgetDecision(input))
      .rejects.toThrow('feature flag editorial real no autoriza')
    expect(target.resolveBudgetReview).not.toHaveBeenCalled()
  })

  it('rechaza actor, run o guarda incompatibles', async () => {
    process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = REAL_EDITORIAL_FEATURE_TOKEN
    const occupied = setup(false)
    await expect(occupied.runtime.resolveBudgetDecision(input))
      .rejects.toThrow('guarda editorial debe estar libre')
    expect(occupied.resolveBudgetReview).not.toHaveBeenCalled()

    const wrongActor = setup()
    await expect(wrongActor.runtime.resolveBudgetDecision({
      ...input,
      actorId: '95000000-0000-4000-8000-000000000099',
    })).rejects.toThrow('operador local autorizado')
    expect(wrongActor.resolveBudgetReview).not.toHaveBeenCalled()

    const wrongRun = setup()
    await expect(wrongRun.runtime.resolveBudgetDecision({
      ...input,
      runId: '95000000-0000-4000-8000-000000000098',
    })).rejects.toThrow('piloto y run activos')
    expect(wrongRun.resolveBudgetReview).not.toHaveBeenCalled()
  })

  it('solo delega la mutación durable y no instancia proveedores', async () => {
    process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = REAL_EDITORIAL_FEATURE_TOKEN
    const target = setup()
    await expect(target.runtime.resolveBudgetDecision(input)).resolves.toMatchObject({
      decision: 'authorize_extension',
      nextAction: 'resume_from_checkpoint',
    })
    expect(target.resolveBudgetReview).toHaveBeenCalledOnce()
    expect(target.resolveBudgetReview).toHaveBeenCalledWith(input)
  })
})
