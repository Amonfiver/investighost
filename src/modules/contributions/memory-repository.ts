import type { ContributionImportJob } from '@shared/contracts'
import type {
  ContributionLocalRepository,
  ImportAttempt,
  ImportBatch,
  ImportConflict,
  LocalBackupRecord,
  PersistedContribution,
} from './types'

export class MemoryContributionLocalRepository implements ContributionLocalRepository {
  readonly jobs = new Map<string, ContributionImportJob>()
  readonly contributions = new Map<string, PersistedContribution>()
  readonly attempts: ImportAttempt[] = []
  readonly conflicts: ImportConflict[] = []
  readonly backups: LocalBackupRecord[] = []
  readonly batches = new Map<string, ImportBatch>()

  async createBatch(batch: ImportBatch): Promise<void> { this.batches.set(batch.id, structuredClone(batch)) }
  async completeBatch(batch: ImportBatch): Promise<void> { this.batches.set(batch.id, structuredClone(batch)) }

  async upsertJob(job: ContributionImportJob): Promise<ContributionImportJob> {
    const existing = await this.getJobByRemoteId(job.remoteId)
    if (existing && existing.id !== job.id) return existing
    this.jobs.set(job.id, structuredClone(job))
    return structuredClone(job)
  }

  async getJobByRemoteId(remoteId: string): Promise<ContributionImportJob | null> {
    const job = [...this.jobs.values()].find(candidate => candidate.remoteId === remoteId)
    return job ? structuredClone(job) : null
  }

  async getJob(id: string): Promise<ContributionImportJob | null> {
    const job = this.jobs.get(id)
    return job ? structuredClone(job) : null
  }

  async listJobs(): Promise<ContributionImportJob[]> {
    return [...this.jobs.values()].map(job => structuredClone(job)).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }

  async persistVerifiedContribution(contribution: PersistedContribution): Promise<void> {
    this.contributions.set(contribution.remote.remoteId, structuredClone(contribution))
  }

  async addAttempt(attempt: ImportAttempt): Promise<void> { this.attempts.push(structuredClone(attempt)) }
  async addConflict(conflict: ImportConflict): Promise<void> { this.conflicts.push(structuredClone(conflict)) }
  async saveBackup(record: LocalBackupRecord): Promise<void> { this.backups.push(structuredClone(record)) }
}

