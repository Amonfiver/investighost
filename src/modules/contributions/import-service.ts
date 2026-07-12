import { randomUUID } from 'node:crypto'
import {
  ContributionImportJobSchema,
  ContributionSyncSummarySchema,
  RemoteContributionSchema,
  type ContributionImportJob,
  type ContributionSyncSummary,
  type RemoteContribution,
} from '@shared/contracts'
import { IntegrityError } from './integrity'
import type {
  ContributionBackupService,
  ContributionFileStore,
  ContributionImportQueue,
  ContributionImportServiceContract,
  ContributionIntegrityService,
  ContributionLocalRepository,
  ContributionRemoteSource,
  ContributionRetryPolicy,
  ImportAttempt,
  ImportBatch,
  JobPatch,
  StoredContributionFile,
} from './types'

export class ContributionImportService implements ContributionImportServiceContract {
  private readonly remoteByJob = new Map<string, RemoteContribution>()

  constructor(
    private readonly remote: ContributionRemoteSource,
    private readonly repository: ContributionLocalRepository,
    private readonly fileStore: ContributionFileStore,
    private readonly integrity: ContributionIntegrityService,
    private readonly queue: ContributionImportQueue,
    private readonly retryPolicy: ContributionRetryPolicy,
    private readonly backup: ContributionBackupService,
  ) {}

  async importPending(): Promise<ContributionSyncSummary> {
    const batch: ImportBatch = { id: randomUUID(), status: 'running', foundCount: 0, createdAt: new Date() }
    await this.repository.createBatch(batch)
    const pending = await this.remote.listPending()
    batch.foundCount = pending.length
    const jobs: ContributionImportJob[] = []
    for (const candidate of pending) {
      const remote = RemoteContributionSchema.parse(candidate)
      const job = await this.queue.enqueue(remote, batch.id)
      this.remoteByJob.set(job.id, remote)
      if (job.status === 'completed') {
        jobs.push(job)
        continue
      }
      jobs.push(await this.process(job, remote))
    }
    batch.completedAt = new Date()
    batch.status = jobs.some(job => ['failed', 'retry_pending'].includes(job.status)) ? 'completed_with_errors' : 'completed'
    await this.repository.completeBatch(batch)
    return this.summary(batch.id, pending.length, jobs)
  }

  async retryJob(jobId: string): Promise<ContributionSyncSummary> {
    const job = await this.repository.getJob(jobId)
    if (!job) throw new Error('IMPORT_JOB_NOT_FOUND')
    let remote = this.remoteByJob.get(jobId)
    if (!remote) remote = (await this.remote.listPending()).find(item => item.remoteId === job.remoteId)
    if (!remote && job.status !== 'deleting_remote') throw new Error('REMOTE_CONTRIBUTION_NOT_FOUND')
    const processed = job.status === 'deleting_remote'
      ? await this.retryRemoteDeletion(job)
      : await this.process(job, RemoteContributionSchema.parse(remote))
    return this.summary(job.batchId, 1, [processed])
  }

  listJobs(): Promise<ContributionImportJob[]> { return this.repository.listJobs() }

  private async process(initialJob: ContributionImportJob, remote: RemoteContribution): Promise<ContributionImportJob> {
    let job = await this.patch(initialJob, { status: 'downloading', attemptCount: initialJob.attemptCount + 1, lastError: undefined })
    const storedFiles: StoredContributionFile[] = []
    try {
      const normalizedPayload = this.integrity.normalizePayload(remote)
      for (const file of remote.files) {
        const bytes = await this.remote.downloadFile(remote.remoteId, file)
        this.integrity.verifyFile(file, bytes)
        storedFiles.push(await this.fileStore.store(remote.remoteId, { ...file, bytes }))
      }
      job = await this.patch(job, { status: 'verifying', downloadedAt: new Date() })
      this.integrity.verifyPayload(remote, normalizedPayload)
      const localChecksum = this.integrity.sha256(normalizedPayload)
      const localPayloadSize = Buffer.byteLength(normalizedPayload, 'utf8')
      await this.repository.persistVerifiedContribution({
        id: randomUUID(), jobId: job.id, remote, normalizedPayload,
        files: storedFiles, importedAt: new Date(),
      })
      job = await this.patch(job, {
        status: 'imported', remoteChecksum: remote.payloadSha256, localChecksum,
        remotePayloadSize: remote.payloadSize, localPayloadSize, verifiedAt: new Date(),
      })
      await this.attempt(job, 'persist', 'success')
      await this.backup.createVerifiedBackup()
      if (!await this.backup.hasRecentVerifiedBackup(24 * 60 * 60 * 1000)) throw new Error('RECENT_BACKUP_REQUIRED')
      return await this.deleteRemote(job, remote)
    } catch (error) {
      if (storedFiles.length > 0 && job.status !== 'imported' && job.status !== 'deleting_remote') await this.fileStore.removeStored(storedFiles)
      if (error instanceof IntegrityError) {
        await this.repository.addConflict({
          id: randomUUID(), jobId: job.id,
          kind: error.code === 'PAYLOAD_HASH_MISMATCH' ? 'payload_hash' : error.code === 'PAYLOAD_SIZE_MISMATCH' ? 'payload_size' : error.code === 'FILE_HASH_MISMATCH' ? 'file_hash' : 'file_size',
          createdAt: new Date(),
        })
      }
      return this.fail(job, error, job.status === 'verifying' ? 'verify' : 'download')
    }
  }

  private async deleteRemote(initialJob: ContributionImportJob, remote: RemoteContribution): Promise<ContributionImportJob> {
    let job = await this.patch(initialJob, { status: 'deleting_remote' })
    try {
      await this.remote.deleteFiles(remote.remoteId, remote.files.map(file => file.remoteFileId))
      await this.remote.deleteContribution(remote.remoteId)
      const now = new Date()
      job = await this.patch(job, { status: 'completed', deletedRemoteAt: now, completedAt: now })
      await this.attempt(job, 'delete_remote', 'success')
      return job
    } catch (error) {
      return this.fail(job, error, 'delete_remote', true)
    }
  }

  private async retryRemoteDeletion(job: ContributionImportJob): Promise<ContributionImportJob> {
    const remote = this.remoteByJob.get(job.id) ?? (await this.remote.listPending()).find(item => item.remoteId === job.remoteId)
    if (!remote) return this.patch(job, { status: 'completed', deletedRemoteAt: new Date(), completedAt: new Date() })
    return this.deleteRemote(await this.patch(job, { attemptCount: job.attemptCount + 1 }), remote)
  }

  private async fail(job: ContributionImportJob, error: unknown, operation: ImportAttempt['operation'], preserveDeletingState = false): Promise<ContributionImportJob> {
    const message = error instanceof Error ? error.message : String(error)
    const nextRetryAt = this.retryPolicy.isRetryable(error) ? this.retryPolicy.nextRetry(job.attemptCount) : null
    await this.attempt(job, operation, 'failure', message)
    return this.patch(job, {
      status: preserveDeletingState && nextRetryAt ? 'deleting_remote' : nextRetryAt ? 'retry_pending' : 'failed',
      lastError: message,
      nextRetryAt: nextRetryAt ?? undefined,
    })
  }

  private async attempt(job: ContributionImportJob, operation: ImportAttempt['operation'], outcome: ImportAttempt['outcome'], errorMessage?: string): Promise<void> {
    await this.repository.addAttempt({ id: randomUUID(), jobId: job.id, operation, outcome, errorMessage, attemptedAt: new Date() })
  }

  private async patch(job: ContributionImportJob, patch: JobPatch): Promise<ContributionImportJob> {
    const next = ContributionImportJobSchema.parse({ ...job, ...patch, updatedAt: new Date() })
    return this.repository.upsertJob(next)
  }

  private summary(batchId: string, found: number, jobs: ContributionImportJob[]): ContributionSyncSummary {
    return ContributionSyncSummarySchema.parse({
      batchId,
      found,
      downloaded: jobs.filter(job => job.downloadedAt).length,
      verified: jobs.filter(job => job.verifiedAt).length,
      deletedRemote: jobs.filter(job => job.deletedRemoteAt).length,
      retrying: jobs.filter(job => job.status === 'retry_pending' || job.status === 'deleting_remote').length,
      failed: jobs.filter(job => job.status === 'failed').length,
      pending: jobs.filter(job => ['pending', 'downloading', 'verifying', 'imported'].includes(job.status)).length,
      jobs,
    })
  }
}

