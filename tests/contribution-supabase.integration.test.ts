import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createLocalSupabaseClientFromEnv } from '@services/supabase'
import { SupabaseContributionRepository } from '@modules/contributions/supabase-repository'

const integration = process.env.RUN_SUPABASE_INTEGRATION === 'true' ? describe : describe.skip
integration('Supabase local contribution repository', () => {
  it('persists and reads a synthetic job without SQLite fallback', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const repository = new SupabaseContributionRepository(client)
    const batchId = randomUUID(), jobId = randomUUID(), remoteId = `synthetic-integration-${randomUUID()}`
    await repository.createBatch({ id: batchId, status: 'running', foundCount: 1, createdAt: new Date() })
    const job = await repository.upsertJob({ id: jobId, batchId, remoteId, sourceType: 'suggestion', status: 'pending', attemptCount: 0, idempotencyKey: `synthetic:${remoteId}:v1`, version: 1, createdAt: new Date(), updatedAt: new Date() })
    expect((await repository.getJob(job.id))?.remoteId).toBe(remoteId)
    const payload = JSON.stringify({ content: 'synthetic integration contribution' })
    await repository.persistVerifiedContribution({ id: randomUUID(), jobId, remote: { remoteId, sourceType: 'suggestion', remoteCreatedAt: new Date(), content: 'synthetic integration contribution', metadata: {}, payloadSize: Buffer.byteLength(payload), payloadSha256: 'a'.repeat(64), files: [], version: 1 }, normalizedPayload: payload, files: [], importedAt: new Date() })
    const { count } = await client.from('imported_contributions').select('*', { count: 'exact', head: true }).eq('remote_id', remoteId)
    expect(count).toBe(1)
    await client.from('imported_contributions').delete().eq('remote_id', remoteId)
    await client.from('contribution_import_jobs').delete().eq('id', jobId)
    await client.from('import_batches').delete().eq('id', batchId)
  })
})
