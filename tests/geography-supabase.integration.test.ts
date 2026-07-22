import { describe, expect, it } from 'vitest'
import { GeographicResolver } from '@modules/editorial-pipeline/geography'
import { SupabaseGeographyCatalogRepository } from '@modules/editorial-pipeline/supabase-geography-repository'
import { createLocalSupabaseClientFromEnv } from '@services/supabase'

const integration = process.env.RUN_SUPABASE_INTEGRATION === 'true' ? describe : describe.skip

integration('Supabase local geography catalog', () => {
  it('resolves the pinned snapshot and persists a versioned human correction', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const repository = new SupabaseGeographyCatalogRepository(client)
    const resolver = new GeographicResolver(repository, 'geonames-2026-07-20')
    const actorId = '90000000-0000-4000-8000-000000000099'
    // Qualifier keeps the fixture ambiguous while isolating this test from the durable J03 correction for plain "San Pedro".
    const correctionInput = { query: 'San Pedro, Testland', countryCode: 'ZZ', type: 'locality' as const }

    const morella = await resolver.resolve({ query: 'Morela, España', countryCode: 'ES', type: 'locality' })
    expect(morella.status).toBe('resolved')
    if (morella.status !== 'resolved') throw new Error('expected Morella resolution')
    expect(morella.entity.externalIds).toEqual({ geonames: '3116121' })

    const ambiguous = await resolver.resolve(correctionInput)
    expect(ambiguous.status).toBe('ambiguous')
    if (ambiguous.status !== 'ambiguous') throw new Error('expected ambiguity')
    const selected = ambiguous.candidates.find(candidate => candidate.entity.regionCode === 'S')
    if (!selected) throw new Error('missing southern candidate')

    await resolver.applyHumanCorrection(correctionInput, {
      actorId,
      candidateId: selected.entity.id,
      reason: 'Synthetic integration correction',
    })
    const repeated = await resolver.resolve(correctionInput)
    expect(repeated.status).toBe('resolved')
    if (repeated.status !== 'resolved') throw new Error('expected corrected resolution')
    expect(repeated.method).toBe('human')
    expect(repeated.entity.id).toBe(selected.entity.id)

    const { error } = await client
      .from('geographic_resolution_corrections')
      .delete()
      .eq('normalized_query', repeated.normalizedQuery)
      .eq('catalog_version', repeated.catalogVersion)
    expect(error).toBeNull()
  })
})
