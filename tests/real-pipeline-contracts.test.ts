import { describe, expect, it } from 'vitest'
import {
  RealContinueDecisionSchema,
  RealFocusedQuerySchema,
  RealPipelineLimitsSchema,
  RealProviderReferenceSchema,
  RealResearchDossierSchema,
  RealResearchMissionSchema,
  RealRoundNumberSchema,
  RealRoundResultSchema,
  RealTargetWordCountSchema,
} from '@shared/real-pipeline-contracts'

const now = '2026-07-25T10:00:00.000+02:00'
const hash = 'a'.repeat(64)
const limits = {
  maxRounds: 2 as const,
  maxFocusedQueriesPerRound: 4,
  maxSources: 20,
  maxCharactersPerSource: 100_000,
  maxProviderCalls: 8,
  maxInputTokens: 40_000,
  maxOutputTokens: 12_000,
  taskBudgetEur: 0.2,
  batchBudgetEur: 0.5,
  dailyBudgetEur: 1,
}

function mission(round: 1 | 2 = 1) {
  return {
    requestId: 'request-1',
    runId: 'run-1',
    taskId: 'task-1',
    destination: {
      canonicalId: 'destination-morella',
      name: 'Morella',
      countryCode: 'es',
      type: 'locality' as const,
    },
    language: 'es',
    profiles: [
      { profile: 'adventure' as const, enabled: true, targetWords: 1_000 },
      { profile: 'student' as const, enabled: true, targetWords: 1_800 },
    ],
    depth: 'deep' as const,
    round,
    objectives: ['Historia y patrimonio', 'Rutas y accesos'],
    focusedQueries: round === 2 ? ['Morella transporte público actualizado'] : [],
    limits,
    createdAt: now,
  }
}

function dossier(rounds: Array<1 | 2> = [1]) {
  return {
    requestId: 'request-1',
    runId: 'run-1',
    taskId: 'task-1',
    destinationId: 'destination-morella',
    rounds,
    sources: [{
      id: 'source-1',
      round: rounds[rounds.length - 1],
      url: 'https://example.test/morella',
      normalizedUrl: 'https://example.test/morella',
      title: 'Guía oficial',
      capturedAt: now,
      contentHash: hash,
      score: 0.9,
      content: 'Contenido sintético de investigación.',
    }],
    evidence: [{
      id: 'evidence-1',
      statement: 'Morella conserva un recinto amurallado.',
      sourceIds: ['source-1'],
      confidence: 0.9,
      contradiction: 'none' as const,
      freshness: 'current' as const,
    }],
    generatedAt: now,
  }
}

function roundResult(round: 1 | 2 = 1) {
  const gap = {
    id: 'gap-access',
    topic: 'access',
    description: 'Falta confirmar el transporte público.',
    importance: 'high' as const,
    requiredForProfiles: ['adventure' as const],
    resolvableWithResearch: true,
  }
  return {
    round,
    dossier: dossier(round === 1 ? [1] : [1, 2]),
    masterKnowledge: {
      requestId: 'request-1',
      destinationId: 'destination-morella',
      revision: round,
      claims: [{
        id: 'claim-1',
        topic: 'heritage',
        statement: 'Morella conserva un recinto amurallado.',
        evidenceIds: ['evidence-1'],
        confidence: 0.9,
        suitableProfiles: ['adventure' as const, 'student' as const],
      }],
      contradictions: [],
      generatedAt: now,
    },
    coverage: {
      score: 0.75,
      sufficient: false,
      topics: [{
        topic: 'access',
        required: true,
        coverage: 0.3,
        evidenceIds: [],
      }],
    },
    gaps: [gap],
    proposedQueries: [{
      id: 'query-access',
      gapId: gap.id,
      query: 'Morella transporte público actualizado',
      rationale: 'Completar acceso práctico.',
    }],
    completedAt: now,
  }
}

describe('contratos neutrales del pipeline real', () => {
  it('acepta proveedores por categoría sin campos de credencial', () => {
    const provider = RealProviderReferenceSchema.parse({
      id: 'tavily',
      category: 'research_tool',
      displayName: 'Tavily',
      model: 'search',
      active: true,
    })

    expect(Object.keys(provider)).not.toContain('apiKey')
    expect(JSON.stringify(provider).toLowerCase()).not.toContain('secret')
  })

  it('acepta extensiones en incrementos de 100 y rechaza otros valores', () => {
    expect(RealTargetWordCountSchema.parse(1_000)).toBe(1_000)
    expect(RealTargetWordCountSchema.parse(1_800)).toBe(1_800)
    expect(RealTargetWordCountSchema.safeParse(1_050).success).toBe(false)
  })

  it('valida la jerarquía de presupuestos y sus límites', () => {
    expect(RealPipelineLimitsSchema.parse(limits)).toEqual(limits)
    expect(RealPipelineLimitsSchema.safeParse({ ...limits, taskBudgetEur: 0.8 }).success).toBe(false)
    expect(RealPipelineLimitsSchema.safeParse({ ...limits, maxRounds: 3 }).success).toBe(false)
  })

  it('admite exclusivamente las rondas 1 y 2', () => {
    expect(RealRoundNumberSchema.parse(1)).toBe(1)
    expect(RealRoundNumberSchema.parse(2)).toBe(2)
    expect(RealRoundNumberSchema.safeParse(3).success).toBe(false)
  })

  it('distingue misión inicial y ampliación focalizada', () => {
    expect(RealResearchMissionSchema.parse(mission(1)).round).toBe(1)
    expect(RealResearchMissionSchema.parse(mission(2)).round).toBe(2)
    expect(RealResearchMissionSchema.safeParse({
      ...mission(2),
      focusedQueries: [],
    }).success).toBe(false)
  })

  it('rechaza perfiles repetidos y permite Aventura y Estudiante distintos', () => {
    expect(RealResearchMissionSchema.parse(mission()).profiles).toHaveLength(2)
    expect(RealResearchMissionSchema.safeParse({
      ...mission(),
      profiles: [
        { profile: 'adventure', enabled: true, targetWords: 1_000 },
        { profile: 'adventure', enabled: true, targetWords: 1_800 },
      ],
    }).success).toBe(false)
  })

  it('conserva expedientes correlativos y no permite una tercera ronda', () => {
    expect(RealResearchDossierSchema.parse(dossier([1])).rounds).toEqual([1])
    expect(RealResearchDossierSchema.parse(dossier([1, 2])).rounds).toEqual([1, 2])
    expect(RealResearchDossierSchema.safeParse({ ...dossier(), rounds: [0] }).success).toBe(false)
    expect(RealResearchDossierSchema.safeParse({ ...dossier(), rounds: [1, 1] }).success).toBe(false)
    expect(RealResearchDossierSchema.safeParse({ ...dossier(), rounds: [1, 3] }).success).toBe(false)
    expect(RealResearchDossierSchema.safeParse({ ...dossier(), rounds: [2, 1] }).success).toBe(false)
    expect(RealResearchDossierSchema.safeParse({ ...dossier(), rounds: [2] }).success).toBe(false)
    expect(RealResearchDossierSchema.safeParse({ ...dossier(), rounds: [1, 2, 3] }).success).toBe(false)
  })

  it('vincula carencias con sus consultas focalizadas', () => {
    const query = RealFocusedQuerySchema.parse(roundResult().proposedQueries[0])
    expect(query.gapId).toBe('gap-access')
    expect(RealRoundResultSchema.parse(roundResult()).gaps[0].importance).toBe('high')
    expect(RealRoundResultSchema.safeParse({
      ...roundResult(),
      proposedQueries: [{ ...query, gapId: 'gap-unknown' }],
    }).success).toBe(false)
  })

  it('solo permite continuar hacia la segunda ronda', () => {
    const decision = RealContinueDecisionSchema.parse({
      action: 'continue_focused',
      nextRound: 2,
      reason: 'Falta evidencia relevante.',
      queries: roundResult().proposedQueries,
    })
    expect(decision.action).toBe('continue_focused')
    if (decision.action === 'continue_focused') expect(decision.nextRound).toBe(2)
    expect(RealContinueDecisionSchema.safeParse({
      action: 'continue_focused',
      nextRound: 3,
      reason: 'No permitido.',
      queries: roundResult().proposedQueries,
    }).success).toBe(false)
  })

  it('serializa y vuelve a validar sin perder el contrato', () => {
    const parsed = RealRoundResultSchema.parse(roundResult(2))
    const serialized = JSON.stringify(parsed)

    expect(RealRoundResultSchema.parse(JSON.parse(serialized))).toEqual(parsed)
    expect(serialized).not.toMatch(/api[_-]?key|password|credential|secret/i)
  })
})
