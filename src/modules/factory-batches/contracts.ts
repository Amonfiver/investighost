import type {
  DestinationBatch,
  DestinationBatchIssue,
  DestinationBatchJob,
  DestinationBatchJobReviewReadModel,
  DestinationJobPhase,
  DestinationBatchRedoScope,
} from '@shared/factory-batch-contracts'
import type { RedoGenerationGuidance } from '@shared/redo-guidance-contracts'

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
  readJobForReview(jobId: string): Promise<DestinationBatchJobReviewReadModel | null>
  updateJob(job: DestinationBatchJob): Promise<DestinationBatchJob>
  listJobs(batchId: string): Promise<DestinationBatchJob[]>
  insertIssue(issue: DestinationBatchIssue): Promise<void>
  listIssues(batchId: string): Promise<DestinationBatchIssue[]>
  findExistingDestination(input: {
    canonicalDestinationId?: string
    normalizedIdentity: string
  }): Promise<ExistingDestinationMatch>
  claimNextJob(batchId: string, workerId: string, leaseMs: number, now: Date): Promise<DestinationBatchJob | null>
  claimJob(jobId: string, workerId: string, leaseMs: number, now: Date): Promise<DestinationBatchJob | null>
  renewClaim(jobId: string, claimToken: string, leaseMs: number, now: Date): Promise<DestinationBatchJob | null>
  releaseClaim(job: DestinationBatchJob, claimToken: string): Promise<DestinationBatchJob>
  recoverStaleClaims(now: Date): Promise<number>
  totalActualCost(batchId: string): Promise<number>
  requestRedo(input: { jobId: string; scope: DestinationBatchRedoScope; guidance?: RedoGenerationGuidance; requestedBy: string; reason?: string; now: Date }): Promise<DestinationBatchJob>
  completeRedo(operationId: string, outcome: 'COMPLETED' | 'FAILED', now: Date): Promise<void>
  approveReadyJob(jobId: string, now: Date): Promise<DestinationBatchJob>
}

export interface DestinationBatchRetryResult {
  job: DestinationBatchJob
  resumedPhase: DestinationJobPhase
}
