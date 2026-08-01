import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  realEditorialPayloadHash,
  SupabaseRealEditorialPilotRepository,
} from '@modules/real-pipeline'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import { RealEditorialPilotRuntime } from '../src/main/real-editorial-pilot-runtime'
import {
  REAL_EDITORIAL_FEATURE_TOKEN,
  type RealEditorialPartialAnalysisRecoveryPlan,
} from '@shared/real-editorial-pilot-contracts'

const pilotId = 'a2000000-0000-4000-8000-000000000001'
const runId = 'a2000000-0000-4000-8000-000000000002'
const incidentId = 'a2000000-0000-4000-8000-000000000003'
const callId = 'a2000000-0000-4000-8000-000000000004'
const reservationId = 'a2000000-0000-4000-8000-000000000005'
const recoveryId = 'a2000000-0000-4000-8000-000000000006'
const timestamp = '2026-08-01T12:00:00.000Z'
const reason = 'Asumir prudencialmente la exposición máxima antes de un reintento controlado.'
const previousFlag = process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN

function artifactKinds() {
  return [
    'master_knowledge', 'coverage',
    ...Array(10).fill('fact'),
    ...Array(10).fill('evidence'),
    ...Array(5).fill('place'),
    'activity',
    ...Array(6).fill('gap'),
    ...Array(4).fill('contradiction'),
  ] as RealEditorialPartialAnalysisRecoveryPlan['partialArtifacts'][number]['kind'][]
}

const partialArtifacts = artifactKinds().map((kind, index) => ({
  id: `a2${String(index + 10).padStart(6, '0')}-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
  kind,
  key: `${kind}-${index + 1}`,
  version: kind === 'contradiction' ? 1 : 2,
  payloadHash: (index % 16).toString(16).repeat(64),
  createdAt: timestamp,
}))

const counts = {
  masterKnowledge: 1,
  coverage: 1,
  facts: 10,
  evidence: 10,
  places: 5,
  activities: 1,
  gaps: 6,
  contradictions: 4,
  queries: 0,
  total: 38,
} as const

const requiredPlan: RealEditorialPartialAnalysisRecoveryPlan = {
  status: 'required',
  pilotId,
  runId,
  incidentId,
  callId,
  reservationId,
  round: 2,
  checkpointVersion: 14,
  diagnosticMessage:
    'OpenAI devolvió el análisis de ronda 2, pero su persistencia quedó parcial por un conflicto de versión.',
  duplicateRiskMessage:
    'Repetir la reanudación antes de conciliar esta respuesta podría duplicar consumo de OpenAI.',
  responseReceived: true,
  parsedResponseConfirmed: true,
  completeResponseRecoverable: false,
  partialArtifacts,
  counts,
  maximumExposureCostEur: 0.022,
  costStatus: 'indeterminate',
  recognizedCostEur: 0,
  spentCostEur: 0.155838,
  reservedCostEur: 0,
  currentMaximumCostEur: 0.27,
  openAIAnalysisRoundTwoPending: true,
  noNewCheckpointCreated: true,
}

const input = {
  pilotId,
  runId,
  incidentId,
  callId,
  reservationId,
  actorId: MANUAL_LOCAL_ACTOR_ID,
  reason,
  assumedCostEur: 0.022,
  confirmed: true as const,
}

function storedRow() {
  return {
    id: recoveryId,
    recovery_key: 'e'.repeat(64),
    pilot_id: pilotId,
    run_id: runId,
    incident_id: incidentId,
    call_id: callId,
    reservation_id: reservationId,
    actor_id: MANUAL_LOCAL_ACTOR_ID,
    reason,
    recovered_at: timestamp,
    checkpoint_version: 14,
    partial_artifacts: partialArtifacts,
    partial_artifacts_hash: realEditorialPayloadHash(partialArtifacts),
    artifact_counts: counts,
    maximum_exposure_cost: 0.022,
    recognized_cost: 0.022,
    spent_cost_before: 0.155838,
    current_maximum_cost: 0.27,
  }
}

function repositorySetup(plan: RealEditorialPartialAnalysisRecoveryPlan = requiredPlan) {
  const rpc = vi.fn(async () => ({ data: recoveryId, error: null }))
  const builder: Record<string, (...args: unknown[]) => unknown> = {}
  for (const method of ['select', 'eq']) builder[method] = () => builder
  builder.single = () => Promise.resolve({ data: storedRow(), error: null })
  const repository = new SupabaseRealEditorialPilotRepository({
    rpc,
    from: vi.fn(() => builder),
  } as never)
  vi.spyOn(repository, 'getPartialAnalysisRecovery').mockResolvedValue(plan)
  return { repository, rpc }
}

afterEach(() => {
  if (previousFlag === undefined) delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
  else process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = previousFlag
})

describe('recuperación humana de 38 artefactos OpenAI parciales', () => {
  it('asocia exactamente las 38 filas y no crea reservas ni llama a proveedores', async () => {
    const target = repositorySetup()
    const result = await target.repository.recoverPartialAnalysis(input)

    expect(result).toMatchObject({
      recoveryId,
      counts: { total: 38, queries: 0 },
      recognizedCostEur: 0.022,
      spentCostEur: 0.177838,
      reservedCostEur: 0,
      nextAction: 'resume_from_checkpoint',
    })
    expect(target.rpc).toHaveBeenCalledOnce()
    expect(target.rpc.mock.calls[0][0]).toBe('recover_real_editorial_partial_analysis')
    expect(target.rpc.mock.calls[0][1]).toMatchObject({
      p_call_id: callId,
      p_reservation_id: reservationId,
      p_assumed_cost: 0.022,
      p_checkpoint_version: 14,
      p_partial_artifacts: partialArtifacts,
    })
  })

  it('es idempotente y rechaza una segunda decisión incompatible', async () => {
    const applied: RealEditorialPartialAnalysisRecoveryPlan = {
      ...requiredPlan,
      status: 'applied',
      costStatus: 'prudentially_assumed',
      recognizedCostEur: 0.022,
      spentCostEur: 0.177838,
      recoveryId,
      recoveryKey: 'e'.repeat(64),
      actorId: MANUAL_LOCAL_ACTOR_ID,
      reason,
      recoveredAt: timestamp,
    }
    const target = repositorySetup(applied)
    await expect(target.repository.recoverPartialAnalysis(input)).resolves.toMatchObject({
      recoveryId,
    })
    expect(target.rpc).not.toHaveBeenCalled()
    await expect(target.repository.recoverPartialAnalysis({
      ...input,
      reason: 'Otra decisión incompatible.',
    })).rejects.toMatchObject({ code: 'PARTIAL_ANALYSIS_RECOVERY_CONFLICT' })
  })

  it('mantiene la operación cerrada sin flag y no inicia ni reanuda', async () => {
    const recoverPartialAnalysis = vi.fn(async () => ({ recoveryId }))
    const repository = {
      getPilot: vi.fn(async () => ({ id: pilotId, currentRunId: runId, identityKey: 'a'.repeat(64) })),
      inspect: vi.fn(async () => ({ guardFree: true })),
      recoverPartialAnalysis,
    }
    const runtime = new RealEditorialPilotRuntime(repository as never, {} as never)
    delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
    await expect(runtime.recoverPartialAnalysis(input)).rejects.toThrow('feature flag')
    expect(recoverPartialAnalysis).not.toHaveBeenCalled()

    process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = REAL_EDITORIAL_FEATURE_TOKEN
    const start = vi.spyOn(runtime, 'start')
    const resume = vi.spyOn(runtime, 'resume')
    await runtime.recoverPartialAnalysis(input)
    expect(recoverPartialAnalysis).toHaveBeenCalledOnce()
    expect(start).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
  })

  it('expone en renderer el bloqueo y el riesgo de consumo duplicado', () => {
    const renderer = readFileSync(
      new URL('../src/renderer/App.tsx', import.meta.url),
      'utf8',
    )
    expect(renderer).toContain('Riesgo de duplicación.')
    expect(renderer).toContain('plan.duplicateRiskMessage')
    expect(renderer).toContain('recoverRealEditorialPartialAnalysis')
    expect(renderer).toContain('no se reanudará')
  })
})
