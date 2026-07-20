import { describe, expect, it } from 'vitest'
import {
  EditorialGenerationService,
  editorialPromptSpecs,
  type EditorialGenerationInput,
  type EditorialGenerationProvider,
} from '@modules/editorial-pipeline/editorial-generation'
import { MockEditorialGenerationProvider } from '@modules/editorial-pipeline/mock-editorial-provider'
import {
  ResearchActivitySchema,
  ResearchFactSchema,
  ResearchPlaceSchema,
  type ResearchFact,
} from '@shared/editorial-contracts'
import { buildEditorialFixture } from './support/editorial-fixture'

const id = (value: number): string => `b0000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const now = new Date('2026-07-21T12:00:00.000Z')
const sourceOne = id(1)
const sourceTwo = id(2)

function fact(value: number, category: ResearchFact['category'], statement: string, sourceIds = [sourceOne]) {
  return ResearchFactSchema.parse({
    id: id(10 + value),
    requestId: id(80),
    destinationId: id(70),
    statement,
    category,
    sourceIds,
    confidence: 0.85,
    contradiction: 'none',
    volatility: category === 'cost' || category === 'service' ? 'volatile' : 'stable',
    reviewStatus: 'verified',
    version: 1,
    createdAt: now,
    updatedAt: now,
  })
}

function generationInput(profiles: EditorialGenerationInput['profiles'] = ['adventure', 'student']): EditorialGenerationInput {
  const fixture = buildEditorialFixture({ requestId: id(80), runId: id(90), destinationId: id(70) })
  const facts = [
    fact(1, 'history', 'Morella conserva un recinto amurallado medieval.', [sourceOne, sourceTwo]),
    fact(2, 'geography', 'El casco histórico se sitúa sobre una elevación.', [sourceOne]),
    fact(3, 'safety', 'Algunos tramos presentan pendiente y pavimento irregular.', [sourceTwo]),
    fact(4, 'cost', 'Los precios y horarios deben confirmarse antes de la visita.', [sourceTwo]),
    fact(5, 'service', 'Los servicios disponibles varían según horario y temporada.', [sourceTwo]),
    fact(6, 'logistics', 'El recorrido a pie requiere planificar accesos y descansos.', [sourceOne]),
  ]
  const place = ResearchPlaceSchema.parse({
    id: id(30),
    requestId: fixture.request.id,
    destinationId: fixture.destination.id,
    name: 'Recinto amurallado',
    category: 'monument',
    position: 0,
    factIds: [facts[0].id, facts[1].id],
    sourceIds: [sourceOne, sourceTwo],
    profileRelevance: { adventure: 0.95, student: 0.7 },
    status: 'accepted',
    version: 1,
    createdAt: now,
    updatedAt: now,
  })
  const activity = ResearchActivitySchema.parse({
    id: id(40),
    requestId: fixture.request.id,
    destinationId: fixture.destination.id,
    name: 'Recorrido a pie por las murallas',
    audienceProfiles: ['adventure', 'student'],
    durationMinutes: 90,
    costBand: 'unknown',
    requirements: ['Calzado cómodo'],
    accessibility: ['Consultar tramos accesibles'],
    riskNotes: ['Pendiente y pavimento irregular'],
    factIds: [facts[1].id, facts[2].id],
    sourceIds: [sourceOne, sourceTwo],
    version: 1,
    createdAt: now,
    updatedAt: now,
  })
  return {
    requestId: fixture.request.id,
    runId: fixture.run.id,
    actorId: fixture.request.actorId,
    destinationName: 'Morella',
    language: 'es',
    facts,
    places: [place],
    activities: [activity],
    profiles,
  }
}

function createService(provider: EditorialGenerationProvider = new MockEditorialGenerationProvider()) {
  return new EditorialGenerationService(provider, {
    fullDraftCost: 0.2,
    sectionRegenerationCost: 0.05,
    budgetLimit: 1,
    currency: 'EUR',
  }, { now: () => now })
}

describe('differentiated editorial generation', () => {
  it('generates structurally distinct Adventure and Student profiles', async () => {
    const result = await createService().generate(generationInput())
    const adventure = result.drafts.find(bundle => bundle.draft.profile === 'adventure')
    const student = result.drafts.find(bundle => bundle.draft.profile === 'student')
    expect(adventure?.sections.map(section => section.kind)).toEqual(editorialPromptSpecs.adventure.requiredSections)
    expect(student?.sections.map(section => section.kind)).toEqual(editorialPromptSpecs.student.requiredSections)
    expect(adventure?.sections.some(section => section.kind === 'route')).toBe(true)
    expect(student?.sections.some(section => section.kind === 'budget')).toBe(true)
    expect(student?.sections.some(section => section.kind === 'study')).toBe(true)
    expect(result.actualCost).toBe(0.4)
    expect(result.simulation).toBe(true)
  })

  it('keeps fact and source traceability in every section', async () => {
    const input = generationInput()
    const result = await createService().generate(input)
    const facts = new Map(input.facts.map(item => [item.id, item]))
    for (const section of result.drafts.flatMap(bundle => bundle.sections)) {
      expect(section.factIds.length).toBeGreaterThan(0)
      expect(section.sourceIds.length).toBeGreaterThan(0)
      const allowedSources = new Set(section.factIds.flatMap(factId => facts.get(factId)?.sourceIds ?? []))
      expect(section.sourceIds.every(sourceId => allowedSources.has(sourceId))).toBe(true)
    }
  })

  it('uses stable draft and section identifiers for equal inputs', async () => {
    const first = await createService().generate(generationInput())
    const second = await createService().generate(generationInput())
    expect(first.drafts.map(bundle => bundle.draft.id)).toEqual(second.drafts.map(bundle => bundle.draft.id))
    expect(first.drafts.flatMap(bundle => bundle.sections.map(section => section.id)))
      .toEqual(second.drafts.flatMap(bundle => bundle.sections.map(section => section.id)))
  })

  it('rejects short or forbidden provider output', async () => {
    const mock = new MockEditorialGenerationProvider()
    const provider: EditorialGenerationProvider = {
      id: mock.id,
      model: mock.model,
      simulation: true,
      generate: async input => {
        const proposal = await mock.generate(input)
        proposal.sections[0].content = 'Como modelo de IA.'
        return proposal
      },
      regenerateSection: input => mock.regenerateSection(input),
    }
    await expect(createService(provider).generate(generationInput(['adventure'])))
      .rejects.toMatchObject({ code: 'INVALID_PROPOSAL' })
  })

  it('rejects a section that cites a fact outside the structured input', async () => {
    const mock = new MockEditorialGenerationProvider()
    const provider: EditorialGenerationProvider = {
      id: mock.id,
      model: mock.model,
      simulation: true,
      generate: async input => {
        const proposal = await mock.generate(input)
        proposal.sections[0].factIds = [id(999)]
        return proposal
      },
      regenerateSection: input => mock.regenerateSection(input),
    }
    await expect(createService(provider).generate(generationInput(['student'])))
      .rejects.toMatchObject({ code: 'MISSING_TRACEABILITY' })
  })

  it('regenerates one section as a linked version without mutating history', async () => {
    const service = createService()
    const input = generationInput(['adventure'])
    const generated = await service.generate(input)
    const current = structuredClone(generated.drafts[0])
    const before = structuredClone(current)
    const route = current.sections.find(section => section.kind === 'route')
    if (!route) throw new Error('missing route section')
    const regenerated = await service.regenerateSection({
      ...input,
      current,
      sectionId: route.id,
      reason: 'Aclarar esfuerzo y preparación',
    })
    const next = regenerated.drafts[0]
    expect(current).toEqual(before)
    expect(regenerated.history).toEqual([before])
    expect(next.draft.contentVersion).toBe(2)
    expect(next.draft.previousDraftId).toBe(before.draft.id)
    expect(next.draft.regenerationReason).toBe('Aclarar esfuerzo y preparación')
    const nextRoute = next.sections.find(section => section.kind === 'route')
    expect(nextRoute?.content).not.toBe(route.content)
    expect(nextRoute?.version).toBe(2)
    for (const oldSection of before.sections.filter(section => section.kind !== 'route')) {
      expect(next.sections.find(section => section.kind === oldSection.kind)?.content).toBe(oldSection.content)
    }
    expect(regenerated.usage[0].cause).toBe('adventure:section:route')
  })

  it('blocks generation before exceeding budget', async () => {
    const service = new EditorialGenerationService(new MockEditorialGenerationProvider(), {
      fullDraftCost: 0.6,
      budgetLimit: 1,
      currency: 'EUR',
    })
    await expect(service.generate(generationInput())).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' })
  })

  it('honors cancellation before invoking the provider', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(createService().generate({ ...generationInput(['student']), signal: controller.signal }))
      .rejects.toMatchObject({ code: 'CANCELLED' })
  })
})
