import { describe, expect, it } from 'vitest'
import { assessEditorialSufficiency } from '@modules/real-pipeline/editorial-sufficiency'
import type {
  RealFocusedQuery,
  RealKnowledgeGap,
  RealResearchMission,
} from '@shared/real-pipeline-contracts'

const timestamp = '2026-09-08T12:00:00.000Z'

function mission(): RealResearchMission {
  return {
    requestId: 'request-albarracin',
    runId: 'run-albarracin',
    taskId: 'task-albarracin',
    destination: {
      canonicalId: 'destination-albarracin',
      name: 'Albarracín',
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
    objectives: ['historia', 'aventura'],
    focusedQueries: [],
    limits: {
      maxRounds: 2,
      maxFocusedQueriesPerRound: 4,
      maxSources: 20,
      maxCharactersPerSource: 100_000,
      maxProviderCalls: 8,
      maxInputTokens: 40_000,
      maxOutputTokens: 12_000,
      taskBudgetEur: 0.4,
      batchBudgetEur: 1,
      dailyBudgetEur: 1,
    },
    createdAt: timestamp,
  }
}

function gap(overrides: Partial<RealKnowledgeGap> = {}): RealKnowledgeGap {
  return {
    id: 'gap-one',
    topic: 'detalle',
    description: 'Detalle pendiente.',
    importance: 'medium',
    requiredForProfiles: ['student'],
    resolvableWithResearch: true,
    ...overrides,
  }
}

function query(gapId = 'gap-one'): RealFocusedQuery {
  return {
    id: `query-${gapId}`,
    gapId,
    query: `evidencia verificable ${gapId}`,
    rationale: 'Resolver una única carencia material.',
    expectedEvidence: 'Fuente primaria o secundaria verificable.',
    stopCondition: 'Detener al cerrar la ronda focalizada.',
  }
}

function assess(options: {
  coverage?: number
  gaps?: RealKnowledgeGap[]
  queries?: RealFocusedQuery[]
  contradictions?: string[]
  marginalCost?: number
  remainingBudget?: number
} = {}) {
  return assessEditorialSufficiency({
    mission: mission(),
    dossier: {
      requestId: 'request-albarracin',
      runId: 'run-albarracin',
      taskId: 'task-albarracin',
      destinationId: 'destination-albarracin',
      rounds: [1],
      sources: [{
        id: 'source-one',
        round: 1,
        url: 'https://example.test/source',
        normalizedUrl: 'https://example.test/source',
        title: 'Fuente sintética',
        publisher: 'Fuente sintética',
        capturedAt: timestamp,
        contentHash: 'a'.repeat(64),
        score: 0.9,
        content: 'Contenido verificable.',
      }],
      evidence: [],
      generatedAt: timestamp,
    },
    knowledge: {
      requestId: 'request-albarracin',
      destinationId: 'destination-albarracin',
      revision: 1,
      claims: [],
      contradictions: options.contradictions ?? [],
      generatedAt: timestamp,
    },
    coverageScore: options.coverage ?? 0.72,
    gaps: options.gaps ?? [],
    proposedQueries: options.queries ?? [],
    spentCostEur: 0.2,
    expectedMarginalCostEur: options.marginalCost ?? 0.1,
    remainingBudgetEur: options.remainingBudget ?? 0.2,
  })
}

describe('TENEMOS NOTICIA: suficiencia editorial', () => {
  it('Caso A: acepta cobertura moderada con gaps secundarios omitibles', () => {
    const decision = assess({
      coverage: 0.7,
      gaps: [gap({
        editorialContext: {
          affectedSection: 'curiosidades', centrality: 'low', omittable: true,
          contextualizable: true, canBeDeclaredUnverified: true,
          temporalSensitivity: 'variable', inventionRisk: 'low',
          evidenceThreshold: 'secondary_sufficient',
          estimatedUsefulEvidenceProbability: 0.1, estimatedMaterialChangeProbability: 0.1,
        },
      })],
      marginalCost: 0.18,
    })
    expect(decision.status).toBe('enough_to_write')
  })

  it('Caso B: no usa cobertura alta para ocultar un gap crítico de ruta', () => {
    const decision = assess({
      coverage: 0.93,
      gaps: [gap({
        id: 'route-safety', topic: 'ruta-segura', description: 'No hay evidencia de acceso ni seguridad.',
        importance: 'critical', requiredForProfiles: ['adventure'],
        editorialContext: {
          affectedSection: 'ruta', centrality: 'critical', omittable: false,
          contextualizable: false, canBeDeclaredUnverified: false,
          temporalSensitivity: 'variable', inventionRisk: 'critical',
          evidenceThreshold: 'primary_required',
          estimatedUsefulEvidenceProbability: 0.8, estimatedMaterialChangeProbability: 0.9,
        },
      })],
      queries: [query('route-safety')],
    })
    expect(['targeted_gap_only', 'insufficient', 'unsafe_to_write']).toContain(decision.status)
    expect(decision.status).not.toBe('enough_to_write')
  })

  it('Caso C: contextualiza una contradicción temporal sin bloquear', () => {
    const decision = assess({
      contradictions: ['Dos fuentes discrepan en precio y horario del castillo.'],
    })
    expect(decision.status).toBe('enough_to_write')
    expect(decision.contradictions[0]?.impact).toBe('tolerable_contextualizable')
  })

  it('Caso D: bloquea una afirmación peligrosa en vez de redactarla como hecho', () => {
    const decision = assess({
      gaps: [gap({
        id: 'dangerous-route', topic: 'acceso-ruta', description: 'Seguridad del recorrido sin acreditar.',
        importance: 'critical', requiredForProfiles: ['adventure'],
        editorialContext: {
          affectedSection: 'aventura-ruta', centrality: 'critical', omittable: false,
          contextualizable: false, canBeDeclaredUnverified: false,
          temporalSensitivity: 'time_sensitive', inventionRisk: 'critical',
          evidenceThreshold: 'primary_required',
          estimatedUsefulEvidenceProbability: 0.2, estimatedMaterialChangeProbability: 0.8,
        },
      })],
    })
    expect(decision.status).toBe('unsafe_to_write')
    expect(decision.reason).toContain('No se puede redactar como hecho')
  })

  it('Caso E: autoriza solo una búsqueda focalizada de valor material', () => {
    const targetGap = gap({
      id: 'route-evidence', topic: 'ruta', description: 'Falta confirmar desnivel de una ruta concreta.',
      importance: 'high', requiredForProfiles: ['adventure'],
      editorialContext: {
        affectedSection: 'ruta', centrality: 'high', omittable: false,
        contextualizable: false, canBeDeclaredUnverified: false,
        temporalSensitivity: 'stable', inventionRisk: 'medium',
        evidenceThreshold: 'primary_preferred',
        estimatedUsefulEvidenceProbability: 0.9, estimatedMaterialChangeProbability: 0.8,
      },
    })
    const decision = assess({ gaps: [targetGap], queries: [query(targetGap.id)], marginalCost: 0.05 })
    expect(decision.status).toBe('targeted_gap_only')
    expect(decision.targetedSearch).toMatchObject({
      gapId: 'route-evidence', affectedSection: 'ruta', costLimitEur: 0.05, roundLimit: 2,
    })
  })

  it('Caso F: evita una búsqueda nueva sin valor editorial esperado', () => {
    const decision = assess({
      gaps: [gap({ id: 'decorative', topic: 'anecdota', description: 'Dato decorativo no esencial.' })],
      queries: [query('decorative')],
      marginalCost: 0.2,
    })
    expect(decision.status).toBe('enough_to_write')
  })

  it('Caso G: conserva independencia por perfil', () => {
    const decision = assess({
      gaps: [gap({
        id: 'adventure-only', topic: 'ruta', description: 'Acceso peligroso sin evidencia.',
        importance: 'critical', requiredForProfiles: ['adventure'],
        editorialContext: {
          affectedSection: 'ruta', centrality: 'critical', omittable: false,
          contextualizable: false, canBeDeclaredUnverified: false,
          temporalSensitivity: 'variable', inventionRisk: 'critical',
          evidenceThreshold: 'primary_required',
          estimatedUsefulEvidenceProbability: 0.4, estimatedMaterialChangeProbability: 0.8,
        },
      })],
    })
    expect(decision.status).toBe('unsafe_to_write')
    expect(decision.profiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ profile: 'adventure', status: 'unsafe_to_write' }),
      expect.objectContaining({ profile: 'student', status: 'enough_to_write' }),
    ]))
  })
})
