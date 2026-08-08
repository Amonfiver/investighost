import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  restoreRealWorkflowCheckpointRounds,
  type RealEditorialArtifact,
} from '@modules/real-pipeline'
import type {
  RealResearchDossier,
  RealResearchMission,
} from '@shared/real-pipeline-contracts'
import type { RealEditorialRoundOneSourceSelectionPlan } from '@shared/real-editorial-pilot-contracts'
import type { RealWorkflowCheckpoint } from '@modules/real-pipeline/real-workflow'

const pilotId = '94000000-0000-4000-8000-000000000001'
const runId = '94000000-0000-4000-8000-000000000002'
const destinationId = '94000000-0000-4000-8000-000000000003'
const timestamp = '2026-07-26T00:00:00.000Z'

const mission: RealResearchMission = {
  requestId: pilotId,
  runId,
  taskId: `real-editorial-task:${pilotId}`,
  destination: {
    canonicalId: destinationId,
    name: 'Morella',
    countryCode: 'ES',
    type: 'locality',
  },
  profiles: [
    { profile: 'adventure', enabled: true, targetWords: 1_000, depth: 'standard' },
    { profile: 'student', enabled: true, targetWords: 1_800, depth: 'deep' },
  ],
  language: 'es',
  depth: 'deep',
  round: 1,
  objectives: ['patrimonio documentado'],
  focusedQueries: [],
  limits: {
    maxRounds: 2,
    maxFocusedQueriesPerRound: 3,
    maxSources: 8,
    maxCharactersPerSource: 100_000,
    maxProviderCalls: 12,
    maxInputTokens: 200_000,
    maxOutputTokens: 50_000,
    taskBudgetEur: 0.2,
    batchBudgetEur: 0.2,
    dailyBudgetEur: 0.2,
  },
  createdAt: timestamp,
}

function checkpoint(
  overrides: Partial<RealWorkflowCheckpoint> = {},
): RealWorkflowCheckpoint {
  return {
    version: 'real-workflow-v1',
    taskId: mission.taskId,
    configurationHash: 'a'.repeat(64),
    state: 'researching_round_1',
    initialMission: mission,
    completedRound: 0,
    unresolvedGaps: [],
    nextRoundQueries: [],
    queryHashes: [],
    providerCalls: 0,
    simulatedCost: 0,
    updatedAt: timestamp,
    ...overrides,
  }
}

function source(round: 1 | 2) {
  const content = `evidencia durable ronda ${round}`
  const url = `https://fixtures.investighost.local/morella/round-${round}`
  return {
    id: `source-round-${round}`,
    round,
    url,
    normalizedUrl: url,
    title: `Morella ronda ${round}`,
    capturedAt: timestamp,
    contentHash: createHash('sha256').update(content).digest('hex'),
    score: 0.95,
    content,
  }
}

function researchArtifact(round: 1 | 2): RealEditorialArtifact {
  return {
    kind: 'tavily_result',
    key: `round-${round}`,
    version: 1,
    payload: {
      round,
      sources: [source(round)],
      providerRequestIds: [`durable-tavily-round-${round}`],
      failures: [],
      usageUnits: 1,
      credits: 1,
    },
    payloadHash: `${round}`.repeat(64),
    createdAt: timestamp,
  }
}

function dossier(rounds: Array<1 | 2>): RealResearchDossier {
  return {
    requestId: pilotId,
    runId,
    taskId: mission.taskId,
    destinationId,
    rounds,
    sources: rounds.map(source),
    evidence: [],
    generatedAt: timestamp,
  }
}

function selectedRoundOneFixture() {
  const sources = Array.from({ length: 8 }, (_, index) => {
    const ordinal = index + 1
    const content = `evidencia durable ronda 1 fuente ${ordinal}`
    const url = `https://fixtures.investighost.local/morella/round-1-${ordinal}`
    return {
      ...source(1),
      id: `source-round-1-${ordinal}`,
      url,
      normalizedUrl: url,
      title: `Morella ronda 1 fuente ${ordinal}`,
      contentHash: createHash('sha256').update(content).digest('hex'),
      score: 1 - ordinal / 100,
      content,
    }
  })
  const selection: RealEditorialRoundOneSourceSelectionPlan = {
    status: 'applied',
    pilotId,
    runId,
    incidentId: '94000000-0000-4000-8000-000000000004',
    strategyVersion: 'round-one-active-source-selection-v1',
    proposalHash: 'a'.repeat(64),
    previousCheckpointVersion: 4,
    previousCheckpointHash: 'b'.repeat(64),
    selectedCheckpointVersion: 5,
    workflowVersion: 'real-workflow-v1',
    maximumSources: 8,
    roundTwoQueryCount: 3,
    requiredRoundTwoSlots: 3,
    originalActiveCount: 8,
    retainedCount: 5,
    deselectedCount: 3,
    activeCountAfterSelection: 5,
    availableSlotsAfterSelection: 3,
    sources: sources.map((item, index) => ({
      sourceId: item.id,
      title: item.title,
      normalizedUrl: item.normalizedUrl,
      contentHash: item.contentHash,
      score: item.score,
      originalOrdinal: index + 1,
      rank: index + 1,
      decision: index < 5 ? 'keep_active' : 'deselect_active',
      coveredGapIds: [],
      coverageTopics: [],
      undercoveredCoverageTopics: [],
      claimIds: [],
      reason: index < 5
        ? 'current_gap_evidence_priority'
        : 'lower_incremental_gap_coverage',
    })),
    providerCallsPerformed: 0,
    budgetChanged: false,
    historicalSourcesMutated: false,
    selectionId: '94000000-0000-4000-8000-000000000005',
    selectionKey: 'c'.repeat(64),
    actorId: '94000000-0000-4000-8000-000000000006',
    reason: 'Selección humana conservadora.',
    selectedAt: timestamp,
  }
  const artifact: RealEditorialArtifact = {
    ...researchArtifact(1),
    payload: {
      round: 1,
      sources,
      providerRequestIds: ['durable-tavily-round-1'],
      failures: [],
      usageUnits: 1,
      credits: 1,
    },
  }
  return { sources, selection, artifact }
}

describe('reconstrucción durable de rondas editoriales', () => {
  it('conserva un checkpoint sin rondas completadas y currentRound semántico cero', () => {
    const stored = checkpoint()
    expect(restoreRealWorkflowCheckpointRounds(stored, {})).toEqual(stored)
    expect(restoreRealWorkflowCheckpointRounds(stored, {}).dossier).toBeUndefined()
  })

  it('reutiliza la ronda 1 persistida sin añadirla de nuevo', () => {
    const restored = restoreRealWorkflowCheckpointRounds(
      checkpoint({ dossier: dossier([1]), providerCalls: 5, simulatedCost: 0.048 }),
      { 1: researchArtifact(1) },
    )

    expect(restored.state).toBe('analyzing_round_1')
    expect(restored.completedRound).toBe(0)
    expect(restored.dossier?.rounds).toEqual([1])
    expect(restored.providerCalls).toBe(5)
    expect(restored.simulatedCost).toBe(0.048)
  })

  it('reconstruye una investigación persistida tras un checkpoint anterior al dossier', () => {
    const restored = restoreRealWorkflowCheckpointRounds(
      checkpoint(),
      { 1: researchArtifact(1) },
    )

    expect(restored.state).toBe('analyzing_round_1')
    expect(restored.dossier).toMatchObject({
      requestId: pilotId,
      runId,
      rounds: [1],
      sources: [{ id: 'source-round-1', round: 1 }],
    })
  })

  it('rechaza una ronda 2 durable sin ronda 1', () => {
    expect(() => restoreRealWorkflowCheckpointRounds(
      checkpoint(),
      { 2: researchArtifact(2) },
    )).toThrow('rondas durables de investigación no son correlativas')
  })

  it('rechaza dos rondas investigadas si ninguna fue todavía analizada', () => {
    expect(() => restoreRealWorkflowCheckpointRounds(
      checkpoint(),
      { 1: researchArtifact(1), 2: researchArtifact(2) },
    )).toThrow('índice de análisis no coincide')
  })

  it('rechaza rounds del checkpoint incompatibles en vez de deduplicarlos', () => {
    expect(() => restoreRealWorkflowCheckpointRounds(
      checkpoint({ dossier: { ...dossier([1]), rounds: [1, 1] } as RealResearchDossier }),
      { 1: researchArtifact(1) },
    )).toThrow('no supera el esquema estricto')
  })

  it('rechaza fuentes alteradas en el checkpoint en vez de sobrescribirlas', () => {
    const changed = dossier([1])
    changed.sources[0] = { ...changed.sources[0], title: 'Contenido alterado' }

    expect(() => restoreRealWorkflowCheckpointRounds(
      checkpoint({ dossier: changed }),
      { 1: researchArtifact(1) },
    )).toThrow('fuentes del expediente no coinciden')
  })

  it('restaura únicamente el subconjunto respaldado por la selección humana durable', () => {
    const fixture = selectedRoundOneFixture()
    const selectedSources = [
      fixture.sources[2],
      fixture.sources[0],
      fixture.sources[4],
      fixture.sources[1],
      fixture.sources[3],
    ]
    const storedDossier: RealResearchDossier = {
      ...dossier([1]),
      sources: selectedSources,
    }
    const restored = restoreRealWorkflowCheckpointRounds(
      checkpoint({
        state: 'researching_round_2',
        completedRound: 1,
        dossier: storedDossier,
      }),
      { 1: fixture.artifact },
      fixture.selection,
    )

    expect(restored.dossier?.sources.map(item => item.id)).toEqual(
      selectedSources.map(item => item.id),
    )
  })

  it('rechaza un subconjunto si la auditoría durable no coincide con la fuente histórica', () => {
    const fixture = selectedRoundOneFixture()
    const storedDossier: RealResearchDossier = {
      ...dossier([1]),
      sources: fixture.sources.slice(0, 5),
    }
    const alteredSelection = structuredClone(fixture.selection)
    alteredSelection.sources[0].title = 'Título manipulado'

    expect(() => restoreRealWorkflowCheckpointRounds(
      checkpoint({
        state: 'researching_round_2',
        completedRound: 1,
        dossier: storedDossier,
      }),
      { 1: fixture.artifact },
      alteredSelection,
    )).toThrow('fuentes del expediente no coinciden')
  })
})
