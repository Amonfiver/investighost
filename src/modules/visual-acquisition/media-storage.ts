import type { SupabaseClient } from '@supabase/supabase-js'
import type { ValidatedVisualDownload } from './byte-validation'

export const VISUAL_STAGING_BUCKET = 'visual-staging-private'
export const APPROVED_IMAGES_BUCKET = 'images-approved'

export type StagedVisualObject = {
  bucket: typeof VISUAL_STAGING_BUCKET
  storageIdentity: string
}

export type PublicVisualObject = {
  bucket: typeof APPROVED_IMAGES_BUCKET
  storageIdentity: string
  publicUrl: string
}

export interface VisualMediaStorage {
  stage(destinationId: string, candidateId: string, downloaded: ValidatedVisualDownload): Promise<StagedVisualObject>
  readStage(stage: StagedVisualObject): Promise<Uint8Array>
  promote(downloaded: ValidatedVisualDownload): Promise<PublicVisualObject>
}

/** Supabase Storage adapter: private staging never generates public URLs; only the approved bucket does. */
export class SupabaseVisualMediaStorage implements VisualMediaStorage {
  constructor(private readonly client: Pick<SupabaseClient, 'storage'>) {}

  async stage(destinationId: string, candidateId: string, downloaded: ValidatedVisualDownload): Promise<StagedVisualObject> {
    const storageIdentity = `v1/${destinationId}/${candidateId}/${downloaded.checksum}.${downloaded.extension}`
    const { error } = await this.client.storage.from(VISUAL_STAGING_BUCKET).upload(storageIdentity, downloaded.bytes, {
      contentType: downloaded.mimeType, upsert: false,
    })
    if (error) throw new Error(`VISUAL_STAGING_UPLOAD_FAILED:${error.message}`)
    return { bucket: VISUAL_STAGING_BUCKET, storageIdentity }
  }

  async readStage(stage: StagedVisualObject): Promise<Uint8Array> {
    const { data, error } = await this.client.storage.from(stage.bucket).download(stage.storageIdentity)
    if (error || data === null) throw new Error(`VISUAL_STAGING_READ_FAILED:${error?.message ?? 'MISSING'}`)
    return new Uint8Array(await data.arrayBuffer())
  }

  async promote(downloaded: ValidatedVisualDownload): Promise<PublicVisualObject> {
    const storageIdentity = `v1/by-checksum/${downloaded.checksum}.${downloaded.extension}`
    const { error } = await this.client.storage.from(APPROVED_IMAGES_BUCKET).upload(storageIdentity, downloaded.bytes, {
      contentType: downloaded.mimeType, upsert: false,
    })
    if (error) throw new Error(`VISUAL_PUBLIC_PROMOTION_FAILED:${error.message}`)
    const publicUrl = this.client.storage.from(APPROVED_IMAGES_BUCKET).getPublicUrl(storageIdentity).data.publicUrl
    if (!isHttpsPublicUrl(publicUrl)) throw new Error('PUBLIC_URL_INVALID')
    return { bucket: APPROVED_IMAGES_BUCKET, storageIdentity, publicUrl }
  }
}

/** Deterministic in-memory storage for tests; it exposes only approved objects through an HTTPS URL. */
export class MemoryVisualMediaStorage implements VisualMediaStorage {
  readonly staged = new Map<string, Uint8Array>()
  readonly approved = new Map<string, Uint8Array>()
  stageUploads = 0
  publicUploads = 0

  async stage(destinationId: string, candidateId: string, downloaded: ValidatedVisualDownload): Promise<StagedVisualObject> {
    const storageIdentity = `v1/${destinationId}/${candidateId}/${downloaded.checksum}.${downloaded.extension}`
    if (!this.staged.has(storageIdentity)) {
      this.staged.set(storageIdentity, structuredClone(downloaded.bytes))
      this.stageUploads += 1
    }
    return { bucket: VISUAL_STAGING_BUCKET, storageIdentity }
  }

  async readStage(stage: StagedVisualObject): Promise<Uint8Array> {
    const bytes = this.staged.get(stage.storageIdentity)
    if (bytes === undefined) throw new Error('VISUAL_STAGING_READ_FAILED:MISSING')
    return structuredClone(bytes)
  }

  async promote(downloaded: ValidatedVisualDownload): Promise<PublicVisualObject> {
    const storageIdentity = `v1/by-checksum/${downloaded.checksum}.${downloaded.extension}`
    if (!this.approved.has(storageIdentity)) {
      this.approved.set(storageIdentity, structuredClone(downloaded.bytes))
      this.publicUploads += 1
    }
    return { bucket: APPROVED_IMAGES_BUCKET, storageIdentity, publicUrl: `https://media.example.test/${APPROVED_IMAGES_BUCKET}/${storageIdentity}` }
  }
}

export function isHttpsPublicUrl(value: string): boolean {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}
