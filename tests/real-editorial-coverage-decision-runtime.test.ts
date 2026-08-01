import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseRealEditorialPilotRepository } from '@modules/real-pipeline'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  REAL_EDITORIAL_FEATURE_TOKEN,
  REAL_EDITORIAL_PILOT_POLICY,
  RealEditorialPilotRecordSchema,
} from '@shared/real-editorial-pilot-contracts'
import { RealEditorialPilotRuntime } from '../src/main/real-editorial-pilot-runtime'

const pilotId = 'aa000000-0000-4000-8000-000000000001'
const runId = 'aa000000-0000-4000-8000-000000000002'
const previousFlag = process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN

const pilot = RealEditorialPilotRecordSchema.parse({
  id: pilotId,
  policyId: REAL_EDITORIAL_PILOT_POLICY.id,
  mode: 'real_editorial_pilot',
  taskOrigin: 'human_authorized',
  variantKey: 'initial',
  preparationKey: 'coverage-runtime-test',
  identityKey: 'a'.repeat(64),
  canonicalDestinationId: 'aa000000-0000-4000-8000-000000000003',
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
  state: 'review_required',
  budgetConfirmed: true,
  publicationCount: 0,
  trawelConnected: false,
  automaticEnabled: false,
  currentRunId: runId,
  version: 1,
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
  budget: {
    pilotId,
    taskId: `task:${pilotId}`,
    batchId: `batch:${pilotId}`,
    dailyScopeId: `day:${pilotId}`,
    budgetDate: '2026-08-01',
    currency: 'EUR',
    targetCost: 0.125,
    warningCost: 0.16,
    taskLimitCost: 0.27,
    batchLimitCost: 0.27,
    dailyLimitCost: 0.27,
    manualExtensionCost: 0.25,
    technicalLimitCost: 0.5,
    reservedCost: 0,
    spentCost: 0.258648,
    confirmedAt: '2026-08-01T12:00:00.000Z',
  },
})

const input = {
  pilotId,
  runId,
  actorId: MANUAL_LOCAL_ACTOR_ID,
  decision: 'accept_with_warnings' as const,
  reason: 'Aceptación humana sintética para comprobar solo la delegación durable.',
  riskAccepted: true as const,
  confirmed: true as const,
}

function setup(guardFree = true, pendingReservations = 0) {
  const resolveCoverageDecision = vi.fn(async () => ({
    decisionId: 'aa000000-0000-4000-8000-000000000004',
    pilotId,
    runId,
    decision: 'accept_with_warnings' as const,
    nextAction: 'budget_review_required' as const,
  }))
  const repository = {
    getPilot: vi.fn(async () => pilot),
    inspect: vi.fn(async () => ({ guardFree, pendingReservations })),
    resolveCoverageDecision,
  } as unknown as SupabaseRealEditorialPilotRepository
  return {
    runtime: new RealEditorialPilotRuntime(
      repository,
      {} as ConstructorParameters<typeof RealEditorialPilotRuntime>[1],
    ),
    resolveCoverageDecision,
  }
}

afterEach(() => {
  if (previousFlag === undefined) delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
  else process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = previousFlag
})

describe('autorización local de la decisión de cobertura', () => {
  it('mantiene la operación cerrada con la feature flag desactivada', async () => {
    delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
    const target = setup()
    await expect(target.runtime.resolveCoverageDecision(input))
      .rejects.toThrow('feature flag editorial real no autoriza')
    expect(target.resolveCoverageDecision).not.toHaveBeenCalled()
  })

  it('rechaza actor, run, guarda o reserva incompatibles', async () => {
    process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = REAL_EDITORIAL_FEATURE_TOKEN
    await expect(setup(false).runtime.resolveCoverageDecision(input))
      .rejects.toThrow('guarda y las reservas deben estar libres')
    await expect(setup(true, 1).runtime.resolveCoverageDecision(input))
      .rejects.toThrow('guarda y las reservas deben estar libres')
    await expect(setup().runtime.resolveCoverageDecision({
      ...input,
      actorId: 'aa000000-0000-4000-8000-000000000099',
    })).rejects.toThrow('operador local autorizado')
    await expect(setup().runtime.resolveCoverageDecision({
      ...input,
      runId: 'aa000000-0000-4000-8000-000000000098',
    })).rejects.toThrow('piloto y run activos')
  })

  it('solo delega la decisión durable, sin iniciar, reanudar ni publicar', async () => {
    process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = REAL_EDITORIAL_FEATURE_TOKEN
    const target = setup()
    const start = vi.spyOn(target.runtime, 'start')
    const resume = vi.spyOn(target.runtime, 'resume')

    await expect(target.runtime.resolveCoverageDecision(input)).resolves.toMatchObject({
      decision: 'accept_with_warnings',
      nextAction: 'budget_review_required',
    })
    expect(target.resolveCoverageDecision).toHaveBeenCalledOnce()
    expect(target.resolveCoverageDecision).toHaveBeenCalledWith(input)
    expect(start).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
    expect(pilot).toMatchObject({
      publicationCount: 0,
      trawelConnected: false,
      automaticEnabled: false,
    })
  })
})
