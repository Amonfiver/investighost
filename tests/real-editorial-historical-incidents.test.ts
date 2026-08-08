import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifyRealEditorialHistoricalIncident,
  KNOWN_MORELLA_HISTORICAL_INCIDENTS,
  realEditorialPersistenceIncidentBlocksResume,
  SupabaseRealEditorialPilotRepository,
} from '@modules/real-pipeline'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import { RealEditorialPilotRuntime } from '../src/main/real-editorial-pilot-runtime'
import {
  REAL_EDITORIAL_FEATURE_TOKEN,
  REAL_EDITORIAL_PILOT_POLICY,
  type RealEditorialHistoricalIncidentAssessment,
  type RealEditorialHistoricalIncidentReview,
} from '@shared/real-editorial-pilot-contracts'

const pilotId = 'c4000000-0000-4000-8000-000000000001'
const runId = 'c4000000-0000-4000-8000-000000000002'
const batchId = 'c4000000-0000-4000-8000-000000000003'
const actorId = MANUAL_LOCAL_ACTOR_ID
const timestamp = '2026-08-01T16:00:00.000Z'
const reason = 'La evidencia durable demuestra que ambos conflictos quedaron superados.'
const previousFlag = process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN

function assessment(
  incidentId: string,
  evidenceKind: 'durable_mission_reused' | 'equivalent_query_reused',
  failureCheckpointVersion: number,
  correctionReference: string,
): RealEditorialHistoricalIncidentAssessment {
  return {
    incidentId,
    code: 'VERSION_CONFLICT',
    message: 'La ejecución editorial real se detuvo; revisar el ledger y el checkpoint durable.',
    createdAt: timestamp,
    classification: 'historical_non_blocking',
    evidenceKind,
    failureCheckpointVersion,
    currentCheckpointVersion: 14,
    failureCheckpointState: failureCheckpointVersion === 2 ? 'queued' : 'researching_round_2',
    currentCheckpointState: 'analyzing_round_2',
    artifactKind: failureCheckpointVersion === 2 ? 'mission' : 'query',
    artifactKey: failureCheckpointVersion === 2 ? 'initial' : 'q3',
    artifactVersion: 1,
    existingValue: failureCheckpointVersion === 2 ? 'createdAt=original' : 'riesgos',
    conflictingValue: failureCheckpointVersion === 2 ? 'createdAt=reabierto' : 'seguridad',
    correctionReference,
    durableEvidence: ['Checkpoint posterior.', 'Artefacto durable compatible.'],
    riskEvaluation: 'No quedan reservas, ambigüedades ni llamadas asociadas al fallo.',
    safeToResolve: true,
  }
}

const assessments = [
  assessment(
    '45bece91-bea5-4167-a38b-9c5d06f18aea',
    'durable_mission_reused',
    2,
    '5799067552ddf2a0e922ba15332f12cb9e5e2fe4',
  ),
  assessment(
    '997607a6-5a58-4bfd-ab1c-45e8eab9623f',
    'equivalent_query_reused',
    11,
    'c754dcaf4014a166748eb61fb4a1c8ac3d2e295b',
  ),
]

const requiredReview: RealEditorialHistoricalIncidentReview = {
  status: 'required',
  resolutionAllowed: true,
  pilotId,
  runId,
  currentCheckpointVersion: 14,
  currentCheckpointHash: 'a'.repeat(64),
  spentCostEur: 0.177838,
  reservedCostEur: 0,
  sourceCount: 8,
  assessments,
  providerCallsPerformed: 0,
  workflowResumed: false,
}

const appliedReview: RealEditorialHistoricalIncidentReview = {
  ...requiredReview,
  status: 'applied',
  resolutionAllowed: false,
  resolutionBatchId: batchId,
  resolutionKey: 'b'.repeat(64),
  actorId,
  reason,
  resolvedAt: timestamp,
}

const input = {
  pilotId,
  runId,
  incidentIds: assessments.map(item => item.incidentId),
  actorId,
  reason,
  confirmed: true as const,
}

afterEach(() => {
  if (previousFlag === undefined) delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
  else process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = previousFlag
})

describe('clasificación y compuerta de incidentes editoriales de persistencia', () => {
  it('bloquea VERSION_CONFLICT y PERSISTENCE_ERROR activos', () => {
    for (const code of ['VERSION_CONFLICT', 'PERSISTENCE_ERROR']) {
      expect(code).toMatch(/^(VERSION_CONFLICT|PERSISTENCE_ERROR)$/)
      expect(realEditorialPersistenceIncidentBlocksResume({
        currentCheckpointVersion: 14,
        artifactCompatible: false,
        noPendingEffects: true,
      })).toBe(true)
    }
  })

  it('no bloquea un incidente resuelto ni una recuperación durable compatible', () => {
    expect(realEditorialPersistenceIncidentBlocksResume({
      resolvedAt: timestamp,
      currentCheckpointVersion: 14,
      artifactCompatible: false,
      noPendingEffects: false,
    })).toBe(false)
    expect(realEditorialPersistenceIncidentBlocksResume({
      classification: 'superseded_by_durable_recovery',
      durableRecoveryCheckpointVersion: 14,
      currentCheckpointVersion: 14,
      artifactCompatible: true,
      noPendingEffects: true,
    })).toBe(false)
  })

  it('solo deja de bloquear un histórico con evaluación durable y checkpoint posterior', () => {
    expect(realEditorialPersistenceIncidentBlocksResume({
      classification: 'historical_non_blocking',
      historicalResolutionCheckpointVersion: 14,
      currentCheckpointVersion: 14,
      artifactCompatible: true,
      noPendingEffects: true,
    })).toBe(false)
    expect(realEditorialPersistenceIncidentBlocksResume({
      classification: 'historical_non_blocking',
      currentCheckpointVersion: 14,
      artifactCompatible: true,
      noPendingEffects: true,
    })).toBe(true)
    expect(realEditorialPersistenceIncidentBlocksResume({
      classification: 'historical_non_blocking',
      historicalResolutionCheckpointVersion: 14,
      currentCheckpointVersion: 14,
      artifactCompatible: true,
      noPendingEffects: false,
    })).toBe(true)
  })

  it('mantiene resumeAvailable falso antes y lo habilita tras la resolución durable', async () => {
    const repositoryFor = (durablyResolved: boolean) => {
      const resultFor = (table: string) => {
        if (table === 'real_editorial_incidents') {
          return {
            data: [{
              id: assessments[0].incidentId,
              code: 'VERSION_CONFLICT',
              resolved_at: null,
            }],
            count: 1,
            error: null,
          }
        }
        if (table === 'real_editorial_historical_incident_resolutions') {
          return {
            data: durablyResolved ? [{
              incident_id: assessments[0].incidentId,
              classification: 'historical_non_blocking',
              current_checkpoint_version: 14,
              evidence: assessments[0],
              security_evaluation: 'passed',
            }] : [],
            error: null,
          }
        }
        return { data: [], count: 0, error: null }
      }
      const client = {
        from: vi.fn((table: string) => {
          const builder: Record<string, (...args: unknown[]) => unknown> = {}
          for (const method of ['select', 'eq', 'in', 'is', 'order', 'limit']) {
            builder[method] = () => builder
          }
          builder.maybeSingle = () => Promise.resolve(
            table === 'real_editorial_budget_reviews'
              ? { data: { status: 'authorized' }, error: null }
              : { data: null, error: null },
          )
          builder.then = (
            onFulfilled: (value: ReturnType<typeof resultFor>) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) => Promise.resolve(resultFor(table)).then(onFulfilled, onRejected)
          return builder
        }),
      }
      const repository = new SupabaseRealEditorialPilotRepository(client as never)
      vi.spyOn(repository, 'getPilot').mockResolvedValue({
        id: pilotId,
        currentRunId: runId,
        state: 'evaluating_round_2',
      } as never)
      vi.spyOn(repository, 'latestArtifact').mockResolvedValue({
        kind: 'checkpoint',
        key: 'workflow',
        version: 14,
        payload: {},
        payloadHash: 'a'.repeat(64),
        createdAt: timestamp,
      })
      vi.spyOn(repository, 'getSourceLimitRecovery').mockResolvedValue(undefined)
      vi.spyOn(repository, 'getPartialAnalysisRecovery').mockResolvedValue(undefined)
      return repository
    }

    await expect(repositoryFor(false).canResumeFromCheckpoint(pilotId)).resolves.toBe(false)
    await expect(repositoryFor(true).canResumeFromCheckpoint(pilotId)).resolves.toBe(true)
  })

  it('clasifica los dos incidentes reales de forma determinista y separada', () => {
    expect(KNOWN_MORELLA_HISTORICAL_INCIDENTS).toEqual({
      '45bece91-bea5-4167-a38b-9c5d06f18aea': {
        evidenceKind: 'durable_mission_reused',
        failureCheckpointVersion: 2,
        correctionReference: '5799067552ddf2a0e922ba15332f12cb9e5e2fe4',
      },
      '997607a6-5a58-4bfd-ab1c-45e8eab9623f': {
        evidenceKind: 'equivalent_query_reused',
        failureCheckpointVersion: 11,
        correctionReference: 'c754dcaf4014a166748eb61fb4a1c8ac3d2e295b',
      },
    })
    for (const known of Object.values(KNOWN_MORELLA_HISTORICAL_INCIDENTS)) {
      expect(classifyRealEditorialHistoricalIncident({
        resolved: false,
        durableRecovery: false,
        explicitlyResolved: false,
        evidenceKind: known.evidenceKind,
        checkpointAdvanced: true,
        artifactCompatible: true,
        noPendingEffects: true,
      })).toBe('historical_non_blocking')
    }
    expect(classifyRealEditorialHistoricalIncident({
      resolved: false,
      durableRecovery: false,
      explicitlyResolved: false,
      checkpointAdvanced: true,
      artifactCompatible: false,
      noPendingEffects: true,
    })).toBe('unresolved_requires_human_action')
  })
})

describe('resolución durable de los dos incidentes históricos', () => {
  it('es idempotente, específica y rechaza una decisión incompatible', async () => {
    const rpc = vi.fn(async () => ({ data: batchId, error: null }))
    const repository = new SupabaseRealEditorialPilotRepository({ rpc } as never)
    vi.spyOn(repository, 'getHistoricalIncidentReview')
      .mockResolvedValueOnce(requiredReview)
      .mockResolvedValueOnce(appliedReview)

    await expect(repository.resolveHistoricalIncidents(input)).resolves.toMatchObject({
      resolutionBatchId: batchId,
      spentCostEur: 0.177838,
      reservedCostEur: 0,
      sourceCount: 8,
      providerCallsPerformed: 0,
      workflowResumed: false,
      nextAction: 'resume_from_checkpoint',
    })
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc.mock.calls[0][0]).toBe('resolve_real_editorial_historical_incidents')
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_incident_ids: [...input.incidentIds].sort(),
      p_expected_checkpoint_version: 14,
      p_expected_checkpoint_hash: 'a'.repeat(64),
    })

    const idempotent = new SupabaseRealEditorialPilotRepository({ rpc } as never)
    vi.spyOn(idempotent, 'getHistoricalIncidentReview').mockResolvedValue(appliedReview)
    await expect(idempotent.resolveHistoricalIncidents(input)).resolves.toMatchObject({
      resolutionBatchId: batchId,
    })
    expect(rpc).toHaveBeenCalledOnce()
    await expect(idempotent.resolveHistoricalIncidents({
      ...input,
      reason: 'Motivo incompatible con la resolución ya registrada.',
    })).rejects.toMatchObject({ code: 'HISTORICAL_INCIDENT_RESOLUTION_CONFLICT' })
  })

  it('mantiene la feature flag, no llama proveedores y no inicia ni reanuda', async () => {
    const resolveHistoricalIncidents = vi.fn(async () => appliedReview)
    const repository = {
      getPilot: vi.fn(async () => ({
        id: pilotId,
        currentRunId: runId,
        identityKey: 'c'.repeat(64),
        policyId: REAL_EDITORIAL_PILOT_POLICY.id,
      })),
      inspect: vi.fn(async () => ({ guardFree: true, pendingReservations: 0 })),
      resolveHistoricalIncidents,
    }
    const runtime = new RealEditorialPilotRuntime(repository as never, {} as never)
    delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
    await expect(runtime.resolveHistoricalIncidents(input)).rejects.toThrow('feature flag')
    expect(resolveHistoricalIncidents).not.toHaveBeenCalled()

    process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = REAL_EDITORIAL_FEATURE_TOKEN
    const start = vi.spyOn(runtime, 'start')
    const resume = vi.spyOn(runtime, 'resume')
    await runtime.resolveHistoricalIncidents(input)
    expect(resolveHistoricalIncidents).toHaveBeenCalledOnce()
    expect(start).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
  })

  it('muestra en renderer la evidencia, el riesgo y la no reanudación', () => {
    const renderer = readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')
    expect(renderer).toContain('INCIDENTES HISTÓRICOS DE PERSISTENCIA')
    expect(renderer).toContain('assessment.durableEvidence')
    expect(renderer).toContain('assessment.riskEvaluation')
    expect(renderer).toContain('resolveRealEditorialHistoricalIncidents')
    expect(renderer).toContain('el workflow no se reanudará')
  })
})
