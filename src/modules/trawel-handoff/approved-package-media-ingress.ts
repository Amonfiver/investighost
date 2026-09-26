import { createHash } from 'node:crypto'
import type { StructuredEditorialPackageV1 } from '@shared/structured-editorial-package-contracts'
import type { DestinationVisualAssetSchema } from '@shared/destination-visual-media-contract'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseTrawelIngressConfig } from './trawel-ingress-client'

type Asset = typeof DestinationVisualAssetSchema._output
export type MediaIngressState = 'MEDIA_PENDING' | 'MEDIA_PARTIAL' | 'MEDIA_COMPLETE'
export type ApprovedMedia = { asset: Asset; bytes: Uint8Array }
export type MediaMapping = { packageId: string; approvalDecisionId: string; destinationId: string; executionId: string; assetId: string; checksum: string; trawelMediaId: string | null; uploadedAt: string | null; state: 'COMPLETE' | 'FAILED_RETRYABLE' | 'FAILED_PERMANENT'; failureCode?: string; failureMessage?: string }
export interface ApprovedMediaSource { load(assetId: string): Promise<ApprovedMedia | null> }
export interface MediaMappingRepository { find(packageId: string, assetId: string, checksum: string): Promise<MediaMapping | null>; save(mapping: MediaMapping): Promise<void> }
export type MediaIngressReceipt = { packageId: string; approvalDecisionId: string; assetCount: number; uploadedCount: number; reusedCount: number; failedCount: number; state: MediaIngressState; startedAt: string; completedAt: string | null }
export interface MediaIngressReceiptRepository { save(receipt: MediaIngressReceipt): Promise<void> }
export interface TrawelMediaClient { upload(input: { bytes: Uint8Array; asset: Asset; checksum: string }): Promise<{ trawelMediaId: string }> }
/** Reuses the privileged editorial ingress configuration and never exposes its secret. */
export function parseTrawelMediaIngressConfig(environment: NodeJS.ProcessEnv): { url: string; secret: string } { const config = parseTrawelIngressConfig(environment); return { url: `${config.url.replace(/\/$/, '')}/media`, secret: config.internalSecret } }
export class HttpTrawelMediaClient implements TrawelMediaClient {
  constructor(private readonly input: { url: string; secret: string; timeoutMs?: number; fetchFn?: typeof fetch; allowInsecureForTests?: boolean }) { const url = new URL(input.url); if (url.protocol !== 'https:' && !input.allowInsecureForTests) throw new Error('TRAWEL_MEDIA_HTTPS_REQUIRED'); if (!input.secret.trim()) throw new Error('TRAWEL_MEDIA_SECRET_REQUIRED') }
  async upload(input: { bytes: Uint8Array; asset: Asset; checksum: string }): Promise<{ trawelMediaId: string }> {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), this.input.timeoutMs ?? 10_000)
    try { const form = new FormData(); form.set('file', new Blob([new Uint8Array(input.bytes).buffer], { type: input.asset.mimeType ?? 'application/octet-stream' }), `${input.asset.assetId}`); form.set('metadata', JSON.stringify({ assetId: input.asset.assetId, checksum: input.checksum, mimeType: input.asset.mimeType, source: input.asset.sourceUrl, license: input.asset.license, credit: input.asset.attributionText, rightsStatus: input.asset.rightsStatus })); const response = await (this.input.fetchFn ?? fetch)(this.input.url, { method: 'POST', signal: controller.signal, headers: { 'x-internal-editorial-secret': this.input.secret }, body: form }); if (!response.ok) throw new Error(response.status >= 500 ? 'HTTP_5XX' : `HTTP_${response.status}`); const body = await response.json() as { trawelMediaId?: unknown }; if (typeof body.trawelMediaId !== 'string' || !body.trawelMediaId.trim()) throw new Error('INVALID_RESPONSE'); return { trawelMediaId: body.trawelMediaId } } catch (error) { if (error instanceof Error && error.name === 'AbortError') throw new Error('TIMEOUT'); throw error instanceof Error ? error : new Error('NETWORK_ERROR') } finally { clearTimeout(timeout) }
  }
}
export class MemoryMediaMappingRepository implements MediaMappingRepository { readonly values: MediaMapping[] = []; async find(packageId: string, assetId: string, checksum: string) { const value = this.values.find(item => item.packageId === packageId && item.assetId === assetId && item.checksum === checksum); return value ? structuredClone(value) : null } async save(mapping: MediaMapping) { const index = this.values.findIndex(item => item.packageId === mapping.packageId && item.assetId === mapping.assetId && item.checksum === mapping.checksum); if (index >= 0) this.values[index] = structuredClone(mapping); else this.values.push(structuredClone(mapping)) } }
export class MemoryMediaIngressReceiptRepository implements MediaIngressReceiptRepository { readonly values: MediaIngressReceipt[] = []; async save(value: MediaIngressReceipt) { this.values.push(structuredClone(value)) } }
export class SupabaseMediaMappingRepository implements MediaMappingRepository {
  constructor(private readonly client: Pick<SupabaseClient, 'from'>) {}
  async find(packageId: string, assetId: string, checksum: string): Promise<MediaMapping | null> { const { data, error } = await this.client.from('real_editorial_trawel_media_mappings').select('*').eq('package_id', packageId).eq('local_asset_id', assetId).eq('checksum_sha256', checksum).maybeSingle(); if (error) throw new Error('MEDIA_MAPPING_LOOKUP_FAILED'); return data ? row(data as Record<string, unknown>) : null }
  async save(value: MediaMapping): Promise<void> { const { error } = await this.client.from('real_editorial_trawel_media_mappings').upsert({ package_id: value.packageId, approval_decision_id: value.approvalDecisionId, destination_id: value.destinationId, execution_id: value.executionId, local_asset_id: value.assetId, checksum_sha256: value.checksum, trawel_media_id: value.trawelMediaId, endpoint_identity: 'trawel-internal-media-v1', upload_state: value.state, failure_code: value.failureCode ?? null, failure_message: value.failureMessage ?? null, uploaded_at: value.uploadedAt, updated_at: new Date().toISOString() }, { onConflict: 'package_id,local_asset_id,checksum_sha256' }); if (error) throw new Error('MEDIA_MAPPING_SAVE_FAILED') }
}
export class SupabaseMediaIngressReceiptRepository implements MediaIngressReceiptRepository { constructor(private readonly client: Pick<SupabaseClient, 'from'>) {} async save(value: MediaIngressReceipt): Promise<void> { const { error } = await this.client.from('real_editorial_trawel_media_ingress_receipts').insert({ package_id: value.packageId, approval_decision_id: value.approvalDecisionId, started_at: value.startedAt, completed_at: value.completedAt, asset_count: value.assetCount, uploaded_count: value.uploadedCount, reused_count: value.reusedCount, failed_count: value.failedCount, state: value.state }); if (error) throw new Error('MEDIA_RECEIPT_SAVE_FAILED') } }
export async function ingressApprovedPackageMedia(input: { package: StructuredEditorialPackageV1; approvalDecisionId: string; currentApprovedPackageId: string; source: ApprovedMediaSource; mappings: MediaMappingRepository; receipts?: MediaIngressReceiptRepository; client: TrawelMediaClient; now?: () => Date }) {
  if (input.package.state !== 'APPROVED') throw new Error('ONLY_CURRENT_APPROVED_PACKAGE_CAN_INGRESS_MEDIA')
  if (!input.approvalDecisionId.trim()) throw new Error('EXACT_APPROVAL_DECISION_REQUIRED')
  if (input.currentApprovedPackageId !== input.package.packageId) throw new Error('STALE_APPROVED_PACKAGE_BLOCKED')
  const studentRevision = input.package.student?.libraryRevision?.revisionId
  const adventureRevision = input.package.adventure?.libraryRevision?.revisionId
  if (studentRevision && adventureRevision && studentRevision === adventureRevision) throw new Error('MIXED_PACKAGE_BLOCKED')
  const ids = referencedAssets(input.package)
  const mappings: MediaMapping[] = []; let reused = 0; const failures: Array<{ assetId: string; code: string }> = []
  for (const assetId of ids) {
    let asset: Asset | null = null
    let checksum: string | null = null
    try {
      const loaded = await input.source.load(assetId)
      if (!loaded) throw new Error('MISSING_LOCAL_BYTES')
      asset = loaded.asset
      checksum = typeof asset.checksum === 'string' ? asset.checksum : null
      const { bytes } = loaded
      if (asset.lifecycle !== 'APPROVED' || asset.rightsStatus !== 'APPROVED_FOR_PUBLIC_USE' || asset.usageAllowed !== true) throw new Error('RIGHTS_NOT_APPROVED')
      if (!asset.width || !asset.height || !checksum) throw new Error('INVALID_BYTES')
      if (!asset.sourceUrl || !asset.license || !asset.attributionText) throw new Error('INVALID_BYTES')
      const mime = asset.mimeType
      if (!mime || !['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('UNSUPPORTED_MIME')
      if (!magicMatches(bytes, mime)) throw new Error('INVALID_BYTES')
      if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('FILE_TOO_LARGE')
      checksum = createHash('sha256').update(bytes).digest('hex')
      if (checksum !== asset.checksum) throw new Error('CHECKSUM_MISMATCH')
      const existing = await input.mappings.find(input.package.packageId, assetId, checksum)
      if (existing?.state === 'COMPLETE') { mappings.push(existing); reused++; continue }
      if (existing?.state === 'FAILED_PERMANENT') { failures.push({ assetId, code: existing.failureCode ?? 'FAILED_PERMANENT' }); continue }
      const response = await input.client.upload({ bytes, asset, checksum })
      if (!response.trawelMediaId.trim()) throw new Error('INVALID_RESPONSE')
      const mapping: MediaMapping = { packageId: input.package.packageId, approvalDecisionId: input.approvalDecisionId, destinationId: input.package.destinationId, executionId: input.package.executionId, assetId, checksum, trawelMediaId: response.trawelMediaId, uploadedAt: (input.now ?? (() => new Date()))().toISOString(), state: 'COMPLETE' }
      await input.mappings.save(mapping); mappings.push(mapping)
    } catch (error) { const code = error instanceof Error ? error.message.split(':')[0] : 'MEDIA_UPLOAD_FAILED'; const retryable = ['NETWORK_ERROR','TIMEOUT','HTTP_5XX','TEMPORARY_UNAVAILABLE'].includes(code); if (asset && checksum) await input.mappings.save({ packageId: input.package.packageId, approvalDecisionId: input.approvalDecisionId, destinationId: input.package.destinationId, executionId: input.package.executionId, assetId, checksum, trawelMediaId: null, uploadedAt: null, state: retryable ? 'FAILED_RETRYABLE' : 'FAILED_PERMANENT', failureCode: code, failureMessage: sanitizedFailureMessage(code) }); failures.push({ assetId, code }) }
  }
  const now = (input.now ?? (() => new Date()))().toISOString(); const result = { packageId: input.package.packageId, approvalDecisionId: input.approvalDecisionId, assetCount: ids.length, uploadedCount: mappings.length - reused, reusedCount: reused, failedCount: failures.length, mappings, failures, state: (failures.length === 0 ? 'MEDIA_COMPLETE' : mappings.length ? 'MEDIA_PARTIAL' : 'MEDIA_PENDING') as MediaIngressState }; await input.receipts?.save({ ...result, startedAt: now, completedAt: now }); return result
}
export function referencedAssets(value: StructuredEditorialPackageV1): string[] { const ids = [value.adventure.document.hero.asset, ...value.adventure.document.visualStory.items.map(item => item.asset), ...value.adventure.document.placesToGo.items.flatMap(item => item.asset ? [item.asset] : []), ...value.student.document.blocks.flatMap(block => block.type === 'figure' && block.resolution === 'RESOLVED' ? [{ status: 'RESOLVED' as const, assetId: block.assetId }] : [])].flatMap(asset => asset.status === 'RESOLVED' ? [asset.assetId] : []); return [...new Set(ids)] }
function magicMatches(bytes: Uint8Array, mime: string) { return (mime === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) || (mime === 'image/png' && bytes[0] === 0x89 && bytes[1] === 0x50) || (mime === 'image/webp' && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') }
function sanitizedFailureMessage(code: string) { return `MEDIA_INGRESS_${code.replace(/[^A-Z0-9_]/g, '_')}` }
function row(value: Record<string, unknown>): MediaMapping { return { packageId: String(value.package_id), approvalDecisionId: String(value.approval_decision_id), destinationId: String(value.destination_id), executionId: String(value.execution_id), assetId: String(value.local_asset_id), checksum: String(value.checksum_sha256), trawelMediaId: value.trawel_media_id === null ? null : String(value.trawel_media_id), uploadedAt: value.uploaded_at === null ? null : String(value.uploaded_at), state: String(value.upload_state) as MediaMapping['state'], ...(value.failure_code ? { failureCode: String(value.failure_code) } : {}), ...(value.failure_message ? { failureMessage: String(value.failure_message) } : {}) } }
