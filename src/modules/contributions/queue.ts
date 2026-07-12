import { randomUUID } from 'node:crypto'
import type { ContributionImportJob, RemoteContribution } from '@shared/contracts'
import type { ContributionImportQueue, ContributionLocalRepository } from './types'

export class LocalContributionImportQueue implements ContributionImportQueue {
  constructor(private readonly repository: ContributionLocalRepository) {}

  async enqueue(remote: RemoteContribution, batchId: string): Promise<ContributionImportJob> {
    const existing = await this.repository.getJobByRemoteId(remote.remoteId)
    if (existing) return existing
    const now = new Date()
    return this.repository.upsertJob({
      id: randomUUID(),
      batchId,
      remoteId: remote.remoteId,
      sourceType: remote.sourceType,
      status: 'pending',
      attemptCount: 0,
      idempotencyKey: `trawel:${remote.remoteId}:v${remote.version}`,
      version: remote.version,
      createdAt: now,
      updatedAt: now,
    })
  }

  list(): Promise<ContributionImportJob[]> { return this.repository.listJobs() }
}

