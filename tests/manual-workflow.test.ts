import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { GeographicEntitySchema } from '@shared/editorial-contracts'
import { GeographicResolver, MemoryGeographyCatalogRepository, type GeographicCatalogEntry } from '@modules/editorial-pipeline/geography'
import { ManualResearchService } from '@modules/editorial-pipeline/manual-workflow'
import { MemoryEditorialResearchRepository } from '@modules/editorial-pipeline/memory-repository'

const actorId = '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
const now = new Date('2026-07-21T14:00:00.000Z')

function catalog(): GeographicCatalogEntry[] {
  const country = GeographicEntitySchema.parse({
    id: '70000000-0000-4000-8000-000000000001',
    type: 'country',
    name: 'España',
    normalizedName: 'espana',
    aliases: ['España', 'Spain'],
    countryCode: 'ES',
    slug: 'espana',
    sourceName: 'GeoNames',
    sourceVersion: 'geonames-2026-07-20',
    sourceLicense: 'Creative Commons Attribution 4.0',
    status: 'active',
    resolutionMethod: 'exact',
    ambiguityCandidateIds: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  })
  const region = GeographicEntitySchema.parse({
    ...country,
    id: '70000000-0000-4000-8000-000000000002',
    parentId: country.id,
    type: 'region',
    name: 'Comunitat Valenciana',
    normalizedName: 'comunitat valenciana',
    aliases: ['Valencia'],
    regionCode: '60',
    slug: 'comunitat-valenciana',
  })
  const morella = GeographicEntitySchema.parse({
    ...region,
    id: '70000000-0000-4000-8000-000000000003',
    parentId: region.id,
    type: 'locality',
    name: 'Morella',
    normalizedName: 'morella',
    aliases: ['Morella', 'Morella, España'],
    slug: 'morella',
    externalIds: { geonames: '3116121' },
  })
  const node = (entity: typeof country) => ({
    id: entity.id,
    type: entity.type,
    name: entity.name,
    normalizedName: entity.normalizedName,
    countryCode: entity.countryCode,
    regionCode: entity.regionCode,
  })
  return [
    { entity: country, hierarchy: [] },
    { entity: region, hierarchy: [node(country)] },
    { entity: morella, hierarchy: [node(country), node(region)] },
  ]
}

function setup() {
  const repository = new MemoryEditorialResearchRepository()
  const service = new ManualResearchService(
    repository,
    new GeographicResolver(new MemoryGeographyCatalogRepository(catalog()), 'geonames-2026-07-20'),
    { now: () => now, id: randomUUID, ownerProcess: 'manual-test' },
  )
  return { repository, service }
}

function input(idempotencyKey = randomUUID()) {
  return {
    destinationQuery: 'Morella',
    countryCode: 'ES',
    destinationType: 'locality' as const,
    profiles: ['adventure', 'student'] as const,
    language: 'es',
    depth: 'standard' as const,
    notes: 'Ejecución Manual sintética',
    budgetLimit: 2,
    maxAttempts: 3,
    idempotencyKey,
    actorId,
  }
}

describe('canonical Manual workflow', () => {
  it('runs resolution, sources, facts, differentiated drafts and RevisIAtor through one durable aggregate', async () => {
    const { repository, service } = setup()
    const result = await service.start(input())

    expect(result.request.state).toBe('completed')
    expect(result.run.stage).toBe('human_review')
    expect(result.drafts.map(item => item.draft.profile)).toEqual(['adventure', 'student'])
    expect(result.drafts.every(item => item.draft.state === 'ready')).toBe(true)
    expect(result.sources).toHaveLength(2)
    expect(result.facts.length).toBeGreaterThanOrEqual(7)
    expect(result.places).toHaveLength(2)
    expect(result.activities).toHaveLength(2)
    expect(result.qualityChecks).toHaveLength(34)
    expect(result.qualityReviews.every(item => ['passed', 'passed_with_warnings'].includes(item.outcome))).toBe(true)
    expect(result.run.actualCost).toBeGreaterThan(0)
    expect(await repository.getByRequestId(result.request.id)).not.toBeNull()
  })

  it('returns the existing aggregate for the same completed idempotency key', async () => {
    const { service } = setup()
    const key = randomUUID()
    const first = await service.start(input(key))
    const second = await service.start(input(key))
    expect(second.request.id).toBe(first.request.id)
    expect(second.run.id).toBe(first.run.id)
  })

  it('creates an immutable human-edited version and keeps version history', async () => {
    const { service } = setup()
    const initial = await service.start(input())
    const adventure = initial.drafts.find(item => item.draft.profile === 'adventure')
    if (!adventure) throw new Error('missing adventure draft')
    const practical = adventure.sections.find(section => section.kind === 'practical')
    if (!practical) throw new Error('missing practical section')

    const edited = await service.editSection({
      requestId: initial.request.id,
      draftId: adventure.draft.id,
      sectionId: practical.id,
      heading: 'Logística comprobada antes de salir',
      content: `${practical.content} La persona editora debe confirmar horarios y accesibilidad antes de cerrar esta versión.`,
      reason: 'Hacer explícita la comprobación humana',
      actorId,
    })
    const next = edited.drafts.find(item => item.draft.profile === 'adventure')
    expect(next?.draft.previousDraftId).toBe(adventure.draft.id)
    expect(next?.draft.contentVersion).toBe(2)
    expect(next?.draft.humanEdited).toBe(true)
    const versions = await service.listDraftVersions(initial.request.id)
    expect(versions.filter(item => item.profile === 'adventure').map(item => item.contentVersion)).toEqual([2, 1])
  })

  it('regenerates one section as one costed and auditable version', async () => {
    const { repository, service } = setup()
    const initial = await service.start(input())
    const adventure = initial.drafts.find(item => item.draft.profile === 'adventure')
    const route = adventure?.sections.find(section => section.kind === 'route')
    if (!adventure || !route) throw new Error('missing adventure route')

    const regenerated = await service.regenerateSection({
      requestId: initial.request.id,
      draftId: adventure.draft.id,
      sectionId: route.id,
      reason: 'Aclarar preparación y dificultad',
      actorId,
    })
    const next = regenerated.drafts.find(item => item.draft.profile === 'adventure')
    expect(next?.draft.contentVersion).toBe(2)
    expect(next?.sections.find(section => section.kind === 'route')?.heading).toContain('versión revisada')
    expect(next?.sections.find(section => section.kind === 'route')?.content).toContain('revisión parcial')
    expect(regenerated.run.actualCost).toBeCloseTo((initial.run.actualCost ?? 0) + 0.02)
    expect((await repository.getExecutionControl(initial.request.id))?.spentCost).toBeCloseTo((initial.run.actualCost ?? 0) + 0.02)
    expect(regenerated.usage).toHaveLength(initial.usage.length + 1)
    expect(regenerated.events.at(-1)?.type).toBe('manual.section.regenerated')
  })

  it('requires explicit human review before approval and never publishes', async () => {
    const { service } = setup()
    const initial = await service.start(input())
    const draft = initial.drafts[0].draft
    await expect(service.decide({
      requestId: initial.request.id,
      draftId: draft.id,
      actorId,
      decision: 'approved',
      comment: 'Intento fuera de estado',
    })).rejects.toMatchObject({ code: 'INVALID_STATE' })

    const reviewing = await service.submitForReview({ requestId: initial.request.id, draftId: draft.id, actorId })
    expect(reviewing.drafts[0].draft.state).toBe('in_review')
    const approved = await service.decide({
      requestId: initial.request.id,
      draftId: draft.id,
      actorId,
      decision: 'approved',
      comment: 'Contenido Manual revisado y aceptado',
    })
    expect(approved.drafts[0].draft.state).toBe('approved')
    expect(approved.events.at(-1)?.type).toBe('manual.review.approved')
    expect(approved.drafts.some(item => (item.draft.state as string) === 'published')).toBe(false)
    expect(approved.events.some(event => event.type.startsWith('publishing.') || event.type.includes('.published'))).toBe(false)
  })
})
