import { createHash } from 'node:crypto'
import type { ResearchDestinationResult } from '@shared/editorial-contracts'

const id = (value: number): string => `80000000-0000-4000-8000-${String(value).padStart(12, '0')}`

export function buildEditorialFixture(overrides: {
  requestId?: string
  destinationId?: string
  runId?: string
  idempotencyKey?: string
  requestVersion?: number
} = {}): ResearchDestinationResult {
  const now = new Date('2026-07-21T09:00:00.000Z')
  const actorId = id(1)
  const destinationId = overrides.destinationId ?? id(2)
  const requestId = overrides.requestId ?? id(3)
  const runId = overrides.runId ?? id(4)
  const sourceId = id(5)
  const factId = id(6)
  const draftId = id(7)
  const sectionId = id(8)
  const eventId = id(9)
  const url = 'https://fixtures.investighost.local/testland/overview'

  return {
    request: {
      id: requestId,
      destinationId,
      destinationQuerySnapshot: 'Testland',
      profiles: ['adventure'],
      language: 'es',
      depth: 'standard',
      options: { synthetic: true },
      configurationVersion: 'fixture-v1',
      idempotencyKey: overrides.idempotencyKey ?? `fixture:${requestId}`,
      actorId,
      state: 'completed',
      version: overrides.requestVersion ?? 1,
      createdAt: now,
      updatedAt: now,
    },
    run: {
      id: runId,
      requestId,
      stage: 'human_review',
      providerId: 'mock-editorial',
      model: 'deterministic-fixture-v1',
      promptVersion: 'adventure-v1',
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
    previousRuns: [],
    destination: {
      id: destinationId,
      type: 'country',
      name: 'Testland',
      normalizedName: 'testland',
      aliases: ['Testland'],
      countryCode: 'ZZ',
      slug: `testland-${destinationId.slice(-4)}`,
      sourceName: 'Investighost synthetic fixture',
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
      url,
      normalizedUrl: url,
      title: 'Testland representative source',
      publisher: 'Investighost fixtures',
      query: 'Testland overview',
      sourceType: 'official',
      territorialScope: 'destination',
      freshness: 'current',
      reliability: 0.9,
      status: 'accepted',
      fingerprint: createHash('sha256').update(`${requestId}:source`).digest('hex'),
      metadata: { synthetic: true },
      capturedAt: now,
    }],
    facts: [{
      id: factId,
      requestId,
      destinationId,
      statement: 'Testland is a synthetic destination used to validate the pipeline.',
      category: 'geography',
      sourceIds: [sourceId],
      confidence: 1,
      contradiction: 'none',
      volatility: 'stable',
      reviewStatus: 'verified',
      version: 1,
      createdAt: now,
      updatedAt: now,
    }],
    places: [],
    activities: [],
    drafts: [{
      draft: {
        id: draftId,
        requestId,
        runId,
        profile: 'adventure',
        title: 'Testland for an active visit',
        introduction: 'A synthetic editorial introduction for repository tests.',
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
        id: sectionId,
        draftId,
        kind: 'overview',
        heading: 'Synthetic overview',
        content: 'This content exists only to verify durable source-to-fact-to-text relations.',
        position: 0,
        factIds: [factId],
        sourceIds: [sourceId],
        promptVersion: 'adventure-v1',
        humanEdited: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      }],
    }],
    qualityReviews: [],
    qualityChecks: [],
    usage: [],
    events: [{
      id: eventId,
      requestId,
      runId,
      type: 'research.completed',
      stage: 'human_review',
      correlationId: overrides.idempotencyKey ?? `fixture:${requestId}`,
      payload: { synthetic: true },
      occurredAt: now,
    }],
  }
}
