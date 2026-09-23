import { randomUUID } from 'node:crypto'
import {
  DESTINATION_VISUAL_MEDIA_CONTRACT,
  DestinationVisualMediaPackageSchema,
  type DestinationVisualMediaPackageSchema as DestinationVisualMediaPackageSchemaType,
} from '@shared/destination-visual-media-contract'
import type { VisualCandidate } from '@shared/visual-candidate-contracts'
import { VisualCandidateDownloader, VisualDownloadError, type ValidatedVisualDownload } from './byte-validation'
import { isFinalRightsEligible, selectVisualCandidates, type SelectedVisualCandidate, type VisualCandidateSelectionPlan } from './candidate-selection'
import type { VisualCandidateRepository } from './candidate-repository'
import type { VisualMediaStorage } from './media-storage'
import type { VisualAsset, VisualCandidateStage, VisualPromotion, VisualStoredBlob } from './processing-contracts'
import type { VisualProcessingRepository } from './processing-repository'
import { calculateDestinationVisualMediaPackageHash } from '@modules/trawel-handoff/visual-media-package'

export type CandidateAcquisitionResult = {
  selected: SelectedVisualCandidate[]
  promotions: VisualPromotion[]
  failures: Array<{ candidateId: string; code: string }>
  package: typeof DestinationVisualMediaPackageSchemaType._output
}

export type LocalVisualReviewPreparation = {
  selected: SelectedVisualCandidate[]
  stagedCandidateIds: string[]
  failures: Array<{ candidateId: string; code: string }>
  package: typeof DestinationVisualMediaPackageSchemaType._output
}

/**
 * The only bridge from an internal eligible candidate to an approved Visual Bridge asset.
 * It has no handoff dependency and never invokes Trawel.
 */
export class VisualCandidateAcquisitionService {
  constructor(
    private readonly candidates: VisualCandidateRepository,
    private readonly processing: VisualProcessingRepository,
    private readonly downloader: VisualCandidateDownloader,
    private readonly storage: VisualMediaStorage,
    private readonly now: () => Date = () => new Date(),
    private readonly assetId: () => string = randomUUID,
    private readonly packageId: () => string = randomUUID,
  ) {}

  async acquireDestination(destinationId: string, plan: VisualCandidateSelectionPlan): Promise<CandidateAcquisitionResult> {
    return this.acquire(await this.candidates.listByDestination(destinationId), plan)
  }

  async previousCandidateIds(packageId: string): Promise<string[]> { return this.processing.candidateIdsForPackage(packageId) }

  /**
   * Prepares a rights-safe, private review package. It intentionally never
   * calls public storage: the HTTPS media URL belongs to the approved Trawel
   * delivery bridge, not to Investighost's local factory runtime.
   */
  async prepareDestinationForHumanVisualReview(destinationId: string, plan: VisualCandidateSelectionPlan, workflowKey = 'visual-acquisition-v1'): Promise<LocalVisualReviewPreparation> {
    const candidates = await this.candidates.listByDestination(destinationId)
    const selected = selectVisualCandidates(candidates, plan)
    const assets: VisualAsset[] = []
    const preparedSelections: Array<{ selection: SelectedVisualCandidate; asset: VisualAsset }> = []
    const failures: Array<{ candidateId: string; code: string }> = []
    const stagedCandidateIds: string[] = []
    for (const selection of selected) {
      try {
        const candidate = selection.candidate
        if (candidate.description === null) throw new Error('ALT_REQUIRED_FOR_REVIEW_ASSET')
        const stage = await this.processing.findStage(candidate.candidateId)
        const downloaded = stage?.state === 'STAGED' ? await this.downloadedFromStage(stage) : await this.downloadAndStage(candidate)
        const existing = await this.processing.findAssetByChecksum(candidate.destinationId, downloaded.checksum)
        const asset = existing ?? await this.processing.upsertAsset(pendingReviewAsset(candidate, selection, downloaded, this.assetId()))
        await this.processing.retainProvenance(asset.assetId, candidate.candidateId)
        assets.push(asset); preparedSelections.push({ selection, asset }); stagedCandidateIds.push(candidate.candidateId)
      } catch (error) {
        const code = failureCode(error)
        if (isPermanentFailure(code)) await this.processing.upsertStage(rejectedStage(selection.candidate.candidateId, code))
        failures.push({ candidateId: selection.candidate.candidateId, code })
      }
    }
    const packageValue = await this.buildAndSavePrivateReviewPackage(destinationId, assets, preparedSelections, workflowKey)
    return { selected, stagedCandidateIds, failures, package: packageValue }
  }

  async acquire(candidates: readonly VisualCandidate[], plan: VisualCandidateSelectionPlan): Promise<CandidateAcquisitionResult> {
    const selected = selectVisualCandidates(candidates, plan)
    const promotions: VisualPromotion[] = []
    const failures: Array<{ candidateId: string; code: string }> = []
    for (const selection of selected) {
      try { promotions.push(await this.promote(selection)) }
      catch (error) {
        const code = failureCode(error)
        if (isPermanentFailure(code)) await this.processing.upsertStage(rejectedStage(selection.candidate.candidateId, code))
        failures.push({ candidateId: selection.candidate.candidateId, code })
      }
    }
    const packageValue = await this.buildAndSavePackage(candidates[0]?.destinationId ?? null, promotions)
    return { selected, promotions, failures, package: packageValue }
  }

  private async promote(selection: SelectedVisualCandidate): Promise<VisualPromotion> {
    const candidate = selection.candidate
    if (!isFinalRightsEligible(candidate)) throw new Error('RIGHTS_NOT_APPROVED')
    if (candidate.description === null) throw new Error('ALT_REQUIRED_FOR_PUBLIC_ASSET')
    const stage = await this.processing.findStage(candidate.candidateId)
    if (stage?.state === 'REJECTED') throw new Error(stage.failureCode ?? 'STAGE_REJECTED')
    const downloaded = stage?.state === 'STAGED'
      ? await this.downloadedFromStage(stage)
      : await this.downloadAndStage(candidate)
    const blob = await this.getOrPromoteBlob(downloaded)
    const existing = await this.processing.findAssetByChecksum(candidate.destinationId, downloaded.checksum)
    const asset = existing === null
      ? await this.processing.upsertAsset(approvedAsset(candidate, selection, blob, downloaded, this.assetId(), this.now().toISOString()))
      : await this.processing.upsertAsset({ ...existing, modes: [...new Set([...existing.modes, ...selection.modes])].sort() })
    await this.processing.retainProvenance(asset.assetId, candidate.candidateId)
    return { selection, asset }
  }

  private async downloadAndStage(candidate: VisualCandidate): Promise<ValidatedVisualDownload> {
    const downloaded = await this.downloader.download(candidate)
    const staged = await this.storage.stage(candidate.destinationId, candidate.candidateId, downloaded)
    await this.processing.upsertStage({
      candidateId: candidate.candidateId, state: 'STAGED', stagingBucket: staged.bucket, stagingStorageIdentity: staged.storageIdentity,
      checksum: downloaded.checksum, detectedMimeType: downloaded.mimeType, width: downloaded.width, height: downloaded.height,
      byteSize: downloaded.byteSize, downloadedAt: downloaded.downloadedAt, failureCode: null,
    })
    return downloaded
  }

  private async downloadedFromStage(stage: VisualCandidateStage): Promise<ValidatedVisualDownload> {
    if (stage.stagingBucket === null || stage.stagingStorageIdentity === null || stage.checksum === null || stage.detectedMimeType === null || stage.width === null || stage.height === null || stage.byteSize === null || stage.downloadedAt === null) throw new Error('STAGE_METADATA_INCOMPLETE')
    const bytes = await this.storage.readStage({ bucket: stage.stagingBucket, storageIdentity: stage.stagingStorageIdentity })
    const checksum = await checksumOf(bytes)
    if (checksum !== stage.checksum || bytes.byteLength !== stage.byteSize) throw new Error('STAGE_INTEGRITY_MISMATCH')
    return { bytes, checksum, mimeType: stage.detectedMimeType, width: stage.width, height: stage.height, byteSize: stage.byteSize, extension: extension(stage.detectedMimeType), downloadedAt: stage.downloadedAt }
  }

  private async getOrPromoteBlob(downloaded: ValidatedVisualDownload): Promise<VisualStoredBlob> {
    const existing = await this.processing.findBlob(downloaded.checksum)
    if (existing !== null) return existing
    const stored = await this.storage.promote(downloaded)
    return this.processing.upsertBlob({ checksum: downloaded.checksum, bucket: stored.bucket, storageIdentity: stored.storageIdentity, publicUrl: stored.publicUrl, mimeType: downloaded.mimeType, width: downloaded.width, height: downloaded.height, byteSize: downloaded.byteSize })
  }

  private async buildAndSavePackage(destinationId: string | null, promotions: readonly VisualPromotion[]): Promise<typeof DestinationVisualMediaPackageSchemaType._output> {
    if (destinationId === null) return DestinationVisualMediaPackageSchema.parse({ schema: DESTINATION_VISUAL_MEDIA_CONTRACT, packageId: this.packageId(), destinationId: '00000000-0000-4000-8000-000000000000', state: 'DRAFT', packageHash: null, assets: [], selections: [] })
    const assets = distinctBy(promotions.map(promotion => promotion.asset), asset => asset.assetId)
    const selections = promotions.flatMap(({ selection, asset }) => selection.modes.map(mode => ({ assetId: asset.assetId, mode, role: selection.role, priority: selection.priority })))
    const complete = selections.some(selection => selection.mode === 'adventure' && selection.role === 'hero')
      && selections.filter(selection => selection.mode === 'adventure' && selection.role === 'highlight').length >= 2
      && selections.some(selection => selection.mode === 'adventure' && selection.role === 'gallery')
    const state: typeof DestinationVisualMediaPackageSchemaType._output['state'] = assets.length === 0 ? 'DRAFT' : complete ? 'APPROVED' : 'PARTIAL'
    const base = { schema: DESTINATION_VISUAL_MEDIA_CONTRACT, packageId: this.packageId(), destinationId, state, packageHash: null, assets, selections }
    const packageHash = state === 'APPROVED' ? calculateDestinationVisualMediaPackageHash({ ...base, packageHash: '0'.repeat(64) }) : null
    return this.processing.savePackage(destinationId, DestinationVisualMediaPackageSchema.parse({ ...base, packageHash }))
  }

  private async buildAndSavePrivateReviewPackage(destinationId: string, assets: readonly VisualAsset[], prepared: ReadonlyArray<{ selection: SelectedVisualCandidate; asset: VisualAsset }>, workflowKey: string): Promise<typeof DestinationVisualMediaPackageSchemaType._output> {
    const selections = prepared.flatMap(({ selection, asset }) => selection.modes.map(mode => ({ assetId: asset.assetId, mode, role: selection.role, priority: selection.priority })))
    const state: typeof DestinationVisualMediaPackageSchemaType._output['state'] = assets.length === 0 ? 'DRAFT' : 'PARTIAL'
    return this.processing.savePackage(destinationId, DestinationVisualMediaPackageSchema.parse({
      schema: DESTINATION_VISUAL_MEDIA_CONTRACT, packageId: this.packageId(), destinationId, state, packageHash: null,
      assets: distinctBy(assets, asset => asset.assetId), selections,
    }), workflowKey)
  }
}

function approvedAsset(candidate: VisualCandidate, selection: SelectedVisualCandidate, blob: VisualStoredBlob, downloaded: ValidatedVisualDownload, assetId: string, checkedAt: string): VisualAsset {
  const alt = candidate.description
  if (alt === null) throw new Error('ALT_REQUIRED_FOR_PUBLIC_ASSET')
  return {
    assetId, destinationId: candidate.destinationId, lifecycle: 'APPROVED', rightsStatus: 'APPROVED_FOR_PUBLIC_USE', usageAllowed: true,
    rightsCheckedAt: checkedAt, publicUrl: blob.publicUrl, storageIdentity: `${blob.bucket}/${blob.storageIdentity}`,
    sourceUrl: candidate.sourcePageUrl, sourceName: candidate.sourceName, author: candidate.creator, license: candidate.licenseShortName,
    attributionText: candidate.attributionText, associatedPlace: null, category: candidate.requestedCategory, modes: selection.modes,
    alt, caption: candidate.description, width: downloaded.width, height: downloaded.height, mimeType: downloaded.mimeType,
    checksum: downloaded.checksum, rejectionReason: null,
  }
}
function pendingReviewAsset(candidate: VisualCandidate, selection: SelectedVisualCandidate, downloaded: ValidatedVisualDownload, assetId: string): VisualAsset {
  return {
    assetId, destinationId: candidate.destinationId, lifecycle: 'PENDING', rightsStatus: 'PENDING', usageAllowed: null,
    rightsCheckedAt: null, publicUrl: null, storageIdentity: `visual-staging-private/${candidate.destinationId}/${candidate.candidateId}/${downloaded.checksum}.${downloaded.extension}`,
    sourceUrl: candidate.sourcePageUrl, sourceName: candidate.sourceName, author: candidate.creator, license: candidate.licenseShortName,
    attributionText: candidate.attributionText, associatedPlace: null, category: candidate.requestedCategory, modes: selection.modes,
    alt: candidate.description, caption: candidate.description, width: downloaded.width, height: downloaded.height,
    mimeType: downloaded.mimeType, checksum: downloaded.checksum, rejectionReason: null,
  }
}

function rejectedStage(candidateId: string, failureCode: string): VisualCandidateStage { return { candidateId, state: 'REJECTED', stagingBucket: null, stagingStorageIdentity: null, checksum: null, detectedMimeType: null, width: null, height: null, byteSize: null, downloadedAt: null, failureCode } }
function failureCode(error: unknown): string {
  if (error instanceof VisualDownloadError) return error.code
  const raw = error instanceof Error ? error.message.split(':')[0] : 'PROCESSING_FAILED'
  if (raw === 'VISUAL_STAGING_UPLOAD_FAILED' || raw === 'VISUAL_PUBLIC_PROMOTION_FAILED') return 'STORAGE_FAILURE'
  return raw || 'PROCESSING_FAILED'
}
function isPermanentFailure(code: string): boolean { return ['INVALID_CONTENT_TYPE', 'INVALID_MAGIC_BYTES', 'TOO_LARGE', 'CORRUPT_IMAGE', 'DIMENSIONS_TOO_SMALL', 'RIGHTS_NOT_APPROVED', 'ALT_REQUIRED_FOR_PUBLIC_ASSET', 'PUBLIC_URL_INVALID', 'REDIRECT_NOT_ALLOWED'].includes(code) }
function extension(mimeType: ValidatedVisualDownload['mimeType']): ValidatedVisualDownload['extension'] { return mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp' }
async function checksumOf(bytes: Uint8Array): Promise<string> { const { createHash } = await import('node:crypto'); return createHash('sha256').update(bytes).digest('hex') }
function distinctBy<T>(values: readonly T[], key: (value: T) => string): T[] { const seen = new Set<string>(); return values.filter(value => { const valueKey = key(value); if (seen.has(valueKey)) return false; seen.add(valueKey); return true }) }
