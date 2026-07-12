import type {
  ContributionImportJob,
  ContributionImportStatus,
  ContributionSyncSummary,
  RemoteContribution,
  RemoteContributionFile,
} from '@shared/contracts'

export interface DownloadedContributionFile extends RemoteContributionFile {
  bytes: Uint8Array
}

export interface StoredContributionFile extends RemoteContributionFile {
  id: string
  safeLocalName: string
  relativePath: string
  localSha256: string
  localSize: number
}

export interface PersistedContribution {
  id: string
  jobId: string
  remote: RemoteContribution
  normalizedPayload: string
  files: StoredContributionFile[]
  importedAt: Date
}

export interface ImportAttempt {
  id: string
  jobId: string
  operation: 'download' | 'verify' | 'persist' | 'delete_remote'
  outcome: 'success' | 'failure'
  errorCode?: string
  errorMessage?: string
  attemptedAt: Date
}

export interface ImportConflict {
  id: string
  jobId: string
  kind: 'payload_hash' | 'payload_size' | 'file_hash' | 'file_size' | 'duplicate_version'
  expectedValue?: string
  actualValue?: string
  createdAt: Date
}

export interface ImportBatch {
  id: string
  status: 'running' | 'completed_with_errors' | 'completed'
  foundCount: number
  createdAt: Date
  completedAt?: Date
}

export interface LocalBackupRecord {
  id: string
  path: string
  databaseSha256?: string
  fileCount: number
  status: 'created' | 'verified' | 'failed'
  createdAt: Date
  verifiedAt?: Date
}

export interface ContributionRemoteSource {
  readonly kind: 'mock' | 'remote'
  listPending(): Promise<RemoteContribution[]>
  downloadFile(remoteId: string, file: RemoteContributionFile): Promise<Uint8Array>
  deleteFiles(remoteId: string, fileIds: string[]): Promise<void>
  deleteContribution(remoteId: string): Promise<void>
}

export interface ContributionLocalRepository {
  createBatch(batch: ImportBatch): Promise<void>
  completeBatch(batch: ImportBatch): Promise<void>
  upsertJob(job: ContributionImportJob): Promise<ContributionImportJob>
  getJobByRemoteId(remoteId: string): Promise<ContributionImportJob | null>
  getJob(id: string): Promise<ContributionImportJob | null>
  listJobs(): Promise<ContributionImportJob[]>
  persistVerifiedContribution(contribution: PersistedContribution): Promise<void>
  addAttempt(attempt: ImportAttempt): Promise<void>
  addConflict(conflict: ImportConflict): Promise<void>
  saveBackup(record: LocalBackupRecord): Promise<void>
}

export interface ContributionFileStore {
  store(remoteId: string, file: DownloadedContributionFile): Promise<StoredContributionFile>
  removeStored(files: StoredContributionFile[]): Promise<void>
  countFiles(): Promise<number>
  rootPath(): string
}

export interface ContributionIntegrityService {
  normalizePayload(remote: RemoteContribution): string
  sha256(input: string | Uint8Array): string
  verifyPayload(remote: RemoteContribution, normalizedPayload: string): void
  verifyFile(remote: RemoteContributionFile, bytes: Uint8Array): void
}

export interface ContributionImportQueue {
  enqueue(remote: RemoteContribution, batchId: string): Promise<ContributionImportJob>
  list(): Promise<ContributionImportJob[]>
}

export interface ContributionRetryPolicy {
  nextRetry(attemptCount: number, now?: Date): Date | null
  isRetryable(error: unknown): boolean
}

export interface ContributionBackupService {
  createVerifiedBackup(): Promise<LocalBackupRecord>
  hasRecentVerifiedBackup(maxAgeMs: number): Promise<boolean>
}

export interface ContributionImportServiceContract {
  importPending(): Promise<ContributionSyncSummary>
  retryJob(jobId: string): Promise<ContributionSyncSummary>
  listJobs(): Promise<ContributionImportJob[]>
}

export interface JobPatch {
  status?: ContributionImportStatus
  attemptCount?: number
  lastError?: string
  nextRetryAt?: Date
  remoteChecksum?: string
  localChecksum?: string
  remotePayloadSize?: number
  localPayloadSize?: number
  downloadedAt?: Date
  verifiedAt?: Date
  deletedRemoteAt?: Date
  completedAt?: Date
}

