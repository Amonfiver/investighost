import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  REAL_EDITORIAL_FEATURE_TOKEN,
  REAL_EDITORIAL_PILOT_POLICY,
  RealEditorialPilotRecordSchema,
  RealEditorialTerminalBudgetSchema,
  RealEditorialTerminalResolutionSchema,
  type RealEditorialTerminalResolution,
  type RealEditorialTerminalResult,
} from '@shared/real-editorial-pilot-contracts'
import {
  isRealEditorialTerminalReviewState,
  RealEditorialPilotRuntime,
} from '../src/main/real-editorial-pilot-runtime'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import { RealEditorialTerminalReviewPanel } from '../src/renderer/App'

const pilotId = 'b1000000-0000-4000-8000-000000000001'
const runId = 'b1000000-0000-4000-8000-000000000002'
const timestamp = '2026-08-02T10:00:00.000Z'
const previousFlag = process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN

const baseDecision = {
  pilotId,
  runId,
  actorId: MANUAL_LOCAL_ACTOR_ID,
  reason: 'Revisión humana sintética del resultado terminal.',
  observations: 'La decisión se registra sin ejecutar proveedores ni publicar.',
  confirmed: true as const,
}

function approve(): RealEditorialTerminalResolution {
  return {
    ...baseDecision,
    decision: 'approve_editorial_result',
    affectedProfiles: ['adventure', 'student'],
    profileComments: [],
    warningsAccepted: true,
  }
}

function pilot(state: 'pending_human_review' | 'human_approved' = 'pending_human_review') {
  return RealEditorialPilotRecordSchema.parse({
    id: pilotId,
    policyId: REAL_EDITORIAL_PILOT_POLICY.id,
    mode: 'real_editorial_pilot',
    taskOrigin: 'human_authorized',
    variantKey: 'terminal-review-synthetic',
    preparationKey: 'terminal-review-synthetic-prepare',
    identityKey: 'a'.repeat(64),
    canonicalDestinationId: 'b1000000-0000-4000-8000-000000000003',
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
    state,
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
      budgetDate: '2026-08-02',
      currency: 'EUR',
      targetCost: 0.125,
      warningCost: 0.16,
      taskLimitCost: 0.35,
      batchLimitCost: 0.35,
      dailyLimitCost: 0.35,
      manualExtensionCost: 0.25,
      technicalLimitCost: 0.5,
      reservedCost: 0,
      spentCost: 0.310169,
      confirmedAt: timestamp,
    },
  })
}

function terminalResult(): RealEditorialTerminalResult {
  return {
    pilotId,
    runId,
    state: 'pending_human_review',
    snapshot: {
      drafts: [
        {
          profile: 'adventure',
          title: 'Morella a pie: fortaleza, murallas y paisaje de Els Ports',
          content: 'Texto completo Aventura con trazabilidad [c2] y advertencias prudentes.',
          approximateWordCount: 1_006,
        },
        {
          profile: 'student',
          title: 'Morella: patrimonio, territorio y vida cotidiana en Els Ports',
          content: 'Texto completo Estudiante con trazabilidad [c1] y contexto social.',
          approximateWordCount: 1_780,
        },
      ],
      review: {
        outcome: 'passed_with_warnings',
        issues: [
          'Cobertura y trazabilidad suficientes.',
          'La diferenciación del perfil Estudiante puede mejorar.',
        ],
      },
      masterKnowledge: {
        claims: [{
          id: 'c1',
          statement: 'Claim sintético trazable.',
          evidenceIds: ['evidence-1'],
        }],
      },
    },
    drafts: [
      {
        profile: 'adventure',
        title: 'Morella a pie: fortaleza, murallas y paisaje de Els Ports',
        content: 'Texto completo Aventura con trazabilidad [c2] y advertencias prudentes.',
        approximateWordCount: 1_006,
        promptVersion: 'real-editorial-v1',
        schemaVersion: 'real-intelligence-v1',
        usage: {
          inputTokens: 3_988,
          outputTokens: 1_840,
          estimatedCost: 0.015028,
          currency: 'USD',
          providerRequestIds: ['resp_adventure_terminal'],
        },
      },
      {
        profile: 'student',
        title: 'Morella: patrimonio, territorio y vida cotidiana en Els Ports',
        content: 'Texto completo Estudiante con trazabilidad [c1] y contexto social.',
        approximateWordCount: 1_780,
        promptVersion: 'real-editorial-v1',
        schemaVersion: 'real-intelligence-v1',
        usage: {
          inputTokens: 3_946,
          outputTokens: 2_996,
          estimatedCost: 0.021922,
          currency: 'USD',
          providerRequestIds: ['resp_student_terminal'],
        },
      },
    ],
    review: {
      outcome: 'passed_with_warnings',
      issues: [
        'Cobertura y trazabilidad suficientes.',
        'La diferenciación del perfil Estudiante puede mejorar.',
      ],
      promptVersion: 'real-editorial-v1',
      schemaVersion: 'real-intelligence-v1',
      usage: {
        inputTokens: 8_145,
        outputTokens: 1_071,
        estimatedCost: 0.014571,
        currency: 'USD',
        providerRequestIds: ['resp_review_terminal'],
      },
    },
    artifacts: {
      snapshot: { artifactId: 'b1000000-0000-4000-8000-000000000010', kind: 'checkpoint', key: 'pipeline', version: 1, hash: '1'.repeat(64), createdAt: timestamp },
      adventure: { artifactId: 'b1000000-0000-4000-8000-000000000011', kind: 'draft_adventure', key: 'adventure', version: 1, hash: '2'.repeat(64), createdAt: timestamp },
      student: { artifactId: 'b1000000-0000-4000-8000-000000000012', kind: 'draft_student', key: 'student', version: 1, hash: '3'.repeat(64), createdAt: timestamp },
      finalReview: { artifactId: 'b1000000-0000-4000-8000-000000000013', kind: 'final_review', key: 'final', version: 1, hash: '4'.repeat(64), createdAt: timestamp },
    },
    gaps: Array.from({ length: 5 }, (_, index) => ({
      id: `g${index + 1}`,
      topic: `gap-${index + 1}`,
      description: `Gap durable ${index + 1}.`,
    })),
    contradictions: [
      'Horarios y tarifas del castillo.',
      'Estado del área de autocaravanas.',
      'Duración de la visita al castillo.',
    ],
    budget: {
      spentCostEur: 0.310169,
      reservedCostEur: 0,
      currentMaximumCostEur: 0.35,
      availableCostEur: 0.039831,
      automatedWorkRemainingEur: 0,
      projectedTotalCostEur: 0.310169,
      shortfallCostEur: 0,
    },
    libraryIntegration: 'not_started',
  } as unknown as RealEditorialTerminalResult
}

function query(result: unknown) {
  const builder: Record<string, (...args: unknown[]) => unknown> = {}
  for (const method of ['select', 'eq', 'is', 'order']) builder[method] = () => builder
  builder.limit = () => Promise.resolve(result)
  builder.single = () => Promise.resolve(result)
  return builder
}

afterEach(() => {
  if (previousFlag === undefined) delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
  else process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = previousFlag
})

describe('fase terminal de revisión humana real', () => {
  it('contrata aprobar, solicitar cambios y rechazar con warnings explícitos', () => {
    expect(RealEditorialTerminalResolutionSchema.parse(approve()).decision)
      .toBe('approve_editorial_result')
    expect(RealEditorialTerminalResolutionSchema.parse({
      ...baseDecision,
      decision: 'request_changes',
      affectedProfiles: ['student'],
      profileComments: [{ profile: 'student', comment: 'Diferenciar mejor el enfoque.' }],
      warningsAccepted: false,
    }).decision).toBe('request_changes')
    expect(RealEditorialTerminalResolutionSchema.parse({
      ...baseDecision,
      decision: 'reject_editorial_result',
      affectedProfiles: ['adventure', 'student'],
      profileComments: [],
      warningsAccepted: false,
    }).decision).toBe('reject_editorial_result')
    expect(RealEditorialTerminalResolutionSchema.safeParse({
      ...baseDecision,
      decision: 'request_changes',
      affectedProfiles: ['student'],
      profileComments: [{ profile: 'adventure', comment: 'Comentario desalineado.' }],
      warningsAccepted: false,
    }).success).toBe(false)
    expect(RealEditorialTerminalResolutionSchema.safeParse({
      ...approve(), warningsAccepted: false,
    }).success).toBe(false)
  })

  it('fija el presupuesto terminal en cero trabajo restante', () => {
    expect(RealEditorialTerminalBudgetSchema.parse({
      spentCostEur: 0.310169,
      reservedCostEur: 0,
      currentMaximumCostEur: 0.35,
      availableCostEur: 0.039831,
      automatedWorkRemainingEur: 0,
      projectedTotalCostEur: 0.310169,
      shortfallCostEur: 0,
    })).toMatchObject({
      automatedWorkRemainingEur: 0,
      projectedTotalCostEur: 0.310169,
      shortfallCostEur: 0,
    })
    expect(RealEditorialTerminalBudgetSchema.safeParse({
      spentCostEur: 0.310169,
      reservedCostEur: 0,
      currentMaximumCostEur: 0.35,
      availableCostEur: 0.039831,
      automatedWorkRemainingEur: 0.06,
      projectedTotalCostEur: 0.370169,
      shortfallCostEur: 0.020169,
    }).success).toBe(false)
  })

  it('muestra ambos textos, revisión, gaps, contradicciones y ledger terminal', () => {
    const html = renderToStaticMarkup(createElement(RealEditorialTerminalReviewPanel, {
      result: terminalResult(),
      actorId: MANUAL_LOCAL_ACTOR_ID,
      busy: false,
      onResolve: vi.fn(),
    }))

    expect(html).toContain('RESULTADO EDITORIAL REAL · FASE TERMINAL')
    expect(html).toContain('Morella a pie: fortaleza, murallas y paisaje de Els Ports')
    expect(html).toContain('Texto completo Aventura')
    expect(html).toContain('Morella: patrimonio, territorio y vida cotidiana en Els Ports')
    expect(html).toContain('Texto completo Estudiante')
    expect(html).toContain('Con advertencias')
    expect(html).toContain('Cobertura y trazabilidad suficientes')
    expect(html).toContain('Gaps conservados (5)')
    expect(html).toContain('Contradicciones conservadas (3)')
    expect(html).toContain('Evidencias: evidence-1')
    expect(html).toContain('Trabajo automatizado restante')
    expect(html).toContain('0,000000 €')
    expect(html).toContain('Aprobar resultado')
    expect(html).toContain('Solicitar cambios')
    expect(html).toContain('Rechazar')
    expect(html).not.toContain('Reanudar desde checkpoint')
    expect(html).not.toContain('La ejecución editorial real se detuvo')
  })

  it('carga el resultado por el IPC existente y delega una decisión sin ejecutar trabajo', async () => {
    process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = REAL_EDITORIAL_FEATURE_TOKEN
    const result = terminalResult()
    const repository = {
      getTerminalResult: vi.fn(async () => result),
      getPilot: vi.fn(async () => pilot()),
      inspect: vi.fn(async () => ({ guardFree: true, pendingReservations: 0 })),
      resolveTerminalDecision: vi.fn(async () => ({
        decision: {
          decisionId: 'b1000000-0000-4000-8000-000000000020',
          decisionKey: 'f'.repeat(64),
          pilotId,
          runId,
          actorId: MANUAL_LOCAL_ACTOR_ID,
          decision: 'approve_editorial_result',
          reason: approve().reason,
          observations: approve().observations,
          affectedProfiles: ['adventure', 'student'],
          profileComments: [],
          warningsAccepted: true,
          resultingState: 'human_approved',
          decidedAt: timestamp,
          providerCallsPerformed: 0,
          reservationsCreated: 0,
          publicationCount: 0,
          trawelConnected: false,
          automaticEnabled: false,
        },
        nextAction: 'ready_for_library',
      })),
    }
    const runtime = new RealEditorialPilotRuntime(repository as never, {} as never)
    const start = vi.spyOn(runtime, 'start')
    const resume = vi.spyOn(runtime, 'resume')

    await expect(runtime.result({ pilotId })).resolves.toBe(result)
    await expect(runtime.resolveTerminalDecision(approve())).resolves.toMatchObject({
      nextAction: 'ready_for_library',
      decision: { providerCallsPerformed: 0, reservationsCreated: 0, publicationCount: 0 },
    })
    expect(repository.getTerminalResult).toHaveBeenCalledWith(pilotId)
    expect(repository.resolveTerminalDecision).toHaveBeenCalledWith(approve())
    expect(start).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
  })

  it('mantiene cerrada la decisión sin feature flag', async () => {
    delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
    const repository = { resolveTerminalDecision: vi.fn() }
    const runtime = new RealEditorialPilotRuntime(repository as never, {} as never)
    await expect(runtime.resolveTerminalDecision(approve()))
      .rejects.toThrow('feature flag editorial real no autoriza')
    expect(repository.resolveTerminalDecision).not.toHaveBeenCalled()
  })

  it('oculta incidentes históricos cuando el resultado terminó correctamente', async () => {
    const record = pilot()
    const repository = {
      getPilot: vi.fn(async () => record),
      getResult: vi.fn(async () => undefined),
      inspect: vi.fn(async () => ({ pendingReservations: 0, guardFree: true })),
      getHumanRequiredCall: vi.fn(async () => undefined),
      getBudgetReview: vi.fn(async () => ({ status: 'authorized', context: 'coverage_acceptance' })),
      getCoverageReview: vi.fn(async () => ({ status: 'accepted' })),
      getSourceLimitRecovery: vi.fn(async () => undefined),
      getPartialAnalysisRecovery: vi.fn(async () => undefined),
      getHistoricalIncidentReview: vi.fn(async () => ({ status: 'required' })),
      latestArtifact: vi.fn(async () => undefined),
      canResumeFromCheckpoint: vi.fn(async () => false),
    }
    const incidentQuery = query({
      data: [{
        code: 'ACTUAL_COST_EXCEEDS_RESERVATION',
        classification: 'human_required',
        message: 'La ejecución editorial real se detuvo; revisar el ledger.',
        created_at: '2026-07-26T01:07:58.933Z',
      }],
      count: 5,
      error: null,
    })
    const runQuery = query({ data: { current_round: 2 }, error: null })
    const client = {
      from: vi.fn((table: string) => table === 'real_editorial_incidents'
        ? incidentQuery
        : runQuery),
    }
    const runtime = new RealEditorialPilotRuntime(repository as never, client as never)
    const progress = await runtime.progress({ pilotId })

    expect(progress.incidentCount).toBe(5)
    expect(progress.latestIncident).toBeUndefined()
    expect(progress.coverageReview).toBeUndefined()
    expect(progress.budgetReview).toBeUndefined()
    expect(progress.historicalIncidentReview).toBeUndefined()
    expect(progress.resumeAvailable).toBe(false)
    expect(isRealEditorialTerminalReviewState('pending_human_review')).toBe(true)
    expect(isRealEditorialTerminalReviewState('review_required')).toBe(false)
  })

  it('mantiene IPC, migración y renderer fuera de proveedores, ledger y publicación', async () => {
    const [migration, main, preload, renderer] = await Promise.all([
      readFile(new URL(
        '../supabase/migrations/20260802090000_real_editorial_terminal_review.sql',
        import.meta.url,
      ), 'utf8'),
      readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/main/preload.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8'),
    ])

    expect(migration).toContain('create table public.real_editorial_terminal_decisions')
    expect(migration).toContain('real_editorial_terminal_decisions_append_only')
    expect(migration).toContain('resolve_real_editorial_terminal_review')
    expect(migration).toContain('snapshot_artifact_id')
    expect(migration).toContain('adventure_artifact_id')
    expect(migration).toContain('student_artifact_id')
    expect(migration).toContain('review_artifact_id')
    expect(migration).toContain("'providerCallsPerformed',0,'reservationsCreated',0")
    expect(migration).toContain("'libraryIntegration','not_started'")
    expect(migration).not.toMatch(/insert into public\.real_editorial_(?:call_reservations|provider_calls)/i)
    expect(migration).not.toMatch(/update public\.real_editorial_pilot_budgets/i)
    expect(migration).not.toMatch(/(?:delete|truncate)\s+from/i)
    expect(migration).not.toMatch(/api\.tavily|api\.openai|fetch\(/i)
    expect(main).toContain("'real-editorial:resolve-terminal-review'")
    expect(preload).toContain("ipcRenderer.invoke('real-editorial:result'")
    expect(preload).toContain("ipcRenderer.invoke('real-editorial:resolve-terminal-review'")
    expect(renderer).toContain('window.electronAPI.getRealEditorialResult')
    expect(renderer).toContain('RealEditorialTerminalReviewPanel')
    expect(renderer).toContain(
      'Borradores generados y revisión automática completada; pendiente de decisión editorial humana.',
    )
    expect(renderer).toContain('Trabajo automatizado restante')
  })
})
