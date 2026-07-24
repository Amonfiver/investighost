import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SupabaseEditorialResearchRepository } from '@modules/editorial-pipeline/supabase-repository'
import { createLocalSupabaseClientFromEnv } from '@services/supabase'
import { buildEditorialFixture } from './support/editorial-fixture'

const integration = process.env.RUN_SUPABASE_INTEGRATION === 'true' ? describe : describe.skip

function syntheticUuid(prefix: string, index: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

integration('Supabase local editorial repository', () => {
  it('persists, reloads and cleans a complete synthetic aggregate', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const repository = new SupabaseEditorialResearchRepository(client)
    const requestId = randomUUID()
    const destinationId = randomUUID()
    const fixture = buildEditorialFixture({
      requestId,
      destinationId,
      runId: randomUUID(),
      idempotencyKey: `integration:${requestId}`,
    })

    await repository.save(fixture)
    const restored = await repository.findByIdempotencyKey(fixture.request.idempotencyKey)
    expect(restored).toEqual(fixture)

    const regenerated = structuredClone(fixture)
    const previousDraftId = regenerated.drafts[0].draft.id
    const nextDraftId = randomUUID()
    regenerated.request.version = 2
    regenerated.request.updatedAt = new Date('2026-07-21T09:01:00.000Z')
    regenerated.drafts[0].draft = {
      ...regenerated.drafts[0].draft,
      id: nextDraftId,
      previousDraftId,
      regenerationReason: 'Synthetic integration regeneration',
      contentVersion: 2,
      version: 2,
      updatedAt: regenerated.request.updatedAt,
    }
    regenerated.drafts[0].sections = regenerated.drafts[0].sections.map((section, index) => ({
      ...section,
      id: randomUUID(),
      draftId: nextDraftId,
      content: index === 0 ? `${section.content} Regenerated.` : section.content,
      regenerationReason: index === 0 ? 'Synthetic integration regeneration' : undefined,
      version: index === 0 ? section.version + 1 : section.version,
      updatedAt: regenerated.request.updatedAt,
    }))
    await repository.save(regenerated)
    expect(await repository.getByRequestId(requestId)).toEqual(regenerated)
    const { data: draftHistory, error: historyError } = await client
      .from('editorial_drafts')
      .select('id,content_version,previous_draft_id')
      .eq('request_id', requestId)
      .order('content_version')
    expect(historyError).toBeNull()
    expect(draftHistory).toEqual([
      { id: previousDraftId, content_version: 1, previous_draft_id: null },
      { id: nextDraftId, content_version: 2, previous_draft_id: previousDraftId },
    ])

    const { error: requestCleanupError } = await client.from('editorial_research_requests').delete().eq('id', requestId)
    expect(requestCleanupError).toBeNull()
    const { error: destinationCleanupError } = await client.from('geographic_entities').delete().eq('id', destinationId)
    expect(destinationCleanupError).toBeNull()
  })

  it('paginates tied requests with the same stable cursor without mutating them', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const repository = new SupabaseEditorialResearchRepository(client)
    const updatedAt = new Date('2099-01-01T00:00:00.000Z')
    const fixtures = Array.from({ length: 3 }, (_, index) => {
      const fixture = buildEditorialFixture({
        requestId: syntheticUuid('9', index + 1),
        destinationId: syntheticUuid('a', index + 1),
        runId: syntheticUuid('b', index + 1),
        idempotencyKey: `library-supabase-pagination:${index + 1}`,
      })
      fixture.request.updatedAt = updatedAt
      fixture.run.updatedAt = updatedAt
      return fixture
    })
    const requestIds = fixtures.map(item => item.request.id)
    const destinationIds = fixtures.map(item => item.destination.id)

    try {
      for (const fixture of fixtures) {
        await repository.saveScaffold({
          request: fixture.request,
          run: fixture.run,
          destination: fixture.destination,
        })
      }

      const first = await repository.list({ pageSize: 2 })
      const second = await repository.list({ pageSize: 2, cursor: first.nextCursor })
      expect(first.items.map(item => item.requestId)).toEqual([
        fixtures[2].request.id,
        fixtures[1].request.id,
      ])
      expect(second.items[0].requestId).toBe(fixtures[0].request.id)

      const { data, error } = await client.from('editorial_research_requests')
        .select('id,updated_at').in('id', requestIds).order('id')
      expect(error).toBeNull()
      expect(data?.map(row => row.id)).toEqual([...requestIds].sort())
      expect(data?.every(row => new Date(row.updated_at).getTime() === updatedAt.getTime())).toBe(true)
    } finally {
      const { error: requestsError } = await client.from('editorial_research_requests').delete().in('id', requestIds)
      expect(requestsError).toBeNull()
      const { error: destinationsError } = await client.from('geographic_entities').delete().in('id', destinationIds)
      expect(destinationsError).toBeNull()
    }
  })
})
