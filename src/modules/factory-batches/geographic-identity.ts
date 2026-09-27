import { randomUUID } from 'node:crypto'
import { GeographicResolver, normalizeGeographicText, slugifyGeographicText } from '@modules/editorial-pipeline/geography'
import type { DestinationBatchJob } from '@shared/factory-batch-contracts'

/** Durable authority for a user-entered locality when the versioned catalog has
 * no row yet. It records its input provenance instead of pretending external
 * geographic enrichment occurred. */
export interface BatchGeographicIdentityStore {
  find(countryCode: string, normalizedName: string): Promise<string | null>
  create(input: { id: string; name: string; normalizedName: string; countryCode: string; slug: string }): Promise<string>
}

export class BatchGeographicIdentityService {
  constructor(private readonly resolver: GeographicResolver, private readonly store: BatchGeographicIdentityStore) {}

  async ensure(job: DestinationBatchJob): Promise<string> {
    if (job.canonicalDestinationId) return job.canonicalDestinationId
    const resolved = await this.resolver.resolve({ query: job.originalName, countryCode: job.normalizedCountry })
    if (resolved.status === 'resolved') return resolved.entity.id
    if (resolved.status === 'ambiguous') throw new Error('CANONICAL_DESTINATION_AMBIGUOUS')
    const normalizedName = normalizeGeographicText(job.originalName)
    const existing = await this.store.find(job.normalizedCountry, normalizedName)
    if (existing) return existing
    return this.store.create({ id: randomUUID(), name: job.originalName, normalizedName, countryCode: job.normalizedCountry, slug: slugifyGeographicText(job.originalName) })
  }
}
