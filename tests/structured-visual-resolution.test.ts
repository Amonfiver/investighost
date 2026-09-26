import { describe, expect, it } from 'vitest'
import { StructuredEditorialPackageArtifactService, assertSameExecutionPackage } from '@modules/editorial-pipeline/structured-editorial-package-service'
import { discoveryQueryForVisualIntent } from '@modules/visual-acquisition/structured-visual-intent-adapter'
import { resolveStructuredVisualIntents } from '@modules/visual-acquisition/structured-visual-resolution'
import type { DestinationVisualAssetSchema } from '@shared/destination-visual-media-contract'
import type { VisualCandidate } from '@shared/visual-candidate-contracts'
import type { StructuredEditorialPackageV1 } from '@shared/structured-editorial-package-contracts'

const hash = 'a'.repeat(64)
const ids = {
  package: '085f0000-0000-4000-8000-000000000001', execution: '085f0000-0000-4000-8000-000000000002', destination: '085f0000-0000-4000-8000-000000000003',
  studentEntry: '085f0000-0000-4000-8000-000000000004', studentVersion: '085f0000-0000-4000-8000-000000000005', studentRevision: '085f0000-0000-4000-8000-000000000006',
  adventureEntry: '085f0000-0000-4000-8000-000000000007', adventureVersion: '085f0000-0000-4000-8000-000000000008', adventureRevision: '085f0000-0000-4000-8000-000000000009',
  figure: '085f0000-0000-4000-8000-000000000010', hero: '085f0000-0000-4000-8000-000000000011', story: '085f0000-0000-4000-8000-000000000012', place: '085f0000-0000-4000-8000-000000000013',
  storyItem: '085f0000-0000-4000-8000-000000000014', placeItem: '085f0000-0000-4000-8000-000000000015',
}
const evidence = [{ kind: 'source' as const, referenceId: 'source-1' }]

function intent(id: string, purpose: 'STUDENT_FIGURE' | 'ADVENTURE_HERO' | 'VISUAL_STORY' | 'PLACE_ASSET', subject: string, linked: 'STUDENT_BLOCK' | 'HERO' | 'VISUAL_STORY_ITEM' | 'PLACE') {
  return { id, purpose, subject, keywords: [subject, 'documentado'], context: `Contexto documentado de ${subject}.`, desiredRole: purpose === 'ADVENTURE_HERO' ? 'HERO' as const : purpose === 'STUDENT_FIGURE' ? 'FIGURE' as const : purpose === 'VISUAL_STORY' ? 'HIGHLIGHT' as const : 'PLACE' as const, desiredPlacement: purpose === 'STUDENT_FIGURE' ? 'INLINE' as const : 'OVERLAY' as const, linkedContent: { type: linked, id: linked === 'VISUAL_STORY_ITEM' ? ids.storyItem : linked === 'PLACE' ? ids.placeItem : ids.package }, evidenceRefs: evidence }
}
function packageFixture(): StructuredEditorialPackageV1 {
  const intents = [intent(ids.figure, 'STUDENT_FIGURE', 'Torre concreta', 'STUDENT_BLOCK'), intent(ids.hero, 'ADVENTURE_HERO', 'Mirador concreto', 'HERO'), intent(ids.story, 'VISUAL_STORY', 'Barrio concreto', 'VISUAL_STORY_ITEM'), intent(ids.place, 'PLACE_ASSET', 'Café concreto', 'PLACE')]
  return {
    version: 'structured-editorial-package-v1', packageId: ids.package, executionId: ids.execution, destinationId: ids.destination, masterKnowledgeArtifactId: ids.execution, state: 'STRUCTURED_GENERATED',
    student: { document: { version: 'student-document-v1', headline: 'Destino', lead: [], blocks: [{ type: 'paragraph', text: 'Texto anterior.' }, { type: 'figure', resolution: 'INTENT', visualIntentId: ids.figure, placement: 'INLINE', altHint: 'Torre concreta.' }, { type: 'paragraph', text: 'Texto posterior.' }] }, libraryRevision: { libraryEntryId: ids.studentEntry, versionId: ids.studentVersion, revisionId: ids.studentRevision, revisionHash: hash } },
    adventure: { document: { version: 'adventure-package-v1', copy: { headline: 'Adventure', hook: 'Copy de Adventure que no se reescribe.', highlights: [], sections: [], practicalTips: [], evidenceRefs: evidence }, hero: { asset: { status: 'INTENT', visualIntentId: ids.hero }, title: 'Mirador', shortCopy: 'Copy original.', presentationTone: 'LANDSCAPE', textPlacement: 'OVERLAY', evidenceRefs: evidence }, visualStory: { items: [{ id: ids.storyItem, asset: { status: 'INTENT', visualIntentId: ids.story }, order: 0, presentationTone: 'CULTURE', textPlacement: 'CARD_OVERLAY', evidenceRefs: evidence }] }, placesToGo: { items: [{ id: ids.placeItem, category: 'EAT', name: 'Café concreto', order: 0, shortDescription: 'Existe por evidencia.', reasonToGo: 'La evidencia lo identifica.', evidenceRefs: evidence, asset: { status: 'INTENT', visualIntentId: ids.place } }], supplementalGaps: [] }, }, libraryRevision: { libraryEntryId: ids.adventureEntry, versionId: ids.adventureVersion, revisionId: ids.adventureRevision, revisionHash: hash } },
    visualIntents: intents,
  }
}
function candidate(intentId: string, title: string, role: 'hero' | 'highlight' | 'gallery', overrides: Partial<VisualCandidate> = {}): VisualCandidate {
  return {
    candidateId: intentId, destinationId: ids.destination, provider: 'wikimedia_commons', providerAssetId: `commons-${intentId}`, canonicalTitle: title, sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:fixture.jpg', originalMediaUrl: 'https://upload.wikimedia.org/fixture.jpg', mimeType: 'image/jpeg', width: 1920, height: 1080, byteSize: 1000, creator: 'Autora', uploader: 'Uploader', sourceName: 'Wikimedia Commons', licenseShortName: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', usageTerms: 'CC BY', attributionText: 'Autora, CC BY 4.0', description: title, requestedCategory: 'landmark', requestedRole: role, discoveredAt: '2026-09-26T10:00:00.000Z', providerMetadataHash: hash, normalizedLicense: 'CC_BY_4_0', state: 'ELIGIBLE', rejectionReason: null, ...overrides,
  }
}
function asset(candidateId: string, checksum = candidateId.replace(/[^0-9a-f]/gi, 'a').slice(0, 64).padEnd(64, 'a')): typeof DestinationVisualAssetSchema._output {
  return { assetId: candidateId.replace('085f', '085a'), destinationId: ids.destination, lifecycle: 'APPROVED', rightsStatus: 'APPROVED_FOR_PUBLIC_USE', usageAllowed: true, rightsCheckedAt: '2026-09-26T10:00:00.000Z', publicUrl: 'https://media.example.test/fixture.jpg', storageIdentity: 'approved/fixture.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:fixture.jpg', sourceName: 'Wikimedia Commons', author: 'Autora', license: 'CC BY 4.0', attributionText: 'Autora, CC BY 4.0', associatedPlace: null, category: 'landmark', modes: ['adventure'], alt: `Fotografía de ${candidateId}`, caption: null, width: 1920, height: 1080, mimeType: 'image/jpeg', checksum, rejectionReason: null }
}
function resolve(candidates: VisualCandidate[], assetOverrides = new Map<string, typeof DestinationVisualAssetSchema._output>()) {
  const assets = new Map(candidates.map(value => [value.candidateId, assetOverrides.get(value.candidateId) ?? asset(value.candidateId)]))
  return resolveStructuredVisualIntents({ package: packageFixture(), candidates, assetsByCandidateId: assets, visualRevisionId: '085f0000-0000-4000-8000-000000000099', now: () => new Date('2026-09-26T11:00:00.000Z') })
}

describe('COMPLETE_VISUAL_AND_CAPTION_PIPELINE', () => {
  const fullCandidates = () => [candidate(ids.figure, 'Torre concreta documentada', 'gallery'), candidate(ids.hero, 'Mirador concreto al atardecer', 'hero'), candidate(ids.story, 'Barrio concreto documentado', 'highlight'), candidate(ids.place, 'Café concreto documentado', 'gallery')]

  it('routes typed intents with concrete entity terms, purpose and evidence intact', () => {
    const visual = packageFixture().visualIntents[1]!
    const query = discoveryQueryForVisualIntent(visual, { destinationId: ids.destination, destinationName: 'Destino', countryOrRegion: 'ES' }, 'landscape')
    expect(query.searchKeywords).toEqual(['Mirador concreto', 'Mirador concreto', 'documentado'])
    expect(query.searchKeywords).not.toContain('Destino travel')
    expect(visual).toMatchObject({ purpose: 'ADVENTURE_HERO', evidenceRefs: evidence })
  })

  it('resolves figure, hero, one ordered story and concrete place after selection', () => {
    const resolved = resolve(fullCandidates())
    expect(resolved.state).toBe('PACKAGE_READY_FOR_REVIEW')
    expect(resolved.student.document.blocks.map(block => block.type)).toEqual(['paragraph', 'figure', 'paragraph'])
    expect(resolved.student.document.blocks[1]).toMatchObject({ resolution: 'RESOLVED', placement: 'INLINE' })
    expect(resolved.adventure.document.hero.asset).toMatchObject({ status: 'RESOLVED' })
    expect(resolved.adventure.document.visualStory.items.map(item => item.order)).toEqual([0])
    expect(resolved.adventure.document.placesToGo.items[0]!.asset).toMatchObject({ status: 'RESOLVED' })
    expect(resolved.visualResolution).toMatchObject({ state: 'PACKAGE_READY_FOR_REVIEW', resolved: expect.arrayContaining([expect.objectContaining({ rightsStatus: 'APPROVED_FOR_PUBLIC_USE' })]), unresolved: [] })
  })

  it('fails closed for UNKNOWN, PENDING and REFERENCE_ONLY rights without placeholder fallbacks', () => {
    for (const state of ['UNKNOWN', 'PENDING', 'REFERENCE_ONLY'] as const) {
      const candidates = fullCandidates()
      const assets = new Map(candidates.map(value => [value.candidateId, { ...asset(value.candidateId), lifecycle: 'PENDING' as const, rightsStatus: state, usageAllowed: null, rightsCheckedAt: null, publicUrl: null }]))
      const result = resolveStructuredVisualIntents({ package: packageFixture(), candidates, assetsByCandidateId: assets, visualRevisionId: '085f0000-0000-4000-8000-000000000098' })
      expect(result.visualResolution?.unresolved).toHaveLength(4)
      expect(result.student.document.blocks[1]).toMatchObject({ resolution: 'INTENT' })
    }
  })

  it('is deterministic, role-aware, gates dimensions/aspect, and prevents checksum reuse across slots', () => {
    const candidates = [...fullCandidates(), candidate('085f0000-0000-4000-8000-000000000016', 'Mirador concreto documentado superior', 'hero', { width: 3000, height: 1688 })]
    const first = resolve(candidates)
    const second = resolve(candidates)
    expect(first.visualResolution?.resolved.map(slot => [slot.intentId, slot.candidateId, slot.assetId])).toEqual(second.visualResolution?.resolved.map(slot => [slot.intentId, slot.candidateId, slot.assetId]))
    const dimensions = resolve([...fullCandidates().map(item => ({ ...item, width: 100, height: 100 }))])
    expect(dimensions.visualResolution?.unresolved.every(item => item.reason === 'DIMENSIONS_REJECTED')).toBe(true)
    const sharedChecksum = new Map(fullCandidates().map(value => [value.candidateId, asset(value.candidateId, hash)]))
    const duplicate = resolveStructuredVisualIntents({ package: packageFixture(), candidates: fullCandidates(), assetsByCandidateId: sharedChecksum })
    expect(duplicate.visualResolution?.unresolved.some(item => item.reason === 'DUPLICATE_CONFLICT')).toBe(true)
  })

  it('generates provider-neutral contextual copy only after an approved asset is selected and persists append-only', async () => {
    const resolved = resolve(fullCandidates())
    expect(resolved.visualResolution?.resolved[0]).toMatchObject({ alt: expect.stringContaining('Torre concreta') })
    expect(resolved.adventure.document.copy.hook).toBe('Copy de Adventure que no se reescribe.')
    const stored: unknown[] = []
    const service = new StructuredEditorialPackageArtifactService({ latestArtifact: async () => stored.length ? { version: stored.length, payload: stored.at(-1), payloadHash: hash, kind: 'editorial_package', key: 'structured/v1', createdAt: '2026-09-26T11:00:00.000Z' } : undefined, appendArtifact: async (_id, _kind, _key, _version, value) => { stored.push(value) } } as never)
    await service.save(ids.execution, packageFixture())
    await service.save(ids.execution, resolved)
    expect(stored).toHaveLength(2)
    expect((stored[0] as StructuredEditorialPackageV1).student.document.blocks[1]).toMatchObject({ resolution: 'INTENT' })
    expect((stored[1] as StructuredEditorialPackageV1).visualResolution?.resolved).toHaveLength(4)
    expect(() => assertSameExecutionPackage(packageFixture(), { ...resolved, masterKnowledgeArtifactId: ids.package })).toThrow('SAME_EXECUTION_PACKAGE_REQUIRED')
  })
})
