import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContributionFileStore, ContributionIntegrityService, DownloadedContributionFile, StoredContributionFile } from './types'

const BUCKET = 'investighost-contributions'
const extensionByMime: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' }

export class SupabaseContributionFileStore implements ContributionFileStore {
  constructor(private readonly client: SupabaseClient, private readonly integrity: ContributionIntegrityService) {}
  rootPath(): string { return `supabase-storage://${BUCKET}` }

  async store(remoteId: string, file: DownloadedContributionFile): Promise<StoredContributionFile> {
    this.integrity.verifyFile(file, file.bytes)
    const extension = extensionByMime[file.mimeType]
    if (!extension) throw new Error(`MIME_NOT_ALLOWED: ${file.mimeType}`)
    const safeRemoteId = remoteId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)
    if (!safeRemoteId) throw new Error('INVALID_REMOTE_ID')
    const safeLocalName = `${randomUUID()}${extension}`
    const relativePath = `${safeRemoteId}/${safeLocalName}`
    const { error } = await this.client.storage.from(BUCKET).upload(relativePath, file.bytes, { contentType: file.mimeType, upsert: false })
    if (error) throw new Error(`SUPABASE_STORAGE_UPLOAD_FAILED: ${error.message}`)
    return { ...file, bytes: undefined, id: randomUUID(), safeLocalName, relativePath, localSha256: this.integrity.sha256(file.bytes), localSize: file.bytes.byteLength } as StoredContributionFile
  }

  async removeStored(files: StoredContributionFile[]): Promise<void> {
    if (files.length === 0) return
    const { error } = await this.client.storage.from(BUCKET).remove(files.map(file => file.relativePath))
    if (error) throw new Error(`SUPABASE_STORAGE_REMOVE_FAILED: ${error.message}`)
  }

  async countFiles(): Promise<number> { return 0 }
}

