import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  REAL_EDITORIAL_FEATURE_TOKEN,
  REAL_EDITORIAL_PILOT_POLICY,
  RealEditorialLibraryEntrySchema,
  RealEditorialLibraryQuerySchema,
  RealEditorialLibraryTransferSchema,
  RealEditorialLibraryTransferResultSchema,
  type RealEditorialLibraryEntry,
  type RealEditorialTerminalResult,
} from '@shared/real-editorial-pilot-contracts'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import { RealEditorialPilotRuntime } from '../src/main/real-editorial-pilot-runtime'
import { Library, RealEditorialTerminalReviewPanel } from '../src/renderer/App'
import { initialLibraryNavigationState } from '../src/renderer/library-navigation'

const pilotId = 'c1000000-0000-4000-8000-000000000001'
const runId = 'c1000000-0000-4000-8000-000000000002'
const transferId = 'c1000000-0000-4000-8000-000000000003'
const timestamp = '2026-08-02T16:00:00.000Z'
const previousFlag = process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN

function entry(profile: 'adventure' | 'student'): RealEditorialLibraryEntry {
  const adventure = profile === 'adventure'
  return RealEditorialLibraryEntrySchema.parse({
    entryId: adventure
      ? 'c1000000-0000-4000-8000-000000000010'
      : 'c1000000-0000-4000-8000-000000000011',
    transferId,
    pilotId,
    runId,
    destination: {
      canonicalId: 'c1000000-0000-4000-8000-000000000012',
      name: 'Morella',
      countryCode: 'ES',
      type: 'locality',
    },
    profile,
    title: adventure ? 'Aventura aprobada' : 'Estudiante aprobado',
    content: adventure ? 'Texto Aventura exacto [c1].' : 'Texto Estudiante exacto [c1].',
    editorialVersion: 1,
    language: 'es-ES',
    status: 'approved_unpublished',
    editorialState: 'approved',
    libraryState: 'ready_for_library',
    publicationState: 'unpublished',
    origin: 'real_editorial_pilot',
    sourceArtifact: {
      artifactId: adventure
        ? 'c1000000-0000-4000-8000-000000000020'
        : 'c1000000-0000-4000-8000-000000000021',
      kind: adventure ? 'draft_adventure' : 'draft_student',
      key: profile,
      version: 1,
      hash: adventure ? '1'.repeat(64) : '2'.repeat(64),
      createdAt: timestamp,
    },
    finalReviewArtifact: {
      artifactId: 'c1000000-0000-4000-8000-000000000022',
      kind: 'final_review',
      key: 'final',
      version: 1,
      hash: '3'.repeat(64),
      createdAt: timestamp,
    },
    terminalDecisionId: 'c1000000-0000-4000-8000-000000000023',
    reviewOutcome: 'passed_with_warnings',
    warnings: ['Advertencia revisada y aceptada.'],
    gaps: Array.from({ length: 5 }, (_, index) => ({
      id: `g${index + 1}`,
      topic: `gap-${index + 1}`,
      description: `Gap durable ${index + 1}.`,
      importance: 'medium',
      requiredForProfiles: ['adventure', 'student'],
      resolvableWithResearch: false,
    })),
    contradictions: ['Contradicción 1.', 'Contradicción 2.', 'Contradicción 3.'],
    claims: [{
      id: 'c1',
      topic: 'historia',
      statement: 'Claim durable.',
      evidenceIds: ['e1'],
      confidence: 0.9,
      suitableProfiles: ['adventure', 'student'],
    }],
    evidence: [{
      claimId: 'c1',
      statement: 'Evidencia durable.',
      confidence: 0.9,
      evidenceIds: ['e1'],
    }],
    sources: [{
      id: 'e1',
      round: 2,
      url: 'https://example.com/morella',
      normalizedUrl: 'https://example.com/morella',
      title: 'Fuente durable',
      capturedAt: timestamp,
      contentHash: '8'.repeat(64),
      score: 0.9,
      content: 'Contenido fuente durable.',
    }],
    approvalActorId: MANUAL_LOCAL_ACTOR_ID,
    transferActorId: MANUAL_LOCAL_ACTOR_ID,
    finalRunCostEur: 0.310169,
    currency: 'EUR',
    approvedAt: timestamp,
    createdAt: timestamp,
  })
}

const adventure = entry('adventure')
const student = entry('student')
const integration = {
  status: 'integrated' as const,
  transferId,
  transferKey: '4'.repeat(64),
  state: 'ready_for_library' as const,
  entries: [adventure, student],
  actorId: MANUAL_LOCAL_ACTOR_ID,
  transferredAt: timestamp,
  providerCallsPerformed: 0 as const,
  reservationsCreated: 0 as const,
  ledgerCostEur: 0 as const,
  publicationCount: 0 as const,
  trawelConnected: false as const,
  automaticEnabled: false as const,
}

function terminal(libraryIntegration: 'not_started' | typeof integration): RealEditorialTerminalResult {
  return {
    pilotId,
    runId,
    state: libraryIntegration === 'not_started' ? 'human_approved' : 'ready_for_library',
    drafts: [
      { profile: 'adventure', title: adventure.title, content: adventure.content, approximateWordCount: 1000 },
      { profile: 'student', title: student.title, content: student.content, approximateWordCount: 1800 },
    ],
    review: { outcome: 'passed_with_warnings', issues: adventure.warnings },
    snapshot: {
      masterKnowledge: { claims: adventure.claims },
      drafts: [],
      review: { outcome: 'passed_with_warnings', issues: adventure.warnings },
    },
    artifacts: {
      snapshot: { artifactId: 'c1000000-0000-4000-8000-000000000024', kind: 'checkpoint', key: 'pipeline', version: 1, hash: '5'.repeat(64), createdAt: timestamp },
      adventure: adventure.sourceArtifact,
      student: student.sourceArtifact,
      finalReview: adventure.finalReviewArtifact,
    },
    gaps: adventure.gaps,
    contradictions: adventure.contradictions,
    budget: {
      spentCostEur: 0.310169,
      reservedCostEur: 0,
      currentMaximumCostEur: 0.35,
      availableCostEur: 0.039831,
      automatedWorkRemainingEur: 0,
      projectedTotalCostEur: 0.310169,
      shortfallCostEur: 0,
    },
    latestDecision: {
      decisionId: adventure.terminalDecisionId,
      decisionKey: '6'.repeat(64),
      pilotId,
      runId,
      actorId: MANUAL_LOCAL_ACTOR_ID,
      decision: 'approve_editorial_result',
      reason: 'Aprobación durable.',
      observations: 'Warnings aceptados sin publicar.',
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
    libraryIntegration,
  } as unknown as RealEditorialTerminalResult
}

afterEach(() => {
  if (previousFlag === undefined) delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
  else process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = previousFlag
})

describe('transición durable de resultado aprobado a Biblioteca', () => {
  it('valida como una sola estructura estricta el resultado de la transferencia', () => {
    expect(RealEditorialLibraryTransferResultSchema.parse({
      ...integration,
      reused: false,
    })).toMatchObject({
      transferId,
      state: 'ready_for_library',
      reused: false,
    })
    expect(RealEditorialLibraryTransferResultSchema.safeParse({
      ...integration,
      reused: true,
      unexpected: true,
    }).success).toBe(false)
  })

  it('contrata una acción humana explícita y rechaza entradas con perfil de origen divergente', () => {
    expect(RealEditorialLibraryTransferSchema.parse({
      pilotId, runId, actorId: MANUAL_LOCAL_ACTOR_ID, confirmed: true,
    }).confirmed).toBe(true)
    expect(RealEditorialLibraryTransferSchema.safeParse({
      pilotId, runId, actorId: MANUAL_LOCAL_ACTOR_ID, confirmed: false,
    }).success).toBe(false)
    expect(RealEditorialLibraryEntrySchema.safeParse({
      ...adventure,
      profile: 'student',
    }).success).toBe(false)
    expect(RealEditorialLibraryEntrySchema.safeParse({
      ...adventure,
      evidence: [],
    }).success).toBe(false)
    expect(RealEditorialLibraryQuerySchema.parse({
      destination: 'Morella',
      profile: 'adventure',
      status: 'approved_unpublished',
      origin: 'real_editorial_pilot',
    })).toEqual({
      destination: 'Morella',
      profile: 'adventure',
      status: 'approved_unpublished',
      origin: 'real_editorial_pilot',
    })
  })

  it('mantiene la escritura cerrada sin feature flag', async () => {
    delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
    const repository = { moveApprovedResultToLibrary: vi.fn() }
    const runtime = new RealEditorialPilotRuntime(repository as never, {} as never)
    await expect(runtime.moveApprovedResultToLibrary({
      pilotId, runId, actorId: MANUAL_LOCAL_ACTOR_ID, confirmed: true,
    })).rejects.toThrow('feature flag editorial real no autoriza')
    expect(repository.moveApprovedResultToLibrary).not.toHaveBeenCalled()
  })

  it('con la flag activa delega solo la transición y no inicia ni reanuda proveedores', async () => {
    process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = REAL_EDITORIAL_FEATURE_TOKEN
    const repository = {
      getPilot: vi.fn(async () => ({
        id: pilotId,
        currentRunId: runId,
        identityKey: '7'.repeat(64),
        policyId: REAL_EDITORIAL_PILOT_POLICY.id,
        state: 'human_approved',
      })),
      inspect: vi.fn(async () => ({ guardFree: true, pendingReservations: 0 })),
      moveApprovedResultToLibrary: vi.fn(async () => ({ ...integration, reused: false })),
      listLibraryEntries: vi.fn(async () => [adventure, student]),
    }
    const runtime = new RealEditorialPilotRuntime(repository as never, {} as never)
    const start = vi.spyOn(runtime, 'start')
    const resume = vi.spyOn(runtime, 'resume')
    const action = { pilotId, runId, actorId: MANUAL_LOCAL_ACTOR_ID, confirmed: true as const }

    await expect(runtime.moveApprovedResultToLibrary(action)).resolves.toMatchObject({
      state: 'ready_for_library',
      entries: [{ profile: 'adventure' }, { profile: 'student' }],
      ledgerCostEur: 0,
      publicationCount: 0,
      trawelConnected: false,
      automaticEnabled: false,
    })
    await expect(runtime.listLibraryEntries({ origin: 'real_editorial_pilot' }))
      .resolves.toHaveLength(2)
    expect(repository.moveApprovedResultToLibrary).toHaveBeenCalledWith(action)
    expect(start).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
  })

  it('la lectura filtrada no invoca ninguna operación de escritura', async () => {
    const repository = {
      listLibraryEntries: vi.fn(async () => [adventure]),
      moveApprovedResultToLibrary: vi.fn(),
      resolveTerminalDecision: vi.fn(),
    }
    const runtime = new RealEditorialPilotRuntime(repository as never, {} as never)
    await expect(runtime.listLibraryEntries({
      destination: 'Morella',
      profile: 'adventure',
      status: 'approved_unpublished',
      origin: 'real_editorial_pilot',
    })).resolves.toEqual([adventure])
    expect(repository.listLibraryEntries).toHaveBeenCalledOnce()
    expect(repository.moveApprovedResultToLibrary).not.toHaveBeenCalled()
    expect(repository.resolveTerminalDecision).not.toHaveBeenCalled()
  })

  it('muestra una única acción prudencial antes de incorporar', () => {
    const html = renderToStaticMarkup(createElement(RealEditorialTerminalReviewPanel, {
      result: terminal('not_started'),
      actorId: MANUAL_LOCAL_ACTOR_ID,
      busy: false,
      onResolve: vi.fn(),
      onMoveToLibrary: vi.fn(),
      onOpenLibraryEntry: vi.fn(),
    }))
    expect(html.match(/Añadir a Biblioteca/g)).toHaveLength(1)
    expect(html).toContain('Creará dos entradas separadas')
    expect(html).toContain('No publicará')
    expect(html).toContain('No llamará a OpenAI ni Tavily')
    expect(html).toContain('permanecerán inmutables')
  })

  it('tras incorporar muestra ambos accesos y oculta el botón de escritura', () => {
    const html = renderToStaticMarkup(createElement(RealEditorialTerminalReviewPanel, {
      result: terminal(integration),
      actorId: MANUAL_LOCAL_ACTOR_ID,
      busy: false,
      onResolve: vi.fn(),
      onMoveToLibrary: vi.fn(),
      onOpenLibraryEntry: vi.fn(),
    }))
    expect(html).toContain('Disponible en Biblioteca · Sin publicar')
    expect(html).toContain('Abrir Aventura en Biblioteca')
    expect(html).toContain('Abrir Estudiante en Biblioteca')
    expect(html).not.toContain('>Añadir a Biblioteca</button>')
  })

  it('integra dos piezas distinguibles del Manual con texto y trazabilidad completos', () => {
    const navigation = initialLibraryNavigationState()
    const html = renderToStaticMarkup(createElement(Library, {
      navigation: { ...navigation, initialized: true },
      realEntries: [adventure, student],
      realLoading: false,
      realError: null,
      focusedRealEntryId: adventure.entryId,
      connected: true,
      busy: false,
      onOpen: vi.fn(),
      onNew: vi.fn(),
      onFirst: vi.fn(),
      onPrevious: vi.fn(),
      onRefresh: vi.fn(),
      onNext: vi.fn(),
    }))
    expect(html).toContain('Contenido editorial aprobado')
    expect(html).toContain('Aventura aprobada')
    expect(html).toContain('Estudiante aprobado')
    expect(html.match(/Aprobado · Sin publicar/g)?.length).toBeGreaterThanOrEqual(2)
    expect(html).toContain('real_editorial_pilot')
    expect(html).toContain('Texto Aventura exacto')
    expect(html).toContain(adventure.sourceArtifact.artifactId)
    expect(html).toContain('Gaps (5)')
    expect(html).toContain('Contradicciones (3)')
    expect(html).toContain('1 trazas y 1 fuentes durables conservadas')
    expect(html).toContain('Investigaciones Manuales')
  })

  it('mantiene la migración fuera de proveedores, ledger, publicación y borrados', async () => {
    const [migration, main, preload] = await Promise.all([
      readFile(new URL(
        '../supabase/migrations/20260802170000_real_editorial_library_transition.sql',
        import.meta.url,
      ), 'utf8'),
      readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/main/preload.ts', import.meta.url), 'utf8'),
    ])
    expect(migration).toContain('move_approved_result_to_library')
    expect(migration).toContain('real_editorial_library_entries_append_only')
    expect(migration).toContain("'real.editorial.library.added'")
    expect(migration).toContain("'ready_for_library'")
    expect(migration).toContain("'approved_unpublished'")
    expect(migration).not.toMatch(/insert into public\.real_editorial_(?:provider_calls|call_reservations)/i)
    expect(migration).not.toMatch(/update public\.real_editorial_pilot_budgets/i)
    expect(migration).not.toMatch(/(?:delete|truncate)\s+from/i)
    expect(migration).not.toMatch(/api\.tavily|api\.openai|fetch\(/i)
    expect(main).toContain("'real-editorial:move-to-library'")
    expect(main).toContain("'real-editorial:list-library'")
    expect(preload).toContain("ipcRenderer.invoke('real-editorial:move-to-library'")
    expect(preload).toContain("ipcRenderer.invoke('real-editorial:list-library'")
  })
})
