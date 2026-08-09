import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import {
  SupabaseTrawelApprovedSourcePort,
  SupabaseTrawelEditorialTransferPort,
  TrawelEditorialTransferService,
  supabaseProjectRef,
} from '@modules/trawel-handoff'
import { TrawelEditorialTransferCommandSchema } from '@shared/trawel-editorial-transfer-contracts'
import {
  buildSyntheticApprovedSource,
  syntheticCreatedAt,
  syntheticTrawelIds,
  syntheticTrawelTarget,
} from './support/trawel-handoff-fixture'

const syntheticSupabaseUrl =
  `https://${syntheticTrawelTarget.projectRef}.supabase.co`

describe('adaptadores Supabase del handoff Trawel', () => {
  it('lee por ID las dos versiones current approved autoritativas', async () => {
    const student = buildSyntheticApprovedSource('student')
    const adventure = buildSyntheticApprovedSource('adventure')
    const listLibraryEntries = vi.fn(async () => [student.entry, adventure.entry])
    const getCurrentApproved = vi.fn(async (entryId: string) =>
      entryId === adventure.entry.entryId
        ? adventure.currentApproved
        : student.currentApproved,
    )
    const port = new SupabaseTrawelApprovedSourcePort(
      { listLibraryEntries },
      { getCurrentApproved },
    )

    const result = await port.loadApprovedSources([
      adventure.entry.entryId,
      student.entry.entryId,
    ])

    expect(result).toEqual([adventure, student])
    expect(listLibraryEntries).toHaveBeenCalledWith({ origin: 'real_editorial_pilot' })
    expect(getCurrentApproved).toHaveBeenCalledTimes(2)
  })

  it('falla antes de consultar si URL, project ref o llamada no coinciden', async () => {
    expect(supabaseProjectRef(syntheticSupabaseUrl)).toBe(syntheticTrawelTarget.projectRef)
    expect(() => supabaseProjectRef('https://example.test')).toThrow(
      'TRAWEL_SUPABASE_URL_INVALID',
    )
    const database = syntheticDatabase()
    const client = new MemorySupabaseClient(database, false)
    expect(() => new SupabaseTrawelEditorialTransferPort({
      privilegedClient: asSupabase(client),
      publicClient: asSupabase(client),
      projectRef: 'zyxwvutsrqponmlkjihg',
      supabaseUrl: syntheticSupabaseUrl,
    })).toThrow('TRAWEL_PROJECT_REF_MISMATCH')

    const port = trawelPort(database)
    await expect(port.readPrivateDrafts('zyxwvutsrqponmlkjihg', []))
      .rejects.toThrow('TRAWEL_PROJECT_REF_MISMATCH')
    expect(client.queryCount).toBe(0)
  })

  it('resuelve el catálogo, inserta solo drafts y demuestra read-back e invisibilidad', async () => {
    const database = syntheticDatabase()
    const sources = [
      buildSyntheticApprovedSource('student'),
      buildSyntheticApprovedSource('adventure'),
    ]
    const service = new TrawelEditorialTransferService(
      { loadApprovedSources: async () => structuredClone(sources) },
      trawelPort(database),
    )
    const command = TrawelEditorialTransferCommandSchema.parse({
      libraryEntryIds: [
        syntheticTrawelIds.adventureEntry,
        syntheticTrawelIds.studentEntry,
      ],
      target: syntheticTrawelTarget,
      actorId: syntheticTrawelIds.actor,
      confirmed: true,
    })

    const first = await service.transfer(command)
    const repeated = await service.transfer(command)

    expect(first).toMatchObject({
      status: 'verified', outcome: 'PASS', operation: 'inserted',
      publiclyVisible: false, differences: [],
    })
    expect(repeated).toMatchObject({
      status: 'verified', outcome: 'PASS', operation: 'reused',
      insertedRowIds: [], publiclyVisible: false, differences: [],
    })
    expect(database.editorial_contents).toHaveLength(2)
    expect(database.editorial_contents.every(row =>
      row.status === 'draft' && row.published_at === null,
    )).toBe(true)
  })
})

interface MemoryDatabase {
  location_countries: Array<Record<string, unknown>>
  location_cities: Array<Record<string, unknown>>
  editorial_contents: Array<Record<string, unknown>>
}

type MemoryTable = keyof MemoryDatabase
type QueryResult = {
  data: Array<Record<string, unknown>> | null
  error: { message: string } | null
}

class MemorySupabaseClient {
  queryCount = 0

  constructor(
    readonly database: MemoryDatabase,
    readonly publicOnly: boolean,
  ) {}

  from(table: string): MemoryQuery {
    if (!isMemoryTable(table)) throw new Error('tabla sintética desconocida')
    return new MemoryQuery(this, table)
  }
}

class MemoryQuery implements PromiseLike<QueryResult> {
  private readonly equals: Array<[string, unknown]> = []
  private includedIds: string[] | null = null
  private maximum: number | null = null
  private orderField: string | null = null

  constructor(
    private readonly client: MemorySupabaseClient,
    private readonly table: MemoryTable,
  ) {}

  select(columns: string): this {
    void columns
    return this
  }

  eq(field: string, value: unknown): this {
    this.equals.push([field, value])
    return this
  }

  in(field: string, values: string[]): this {
    if (field !== 'id') throw new Error('filtro sintético no soportado')
    this.includedIds = values
    return this
  }

  limit(maximum: number): this {
    this.maximum = maximum
    return this
  }

  order(field: string): this {
    this.orderField = field
    return this
  }

  async insert(candidate: unknown): Promise<QueryResult> {
    this.client.queryCount += 1
    if (this.table !== 'editorial_contents' || !isRecord(candidate)) {
      return { data: null, error: { message: 'insert sintético inválido' } }
    }
    if (this.client.database.editorial_contents.some(row => row.id === candidate.id)) {
      return { data: null, error: { message: 'id sintético duplicado' } }
    }
    this.client.database.editorial_contents.push(structuredClone({
      ...candidate,
      created_at: syntheticCreatedAt,
      updated_at: syntheticCreatedAt,
    }))
    return { data: null, error: null }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }

  private execute(): QueryResult {
    this.client.queryCount += 1
    let rows = this.client.database[this.table].map(row => structuredClone(row))
    for (const [field, value] of this.equals) {
      rows = rows.filter(row => row[field] === value)
    }
    if (this.includedIds !== null) {
      rows = rows.filter(row =>
        typeof row.id === 'string' && this.includedIds?.includes(row.id),
      )
    }
    if (this.client.publicOnly && this.table === 'editorial_contents') {
      rows = rows.filter(row => row.status === 'published')
    }
    if (this.orderField !== null) {
      const field = this.orderField
      rows.sort((left, right) => String(left[field]).localeCompare(String(right[field])))
    }
    if (this.maximum !== null) rows = rows.slice(0, this.maximum)
    return { data: rows, error: null }
  }
}

function syntheticDatabase(): MemoryDatabase {
  return {
    location_countries: [{
      id: 'e2000000-0000-4000-8000-000000000099',
      slug: syntheticTrawelTarget.countrySlug,
      iso2: syntheticTrawelTarget.countryCode,
      is_active: true,
    }],
    location_cities: [{
      id: syntheticTrawelTarget.entityId,
      country_slug: syntheticTrawelTarget.countrySlug,
      slug: syntheticTrawelTarget.entitySlug,
      status: 'active',
    }],
    editorial_contents: [],
  }
}

function trawelPort(database: MemoryDatabase): SupabaseTrawelEditorialTransferPort {
  return new SupabaseTrawelEditorialTransferPort({
    privilegedClient: asSupabase(new MemorySupabaseClient(database, false)),
    publicClient: asSupabase(new MemorySupabaseClient(database, true)),
    projectRef: syntheticTrawelTarget.projectRef,
    supabaseUrl: syntheticSupabaseUrl,
  })
}

function asSupabase(client: MemorySupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient
}

function isMemoryTable(candidate: string): candidate is MemoryTable {
  return [
    'location_countries',
    'location_cities',
    'editorial_contents',
  ].includes(candidate)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
