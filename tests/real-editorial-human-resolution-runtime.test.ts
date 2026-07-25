import { afterEach, describe, expect, it, vi } from 'vitest'
import { RealEditorialPilotRuntime } from '../src/main/real-editorial-pilot-runtime'
import type { SupabaseRealEditorialPilotRepository } from '@modules/real-pipeline'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  REAL_EDITORIAL_FEATURE_TOKEN,
  REAL_EDITORIAL_PILOT_POLICY,
  RealEditorialPilotRecordSchema,
} from '@shared/real-editorial-pilot-contracts'

const pilotId = '92000000-0000-4000-8000-000000000001'
const runId = '92000000-0000-4000-8000-000000000002'
const callId = '92000000-0000-4000-8000-000000000003'
const actorId = MANUAL_LOCAL_ACTOR_ID
const previousFlag = process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN

const pilot = RealEditorialPilotRecordSchema.parse({
  id: pilotId,
  policyId: REAL_EDITORIAL_PILOT_POLICY.id,
  mode: 'real_editorial_pilot',
  taskOrigin: 'human_authorized',
  variantKey: 'initial',
  preparationKey: 'morella-real-editorial-pilot-v1-initial-prepare',
  identityKey: 'a'.repeat(64),
  canonicalDestinationId: '92000000-0000-4000-8000-000000000005',
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
  state: 'researching_round_1',
  budgetConfirmed: true,
  publicationCount: 0,
  trawelConnected: false,
  automaticEnabled: false,
  currentRunId: runId,
  version: 1,
  createdAt: '2026-07-25T20:00:00.000Z',
  updatedAt: '2026-07-25T20:00:00.000Z',
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
    spentCost: 0.04,
    confirmedAt: '2026-07-25T20:00:00.000Z',
  },
})

const resolution = {
  pilotId,
  runId,
  callId,
  actorId,
  decision: 'no_consumption' as const,
  note: 'El panel de OpenAI no muestra consumo para esta llamada.',
  confirmed: true as const,
}

function runtime(guardFree = true) {
  const resolveHumanRequiredCall = vi.fn(async () => ({
    resolutionId: '92000000-0000-4000-8000-000000000006',
    ...resolution,
    recognizedCostEur: 0,
    credits: 0,
    inputTokens: 0,
    outputTokens: 0,
    decidedAt: '2026-07-26T00:00:00.000Z',
    nextAction: 'resume_from_checkpoint',
  }))
  const repository = {
    getPilot: vi.fn(async () => pilot),
    inspect: vi.fn(async () => ({ guardFree })),
    resolveHumanRequiredCall,
  } as unknown as SupabaseRealEditorialPilotRepository
  const client = {} as ConstructorParameters<typeof RealEditorialPilotRuntime>[1]
  return {
    runtime: new RealEditorialPilotRuntime(repository, client),
    resolveHumanRequiredCall,
  }
}

afterEach(() => {
  if (previousFlag === undefined) delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
  else process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = previousFlag
})

describe('permiso local para resolver una llamada ambigua', () => {
  it('rechaza la resolución con feature flag apagada antes de escribir', async () => {
    delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
    const target = runtime()

    await expect(target.runtime.resolveAmbiguousCall(resolution))
      .rejects.toThrow('feature flag editorial real no autoriza')
    expect(target.resolveHumanRequiredCall).not.toHaveBeenCalled()
  })

  it('rechaza una guarda ocupada y no invoca proveedores ni escritura', async () => {
    process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = REAL_EDITORIAL_FEATURE_TOKEN
    const target = runtime(false)

    await expect(target.runtime.resolveAmbiguousCall(resolution))
      .rejects.toThrow('guarda editorial debe estar libre')
    expect(target.resolveHumanRequiredCall).not.toHaveBeenCalled()
  })

  it('rechaza un actor distinto del operador local autorizado', async () => {
    process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = REAL_EDITORIAL_FEATURE_TOKEN
    const target = runtime()

    await expect(target.runtime.resolveAmbiguousCall({
      ...resolution,
      actorId: '92000000-0000-4000-8000-000000000099',
    })).rejects.toThrow('operador local autorizado')
    expect(target.resolveHumanRequiredCall).not.toHaveBeenCalled()
  })

  it('delega solo la escritura durable cuando flag, identidad y guarda son válidas', async () => {
    process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = REAL_EDITORIAL_FEATURE_TOKEN
    const target = runtime()

    await expect(target.runtime.resolveAmbiguousCall(resolution)).resolves.toMatchObject({
      callId,
      decision: 'no_consumption',
      nextAction: 'resume_from_checkpoint',
    })
    expect(target.resolveHumanRequiredCall).toHaveBeenCalledOnce()
    expect(target.resolveHumanRequiredCall).toHaveBeenCalledWith(resolution)
  })
})
