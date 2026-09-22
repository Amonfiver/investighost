import { canonicalPayloadHash } from '@modules/library-versioning/canonicalization'
import {
  DESTINATION_VISUAL_MEDIA_CONTRACT,
  DestinationVisualMediaPackageSchema,
  type DestinationVisualAssetSchema,
  type DestinationVisualSelectionSchema,
} from '@shared/destination-visual-media-contract'

const VISUAL_MEDIA_PACKAGE_HASH_SCHEMA = 'investighost-destination-visual-media-package-hash-v1' as const

/**
 * Hashes only consumer-visible, stable package content. Review timestamps,
 * source URLs and rejection notes stay out so retries remain idempotent.
 */
export function calculateDestinationVisualMediaPackageHash(
  candidate: typeof DestinationVisualMediaPackageSchema._output,
): string {
  const value = DestinationVisualMediaPackageSchema.parse(candidate)
  const selectedIds = new Set(value.selections.map(selection => selection.assetId))
  const publicAssets = value.assets.filter(asset => asset.lifecycle === 'APPROVED' && selectedIds.has(asset.assetId)).map(asset => publicAssetHashInput(asset))
    .sort((left, right) => left.assetId.localeCompare(right.assetId))
  const publicIds = new Set(publicAssets.map(asset => asset.assetId))
  const selections = value.selections.filter(selection => publicIds.has(selection.assetId)).map(selectionHashInput)
    .sort((left, right) => left.mode.localeCompare(right.mode) || left.role.localeCompare(right.role) || left.priority - right.priority || left.assetId.localeCompare(right.assetId))
  return canonicalPayloadHash({
    schema: VISUAL_MEDIA_PACKAGE_HASH_SCHEMA,
    contract: DESTINATION_VISUAL_MEDIA_CONTRACT,
    destinationId: value.destinationId,
    assets: publicAssets,
    selections,
  })
}

export function assertDestinationVisualMediaPackageHash(candidate: typeof DestinationVisualMediaPackageSchema._output): void {
  const value = DestinationVisualMediaPackageSchema.parse(candidate)
  if (value.state === 'APPROVED' && value.packageHash !== calculateDestinationVisualMediaPackageHash(value)) {
    throw new Error('El hash del paquete visual aprobado no coincide con su contenido público')
  }
}

function publicAssetHashInput(asset: typeof DestinationVisualAssetSchema._output) {
  return {
    assetId: asset.assetId, url: asset.publicUrl, category: asset.category, modes: [...asset.modes].sort(),
    alt: asset.alt, caption: asset.caption, credit: asset.attributionText, source: asset.sourceName,
    rightsStatus: asset.rightsStatus, associatedPlace: asset.associatedPlace, width: asset.width,
    height: asset.height, mimeType: asset.mimeType, checksum: asset.checksum,
  }
}
function selectionHashInput(selection: typeof DestinationVisualSelectionSchema._output) {
  return { assetId: selection.assetId, mode: selection.mode, role: selection.role, priority: selection.priority }
}
