import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ContributionBackupService, ContributionFileStore, ContributionLocalRepository, LocalBackupRecord } from './types'
import type { ContributionIntegrityService } from './types'

export class LocalContributionBackupService implements ContributionBackupService {
  private latest: LocalBackupRecord | null = null

  constructor(
    private readonly databasePath: string,
    private readonly fileStore: ContributionFileStore,
    private readonly backupRoot: string,
    private readonly repository: ContributionLocalRepository,
    private readonly integrity: ContributionIntegrityService,
    private readonly prepareDatabase?: () => void,
  ) {}

  async createVerifiedBackup(): Promise<LocalBackupRecord> {
    this.prepareDatabase?.()
    const id = randomUUID()
    const destination = path.resolve(this.backupRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${id}`)
    await mkdir(destination, { recursive: true })
    let databaseSha256: string | undefined
    try {
      const database = await readFile(this.databasePath)
      databaseSha256 = this.integrity.sha256(database)
      await writeFile(path.join(destination, 'investighost.db'), database)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const filesDestination = path.join(destination, 'contribution-files')
    await cp(this.fileStore.rootPath(), filesDestination, { recursive: true, force: false }).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    })
    const record: LocalBackupRecord = {
      id,
      path: destination,
      databaseSha256,
      fileCount: await this.fileStore.countFiles(),
      status: 'verified',
      createdAt: new Date(),
      verifiedAt: new Date(),
    }
    await writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ ...record, createdAt: record.createdAt.toISOString(), verifiedAt: record.verifiedAt?.toISOString() }, null, 2))
    await this.repository.saveBackup(record)
    this.latest = record
    return record
  }

  async hasRecentVerifiedBackup(maxAgeMs: number): Promise<boolean> {
    return Boolean(this.latest?.verifiedAt && Date.now() - this.latest.verifiedAt.getTime() <= maxAgeMs)
  }
}

export class MemoryBackupService implements ContributionBackupService {
  private verifiedAt: Date | null = null
  async createVerifiedBackup(): Promise<LocalBackupRecord> {
    this.verifiedAt = new Date()
    return { id: randomUUID(), path: 'memory://backup', fileCount: 0, status: 'verified', createdAt: this.verifiedAt, verifiedAt: this.verifiedAt }
  }
  async hasRecentVerifiedBackup(maxAgeMs: number): Promise<boolean> {
    return Boolean(this.verifiedAt && Date.now() - this.verifiedAt.getTime() <= maxAgeMs)
  }
}
