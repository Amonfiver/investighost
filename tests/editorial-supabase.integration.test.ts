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

    await client.from('editorial_research_requests').delete().eq('id', requestId)
    await client.from('geographic_entities').delete().eq('id', destinationId)
  })
})
