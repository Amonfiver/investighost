import {
  DestinationBatchSchema,
  DestinationBatchIssueSchema,
  DestinationBatchJobSchema,
  DestinationBatchJobReviewReadModelSchema,
  type DestinationBatch,
  type DestinationBatchIssue,
  type DestinationBatchJob,
  type DestinationBatchRedoScope,
} from '@shared/factory-batch-contracts'
import type { DestinationBatchRepository, ExistingDestinationMatch } from './contracts'
import type { RedoGenerationGuidance } from '@shared/redo-guidance-contracts'

export class MemoryDestinationBatchRepository implements DestinationBatchRepository {
  readonly batches = new Map<string, DestinationBatch>()
  readonly jobs = new Map<string, DestinationBatchJob>()
  readonly issues = new Map<string, DestinationBatchIssue>()
  readonly existing = new Map<string, ExistingDestinationMatch>()
  readonly redoOperations = new Map<string, { jobId: string; scope: DestinationBatchRedoScope; guidance?: RedoGenerationGuidance; reason?: string; requestedBy: string; requestedAt: Date; status: 'REQUESTED' | 'COMPLETED' | 'FAILED'; completedAt?: Date; previousArtifactRefs: Record<string, string> }>()

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
    const redo = [...this.redoOperations.entries()].filter(([, operation]) => operation.jobId === job.id).at(-1)
    return DestinationBatchJobReviewReadModelSchema.parse({
      jobId: job.id, batchId: job.batchId,
      destination: { canonicalDestinationId: job.canonicalDestinationId ?? null, name: job.originalName, country: job.country, region: job.region ?? null },
      status: job.status, phase: job.currentPhase, student: null, adventure: null,
      visualPackageId: job.artifactRefs.VISUALS ?? null, visualPackage: null, reviewArtifactId: job.artifactRefs.AUTO_REVIEW ?? null,
      structuredPackage: null, structuredPackageArtifactId: null, structuredPackageVersion: null,
      mediaIngressState: null, mediaAssetCount: 0, mediaUploadedCount: 0, mediaReusedCount: 0, mediaFailedCount: 0, mediaBlockingIssues: [],
      reviewSummary: null, warnings: [], cost: job.actualCost, attempts: job.attemptCount, lastError: job.lastFailure ?? null,
      redo: redo ? { operationId: redo[0], scope: redo[1].scope, reason: redo[1].reason ?? null, guidance: redo[1].guidance ?? null, previousArtifactRefs: redo[1].previousArtifactRefs, requestedBy: redo[1].requestedBy, requestedAt: redo[1].requestedAt, status: redo[1].status, completedAt: redo[1].completedAt ?? null } : null,
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
      .filter(job => job.batchId === batchId && ['QUEUED', 'REDO_REQUIRED'].includes(job.status))
      .sort((left, right) => left.inputIndex - right.inputIndex)[0]
    return next ? this.claim(next, workerId, leaseMs, now) : null
  }

  async claimJob(jobId: string, workerId: string, leaseMs: number, now: Date): Promise<DestinationBatchJob | null> {
    const job = this.jobs.get(jobId)
    if (!job || !['QUEUED', 'REDO_REQUIRED'].includes(job.status)) return null
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

  async requestRedo(input: { jobId: string; scope: DestinationBatchRedoScope; guidance?: RedoGenerationGuidance; requestedBy: string; reason?: string; now: Date }): Promise<DestinationBatchJob> {
    const job = this.jobs.get(input.jobId)
    if (!job) throw new Error('BATCH_REDO_JOB_NOT_FOUND')
    if (job.status === 'REDO_REQUIRED' || job.status === 'PROCESSING') return structuredClone(job)
    if (job.status !== 'READY_FOR_REVIEW') throw new Error('BATCH_REDO_NOT_ALLOWED')
    const operationId = crypto.randomUUID()
    this.redoOperations.set(operationId, { jobId: job.id, scope: input.scope, guidance: input.guidance, reason: input.reason, requestedBy: input.requestedBy, requestedAt: input.now, status: 'REQUESTED', previousArtifactRefs: structuredClone(job.artifactRefs) })
    const refs = { ...job.artifactRefs }
    for (const key of invalidatedRefs(input.scope)) delete refs[key]
    const next = DestinationBatchJobSchema.parse({ ...job, status: 'REDO_REQUIRED', currentPhase: firstPhase(input.scope), completedPhases: retainedPhases(input.scope), artifactRefs: refs, retryable: true, redoOperationId: operationId, redoScope: input.scope, redoGuidance: input.guidance, redoReason: input.reason, redoPreviousArtifactRefs: structuredClone(job.artifactRefs), lastFailure: undefined, updatedAt: input.now })
    this.jobs.set(next.id, structuredClone(next))
    return structuredClone(next)
  }

  async completeRedo(operationId: string, outcome: 'COMPLETED' | 'FAILED', now: Date): Promise<void> {
    void now
    const operation = this.redoOperations.get(operationId)
    if (operation) { operation.status = outcome; operation.completedAt = now }
  }

  async approveReadyJob(jobId: string, now: Date): Promise<DestinationBatchJob> {
    const job = this.jobs.get(jobId)
    if (!job || job.status !== 'READY_FOR_REVIEW') throw new Error('BATCH_REVIEW_STATE_CHANGED')
    const next = DestinationBatchJobSchema.parse({ ...job, status: 'APPROVED', retryable: false, lastFailure: undefined, updatedAt: now })
    this.jobs.set(jobId, structuredClone(next))
    return structuredClone(next)
  }

  private async claim(job: DestinationBatchJob, workerId: string, leaseMs: number, now: Date): Promise<DestinationBatchJob> {
    const next = DestinationBatchJobSchema.parse({ ...job, status: 'PROCESSING', attemptCount: job.attemptCount + 1, claimedBy: workerId, claimToken: crypto.randomUUID(), claimExpiresAt: new Date(now.getTime() + leaseMs), startedAt: job.startedAt ?? now, updatedAt: now })
    this.jobs.set(next.id, structuredClone(next))
    return structuredClone(next)
  }
}

function retainedPhases(scope: DestinationBatchRedoScope): DestinationBatchJob['completedPhases'] {
  if (scope === 'STUDENT') return ['IDENTITY', 'RESEARCH', 'ANALYSIS', 'ADVENTURE', 'VISUALS']
  if (scope === 'ADVENTURE') return ['IDENTITY', 'RESEARCH', 'ANALYSIS', 'STUDENT', 'VISUALS']
  if (scope === 'VISUALS') return ['IDENTITY', 'RESEARCH', 'ANALYSIS', 'STUDENT', 'ADVENTURE']
  return ['IDENTITY', 'RESEARCH', 'ANALYSIS', 'VISUALS']
}
function invalidatedRefs(scope: DestinationBatchRedoScope): string[] {
  if (scope === 'STUDENT') return ['STUDENT', 'STUDENT_ARTIFACT_KEY', 'AUTO_REVIEW']
  if (scope === 'ADVENTURE') return ['ADVENTURE', 'ADVENTURE_ARTIFACT_KEY', 'AUTO_REVIEW']
  if (scope === 'VISUALS') return ['VISUALS', 'visualReviewState', 'AUTO_REVIEW']
  return ['STUDENT', 'STUDENT_ARTIFACT_KEY', 'ADVENTURE', 'ADVENTURE_ARTIFACT_KEY', 'AUTO_REVIEW']
}
function firstPhase(scope: DestinationBatchRedoScope): DestinationBatchJob['currentPhase'] { return scope === 'STUDENT' || scope === 'EDITORIAL' ? 'STUDENT' : scope === 'ADVENTURE' ? 'ADVENTURE' : 'VISUALS' }
