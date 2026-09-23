import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { GeographicResolver } from '@modules/editorial-pipeline/geography'
import {
  DestinationBatchDestinationSchema,
  DestinationBatchImportResultSchema,
  DestinationBatchInputSchema,
  DestinationBatchIssueSchema,
  DestinationBatchJobSchema,
  DestinationBatchReadModelSchema,
  DestinationBatchJobReviewReadModelSchema,
  DestinationBatchSchema,
  type DestinationBatch,
  type DestinationBatchImportResult,
  type DestinationBatchJob,
  type DestinationBatchReadModel,
  type DestinationBatchJobReviewReadModel,
} from '@shared/factory-batch-contracts'
import type { DestinationBatchRepository, DestinationBatchRetryResult, ExistingDestinationMatch } from './contracts'
import { importFingerprint, normalizeDestinationInput, normalizeDisplayText } from './normalization'

export class DestinationBatchImportError extends Error {
  constructor(readonly code: 'INVALID_JSON' | 'INVALID_ENVELOPE' | 'MAX_DESTINATIONS' | 'BATCH_NOT_FOUND' | 'JOB_NOT_FOUND' | 'RETRY_NOT_ALLOWED', message: string) {
    super(message)
    this.name = 'DestinationBatchImportError'
  }
}

export class DestinationBatchService {
  constructor(
    private readonly repository: DestinationBatchRepository,
    private readonly geography: GeographicResolver,
  ) {}

  async importJson(jsonText: string): Promise<DestinationBatchImportResult> {
    const input = this.parseImport(jsonText)
    const batchName = normalizeDisplayText(input.batch.name)
    if (!batchName) throw new DestinationBatchImportError('INVALID_ENVELOPE', 'batch.name es obligatorio')
    if (input.destinations.length > 50) throw new DestinationBatchImportError('MAX_DESTINATIONS', 'V1 permite un máximo de 50 destinos por lote')

    const validRows = input.destinations.flatMap((row, inputIndex) => {
      const parsed = DestinationBatchDestinationSchema.safeParse(row)
      return parsed.success ? [{ inputIndex, input: normalizeDestinationInput(parsed.data) }] : []
    })
    const fingerprint = importFingerprint(batchName, validRows.map(row => row.input.normalizedIdentity), {
      maxCostPerDestination: input.batch.maxCostPerDestination,
      maxCostPerBatch: input.batch.maxCostPerBatch,
    })
    const existingBatch = await this.repository.findBatchByFingerprint(fingerprint)
    if (existingBatch) return this.result(existingBatch, true)

    const now = new Date()
    const batchId = randomUUID()
    const issues: ReturnType<typeof DestinationBatchIssueSchema.parse>[] = []
    const jobs: DestinationBatchJob[] = []
    const seen = new Set<string>()
    for (let inputIndex = 0; inputIndex < input.destinations.length; inputIndex += 1) {
      const parsed = DestinationBatchDestinationSchema.safeParse(input.destinations[inputIndex])
      if (!parsed.success) {
        issues.push(DestinationBatchIssueSchema.parse({
          id: randomUUID(), batchId, inputIndex, kind: 'INVALID_ROW',
          message: parsed.error.issues.map(issue => issue.message).join('; '), createdAt: now,
        }))
        continue
      }
      const normalized = normalizeDestinationInput(parsed.data)
      if (seen.has(normalized.normalizedIdentity)) {
        issues.push(DestinationBatchIssueSchema.parse({
          id: randomUUID(), batchId, inputIndex, kind: 'DUPLICATE_INPUT',
          message: 'Destino duplicado dentro del mismo archivo; no se creará otro trabajo.',
          normalizedIdentity: normalized.normalizedIdentity, createdAt: now,
        }))
        continue
      }
      seen.add(normalized.normalizedIdentity)
      jobs.push(await this.createJob(batchId, inputIndex, normalized, now))
    }

    const summary = summarize(input.destinations.length, jobs, issues)
    const batch = DestinationBatchSchema.parse({
      id: batchId, name: batchName, normalizedName: normalizeDisplayText(batchName).toLocaleLowerCase('es'),
      importFingerprint: fingerprint, sourceOrigin: 'json_v1', status: 'IMPORTED',
      totalItems: summary.total, validItems: summary.valid, newItems: summary.new,
      existingItems: summary.existing, reusableItems: summary.reusable, ambiguousItems: summary.ambiguous,
      duplicateItems: summary.duplicateInput, invalidItems: summary.invalid, failedItems: 0,
      maxCostPerDestination: input.batch.maxCostPerDestination ?? null,
      maxCostPerBatch: input.batch.maxCostPerBatch ?? null, importedAt: now, createdAt: now, updatedAt: now,
    })
    const created = await this.repository.createBatch(batch)
    if (created.id !== batch.id) return this.result(created, true)
    for (const job of jobs) await this.repository.insertJob(job)
    for (const issue of issues) await this.repository.insertIssue(issue)
    return DestinationBatchImportResultSchema.parse({ batch: created, jobs, issues, idempotentReplay: false, summary })
  }

  async read(batchId: string): Promise<DestinationBatchReadModel> {
    const batch = await this.repository.getBatch(batchId)
    if (!batch) throw new DestinationBatchImportError('BATCH_NOT_FOUND', 'El lote no existe')
    const [jobs, issues] = await Promise.all([this.repository.listJobs(batchId), this.repository.listIssues(batchId)])
    const countsByStatus = Object.fromEntries(['QUEUED', 'PROCESSING', 'READY_FOR_REVIEW', 'APPROVED', 'REDO_REQUIRED', 'DELIVERED', 'FAILED', 'BLOCKED_AMBIGUOUS', 'REUSED']
      .map(status => [status, jobs.filter(job => job.status === status).length]))
    return DestinationBatchReadModelSchema.parse({ batch, jobs, issues, countsByStatus })
  }

  async list(): Promise<DestinationBatch[]> { return this.repository.listBatches() }

  async readJobForReview(jobId: string): Promise<DestinationBatchJobReviewReadModel> {
    const model = await this.repository.readJobForReview(jobId)
    if (!model) throw new DestinationBatchImportError('JOB_NOT_FOUND', 'El trabajo no existe')
    return DestinationBatchJobReviewReadModelSchema.parse(model)
  }

  async retry(jobId: string): Promise<DestinationBatchRetryResult> {
    const job = await this.repository.getJob(jobId)
    if (!job) throw new DestinationBatchImportError('JOB_NOT_FOUND', 'El trabajo no existe')
    if (!job.retryable || !['FAILED', 'REDO_REQUIRED'].includes(job.status)) {
      throw new DestinationBatchImportError('RETRY_NOT_ALLOWED', 'El trabajo no admite reintento en su estado actual')
    }
    const next = DestinationBatchJobSchema.parse({
      ...job, status: 'QUEUED', lastFailure: undefined, retryable: true,
      retryRequestedAt: new Date(), updatedAt: new Date(),
    })
    return { job: await this.repository.updateJob(next), resumedPhase: next.currentPhase }
  }

  private parseImport(jsonText: string): z.infer<typeof DestinationBatchInputSchema> {
    let raw: unknown
    try { raw = JSON.parse(jsonText) } catch { throw new DestinationBatchImportError('INVALID_JSON', 'El archivo no contiene JSON válido') }
    const parsed = DestinationBatchInputSchema.safeParse(raw)
    if (!parsed.success) throw new DestinationBatchImportError('INVALID_ENVELOPE', parsed.error.issues.map(issue => issue.message).join('; '))
    if (parsed.data.destinations.length < 1) throw new DestinationBatchImportError('INVALID_ENVELOPE', 'destinations debe contener al menos un destino')
    return parsed.data
  }

  private async createJob(batchId: string, inputIndex: number, input: ReturnType<typeof normalizeDestinationInput>, now: Date): Promise<DestinationBatchJob> {
    const resolution = input.countryCode
      ? await this.geography.resolve({ query: input.originalName, countryCode: input.countryCode })
      : { status: 'not_found' as const }
    if (resolution.status === 'ambiguous') {
      return DestinationBatchJobSchema.parse({
        id: randomUUID(), batchId, inputIndex, ...input, identityState: 'AMBIGUOUS', reusePolicy: 'AMBIGUOUS',
        status: 'BLOCKED_AMBIGUOUS', currentPhase: 'IDENTITY', completedPhases: [], artifactRefs: {},
        attemptCount: 0, retryable: false, actualCost: 0, createdAt: now, updatedAt: now,
      })
    }
    const canonicalDestinationId = resolution.status === 'resolved' ? resolution.entity.id : undefined
    const existing = await this.repository.findExistingDestination({ canonicalDestinationId, normalizedIdentity: input.normalizedIdentity })
    const classification = classifyExisting(existing)
    return DestinationBatchJobSchema.parse({
      id: randomUUID(), batchId, inputIndex, ...input,
      ...(canonicalDestinationId ? { canonicalDestinationId } : {}),
      identityState: classification.identityState, reusePolicy: classification.reusePolicy,
      ...(existing.existingJobId ? { existingJobId: existing.existingJobId } : {}),
      status: classification.status, currentPhase: classification.status === 'QUEUED' ? 'RESEARCH' : 'IDENTITY',
      completedPhases: [], artifactRefs: {}, attemptCount: 0,
      retryable: classification.status === 'QUEUED', actualCost: 0, createdAt: now, updatedAt: now,
    })
  }

  private async result(batch: DestinationBatch, idempotentReplay: boolean): Promise<DestinationBatchImportResult> {
    const [jobs, issues] = await Promise.all([this.repository.listJobs(batch.id), this.repository.listIssues(batch.id)])
    return DestinationBatchImportResultSchema.parse({
      batch, jobs, issues, idempotentReplay,
      summary: summarize(batch.totalItems, jobs, issues),
    })
  }
}

function classifyExisting(existing: ExistingDestinationMatch): {
  identityState: DestinationBatchJob['identityState']
  reusePolicy: DestinationBatchJob['reusePolicy']
  status: DestinationBatchJob['status']
} {
  if (existing.hasDeliveredContent) return { identityState: 'EXISTS_DELIVERED', reusePolicy: 'CAN_REUSE_EXISTING', status: 'REUSED' }
  if (existing.hasApprovedContent) return { identityState: 'EXISTS_WITH_APPROVED_CONTENT', reusePolicy: 'CAN_REUSE_EXISTING', status: 'REUSED' }
  if (existing.existingJobId) return { identityState: 'EXISTS', reusePolicy: 'WAIT_FOR_EXISTING', status: 'REUSED' }
  return { identityState: 'NEW', reusePolicy: 'NEEDS_NEW_PRODUCTION', status: 'QUEUED' }
}

function summarize(total: number, jobs: DestinationBatchJob[], issues: Array<{ kind: 'INVALID_ROW' | 'DUPLICATE_INPUT' }>) {
  const duplicateInput = issues.filter(issue => issue.kind === 'DUPLICATE_INPUT').length
  const invalid = issues.filter(issue => issue.kind === 'INVALID_ROW').length
  return {
    total, valid: total - invalid, new: jobs.filter(job => job.identityState === 'NEW').length,
    existing: jobs.filter(job => job.identityState.startsWith('EXISTS')).length,
    reusable: jobs.filter(job => job.reusePolicy === 'CAN_REUSE_EXISTING').length,
    ambiguous: jobs.filter(job => job.identityState === 'AMBIGUOUS').length,
    duplicateInput, invalid, queued: jobs.filter(job => job.status === 'QUEUED').length,
  }
}
