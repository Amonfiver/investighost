import { describe, expect, it } from 'vitest'
import {
  FactualStructuringService,
  type FactualProposal,
} from '@modules/editorial-pipeline/factual-structuring'
import { MemoryEditorialResearchRepository } from '@modules/editorial-pipeline/memory-repository'
import { MockFactualStructuringProvider, type MockFactualSeed } from '@modules/editorial-pipeline/mock-factual-provider'
import type { EvaluatedSourceDocument } from '@modules/editorial-pipeline/source-providers'
import { ResearchSourceSchema } from '@shared/editorial-contracts'
import { buildEditorialFixture } from './support/editorial-fixture'

const id = (value: number): string => `a0000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const now = new Date('2026-07-21T11:00:00.000Z')

function document(value: number, url: string, reliability = 0.9): EvaluatedSourceDocument {
  const source = ResearchSourceSchema.parse({
    id: id(value),
    runId: id(90),
    url,
    normalizedUrl: url,
    title: `Fuente factual ${value}`,
    publisher: 'Investighost fixtures',
    query: 'Morella factual',
    sourceType: value === 1 ? 'official' : 'tourism',
    territorialScope: 'destination',
    freshness: 'current',
    reliability,
    status: 'accepted',
    fingerprint: String(value).repeat(64).slice(0, 64),
    metadata: { simulation: true },
    capturedAt: now,
  })
  return {
    source,
    content: `Contenido estructurable de la fuente ${value}`,
    evaluation: {
      accepted: true,
      sourceType: source.sourceType,
      territorialScope: source.territorialScope,
      freshness: source.freshness,
      reliability,
      reason: 'Fixture aceptado',
    },
  }
}

const proposalOne: FactualProposal = {
  facts: [
    {
      canonicalKey: 'history.walls',
      value: 'medieval enclosure',
      statement: 'Morella conserva un recinto amurallado medieval',
      category: 'history',
      confidence: 0.95,
      volatility: 'stable',
    },
    {
      canonicalKey: 'access.price',
      value: 'free',
      statement: 'El acceso al recorrido exterior es gratuito',
      category: 'cost',
      confidence: 0.8,
      volatility: 'volatile',
    },
  ],
  places: [{
    canonicalKey: 'walls',
    name: 'Recinto amurallado',
    category: 'monument',
    factKeys: ['history.walls'],
    profileRelevance: { adventure: 0.9, student: 0.6 },
  }],
  activities: [{
    canonicalKey: 'wall-route',
    name: 'Recorrido por las murallas',
    audienceProfiles: ['adventure'],
    durationMinutes: 90,
    costBand: 'free',
    requirements: ['Calzado cómodo'],
    accessibility: ['Tramos con desnivel'],
    riskNotes: ['Evitar las horas de más calor'],
    factKeys: ['history.walls'],
  }],
}

const proposalTwo: FactualProposal = {
  facts: [
    {
      canonicalKey: 'history.walls',
      value: 'medieval enclosure',
      statement: 'El casco histórico mantiene una muralla medieval',
      category: 'history',
      confidence: 0.85,
      volatility: 'stable',
    },
    {
      canonicalKey: 'access.price',
      value: 'paid',
      statement: 'El acceso al recorrido exterior requiere entrada',
      category: 'cost',
      confidence: 0.7,
      volatility: 'volatile',
    },
  ],
  places: [{
    canonicalKey: 'historic-walls',
    name: 'Recinto amurallado',
    category: 'monument',
    factKeys: ['history.walls'],
    profileRelevance: { adventure: 0.8, student: 0.8 },
  }],
  activities: [{
    canonicalKey: 'walk-walls',
    name: 'Recorrido por las murallas',
    audienceProfiles: ['student'],
    durationMinutes: 90,
    costBand: 'unknown',
    requirements: ['Agua'],
    accessibility: ['Consultar tramos accesibles'],
    riskNotes: ['Pavimento irregular'],
    factKeys: ['history.walls', 'access.price'],
  }],
}

function createInput(documents: EvaluatedSourceDocument[]) {
  const fixture = buildEditorialFixture({ requestId: id(80), runId: id(90), destinationId: id(70) })
  return {
    requestId: fixture.request.id,
    runId: fixture.run.id,
    destinationId: fixture.destination.id,
    language: 'es',
    attempt: 1,
    documents,
  }
}

function seeds(secondFail = false): MockFactualSeed[] {
  return [
    { sourceUrl: 'https://fixtures.investighost.local/morella/one', proposal: proposalOne },
    { sourceUrl: 'https://fixtures.investighost.local/morella/two', proposal: proposalTwo, fail: secondFail },
  ]
}

describe('factual structuring', () => {
  it('normalizes facts and preserves complete source traceability', async () => {
    const documents = [
      document(1, 'https://fixtures.investighost.local/morella/one'),
      document(2, 'https://fixtures.investighost.local/morella/two'),
    ]
    const result = await new FactualStructuringService(
      new MockFactualStructuringProvider(seeds()),
      new MemoryEditorialResearchRepository(),
      () => now,
    ).structure(createInput(documents))
    expect(result.facts).toHaveLength(3)
    const wallFact = result.facts.find(fact => fact.category === 'history')
    expect(wallFact?.sourceIds).toEqual([id(1), id(2)])
    expect(wallFact?.statement.endsWith('.')).toBe(true)
    expect(result.places[0].factIds).toContain(wallFact?.id)
    expect(result.places[0].sourceIds).toEqual([id(1), id(2)])
    expect(result.activities[0].audienceProfiles.sort()).toEqual(['adventure', 'student'])
  })

  it('marks contradictory values as disputed instead of choosing one', async () => {
    const result = await new FactualStructuringService(
      new MockFactualStructuringProvider(seeds()),
      new MemoryEditorialResearchRepository(),
      () => now,
    ).structure(createInput([
      document(1, 'https://fixtures.investighost.local/morella/one'),
      document(2, 'https://fixtures.investighost.local/morella/two'),
    ]))
    const costFacts = result.facts.filter(fact => fact.category === 'cost')
    expect(costFacts).toHaveLength(2)
    expect(costFacts.every(fact => fact.contradiction === 'confirmed' && fact.reviewStatus === 'disputed')).toBe(true)
  })

  it('produces stable identifiers for the same input', async () => {
    const documents = [document(1, 'https://fixtures.investighost.local/morella/one')]
    const run = async () => new FactualStructuringService(
      new MockFactualStructuringProvider(seeds()),
      new MemoryEditorialResearchRepository(),
      () => now,
    ).structure(createInput(documents))
    expect((await run()).facts.map(fact => fact.id)).toEqual((await run()).facts.map(fact => fact.id))
  })

  it('writes one validated checkpoint after each processed source', async () => {
    const repository = new MemoryEditorialResearchRepository()
    const input = createInput([
      document(1, 'https://fixtures.investighost.local/morella/one'),
      document(2, 'https://fixtures.investighost.local/morella/two'),
    ])
    const result = await new FactualStructuringService(new MockFactualStructuringProvider(seeds()), repository, () => now).structure(input)
    const checkpoint = await repository.getLatestCheckpoint(input.requestId)
    expect(result.checkpointsSaved).toBe(2)
    expect(checkpoint).toMatchObject({ stage: 'fact_structuring', attempt: 1 })
    expect(checkpoint?.snapshot).toMatchObject({ nextSourceIndex: 2, processedSourceIds: [id(1), id(2)] })
  })

  it('resumes after a provider failure without processing the first source again', async () => {
    const repository = new MemoryEditorialResearchRepository()
    const documents = [
      document(1, 'https://fixtures.investighost.local/morella/one'),
      document(2, 'https://fixtures.investighost.local/morella/two'),
    ]
    const input = createInput(documents)
    const failingProvider = new MockFactualStructuringProvider(seeds(true))
    await expect(new FactualStructuringService(failingProvider, repository, () => now).structure(input))
      .rejects.toMatchObject({ code: 'INVALID_PROPOSAL' })
    expect(failingProvider.calls).toHaveLength(2)

    const resumedProvider = new MockFactualStructuringProvider(seeds())
    const result = await new FactualStructuringService(resumedProvider, repository, () => now).structure(input)
    expect(result.resumedFromCheckpoint).toBe(true)
    expect(result.processedSourceIds).toEqual([id(1), id(2)])
    expect(resumedProvider.calls).toEqual(['https://fixtures.investighost.local/morella/two'])
  })

  it('rejects a checkpoint when the source order changes', async () => {
    const repository = new MemoryEditorialResearchRepository()
    const first = document(1, 'https://fixtures.investighost.local/morella/one')
    const second = document(2, 'https://fixtures.investighost.local/morella/two')
    await expect(new FactualStructuringService(
      new MockFactualStructuringProvider(seeds(true)),
      repository,
      () => now,
    ).structure(createInput([first, second]))).rejects.toMatchObject({ code: 'INVALID_PROPOSAL' })
    await expect(new FactualStructuringService(
      new MockFactualStructuringProvider(seeds()),
      repository,
      () => now,
    ).structure(createInput([second, first]))).rejects.toMatchObject({ code: 'CHECKPOINT_MISMATCH' })
  })

  it('rejects places that reference facts absent from structured evidence', async () => {
    const invalid: FactualProposal = {
      ...proposalOne,
      places: [{ ...proposalOne.places[0], factKeys: ['missing.fact'] }],
    }
    await expect(new FactualStructuringService(
      new MockFactualStructuringProvider([{ sourceUrl: 'https://fixtures.investighost.local/morella/one', proposal: invalid }]),
      new MemoryEditorialResearchRepository(),
      () => now,
    ).structure(createInput([document(1, 'https://fixtures.investighost.local/morella/one')]))).rejects.toMatchObject({ code: 'MISSING_FACT_REFERENCE' })
  })

  it('requires at least one accepted readable source and supports cancellation', async () => {
    const unavailable = document(1, 'https://fixtures.investighost.local/morella/one')
    unavailable.source.status = 'unavailable'
    const repository = new MemoryEditorialResearchRepository()
    await expect(new FactualStructuringService(new MockFactualStructuringProvider(seeds()), repository).structure(createInput([unavailable])))
      .rejects.toMatchObject({ code: 'NO_ACCEPTED_SOURCES' })

    const controller = new AbortController()
    controller.abort()
    await expect(new FactualStructuringService(new MockFactualStructuringProvider(seeds()), repository).structure({
      ...createInput([document(1, 'https://fixtures.investighost.local/morella/one')]),
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'CANCELLED' })
  })
})
