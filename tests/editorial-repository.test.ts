import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MemoryEditorialResearchRepository } from '@modules/editorial-pipeline/memory-repository'
import { EditorialRepositoryError } from '@modules/editorial-pipeline/repository'
import { buildEditorialFixture } from './support/editorial-fixture'

describe('editorial repository contract', () => {
  it('persists, retrieves and lists a canonical result', async () => {
    const repository = new MemoryEditorialResearchRepository()
    const fixture = buildEditorialFixture()
    await repository.save(fixture)

    expect(await repository.getByRequestId(fixture.request.id)).toEqual(fixture)
    expect((await repository.list())[0]).toMatchObject({
      requestId: fixture.request.id,
      destinationQuery: 'Testland',
      state: 'completed',
    })
  })

  it('returns the same durable result for an idempotency key', async () => {
    const repository = new MemoryEditorialResearchRepository()
    const fixture = buildEditorialFixture({ idempotencyKey: 'stable:testland:v1' })
    await repository.save(fixture)
    await repository.save(structuredClone(fixture))

    expect((await repository.findByIdempotencyKey('stable:testland:v1'))?.request.id).toBe(fixture.request.id)
    expect(await repository.list()).toHaveLength(1)
  })

  it('rejects an idempotency key assigned to a different request', async () => {
    const repository = new MemoryEditorialResearchRepository()
    await repository.save(buildEditorialFixture({ idempotencyKey: 'collision:v1' }))
    const conflicting = buildEditorialFixture({
      requestId: randomUUID(),
      runId: randomUUID(),
      destinationId: randomUUID(),
      idempotencyKey: 'collision:v1',
    })

    await expect(repository.save(conflicting)).rejects.toMatchObject<Partial<EditorialRepositoryError>>({
      code: 'IDEMPOTENCY_CONFLICT',
    })
  })

  it('rejects stale optimistic versions', async () => {
    const repository = new MemoryEditorialResearchRepository()
    const current = buildEditorialFixture({ requestVersion: 2 })
    await repository.save(current)
    const stale = buildEditorialFixture({ requestVersion: 1 })

    await expect(repository.save(stale)).rejects.toMatchObject<Partial<EditorialRepositoryError>>({
      code: 'VERSION_CONFLICT',
    })
  })

  it('stores checkpoints and enforces a single active execution lock', async () => {
    const repository = new MemoryEditorialResearchRepository()
    const fixture = buildEditorialFixture()
    const checkpoint = {
      id: randomUUID(),
      requestId: fixture.request.id,
      runId: fixture.run.id,
      stage: 'source_discovery' as const,
      attempt: 1,
      snapshot: { sources: 1 },
      snapshotHash: 'a'.repeat(64),
      createdAt: new Date(),
    }
    await repository.saveCheckpoint(checkpoint)
    expect(await repository.getLatestCheckpoint(fixture.request.id)).toEqual(checkpoint)

    const firstToken = randomUUID()
    expect(await repository.acquireExecutionLock(fixture.request.id, firstToken, new Date(Date.now() + 60_000), 'test-1')).toBe(true)
    expect(await repository.acquireExecutionLock(fixture.request.id, randomUUID(), new Date(Date.now() + 60_000), 'test-2')).toBe(false)
    expect(await repository.releaseExecutionLock(fixture.request.id, firstToken)).toBe(true)
  })
})
