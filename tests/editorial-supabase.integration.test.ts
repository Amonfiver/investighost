import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SupabaseEditorialResearchRepository } from '@modules/editorial-pipeline/supabase-repository'
import { createLocalSupabaseClientFromEnv } from '@services/supabase'
import { buildEditorialFixture } from './support/editorial-fixture'

const integration = process.env.RUN_SUPABASE_INTEGRATION === 'true' ? describe : describe.skip

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
})
