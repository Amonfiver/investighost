import { describe, expect, it, vi } from 'vitest'
import {
  SupabaseRealEditorialPilotRepository,
  realEditorialPayloadHash,
  type RealEditorialArtifact,
} from '@modules/real-pipeline'
import type {
  RealEditorialSourceLimitRecoveryPlan,
} from '@shared/real-editorial-pilot-contracts'
import type { RealResearchSource } from '@shared/real-pipeline-contracts'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'

const pilotId = '96000000-0000-4000-8000-000000000001'
const runId = '96000000-0000-4000-8000-000000000002'
const incidentId = '96000000-0000-4000-8000-000000000003'
const recoveryId = '96000000-0000-4000-8000-000000000004'
const timestamp = '2026-07-30T12:00:00.000Z'
const reason = 'Seleccionar cinco fuentes sin repetir proveedores.'

function source(round: 1 | 2, index: number, score: number): RealResearchSource {
  return {
    id: `source-${round}-${index}`,
    round,
    url: `https://example.test/${round}/${index}`,
    normalizedUrl: `https://example.test/${round}/${index}`,
    title: `Fuente ${round}-${index}`,
    capturedAt: timestamp,
    contentHash: 'a'.repeat(64),
    score,
    content: `Contenido ${round}-${index}.`,
  }
}

const existing = [source(1, 1, 0.7), source(1, 2, 0.6), source(1, 3, 0.5)]
const candidates = [
  source(2, 6, 0.4),
  source(2, 3, 0.7),
  source(2, 1, 0.95),
  source(2, 5, 0.5),
  source(2, 2, 0.8),
  source(2, 4, 0.6),
]
const selected = [candidates[2], candidates[4], candidates[1], candidates[5], candidates[3]]
const rankedCandidates = [...selected, candidates[0]]

function trace(item: RealResearchSource) {
  return {
    id: item.id,
    round: item.round,
    normalizedUrl: item.normalizedUrl,
    title: item.title,
    score: item.score,
    contentHash: item.contentHash,
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
  existingSources: existing.map(item => ({ ...trace(item), round: 1 as const })),
  candidateSources: rankedCandidates.map(item => ({ ...trace(item), round: 2 as const })),
  selectedSources: selected.map(item => ({ ...trace(item), round: 2 as const })),
  excludedSources: [{
    ...trace(candidates[0]),
    round: 2,
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

const checkpointPayload = {
  version: 'real-workflow-v1',
  taskId: 'task-source-limit',
  state: 'researching_round_2',
  completedRound: 1,
  initialMission: { limits: { maxSources: 8 } },
  dossier: {
    requestId: 'request-source-limit',
    runId,
    taskId: 'task-source-limit',
    destinationId: 'destination-morella',
    rounds: [1],
    sources: existing,
    evidence: [],
    generatedAt: timestamp,
  },
  nextRoundQueries: [],
  providerCalls: 5,
  simulatedCost: 0.107838,
  updatedAt: timestamp,
}
const checkpointArtifact: RealEditorialArtifact = {
  kind: 'checkpoint',
  key: 'workflow',
  version: 9,
  payload: checkpointPayload,
  payloadHash: realEditorialPayloadHash(checkpointPayload),
  createdAt: timestamp,
}
const roundTwoPayload = {
  round: 2,
  sources: candidates,
  providerRequestIds: ['r1', 'r2', 'r3', 'r4'],
  failures: [],
  usageUnits: 6,
  credits: 6,
}
const roundTwoArtifact: RealEditorialArtifact = {
  kind: 'tavily_result',
  key: 'round-2',
  version: 1,
  payload: roundTwoPayload,
  payloadHash: realEditorialPayloadHash(roundTwoPayload),
  createdAt: timestamp,
}

function storedRow() {
  return {
    id: recoveryId,
    recovery_key: 'c'.repeat(64),
    pilot_id: pilotId,
    run_id: runId,
    incident_id: incidentId,
    actor_id: MANUAL_LOCAL_ACTOR_ID,
    reason,
    recovered_at: timestamp,
    previous_checkpoint_version: 9,
    recovered_checkpoint_version: 10,
    maximum_sources: 8,
    available_slots: 5,
    existing_sources: requiredPlan.existingSources,
    candidate_sources: requiredPlan.candidateSources,
    selected_sources: requiredPlan.selectedSources,
    excluded_sources: requiredPlan.excludedSources,
    provider_calls_before: 5,
    research_provider_calls: 4,
    provider_calls_after: 9,
    spent_cost: 0.155838,
    reserved_cost: 0,
    current_maximum_cost: 0.27,
  }
}

function setup(plan: RealEditorialSourceLimitRecoveryPlan = requiredPlan) {
  const rpc = vi.fn(async () => ({ data: recoveryId, error: null }))
  const builder: Record<string, (...args: unknown[]) => unknown> = {}
  for (const method of ['select', 'eq']) builder[method] = () => builder
  builder.single = () => Promise.resolve({ data: storedRow(), error: null })
  const client = {
    rpc,
    from: vi.fn(() => builder),
  }
  const repository = new SupabaseRealEditorialPilotRepository(
    client as never,
    () => new Date(timestamp),
  )
  vi.spyOn(repository, 'getSourceLimitRecovery').mockResolvedValue(plan)
  vi.spyOn(repository, 'latestArtifact').mockImplementation(async (
    _targetRunId,
    kind,
  ) => kind === 'checkpoint' ? checkpointArtifact : roundTwoArtifact)
  return { repository, rpc }
}

const input = {
  pilotId,
  runId,
  incidentId,
  actorId: MANUAL_LOCAL_ACTOR_ID,
  reason,
  confirmed: true as const,
}

describe('repositorio de recuperación del límite global', () => {
  it('crea únicamente el checkpoint analyzing_round_2 desde Tavily durable', async () => {
    const target = setup()

    const result = await target.repository.recoverSourceLimit(input)

    expect(result).toMatchObject({
      recoveryId,
      spentCostEur: 0.155838,
      reservedCostEur: 0,
      nextAction: 'resume_from_checkpoint',
    })
    expect(target.rpc).toHaveBeenCalledOnce()
    const [, parameters] = target.rpc.mock.calls[0]
    expect(parameters).toMatchObject({
      p_pilot_id: pilotId,
      p_run_id: runId,
      p_incident_id: incidentId,
      p_previous_checkpoint_version: 9,
      p_recovered_checkpoint_version: 10,
      p_recovered_checkpoint: {
        state: 'analyzing_round_2',
        completedRound: 1,
        providerCalls: 9,
        simulatedCost: 0.155838,
        dossier: {
          rounds: [1, 2],
          sources: [...existing, ...selected],
        },
      },
    })
  })

  it('reutiliza una recuperación equivalente sin invocar otra mutación', async () => {
    const applied: RealEditorialSourceLimitRecoveryPlan = {
      ...requiredPlan,
      status: 'applied',
      recoveryId,
      recoveryKey: 'c'.repeat(64),
      actorId: MANUAL_LOCAL_ACTOR_ID,
      reason,
      recoveredAt: timestamp,
    }
    const target = setup(applied)

    await expect(target.repository.recoverSourceLimit(input)).resolves.toMatchObject({
      recoveryId,
      nextAction: 'resume_from_checkpoint',
    })
    expect(target.rpc).not.toHaveBeenCalled()
  })

  it('rechaza una recuperación incompatible ya persistida', async () => {
    const applied: RealEditorialSourceLimitRecoveryPlan = {
      ...requiredPlan,
      status: 'applied',
      recoveryId,
      recoveryKey: 'c'.repeat(64),
      actorId: MANUAL_LOCAL_ACTOR_ID,
      reason: 'Otro motivo durable.',
      recoveredAt: timestamp,
    }
    const target = setup(applied)

    await expect(target.repository.recoverSourceLimit(input))
      .rejects.toMatchObject({ code: 'SOURCE_LIMIT_RECOVERY_CONFLICT' })
    expect(target.rpc).not.toHaveBeenCalled()
  })

  it('bloquea resume antes de recuperar y lo habilita después', async () => {
    const queryResult = { data: null, count: 0, error: null }
    const client = {
      from: vi.fn((table: string) => {
        const builder: Record<string, (...args: unknown[]) => unknown> = {}
        for (const method of ['select', 'eq', 'in', 'is', 'order', 'limit']) {
          builder[method] = () => builder
        }
        builder.maybeSingle = () => Promise.resolve(table === 'real_editorial_budget_reviews'
          ? { data: { status: 'authorized' }, error: null }
          : { data: null, error: null })
        builder.then = (
          onFulfilled: (value: typeof queryResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(queryResult).then(onFulfilled, onRejected)
        return builder
      }),
    }
    const repository = new SupabaseRealEditorialPilotRepository(client as never)
    vi.spyOn(repository, 'getPilot').mockResolvedValue({
      id: pilotId,
      currentRunId: runId,
      state: 'evaluating_round_2',
    } as never)
    vi.spyOn(repository, 'latestArtifact').mockResolvedValue(checkpointArtifact)
    const recovery = vi.spyOn(repository, 'getSourceLimitRecovery')
      .mockResolvedValue(requiredPlan)

    await expect(repository.canResumeFromCheckpoint(pilotId)).resolves.toBe(false)

    recovery.mockResolvedValue({
      ...requiredPlan,
      status: 'applied',
      recoveryId,
      recoveryKey: 'c'.repeat(64),
      actorId: MANUAL_LOCAL_ACTOR_ID,
      reason,
      recoveredAt: timestamp,
    })
    await expect(repository.canResumeFromCheckpoint(pilotId)).resolves.toBe(true)
  })
})
