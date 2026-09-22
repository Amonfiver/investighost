import type {
  DestinationBatch,
  DestinationBatchIssue,
  DestinationBatchJob,
  DestinationJobPhase,
} from '@shared/factory-batch-contracts'

export interface ExistingDestinationMatch {
  hasApprovedContent: boolean
  hasDeliveredContent: boolean
  existingJobId?: string
}

export interface DestinationBatchRepository {
  findBatchByFingerprint(fingerprint: string): Promise<DestinationBatch | null>
  createBatch(batch: DestinationBatch): Promise<DestinationBatch>
  getBatch(batchId: string): Promise<DestinationBatch | null>
  listBatches(): Promise<DestinationBatch[]>
  insertJob(job: DestinationBatchJob): Promise<DestinationBatchJob>
  getJob(jobId: string): Promise<DestinationBatchJob | null>
  updateJob(job: DestinationBatchJob): Promise<DestinationBatchJob>
  listJobs(batchId: string): Promise<DestinationBatchJob[]>
  insertIssue(issue: DestinationBatchIssue): Promise<void>
  listIssues(batchId: string): Promise<DestinationBatchIssue[]>
  findExistingDestination(input: {
    canonicalDestinationId?: string
    normalizedIdentity: string
  }): Promise<ExistingDestinationMatch>
}

export interface DestinationBatchRetryResult {
  job: DestinationBatchJob
  resumedPhase: DestinationJobPhase
}
