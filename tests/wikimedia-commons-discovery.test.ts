import { describe, expect, it, vi } from 'vitest'
import { MemoryVisualCandidateRepository } from '@modules/visual-acquisition/candidate-repository'
import { VisualCandidateDiscoveryService } from '@modules/visual-acquisition/candidate-discovery-service'
import {
  WikimediaCommonsDiscoveryAdapter,
  buildWikimediaCommonsSearchTerm,
  classifyWikimediaCandidateRights,
  normalizeCommonsLicense,
  qualityFailureFor,
} from '@modules/visual-acquisition/wikimedia-commons'

const destinationId = '11111111-1111-4111-8111-111111111111'
const candidateId = '22222222-2222-4222-8222-222222222222'
const query = {
  destinationId, destinationName: 'Cuenca', countryOrRegion: 'España', category: 'landmark' as const, role: 'hero' as const, limit: 5,
}

function fixture(overrides: Record<string, unknown> = {}) {
  const imageinfo = {
    url: 'https://upload.wikimedia.org/example/cuenca.jpg', mime: 'image/jpeg', width: 2400, height: 1350, size: 456789,
    sha1: 'a'.repeat(40), user: 'Uploader diferente',
    canonicaltitle: 'File:Cuenca vista canónica.jpg',
    extmetadata: {
      Artist: { value: '<a href="https://commons.wikimedia.org/wiki/User:Creator">Autora real</a>' },
      Credit: { value: 'Archivo institucional' }, ImageDescription: { value: 'Vista de Cuenca' },
      LicenseShortName: { value: 'CC BY 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' },
      UsageTerms: { value: 'Creative Commons Attribution 4.0' },
    },
    ...overrides,
  }
  return { query: { pages: [{ pageid: 12345, title: 'File:Cuenca vista.jpg', imageinfo: [imageinfo] }] } }
}

function adapter(response: unknown, now = '2026-09-22T10:00:00.000Z') {
  return new WikimediaCommonsDiscoveryAdapter({
    fetchFn: vi.fn(async () => ({ ok: true, status: 200, json: async () => response })),
    now: () => new Date(now), candidateId: () => candidateId,
  })
}

describe('Wikimedia Commons candidate discovery V1', () => {
  it('builds reusable destination/category terms without destination-specific adapter logic', () => {
    expect(buildWikimediaCommonsSearchTerm(query)).toBe('Cuenca España monument')
    expect(buildWikimediaCommonsSearchTerm({ ...query, destinationName: 'Morella', countryOrRegion: null, category: 'landscape' })).toBe('Morella landscape')
  })

  it('uses the official Action API search plus imageinfo/extmetadata and normalizes a candidate', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => fixture() }))
    const client = new WikimediaCommonsDiscoveryAdapter({ fetchFn, now: () => new Date('2026-09-22T10:00:00.000Z'), candidateId: () => candidateId })
    const [candidate] = await client.discover(query)
    const url = new URL(String(fetchFn.mock.calls[0]?.[0]))
    expect(url.origin).toBe('https://commons.wikimedia.org')
    expect(url.searchParams.get('generator')).toBe('search')
    expect(url.searchParams.get('gsrnamespace')).toBe('6')
    expect(url.searchParams.get('iiprop')).toContain('extmetadata')
    expect(candidate).toMatchObject({ provider: 'wikimedia_commons', providerAssetId: '12345', canonicalTitle: 'File:Cuenca vista canónica.jpg', state: 'ELIGIBLE', normalizedLicense: 'CC_BY_4_0', mimeType: 'image/jpeg', width: 2400, height: 1350 })
    expect(candidate.sourcePageUrl).toBe('https://commons.wikimedia.org/wiki/File%3ACuenca_vista_can%C3%B3nica.jpg')
    expect(candidate.originalMediaUrl).toBe('https://upload.wikimedia.org/example/cuenca.jpg')
  })

  it('uses the real creator from extmetadata rather than the uploader', async () => {
    const [candidate] = await adapter(fixture()).discover(query)
    expect(candidate.creator).toBe('Autora real')
    expect(candidate.uploader).toBe('Uploader diferente')
    expect(candidate.attributionText).toContain('Autora real')
    expect(candidate.attributionText).not.toContain('Uploader diferente')
  })

  it('normalizes licenses and stays fail-closed for non-allowlisted rights', () => {
    expect(normalizeCommonsLicense('Public domain', null, null)).toBe('PUBLIC_DOMAIN')
    expect(normalizeCommonsLicense('CC0', null, null)).toBe('CC0')
    expect(normalizeCommonsLicense('CC BY 3.0', null, null)).toBe('CC_BY_3_0')
    expect(normalizeCommonsLicense('CC BY-SA 4.0', null, null)).toBe('CC_BY_SA')
    expect(normalizeCommonsLicense('CC BY-ND 4.0', null, null)).toBe('CC_BY_ND')
    expect(normalizeCommonsLicense('CC BY-NC 4.0', null, null)).toBe('CC_BY_NC')
    expect(classifyWikimediaCandidateRights('CC_BY_SA', 'Autora', 'https://license.example.test', 'Crédito', 'https://media.example.test/a.jpg')).toEqual({ state: 'REFERENCE_ONLY', reason: 'LICENSE_REQUIRES_MANUAL_REVIEW' })
    expect(classifyWikimediaCandidateRights('CC_BY_4_0', null, 'https://license.example.test', 'Crédito', 'https://media.example.test/a.jpg')).toEqual({ state: 'REFERENCE_ONLY', reason: 'ATTRIBUTION_OR_PROVENANCE_INCOMPLETE' })
  })

  it('enforces browser MIME and role-specific metadata dimensions before any download', () => {
    expect(qualityFailureFor('hero', 'image/jpeg', 2400, 1350)).toBeNull()
    expect(qualityFailureFor('hero', 'image/jpeg', 1200, 900)).toBe('HERO_DIMENSIONS_INSUFFICIENT')
    expect(qualityFailureFor('highlight', 'image/png', 1000, 600)).toBe('HIGHLIGHT_DIMENSIONS_INSUFFICIENT')
    expect(qualityFailureFor('gallery', 'image/tiff', 3000, 2000)).toBe('MIME_UNSUPPORTED')
  })

  it('persists candidate replay idempotently and never creates a public asset or handoff payload', async () => {
    const repository = new MemoryVisualCandidateRepository()
    const service = new VisualCandidateDiscoveryService(adapter(fixture()), repository)
    const [first] = await service.discover(query)
    const [second] = await service.discover({ ...query, category: 'culture' })
    expect(second.candidateId).toBe(first.candidateId)
    expect(second.discoveredAt).toBe(first.discoveredAt)
    expect(await repository.findByProviderAsset(destinationId, 'wikimedia_commons', '12345')).toMatchObject({ state: 'ELIGIBLE' })
    expect(JSON.stringify(second)).not.toContain('publicUrl')
    expect(JSON.stringify(second)).not.toContain('handoffKey')
  })
})
