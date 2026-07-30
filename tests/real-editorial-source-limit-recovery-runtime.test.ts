import { afterEach, describe, expect, it, vi } from 'vitest'
import { RealEditorialPilotRuntime } from '../src/main/real-editorial-pilot-runtime'
import type { SupabaseRealEditorialPilotRepository } from '@modules/real-pipeline'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  REAL_EDITORIAL_FEATURE_TOKEN,
  REAL_EDITORIAL_PILOT_POLICY,
  RealEditorialPilotRecordSchema,
  type RealEditorialSourceLimitRecoveryPlan,
} from '@shared/real-editorial-pilot-contracts'

const pilotId = '97000000-0000-4000-8000-000000000001'
const runId = '97000000-0000-4000-8000-000000000002'
const incidentId = '97000000-0000-4000-8000-000000000003'
const recoveryId = '97000000-0000-4000-8000-000000000004'
const timestamp = '2026-07-30T12:00:00.000Z'
const previousFlag = process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN

const pilot = RealEditorialPilotRecordSchema.parse({
  id: pilotId,
  policyId: REAL_EDITORIAL_PILOT_POLICY.id,
  mode: 'real_editorial_pilot',
  taskOrigin: 'human_authorized',
  variantKey: 'initial',
  preparationKey: 'source-limit-runtime-test',
  identityKey: 'b'.repeat(64),
  canonicalDestinationId: '97000000-0000-4000-8000-000000000005',
  destinationName: 'Morella',
  normalizedDestination: 'morella',
  countryCode: 'ES',
  destinationType: 'locality',
  language: 'es',
  pipelineVersion: 'real-editorial-v1',
  profiles: [
    { profile: 'adventure', enabled: true, targetWords: 1_000 },
    { profile: 'student', enabled: true, targetWords: 1_800 },
  ],
  state: 'researching_round_2',
  budgetConfirmed: true,
  publicationCount: 0,
  trawelConnected: false,
  automaticEnabled: false,
  currentRunId: runId,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
  budget: {
    pilotId,
    taskId: `task:${pilotId}`,
    batchId: `batch:${pilotId}`,
    dailyScopeId: `day:${pilotId}`,
    budgetDate: '2026-07-30',
    currency: 'EUR',
    targetCost: 0.125,
    warningCost: 0.16,
    taskLimitCost: 0.27,
    batchLimitCost: 0.27,
    dailyLimitCost: 0.27,
    manualExtensionCost: 0.25,
    technicalLimitCost: 0.5,
    reservedCost: 0,
    spentCost: 0.155838,
    confirmedAt: timestamp,
  },
})

function trace(round: 1 | 2, index: number) {
  return {
    id: `source-${round}-${index}`,
    round,
    normalizedUrl: `https://example.test/${round}/${index}`,
    title: `Fuente ${round}-${index}`,
    score: 1 - index / 10,
    contentHash: 'a'.repeat(64),
  }
}

const requiredPlan: RealEditorialSourceLimitRecoveryPlan = {
  status: 'required',
  pilotId,
  runId,
  incidentId,
  diagnosticMessage:
    'El expediente supera el máximo global de fuentes y necesita una selección durable antes de continuar.',
  previousCheckpointVersion: 9,
  recoveredCheckpointVersion: 10,
  workflowVersion: 'real-workflow-v1',
  maximumSources: 8,
  availableSlots: 5,
  existingSources: [trace(1, 1), trace(1, 2), trace(1, 3)],
  candidateSources: [
    trace(2, 1), trace(2, 2), trace(2, 3),
    trace(2, 4), trace(2, 5), trace(2, 6),
  ],
  selectedSources: [
    trace(2, 1), trace(2, 2), trace(2, 3), trace(2, 4), trace(2, 5),
  ],
  excludedSources: [{
    ...trace(2, 6),
    rank: 6,
    reason: 'global_source_limit_exhausted',
  }],
  providerCallsBefore: 5,
  researchProviderCalls: 4,
  providerCallsAfter: 9,
  spentCostEur: 0.155838,
  reservedCostEur: 0,
  currentMaximumCostEur: 0.27,
  openAIAnalysisRoundTwoPending: true,
}

const input = {
  pilotId,
  runId,
  incidentId,
  actorId: MANUAL_LOCAL_ACTOR_ID,
  reason: 'Aplicar el máximo global sin repetir proveedores.',
  confirmed: true as const,
}

function setup(guardFree = true) {
  const recoverSourceLimit = vi.fn(async () => ({
    ...requiredPlan,
    status: 'applied' as const,
    recoveryId,
    recoveryKey: 'c'.repeat(64),
    actorId: input.actorId,
    reason: input.reason,
    recoveredAt: timestamp,
    nextAction: 'resume_from_checkpoint' as const,
  }))
  const repository = {
    getPilot: vi.fn(async () => pilot),
    inspect: vi.fn(async () => ({ guardFree })),
    recoverSourceLimit,
  } as unknown as SupabaseRealEditorialPilotRepository
  return {
    runtime: new RealEditorialPilotRuntime(
      repository,
      {} as ConstructorParameters<typeof RealEditorialPilotRuntime>[1],
    ),
    recoverSourceLimit,
  }
}

afterEach(() => {
  if (previousFlag === undefined) delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
  else process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = previousFlag
})

describe('autorización de la recuperación del máximo global de fuentes', () => {
  it('mantiene la operación cerrada con la feature flag desactivada', async () => {
    delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
    const target = setup()

    await expect(target.runtime.recoverSourceLimit(input))
      .rejects.toThrow('feature flag editorial real no autoriza')
    expect(target.recoverSourceLimit).not.toHaveBeenCalled()
  })

  it('rechaza actor, run o guarda incompatibles', async () => {
    process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = REAL_EDITORIAL_FEATURE_TOKEN
    await expect(setup(false).runtime.recoverSourceLimit(input))
      .rejects.toThrow('guarda editorial debe estar libre')
    await expect(setup().runtime.recoverSourceLimit({
      ...input,
      actorId: '97000000-0000-4000-8000-000000000099',
    })).rejects.toThrow('operador local autorizado')
    await expect(setup().runtime.recoverSourceLimit({
      ...input,
      runId: '97000000-0000-4000-8000-000000000098',
    })).rejects.toThrow('piloto y run activos')
  })

  it('solo delega la transición durable y no inicia ni reanuda trabajo', async () => {
    process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = REAL_EDITORIAL_FEATURE_TOKEN
    const target = setup()
    const start = vi.spyOn(target.runtime, 'start')
    const resume = vi.spyOn(target.runtime, 'resume')

    await expect(target.runtime.recoverSourceLimit(input)).resolves.toMatchObject({
      recoveryId,
      spentCostEur: 0.155838,
      reservedCostEur: 0,
      openAIAnalysisRoundTwoPending: true,
      nextAction: 'resume_from_checkpoint',
    })

    expect(target.recoverSourceLimit).toHaveBeenCalledOnce()
    expect(start).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
    expect(pilot).toMatchObject({
      publicationCount: 0,
      trawelConnected: false,
      automaticEnabled: false,
    })
  })
})
