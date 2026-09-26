import type { StructuredEditorialPackageV1 } from '@shared/structured-editorial-package-contracts'
import type { LibraryTrawelApprovedSource } from '@shared/trawel-editorial-handoff-contracts'
import type { TrawelEditorialDeliveryTarget, TrawelEditorialDeliveryV2Payload } from '@shared/trawel-editorial-delivery-contracts'
import { prepareTrawelEditorialDeliveryV2 } from './delivery-v2-adapter'
import type { MediaMapping, MediaIngressState } from './approved-package-media-ingress'

export class ApprovedStructuredPackageDeliveryError extends Error { constructor(message: string) { super(message); this.name = 'ApprovedStructuredPackageDeliveryError' } }

/** Pure V2 builder. It reuses the legacy profile envelope and adds the approved structured snapshot in V2 metadata. */
export function buildApprovedTrawelDeliveryV2(input: {
  package: StructuredEditorialPackageV1
  currentApprovedPackageId: string
  approvalDecisionId: string
  mediaState: MediaIngressState
  mappings: readonly MediaMapping[]
  target: TrawelEditorialDeliveryTarget
  sources: readonly [LibraryTrawelApprovedSource, LibraryTrawelApprovedSource]
}): TrawelEditorialDeliveryV2Payload {
  const value = input.package
  if (value.state !== 'APPROVED') throw new ApprovedStructuredPackageDeliveryError('CURRENT_APPROVED_REQUIRED')
  if (value.packageId !== input.currentApprovedPackageId) throw new ApprovedStructuredPackageDeliveryError('STALE_PACKAGE_BLOCKED')
  if (!input.approvalDecisionId.trim()) throw new ApprovedStructuredPackageDeliveryError('EXACT_APPROVAL_DECISION_REQUIRED')
  if (input.mediaState !== 'MEDIA_COMPLETE') throw new ApprovedStructuredPackageDeliveryError('MEDIA_COMPLETE_REQUIRED')
  if (value.student.libraryRevision.revisionId === value.adventure.libraryRevision.revisionId) throw new ApprovedStructuredPackageDeliveryError('MIXED_REVISIONS_BLOCKED')
  const checksumByAsset = new Map((value.visualResolution?.resolved ?? []).map(item => [item.assetId, item.checksum]))
  const mediaId = (assetId: string) => {
    const checksum = checksumByAsset.get(assetId)
    const mapping = input.mappings.find(item => item.packageId === value.packageId && item.approvalDecisionId === input.approvalDecisionId && item.assetId === assetId && item.checksum === checksum && item.state === 'COMPLETE' && item.trawelMediaId)
    if (!checksum || !mapping?.trawelMediaId) throw new ApprovedStructuredPackageDeliveryError(`MISSING_MEDIA_MAPPING:${assetId}`)
    return mapping.trawelMediaId
  }
  const studentDocument = {
    version: value.student.document.version, headline: value.student.document.headline, lead: value.student.document.lead,
    blocks: value.student.document.blocks.map(block => block.type === 'figure' && block.resolution === 'RESOLVED'
      ? { type: 'figure', resolution: 'RESOLVED', assetId: mediaId(block.assetId), placement: block.placement, alt: block.alt, ...(block.caption === undefined ? {} : { caption: block.caption }) }
      : block),
  }
  const adventure = value.adventure.document
  const hero = { ...adventure.hero, assetId: resolvedMedia(adventure.hero.asset, mediaId) }
  delete (hero as { asset?: unknown }).asset
  const visualStory = adventure.visualStory.items.map(item => { const projected = { ...item, trawelMediaId: resolvedMedia(item.asset, mediaId) }; delete (projected as { asset?: unknown }).asset; return projected })
  const places = adventure.placesToGo.items.map(place => {
    if (!place.asset) return place
    const projected = { ...place, trawelMediaId: resolvedMedia(place.asset, mediaId) }
    delete (projected as { asset?: unknown }).asset
    return projected
  })
  const identity = { packageId: value.packageId, executionId: value.executionId, destinationId: value.destinationId, approvalDecisionId: input.approvalDecisionId, masterKnowledgeArtifactId: value.masterKnowledgeArtifactId, studentRevisionId: value.student.libraryRevision.revisionId, adventureRevisionId: value.adventure.libraryRevision.revisionId, visualRevisionId: value.visualResolution?.visualRevisionId ?? null }
  return prepareTrawelEditorialDeliveryV2({
    target: input.target, sources: input.sources,
    profileMetadataExtensions: {
      student: { structuredPackage: { identity, studentDocumentV1: studentDocument } },
      adventure: { structuredPackage: { identity, adventurePackageV1: { version: adventure.version, copy: adventure.copy, hero, destinationVisualStory: visualStory, placesToGo: { items: places, supplementalGaps: adventure.placesToGo.supplementalGaps } } } },
    },
  })
}

function resolvedMedia(reference: { status: 'RESOLVED'; assetId: string } | { status: 'INTENT'; visualIntentId: string }, mediaId: (assetId: string) => string): string {
  if (reference.status !== 'RESOLVED') throw new ApprovedStructuredPackageDeliveryError('UNRESOLVED_MEDIA_REFERENCE')
  return mediaId(reference.assetId)
}
