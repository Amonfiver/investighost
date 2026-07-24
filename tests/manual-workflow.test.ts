import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { GeographicEntitySchema } from '@shared/editorial-contracts'
import { manualReviewHistory } from '@shared/manual-review-history'
import { GeographicResolver, MemoryGeographyCatalogRepository, type GeographicCatalogEntry } from '@modules/editorial-pipeline/geography'
import { ManualResearchService } from '@modules/editorial-pipeline/manual-workflow'
import { MemoryEditorialResearchRepository } from '@modules/editorial-pipeline/memory-repository'

const actorId = '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
const now = new Date()

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
    const library = await service.list()
    expect(library.items.map(item => item.requestId)).toContain(result.request.id)
    expect(await service.get(library.items[0].requestId)).not.toBeNull()
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

  it('reopens a rejected review durably without creating content, request, run or cost', async () => {
    const { repository, service } = setup()
    const initial = await service.start(input())
    const draft = initial.drafts[0].draft
    const initialDraftVersions = await repository.listDraftVersions(initial.request.id)
    const initialUsageIds = initial.usage.map(item => item.id)
    const initialCost = initial.run.actualCost

    const reviewing = await service.submitForReview({
      requestId: initial.request.id,
      draftId: draft.id,
      actorId,
    })
    const rejected = await service.decide({
      requestId: initial.request.id,
      draftId: draft.id,
      actorId,
      decision: 'rejected',
      comment: 'El enfoque de riesgos necesita una revisión humana adicional.',
    })

    const rejectionEvent = rejected.events.at(-1)
    expect(rejectionEvent).toMatchObject({
      requestId: initial.request.id,
      runId: initial.run.id,
      type: 'manual.review.rejected',
      actorId,
      payload: {
        draftId: draft.id,
        draftVersion: draft.contentVersion,
        actorId,
        fromState: 'in_review',
        toState: 'rejected',
        comment: 'El enfoque de riesgos necesita una revisión humana adicional.',
      },
    })
    expect(rejectionEvent?.occurredAt).toBeInstanceOf(Date)

    await expect(service.reopenReview({
      requestId: initial.request.id,
      draftId: draft.id,
      actorId,
      comment: '   ',
    })).rejects.toThrow()

    const reopened = await service.reopenReview({
      requestId: initial.request.id,
      draftId: draft.id,
      actorId,
      comment: 'Reabrir para reconsiderar el criterio aplicado por el equipo.',
    })
    const reopenedDraft = reopened.drafts.find(item => item.draft.id === draft.id)?.draft
    expect(reopenedDraft).toMatchObject({
      id: draft.id,
      requestId: initial.request.id,
      runId: initial.run.id,
      contentVersion: draft.contentVersion,
      state: 'in_review',
    })
    expect(reopened.request.id).toBe(initial.request.id)
    expect(reopened.run.id).toBe(initial.run.id)
    expect(reopened.run.actualCost).toBe(initialCost)
    expect(reopened.usage.map(item => item.id)).toEqual(initialUsageIds)
    expect(await repository.listRuns(initial.request.id)).toHaveLength(1)
    expect((await repository.list()).items.filter(item => item.requestId === initial.request.id)).toHaveLength(1)
    expect(reopened.events.at(-1)).toMatchObject({
      requestId: initial.request.id,
      runId: initial.run.id,
      type: 'manual.review.reopened',
      actorId,
      payload: {
        draftId: draft.id,
        draftVersion: draft.contentVersion,
        actorId,
        fromState: 'rejected',
        toState: 'in_review',
        comment: 'Reabrir para reconsiderar el criterio aplicado por el equipo.',
      },
    })

    const rejectedAgain = await service.decide({
      requestId: initial.request.id,
      draftId: draft.id,
      actorId,
      decision: 'rejected',
      comment: 'Rechazo confirmado tras la segunda revisión humana.',
    })
    const history = manualReviewHistory(rejectedAgain.events, draft)
    expect(history.map(entry => entry.action)).toEqual(['started', 'rejected', 'reopened', 'rejected'])
    expect(history.map(entry => entry.comment)).toEqual([
      undefined,
      'El enfoque de riesgos necesita una revisión humana adicional.',
      'Reabrir para reconsiderar el criterio aplicado por el equipo.',
      'Rechazo confirmado tras la segunda revisión humana.',
    ])
    expect(history.every(entry => (
      entry.requestId === initial.request.id
      && entry.runId === initial.run.id
      && entry.draftId === draft.id
      && entry.draftVersion === draft.contentVersion
      && entry.actorId === actorId
    ))).toBe(true)

    const persisted = await repository.getByRequestId(initial.request.id)
    const persistedDraftVersions = await repository.listDraftVersions(initial.request.id)
    expect(persisted?.drafts.find(item => item.draft.id === draft.id)?.draft.state).toBe('rejected')
    expect(persisted ? manualReviewHistory(persisted.events, draft).map(entry => entry.action) : []).toEqual([
      'started',
      'rejected',
      'reopened',
      'rejected',
    ])
    expect(persistedDraftVersions.map(item => [item.id, item.contentVersion])).toEqual(
      initialDraftVersions.map(item => [item.id, item.contentVersion]),
    )
    expect(rejectedAgain.events.some(event => event.type.startsWith('publishing.') || event.type.includes('.published'))).toBe(false)

    if (!rejectionEvent) throw new Error('missing rejection event')
    const legacyRejection = structuredClone(rejectionEvent)
    delete legacyRejection.payload.draftVersion
    legacyRejection.actorId = '7fda5d08-9cd0-4d9d-98c1-7ccbfd56ad22'
    expect(manualReviewHistory([legacyRejection], draft)[0]).toMatchObject({
      draftVersion: draft.contentVersion,
      actorId,
      comment: 'El enfoque de riesgos necesita una revisión humana adicional.',
    })

    expect(reviewing.drafts.find(item => item.draft.id === draft.id)?.draft.state).toBe('in_review')
  })

  it.each(['approved', 'changes_requested', 'rejected'] as const)(
    'allows a reopened review to finish as %s',
    async decision => {
      const { service } = setup()
      const initial = await service.start(input())
      const draft = initial.drafts[0].draft
      await service.submitForReview({ requestId: initial.request.id, draftId: draft.id, actorId })
      await service.decide({
        requestId: initial.request.id,
        draftId: draft.id,
        actorId,
        decision: 'rejected',
        comment: 'Primera decisión humana.',
      })
      const reopened = await service.reopenReview({
        requestId: initial.request.id,
        draftId: draft.id,
        actorId,
        comment: 'El supervisor solicita reconsiderar la decisión.',
      })
      expect(reopened.drafts.find(item => item.draft.id === draft.id)?.draft.state).toBe('in_review')

      const decided = await service.decide({
        requestId: initial.request.id,
        draftId: draft.id,
        actorId,
        decision,
        comment: `Decisión posterior a la reapertura: ${decision}.`,
      })
      expect(decided.drafts.find(item => item.draft.id === draft.id)?.draft.state).toBe(decision)
      expect(decided.events.at(-1)).toMatchObject({
        type: `manual.review.${decision}`,
        payload: {
          draftId: draft.id,
          draftVersion: draft.contentVersion,
          fromState: 'in_review',
          toState: decision,
          comment: `Decisión posterior a la reapertura: ${decision}.`,
        },
      })
    },
  )
})
