import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ResearchDestinationInputSchema,
  ResearchDestinationResultSchema,
  editorialDraftTransitions,
  researchStateTransitions,
} from '@shared/editorial-contracts'

const id = (value: number): string => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const now = new Date('2026-07-21T08:00:00.000Z')
const fingerprint = (value: string): string => createHash('sha256').update(value).digest('hex')

function buildResult() {
  const sourceId = id(10)
  const factId = id(11)
  const requestId = id(3)
  const runId = id(4)
  const destinationId = id(2)
  const actorId = id(1)
  const adventureDraftId = id(20)
  const studentDraftId = id(21)
  const adventureSectionId = id(22)
  const studentSectionId = id(23)

  return {
    request: {
      id: requestId,
      destinationId,
      destinationQuerySnapshot: 'Morella, España',
      profiles: ['adventure', 'student'],
      language: 'es',
      depth: 'standard',
      options: {},
      configurationVersion: 'manual-v1',
      idempotencyKey: 'manual:morella:es:v1',
      actorId,
      state: 'completed',
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    run: {
      id: runId,
      requestId,
      stage: 'human_review',
      providerId: 'mock-editorial',
      model: 'deterministic-fixture-v1',
      promptVersion: 'editorial-v1',
      contractVersion: '3a-v1',
      attempt: 1,
      estimatedCost: 0,
      actualCost: 0,
      currency: 'EUR',
      inputUnits: 0,
      outputUnits: 0,
      startedAt: now,
      completedAt: now,
      state: 'completed',
      createdAt: now,
      updatedAt: now,
    },
    destination: {
      id: destinationId,
      parentId: id(30),
      type: 'locality',
      name: 'Morella',
      normalizedName: 'morella',
      aliases: ['Morella'],
      countryCode: 'ES',
      regionCode: 'VC',
      slug: 'morella',
      sourceName: 'Investighost synthetic geography fixture',
      sourceVersion: '2026-07-v1',
      sourceLicense: 'CC0 synthetic fixture',
      status: 'active',
      resolutionMethod: 'exact',
      ambiguityCandidateIds: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    sources: [{
      id: sourceId,
      runId,
      url: 'https://fixtures.investighost.local/morella/official',
      normalizedUrl: 'https://fixtures.investighost.local/morella/official',
      title: 'Fuente oficial sintética de Morella',
      publisher: 'Investighost fixtures',
      query: 'Morella turismo oficial',
      sourceType: 'official',
      territorialScope: 'destination',
      freshness: 'current',
      reliability: 0.9,
      status: 'accepted',
      fingerprint: fingerprint('morella-official'),
      metadata: { synthetic: true },
      capturedAt: now,
    }],
    facts: [{
      id: factId,
      requestId,
      destinationId,
      statement: 'Morella conserva un recinto amurallado sobre una elevación.',
      category: 'history',
      sourceIds: [sourceId],
      confidence: 0.9,
      contradiction: 'none',
      volatility: 'stable',
      reviewStatus: 'verified',
      version: 1,
      createdAt: now,
      updatedAt: now,
    }],
    places: [{
      id: id(12),
      requestId,
      destinationId,
      name: 'Recinto amurallado',
      category: 'monument',
      position: 0,
      factIds: [factId],
      sourceIds: [sourceId],
      profileRelevance: { adventure: 0.9, student: 0.7 },
      status: 'accepted',
      version: 1,
      createdAt: now,
      updatedAt: now,
    }],
    activities: [],
    drafts: [
      {
        draft: {
          id: adventureDraftId,
          requestId,
          runId,
          profile: 'adventure',
          title: 'Morella a pie: murallas y desnivel',
          introduction: 'Una lectura activa del recinto histórico.',
          promptVersion: 'adventure-v1',
          contentVersion: 1,
          state: 'in_review',
          humanEdited: false,
          createdBy: actorId,
          updatedBy: actorId,
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        sections: [{
          id: adventureSectionId,
          draftId: adventureDraftId,
          kind: 'route',
          heading: 'Recorrido y preparación',
          content: 'El desnivel convierte las murallas en una visita que conviene preparar a pie.',
          position: 0,
          factIds: [factId],
          sourceIds: [sourceId],
          promptVersion: 'adventure-v1',
          humanEdited: false,
          version: 1,
          createdAt: now,
          updatedAt: now,
        }],
      },
      {
        draft: {
          id: studentDraftId,
          requestId,
          runId,
          profile: 'student',
          title: 'Morella práctica para una estancia de estudiante',
          introduction: 'Contexto, movilidad y vida diaria verificable.',
          promptVersion: 'student-v1',
          contentVersion: 1,
          state: 'in_review',
          humanEdited: false,
          createdBy: actorId,
          updatedBy: actorId,
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        sections: [{
          id: studentSectionId,
          draftId: studentDraftId,
          kind: 'daily_life',
          heading: 'Movilidad cotidiana',
          content: 'El recinto amurallado exige valorar desplazamientos y servicios con datos actualizados.',
          position: 0,
          factIds: [factId],
          sourceIds: [sourceId],
          promptVersion: 'student-v1',
          humanEdited: false,
          version: 1,
          createdAt: now,
          updatedAt: now,
        }],
      },
    ],
    qualityReviews: [],
    qualityChecks: [],
    usage: [],
    events: [{
      id: id(40),
      requestId,
      runId,
      type: 'research.completed',
      stage: 'human_review',
      correlationId: 'manual:morella:es:v1',
      payload: { synthetic: true },
      occurredAt: now,
    }],
  }
}

describe('canonical editorial domain', () => {
  it('represents the complete destination pipeline with two differentiated profiles', () => {
    expect(ResearchDestinationResultSchema.parse(buildResult()).drafts).toHaveLength(2)
  })

  it('requires source → fact → section traceability', () => {
    const result = buildResult()
    result.drafts[0].sections[0].factIds = [id(999)]
    expect(ResearchDestinationResultSchema.safeParse(result).success).toBe(false)
  })

  it('rejects duplicated editorial content between Adventure and Student', () => {
    const result = buildResult()
    result.drafts[1].sections[0] = {
      ...result.drafts[0].sections[0],
      id: id(998),
      draftId: result.drafts[1].draft.id,
    }
    expect(ResearchDestinationResultSchema.safeParse(result).success).toBe(false)
  })

  it('defines idempotent neutral input without a Manual/Automatic discriminator', () => {
    const parsed = ResearchDestinationInputSchema.parse({
      destinationQuery: 'Morella, España',
      profiles: ['adventure', 'student'],
      idempotencyKey: 'research:morella:es:v1',
      actorId: id(1),
    })
    expect(parsed.language).toBe('es')
    expect(parsed).not.toHaveProperty('mode')
  })

  it('keeps research and editorial state transitions explicit', () => {
    expect(researchStateTransitions.researching).toContain('structuring')
    expect(researchStateTransitions.completed).toEqual([])
    expect(editorialDraftTransitions.in_review).toContain('changes_requested')
    expect(editorialDraftTransitions.ready).not.toContain('approved')
  })
})
