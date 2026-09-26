import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DestinationBatchIssueSchema,
  DestinationBatchJobSchema,
  DestinationBatchJobReviewReadModelSchema,
  DestinationBatchSchema,
  type DestinationBatch,
  type DestinationBatchIssue,
  type DestinationBatchJob,
  type DestinationBatchJobReviewReadModel,
  type DestinationBatchRedoScope,
} from '@shared/factory-batch-contracts'
import { RedoGenerationGuidanceSchema, type RedoGenerationGuidance } from '@shared/redo-guidance-contracts'
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

  async readJobForReview(jobId: string): Promise<DestinationBatchJobReviewReadModel | null> {
    const job = await this.getJob(jobId)
    if (!job) return null
    const empty = DestinationBatchJobReviewReadModelSchema.parse({
      jobId: job.id, batchId: job.batchId,
      destination: { canonicalDestinationId: job.canonicalDestinationId ?? null, name: job.originalName, country: job.country, region: job.region ?? null },
      status: job.status, phase: job.currentPhase, student: null, adventure: null,
      visualPackageId: job.artifactRefs.VISUALS ?? null, visualPackage: null, reviewArtifactId: job.artifactRefs.AUTO_REVIEW ?? null,
      structuredPackage: null, structuredPackageArtifactId: null, structuredPackageVersion: null,
      reviewSummary: null, warnings: [], cost: job.actualCost, attempts: job.attemptCount, lastError: job.lastFailure ?? null, redo: null,
    })
    const { data: redoRow, error: redoError } = await this.client.from('editorial_destination_batch_redo_operations')
      .select('id,scope,reason,guidance,previous_artifact_refs,requested_by,requested_at,status,completed_at').eq('job_id', job.id)
      .order('requested_at', { ascending: false }).limit(1).maybeSingle()
    assertNoError(redoError, 'READ_REVIEW_REDO')
    const redo = redoRow ? {
      operationId: String((redoRow as Row).id), scope: String((redoRow as Row).scope),
      reason: (redoRow as Row).reason === null ? null : String((redoRow as Row).reason),
      guidance: (redoRow as Row).guidance === null ? null : RedoGenerationGuidanceSchema.parse((redoRow as Row).guidance),
      previousArtifactRefs: ((redoRow as Row).previous_artifact_refs ?? {}) as Record<string, string>,
      requestedBy: String((redoRow as Row).requested_by), requestedAt: new Date(String((redoRow as Row).requested_at)),
      status: String((redoRow as Row).status), completedAt: (redoRow as Row).completed_at === null ? null : new Date(String((redoRow as Row).completed_at)),
    } : null
    const withRedo = { ...empty, redo }
    const { data: execution, error: executionError } = await this.client.from('real_editorial_executions').select('id')
      .eq('owner_type', 'BATCH_JOB').eq('owner_id', job.id).maybeSingle()
    assertNoError(executionError, 'READ_REVIEW_EXECUTION')
    if (!execution) return DestinationBatchJobReviewReadModelSchema.parse(withRedo)
    const revisionIds = [job.artifactRefs.STUDENT, job.artifactRefs.ADVENTURE].filter((id): id is string => Boolean(id))
    const { data: versions, error: versionError } = revisionIds.length === 0
      ? { data: [], error: null }
      : await this.client.from('real_editorial_library_version_revisions').select('id,version_id,title,content').in('id', revisionIds)
    assertNoError(versionError, 'READ_REVIEW_REVISIONS')
    const versionIds = (versions ?? []).map(row => String((row as Row).version_id))
    const { data: libraryVersions, error: libraryVersionError } = versionIds.length === 0
      ? { data: [], error: null }
      : await this.client.from('real_editorial_library_versions').select('id,library_entry_id').in('id', versionIds)
    assertNoError(libraryVersionError, 'READ_REVIEW_LIBRARY_VERSIONS')
    const versionById = new Map((libraryVersions ?? []).map(row => [String((row as Row).id), row as Row]))
    const revisionById = new Map((versions ?? []).map(row => [String((row as Row).id), row as Row]))
    const reference = (revisionId: string | undefined) => {
      if (!revisionId) return null
      const revision = revisionById.get(revisionId)
      const version = revision ? versionById.get(String(revision.version_id)) : undefined
      if (!revision || !version) return null
      return { libraryEntryId: String(version.library_entry_id), versionId: String(version.id), revisionId, title: String(revision.title), content: String(revision.content) }
    }
    let reviewSummary: Record<string, unknown> | null = null
    let warnings: string[] = []
    if (job.artifactRefs.AUTO_REVIEW) {
      const { data: review, error: reviewError } = await this.client.from('real_editorial_artifacts').select('payload')
        .eq('id', job.artifactRefs.AUTO_REVIEW).maybeSingle()
      assertNoError(reviewError, 'READ_REVIEW_ARTIFACT')
      if (review && isRecord((review as Row).payload)) {
        reviewSummary = (review as Row).payload as Record<string, unknown>
        if (Array.isArray(reviewSummary.issues)) warnings = reviewSummary.issues.filter((issue): issue is string => typeof issue === 'string')
      }
    }
    let visualPackage = null
    if (job.artifactRefs.VISUALS) {
      const [{ data: packageRow, error: packageError }, { data: assets, error: assetsError }, { data: selections, error: selectionsError }] = await Promise.all([
        this.client.from('real_editorial_visual_packages').select('*').eq('id', job.artifactRefs.VISUALS).maybeSingle(),
        this.client.from('real_editorial_visual_assets').select('*').eq('canonical_destination_id', job.canonicalDestinationId ?? ''),
        this.client.from('real_editorial_visual_package_selections').select('*').eq('package_id', job.artifactRefs.VISUALS),
      ])
      assertNoError(packageError, 'READ_REVIEW_VISUAL_PACKAGE')
      assertNoError(assetsError, 'READ_REVIEW_VISUAL_ASSETS')
      assertNoError(selectionsError, 'READ_REVIEW_VISUAL_SELECTIONS')
      if (packageRow) visualPackage = visualPackageFromRows(packageRow as Row, assets as Row[] ?? [], selections as Row[] ?? [])
    }
    const { data: structuredRow, error: structuredError } = await this.client.from('real_editorial_artifacts').select('id,version,payload')
      .eq('execution_owner_id', String((execution as Row).id)).eq('artifact_kind', 'editorial_package').eq('artifact_key', 'structured/v1')
      .order('version', { ascending: false }).limit(1).maybeSingle()
    assertNoError(structuredError, 'READ_REVIEW_STRUCTURED_PACKAGE')
    const structuredPackage = structuredRow ? (structuredRow as Row).payload : null
    return DestinationBatchJobReviewReadModelSchema.parse({ ...withRedo, student: reference(job.artifactRefs.STUDENT), adventure: reference(job.artifactRefs.ADVENTURE), visualPackage, structuredPackage, structuredPackageArtifactId: structuredRow ? String((structuredRow as Row).id) : null, structuredPackageVersion: structuredRow ? Number((structuredRow as Row).version) : null, reviewSummary, warnings })
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
    // A PostgreSQL function returning a composite `NULL` is represented by
    // PostgREST as an object whose fields are all null. Treat it as no claim.
    return data && (data as Row).id ? jobFromRow(data as Row) : null
  }

  async claimJob(jobId: string, workerId: string, leaseMs: number, now: Date): Promise<DestinationBatchJob | null> {
    const { data, error } = await this.client.rpc('factory_claim_destination_batch_job', { p_job_id: jobId, p_worker_id: workerId, p_lease_seconds: Math.max(1, Math.ceil(leaseMs / 1000)), p_now: now.toISOString() })
    assertNoError(error, 'CLAIM_JOB')
    return data && (data as Row).id ? jobFromRow(data as Row) : null
  }

  async renewClaim(jobId: string, claimToken: string, leaseMs: number, now: Date): Promise<DestinationBatchJob | null> {
    const { data, error } = await this.client.rpc('factory_renew_destination_batch_claim', { p_job_id: jobId, p_claim_token: claimToken, p_lease_seconds: Math.max(1, Math.ceil(leaseMs / 1000)), p_now: now.toISOString() })
    assertNoError(error, 'RENEW_CLAIM')
    return data && (data as Row).id ? jobFromRow(data as Row) : null
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

  async requestRedo(input: { jobId: string; scope: DestinationBatchRedoScope; guidance?: RedoGenerationGuidance; requestedBy: string; reason?: string; now: Date }): Promise<DestinationBatchJob> {
    const { data, error } = await this.client.rpc('factory_request_destination_batch_redo', {
      p_job_id: input.jobId, p_scope: input.scope, p_requested_by: input.requestedBy, p_reason: input.reason ?? null, p_guidance: input.guidance ?? null, p_now: input.now.toISOString(),
    })
    assertNoError(error, 'REQUEST_REDO')
    if (!data || !(data as Row).id) throw new Error('FACTORY_BATCH_REDO_NO_JOB')
    return jobFromRow(data as Row)
  }

  async completeRedo(operationId: string, outcome: 'COMPLETED' | 'FAILED', now: Date): Promise<void> {
    const { error } = await this.client.from('editorial_destination_batch_redo_operations')
      .update({ status: outcome, completed_at: now.toISOString() }).eq('id', operationId)
    assertNoError(error, 'COMPLETE_REDO')
  }

  async approveReadyJob(jobId: string, now: Date): Promise<DestinationBatchJob> {
    const { data, error } = await this.client.from('editorial_destination_batch_jobs')
      .update({ status: 'APPROVED', retryable: false, last_failure: null, updated_at: now.toISOString() })
      .eq('id', jobId).eq('status', 'READY_FOR_REVIEW').select().maybeSingle()
    assertNoError(error, 'APPROVE_READY_JOB')
    if (!data) throw new Error('BATCH_REVIEW_STATE_CHANGED')
    return jobFromRow(data as Row)
  }
}

function batchToRow(batch: DestinationBatch): Row {
  return {
    id: batch.id, name: batch.name, normalized_name: batch.normalizedName, import_fingerprint: batch.importFingerprint,
    source_origin: batch.sourceOrigin, status: batch.status, total_items: batch.totalItems, valid_items: batch.validItems,
    new_items: batch.newItems, existing_items: batch.existingItems, reusable_items: batch.reusableItems,
    ambiguous_items: batch.ambiguousItems, duplicate_items: batch.duplicateItems, invalid_items: batch.invalidItems,
    failed_items: batch.failedItems, max_cost_per_destination: batch.maxCostPerDestination,
    max_cost_per_batch: batch.maxCostPerBatch, smoke_fixture: batch.smokeFixture ?? false, imported_at: batch.importedAt.toISOString(),
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
    redo_operation_id: job.redoOperationId ?? null, redo_scope: job.redoScope ?? null, redo_guidance: job.redoGuidance ?? null, redo_reason: job.redoReason ?? null, redo_previous_artifact_refs: job.redoPreviousArtifactRefs ?? null,
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
    maxCostPerBatch: row.max_cost_per_batch === null ? null : Number(row.max_cost_per_batch), smokeFixture: Boolean(row.smoke_fixture), importedAt: new Date(String(row.imported_at)),
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
    redoOperationId: row.redo_operation_id ?? undefined, redoScope: row.redo_scope ?? undefined,
    redoGuidance: row.redo_guidance ? RedoGenerationGuidanceSchema.parse(row.redo_guidance) : undefined,
    redoReason: row.redo_reason ?? undefined, redoPreviousArtifactRefs: row.redo_previous_artifact_refs ?? undefined,
  })
}

function issueFromRow(row: Row): DestinationBatchIssue {
  return DestinationBatchIssueSchema.parse({
    id: row.id, batchId: row.batch_id, inputIndex: Number(row.input_index), kind: row.kind,
    message: row.message, normalizedIdentity: row.normalized_identity ?? undefined, createdAt: new Date(String(row.created_at)),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function visualPackageFromRows(packageRow: Row, assets: Row[], selections: Row[]) {
  return {
    schema: 'investighost-destination-visual-media-v1' as const,
    packageId: String(packageRow.id), destinationId: String(packageRow.canonical_destination_id), state: String(packageRow.state),
    packageHash: packageRow.package_hash === null ? null : String(packageRow.package_hash),
    assets: assets.map(asset => ({
      assetId: String(asset.id), destinationId: String(asset.canonical_destination_id), lifecycle: String(asset.lifecycle), rightsStatus: String(asset.rights_status),
      usageAllowed: asset.usage_allowed === null ? null : Boolean(asset.usage_allowed), rightsCheckedAt: asset.rights_checked_at === null ? null : String(asset.rights_checked_at),
      publicUrl: asset.public_url === null ? null : String(asset.public_url), storageIdentity: asset.storage_identity === null ? null : String(asset.storage_identity),
      sourceUrl: asset.source_url === null ? null : String(asset.source_url), sourceName: asset.source_name === null ? null : String(asset.source_name), author: asset.author === null ? null : String(asset.author), license: asset.license === null ? null : String(asset.license), attributionText: asset.attribution_text === null ? null : String(asset.attribution_text), associatedPlace: asset.associated_place === null ? null : String(asset.associated_place),
      category: String(asset.category), modes: asset.modes, alt: asset.alt === null ? null : String(asset.alt), caption: asset.caption === null ? null : String(asset.caption), width: asset.width === null ? null : Number(asset.width), height: asset.height === null ? null : Number(asset.height), mimeType: asset.mime_type === null ? null : String(asset.mime_type), checksum: asset.checksum === null ? null : String(asset.checksum), rejectionReason: asset.rejection_reason === null ? null : String(asset.rejection_reason),
    })),
    selections: selections.map(selection => ({ assetId: String(selection.asset_id), mode: String(selection.mode), role: String(selection.role), priority: Number(selection.priority) })),
  }
}
