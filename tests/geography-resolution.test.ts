import { describe, expect, it } from 'vitest'
import type { GeographicEntity } from '@shared/editorial-contracts'
import {
  GeographicResolver,
  MemoryGeographyCatalogRepository,
  normalizeGeographicText,
  slugifyGeographicText,
  type GeographicCatalogEntry,
} from '@modules/editorial-pipeline/geography'

const id = (value: number): string => `90000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const now = new Date('2026-07-21T00:00:00.000Z')
const catalogVersion = 'geonames-2026-07-20'
const actorId = id(99)

function entity(overrides: Partial<GeographicEntity> & Pick<GeographicEntity, 'id' | 'type' | 'name' | 'countryCode' | 'slug'>): GeographicEntity {
  return {
    normalizedName: normalizeGeographicText(overrides.name),
    aliases: [],
    sourceName: 'GeoNames',
    sourceVersion: catalogVersion,
    sourceLicense: 'Creative Commons Attribution 4.0',
    status: 'active',
    resolutionMethod: 'exact',
    ambiguityCandidateIds: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function fixtureEntries(): GeographicCatalogEntry[] {
  const spain = entity({ id: id(1), type: 'country', name: 'España', aliases: ['España', 'Spain'], countryCode: 'ES', slug: 'espana' })
  const valencia = entity({ id: id(2), parentId: spain.id, type: 'region', name: 'Comunitat Valenciana', aliases: ['Valencia'], countryCode: 'ES', regionCode: '60', slug: 'comunitat-valenciana' })
  const morella = entity({ id: id(3), parentId: valencia.id, type: 'locality', name: 'Morella', aliases: ['Morella, España'], countryCode: 'ES', regionCode: '60', slug: 'morella', externalIds: { geonames: '3116121' } })
  const testland = entity({ id: id(10), type: 'country', name: 'Testland', countryCode: 'ZZ', slug: 'testland', sourceName: 'Synthetic fixture', sourceVersion: 'fixture-v1', sourceLicense: 'CC0 synthetic fixture' })
  const north = entity({ id: id(11), parentId: testland.id, type: 'region', name: 'Norte', countryCode: 'ZZ', regionCode: 'N', slug: 'norte', sourceName: 'Synthetic fixture', sourceVersion: 'fixture-v1', sourceLicense: 'CC0 synthetic fixture' })
  const south = entity({ id: id(12), parentId: testland.id, type: 'region', name: 'Sur', countryCode: 'ZZ', regionCode: 'S', slug: 'sur', sourceName: 'Synthetic fixture', sourceVersion: 'fixture-v1', sourceLicense: 'CC0 synthetic fixture' })
  const sanPedroNorth = entity({ id: id(13), parentId: north.id, type: 'locality', name: 'San Pedro', aliases: ['San Pedro'], countryCode: 'ZZ', regionCode: 'N', slug: 'san-pedro-norte', sourceName: 'Synthetic fixture', sourceVersion: 'fixture-v1', sourceLicense: 'CC0 synthetic fixture' })
  const sanPedroSouth = entity({ id: id(14), parentId: south.id, type: 'locality', name: 'San Pedro', aliases: ['San Pedro'], countryCode: 'ZZ', regionCode: 'S', slug: 'san-pedro-sur', sourceName: 'Synthetic fixture', sourceVersion: 'fixture-v1', sourceLicense: 'CC0 synthetic fixture' })
  const node = (value: GeographicEntity) => ({ id: value.id, type: value.type, name: value.name, normalizedName: value.normalizedName, countryCode: value.countryCode, regionCode: value.regionCode })
  return [
    { entity: spain, hierarchy: [] },
    { entity: valencia, hierarchy: [node(spain)] },
    { entity: morella, hierarchy: [node(spain), node(valencia)] },
    { entity: testland, hierarchy: [] },
    { entity: north, hierarchy: [node(testland)] },
    { entity: south, hierarchy: [node(testland)] },
    { entity: sanPedroNorth, hierarchy: [node(testland), node(north)] },
    { entity: sanPedroSouth, hierarchy: [node(testland), node(south)] },
  ]
}

function createResolver(version = catalogVersion) {
  const repository = new MemoryGeographyCatalogRepository(fixtureEntries())
  return { repository, resolver: new GeographicResolver(repository, version) }
}

describe('canonical geographic resolution', () => {
  it('normalizes Unicode and produces stable slugs', () => {
    expect(normalizeGeographicText('  Comunitat   Valènciana  ')).toBe('comunitat valenciana')
    expect(slugifyGeographicText('L’Alcúdia de Crespins')).toBe('l-alcudia-de-crespins')
  })

  it('resolves exact names and aliases to the same stable identifier', async () => {
    const { resolver } = createResolver()
    const exact = await resolver.resolve({ query: 'Morella', type: 'locality' })
    const alias = await resolver.resolve({ query: 'Morella, España', type: 'locality' })
    expect(exact.status).toBe('resolved')
    expect(alias.status).toBe('resolved')
    if (exact.status !== 'resolved' || alias.status !== 'resolved') throw new Error('expected resolved geography')
    expect(exact.entity.id).toBe(id(3))
    expect(alias.entity.id).toBe(exact.entity.id)
    expect(alias.method).toBe('alias')
  })

  it('uses deterministic tolerant search without inventing a destination', async () => {
    const { resolver } = createResolver()
    const typo = await resolver.resolve({ query: 'Morela, España', type: 'locality' })
    const absent = await resolver.resolve({ query: 'Destino Totalmente Inventado', type: 'locality' })
    expect(typo.status).toBe('resolved')
    if (typo.status !== 'resolved') throw new Error('expected tolerant resolution')
    expect(typo.method).toBe('tolerant')
    expect(typo.entity.externalIds).toEqual({ geonames: '3116121' })
    expect(absent.status).toBe('not_found')
  })

  it('keeps homonyms visible instead of choosing silently', async () => {
    const { resolver } = createResolver()
    const result = await resolver.resolve({ query: 'San Pedro', countryCode: 'ZZ', type: 'locality' })
    expect(result.status).toBe('ambiguous')
    if (result.status !== 'ambiguous') throw new Error('expected ambiguity')
    expect(result.candidates.map(candidate => candidate.entity.id)).toEqual([id(13), id(14)])
  })

  it('uses explicit hierarchy to disambiguate', async () => {
    const { resolver } = createResolver()
    const result = await resolver.resolve({ query: 'San Pedro, Norte, Testland', countryCode: 'ZZ', type: 'locality' })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') throw new Error('expected hierarchy resolution')
    expect(result.entity.id).toBe(id(13))
    expect(result.hierarchy.map(node => node.name)).toEqual(['Testland', 'Norte'])
  })

  it('persists an explicit human correction for one catalog version', async () => {
    const { repository, resolver } = createResolver()
    const corrected = await resolver.applyHumanCorrection(
      { query: 'San Pedro', countryCode: 'ZZ', type: 'locality' },
      { actorId, candidateId: id(14), reason: 'El operador confirmó la región Sur' },
    )
    const repeated = await resolver.resolve({ query: 'San Pedro', countryCode: 'ZZ', type: 'locality' })
    const nextVersion = await new GeographicResolver(repository, 'geonames-2026-07-21')
      .resolve({ query: 'San Pedro', countryCode: 'ZZ', type: 'locality' })
    expect(corrected.method).toBe('human')
    expect(repeated.status).toBe('resolved')
    if (repeated.status !== 'resolved') throw new Error('expected corrected resolution')
    expect(repeated.entity.id).toBe(id(14))
    expect(repeated.method).toBe('human')
    expect(nextVersion.status).toBe('ambiguous')
  })

  it('rejects a correction to a candidate that was not shown', async () => {
    const { resolver } = createResolver()
    await expect(resolver.applyHumanCorrection(
      { query: 'San Pedro', countryCode: 'ZZ', type: 'locality' },
      { actorId, candidateId: id(3) },
    )).rejects.toMatchObject({ code: 'INVALID_CANDIDATE' })
  })
})
