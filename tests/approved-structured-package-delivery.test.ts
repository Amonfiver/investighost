import { describe, expect, it } from 'vitest'
import { buildApprovedTrawelDeliveryV2, MemoryEditorialDeliveryRepository, DurableTrawelDeliveryService, type TrawelIngressClient, type MediaMapping } from '@modules/trawel-handoff'
import type { StructuredEditorialPackageV1 } from '@shared/structured-editorial-package-contracts'
import type { TrawelEditorialIngressResponse } from '@shared/trawel-editorial-delivery-contracts'
import { buildSyntheticApprovedSource, syntheticTrawelIds } from './support/trawel-handoff-fixture'
import { readFile } from 'node:fs/promises'

const ids = { package: '20000000-0000-4000-8000-000000000001', approval: '20000000-0000-4000-8000-000000000002', execution: '20000000-0000-4000-8000-000000000003', destination: '20000000-0000-4000-8000-000000000004', student: '20000000-0000-4000-8000-000000000005', adventure: '20000000-0000-4000-8000-000000000006', hero: '20000000-0000-4000-8000-000000000007', story: '20000000-0000-4000-8000-000000000008', place: '20000000-0000-4000-8000-000000000009', figure: '20000000-0000-4000-8000-000000000010' }
const hash = 'a'.repeat(64)
const target = { sourceMappingId: 'zone:espana:albarracin', canonicalDestinationId: 'investighost:zone:espana:albarracin', entityType: 'zone' as const, entitySlug: 'albarracin', countrySlug: 'espana', zoneSlug: 'albarracin' }
const sources = [
  buildSyntheticApprovedSource('student', true, { title: 'Student fixture', content: '## [intro] Introducción\nStudent.\n## [overview] Contexto\nContexto.\n## [budget] Presupuesto\nPresupuesto.\n## [daily_life] Vida diaria\nVida.\n## [study] Estudio\nEstudio.\n## [practical] Consejos\n- Consejo\n## [risks] Riesgos\nRiesgos.\n' }),
  buildSyntheticApprovedSource('adventure', true, { title: 'Adventure fixture', content: '## [intro] Introducción\nAdventure.\n## [overview] Contexto\nContexto.\n## [highlights] Destacados\n- Vista\n## [route] Ruta\nRuta.\n## [practical] Consejos\n- Consejo\n## [risks] Riesgos\nRiesgos.\n' }),
] as const
function fixture(): StructuredEditorialPackageV1 { return {
  version: 'structured-editorial-package-v1', packageId: ids.package, executionId: ids.execution, destinationId: ids.destination, masterKnowledgeArtifactId: ids.execution, state: 'APPROVED', visualPackageId: ids.execution,
  student: { libraryRevision: { libraryEntryId: ids.student, versionId: ids.student, revisionId: ids.student, revisionHash: hash }, document: { version: 'student-document-v1', headline: 'Student aprobado', lead: ['Lead uno'], blocks: [{ type: 'paragraph', text: 'Primero.' }, { type: 'figure', resolution: 'RESOLVED', assetId: ids.figure, placement: 'WIDE', alt: 'Figura aprobada', caption: 'Pie aprobado' }, { type: 'paragraph', text: 'Después.' }] } },
  adventure: { libraryRevision: { libraryEntryId: ids.adventure, versionId: ids.adventure, revisionId: ids.adventure, revisionHash: hash }, document: { version: 'adventure-package-v1', copy: { headline: 'Adventure aprobado', hook: 'Hook aprobado.', highlights: ['Vista'], sections: [], practicalTips: ['Consejo'], evidenceRefs: [{ kind: 'claim', referenceId: 'c1' }] }, hero: { asset: { status: 'RESOLVED', assetId: ids.hero }, title: 'Hero', shortCopy: 'Hero copy', presentationTone: 'LANDSCAPE', textPlacement: 'OVERLAY', evidenceRefs: [{ kind: 'claim', referenceId: 'c1' }] }, visualStory: { items: [{ id: ids.story, asset: { status: 'RESOLVED', assetId: ids.story }, order: 0, presentationTone: 'CULTURE', textPlacement: 'CARD_OVERLAY', evidenceRefs: [{ kind: 'claim', referenceId: 'c1' }] }] }, placesToGo: { items: [{ id: ids.place, category: 'STAY', name: 'Place aprobado', order: 0, shortDescription: 'Descripción.', reasonToGo: 'Razón.', evidenceRefs: [{ kind: 'claim', referenceId: 'c1' }], asset: { status: 'RESOLVED', assetId: ids.place } }], supplementalGaps: [] } } },
  visualIntents: [], visualResolution: { visualRevisionId: ids.execution, state: 'PACKAGE_READY_FOR_REVIEW', generatedAt: '2026-09-26T00:00:00.000Z', resolved: [ids.hero, ids.story, ids.place, ids.figure].map(assetId => ({ intentId: assetId, candidateId: assetId, assetId, checksum: hash, score: 1, rightsStatus: 'APPROVED_FOR_PUBLIC_USE', alt: 'Alt' })), unresolved: [] },
} as StructuredEditorialPackageV1 }
function mappings(): MediaMapping[] { return [ids.hero, ids.story, ids.place, ids.figure].map(assetId => ({ packageId: ids.package, approvalDecisionId: ids.approval, destinationId: ids.destination, executionId: ids.execution, assetId, checksum: hash, trawelMediaId: `trawel-${assetId}`, uploadedAt: '2026-09-26T00:00:00.000Z', state: 'COMPLETE' })) }
const build = (overrides: Partial<Parameters<typeof buildApprovedTrawelDeliveryV2>[0]> = {}) => buildApprovedTrawelDeliveryV2({ package: fixture(), currentApprovedPackageId: ids.package, approvalDecisionId: ids.approval, mediaState: 'MEDIA_COMPLETE', mappings: mappings(), target, sources, ...overrides })

describe('approved structured V2 delivery', () => {
  it('projects ordered Student and Adventure visual presentation using only Trawel media IDs', () => {
    const value = build(); const student = value.profiles.student.metadata.investighost as { structuredPackage: { studentDocumentV1: { blocks: Array<Record<string, unknown>> } } }; const adventure = value.profiles.adventure.metadata.investighost as { structuredPackage: { adventurePackageV1: { hero: Record<string, unknown>; destinationVisualStory: Array<Record<string, unknown>>; placesToGo: { items: Array<Record<string, unknown>> } } } }
    expect(student.structuredPackage.studentDocumentV1.blocks.map(block => block.type)).toEqual(['paragraph', 'figure', 'paragraph'])
    expect(student.structuredPackage.studentDocumentV1.blocks[1]).toMatchObject({ assetId: `trawel-${ids.figure}`, placement: 'WIDE', alt: 'Figura aprobada' })
    expect(adventure.structuredPackage.adventurePackageV1.hero).toMatchObject({ assetId: `trawel-${ids.hero}`, title: 'Hero' })
    expect(adventure.structuredPackage.adventurePackageV1.destinationVisualStory[0]).toMatchObject({ order: 0, trawelMediaId: `trawel-${ids.story}` })
    expect(adventure.structuredPackage.adventurePackageV1.placesToGo.items[0]).toMatchObject({ category: 'STAY', trawelMediaId: `trawel-${ids.place}` })
    expect(JSON.stringify(value)).not.toContain('storageIdentity'); expect(JSON.stringify(value)).not.toContain(`"assetId":"${ids.hero}"`)
  })

  it('requires the exact approved package, complete media, coherent revisions and every mapping', () => {
    expect(() => build({ mediaState: 'MEDIA_PARTIAL' })).toThrow('MEDIA_COMPLETE_REQUIRED')
    expect(() => build({ mappings: mappings().slice(1) })).toThrow('MISSING_MEDIA_MAPPING')
    expect(() => build({ currentApprovedPackageId: ids.figure })).toThrow('STALE_PACKAGE_BLOCKED')
    const mixed = fixture(); mixed.adventure.libraryRevision.revisionId = mixed.student.libraryRevision.revisionId
    expect(() => build({ package: mixed })).toThrow('MIXED_REVISIONS_BLOCKED')
  })

  it('makes V2 handoff key and fingerprint deterministic, changes both for material approved copy, and preserves immutable outbox replay', async () => {
    const first = build(); const equal = build(); const changed = fixture(); changed.adventure.document.hero.shortCopy = 'Copy materialmente cambiado'
    const revised = build({ package: changed })
    expect(first.handoffKey).toBe(equal.handoffKey); expect(first.payloadFingerprint).toBe(equal.payloadFingerprint)
    expect(revised.handoffKey).not.toBe(first.handoffKey); expect(revised.payloadFingerprint).not.toBe(first.payloadFingerprint)
    const ingress: TrawelIngressClient = { deliver: async value => ({ success: true, idempotent: false, status: 'accepted', delivery: { id: syntheticTrawelIds.target, status: 'accepted' }, handoffKey: value.handoffKey, payloadFingerprint: value.payloadFingerprint }) as TrawelEditorialIngressResponse }
    const repository = new MemoryEditorialDeliveryRepository(); const service = new DurableTrawelDeliveryService(repository, ingress)
    const delivery = await service.enqueue(first); expect((await service.enqueue(equal)).id).toBe(delivery.id)
    await service.deliver(delivery.id); expect((await repository.findById(delivery.id))?.state).toBe('CONFIRMED')
  })

  it('keeps handoff state, attempts and remote receipt visible in the existing Review Desk', async () => {
    const desk = await readFile(new URL('../src/renderer/BatchReviewDesk.tsx', import.meta.url), 'utf8')
    expect(desk).toContain('Intentos handoff'); expect(desk).toContain('handoffRemoteDeliveryId')
  })
})
