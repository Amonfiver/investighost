import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MemoryEditorialResearchRepository } from '@modules/editorial-pipeline/memory-repository'
import { EditorialRepositoryError } from '@modules/editorial-pipeline/repository'
import { buildEditorialFixture } from './support/editorial-fixture'

function syntheticUuid(prefix: string, index: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

describe('editorial repository contract', () => {
  it('persists, retrieves and lists a canonical result', async () => {
    const repository = new MemoryEditorialResearchRepository()
    const fixture = buildEditorialFixture()
    await repository.save(fixture)

    expect(await repository.getByRequestId(fixture.request.id)).toEqual(fixture)
    const page = await repository.list()
    expect(page.items[0]).toMatchObject({
      requestId: fixture.request.id,
      destinationQuery: 'Testland',
      state: 'completed',
      latestRunActualCost: 0,
    })
    expect(await repository.getByRequestId(page.items[0].requestId)).toEqual(fixture)
  })

  it('returns the same durable result for an idempotency key', async () => {
    const repository = new MemoryEditorialResearchRepository()
    const fixture = buildEditorialFixture({ idempotencyKey: 'stable:testland:v1' })
    await repository.save(fixture)
    await repository.save(structuredClone(fixture))

    expect((await repository.findByIdempotencyKey('stable:testland:v1'))?.request.id).toBe(fixture.request.id)
    expect((await repository.list()).items).toHaveLength(1)
  })

  it('returns an empty final page without a cursor', async () => {
    const repository = new MemoryEditorialResearchRepository()
    expect(await repository.list()).toEqual({
      items: [],
      hasMore: false,
    })
  })

  it('traverses more than 100 tied requests without duplicates, omissions or mutations', async () => {
    const repository = new MemoryEditorialResearchRepository()
    const tiedAt = new Date('2026-07-25T12:00:00.000Z')
    const fixtures = Array.from({ length: 137 }, (_, index) => {
      const fixture = buildEditorialFixture({
        requestId: syntheticUuid('9', index + 1),
        runId: syntheticUuid('a', index + 1),
        destinationId: syntheticUuid('b', index + 1),
        idempotencyKey: `library-pagination:${index + 1}`,
      })
      fixture.request.updatedAt = tiedAt
      return fixture
    })
    for (const fixture of fixtures) await repository.save(fixture)

    const protectedFixture = fixtures[50]
    const aggregateBefore = await repository.getByRequestId(protectedFixture.request.id)
    const runsBefore = await repository.listRuns(protectedFixture.request.id)
    const maximumPage = await repository.list({ pageSize: 100 })
    expect(maximumPage.items).toHaveLength(100)
    expect(maximumPage.hasMore).toBe(true)
    const seen: string[] = []
    let cursor: Awaited<ReturnType<typeof repository.list>>['nextCursor']
    let pageCount = 0

    do {
      const page = await repository.list({ pageSize: 25, cursor })
      pageCount += 1
      seen.push(...page.items.map(item => item.requestId))
      cursor = page.nextCursor
      expect(page.hasMore).toBe(Boolean(page.nextCursor))
    } while (cursor)

    expect(pageCount).toBe(6)
    expect(seen).toHaveLength(137)
    expect(new Set(seen)).toHaveLength(137)
    expect(seen).toEqual(fixtures.map(item => item.request.id).sort().reverse())
    expect(await repository.getByRequestId(protectedFixture.request.id)).toEqual(aggregateBefore)
    expect(await repository.listRuns(protectedFixture.request.id)).toEqual(runsBefore)
  })

  it('uses updated_at before request ID when moving to the next page', async () => {
    const repository = new MemoryEditorialResearchRepository()
    const dates = [
      new Date('2026-07-25T12:00:02.000Z'),
      new Date('2026-07-25T12:00:01.000Z'),
      new Date('2026-07-25T12:00:01.000Z'),
      new Date('2026-07-25T12:00:00.000Z'),
    ]
    const fixtures = dates.map((updatedAt, index) => {
      const fixture = buildEditorialFixture({
        requestId: syntheticUuid('c', index + 1),
        runId: syntheticUuid('d', index + 1),
        destinationId: syntheticUuid('e', index + 1),
        idempotencyKey: `library-order:${index + 1}`,
      })
      fixture.request.updatedAt = updatedAt
      return fixture
    })
    for (const fixture of fixtures) await repository.save(fixture)

    const first = await repository.list({ pageSize: 2 })
    const second = await repository.list({ pageSize: 2, cursor: first.nextCursor })

    expect(first.items.map(item => item.requestId)).toEqual([
      fixtures[0].request.id,
      fixtures[2].request.id,
    ])
    expect(second.items.map(item => item.requestId)).toEqual([
      fixtures[1].request.id,
      fixtures[3].request.id,
    ])
    expect(second.hasMore).toBe(false)
    expect(second.nextCursor).toBeUndefined()
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
