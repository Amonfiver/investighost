import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ContributionFileStore, DownloadedContributionFile, StoredContributionFile } from './types'
import type { ContributionIntegrityService } from './types'

const extensionByMime: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}

export class SafeContributionFileStore implements ContributionFileStore {
  constructor(private readonly root: string, private readonly integrity: ContributionIntegrityService) {}

  rootPath(): string { return this.root }

  async store(remoteId: string, file: DownloadedContributionFile): Promise<StoredContributionFile> {
    this.integrity.verifyFile(file, file.bytes)
    const safeRemoteId = this.safeSegment(remoteId)
    const extension = extensionByMime[file.mimeType]
    if (!extension) throw new Error(`MIME_NOT_ALLOWED: ${file.mimeType}`)
    const directory = path.resolve(this.root, safeRemoteId)
    this.assertInsideRoot(directory)
    await mkdir(directory, { recursive: true })
    const safeLocalName = `${randomUUID()}${extension}`
    const absolutePath = path.resolve(directory, safeLocalName)
    this.assertInsideRoot(absolutePath)
    await writeFile(absolutePath, file.bytes, { flag: 'wx' })
    return {
      ...file,
      bytes: undefined,
      id: randomUUID(),
      safeLocalName,
      relativePath: path.relative(this.root, absolutePath),
      localSha256: this.integrity.sha256(file.bytes),
      localSize: file.bytes.byteLength,
    } as StoredContributionFile
  }

  async removeStored(files: StoredContributionFile[]): Promise<void> {
    await Promise.all(files.map(async file => {
      const absolutePath = path.resolve(this.root, file.relativePath)
      this.assertInsideRoot(absolutePath)
      await rm(absolutePath, { force: true })
    }))
  }

  async countFiles(): Promise<number> {
    const { readdir } = await import('node:fs/promises')
    try {
      const entries = await readdir(this.root, { recursive: true, withFileTypes: true })
      return entries.filter(entry => entry.isFile()).length
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
      throw error
    }
  }

  private safeSegment(value: string): string {
    const safe = value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)
    if (!safe) throw new Error('INVALID_REMOTE_ID')
    return safe
  }

  private assertInsideRoot(candidate: string): void {
    const root = path.resolve(this.root)
    const relative = path.relative(root, candidate)
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('PATH_TRAVERSAL_BLOCKED')
  }
}

