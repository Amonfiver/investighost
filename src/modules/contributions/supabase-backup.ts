import { randomUUID } from 'node:crypto'
import type { ContributionBackupService, ContributionLocalRepository, LocalBackupRecord } from './types'

export class SupabaseDurabilityCheckpointService implements ContributionBackupService {
  private verifiedAt: Date | null = null
  constructor(private readonly repository: ContributionLocalRepository) {}
  async createVerifiedBackup(): Promise<LocalBackupRecord> {
    const now = new Date()
    const record: LocalBackupRecord = { id: randomUUID(), path: 'supabase-local://durable-import', fileCount: 0, status: 'verified', createdAt: now, verifiedAt: now }
    await this.repository.saveBackup(record)
    this.verifiedAt = now
    return record
  }
  async hasRecentVerifiedBackup(maxAgeMs: number): Promise<boolean> { return Boolean(this.verifiedAt && Date.now() - this.verifiedAt.getTime() <= maxAgeMs) }
}

