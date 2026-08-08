import { describe, expect, it } from 'vitest'
import {
  checkpointWithSelectedRoundOneSources,
  planRoundOneActiveSources,
} from '@modules/real-pipeline/round-one-source-selection'
import type { RealWorkflowCheckpoint } from '@modules/real-pipeline/real-workflow'

const timestamp = '2026-08-09T08:00:00.000Z'

function checkpoint(): RealWorkflowCheckpoint {
  const sources = Array.from({ length: 8 }, (_, index) => ({
    id: `source-${index + 1}`,
    round: 1 as const,
    url: `https://source-${index + 1}.example.test/page`,
    normalizedUrl: `https://source-${index + 1}.example.test/page`,
    title: `Fuente sintética ${index + 1}`,
    capturedAt: timestamp,
    contentHash: String(index + 1).repeat(64),
    score: [0.8, 0.7, 0.9, 0.6, 0.5, 0.85, 0.75, 0.65][index],
    content: `Contenido sintético ${index + 1}.`,
  }))
  return {
    version: 'real-workflow-v1',
    taskId: 'synthetic-source-selection-task',
    configurationHash: 'a'.repeat(64),
    state: 'researching_round_2',
    initialMission: {
      requestId: 'synthetic-request',
      runId: 'a1000000-0000-4000-8000-000000000002',
      taskId: 'synthetic-source-selection-task',
      destination: {
        canonicalId: 'a1000000-0000-4000-8000-000000000003',
        name: 'Destino sintético',
        countryCode: 'ES',
        type: 'locality',
      },
      language: 'es',
      profiles: [
        { profile: 'adventure', enabled: true, targetWords: 1_000 },
        { profile: 'student', enabled: true, targetWords: 1_800 },
      ],
      depth: 'deep',
      round: 1,
      objectives: ['Objetivo sintético'],
      focusedQueries: [],
      limits: {
        maxRounds: 2,
        maxFocusedQueriesPerRound: 3,
        maxSources: 8,
        maxCharactersPerSource: 100_000,
        maxProviderCalls: 20,
        maxInputTokens: 40_000,
        maxOutputTokens: 12_000,
        taskBudgetEur: 0.42,
        batchBudgetEur: 0.42,
        dailyBudgetEur: 0.42,
      },
      createdAt: timestamp,
    },
    completedRound: 1,
    dossier: {
      requestId: 'synthetic-request',
      destinationId: 'a1000000-0000-4000-8000-000000000003',
      rounds: [1],
      sources,
      failures: [],
      generatedAt: timestamp,
    },
    masterKnowledge: {
      requestId: 'synthetic-request',
      destinationId: 'a1000000-0000-4000-8000-000000000003',
      revision: 1,
      claims: [
        ...Array.from({ length: 6 }, (_, index) => ({
          id: `claim-a-${index}`,
          topic: 'acceso',
          statement: `Afirmación sintética A ${index}.`,
          evidenceIds: ['source-1', 'source-2'],
          confidence: 0.9,
          suitableProfiles: ['adventure' as const],
        })),
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `claim-b-${index}`,
          topic: 'rutas',
          statement: `Afirmación sintética B ${index}.`,
          evidenceIds: ['source-3'],
          confidence: 0.9,
          suitableProfiles: ['adventure' as const],
        })),
        {
          id: 'claim-c',
          topic: 'temporada',
          statement: 'Afirmación sintética C.',
          evidenceIds: ['source-4', 'source-5', 'source-6'],
          confidence: 0.8,
          suitableProfiles: ['student'],
        },
      ],
      contradictions: [],
      generatedAt: timestamp,
    },
    coverage: {
      score: 0.68,
      sufficient: false,
      topics: [
        { topic: 'acceso y transporte', required: true, coverage: 0.35, evidenceIds: ['source-1', 'source-2'] },
        { topic: 'duración y rutas', required: true, coverage: 0.2, evidenceIds: ['source-1', 'source-3'] },
        { topic: 'temporada', required: true, coverage: 0.42, evidenceIds: ['source-4', 'source-5'] },
        { topic: 'población', required: true, coverage: 0.8, evidenceIds: ['source-5', 'source-6'] },
      ],
    },
    lastDecision: {
      action: 'continue_focused',
      nextRound: 2,
      reason: 'Tres consultas sintéticas.',
      queries: [
        { id: 'q1', gapId: 'g1', query: 'Consulta sintética acceso', rationale: 'Acceso.' },
        { id: 'q2', gapId: 'g2', query: 'Consulta sintética rutas', rationale: 'Rutas.' },
        { id: 'q3', gapId: 'g3', query: 'Consulta sintética temporada', rationale: 'Temporada.' },
      ],
    },
    unresolvedGaps: [
      { id: 'g1', topic: 'acceso', description: 'Acceso incompleto.', importance: 'high', requiredForProfiles: ['adventure'], resolvableWithResearch: true },
      { id: 'g2', topic: 'duración y rutas', description: 'Rutas incompletas.', importance: 'critical', requiredForProfiles: ['adventure'], resolvableWithResearch: true },
      { id: 'g3', topic: 'horarios y temporada', description: 'Temporada incompleta.', importance: 'high', requiredForProfiles: ['student'], resolvableWithResearch: true },
    ],
    nextRoundQueries: [
      { id: 'q1', gapId: 'g1', query: 'Consulta sintética acceso', rationale: 'Acceso.' },
      { id: 'q2', gapId: 'g2', query: 'Consulta sintética rutas', rationale: 'Rutas.' },
      { id: 'q3', gapId: 'g3', query: 'Consulta sintética temporada', rationale: 'Temporada.' },
    ],
    queryHashes: ['b'.repeat(64)],
    providerCalls: 6,
    simulatedCost: 0.175406,
    lastAnalysisCost: 0.097406,
    updatedAt: timestamp,
  }
}

describe('selección activa de fuentes antes de ronda 2', () => {
  it('libera una plaza por consulta con ranking determinista y sin mutar ronda 1', () => {
    const original = checkpoint()
    const historicalSnapshot = structuredClone(original.dossier?.sources)
    const input = {
      pilotId: 'a1000000-0000-4000-8000-000000000001',
      runId: 'a1000000-0000-4000-8000-000000000002',
      incidentId: 'a1000000-0000-4000-8000-000000000004',
      checkpointVersion: 4,
      checkpointHash: 'c'.repeat(64),
      checkpoint: original,
    }

    const first = planRoundOneActiveSources(input)
    const repeated = planRoundOneActiveSources(input)
    const selected = checkpointWithSelectedRoundOneSources(
      original,
      first,
      '2026-08-09T08:05:00.000Z',
    )

    expect(repeated).toEqual(first)
    expect(first).toMatchObject({
      status: 'required',
      maximumSources: 8,
      roundTwoQueryCount: 3,
      requiredRoundTwoSlots: 3,
      originalActiveCount: 8,
      retainedCount: 5,
      deselectedCount: 3,
      activeCountAfterSelection: 5,
      availableSlotsAfterSelection: 3,
      providerCallsPerformed: 0,
      budgetChanged: false,
      historicalSourcesMutated: false,
    })
    expect(first.sources.filter(source => source.decision === 'keep_active').map(source => source.sourceId))
      .toEqual(['source-1', 'source-2', 'source-3', 'source-5', 'source-4'])
    expect(first.sources.filter(source => source.decision === 'deselect_active').map(source => source.sourceId))
      .toEqual(['source-6', 'source-7', 'source-8'])
    expect(selected.dossier?.sources).toHaveLength(5)
    expect(selected.dossier?.sources.length + first.requiredRoundTwoSlots).toBe(8)
    expect(original.dossier?.sources).toEqual(historicalSnapshot)
    expect(original.dossier?.sources).toHaveLength(8)
  })

  it('rechaza desactivar la única evidencia activa de una afirmación histórica', () => {
    const unsafe = checkpoint()
    unsafe.masterKnowledge?.claims.push({
      id: 'claim-orphan',
      topic: 'evidencia única',
      statement: 'Afirmación sintética con una sola evidencia.',
      evidenceIds: ['source-8'],
      confidence: 0.8,
      suitableProfiles: ['student'],
    })

    expect(() => planRoundOneActiveSources({
      pilotId: 'a1000000-0000-4000-8000-000000000001',
      runId: 'a1000000-0000-4000-8000-000000000002',
      incidentId: 'a1000000-0000-4000-8000-000000000004',
      checkpointVersion: 4,
      checkpointHash: 'c'.repeat(64),
      checkpoint: unsafe,
    })).toThrow('ROUND_ONE_SOURCE_SELECTION_WOULD_ORPHAN_EVIDENCE')
  })
})
