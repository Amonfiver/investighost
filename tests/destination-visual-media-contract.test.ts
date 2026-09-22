import { describe, expect, it } from 'vitest'
import {
  DestinationVisualMediaPackageSchema,
  projectDestinationVisualMediaForTrawel,
} from '@shared/destination-visual-media-contract'
import { calculateDestinationVisualMediaPackageHash } from '@modules/trawel-handoff/visual-media-package'

const destinationId = '11111111-1111-4111-8111-111111111111'
const packageId = '22222222-2222-4222-8222-222222222222'
const ids = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777']

function approvedAsset(index: number, modes: Array<'adventure' | 'student'> = ['adventure']) {
  return {
    assetId: ids[index], destinationId, lifecycle: 'APPROVED' as const, rightsStatus: 'APPROVED_FOR_PUBLIC_USE' as const,
    usageAllowed: true, rightsCheckedAt: '2026-09-22T09:00:00.000Z',
    publicUrl: `https://media.example.test/cuenca/${index}.jpg`, storageIdentity: `approved/cuenca/${index}.jpg`,
    sourceUrl: `https://origin.example.test/cuenca/${index}`, sourceName: 'Archivo sintético', author: 'Autora sintética',
    license: 'CC BY 4.0', attributionText: 'Autora sintética — Archivo sintético — CC BY 4.0',
    associatedPlace: index === 0 ? 'Casas Colgadas' : null,
    category: index === 0 ? 'landmark' as const : 'landscape' as const,
    modes, alt: `Imagen sintética ${index}`, caption: `Pie sintético ${index}`,
    width: 1600, height: 900, mimeType: 'image/jpeg', checksum: `${String(index + 1).repeat(1)}${'a'.repeat(63)}`,
    rejectionReason: null,
  }
}

function packageFixture(overrides: Record<string, unknown> = {}) {
  const draft = {
    schema: 'investighost-destination-visual-media-v1' as const,
    packageId, destinationId, state: 'DRAFT' as const, packageHash: null,
    assets: [approvedAsset(0, ['adventure', 'student']), approvedAsset(1), approvedAsset(2), approvedAsset(3), {
      ...approvedAsset(4), lifecycle: 'PENDING' as const, rightsStatus: 'REFERENCE_ONLY' as const,
      usageAllowed: false, rightsCheckedAt: null, publicUrl: null, alt: null, attributionText: null,
    }],
    selections: [
      { assetId: ids[0], mode: 'adventure' as const, role: 'hero' as const, priority: 0 },
      { assetId: ids[0], mode: 'student' as const, role: 'hero' as const, priority: 0 },
      { assetId: ids[1], mode: 'adventure' as const, role: 'highlight' as const, priority: 0 },
      { assetId: ids[2], mode: 'adventure' as const, role: 'highlight' as const, priority: 1 },
      { assetId: ids[3], mode: 'adventure' as const, role: 'gallery' as const, priority: 0 },
    ],
    ...overrides,
  }
  const packageHash = calculateDestinationVisualMediaPackageHash(draft)
  return DestinationVisualMediaPackageSchema.parse({ ...draft, state: 'APPROVED', packageHash })
}

describe('Visual Bridge V1 canonical media package', () => {
  it('models a multi-asset Cuenca fixture with explicit hero, highlights, gallery and shared mode eligibility', () => {
    const projected = projectDestinationVisualMediaForTrawel(packageFixture())
    expect(projected.completeness).toBe('COMPLETE')
    expect(projected.assets).toHaveLength(4)
    expect(projected.selections).toEqual(expect.arrayContaining([
      expect.objectContaining({ mode: 'adventure', role: 'hero', priority: 0 }),
      expect.objectContaining({ mode: 'adventure', role: 'highlight', priority: 0 }),
      expect.objectContaining({ mode: 'adventure', role: 'gallery', priority: 0 }),
      expect.objectContaining({ mode: 'student', role: 'hero', priority: 0 }),
    ]))
    expect(projected.assets.find(asset => asset.assetId === ids[0])?.modes).toEqual(['adventure', 'student'])
  })

  it('fails closed for unknown rights, non-public assets and duplicate heroes', () => {
    const unknown = packageFixture()
    expect(() => DestinationVisualMediaPackageSchema.parse({
      ...unknown, assets: [{ ...unknown.assets[0], lifecycle: 'APPROVED', rightsStatus: 'UNKNOWN', usageAllowed: null, rightsCheckedAt: null }, ...unknown.assets.slice(1)],
    })).toThrow(/derechos públicos comprobados/)
    const value = packageFixture()
    expect(() => DestinationVisualMediaPackageSchema.parse({
      ...value,
      selections: [...value.selections, { assetId: ids[1], mode: 'adventure', role: 'hero', priority: 0 }],
    })).toThrow(/Solo puede existir un hero/)
  })

  it('excludes reference-only provenance from the public projection', () => {
    const projected = projectDestinationVisualMediaForTrawel(packageFixture())
    const serialized = JSON.stringify(projected)
    expect(serialized).not.toContain(ids[4])
    expect(serialized).not.toContain('origin.example.test')
    expect(serialized).not.toContain('storageIdentity')
    expect(serialized).not.toContain('rightsCheckedAt')
  })

  it('distinguishes partial from complete without blocking a valid text-only package elsewhere', () => {
    const value = packageFixture()
    const partial = { ...value, state: 'PARTIAL' as const, packageHash: null, selections: value.selections.slice(0, 1) }
    expect(DestinationVisualMediaPackageSchema.parse(partial).state).toBe('PARTIAL')
  })

  it('hashes public content deterministically and ignores private volatile review fields', () => {
    const value = packageFixture()
    const changedReviewTime = {
      ...value,
      state: 'DRAFT' as const,
      packageHash: null,
      assets: value.assets.map(asset => asset.assetId === ids[0] ? { ...asset, rightsCheckedAt: '2026-09-23T09:00:00.000Z', sourceUrl: 'https://other.example.test/source' } : asset),
    }
    expect(calculateDestinationVisualMediaPackageHash(changedReviewTime)).toBe(value.packageHash)
    const changedPublicCaption = {
      ...changedReviewTime,
      assets: changedReviewTime.assets.map(asset => asset.assetId === ids[0] ? { ...asset, caption: 'Pie público revisado' } : asset),
    }
    expect(calculateDestinationVisualMediaPackageHash(changedPublicCaption)).not.toBe(value.packageHash)
  })
})
