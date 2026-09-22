import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DestinationBatchIssueSchema,
  DestinationBatchJobSchema,
  DestinationBatchSchema,
  type DestinationBatch,
  type DestinationBatchIssue,
  type DestinationBatchJob,
} from '@shared/factory-batch-contracts'
import type { DestinationBatchRepository, ExistingDestinationMatch } from './contracts'

type Row = Record<string, unknown>
const assertNoError = (error: { message: string; code?: string } | null, operation: string): void => {
  if (error) throw new Error(`FACTORY_BATCH_${operation}_FAILED: ${error.message}`)
}
const iso = (value: Date | undefined): string | null => value?.toISOString() ?? null

export class SupabaseDestinationBatchRepository implements DestinationBatchRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findBatchByFingerprint(fingerprint: string): Promise<DestinationBatch | null> {
    const { data, error } = await this.client.from('editorial_destination_batches')
      .select('*').eq('import_fingerprint', fingerprint).maybeSingle()
    assertNoError(error, 'FIND_FINGERPRINT')
    return data ? batchFromRow(data as Row) : null
  }

  async createBatch(batch: DestinationBatch): Promise<DestinationBatch> {
    const { data, error } = await this.client.from('editorial_destination_batches').insert(batchToRow(batch)).select().single()
    if (error?.code === '23505') {
      const existing = await this.findBatchByFingerprint(batch.importFingerprint)
      if (existing) return existing
    }
    assertNoError(error, 'CREATE_BATCH')
    return batchFromRow(data as Row)
  }

  async getBatch(batchId: string): Promise<DestinationBatch | null> {
    const { data, error } = await this.client.from('editorial_destination_batches').select('*').eq('id', batchId).maybeSingle()
    assertNoError(error, 'GET_BATCH')
    return data ? batchFromRow(data as Row) : null
  }

  async listBatches(): Promise<DestinationBatch[]> {
    const { data, error } = await this.client.from('editorial_destination_batches').select('*').order('created_at', { ascending: false })
    assertNoError(error, 'LIST_BATCHES')
    return (data ?? []).map(row => batchFromRow(row as Row))
  }

  async insertJob(job: DestinationBatchJob): Promise<DestinationBatchJob> {
    const { data, error } = await this.client.from('editorial_destination_batch_jobs').insert(jobToRow(job)).select().single()
    if (error?.code === '23505') {
      const { data: existing, error: readError } = await this.client.from('editorial_destination_batch_jobs')
        .select('*').eq('batch_id', job.batchId).eq('normalized_identity', job.normalizedIdentity).single()
      assertNoError(readError, 'READ_EXISTING_JOB')
      return jobFromRow(existing as Row)
    }
    assertNoError(error, 'INSERT_JOB')
    return jobFromRow(data as Row)
  }

  async getJob(jobId: string): Promise<DestinationBatchJob | null> {
    const { data, error } = await this.client.from('editorial_destination_batch_jobs').select('*').eq('id', jobId).maybeSingle()
    assertNoError(error, 'GET_JOB')
    return data ? jobFromRow(data as Row) : null
  }

  async updateJob(job: DestinationBatchJob): Promise<DestinationBatchJob> {
    const { data, error } = await this.client.from('editorial_destination_batch_jobs')
      .update(jobToRow(job)).eq('id', job.id).select().single()
    assertNoError(error, 'UPDATE_JOB')
    return jobFromRow(data as Row)
  }

  async listJobs(batchId: string): Promise<DestinationBatchJob[]> {
    const { data, error } = await this.client.from('editorial_destination_batch_jobs')
      .select('*').eq('batch_id', batchId).order('input_index')
    assertNoError(error, 'LIST_JOBS')
    return (data ?? []).map(row => jobFromRow(row as Row))
  }

  async insertIssue(issue: DestinationBatchIssue): Promise<void> {
    const { error } = await this.client.from('editorial_destination_batch_issues').insert(issueToRow(issue))
    assertNoError(error, 'INSERT_ISSUE')
  }

  async listIssues(batchId: string): Promise<DestinationBatchIssue[]> {
    const { data, error } = await this.client.from('editorial_destination_batch_issues')
      .select('*').eq('batch_id', batchId).order('input_index')
    assertNoError(error, 'LIST_ISSUES')
    return (data ?? []).map(row => issueFromRow(row as Row))
  }

  async findExistingDestination(input: { canonicalDestinationId?: string; normalizedIdentity: string }): Promise<ExistingDestinationMatch> {
    const activeJobs = await this.client.from('editorial_destination_batch_jobs')
      .select('id').eq('normalized_identity', input.normalizedIdentity)
      .in('status', ['QUEUED', 'PROCESSING', 'READY_FOR_REVIEW', 'APPROVED', 'REDO_REQUIRED']).limit(1)
    assertNoError(activeJobs.error, 'FIND_ACTIVE_JOB')
    if (!input.canonicalDestinationId) {
      return { hasApprovedContent: false, hasDeliveredContent: false, ...(activeJobs.data?.[0] ? { existingJobId: String(activeJobs.data[0].id) } : {}) }
    }
    const [library, delivery] = await Promise.all([
      this.client.from('real_editorial_library_entries').select('id').eq('canonical_destination_id', input.canonicalDestinationId).limit(1),
      this.client.from('real_editorial_trawel_deliveries').select('id').eq('investighost_canonical_destination_id', input.canonicalDestinationId).eq('state', 'CONFIRMED').limit(1),
    ])
    assertNoError(library.error, 'FIND_LIBRARY')
    assertNoError(delivery.error, 'FIND_DELIVERY')
    return {
      hasApprovedContent: Boolean(library.data?.length),
      hasDeliveredContent: Boolean(delivery.data?.length),
      ...(activeJobs.data?.[0] ? { existingJobId: String(activeJobs.data[0].id) } : {}),
    }
  }

  async claimNextJob(batchId: string, workerId: string, leaseMs: number, now: Date): Promise<DestinationBatchJob | null> {
    const { data, error } = await this.client.rpc('factory_claim_next_destination_batch_job', { p_batch_id: batchId, p_worker_id: workerId, p_lease_seconds: Math.max(1, Math.ceil(leaseMs / 1000)), p_now: now.toISOString() })
    assertNoError(error, 'CLAIM_NEXT_JOB')
    return data ? jobFromRow(data as Row) : null
  }

  async claimJob(jobId: string, workerId: string, leaseMs: number, now: Date): Promise<DestinationBatchJob | null> {
    const { data, error } = await this.client.rpc('factory_claim_destination_batch_job', { p_job_id: jobId, p_worker_id: workerId, p_lease_seconds: Math.max(1, Math.ceil(leaseMs / 1000)), p_now: now.toISOString() })
    assertNoError(error, 'CLAIM_JOB')
    return data ? jobFromRow(data as Row) : null
  }

  async renewClaim(jobId: string, claimToken: string, leaseMs: number, now: Date): Promise<DestinationBatchJob | null> {
    const { data, error } = await this.client.rpc('factory_renew_destination_batch_claim', { p_job_id: jobId, p_claim_token: claimToken, p_lease_seconds: Math.max(1, Math.ceil(leaseMs / 1000)), p_now: now.toISOString() })
    assertNoError(error, 'RENEW_CLAIM')
    return data ? jobFromRow(data as Row) : null
  }

  async releaseClaim(job: DestinationBatchJob, claimToken: string): Promise<DestinationBatchJob> {
    const { data, error } = await this.client.from('editorial_destination_batch_jobs').update(jobToRow({ ...job, claimedBy: undefined, claimToken: undefined, claimExpiresAt: undefined })).eq('id', job.id).eq('claim_token', claimToken).select().maybeSingle()
    assertNoError(error, 'RELEASE_CLAIM')
    if (!data) throw new Error('DESTINATION_BATCH_CLAIM_LOST')
    return jobFromRow(data as Row)
  }

  async recoverStaleClaims(now: Date): Promise<number> {
    const { data, error } = await this.client.rpc('factory_recover_stale_destination_batch_claims', { p_now: now.toISOString() })
    assertNoError(error, 'RECOVER_STALE_CLAIMS')
    return Number(data ?? 0)
  }

  async totalActualCost(batchId: string): Promise<number> {
    const { data, error } = await this.client.from('editorial_destination_batch_jobs').select('actual_cost').eq('batch_id', batchId)
    assertNoError(error, 'TOTAL_ACTUAL_COST')
    return (data ?? []).reduce((total, row) => total + Number((row as Row).actual_cost ?? 0), 0)
  }
}

function batchToRow(batch: DestinationBatch): Row {
  return {
    id: batch.id, name: batch.name, normalized_name: batch.normalizedName, import_fingerprint: batch.importFingerprint,
    source_origin: batch.sourceOrigin, status: batch.status, total_items: batch.totalItems, valid_items: batch.validItems,
    new_items: batch.newItems, existing_items: batch.existingItems, reusable_items: batch.reusableItems,
    ambiguous_items: batch.ambiguousItems, duplicate_items: batch.duplicateItems, invalid_items: batch.invalidItems,
    failed_items: batch.failedItems, max_cost_per_destination: batch.maxCostPerDestination,
    max_cost_per_batch: batch.maxCostPerBatch, imported_at: batch.importedAt.toISOString(),
    created_at: batch.createdAt.toISOString(), updated_at: batch.updatedAt.toISOString(),
  }
}

function jobToRow(job: DestinationBatchJob): Row {
  return {
    id: job.id, batch_id: job.batchId, input_index: job.inputIndex, original_name: job.originalName,
    country: job.country, region: job.region ?? null, normalized_name: job.normalizedName,
    normalized_country: job.normalizedCountry, normalized_region: job.normalizedRegion ?? null,
    normalized_identity: job.normalizedIdentity, canonical_destination_id: job.canonicalDestinationId ?? null,
    identity_state: job.identityState, reuse_policy: job.reusePolicy, existing_job_id: job.existingJobId ?? null,
    status: job.status, current_phase: job.currentPhase, completed_phases: job.completedPhases,
    artifact_refs: job.artifactRefs, attempt_count: job.attemptCount, last_failure: job.lastFailure ?? null,
    retryable: job.retryable, retry_requested_at: iso(job.retryRequestedAt), actual_cost: job.actualCost,
    claimed_by: job.claimedBy ?? null, claim_token: job.claimToken ?? null, claim_expires_at: iso(job.claimExpiresAt), started_at: iso(job.startedAt),
    created_at: job.createdAt.toISOString(), updated_at: job.updatedAt.toISOString(),
  }
}

function issueToRow(issue: DestinationBatchIssue): Row {
  return {
    id: issue.id, batch_id: issue.batchId, input_index: issue.inputIndex, kind: issue.kind,
    message: issue.message, normalized_identity: issue.normalizedIdentity ?? null, created_at: issue.createdAt.toISOString(),
  }
}

function batchFromRow(row: Row): DestinationBatch {
  return DestinationBatchSchema.parse({
    id: row.id, name: row.name, normalizedName: row.normalized_name, importFingerprint: row.import_fingerprint,
    sourceOrigin: row.source_origin, status: row.status, totalItems: Number(row.total_items), validItems: Number(row.valid_items),
    newItems: Number(row.new_items), existingItems: Number(row.existing_items), reusableItems: Number(row.reusable_items),
    ambiguousItems: Number(row.ambiguous_items), duplicateItems: Number(row.duplicate_items), invalidItems: Number(row.invalid_items),
    failedItems: Number(row.failed_items), maxCostPerDestination: row.max_cost_per_destination === null ? null : Number(row.max_cost_per_destination),
    maxCostPerBatch: row.max_cost_per_batch === null ? null : Number(row.max_cost_per_batch), importedAt: new Date(String(row.imported_at)),
    createdAt: new Date(String(row.created_at)), updatedAt: new Date(String(row.updated_at)),
  })
}

function jobFromRow(row: Row): DestinationBatchJob {
  return DestinationBatchJobSchema.parse({
    id: row.id, batchId: row.batch_id, inputIndex: Number(row.input_index), originalName: row.original_name,
    country: row.country, region: row.region ?? undefined, normalizedName: row.normalized_name,
    normalizedCountry: row.normalized_country, normalizedRegion: row.normalized_region ?? undefined,
    normalizedIdentity: row.normalized_identity, canonicalDestinationId: row.canonical_destination_id ?? undefined,
    identityState: row.identity_state, reusePolicy: row.reuse_policy, existingJobId: row.existing_job_id ?? undefined,
    status: row.status, currentPhase: row.current_phase, completedPhases: row.completed_phases ?? [], artifactRefs: row.artifact_refs ?? {},
    attemptCount: Number(row.attempt_count), lastFailure: row.last_failure ?? undefined, retryable: Boolean(row.retryable),
    retryRequestedAt: row.retry_requested_at ? new Date(String(row.retry_requested_at)) : undefined,
    actualCost: Number(row.actual_cost), createdAt: new Date(String(row.created_at)), updatedAt: new Date(String(row.updated_at)),
    claimedBy: row.claimed_by ?? undefined, claimToken: row.claim_token ?? undefined,
    claimExpiresAt: row.claim_expires_at ? new Date(String(row.claim_expires_at)) : undefined,
    startedAt: row.started_at ? new Date(String(row.started_at)) : undefined,
  })
}

function issueFromRow(row: Row): DestinationBatchIssue {
  return DestinationBatchIssueSchema.parse({
    id: row.id, batchId: row.batch_id, inputIndex: Number(row.input_index), kind: row.kind,
    message: row.message, normalizedIdentity: row.normalized_identity ?? undefined, createdAt: new Date(String(row.created_at)),
  })
}
