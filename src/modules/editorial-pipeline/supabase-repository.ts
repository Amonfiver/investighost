import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ResearchDestinationResultSchema,
  type ResearchDestinationResult,
} from '@shared/editorial-contracts'
import {
  EditorialRepositoryError,
  type EditorialResearchRepository,
  type EditorialResearchSummary,
  type EditorialDraftVersionSummary,
  type EditorialExecutionScaffold,
  type EditorialStageCheckpoint,
} from './repository'

type SupabaseError = { message: string; code?: string } | null
type Row = Record<string, unknown>

const iso = (value?: Date): string | null => value?.toISOString() ?? null

export class SupabaseEditorialResearchRepository implements EditorialResearchRepository {
  constructor(private readonly client: SupabaseClient) {}

  async saveScaffold(scaffold: EditorialExecutionScaffold): Promise<void> {
    const { destination, request, run } = scaffold
    try {
      await this.upsert('geographic_entities', {
        id: destination.id,
        parent_id: destination.parentId ?? null,
        entity_type: destination.type,
        name: destination.name,
        normalized_name: destination.normalizedName,
        country_code: destination.countryCode,
        region_code: destination.regionCode ?? null,
        slug: destination.slug,
        latitude: destination.coordinates?.latitude ?? null,
        longitude: destination.coordinates?.longitude ?? null,
        source_name: destination.sourceName,
        source_version: destination.sourceVersion,
        source_license: destination.sourceLicense,
        source_snapshot_id: destination.sourceSnapshotId ?? null,
        source_checked_at: iso(destination.sourceCheckedAt),
        status: destination.status,
        resolution_method: destination.resolutionMethod,
        version: destination.version,
        created_at: destination.createdAt.toISOString(),
        updated_at: destination.updatedAt.toISOString(),
      })
      await this.upsertMany('geographic_aliases', destination.aliases.map(alias => ({
        id: randomUUID(),
        entity_id: destination.id,
        alias,
        normalized_alias: normalizeText(alias),
        source_version: destination.sourceVersion,
      })), 'entity_id,normalized_alias')
      await this.upsertMany('geographic_external_ids', Object.entries(destination.externalIds ?? {}).map(([provider, externalId]) => ({
        entity_id: destination.id,
        provider,
        external_id: externalId,
        source_snapshot_id: destination.sourceSnapshotId ?? null,
      })), 'provider,external_id')
      await this.updateExecution(request, run)
    } catch (error) {
      if (error instanceof EditorialRepositoryError) throw error
      throw new EditorialRepositoryError('PERSISTENCE_ERROR', error instanceof Error ? error.message : String(error), error)
    }
  }

  async updateExecution(request: EditorialExecutionScaffold['request'], run: EditorialExecutionScaffold['run']): Promise<void> {
    await this.upsert('editorial_research_requests', {
      id: request.id,
      destination_id: request.destinationId,
      destination_query_snapshot: request.destinationQuerySnapshot,
      profiles: request.profiles,
      language: request.language,
      depth: request.depth,
      notes: request.notes ?? null,
      options: request.options,
      configuration_version: request.configurationVersion,
      idempotency_key: request.idempotencyKey,
      actor_id: request.actorId,
      state: request.state,
      version: request.version,
      created_at: request.createdAt.toISOString(),
      updated_at: request.updatedAt.toISOString(),
    })
    await this.upsert('editorial_research_runs', {
      id: run.id,
      request_id: run.requestId,
      stage: run.stage,
      provider_id: run.providerId,
      model: run.model,
      prompt_version: run.promptVersion,
      contract_version: run.contractVersion,
      attempt: run.attempt,
      estimated_cost: run.estimatedCost,
      actual_cost: run.actualCost ?? null,
      currency: run.currency,
      input_units: run.inputUnits,
      output_units: run.outputUnits,
      started_at: iso(run.startedAt),
      completed_at: iso(run.completedAt),
      error_code: run.errorCode ?? null,
      error_message: run.errorMessage ?? null,
      recovery_from_run_id: run.recoveryFromRunId ?? null,
      cancelled_by: run.cancelledBy ?? null,
      state: run.state,
      created_at: run.createdAt.toISOString(),
      updated_at: run.updatedAt.toISOString(),
    })
  }

  async save(candidate: ResearchDestinationResult): Promise<void> {
    const result = ResearchDestinationResultSchema.parse(candidate)

    try {
      await this.upsert('geographic_entities', {
        id: result.destination.id,
        parent_id: result.destination.parentId ?? null,
        entity_type: result.destination.type,
        name: result.destination.name,
        normalized_name: result.destination.normalizedName,
        country_code: result.destination.countryCode,
        region_code: result.destination.regionCode ?? null,
        slug: result.destination.slug,
        latitude: result.destination.coordinates?.latitude ?? null,
        longitude: result.destination.coordinates?.longitude ?? null,
        source_name: result.destination.sourceName,
        source_version: result.destination.sourceVersion,
        source_license: result.destination.sourceLicense,
        source_snapshot_id: result.destination.sourceSnapshotId ?? null,
        source_checked_at: iso(result.destination.sourceCheckedAt),
        status: result.destination.status,
        resolution_method: result.destination.resolutionMethod,
        version: result.destination.version,
        created_at: result.destination.createdAt.toISOString(),
        updated_at: result.destination.updatedAt.toISOString(),
      })

      await this.upsertMany('geographic_aliases', result.destination.aliases.map(alias => ({
        id: randomUUID(),
        entity_id: result.destination.id,
        alias,
        normalized_alias: normalizeText(alias),
        source_version: result.destination.sourceVersion,
      })), 'entity_id,normalized_alias')

      await this.upsertMany('geographic_external_ids', Object.entries(result.destination.externalIds ?? {}).map(([provider, externalId]) => ({
        entity_id: result.destination.id,
        provider,
        external_id: externalId,
        source_snapshot_id: result.destination.sourceSnapshotId ?? null,
      })), 'provider,external_id')

      await this.upsert('editorial_research_requests', {
        id: result.request.id,
        destination_id: result.request.destinationId,
        destination_query_snapshot: result.request.destinationQuerySnapshot,
        profiles: result.request.profiles,
        language: result.request.language,
        depth: result.request.depth,
        notes: result.request.notes ?? null,
        options: result.request.options,
        configuration_version: result.request.configurationVersion,
        idempotency_key: result.request.idempotencyKey,
        actor_id: result.request.actorId,
        state: result.request.state,
        version: result.request.version,
        created_at: result.request.createdAt.toISOString(),
        updated_at: result.request.updatedAt.toISOString(),
      })

      await this.upsert('editorial_research_runs', {
        id: result.run.id,
        request_id: result.run.requestId,
        stage: result.run.stage,
        provider_id: result.run.providerId,
        model: result.run.model,
        prompt_version: result.run.promptVersion,
        contract_version: result.run.contractVersion,
        attempt: result.run.attempt,
        estimated_cost: result.run.estimatedCost,
        actual_cost: result.run.actualCost ?? null,
        currency: result.run.currency,
        input_units: result.run.inputUnits,
        output_units: result.run.outputUnits,
        started_at: iso(result.run.startedAt),
        completed_at: iso(result.run.completedAt),
        error_code: result.run.errorCode ?? null,
        error_message: result.run.errorMessage ?? null,
        recovery_from_run_id: result.run.recoveryFromRunId ?? null,
        cancelled_by: result.run.cancelledBy ?? null,
        state: result.run.state,
        created_at: result.run.createdAt.toISOString(),
        updated_at: result.run.updatedAt.toISOString(),
      })

      await this.persistSources(result)
      await this.persistFacts(result)
      await this.persistPlaces(result)
      await this.persistActivities(result)
      await this.persistDrafts(result)
      await this.persistQuality(result)
      await this.persistUsageAndEvents(result)

      const serialized = serialize(result)
      await this.saveCheckpoint({
        id: randomUUID(),
        requestId: result.request.id,
        runId: result.run.id,
        stage: result.run.stage,
        attempt: result.run.attempt,
        snapshot: serialized,
        snapshotHash: sha256(serialized),
        createdAt: result.request.updatedAt,
      })
    } catch (error) {
      if (error instanceof EditorialRepositoryError) throw error
      throw new EditorialRepositoryError('PERSISTENCE_ERROR', error instanceof Error ? error.message : String(error), error)
    }
  }

  async getByRequestId(requestId: string): Promise<ResearchDestinationResult | null> {
    const checkpoint = await this.getLatestCheckpoint(requestId)
    if (!checkpoint) return null
    try {
      return ResearchDestinationResultSchema.parse(reviveDates(checkpoint.snapshot))
    } catch (error) {
      throw new EditorialRepositoryError('PERSISTENCE_ERROR', 'El checkpoint editorial no cumple el contrato vigente', error)
    }
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<ResearchDestinationResult | null> {
    const { data, error } = await this.client
      .from('editorial_research_requests')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    this.assertNoError(error, 'FIND_IDEMPOTENCY')
    return data ? this.getByRequestId(String(data.id)) : null
  }

  async list(limit = 100): Promise<EditorialResearchSummary[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 500)
    const requestsResult = await this.client
      .from('editorial_research_requests')
      .select('id,destination_id,destination_query_snapshot,profiles,state,version,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(boundedLimit)
    this.assertNoError(requestsResult.error, 'LIST_REQUESTS')
    const requestIds = (requestsResult.data ?? []).map(row => String(row.id))
    const runsResult = requestIds.length === 0
      ? { data: [] as Row[], error: null }
      : await this.client.from('editorial_research_runs')
        .select('request_id,stage,state,error_code,error_message,actual_cost,currency,updated_at')
        .in('request_id', requestIds)
        .order('updated_at', { ascending: false })
    this.assertNoError(runsResult.error, 'LIST_RUNS')
    const latestRuns = new Map<string, Row>()
    for (const row of runsResult.data as Row[] ?? []) {
      const requestId = String(row.request_id)
      if (!latestRuns.has(requestId)) latestRuns.set(requestId, row)
    }
    return (requestsResult.data ?? []).map(row => {
      const run = latestRuns.get(String(row.id))
      return {
      requestId: String(row.id),
      destinationId: String(row.destination_id),
      destinationQuery: String(row.destination_query_snapshot),
      profiles: row.profiles as Array<'adventure' | 'student'>,
      state: row.state as EditorialResearchSummary['state'],
      version: Number(row.version),
      stage: run?.stage as EditorialResearchSummary['stage'],
      runState: run?.state as EditorialResearchSummary['runState'],
      errorCode: run?.error_code ? String(run.error_code) : undefined,
      errorMessage: run?.error_message ? String(run.error_message) : undefined,
      actualCost: run?.actual_cost === null || run?.actual_cost === undefined ? undefined : Number(run.actual_cost),
      currency: run?.currency ? String(run.currency) : undefined,
      createdAt: new Date(String(row.created_at)),
      updatedAt: new Date(String(row.updated_at)),
      }
    })
  }

  async listDraftVersions(requestId: string): Promise<EditorialDraftVersionSummary[]> {
    const { data, error } = await this.client
      .from('editorial_drafts')
      .select('id,request_id,profile,title,content_version,state,previous_draft_id,regeneration_reason,human_edited,created_at,updated_at')
      .eq('request_id', requestId)
      .order('content_version', { ascending: false })
    this.assertNoError(error, 'LIST_DRAFT_VERSIONS')
    return (data ?? []).map(row => ({
      id: String(row.id),
      requestId: String(row.request_id),
      profile: row.profile as EditorialDraftVersionSummary['profile'],
      title: String(row.title),
      contentVersion: Number(row.content_version),
      state: row.state as EditorialDraftVersionSummary['state'],
      previousDraftId: row.previous_draft_id ? String(row.previous_draft_id) : undefined,
      reason: row.regeneration_reason ? String(row.regeneration_reason) : undefined,
      humanEdited: Boolean(row.human_edited),
      createdAt: new Date(String(row.created_at)),
      updatedAt: new Date(String(row.updated_at)),
    }))
  }

  async saveCheckpoint(checkpoint: EditorialStageCheckpoint): Promise<void> {
    await this.upsert('stage_checkpoints', {
      id: checkpoint.id,
      request_id: checkpoint.requestId,
      run_id: checkpoint.runId,
      stage: checkpoint.stage,
      attempt: checkpoint.attempt,
      snapshot: checkpoint.snapshot,
      snapshot_hash: checkpoint.snapshotHash,
      created_at: checkpoint.createdAt.toISOString(),
    }, 'run_id,stage,attempt')
  }

  async getLatestCheckpoint(requestId: string): Promise<EditorialStageCheckpoint | null> {
    const { data, error } = await this.client
      .from('stage_checkpoints')
      .select()
      .eq('request_id', requestId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    this.assertNoError(error, 'GET_CHECKPOINT')
    if (!data) return null
    return {
      id: String(data.id),
      requestId: String(data.request_id),
      runId: String(data.run_id),
      stage: data.stage,
      attempt: Number(data.attempt),
      snapshot: data.snapshot as Record<string, unknown>,
      snapshotHash: String(data.snapshot_hash),
      createdAt: new Date(String(data.created_at)),
    }
  }

  async acquireExecutionLock(requestId: string, lockToken: string, expiresAt: Date, ownerProcess: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('acquire_editorial_execution_lock', {
      p_request_id: requestId,
      p_lock_token: lockToken,
      p_expires_at: expiresAt.toISOString(),
      p_owner_process: ownerProcess,
    })
    this.assertNoError(error, 'ACQUIRE_LOCK')
    return data === true
  }

  async releaseExecutionLock(requestId: string, lockToken: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('release_editorial_execution_lock', {
      p_request_id: requestId,
      p_lock_token: lockToken,
    })
    this.assertNoError(error, 'RELEASE_LOCK')
    return data === true
  }

  private async persistSources(result: ResearchDestinationResult): Promise<void> {
    await this.upsertMany('research_sources', result.sources.map(source => ({
      id: source.id,
      run_id: source.runId,
      url: source.url,
      normalized_url: source.normalizedUrl,
      title: source.title,
      author: source.author ?? null,
      publisher: source.publisher ?? null,
      published_at: iso(source.publishedAt),
      query: source.query,
      source_type: source.sourceType,
      territorial_scope: source.territorialScope,
      freshness: source.freshness,
      reliability: source.reliability,
      duplicate_of_id: source.duplicateOfId ?? null,
      status: source.status,
      fingerprint: source.fingerprint,
      metadata: source.metadata,
      captured_at: source.capturedAt.toISOString(),
    })))
  }

  private async persistFacts(result: ResearchDestinationResult): Promise<void> {
    await this.upsertMany('research_facts', result.facts.map(fact => ({
      id: fact.id,
      request_id: fact.requestId,
      destination_id: fact.destinationId,
      statement: fact.statement,
      category: fact.category,
      confidence: fact.confidence,
      contradiction: fact.contradiction,
      volatility: fact.volatility,
      review_status: fact.reviewStatus,
      valid_from: iso(fact.validFrom),
      valid_until: iso(fact.validUntil),
      version: fact.version,
      created_at: fact.createdAt.toISOString(),
      updated_at: fact.updatedAt.toISOString(),
    })))
    await this.replaceRelations('research_fact_sources', 'fact_id', result.facts.map(item => item.id),
      result.facts.flatMap(fact => fact.sourceIds.map(sourceId => ({ fact_id: fact.id, source_id: sourceId }))))
  }

  private async persistPlaces(result: ResearchDestinationResult): Promise<void> {
    await this.upsertMany('research_places', result.places.map(place => ({
      id: place.id,
      request_id: place.requestId,
      destination_id: place.destinationId,
      name: place.name,
      category: place.category,
      position: place.position,
      adventure_relevance: place.profileRelevance.adventure,
      student_relevance: place.profileRelevance.student,
      status: place.status,
      duplicate_of_id: place.duplicateOfId ?? null,
      version: place.version,
      created_at: place.createdAt.toISOString(),
      updated_at: place.updatedAt.toISOString(),
    })))
    await this.replaceRelations('research_place_facts', 'place_id', result.places.map(item => item.id),
      result.places.flatMap(place => place.factIds.map(factId => ({ place_id: place.id, fact_id: factId }))))
    await this.replaceRelations('research_place_sources', 'place_id', result.places.map(item => item.id),
      result.places.flatMap(place => place.sourceIds.map(sourceId => ({ place_id: place.id, source_id: sourceId }))))
  }

  private async persistActivities(result: ResearchDestinationResult): Promise<void> {
    await this.upsertMany('research_activities', result.activities.map(activity => ({
      id: activity.id,
      request_id: activity.requestId,
      destination_id: activity.destinationId,
      name: activity.name,
      audience_profiles: activity.audienceProfiles,
      duration_minutes: activity.durationMinutes ?? null,
      cost_band: activity.costBand,
      season: activity.season ?? null,
      requirements: activity.requirements,
      accessibility: activity.accessibility,
      risk_notes: activity.riskNotes,
      version: activity.version,
      created_at: activity.createdAt.toISOString(),
      updated_at: activity.updatedAt.toISOString(),
    })))
    await this.replaceRelations('research_activity_facts', 'activity_id', result.activities.map(item => item.id),
      result.activities.flatMap(activity => activity.factIds.map(factId => ({ activity_id: activity.id, fact_id: factId }))))
    await this.replaceRelations('research_activity_sources', 'activity_id', result.activities.map(item => item.id),
      result.activities.flatMap(activity => activity.sourceIds.map(sourceId => ({ activity_id: activity.id, source_id: sourceId }))))
  }

  private async persistDrafts(result: ResearchDestinationResult): Promise<void> {
    await this.upsertMany('editorial_drafts', result.drafts.map(({ draft }) => ({
      id: draft.id,
      request_id: draft.requestId,
      run_id: draft.runId,
      profile: draft.profile,
      title: draft.title,
      introduction: draft.introduction,
      prompt_version: draft.promptVersion,
        content_version: draft.contentVersion,
        state: draft.state,
        previous_draft_id: draft.previousDraftId ?? null,
        regeneration_reason: draft.regenerationReason ?? null,
        human_edited: draft.humanEdited,
      created_by: draft.createdBy,
      updated_by: draft.updatedBy,
      version: draft.version,
      created_at: draft.createdAt.toISOString(),
      updated_at: draft.updatedAt.toISOString(),
    })))
    const sections = result.drafts.flatMap(bundle => bundle.sections)
    await this.upsertMany('editorial_sections', sections.map(section => ({
      id: section.id,
      draft_id: section.draftId,
      kind: section.kind,
      heading: section.heading,
      content: section.content,
      position: section.position,
      prompt_version: section.promptVersion,
      human_edited: section.humanEdited,
      regeneration_reason: section.regenerationReason ?? null,
      version: section.version,
      created_at: section.createdAt.toISOString(),
      updated_at: section.updatedAt.toISOString(),
    })))
    await this.replaceRelations('editorial_section_facts', 'section_id', sections.map(item => item.id),
      sections.flatMap(section => section.factIds.map(factId => ({ section_id: section.id, fact_id: factId }))))
    await this.replaceRelations('editorial_section_sources', 'section_id', sections.map(item => item.id),
      sections.flatMap(section => section.sourceIds.map(sourceId => ({ section_id: section.id, source_id: sourceId }))))
  }

  private async persistQuality(result: ResearchDestinationResult): Promise<void> {
    await this.upsertMany('quality_reviews', result.qualityReviews.map(review => ({
      id: review.id,
      draft_id: review.draftId,
      draft_version: review.draftVersion,
      outcome: review.outcome,
      rule_version: review.ruleVersion,
      reviewed_at: review.reviewedAt.toISOString(),
    })))
    await this.upsertMany('quality_checks', result.qualityChecks.map(check => ({
      id: check.id,
      review_id: check.reviewId,
      code: check.code,
      severity: check.severity,
      result: check.result,
      evidence: check.evidence,
      correction: check.correction ?? null,
      responsible: check.responsible,
      rule_version: check.ruleVersion,
      created_at: check.createdAt.toISOString(),
    })))
  }

  private async persistUsageAndEvents(result: ResearchDestinationResult): Promise<void> {
    await this.upsertMany('provider_usage', result.usage.map(usage => ({
      id: usage.id,
      run_id: usage.runId,
      stage: usage.stage,
      provider_id: usage.providerId,
      model: usage.model,
      input_units: usage.inputUnits,
      output_units: usage.outputUnits,
      estimated_cost: usage.estimatedCost,
      actual_cost: usage.actualCost ?? null,
      currency: usage.currency,
      budget_limit: usage.budgetLimit,
      cause: usage.cause,
      created_at: usage.createdAt.toISOString(),
    })))
    await this.upsertMany('research_events', result.events.map(event => ({
      id: event.id,
      request_id: event.requestId,
      run_id: event.runId ?? null,
      event_type: event.type,
      stage: event.stage ?? null,
      actor_id: event.actorId ?? null,
      correlation_id: event.correlationId,
      payload: event.payload,
      occurred_at: event.occurredAt.toISOString(),
    })))
  }

  private async replaceRelations(table: string, ownerColumn: string, ownerIds: string[], rows: Row[]): Promise<void> {
    if (ownerIds.length === 0) return
    const { error: deleteError } = await this.client.from(table).delete().in(ownerColumn, ownerIds)
    this.assertNoError(deleteError, `CLEAR_${table.toUpperCase()}`)
    await this.insertMany(table, rows)
  }

  private async upsert(table: string, row: Row, onConflict = 'id'): Promise<void> {
    const { error } = await this.client.from(table).upsert(row, { onConflict })
    this.assertNoError(error, `UPSERT_${table.toUpperCase()}`)
  }

  private async upsertMany(table: string, rows: Row[], onConflict = 'id'): Promise<void> {
    if (rows.length === 0) return
    const { error } = await this.client.from(table).upsert(rows, { onConflict })
    this.assertNoError(error, `UPSERT_${table.toUpperCase()}`)
  }

  private async insertMany(table: string, rows: Row[]): Promise<void> {
    if (rows.length === 0) return
    const { error } = await this.client.from(table).insert(rows)
    this.assertNoError(error, `INSERT_${table.toUpperCase()}`)
  }

  private assertNoError(error: SupabaseError, operation: string): void {
    if (!error) return
    const code = error.code === '23505' ? 'IDEMPOTENCY_CONFLICT' : 'PERSISTENCE_ERROR'
    throw new EditorialRepositoryError(code, `SUPABASE_${operation}_FAILED: ${error.message}`, error)
  }
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim()
}

function serialize(value: ResearchDestinationResult): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function sha256(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function reviveDates(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map(item => reviveDates(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [childKey, reviveDates(child, childKey)]))
  }
  if (typeof value === 'string' && /(?:At|From|Until)$/.test(key)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  return value
}
