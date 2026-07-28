import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import {
  SupabaseRealEditorialPilotRepository,
  type RealEditorialArtifact,
} from '@modules/real-pipeline'
import { RealEditorialPilotRuntime } from '../src/main/real-editorial-pilot-runtime'
import {
  REAL_EDITORIAL_PILOT_POLICY,
  RealEditorialAmbiguousCallSchema,
  RealEditorialPilotRecordSchema,
  type RealEditorialAmbiguousCall,
  type RealEditorialBudgetReview,
  type RealEditorialPilotRecord,
} from '@shared/real-editorial-pilot-contracts'

const pilotId = '97000000-0000-4000-8000-000000000001'
const runId = '97000000-0000-4000-8000-000000000002'
const callId = '97000000-0000-4000-8000-000000000003'
const reservationId = '97000000-0000-4000-8000-000000000004'
const timestamp = '2026-07-28T17:56:38.334Z'

function pilot(currentMaximumCostEur: 0.2 | 0.27): RealEditorialPilotRecord {
  return RealEditorialPilotRecordSchema.parse({
    id: pilotId,
    policyId: REAL_EDITORIAL_PILOT_POLICY.id,
    mode: 'real_editorial_pilot',
    taskOrigin: 'human_authorized',
    variantKey: 'initial',
    preparationKey: 'morella-real-editorial-pilot-v1-initial-prepare',
    identityKey: 'a'.repeat(64),
    canonicalDestinationId: '97000000-0000-4000-8000-000000000005',
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
    state: 'researching_round_2',
    budgetConfirmed: true,
    publicationCount: 0,
    trawelConnected: false,
    automaticEnabled: false,
    currentRunId: runId,
    version: 3,
    createdAt: '2026-07-25T20:00:00.000Z',
    updatedAt: timestamp,
    budget: {
      pilotId,
      taskId: `real-editorial-task:${pilotId}`,
      batchId: `real-editorial-batch:${pilotId}`,
      dailyScopeId: `real-editorial-day:${pilotId}`,
      budgetDate: '2026-07-25',
      currency: 'EUR',
      targetCost: 0.125,
      warningCost: 0.16,
      taskLimitCost: currentMaximumCostEur,
      batchLimitCost: currentMaximumCostEur,
      dailyLimitCost: currentMaximumCostEur,
      manualExtensionCost: 0.25,
      technicalLimitCost: 0.5,
      reservedCost: 0.048,
      spentCost: 0.099838,
      confirmedAt: '2026-07-25T21:44:57.083Z',
    },
  })
}

function humanRequiredCall(
  currentMaximumCostEur: 0.2 | 0.27,
): RealEditorialAmbiguousCall {
  return RealEditorialAmbiguousCallSchema.parse({
    callId,
    reservationId,
    pilotId,
    runId,
    providerId: 'tavily',
    operation: 'research',
    attempt: 1,
    sourceState: 'unknown',
    reviewState: 'human_required',
    occurredAt: timestamp,
    openedAt: timestamp,
    localKnownCostEur: 0,
    maximumExposureEur: 0.048,
    spentCostEur: 0.099838,
    initialAutomaticLimitEur: 0.2,
    currentMaximumCostEur,
    incidentCode: 'TIMEOUT',
  })
}

function authorizedReview(): RealEditorialBudgetReview {
  return {
    reviewId: '97000000-0000-4000-8000-000000000006',
    pilotId,
    runId,
    incidentId: '97000000-0000-4000-8000-000000000007',
    status: 'authorized',
    currency: 'EUR',
    source: 'real_editorial_pilot_budgets',
    currentMaximumCostEur: 0.27,
    previousMaximumCostEur: 0.2,
    spentCostEur: 0.099838,
    reservedCostEur: 0.048,
    availableCostEur: 0.122162,
    remainingEstimatedCostEur: 0.157838,
    totalEstimatedCostEur: 0.305676,
    shortfallCostEur: 0.035676,
    marginCostEur: -0.035676,
    openedAt: '2026-07-26T01:37:38.152Z',
    resolvedAt: '2026-07-28T17:16:27.500Z',
    tavilyRoundOnePersisted: true,
    openAIAnalysisRoundOnePersisted: true,
    latestDecision: {
      decisionId: '97000000-0000-4000-8000-000000000008',
      actorId: '97000000-0000-4000-8000-000000000009',
      decision: 'authorize_extension',
      previousMaximumCostEur: 0.2,
      newMaximumCostEur: 0.27,
      reason: 'Ampliación humana sintética sin ejecutar el pipeline.',
      decidedAt: '2026-07-28T17:16:27.500Z',
    },
  }
}

function runtimeFor(currentMaximumCostEur: 0.2 | 0.27) {
  const record = pilot(currentMaximumCostEur)
  const call = humanRequiredCall(currentMaximumCostEur)
  const checkpoint: RealEditorialArtifact = {
    kind: 'checkpoint',
    key: 'workflow',
    version: 12,
    payload: { version: 'real-workflow-v1' },
    payloadHash: 'b'.repeat(64),
    createdAt: timestamp,
  }
  const repository = {
    getPilot: vi.fn(async () => record),
    getResult: vi.fn(async () => undefined),
    inspect: vi.fn(async () => ({
      pendingReservations: 1,
      guardFree: true,
    })),
    getHumanRequiredCall: vi.fn(async () => call),
    getBudgetReview: vi.fn(async () =>
      currentMaximumCostEur === 0.27 ? authorizedReview() : undefined),
    latestArtifact: vi.fn(async () => checkpoint),
    canResumeFromCheckpoint: vi.fn(async () => false),
  } as unknown as SupabaseRealEditorialPilotRepository
  const incidentQuery = query({
    data: [{
      code: 'TIMEOUT',
      classification: 'ambiguous',
      message: 'Tavily conserva un resultado remoto ambiguo.',
      created_at: timestamp,
    }],
    count: 1,
    error: null,
  })
  const runQuery = query({
    data: { current_round: 1 },
    error: null,
  })
  const client = {
    from: vi.fn((table: string) => table === 'real_editorial_incidents'
      ? incidentQuery
      : runQuery),
  } as unknown as ConstructorParameters<typeof RealEditorialPilotRuntime>[1]
  return {
    runtime: new RealEditorialPilotRuntime(repository, client),
    repository,
    client,
  }
}

function query(result: unknown) {
  const builder: Record<string, (...args: unknown[]) => unknown> = {}
  for (const method of ['select', 'eq', 'order']) {
    builder[method] = () => builder
  }
  builder.limit = () => Promise.resolve(result)
  builder.single = () => Promise.resolve(result)
  return builder
}

function repositoryClient() {
  const results: Record<string, unknown> = {
    real_editorial_ambiguous_calls: {
      data: {
        call_id: callId,
        reservation_id: reservationId,
        source_state: 'unknown',
        opened_at: timestamp,
        incident_id: null,
      },
      error: null,
    },
    real_editorial_call_reservations: {
      data: {
        id: reservationId,
        call_id: callId,
        provider_id: 'tavily',
        operation: 'research',
        attempt: 1,
        retry_of_call_id: null,
        calculated_cost: null,
        reserved_cost: 0.048,
      },
      error: null,
    },
    real_editorial_provider_calls: {
      data: { created_at: timestamp },
      error: null,
    },
    real_editorial_call_human_resolutions: {
      data: null,
      error: null,
    },
  }
  return {
    from: vi.fn((table: string) => {
      const builder: Record<string, (...args: unknown[]) => unknown> = {}
      for (const method of ['select', 'eq', 'is', 'order', 'limit']) {
        builder[method] = () => builder
      }
      builder.single = () => Promise.resolve(results[table])
      builder.maybeSingle = () => Promise.resolve(results[table])
      return builder
    }),
  }
}

describe('lectura de progreso tras una ampliación humana', () => {
  it.each([0.2, 0.27] as const)(
    'real-editorial:progress acepta el máximo vigente %s sin ejecutar trabajo',
    async currentMaximumCostEur => {
      const target = runtimeFor(currentMaximumCostEur)
      const start = vi.spyOn(target.runtime, 'start')
      const resume = vi.spyOn(target.runtime, 'resume')

      const progress = await target.runtime.progress({ pilotId })

      expect(progress.pilot.budget).toMatchObject({
        taskLimitCost: currentMaximumCostEur,
        spentCost: 0.099838,
        reservedCost: 0.048,
      })
      expect(progress.humanRequiredCall).toMatchObject({
        initialAutomaticLimitEur: 0.2,
        currentMaximumCostEur,
        providerId: 'tavily',
        reviewState: 'human_required',
      })
      expect(progress.budgetReview?.status)
        .toBe(currentMaximumCostEur === 0.27 ? 'authorized' : undefined)
      expect(progress.pilot).toMatchObject({
        publicationCount: 0,
        trawelConnected: false,
        automaticEnabled: false,
      })
      expect(progress.resumeAvailable).toBe(false)
      expect(start).not.toHaveBeenCalled()
      expect(resume).not.toHaveBeenCalled()
    },
  )

  it('el repositorio proyecta por separado el límite inicial y el máximo durable', async () => {
    const client = repositoryClient()
    const repository = new SupabaseRealEditorialPilotRepository(
      client as never,
    )
    vi.spyOn(repository, 'getPilot').mockResolvedValue(pilot(0.27))

    await expect(repository.getHumanRequiredCall(pilotId)).resolves.toMatchObject({
      initialAutomaticLimitEur: 0.2,
      currentMaximumCostEur: 0.27,
      spentCostEur: 0.099838,
      maximumExposureEur: 0.048,
    })
  })

  it('main, preload y renderer usan el contrato compartido de progreso', async () => {
    const [main, preload, renderer, globalTypes] = await Promise.all([
      readFile(new URL('../src/main/real-editorial-pilot-runtime.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/main/preload.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/vite-env.d.ts', import.meta.url), 'utf8'),
    ])

    expect(main).toContain('RealEditorialPilotProgressSchema.parse')
    expect(preload).toContain('Promise<RealEditorialPilotProgress>')
    expect(renderer).toContain('useState<RealEditorialPilotProgress | null>')
    expect(globalTypes).toContain('Promise<RealEditorialPilotProgress>')
  })
})
