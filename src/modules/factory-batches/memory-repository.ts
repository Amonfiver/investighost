import {
  DestinationBatchSchema,
  DestinationBatchIssueSchema,
  DestinationBatchJobSchema,
  DestinationBatchJobReviewReadModelSchema,
  type DestinationBatch,
  type DestinationBatchIssue,
  type DestinationBatchJob,
} from '@shared/factory-batch-contracts'
import type { DestinationBatchRepository, ExistingDestinationMatch } from './contracts'

export class MemoryDestinationBatchRepository implements DestinationBatchRepository {
  readonly batches = new Map<string, DestinationBatch>()
  readonly jobs = new Map<string, DestinationBatchJob>()
  readonly issues = new Map<string, DestinationBatchIssue>()
  readonly existing = new Map<string, ExistingDestinationMatch>()

  seedExisting(identity: string, match: ExistingDestinationMatch): void {
    this.existing.set(identity, structuredClone(match))
  }

  async findBatchByFingerprint(fingerprint: string): Promise<DestinationBatch | null> {
    return structuredClone([...this.batches.values()].find(batch => batch.importFingerprint === fingerprint) ?? null)
  }

  async createBatch(batch: DestinationBatch): Promise<DestinationBatch> {
    const existing = await this.findBatchByFingerprint(batch.importFingerprint)
    if (existing) return existing
    const parsed = DestinationBatchSchema.parse(batch)
    this.batches.set(parsed.id, structuredClone(parsed))
    return structuredClone(parsed)
  }

  async getBatch(batchId: string): Promise<DestinationBatch | null> { return structuredClone(this.batches.get(batchId) ?? null) }
  async listBatches(): Promise<DestinationBatch[]> { return structuredClone([...this.batches.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) }

  async insertJob(job: DestinationBatchJob): Promise<DestinationBatchJob> {
    const duplicate = [...this.jobs.values()].find(item => item.batchId === job.batchId && item.normalizedIdentity === job.normalizedIdentity)
    if (duplicate) return structuredClone(duplicate)
    const parsed = DestinationBatchJobSchema.parse(job)
    this.jobs.set(parsed.id, structuredClone(parsed))
    return structuredClone(parsed)
  }

  async getJob(jobId: string): Promise<DestinationBatchJob | null> { return structuredClone(this.jobs.get(jobId) ?? null) }

  async readJobForReview(jobId: string) {
    const job = await this.getJob(jobId)
    if (!job) return null
    return DestinationBatchJobReviewReadModelSchema.parse({
      jobId: job.id, batchId: job.batchId,
      destination: { canonicalDestinationId: job.canonicalDestinationId ?? null, name: job.originalName, country: job.country, region: job.region ?? null },
      status: job.status, phase: job.currentPhase, student: null, adventure: null,
      visualPackageId: job.artifactRefs.VISUALS ?? null, visualPackage: null, reviewArtifactId: job.artifactRefs.AUTO_REVIEW ?? null,
      reviewSummary: null, warnings: [], cost: job.actualCost, attempts: job.attemptCount, lastError: job.lastFailure ?? null,
    })
  }

  async updateJob(job: DestinationBatchJob): Promise<DestinationBatchJob> {
    if (!this.jobs.has(job.id)) throw new Error('DESTINATION_BATCH_JOB_NOT_FOUND')
    const parsed = DestinationBatchJobSchema.parse(job)
    this.jobs.set(parsed.id, structuredClone(parsed))
    return structuredClone(parsed)
  }

  async listJobs(batchId: string): Promise<DestinationBatchJob[]> {
    return structuredClone([...this.jobs.values()].filter(job => job.batchId === batchId).sort((a, b) => a.inputIndex - b.inputIndex))
  }

  async insertIssue(issue: DestinationBatchIssue): Promise<void> {
    const parsed = DestinationBatchIssueSchema.parse(issue)
    this.issues.set(parsed.id, structuredClone(parsed))
  }

  async listIssues(batchId: string): Promise<DestinationBatchIssue[]> {
    return structuredClone([...this.issues.values()].filter(issue => issue.batchId === batchId).sort((a, b) => a.inputIndex - b.inputIndex))
  }

  async findExistingDestination(input: { canonicalDestinationId?: string; normalizedIdentity: string }): Promise<ExistingDestinationMatch> {
    return structuredClone(this.existing.get(input.canonicalDestinationId ?? input.normalizedIdentity)
      ?? this.existing.get(input.normalizedIdentity)
      ?? { hasApprovedContent: false, hasDeliveredContent: false })
  }

  async claimNextJob(batchId: string, workerId: string, leaseMs: number, now: Date): Promise<DestinationBatchJob | null> {
    const next = [...this.jobs.values()]
      .filter(job => job.batchId === batchId && job.status === 'QUEUED')
      .sort((left, right) => left.inputIndex - right.inputIndex)[0]
    return next ? this.claim(next, workerId, leaseMs, now) : null
  }

  async claimJob(jobId: string, workerId: string, leaseMs: number, now: Date): Promise<DestinationBatchJob | null> {
    const job = this.jobs.get(jobId)
    if (!job || job.status !== 'QUEUED') return null
    return this.claim(job, workerId, leaseMs, now)
  }

  async renewClaim(jobId: string, claimToken: string, leaseMs: number, now: Date): Promise<DestinationBatchJob | null> {
    const job = this.jobs.get(jobId)
    if (!job || job.claimToken !== claimToken || job.status !== 'PROCESSING') return null
    const next = DestinationBatchJobSchema.parse({ ...job, claimExpiresAt: new Date(now.getTime() + leaseMs), updatedAt: now })
    this.jobs.set(next.id, structuredClone(next))
    return structuredClone(next)
  }

  async releaseClaim(job: DestinationBatchJob, claimToken: string): Promise<DestinationBatchJob> {
    const current = this.jobs.get(job.id)
    if (!current || current.claimToken !== claimToken) throw new Error('DESTINATION_BATCH_CLAIM_LOST')
    const next = DestinationBatchJobSchema.parse({ ...job, claimedBy: undefined, claimToken: undefined, claimExpiresAt: undefined, updatedAt: new Date() })
    this.jobs.set(next.id, structuredClone(next))
    return structuredClone(next)
  }

  async recoverStaleClaims(now: Date): Promise<number> {
    let recovered = 0
    for (const job of this.jobs.values()) {
      if (job.status !== 'PROCESSING' || !job.claimExpiresAt || job.claimExpiresAt > now) continue
      const next = DestinationBatchJobSchema.parse({ ...job, status: 'QUEUED', claimedBy: undefined, claimToken: undefined, claimExpiresAt: undefined, lastFailure: 'STALE_PROCESSING_RECOVERED', retryable: true, updatedAt: now })
      this.jobs.set(next.id, structuredClone(next)); recovered += 1
    }
    return recovered
  }

  async totalActualCost(batchId: string): Promise<number> {
    return [...this.jobs.values()].filter(job => job.batchId === batchId).reduce((total, job) => total + job.actualCost, 0)
  }

  private async claim(job: DestinationBatchJob, workerId: string, leaseMs: number, now: Date): Promise<DestinationBatchJob> {
    const next = DestinationBatchJobSchema.parse({ ...job, status: 'PROCESSING', attemptCount: job.attemptCount + 1, claimedBy: workerId, claimToken: crypto.randomUUID(), claimExpiresAt: new Date(now.getTime() + leaseMs), startedAt: job.startedAt ?? now, updatedAt: now })
    this.jobs.set(next.id, structuredClone(next))
    return structuredClone(next)
  }
}
