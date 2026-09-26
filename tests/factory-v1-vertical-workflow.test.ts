import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { GeographicResolver, MemoryGeographyCatalogRepository } from '@modules/editorial-pipeline/geography'
import { DestinationBatchService, EditorialBatchWorker, MemoryDestinationBatchRepository, materializeApprovedPackageSnapshot, type BatchEditorialPhasePort } from '@modules/factory-batches'
import { resolveStructuredVisualIntents } from '@modules/visual-acquisition/structured-visual-resolution'
import { ingressApprovedPackageMedia, MemoryMediaMappingRepository, MemoryMediaIngressReceiptRepository, buildApprovedTrawelDeliveryV2, DurableTrawelDeliveryService, MemoryEditorialDeliveryRepository } from '@modules/trawel-handoff'
import { buildSyntheticApprovedSource } from './support/trawel-handoff-fixture'
import type { StructuredEditorialPackageV1 } from '@shared/structured-editorial-package-contracts'
import type { VisualCandidate } from '@shared/visual-candidate-contracts'
import type { DestinationVisualAssetSchema } from '@shared/destination-visual-media-contract'

const ids = { cuenca: '86000000-0000-4000-8000-000000000001', morella: '86000000-0000-4000-8000-000000000002', albarracin: '86000000-0000-4000-8000-000000000003', package: '86000000-0000-4000-8000-000000000004', execution: '86000000-0000-4000-8000-000000000005', student: '86000000-0000-4000-8000-000000000006', adventure: '86000000-0000-4000-8000-000000000007', figure: '86000000-0000-4000-8000-000000000008', hero: '86000000-0000-4000-8000-000000000009', story: '86000000-0000-4000-8000-000000000010', place: '86000000-0000-4000-8000-000000000011' }
const hash = 'a'.repeat(64)
const evidence = [{ kind: 'source' as const, referenceId: 'fixture-source' }]
const png = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed])
const checksum = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function geography() {
  const normalized = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
  const entry = (id: string, name: string) => ({ entity: { id, parentId: '86000000-0000-4000-8000-000000000099', type: 'locality' as const, name, normalizedName: normalized(name), aliases: [], countryCode: 'ES', slug: normalized(name), sourceName: 'fixture', sourceVersion: 'v1', sourceLicense: 'CC0', status: 'active' as const, resolutionMethod: 'exact' as const, ambiguityCandidateIds: [], version: 1, createdAt: new Date(), updatedAt: new Date() }, hierarchy: [] })
  return new GeographicResolver(new MemoryGeographyCatalogRepository([entry(ids.cuenca, 'Cuenca'), entry(ids.morella, 'Morella'), entry(ids.albarracin, 'Albarracín')]), 'fixture-v1')
}

function phasePort(): BatchEditorialPhasePort {
  let failMorellaOnce = true
  return { async run(context) {
    if (context.job.originalName === 'Morella' && context.phase === 'ADVENTURE' && failMorellaOnce) { failMorellaOnce = false; throw new Error('NETWORK_ERROR: deterministic external boundary') }
    return { artifactRef: `${context.job.id}:${context.phase}`, actualCost: 0, ...(context.phase === 'VISUALS' ? { visualReviewState: 'READY_FOR_HUMAN_VISUAL_REVIEW' as const } : {}) }
  } }
}

function candidate(id: string, title: string, role: 'hero' | 'highlight' | 'gallery'): VisualCandidate { return { candidateId: id, destinationId: ids.cuenca, provider: 'wikimedia_commons', providerAssetId: id, canonicalTitle: title, sourcePageUrl: 'https://commons.example.test/file', originalMediaUrl: 'https://upload.example.test/file.jpg', mimeType: 'image/png', width: 1800, height: 1000, byteSize: 9, creator: 'Autor', uploader: 'Autor', sourceName: 'Wikimedia Commons', licenseShortName: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', usageTerms: 'CC BY 4.0', attributionText: 'Autor · CC BY 4.0', description: title, requestedCategory: 'landmark', requestedRole: role, discoveredAt: '2026-09-26T00:00:00.000Z', providerMetadataHash: hash, normalizedLicense: 'CC_BY_4_0', state: 'ELIGIBLE', rejectionReason: null } }
function asset(id: string, seed: number): typeof DestinationVisualAssetSchema._output { const bytes = png(seed); return { assetId: id, destinationId: ids.cuenca, lifecycle: 'APPROVED', rightsStatus: 'APPROVED_FOR_PUBLIC_USE', usageAllowed: true, rightsCheckedAt: '2026-09-26T00:00:00.000Z', publicUrl: `https://media.example.test/${id}.png`, storageIdentity: `approved/${id}.png`, sourceUrl: 'https://commons.example.test/file', sourceName: 'Wikimedia Commons', author: 'Autor', license: 'CC BY 4.0', attributionText: 'Autor · CC BY 4.0', associatedPlace: null, category: 'landmark', modes: ['adventure'], alt: `Vista de ${id}`, caption: null, width: 1800, height: 1000, mimeType: 'image/png', checksum: checksum(bytes), rejectionReason: null } }

function readyPackage(): { package: StructuredEditorialPackageV1; assets: Map<string, typeof DestinationVisualAssetSchema._output> } {
  const intents = [
    { id: ids.figure, purpose: 'STUDENT_FIGURE' as const, subject: 'Torre de Cuenca', keywords: ['Torre', 'Cuenca'], context: 'Patrimonio documentado.', desiredRole: 'FIGURE' as const, desiredPlacement: 'WIDE' as const, linkedContent: { type: 'STUDENT_BLOCK' as const, id: ids.package }, evidenceRefs: evidence },
    { id: ids.hero, purpose: 'ADVENTURE_HERO' as const, subject: 'Mirador de Cuenca', keywords: ['Mirador', 'Cuenca'], context: 'Paisaje documentado.', desiredRole: 'HERO' as const, desiredPlacement: 'OVERLAY' as const, linkedContent: { type: 'HERO' as const, id: ids.package }, evidenceRefs: evidence },
    { id: ids.story, purpose: 'VISUAL_STORY' as const, subject: 'Casco histórico de Cuenca', keywords: ['Casco', 'Cuenca'], context: 'Centro documentado.', desiredRole: 'HIGHLIGHT' as const, desiredPlacement: 'CARD_OVERLAY' as const, linkedContent: { type: 'VISUAL_STORY_ITEM' as const, id: ids.story }, evidenceRefs: evidence },
    { id: ids.place, purpose: 'PLACE_ASSET' as const, subject: 'Restaurante de Cuenca', keywords: ['Restaurante', 'Cuenca'], context: 'Place documentado.', desiredRole: 'PLACE' as const, desiredPlacement: 'BELOW_MEDIA' as const, linkedContent: { type: 'PLACE' as const, id: ids.place }, evidenceRefs: evidence },
  ]
  const initial = { version: 'structured-editorial-package-v1' as const, packageId: ids.package, executionId: ids.execution, destinationId: ids.cuenca, masterKnowledgeArtifactId: ids.execution, state: 'STRUCTURED_GENERATED' as const, student: { libraryRevision: { libraryEntryId: ids.student, versionId: ids.student, revisionId: ids.student, revisionHash: hash }, document: { version: 'student-document-v1' as const, headline: 'Cuenca documentada', lead: ['Corpus único.'], blocks: [{ type: 'paragraph' as const, text: 'Patrimonio documentado.' }, { type: 'figure' as const, resolution: 'INTENT' as const, visualIntentId: ids.figure, placement: 'WIDE' as const, altHint: 'Torre de Cuenca' }] } }, adventure: { libraryRevision: { libraryEntryId: ids.adventure, versionId: ids.adventure, revisionId: ids.adventure, revisionHash: hash }, document: { version: 'adventure-package-v1' as const, copy: { headline: 'Cuenca visual', hook: 'Adventure independiente.', highlights: [], sections: [], practicalTips: [], evidenceRefs: evidence }, hero: { asset: { status: 'INTENT' as const, visualIntentId: ids.hero }, title: 'Mirador', shortCopy: 'Paisaje.', presentationTone: 'LANDSCAPE' as const, textPlacement: 'OVERLAY' as const, evidenceRefs: evidence }, visualStory: { items: [{ id: ids.story, asset: { status: 'INTENT' as const, visualIntentId: ids.story }, order: 0, presentationTone: 'CULTURE' as const, textPlacement: 'CARD_OVERLAY' as const, evidenceRefs: evidence }] }, placesToGo: { items: [{ id: ids.place, category: 'EAT' as const, name: 'Restaurante de Cuenca', order: 0, shortDescription: 'Evidenciado.', reasonToGo: 'Corpus.', evidenceRefs: evidence, asset: { status: 'INTENT' as const, visualIntentId: ids.place } }], supplementalGaps: [] } } }, visualIntents: intents }
  const candidates = [candidate(ids.figure, 'Torre de Cuenca documentada', 'gallery'), candidate(ids.hero, 'Mirador de Cuenca documentado', 'hero'), candidate(ids.story, 'Casco histórico de Cuenca documentado', 'highlight'), candidate(ids.place, 'Restaurante de Cuenca documentado', 'gallery')]
  const assets = new Map(candidates.map((value, index) => [value.candidateId, asset(value.candidateId, index + 1)]))
  return { package: resolveStructuredVisualIntents({ package: initial, candidates, assetsByCandidateId: assets, sourceVisualPackageId: ids.execution, visualRevisionId: ids.execution, now: () => new Date('2026-09-26T00:00:00.000Z') }), assets }
}

describe('FACTORY_V1_VERTICAL_SLICE', () => {
  it('JSON_MULTI_DESTINATION_IMPORT → isolated worker retry → approved media → V2 outbox fake', async () => {
    const repository = new MemoryDestinationBatchRepository(); const service = new DestinationBatchService(repository, geography())
    const imported = await service.importJson(JSON.stringify({ batchName: 'Prueba España 001', destinations: [{ name: 'Cuenca', country: 'España' }, { name: 'Morella', country: 'España' }, { name: 'Albarracín', country: 'España' }] }))
    expect(imported.jobs.map(job => job.originalName)).toEqual(['Cuenca', 'Morella', 'Albarracín'])
    const worker = new EditorialBatchWorker(repository, phasePort(), { workerId: 'vertical-fixture' })
    await worker.runBatch(imported.batch.id)
    expect((await service.read(imported.batch.id)).jobs.map(job => job.status)).toEqual(['READY_FOR_REVIEW', 'FAILED', 'READY_FOR_REVIEW'])
    await service.retry(imported.jobs[1]!.id); await worker.runJob(imported.jobs[1]!.id)
    expect((await service.read(imported.batch.id)).jobs.every(job => job.status === 'READY_FOR_REVIEW')).toBe(true)

    const resolved = readyPackage(); const approved = materializeApprovedPackageSnapshot(resolved.package, { packageId: ids.package, studentRevisionId: ids.student, adventureRevisionId: ids.adventure, visualPackageId: ids.execution })
    const mappings = new MemoryMediaMappingRepository(); const receipt = new MemoryMediaIngressReceiptRepository()
    const source = { load: async (assetId: string) => { const value = [...resolved.assets.values()].find(item => item.assetId === assetId); return value ? { asset: value, bytes: png([...resolved.assets.values()].findIndex(item => item.assetId === assetId) + 1) } : null } }
    const ingress = await ingressApprovedPackageMedia({ package: approved, approvalDecisionId: ids.execution, currentApprovedPackageId: ids.package, source, mappings, receipts: receipt, client: { upload: async input => ({ trawelMediaId: `trawel-${input.asset.assetId}` }) } })
    expect(ingress).toMatchObject({ state: 'MEDIA_COMPLETE', assetCount: 4 })
    const sources = [
      buildSyntheticApprovedSource('student', true, { title: 'Student fixture', content: '## [intro] Introducción\nStudent.\n## [overview] Contexto\nContexto.\n## [budget] Presupuesto\nPresupuesto.\n## [daily_life] Vida diaria\nVida.\n## [study] Estudio\nEstudio.\n## [practical] Consejos\n- Consejo\n## [risks] Riesgos\nRiesgos.\n' }),
      buildSyntheticApprovedSource('adventure', true, { title: 'Adventure fixture', content: '## [intro] Introducción\nAdventure.\n## [overview] Contexto\nContexto.\n## [highlights] Destacados\n- Vista\n## [route] Ruta\nRuta.\n## [practical] Consejos\n- Consejo\n## [risks] Riesgos\nRiesgos.\n' }),
    ] as const
    const payload = buildApprovedTrawelDeliveryV2({ package: approved, currentApprovedPackageId: ids.package, approvalDecisionId: ids.execution, mediaState: ingress.state, mappings: ingress.mappings, target: { sourceMappingId: 'zone:fixture:cuenca', canonicalDestinationId: 'investighost:zone:fixture:cuenca', entityType: 'zone', entitySlug: 'cuenca', countrySlug: 'espana', zoneSlug: 'cuenca' }, sources })
    expect(JSON.stringify(payload)).not.toContain('storageIdentity')
    const outbox = new MemoryEditorialDeliveryRepository(); const delivery = await new DurableTrawelDeliveryService(outbox, { deliver: async value => ({ success: true, idempotent: false, status: 'accepted', handoffKey: value.handoffKey, payloadFingerprint: value.payloadFingerprint }) as never }).enqueue(payload)
    await new DurableTrawelDeliveryService(outbox, { deliver: async value => ({ success: true, idempotent: false, status: 'accepted', handoffKey: value.handoffKey, payloadFingerprint: value.payloadFingerprint }) as never }).deliver(delivery.id)
    expect((await outbox.findById(delivery.id))?.state).toBe('CONFIRMED')
  })
})
