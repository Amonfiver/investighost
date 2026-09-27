import { describe, expect, it } from 'vitest'
import { GeographicResolver, MemoryGeographyCatalogRepository } from '@modules/editorial-pipeline/geography'
import { SupabaseBatchGeographicIdentityStore } from '@modules/factory-batches'
import { BatchGeographicIdentityService } from '@modules/factory-batches/geographic-identity'
import type { DestinationBatchJob } from '@shared/factory-batch-contracts'

const now = new Date('2026-09-27T00:00:00.000Z')
const segovia: DestinationBatchJob = {
  id: '92000000-0000-4000-8000-000000000001', batchId: '92000000-0000-4000-8000-000000000002', inputIndex: 0,
  originalName: 'Segovia', country: 'España', normalizedName: 'segovia', normalizedCountry: 'ES', normalizedIdentity: 'segovia|ES|*',
  identityState: 'NEW', reusePolicy: 'NEEDS_NEW_PRODUCTION', status: 'QUEUED', currentPhase: 'IDENTITY', completedPhases: [], artifactRefs: {},
  attemptCount: 2, retryable: true, actualCost: 0, createdAt: now, updatedAt: now,
}

function identityClient() {
  const rows: Array<Record<string, unknown>> = [{ id: '92000000-0000-4000-8000-000000000003', entity_type: 'country', country_code: 'ES', normalized_name: 'espana', status: 'active' }]
  const inserted: Array<Record<string, unknown>> = []
  return {
    client: {
      from(table: string) {
        if (table !== 'geographic_entities') throw new Error(`unexpected table ${table}`)
        const filters: Array<[string, unknown]> = []
        const chain = {
          eq(key: string, value: unknown) { filters.push([key, value]); return chain },
          async maybeSingle() {
            const match = rows.find(row => filters.every(([key, value]) => row[key] === value)) ?? null
            return { data: match, error: null }
          },
        }
        return {
          select: () => chain,
          insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => {
            rows.push(row); inserted.push(row); return { data: { id: row.id }, error: null }
          } }) }),
        }
      },
    } as never,
    rows,
    inserted,
  }
}

describe('SupabaseBatchGeographicIdentityStore', () => {
  it('SEGOVIA_CANONICAL_IDENTITY_CREATED persists the locality under its canonical country parent and reuses it idempotently', async () => {
    const fake = identityClient()
    const identity = new BatchGeographicIdentityService(
      new GeographicResolver(new MemoryGeographyCatalogRepository([]), 'fixture-v1'),
      new SupabaseBatchGeographicIdentityStore(fake.client),
    )
    const first = await identity.ensure(segovia)
    const second = await identity.ensure(segovia)
    expect(first).toBe(second)
    expect(fake.inserted).toEqual([expect.objectContaining({ id: first, parent_id: '92000000-0000-4000-8000-000000000003', entity_type: 'locality', name: 'Segovia', country_code: 'ES', slug: 'segovia' })])
    expect(fake.rows.filter(row => row.entity_type === 'locality' && row.normalized_name === 'segovia')).toHaveLength(1)
  })
})
