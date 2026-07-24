import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { MemoryEditorialResearchRepository } from '@modules/editorial-pipeline/memory-repository'
import { SupabaseEditorialResearchRepository } from '@modules/editorial-pipeline/supabase-repository'
import { buildEditorialFixture } from './support/editorial-fixture'

type FakeRow = Record<string, unknown>
type FakeResult = { data: FakeRow[]; error: null }

function syntheticUuid(prefix: string, index: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

class FakeQuery {
  private readonly orders: Array<{ column: string; ascending: boolean }> = []
  private selectedIds: string[] | undefined
  private cursorFilter: string | undefined
  private rowLimit: number | undefined

  constructor(
    private readonly table: string,
    private readonly tables: Record<string, FakeRow[]>,
  ) {}

  select(): this {
    return this
  }

  order(column: string, options: { ascending: boolean }): this {
    this.orders.push({ column, ascending: options.ascending })
    return this
  }

  limit(value: number): this {
    this.rowLimit = value
    return this
  }

  or(filter: string): this {
    this.cursorFilter = filter
    return this
  }

  in(column: string, values: string[]): this {
    if (column === 'request_id') this.selectedIds = values
    return this
  }

  then<TResult1 = FakeResult>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
  ): Promise<FakeResult | TResult1> {
    return Promise.resolve(this.execute()).then(onfulfilled)
  }

  private execute(): FakeResult {
    let rows = structuredClone(this.tables[this.table] ?? [])
    if (this.selectedIds) {
      rows = rows.filter(row => this.selectedIds?.includes(String(row.request_id)))
    }
    if (this.cursorFilter) {
      const match = this.cursorFilter.match(
        /^updated_at\.lt\.([^,]+),and\(updated_at\.eq\.([^,]+),id\.lt\.([^)]+)\)$/,
      )
      if (!match) throw new Error(`Filtro de cursor inesperado: ${this.cursorFilter}`)
      const [, before, equal, requestId] = match
      rows = rows.filter(row => (
        String(row.updated_at) < before
        || (String(row.updated_at) === equal && String(row.id) < requestId)
      ))
    }
    rows.sort((left, right) => {
      for (const order of this.orders) {
        const leftValue = String(left[order.column])
        const rightValue = String(right[order.column])
        const comparison = leftValue.localeCompare(rightValue)
        if (comparison !== 0) return order.ascending ? comparison : -comparison
      }
      return 0
    })
    if (this.rowLimit !== undefined) rows = rows.slice(0, this.rowLimit)
    return { data: rows, error: null }
  }
}

class FakeSupabaseClient {
  constructor(readonly tables: Record<string, FakeRow[]>) {}

  from(table: string): FakeQuery {
    return new FakeQuery(table, this.tables)
  }
}

describe('Supabase Library pagination semantics', () => {
  it('matches the memory repository across tied keyset pages without mutations', async () => {
    const memory = new MemoryEditorialResearchRepository()
    const tiedAt = new Date('2026-07-25T12:00:00.000Z')
    const fixtures = Array.from({ length: 5 }, (_, index) => {
      const fixture = buildEditorialFixture({
        requestId: syntheticUuid('9', index + 1),
        runId: syntheticUuid('a', index + 1),
        destinationId: syntheticUuid('b', index + 1),
        idempotencyKey: `library-supabase-unit:${index + 1}`,
      })
      fixture.request.updatedAt = index < 4
        ? tiedAt
        : new Date('2026-07-25T11:59:59.000Z')
      return fixture
    })
    for (const fixture of fixtures) await memory.save(fixture)

    const fake = new FakeSupabaseClient({
      editorial_research_requests: fixtures.map(({ request }) => ({
        id: request.id,
        destination_id: request.destinationId,
        destination_query_snapshot: request.destinationQuerySnapshot,
        profiles: request.profiles,
        state: request.state,
        version: request.version,
        created_at: request.createdAt.toISOString(),
        updated_at: request.updatedAt.toISOString(),
      })),
      editorial_research_runs: fixtures.map(({ run }) => ({
        id: run.id,
        request_id: run.requestId,
        stage: run.stage,
        state: run.state,
        error_code: run.errorCode ?? null,
        error_message: run.errorMessage ?? null,
        failure_classification: run.failureClassification ?? null,
        actual_cost: run.actualCost ?? null,
        currency: run.currency,
        completed_at: run.completedAt?.toISOString() ?? null,
        updated_at: run.updatedAt.toISOString(),
      })),
    })
    const databaseSnapshot = structuredClone(fake.tables)
    const supabase = new SupabaseEditorialResearchRepository(fake as unknown as SupabaseClient)

    const memoryFirst = await memory.list({ pageSize: 3 })
    const supabaseFirst = await supabase.list({ pageSize: 3 })
    expect(supabaseFirst).toEqual(memoryFirst)

    const memorySecond = await memory.list({ pageSize: 3, cursor: memoryFirst.nextCursor })
    const supabaseSecond = await supabase.list({ pageSize: 3, cursor: supabaseFirst.nextCursor })
    expect(supabaseSecond).toEqual(memorySecond)
    expect([
      ...supabaseFirst.items.map(item => item.requestId),
      ...supabaseSecond.items.map(item => item.requestId),
    ]).toHaveLength(5)
    expect(fake.tables).toEqual(databaseSnapshot)
  })
})
