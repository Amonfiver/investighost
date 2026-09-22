import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DestinationVisualMediaPackageSchema,
  type DestinationVisualMediaPackageSchema as DestinationVisualMediaPackageSchemaType,
} from '@shared/destination-visual-media-contract'
import type { VisualAsset, VisualCandidateStage, VisualStoredBlob } from './processing-contracts'

export interface VisualProcessingRepository {
  findStage(candidateId: string): Promise<VisualCandidateStage | null>
  upsertStage(stage: VisualCandidateStage): Promise<VisualCandidateStage>
  findBlob(checksum: string): Promise<VisualStoredBlob | null>
  upsertBlob(blob: VisualStoredBlob): Promise<VisualStoredBlob>
  findAssetByChecksum(destinationId: string, checksum: string): Promise<VisualAsset | null>
  upsertAsset(asset: VisualAsset): Promise<VisualAsset>
  retainProvenance(assetId: string, candidateId: string): Promise<void>
  savePackage(destinationId: string, packageValue: typeof DestinationVisualMediaPackageSchemaType._output): Promise<typeof DestinationVisualMediaPackageSchemaType._output>
}

export class MemoryVisualProcessingRepository implements VisualProcessingRepository {
  readonly stages = new Map<string, VisualCandidateStage>()
  readonly blobs = new Map<string, VisualStoredBlob>()
  readonly assets = new Map<string, VisualAsset>()
  readonly provenance = new Set<string>()
  readonly packages = new Map<string, typeof DestinationVisualMediaPackageSchemaType._output>()

  async findStage(candidateId: string): Promise<VisualCandidateStage | null> { return clone(this.stages.get(candidateId) ?? null) }
  async upsertStage(stage: VisualCandidateStage): Promise<VisualCandidateStage> { this.stages.set(stage.candidateId, clone(stage)); return clone(stage) }
  async findBlob(checksum: string): Promise<VisualStoredBlob | null> { return clone(this.blobs.get(checksum) ?? null) }
  async upsertBlob(blob: VisualStoredBlob): Promise<VisualStoredBlob> { const saved = this.blobs.get(blob.checksum) ?? blob; this.blobs.set(blob.checksum, clone(saved)); return clone(saved) }
  async findAssetByChecksum(destinationId: string, checksum: string): Promise<VisualAsset | null> {
    return clone([...this.assets.values()].find(asset => asset.destinationId === destinationId && asset.checksum === checksum) ?? null)
  }
  async upsertAsset(asset: VisualAsset): Promise<VisualAsset> {
    const existing = await this.findAssetByChecksum(asset.destinationId, required(asset.checksum))
    const saved = existing ?? asset
    this.assets.set(saved.assetId, clone(saved))
    return clone(saved)
  }
  async retainProvenance(assetId: string, candidateId: string): Promise<void> { this.provenance.add(`${assetId}:${candidateId}`) }
  async savePackage(destinationId: string, packageValue: typeof DestinationVisualMediaPackageSchemaType._output): Promise<typeof DestinationVisualMediaPackageSchemaType._output> {
    const existing = this.packages.get(destinationId)
    const saved = existing === undefined ? packageValue : { ...packageValue, packageId: existing.packageId }
    this.packages.set(destinationId, clone(saved))
    return clone(saved)
  }
}

/** Durable persistence for staged bytes metadata, global blobs, approved assets and their provenance. */
export class SupabaseVisualProcessingRepository implements VisualProcessingRepository {
  constructor(private readonly client: Pick<SupabaseClient, 'from'>) {}

  async findStage(candidateId: string): Promise<VisualCandidateStage | null> {
    const { data, error } = await this.client.from('real_editorial_visual_candidate_stages').select('*').eq('candidate_id', candidateId).maybeSingle()
    if (error) throw new Error(`VISUAL_STAGE_LOOKUP_FAILED:${error.message}`)
    return data === null ? null : stageFromRow(data as Record<string, unknown>)
  }
  async upsertStage(stage: VisualCandidateStage): Promise<VisualCandidateStage> {
    const { data, error } = await this.client.from('real_editorial_visual_candidate_stages').upsert(stageRow(stage), { onConflict: 'candidate_id' }).select().single()
    if (error) throw new Error(`VISUAL_STAGE_UPSERT_FAILED:${error.message}`)
    return stageFromRow(data as Record<string, unknown>)
  }
  async findBlob(checksum: string): Promise<VisualStoredBlob | null> {
    const { data, error } = await this.client.from('real_editorial_visual_blobs').select('*').eq('checksum', checksum).maybeSingle()
    if (error) throw new Error(`VISUAL_BLOB_LOOKUP_FAILED:${error.message}`)
    return data === null ? null : blobFromRow(data as Record<string, unknown>)
  }
  async upsertBlob(blob: VisualStoredBlob): Promise<VisualStoredBlob> {
    const { data, error } = await this.client.from('real_editorial_visual_blobs').upsert(blobRow(blob), { onConflict: 'checksum' }).select().single()
    if (error) throw new Error(`VISUAL_BLOB_UPSERT_FAILED:${error.message}`)
    return blobFromRow(data as Record<string, unknown>)
  }
  async findAssetByChecksum(destinationId: string, checksum: string): Promise<VisualAsset | null> {
    const { data, error } = await this.client.from('real_editorial_visual_assets').select('*')
      .eq('canonical_destination_id', destinationId).eq('checksum', checksum).maybeSingle()
    if (error) throw new Error(`VISUAL_ASSET_LOOKUP_FAILED:${error.message}`)
    return data === null ? null : assetFromRow(data as Record<string, unknown>)
  }
  async upsertAsset(asset: VisualAsset): Promise<VisualAsset> {
    const existing = await this.findAssetByChecksum(asset.destinationId, required(asset.checksum))
    const row = assetRow(asset)
    const query = existing === null
      ? this.client.from('real_editorial_visual_assets').insert(row).select().single()
      : this.client.from('real_editorial_visual_assets').update(row).eq('id', existing.assetId).select().single()
    const { data, error } = await query
    if (error) throw new Error(`VISUAL_ASSET_UPSERT_FAILED:${error.message}`)
    return assetFromRow(data as Record<string, unknown>)
  }
  async retainProvenance(assetId: string, candidateId: string): Promise<void> {
    const { error } = await this.client.from('real_editorial_visual_asset_candidates').upsert({ asset_id: assetId, candidate_id: candidateId }, { onConflict: 'asset_id,candidate_id' })
    if (error) throw new Error(`VISUAL_PROVENANCE_UPSERT_FAILED:${error.message}`)
  }
  async savePackage(destinationId: string, packageValue: typeof DestinationVisualMediaPackageSchemaType._output): Promise<typeof DestinationVisualMediaPackageSchemaType._output> {
    const { data: current, error: lookupError } = await this.client.from('real_editorial_visual_packages').select('id')
      .eq('canonical_destination_id', destinationId).eq('workflow_key', 'visual-acquisition-v1').maybeSingle()
    if (lookupError) throw new Error(`VISUAL_PACKAGE_LOOKUP_FAILED:${lookupError.message}`)
    const packageId = current === null ? packageValue.packageId : text((current as Record<string, unknown>).id)
    const row = { id: packageId, canonical_destination_id: destinationId, workflow_key: 'visual-acquisition-v1', state: packageValue.state, package_hash: packageValue.packageHash, rejection_reason: null, approved_at: packageValue.state === 'APPROVED' ? new Date().toISOString() : null }
    const packageQuery = current === null
      ? this.client.from('real_editorial_visual_packages').insert(row)
      : this.client.from('real_editorial_visual_packages').update(row).eq('id', packageId)
    const { error } = await packageQuery
    if (error) throw new Error(`VISUAL_PACKAGE_SAVE_FAILED:${error.message}`)
    const { error: removeError } = await this.client.from('real_editorial_visual_package_selections').delete().eq('package_id', packageId)
    if (removeError) throw new Error(`VISUAL_SELECTION_DELETE_FAILED:${removeError.message}`)
    if (packageValue.selections.length > 0) {
      const { error: selectionError } = await this.client.from('real_editorial_visual_package_selections').insert(packageValue.selections.map(selection => ({
        id: randomUUID(), package_id: packageId, canonical_destination_id: destinationId, asset_id: selection.assetId,
        mode: selection.mode, role: selection.role, priority: selection.priority,
      })))
      if (selectionError) throw new Error(`VISUAL_SELECTION_SAVE_FAILED:${selectionError.message}`)
    }
    return DestinationVisualMediaPackageSchema.parse({ ...packageValue, packageId })
  }
}

function stageRow(stage: VisualCandidateStage) { return { candidate_id: stage.candidateId, state: stage.state, staging_bucket: stage.stagingBucket, staging_storage_identity: stage.stagingStorageIdentity, checksum: stage.checksum, detected_mime_type: stage.detectedMimeType, width: stage.width, height: stage.height, byte_size: stage.byteSize, downloaded_at: stage.downloadedAt, failure_code: stage.failureCode } }
function blobRow(blob: VisualStoredBlob) { return { checksum: blob.checksum, storage_bucket: blob.bucket, storage_identity: blob.storageIdentity, public_url: blob.publicUrl, mime_type: blob.mimeType, width: blob.width, height: blob.height, byte_size: blob.byteSize } }
function assetRow(asset: VisualAsset) { return { id: asset.assetId, canonical_destination_id: asset.destinationId, lifecycle: asset.lifecycle, rights_status: asset.rightsStatus, usage_allowed: asset.usageAllowed, rights_checked_at: asset.rightsCheckedAt, public_url: asset.publicUrl, storage_identity: asset.storageIdentity, source_url: asset.sourceUrl, source_name: asset.sourceName, author: asset.author, license: asset.license, attribution_text: asset.attributionText, associated_place: asset.associatedPlace, category: asset.category, modes: asset.modes, alt: asset.alt, caption: asset.caption, width: asset.width, height: asset.height, mime_type: asset.mimeType, checksum: asset.checksum, rejection_reason: asset.rejectionReason } }
function stageFromRow(row: Record<string, unknown>): VisualCandidateStage { return { candidateId: text(row.candidate_id), state: text(row.state) as VisualCandidateStage['state'], stagingBucket: nullableText(row.staging_bucket) as VisualCandidateStage['stagingBucket'], stagingStorageIdentity: nullableText(row.staging_storage_identity), checksum: nullableText(row.checksum), detectedMimeType: nullableText(row.detected_mime_type) as VisualCandidateStage['detectedMimeType'], width: nullableNumber(row.width), height: nullableNumber(row.height), byteSize: nullableNumber(row.byte_size), downloadedAt: nullableText(row.downloaded_at), failureCode: nullableText(row.failure_code) } }
function blobFromRow(row: Record<string, unknown>): VisualStoredBlob { return { checksum: text(row.checksum), bucket: 'images-approved', storageIdentity: text(row.storage_identity), publicUrl: text(row.public_url), mimeType: text(row.mime_type) as VisualStoredBlob['mimeType'], width: Number(row.width), height: Number(row.height), byteSize: Number(row.byte_size) } }
function assetFromRow(row: Record<string, unknown>): VisualAsset { return { assetId: text(row.id), destinationId: text(row.canonical_destination_id), lifecycle: text(row.lifecycle) as VisualAsset['lifecycle'], rightsStatus: text(row.rights_status) as VisualAsset['rightsStatus'], usageAllowed: nullableBoolean(row.usage_allowed), rightsCheckedAt: nullableText(row.rights_checked_at), publicUrl: nullableText(row.public_url), storageIdentity: nullableText(row.storage_identity), sourceUrl: nullableText(row.source_url), sourceName: nullableText(row.source_name), author: nullableText(row.author), license: nullableText(row.license), attributionText: nullableText(row.attribution_text), associatedPlace: nullableText(row.associated_place), category: text(row.category) as VisualAsset['category'], modes: row.modes as VisualAsset['modes'], alt: nullableText(row.alt), caption: nullableText(row.caption), width: nullableNumber(row.width), height: nullableNumber(row.height), mimeType: nullableText(row.mime_type), checksum: nullableText(row.checksum), rejectionReason: nullableText(row.rejection_reason) } }
function text(value: unknown): string { if (typeof value !== 'string') throw new Error('VISUAL_PROCESSING_ROW_INVALID'); return value }
function nullableText(value: unknown): string | null { return value === null || value === undefined ? null : text(value) }
function nullableNumber(value: unknown): number | null { return value === null || value === undefined ? null : Number(value) }
function nullableBoolean(value: unknown): boolean | null { return value === null || value === undefined ? null : Boolean(value) }
function required(value: string | null): string { if (value === null) throw new Error('VISUAL_CHECKSUM_REQUIRED'); return value }
function clone<T>(value: T): T { return structuredClone(value) }
