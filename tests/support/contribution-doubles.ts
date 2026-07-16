import { randomUUID } from 'node:crypto'
import type {
  ContributionBackupService,
  ContributionFileStore,
  ContributionIntegrityService,
  DownloadedContributionFile,
  LocalBackupRecord,
  StoredContributionFile,
} from '@modules/contributions/types'

const extensionByMime: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}

export class MemoryContributionFileStore implements ContributionFileStore {
  private readonly files = new Map<string, StoredContributionFile>()

  constructor(
    private readonly root: string,
    private readonly integrity: ContributionIntegrityService,
  ) {}

  rootPath(): string { return this.root }

  async store(remoteId: string, file: DownloadedContributionFile): Promise<StoredContributionFile> {
    this.integrity.verifyFile(file, file.bytes)
    const extension = extensionByMime[file.mimeType]
    if (!extension) throw new Error(`MIME_NOT_ALLOWED: ${file.mimeType}`)
    const safeRemoteId = remoteId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)
    if (!safeRemoteId) throw new Error('INVALID_REMOTE_ID')
    const safeLocalName = `${randomUUID()}${extension}`
    const stored = {
      ...file,
      bytes: undefined,
      id: randomUUID(),
      safeLocalName,
      relativePath: `${safeRemoteId}/${safeLocalName}`,
      localSha256: this.integrity.sha256(file.bytes),
      localSize: file.bytes.byteLength,
    } as StoredContributionFile
    this.files.set(stored.id, stored)
    return stored
  }

  async removeStored(files: StoredContributionFile[]): Promise<void> {
    for (const file of files) this.files.delete(file.id)
  }

  async countFiles(): Promise<number> { return this.files.size }
}

export class MemoryContributionBackupService implements ContributionBackupService {
  private verifiedAt: Date | null = null

  async createVerifiedBackup(): Promise<LocalBackupRecord> {
    this.verifiedAt = new Date()
    return {
      id: randomUUID(),
      path: 'memory://durability-checkpoint',
      fileCount: 0,
      status: 'verified',
      createdAt: this.verifiedAt,
      verifiedAt: this.verifiedAt,
    }
  }

  async hasRecentVerifiedBackup(maxAgeMs: number): Promise<boolean> {
    return Boolean(this.verifiedAt && Date.now() - this.verifiedAt.getTime() <= maxAgeMs)
  }
}
