import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  REAL_EDITORIAL_PILOT_POLICY,
  RealEditorialAmbiguousCallResolutionResultSchema,
  RealEditorialAmbiguousCallResolutionSchema,
  RealEditorialAmbiguousCallSchema,
  RealEditorialBudgetResolutionResultSchema,
  RealEditorialBudgetResolutionSchema,
  RealEditorialBudgetReviewSchema,
  RealEditorialPilotBudgetSchema,
  RealEditorialPilotPrepareSchema,
  RealEditorialPilotRecordSchema,
  RealEditorialPilotSnapshotSchema,
  type RealEditorialAmbiguousCall,
  type RealEditorialAmbiguousCallResolution,
  type RealEditorialAmbiguousCallResolutionResult,
  type RealEditorialBudgetResolution,
  type RealEditorialBudgetResolutionResult,
  type RealEditorialBudgetReview,
  type RealEditorialPilotBudget,
  type RealEditorialPilotPrepare,
  type RealEditorialPilotRecord,
  type RealEditorialPilotSnapshot,
  type RealEditorialPilotState,
} from '@shared/real-editorial-pilot-contracts'
import {
  RealResearchDossierSchema,
  RealContinueDecisionSchema,
  RealFocusedQuerySchema,
  type RealFocusedQuery,
  type RealResearchDossier,
  type RealRoundNumber,
  type RealResearchMission,
} from '@shared/real-pipeline-contracts'
import type {
  RealWorkflowCheckpoint,
  RealWorkflowCheckpointStore,
} from './real-workflow'
import type {
  IntelligenceDraft,
  IntelligenceReview,
  IntelligenceRoundAnalysis,
  ResearchToolResult,
} from './ports'

export type RealEditorialArtifactKind =
  | 'mission'
  | 'round'
  | 'query'
  | 'tavily_result'
  | 'source_accepted'
  | 'source_rejected'
  | 'extracted_document'
  | 'evidence'
  | 'master_knowledge'
  | 'fact'
  | 'place'
  | 'activity'
  | 'gap'
  | 'contradiction'
  | 'coverage'
  | 'draft_adventure'
  | 'draft_student'
  | 'final_review'
  | 'checkpoint'

export type RealEditorialRepositoryErrorCode =
  | 'REPOSITORY_UNAVAILABLE'
  | 'DESTINATION_NOT_FOUND'
  | 'DUPLICATE_REAL_PILOT'
  | 'PILOT_NOT_FOUND'
  | 'RUN_NOT_FOUND'
  | 'BUDGET_INVALID'
  | 'CHECKPOINT_INVALID'
  | 'VERSION_CONFLICT'
  | 'HUMAN_RESOLUTION_REQUIRED'
  | 'HUMAN_RESOLUTION_CONFLICT'
  | 'HUMAN_RESOLUTION_BUDGET_EXCEEDED'
  | 'HUMAN_RESOLUTION_NOT_ALLOWED'
  | 'BUDGET_REVIEW_REQUIRED'
  | 'BUDGET_DECISION_CONFLICT'
  | 'BUDGET_EXTENSION_INVALID'
  | 'BUDGET_DECISION_NOT_ALLOWED'
  | 'PERSISTENCE_ERROR'

export class RealEditorialRepositoryError extends Error {
  readonly retryable = false

  constructor(
    readonly code: RealEditorialRepositoryErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'RealEditorialRepositoryError'
  }
}

export interface RealEditorialRepositoryInspection {
  repositoryAvailable: boolean
  connectivityValidated: boolean
  guardFree: boolean
  activeExecutions: number
  pendingReservations: number
  recoverableReservations: number
  humanRequiredCalls: number
  manualMorellaCount: number
  identicalPilotCount: number
  budgetValid: boolean
}

export interface RealEditorialArtifact {
  kind: RealEditorialArtifactKind
  key: string
  version: number
  payload: unknown
  payloadHash: string
  createdAt: string
}

export interface RealEditorialPilotRepository {
  inspect(identityKey: string, currentPilotId?: string): Promise<RealEditorialRepositoryInspection>
  prepare(input: RealEditorialPilotPrepare): Promise<RealEditorialPilotRecord>
  confirmBudget(pilotId: string, budgetDate?: string): Promise<RealEditorialPilotRecord>
  getPilot(pilotId: string): Promise<RealEditorialPilotRecord | undefined>
  findByIdentity(identityKey: string): Promise<RealEditorialPilotRecord | undefined>
  getResult(pilotId: string): Promise<RealEditorialPilotSnapshot | undefined>
  getBudgetReview(pilotId: string): Promise<RealEditorialBudgetReview | undefined>
  openBudgetReview(
    pilotId: string,
    runId: string,
    incidentId: string,
    remainingEstimatedCostEur: number,
  ): Promise<string>
  resolveBudgetReview(
    input: RealEditorialBudgetResolution,
  ): Promise<RealEditorialBudgetResolutionResult>
  appendArtifact(
    pilotId: string,
    runId: string,
    kind: RealEditorialArtifactKind,
    key: string,
    version: number,
    payload: unknown,
  ): Promise<void>
  latestArtifact(
    runId: string,
    kind: RealEditorialArtifactKind,
    key: string,
  ): Promise<RealEditorialArtifact | undefined>
  updateState(
    pilotId: string,
    runId: string,
    state: RealEditorialPilotState,
    currentRound: number,
    accumulatedCost?: number,
  ): Promise<void>
  saveResult(snapshot: RealEditorialPilotSnapshot): Promise<void>
  saveResearchResult(
    pilotId: string,
    runId: string,
    mission: RealResearchMission,
    result: ResearchToolResult,
  ): Promise<void>
  saveAnalysis(
    pilotId: string,
    runId: string,
    mission: RealResearchMission,
    analysis: IntelligenceRoundAnalysis,
    dossier?: RealResearchDossier,
  ): Promise<void>
  saveDrafts(pilotId: string, runId: string, drafts: IntelligenceDraft[]): Promise<void>
  saveReview(pilotId: string, runId: string, review: IntelligenceReview): Promise<void>
  appendEvent(
    pilotId: string,
    runId: string | undefined,
    eventType: string,
    state: RealEditorialPilotState | undefined,
    payload?: Record<string, unknown>,
  ): Promise<void>
  recordIncident(
    pilotId: string,
    runId: string,
    code: string,
    classification: 'recoverable' | 'permanent' | 'ambiguous' | 'human_required',
    message: string,
  ): Promise<string>
  cancel(pilotId: string, reason: string): Promise<void>
  reopenCancelled(pilotId: string): Promise<void>
}

export class SupabaseRealEditorialPilotRepository implements RealEditorialPilotRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly now: () => Date = () => new Date(),
    private readonly id: () => string = randomUUID,
  ) {}

  async inspect(
    identityKey: string,
    currentPilotId?: string,
  ): Promise<RealEditorialRepositoryInspection> {
    try {
      let activeExecutionsQuery = this.client.from('real_editorial_runs')
        .select('id', { head: true, count: 'exact' })
        .in('state', activeStates)
      if (currentPilotId) {
        activeExecutionsQuery = activeExecutionsQuery.neq('pilot_id', currentPilotId)
      }
      const [
        policy,
        guard,
        active,
        pending,
        humanRequired,
        manualMorella,
        duplicate,
        budget,
        connectivity,
        recoverableReservations,
      ] = await Promise.all([
        this.client.from('real_editorial_pilot_policies').select('id')
          .eq('id', REAL_EDITORIAL_PILOT_POLICY.id).maybeSingle(),
        this.client.from('real_editorial_execution_guard').select('owner_execution_id,expires_at')
          .eq('guard_name', 'morella-real-editorial').maybeSingle(),
        activeExecutionsQuery,
        this.client.from('real_editorial_call_reservations').select('id', { head: true, count: 'exact' })
          .in('state', ['reserved', 'started', 'unknown']),
        this.client.from('real_editorial_ambiguous_calls').select('call_id', {
          head: true,
          count: 'exact',
        }).is('resolved_at', null),
        this.client.from('editorial_research_requests').select(
          'id,geographic_entities!inner(name,country_code,entity_type)',
          { head: true, count: 'exact' },
        )
          .eq('geographic_entities.normalized_name', 'morella')
          .eq('geographic_entities.country_code', 'ES')
          .eq('geographic_entities.entity_type', 'locality'),
        currentPilotId
          ? this.client.from('real_editorial_pilots').select('id', { head: true, count: 'exact' })
            .eq('identity_key', identityKey).neq('id', currentPilotId)
          : this.client.from('real_editorial_pilots').select('id', { head: true, count: 'exact' })
            .eq('identity_key', identityKey),
        currentPilotId
          ? this.client.from('real_editorial_pilot_budgets').select('*')
            .eq('pilot_id', currentPilotId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        this.client.from('real_editorial_connectivity_evidence').select('provider_id,outcome')
          .eq('pilot_policy_id', REAL_EDITORIAL_PILOT_POLICY.id)
          .eq('source_kind', 'connectivity_check').eq('outcome', 'succeeded'),
        currentPilotId
          ? this.recoverableStartedReservations(currentPilotId)
          : Promise.resolve(0),
      ])
      const results = [
        policy,
        guard,
        active,
        pending,
        humanRequired,
        manualMorella,
        duplicate,
        budget,
        connectivity,
      ]
      if (results.some(result => result.error)) {
        return unavailableInspection()
      }
      const guardExpired = guard.data?.expires_at
        ? new Date(String(guard.data.expires_at)).getTime() <= this.now().getTime()
        : false
      const connectedProviders = new Set(
        (connectivity.data ?? []).map(row => String(row.provider_id)),
      )
      return {
        repositoryAvailable: Boolean(policy.data),
        connectivityValidated: connectedProviders.has('tavily') && connectedProviders.has('openai'),
        guardFree: !guard.data?.owner_execution_id || guardExpired,
        activeExecutions: active.count ?? 0,
        pendingReservations: pending.count ?? 0,
        recoverableReservations,
        humanRequiredCalls: humanRequired.count ?? 0,
        manualMorellaCount: manualMorella.count ?? 0,
        identicalPilotCount: duplicate.count ?? 0,
        budgetValid: budget.data ? validBudgetRow(budget.data) : false,
      }
    } catch {
      return unavailableInspection()
    }
  }

  private async recoverableStartedReservations(pilotId: string): Promise<number> {
    const reservations = await this.client.from('real_editorial_call_reservations')
      .select('run_id,stage,operation')
      .eq('pilot_id', pilotId)
      .eq('state', 'started')
      .eq('operation', 'analysis')
    if (reservations.error) throw reservations.error
    let recoverable = 0
    for (const row of reservations.data ?? []) {
      const roundMatch = /^([12])_analysis$/.exec(String(row.stage))
      if (!roundMatch) continue
      const artifact = await this.latestArtifact(
        String(row.run_id),
        'round',
        `round-${roundMatch[1]}`,
      )
      if (artifact && isRecord(artifact.payload) && isRecord(artifact.payload.analysis)) {
        recoverable += 1
      }
    }
    return recoverable
  }

  async prepare(candidate: RealEditorialPilotPrepare): Promise<RealEditorialPilotRecord> {
    const input = RealEditorialPilotPrepareSchema.parse(candidate)
    const destination = await this.findCanonicalMorella()
    const identityKey = realEditorialIdentityKey(input.variantKey)
    const pilotId = this.id()
    const runId = this.id()
    const { data, error } = await this.client.rpc('prepare_real_editorial_pilot', {
      p_pilot_id: pilotId,
      p_run_id: runId,
      p_policy_id: REAL_EDITORIAL_PILOT_POLICY.id,
      p_preparation_key: input.preparationKey,
      p_identity_key: identityKey,
      p_variant_key: input.variantKey,
      p_destination_id: destination.id,
      p_profiles: input.profiles,
    })
    if (error) {
      if (error.message.includes('DUPLICATE_REAL_EDITORIAL_PILOT')) {
        throw new RealEditorialRepositoryError(
          'DUPLICATE_REAL_PILOT',
          'Ya existe un piloto real con la misma identidad; no se reutiliza una solicitud Manual',
        )
      }
      throw persistenceError(error)
    }
    const stored = await this.getPilot(String(data))
    if (!stored) throw new RealEditorialRepositoryError('PILOT_NOT_FOUND', 'El piloto preparado no se puede leer')
    return stored
  }

  async confirmBudget(pilotId: string, budgetDate = dateInMadrid(this.now())): Promise<RealEditorialPilotRecord> {
    const { data, error } = await this.client.rpc('confirm_real_editorial_budget', {
      p_pilot_id: pilotId,
      p_budget_date: budgetDate,
    })
    if (error || data !== true) throw new RealEditorialRepositoryError(
      'BUDGET_INVALID',
      'No se pudo confirmar el presupuesto durable de Morella',
      error,
    )
    const pilot = await this.getPilot(pilotId)
    if (!pilot?.budget || !validBudget(pilot.budget)) {
      throw new RealEditorialRepositoryError('BUDGET_INVALID', 'El presupuesto persistido no respeta 0,20 EUR')
    }
    return pilot
  }

  async getPilot(pilotId: string): Promise<RealEditorialPilotRecord | undefined> {
    const [pilotResult, budgetResult] = await Promise.all([
      this.client.from('real_editorial_pilots').select('*').eq('id', pilotId).maybeSingle(),
      this.client.from('real_editorial_pilot_budgets').select('*').eq('pilot_id', pilotId).maybeSingle(),
    ])
    assertNoError(pilotResult.error, 'No se pudo leer el piloto')
    assertNoError(budgetResult.error, 'No se pudo leer el presupuesto')
    if (!pilotResult.data) return undefined
    return pilotFromRows(pilotResult.data, budgetResult.data)
  }

  async findByIdentity(identityKey: string): Promise<RealEditorialPilotRecord | undefined> {
    const { data, error } = await this.client.from('real_editorial_pilots')
      .select('id').eq('identity_key', identityKey).maybeSingle()
    assertNoError(error, 'No se pudo resolver la identidad del piloto')
    return data ? this.getPilot(String(data.id)) : undefined
  }

  async getResult(pilotId: string): Promise<RealEditorialPilotSnapshot | undefined> {
    const pilot = await this.getPilot(pilotId)
    if (!pilot) return undefined
    const artifact = await this.latestArtifact(pilot.currentRunId, 'checkpoint', 'pipeline')
    if (!artifact) return undefined
    return RealEditorialPilotSnapshotSchema.parse(artifact.payload)
  }

  async getBudgetReview(pilotId: string): Promise<RealEditorialBudgetReview | undefined> {
    const pilot = await this.getPilot(pilotId)
    if (!pilot) throw new RealEditorialRepositoryError('PILOT_NOT_FOUND', 'El piloto no existe')
    if (!pilot.budget) return undefined
    const reviewResult = await this.client.from('real_editorial_budget_reviews')
      .select('*').eq('pilot_id', pilotId).eq('run_id', pilot.currentRunId)
      .order('opened_at', { ascending: false }).limit(1).maybeSingle()
    assertNoError(reviewResult.error, 'No se pudo leer la decisión presupuestaria')
    if (!reviewResult.data) return undefined
    const review = reviewResult.data
    const [decisionResult, tavilyResult, analysisResult] = await Promise.all([
      review.latest_decision_id
        ? this.client.from('real_editorial_budget_decisions').select('*')
          .eq('id', review.latest_decision_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      this.client.from('real_editorial_artifacts').select('id', { head: true, count: 'exact' })
        .eq('run_id', pilot.currentRunId).eq('artifact_kind', 'tavily_result')
        .eq('artifact_key', 'round-1'),
      this.client.from('real_editorial_artifacts').select('id', { head: true, count: 'exact' })
        .eq('run_id', pilot.currentRunId).eq('artifact_kind', 'round')
        .eq('artifact_key', 'round-1'),
    ])
    assertNoError(decisionResult.error, 'No se pudo leer la última decisión presupuestaria')
    assertNoError(tavilyResult.error, 'No se pudo verificar el resultado Tavily durable')
    assertNoError(analysisResult.error, 'No se pudo verificar el análisis OpenAI durable')
    const maximum = pilot.budget.taskLimitCost
    const spent = pilot.budget.spentCost
    const reserved = pilot.budget.reservedCost
    const remaining = Number(review.remaining_estimated_cost)
    const total = moneyValue(spent + reserved + remaining)
    const decision = decisionResult.data
    return RealEditorialBudgetReviewSchema.parse({
      reviewId: review.id,
      pilotId,
      runId: pilot.currentRunId,
      incidentId: review.incident_id,
      status: review.status,
      currency: 'EUR',
      source: 'real_editorial_pilot_budgets',
      currentMaximumCostEur: maximum,
      previousMaximumCostEur: decision
        ? Number(decision.previous_maximum_cost)
        : Number(review.initial_maximum_cost),
      spentCostEur: spent,
      reservedCostEur: reserved,
      availableCostEur: moneyValue(Math.max(0, maximum - spent - reserved)),
      remainingEstimatedCostEur: remaining,
      totalEstimatedCostEur: total,
      shortfallCostEur: moneyValue(Math.max(0, total - maximum)),
      marginCostEur: moneyValue(maximum - total),
      openedAt: review.opened_at,
      resolvedAt: review.resolved_at ?? undefined,
      tavilyRoundOnePersisted: (tavilyResult.count ?? 0) > 0,
      openAIAnalysisRoundOnePersisted: (analysisResult.count ?? 0) > 0,
      latestDecision: decision
        ? {
            decisionId: decision.id,
            actorId: decision.actor_id,
            decision: decision.decision,
            previousMaximumCostEur: Number(decision.previous_maximum_cost),
            newMaximumCostEur: Number(decision.new_maximum_cost),
            reason: decision.reason,
            note: decision.note ?? undefined,
            decidedAt: decision.decided_at,
          }
        : undefined,
    })
  }

  async openBudgetReview(
    pilotId: string,
    runId: string,
    incidentId: string,
    remainingEstimatedCostEur: number,
  ): Promise<string> {
    const { data, error } = await this.client.rpc('open_real_editorial_budget_review', {
      p_pilot_id: pilotId,
      p_run_id: runId,
      p_incident_id: incidentId,
      p_remaining_estimated_cost: remainingEstimatedCostEur,
    })
    if (error || typeof data !== 'string') {
      throw budgetDecisionPersistenceError(error ?? { message: 'BUDGET_REVIEW_NOT_CREATED' })
    }
    return data
  }

  async resolveBudgetReview(
    candidate: RealEditorialBudgetResolution,
  ): Promise<RealEditorialBudgetResolutionResult> {
    const input = RealEditorialBudgetResolutionSchema.parse(candidate)
    const decisionKey = createHash('sha256').update(JSON.stringify({
      pilotId: input.pilotId,
      runId: input.runId,
      actorId: input.actorId,
      decision: input.decision,
      newMaximumCostEur: input.decision === 'authorize_extension'
        ? input.newMaximumCostEur
        : null,
      reason: input.reason,
      note: input.note ?? null,
    })).digest('hex')
    const existing = await this.client.from('real_editorial_budget_decisions')
      .select('*').eq('decision_key', decisionKey).maybeSingle()
    assertNoError(existing.error, 'No se pudo comprobar la idempotencia presupuestaria')
    if (existing.data) return this.budgetResolutionResult(existing.data)

    const pilot = await this.getPilot(input.pilotId)
    if (!pilot?.budget || pilot.currentRunId !== input.runId) {
      throw new RealEditorialRepositoryError(
        'BUDGET_REVIEW_REQUIRED',
        'La decisión no corresponde al piloto y run activos',
      )
    }
    const review = await this.getBudgetReview(input.pilotId)
    if (!review) {
      throw new RealEditorialRepositoryError(
        'BUDGET_REVIEW_REQUIRED',
        'No existe una barrera económica pendiente',
      )
    }

    let checkpointVersion: number | null = null
    let checkpointPreviousHash: string | null = null
    let checkpointPayload: Record<string, unknown> | null = null
    let checkpointPayloadHash: string | null = null
    if (input.decision === 'authorize_extension'
      && !['authorized', 'cancelled'].includes(review.status)) {
      const checkpoint = await this.latestArtifact(input.runId, 'checkpoint', 'workflow')
      if (!checkpoint) {
        throw new RealEditorialRepositoryError(
          'CHECKPOINT_INVALID',
          'La barrera económica no conserva su checkpoint',
        )
      }
      checkpointPayload = reopenBudgetCheckpoint(checkpoint.payload, this.now())
      checkpointVersion = checkpoint.version + 1
      checkpointPreviousHash = checkpoint.payloadHash
      checkpointPayloadHash = realEditorialPayloadHash(checkpointPayload)
    }
    const newMaximum = input.decision === 'authorize_extension'
      ? input.newMaximumCostEur
      : pilot.budget.taskLimitCost
    const { data, error } = await this.client.rpc('resolve_real_editorial_budget_review', {
      p_decision_key: decisionKey,
      p_pilot_id: input.pilotId,
      p_run_id: input.runId,
      p_actor_id: input.actorId,
      p_decision: input.decision,
      p_new_maximum_cost: newMaximum,
      p_reason: input.reason,
      p_note: input.note ?? null,
      p_checkpoint_version: checkpointVersion,
      p_checkpoint_previous_hash: checkpointPreviousHash,
      p_checkpoint_payload: checkpointPayload,
      p_checkpoint_payload_hash: checkpointPayloadHash,
    })
    if (error) throw budgetDecisionPersistenceError(error)
    const stored = await this.client.from('real_editorial_budget_decisions')
      .select('*').eq('id', String(data)).single()
    assertNoError(stored.error, 'No se pudo verificar la decisión presupuestaria durable')
    return this.budgetResolutionResult(stored.data)
  }

  private async budgetResolutionResult(
    decision: Record<string, unknown>,
  ): Promise<RealEditorialBudgetResolutionResult> {
    const review = await this.getBudgetReview(String(decision.pilot_id))
    if (!review) {
      throw new RealEditorialRepositoryError(
        'BUDGET_REVIEW_REQUIRED',
        'La decisión durable no conserva su revisión presupuestaria',
      )
    }
    return RealEditorialBudgetResolutionResultSchema.parse({
      decisionId: decision.id,
      pilotId: decision.pilot_id,
      runId: decision.run_id,
      actorId: decision.actor_id,
      decision: decision.decision,
      previousMaximumCostEur: Number(decision.previous_maximum_cost),
      newMaximumCostEur: Number(decision.new_maximum_cost),
      reason: decision.reason,
      note: decision.note ?? undefined,
      decidedAt: decision.decided_at,
      nextAction: decision.decision === 'keep_limit'
        ? 'blocked'
        : decision.decision === 'cancel_permanently'
          ? 'cancelled'
          : 'resume_from_checkpoint',
      review,
    })
  }

  async getHumanRequiredCall(pilotId: string): Promise<RealEditorialAmbiguousCall | undefined> {
    const pilot = await this.getPilot(pilotId)
    if (!pilot) throw new RealEditorialRepositoryError('PILOT_NOT_FOUND', 'El piloto no existe')
    const ambiguityResult = await this.client.from('real_editorial_ambiguous_calls')
      .select('*').eq('pilot_id', pilotId).eq('run_id', pilot.currentRunId)
      .is('resolved_at', null).order('opened_at', { ascending: true }).limit(1).maybeSingle()
    assertNoError(ambiguityResult.error, 'No se pudo leer la revisión humana de la llamada')
    if (!ambiguityResult.data) return undefined
    const ambiguity = ambiguityResult.data
    const [reservationResult, terminalResult, incidentResult, latestDecisionResult] =
      await Promise.all([
        this.client.from('real_editorial_call_reservations').select('*')
          .eq('id', ambiguity.reservation_id).eq('pilot_id', pilotId).single(),
        this.client.from('real_editorial_provider_calls').select('created_at')
          .eq('call_id', ambiguity.call_id).order('sequence', { ascending: false })
          .limit(1).single(),
        ambiguity.incident_id
          ? this.client.from('real_editorial_incidents').select('id,code')
            .eq('id', ambiguity.incident_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        this.client.from('real_editorial_call_human_resolutions')
          .select('decision,actor_id,decided_at,note')
          .eq('call_id', ambiguity.call_id).eq('decision', 'indeterminate')
          .order('decided_at', { ascending: false }).limit(1).maybeSingle(),
      ])
    assertNoError(reservationResult.error, 'No se pudo leer la reserva ambigua')
    assertNoError(terminalResult.error, 'No se pudo leer la llamada ambigua')
    assertNoError(incidentResult.error, 'No se pudo leer el incidente de la llamada')
    assertNoError(latestDecisionResult.error, 'No se pudo leer la última decisión humana')
    if (!pilot.budget) {
      throw new RealEditorialRepositoryError('BUDGET_INVALID', 'La llamada ambigua no tiene presupuesto')
    }
    if (!terminalResult.data) {
      throw new RealEditorialRepositoryError(
        'PERSISTENCE_ERROR',
        'La llamada ambigua no conserva su asiento durable',
      )
    }
    const reservation = reservationResult.data
    const prudentialReconciliation = await this.prudentialReconciliationFor(
      pilot,
      ambiguity,
      reservation,
    )
    return RealEditorialAmbiguousCallSchema.parse({
      callId: ambiguity.call_id,
      reservationId: ambiguity.reservation_id,
      pilotId,
      runId: pilot.currentRunId,
      providerId: reservation.provider_id,
      operation: reservation.operation,
      attempt: Number(reservation.attempt),
      retryOfCallId: reservation.retry_of_call_id ?? undefined,
      sourceState: ambiguity.source_state,
      reviewState: 'human_required',
      occurredAt: terminalResult.data.created_at,
      openedAt: ambiguity.opened_at,
      localKnownCostEur: Number(reservation.calculated_cost ?? 0),
      maximumExposureEur: Number(reservation.reserved_cost),
      spentCostEur: pilot.budget.spentCost,
      initialAutomaticLimitEur: REAL_EDITORIAL_PILOT_POLICY.automaticStopCostEur,
      currentMaximumCostEur: pilot.budget.taskLimitCost,
      prudentialReconciliation,
      incidentId: incidentResult.data?.id ?? undefined,
      incidentCode: incidentResult.data?.code ?? undefined,
      latestDecision: latestDecisionResult.data
        ? {
            decision: 'indeterminate',
            actorId: latestDecisionResult.data.actor_id,
            decidedAt: latestDecisionResult.data.decided_at,
            note: latestDecisionResult.data.note ?? undefined,
          }
        : undefined,
    })
  }

  async resolveHumanRequiredCall(
    candidate: RealEditorialAmbiguousCallResolution,
  ): Promise<RealEditorialAmbiguousCallResolutionResult> {
    const input = RealEditorialAmbiguousCallResolutionSchema.parse(candidate)
    const resolutionKey = createHash('sha256').update(JSON.stringify({
      pilotId: input.pilotId,
      runId: input.runId,
      callId: input.callId,
      actorId: input.actorId,
      decision: input.decision,
      recognizedCostEur: input.recognizedCostEur ?? null,
      credits: input.credits ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      prudentialCostEur: input.prudentialCostEur ?? null,
      currency: input.currency ?? null,
      reason: input.reason ?? null,
      acceptsPotentialDuplicateCharge: input.acceptsPotentialDuplicateCharge ?? null,
      note: input.note ?? null,
    })).digest('hex')
    const { data, error } = input.decision === 'prudential_cost_assumed'
      ? await this.client.rpc('reconcile_real_editorial_ambiguous_call_prudential', {
          p_resolution_key: resolutionKey,
          p_pilot_id: input.pilotId,
          p_run_id: input.runId,
          p_call_id: input.callId,
          p_actor_id: input.actorId,
          p_prudential_cost: input.prudentialCostEur,
          p_currency: input.currency,
          p_reason: input.reason,
          p_note: input.note ?? null,
          p_duplicate_charge_risk_accepted: input.acceptsPotentialDuplicateCharge,
        })
      : await this.client.rpc('resolve_real_editorial_ambiguous_call', {
          p_resolution_key: resolutionKey,
          p_pilot_id: input.pilotId,
          p_run_id: input.runId,
          p_call_id: input.callId,
          p_actor_id: input.actorId,
          p_decision: input.decision,
          p_recognized_cost: input.recognizedCostEur ?? null,
          p_credits: input.credits ?? null,
          p_input_tokens: input.inputTokens ?? null,
          p_output_tokens: input.outputTokens ?? null,
          p_note: input.note ?? null,
        })
    if (error) throw humanResolutionPersistenceError(error)
    const resolutionId = String(data)
    const stored = await this.client.from('real_editorial_call_human_resolutions')
      .select('*').eq('id', resolutionId).eq('pilot_id', input.pilotId)
      .eq('run_id', input.runId).eq('call_id', input.callId).single()
    assertNoError(stored.error, 'No se pudo verificar la decisión humana durable')
    return RealEditorialAmbiguousCallResolutionResultSchema.parse({
      resolutionId,
      pilotId: stored.data.pilot_id,
      runId: stored.data.run_id,
      callId: stored.data.call_id,
      actorId: stored.data.actor_id,
      decision: stored.data.decision,
      recognizedCostEur: Number(stored.data.recognized_cost),
      credits: Number(stored.data.credits),
      inputTokens: Number(stored.data.input_tokens),
      outputTokens: Number(stored.data.output_tokens),
      note: stored.data.note ?? undefined,
      decidedAt: stored.data.decided_at,
      nextAction: stored.data.decision === 'indeterminate'
        ? 'blocked'
        : stored.data.decision === 'cancel_permanently'
          ? 'cancelled'
          : 'resume_from_checkpoint',
      prudentialReconciliation: stored.data.decision === 'prudential_cost_assumed'
        ? {
            reservationId: stored.data.reservation_id,
            providerId: stored.data.provider_id,
            operation: stored.data.operation,
            query: stored.data.query,
            prudentialCostEur: Number(stored.data.prudential_cost),
            releasedReserveEur: Number(stored.data.released_reserve),
            currency: stored.data.currency,
            reason: stored.data.reason,
            origin: stored.data.origin,
            providerConfirmed: stored.data.provider_confirmed,
            possibleDuplicateChargeAccepted:
              stored.data.duplicate_charge_risk_accepted,
            checkpointVersion: Number(stored.data.checkpoint_version),
            workflowVersion: stored.data.workflow_version,
          }
        : undefined,
    })
  }

  private async prudentialReconciliationFor(
    pilot: RealEditorialPilotRecord,
    ambiguity: Record<string, unknown>,
    reservation: Record<string, unknown>,
  ): Promise<RealEditorialAmbiguousCall['prudentialReconciliation']> {
    if (
      ambiguity.source_state !== 'unknown'
      || reservation.state !== 'unknown'
      || reservation.provider_id !== 'tavily'
      || reservation.operation !== 'research'
    ) return undefined
    const [tariffResult, requestEventResult, checkpoint] = await Promise.all([
      this.client.from('real_editorial_tariffs')
        .select('provider_id,model,operation,currency,unit_scale,credit_unit_cost')
        .eq('id', reservation.tariff_id).maybeSingle(),
      this.client.from('real_editorial_events').select('payload')
        .eq('pilot_id', pilot.id).eq('run_id', pilot.currentRunId)
        .in('event_type', [
          'real.editorial.tavily.request.started',
          'real.editorial.tavily.request.ambiguous',
        ])
        .eq('payload->>callId', ambiguity.call_id)
        .order('occurred_at', { ascending: false }).limit(1).maybeSingle(),
      this.latestArtifact(pilot.currentRunId, 'checkpoint', 'workflow'),
    ])
    assertNoError(tariffResult.error, 'No se pudo leer la tarifa de la llamada ambigua')
    assertNoError(requestEventResult.error, 'No se pudo leer la subpetición Tavily ambigua')
    if (!tariffResult.data || !checkpoint || !isRecord(checkpoint.payload)) {
      throw new RealEditorialRepositoryError(
        'CHECKPOINT_INVALID',
        'La llamada ambigua no conserva tarifa, query y checkpoint conciliables',
      )
    }
    const tariff = tariffResult.data
    const unitScale = Number(tariff.unit_scale)
    const unitCost = Number(tariff.credit_unit_cost)
    if (
      tariff.provider_id !== reservation.provider_id
      || tariff.model !== reservation.model
      || tariff.operation !== 'search'
      || tariff.currency !== reservation.currency
      || !Number.isFinite(unitScale)
      || unitScale <= 0
      || !Number.isFinite(unitCost)
      || unitCost <= 0
    ) {
      throw new RealEditorialRepositoryError(
        'BUDGET_INVALID',
        'La tarifa durable no permite calcular el coste prudencial',
      )
    }
    const eventPayload = requestEventResult.data?.payload
    const query = isRecord(eventPayload) && typeof eventPayload.query === 'string'
      ? eventPayload.query
      : focusedQueryFromCheckpoint(checkpoint.payload)
    const workflowVersion = checkpoint.payload.version
    if (
      !query
      || typeof workflowVersion !== 'string'
      || workflowVersion.length === 0
    ) {
      throw new RealEditorialRepositoryError(
        'CHECKPOINT_INVALID',
        'La query Tavily ambigua no puede vincularse al checkpoint durable',
      )
    }
    const maximumSubrequestCostEur = moneyValue(unitCost / unitScale)
    const maximumExposureEur = Number(reservation.reserved_cost)
    if (
      maximumSubrequestCostEur <= 0
      || maximumSubrequestCostEur > maximumExposureEur
    ) {
      throw new RealEditorialRepositoryError(
        'BUDGET_INVALID',
        'El coste prudencial no cabe en la reserva durable',
      )
    }
    return {
      query,
      maximumSubrequestCostEur,
      releasedReserveEur: moneyValue(
        maximumExposureEur - maximumSubrequestCostEur,
      ),
      currency: 'EUR',
      providerConfirmed: false,
      possibleDuplicateCharge: true,
      checkpointVersion: checkpoint.version,
      workflowVersion,
    }
  }

  async canResumeFromCheckpoint(pilotId: string): Promise<boolean> {
    const pilot = await this.getPilot(pilotId)
    if (!pilot || !resumableStates.includes(pilot.state)) return false
    const [checkpoint, unresolved, permanentCancellation, budgetReview, guard] = await Promise.all([
      this.latestArtifact(pilot.currentRunId, 'checkpoint', 'workflow'),
      this.client.from('real_editorial_ambiguous_calls').select('call_id', {
        head: true,
        count: 'exact',
      }).eq('pilot_id', pilotId).eq('run_id', pilot.currentRunId).is('resolved_at', null),
      this.client.from('real_editorial_ambiguous_calls').select('call_id', {
        head: true,
        count: 'exact',
      }).eq('pilot_id', pilotId).eq('run_id', pilot.currentRunId)
        .eq('terminal_decision', 'cancel_permanently'),
      this.client.from('real_editorial_budget_reviews').select('status')
        .eq('pilot_id', pilotId).eq('run_id', pilot.currentRunId)
        .order('opened_at', { ascending: false }).limit(1).maybeSingle(),
      this.client.from('real_editorial_execution_guard').select('owner_execution_id,expires_at')
        .eq('guard_name', 'morella-real-editorial').maybeSingle(),
    ])
    assertNoError(unresolved.error, 'No se pudo comprobar la ambigüedad pendiente')
    assertNoError(permanentCancellation.error, 'No se pudo comprobar la cancelación definitiva')
    assertNoError(budgetReview.error, 'No se pudo comprobar la decisión presupuestaria')
    assertNoError(guard.error, 'No se pudo comprobar la guarda editorial')
    const budgetAllowsResume = !budgetReview.data
      || budgetReview.data.status === 'authorized'
    const guardExpired = guard.data?.expires_at
      ? new Date(String(guard.data.expires_at)).getTime() <= this.now().getTime()
      : false
    const guardAllowsResume = !guard.data?.owner_execution_id || guardExpired
    return Boolean(checkpoint) && (unresolved.count ?? 0) === 0
      && (permanentCancellation.count ?? 0) === 0 && budgetAllowsResume
      && guardAllowsResume
  }

  async appendArtifact(
    pilotId: string,
    runId: string,
    kind: RealEditorialArtifactKind,
    key: string,
    version: number,
    payload: unknown,
  ): Promise<void> {
    const payloadHash = realEditorialPayloadHash(payload)
    const { error } = await this.client.from('real_editorial_artifacts').insert({
      pilot_id: pilotId,
      run_id: runId,
      artifact_kind: kind,
      artifact_key: key,
      version,
      payload,
      payload_hash: payloadHash,
      created_at: this.now().toISOString(),
    })
    if (!error) return
    if (error.code !== '23505') throw persistenceError(error)
    const existing = await this.latestArtifact(runId, kind, key)
    if (existing && existing.version === version && kind === 'query') {
      canonicalRealEditorialFocusedQuery(existing, payload)
      return
    }
    if (!existing || existing.version !== version || existing.payloadHash !== payloadHash) {
      const differences = existing
        ? realEditorialPayloadDifferencePaths(existing.payload, payload)
        : ['$']
      const versionDifference = existing?.version === version
        ? []
        : [`version(${existing?.version ?? 'ausente'}→${version})`]
      throw new RealEditorialRepositoryError(
        'VERSION_CONFLICT',
        `El artefacto durable ${kind}/${key} v${version} diverge en: ${
          [...versionDifference, ...differences].slice(0, 12).join(', ')
        }`,
      )
    }
  }

  async latestArtifact(
    runId: string,
    kind: RealEditorialArtifactKind,
    key: string,
  ): Promise<RealEditorialArtifact | undefined> {
    const { data, error } = await this.client.from('real_editorial_artifacts').select(
      'artifact_kind,artifact_key,version,payload,payload_hash,created_at',
    )
      .eq('run_id', runId).eq('artifact_kind', kind).eq('artifact_key', key)
      .order('version', { ascending: false }).limit(1).maybeSingle()
    assertNoError(error, 'No se pudo leer el artefacto durable')
    if (!data) return undefined
    const payload = data.payload
    const payloadHash = String(data.payload_hash)
    if (realEditorialPayloadHash(payload) !== payloadHash) {
      throw new RealEditorialRepositoryError('CHECKPOINT_INVALID', 'El artefacto no supera SHA-256')
    }
    return {
      kind: String(data.artifact_kind) as RealEditorialArtifactKind,
      key: String(data.artifact_key),
      version: Number(data.version),
      payload,
      payloadHash,
      createdAt: String(data.created_at),
    }
  }

  async updateState(
    pilotId: string,
    runId: string,
    state: RealEditorialPilotState,
    currentRound: number,
    accumulatedCost?: number,
  ): Promise<void> {
    const runUpdate: Record<string, unknown> = {
      state,
      current_round: currentRound,
    }
    if (state !== 'queued') {
      const { data, error } = await this.client.from('real_editorial_runs')
        .select('started_at').eq('id', runId).eq('pilot_id', pilotId).maybeSingle()
      assertNoError(error, 'No se pudo leer el inicio del run editorial')
      if (data && !data.started_at) runUpdate.started_at = this.now().toISOString()
    }
    if (accumulatedCost !== undefined) runUpdate.accumulated_cost = accumulatedCost
    if (terminalStates.includes(state)) runUpdate.completed_at = this.now().toISOString()
    const [runResult, pilotResult] = await Promise.all([
      this.client.from('real_editorial_runs').update(runUpdate).eq('id', runId).eq('pilot_id', pilotId),
      this.client.from('real_editorial_pilots').update({ state }).eq('id', pilotId).eq('current_run_id', runId),
    ])
    assertNoError(runResult.error, 'No se pudo actualizar el run editorial')
    assertNoError(pilotResult.error, 'No se pudo actualizar el piloto editorial')
  }

  async saveResult(candidate: RealEditorialPilotSnapshot): Promise<void> {
    const snapshot = RealEditorialPilotSnapshotSchema.parse(candidate)
    const latest = await this.latestArtifact(snapshot.runId, 'checkpoint', 'pipeline')
    await this.appendArtifact(
      snapshot.pilotId,
      snapshot.runId,
      'checkpoint',
      'pipeline',
      (latest?.version ?? 0) + 1,
      snapshot,
    )
    await this.updateState(
      snapshot.pilotId,
      snapshot.runId,
      snapshot.state,
      snapshot.currentRound,
      snapshot.accumulatedCost,
    )
    await this.appendEvent(
      snapshot.pilotId,
      snapshot.runId,
      'real.editorial.pending_human_review',
      snapshot.state,
      {
        rounds: snapshot.roundResults.length,
        drafts: snapshot.drafts.map(draft => draft.profile),
        publicationCount: 0,
      },
    )
  }

  async saveResearchResult(
    pilotId: string,
    runId: string,
    mission: RealResearchMission,
    result: ResearchToolResult,
  ): Promise<void> {
    await this.appendArtifact(pilotId, runId, 'tavily_result', `round-${mission.round}`, 1, result)
    for (const source of result.sources) {
      await this.appendArtifact(pilotId, runId, 'source_accepted', source.id, 1, source)
      await this.appendArtifact(pilotId, runId, 'extracted_document', source.id, 1, {
        sourceId: source.id,
        normalizedUrl: source.normalizedUrl,
        content: source.content,
        contentHash: source.contentHash,
      })
    }
    for (const [index, failure] of result.failures.entries()) {
      await this.appendArtifact(
        pilotId,
        runId,
        'source_rejected',
        `round-${mission.round}-${index + 1}`,
        1,
        failure,
      )
    }
  }

  async saveAnalysis(
    pilotId: string,
    runId: string,
    mission: RealResearchMission,
    analysis: IntelligenceRoundAnalysis,
    dossier?: RealResearchDossier,
  ): Promise<void> {
    await this.appendArtifact(
      pilotId,
      runId,
      'master_knowledge',
      'master',
      mission.round,
      analysis.masterKnowledge,
    )
    await this.appendArtifact(pilotId, runId, 'coverage', 'coverage', mission.round, analysis.coverage)
    for (const claim of analysis.masterKnowledge.claims) {
      await this.appendArtifact(pilotId, runId, 'fact', claim.id, mission.round, claim)
      await this.appendArtifact(pilotId, runId, 'evidence', `claim-${claim.id}`, mission.round, {
        claimId: claim.id,
        statement: claim.statement,
        evidenceIds: claim.evidenceIds,
        confidence: claim.confidence,
      })
      const topic = claim.topic.toLowerCase()
      if (/(place|castle|wall|monument|heritage|lugar|castillo|muralla|patrimonio)/.test(topic)) {
        await this.appendArtifact(pilotId, runId, 'place', claim.id, mission.round, claim)
      }
      if (/(activity|route|hike|actividad|ruta|sender)/.test(topic)) {
        await this.appendArtifact(pilotId, runId, 'activity', claim.id, mission.round, claim)
      }
    }
    for (const evidence of dossier?.evidence ?? []) {
      await this.appendArtifact(pilotId, runId, 'evidence', evidence.id, mission.round, evidence)
    }
    for (const gap of analysis.gaps) {
      await this.appendArtifact(pilotId, runId, 'gap', gap.id, mission.round, gap)
    }
    for (const [index, contradiction] of analysis.masterKnowledge.contradictions.entries()) {
      await this.appendArtifact(
        pilotId,
        runId,
        'contradiction',
        `round-${mission.round}-${index + 1}`,
        1,
        { contradiction },
      )
    }
    for (const query of analysis.proposedQueries) {
      await this.appendArtifact(pilotId, runId, 'query', query.id, 1, query)
    }
  }

  async saveDrafts(pilotId: string, runId: string, drafts: IntelligenceDraft[]): Promise<void> {
    for (const draft of drafts) {
      await this.appendArtifact(
        pilotId,
        runId,
        draft.profile === 'adventure' ? 'draft_adventure' : 'draft_student',
        draft.profile,
        1,
        draft,
      )
    }
  }

  async saveReview(pilotId: string, runId: string, review: IntelligenceReview): Promise<void> {
    await this.appendArtifact(pilotId, runId, 'final_review', 'final', 1, review)
  }

  async appendEvent(
    pilotId: string,
    runId: string | undefined,
    eventType: string,
    state: RealEditorialPilotState | undefined,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    const { error } = await this.client.from('real_editorial_events').insert({
      id: this.id(),
      pilot_id: pilotId,
      run_id: runId ?? null,
      event_type: eventType,
      state: state ?? null,
      payload,
      occurred_at: this.now().toISOString(),
    })
    if (error) throw persistenceError(error)
  }

  async recordIncident(
    pilotId: string,
    runId: string,
    code: string,
    classification: 'recoverable' | 'permanent' | 'ambiguous' | 'human_required',
    message: string,
  ): Promise<string> {
    const incidentId = this.id()
    const { error } = await this.client.from('real_editorial_incidents').insert({
      id: incidentId,
      pilot_id: pilotId,
      run_id: runId,
      code,
      classification,
      message: message.slice(0, 1_000),
      created_at: this.now().toISOString(),
    })
    if (error) throw persistenceError(error)
    return incidentId
  }

  async cancel(pilotId: string, reason: string): Promise<void> {
    const pilot = await this.getPilot(pilotId)
    if (!pilot) throw new RealEditorialRepositoryError('PILOT_NOT_FOUND', 'El piloto no existe')
    const now = this.now().toISOString()
    const [runResult, pilotResult] = await Promise.all([
      this.client.from('real_editorial_runs').update({
        state: 'cancelled',
        cancel_requested_at: now,
        cancelled_at: now,
        completed_at: now,
      }).eq('id', pilot.currentRunId),
      this.client.from('real_editorial_pilots').update({ state: 'cancelled' }).eq('id', pilotId),
    ])
    assertNoError(runResult.error, 'No se pudo cancelar el run')
    assertNoError(pilotResult.error, 'No se pudo cancelar el piloto')
    await this.appendEvent(pilotId, pilot.currentRunId, 'real.editorial.cancelled', 'cancelled', { reason })
  }

  async reopenCancelled(pilotId: string): Promise<void> {
    const pilot = await this.getPilot(pilotId)
    if (!pilot) throw new RealEditorialRepositoryError('PILOT_NOT_FOUND', 'El piloto no existe')
    if (pilot.state !== 'cancelled') return
    const artifact = await this.latestArtifact(pilot.currentRunId, 'checkpoint', 'workflow')
    if (artifact) {
      const checkpoint = artifact.payload as unknown as RealWorkflowCheckpoint
      const reopened: RealWorkflowCheckpoint = {
        ...checkpoint,
        state: resumeWorkflowState(checkpoint),
        updatedAt: this.now().toISOString(),
      }
      await this.appendArtifact(
        pilot.id,
        pilot.currentRunId,
        'checkpoint',
        'workflow',
        artifact.version + 1,
        reopened as unknown as Record<string, unknown>,
      )
    }
    const state = pilot.budgetConfirmed ? 'preflight' : 'queued'
    const [runResult, pilotResult] = await Promise.all([
      this.client.from('real_editorial_runs').update({
        state,
        cancel_requested_at: null,
        cancelled_at: null,
        completed_at: null,
      }).eq('id', pilot.currentRunId),
      this.client.from('real_editorial_pilots').update({ state }).eq('id', pilot.id),
    ])
    assertNoError(runResult.error, 'No se pudo reabrir el run cancelado')
    assertNoError(pilotResult.error, 'No se pudo reabrir el piloto cancelado')
    await this.appendEvent(pilot.id, pilot.currentRunId, 'real.editorial.reopened', state, {})
  }

  private async findCanonicalMorella(): Promise<{ id: string }> {
    const { data, error } = await this.client.from('geographic_entities').select('id')
      .eq('normalized_name', 'morella')
      .eq('country_code', 'ES')
      .eq('entity_type', 'locality')
      .eq('status', 'active')
      .limit(2)
    assertNoError(error, 'No se pudo resolver Morella')
    if (!data || data.length !== 1) {
      throw new RealEditorialRepositoryError(
        'DESTINATION_NOT_FOUND',
        'Morella no tiene una identidad canónica única y activa',
      )
    }
    return { id: String(data[0].id) }
  }
}

export class SupabaseRealWorkflowCheckpointStore implements RealWorkflowCheckpointStore {
  constructor(
    private readonly repository: RealEditorialPilotRepository,
    private readonly pilotId: string,
    private readonly runId: string,
  ) {}

  async load(taskId: string): Promise<RealWorkflowCheckpoint | undefined> {
    const artifact = await this.repository.latestArtifact(this.runId, 'checkpoint', 'workflow')
    if (!artifact) return undefined
    const checkpoint = artifact.payload as unknown as RealWorkflowCheckpoint
    if (checkpoint.taskId !== taskId || checkpoint.version !== 'real-workflow-v1') {
      throw new RealEditorialRepositoryError('CHECKPOINT_INVALID', 'El checkpoint pertenece a otra tarea')
    }
    const parsedQueries = RealFocusedQuerySchema.array().safeParse(checkpoint.nextRoundQueries)
    if (!parsedQueries.success) {
      throw new RealEditorialRepositoryError(
        'CHECKPOINT_INVALID',
        'Las consultas focalizadas del checkpoint no superan el contrato durable',
      )
    }
    const [roundOne, roundTwo, ...storedQueries] = await Promise.all([
      this.repository.latestArtifact(this.runId, 'tavily_result', 'round-1'),
      this.repository.latestArtifact(this.runId, 'tavily_result', 'round-2'),
      ...parsedQueries.data.map(query =>
        this.repository.latestArtifact(this.runId, 'query', query.id)),
    ])
    const nextRoundQueries = parsedQueries.data.map((query, index) =>
      canonicalRealEditorialFocusedQuery(storedQueries[index], query))
    return restoreRealWorkflowCheckpointRounds(
      { ...structuredClone(checkpoint), nextRoundQueries },
      { 1: roundOne, 2: roundTwo },
    )
  }

  async save(checkpoint: RealWorkflowCheckpoint): Promise<void> {
    const latest = await this.repository.latestArtifact(this.runId, 'checkpoint', 'workflow')
    await this.repository.appendArtifact(
      this.pilotId,
      this.runId,
      'checkpoint',
      'workflow',
      (latest?.version ?? 0) + 1,
      checkpoint as unknown as Record<string, unknown>,
    )
    const state = mapWorkflowState(checkpoint.state)
    await this.repository.updateState(
      this.pilotId,
      this.runId,
      state,
      checkpoint.completedRound,
      checkpoint.simulatedCost,
    )
    for (const query of checkpoint.nextRoundQueries) {
      await this.repository.appendArtifact(
        this.pilotId,
        this.runId,
        'query',
        query.id,
        1,
        query,
      )
    }
  }
}

export function restoreRealWorkflowCheckpointRounds(
  checkpoint: RealWorkflowCheckpoint,
  artifacts: Partial<Record<RealRoundNumber, RealEditorialArtifact | undefined>>,
): RealWorkflowCheckpoint {
  const completedAnalysisRound = checkpoint.completedRound
  const durableResearch = ([1, 2] as const).flatMap(round => {
    const artifact = artifacts[round]
    if (!artifact) return []
    if (
      artifact.kind !== 'tavily_result'
      || artifact.key !== `round-${round}`
      || !isRecord(artifact.payload)
      || artifact.payload.round !== round
      || !Array.isArray(artifact.payload.sources)
    ) {
      throw invalidRoundCheckpoint('El resultado durable de investigación no corresponde a su ronda')
    }
    return [{ round, artifact, result: artifact.payload as unknown as ResearchToolResult }]
  })
  const durableResearchRounds = durableResearch.map(item => item.round)
  if (!durableResearchRounds.every((round, index) => round === index + 1)) {
    throw invalidRoundCheckpoint('Las rondas durables de investigación no son correlativas')
  }
  if (
    completedAnalysisRound > durableResearchRounds.length
    || durableResearchRounds.length - completedAnalysisRound > 1
  ) {
    throw invalidRoundCheckpoint('El índice de análisis no coincide con las rondas durables')
  }

  let storedDossier: RealResearchDossier | undefined
  if (checkpoint.dossier) {
    const parsed = RealResearchDossierSchema.safeParse(checkpoint.dossier)
    if (!parsed.success) {
      throw invalidRoundCheckpoint('El expediente del checkpoint no supera el esquema estricto')
    }
    storedDossier = parsed.data
    const mission = checkpoint.initialMission
    if (
      storedDossier.requestId !== mission.requestId
      || storedDossier.runId !== mission.runId
      || storedDossier.taskId !== mission.taskId
      || storedDossier.destinationId !== mission.destination.canonicalId
    ) {
      throw invalidRoundCheckpoint('El expediente del checkpoint pertenece a otra ejecución')
    }
    if (
      storedDossier.rounds.length > durableResearchRounds.length
      || !storedDossier.rounds.every((round, index) => round === durableResearchRounds[index])
    ) {
      throw invalidRoundCheckpoint('El expediente no coincide con las rondas durables de investigación')
    }
  }

  if (durableResearch.length === 0) {
    if (storedDossier) {
      throw invalidRoundCheckpoint('El expediente declara rondas sin resultados Tavily durables')
    }
    return checkpoint
  }

  const sources = new Map<string, unknown>()
  for (const item of durableResearch) {
    for (const source of item.result.sources) {
      if (!isRecord(source) || typeof source.normalizedUrl !== 'string') {
        throw invalidRoundCheckpoint('Una fuente durable no supera el contrato editorial')
      }
      if (!sources.has(source.normalizedUrl)) sources.set(source.normalizedUrl, source)
    }
  }
  if (storedDossier) {
    const storedSourceCount = durableResearch
      .filter(item => storedDossier?.rounds.includes(item.round))
      .flatMap(item => item.result.sources)
      .reduce((unique, source) => {
        if (!isRecord(source) || typeof source.normalizedUrl !== 'string') {
          throw invalidRoundCheckpoint('Una fuente durable no supera el contrato editorial')
        }
        if (!unique.has(source.normalizedUrl)) unique.set(source.normalizedUrl, source)
        return unique
      }, new Map<string, unknown>())
    if (realEditorialPayloadHash([...storedSourceCount.values()])
      !== realEditorialPayloadHash(storedDossier.sources)) {
      throw invalidRoundCheckpoint('Las fuentes del expediente no coinciden con los artefactos durables')
    }
  }

  const mission = checkpoint.initialMission
  const dossier = RealResearchDossierSchema.safeParse({
    requestId: mission.requestId,
    runId: mission.runId,
    taskId: mission.taskId,
    destinationId: mission.destination.canonicalId,
    rounds: durableResearchRounds,
    sources: [...sources.values()],
    evidence: storedDossier?.evidence ?? [],
    generatedAt: storedDossier?.generatedAt ?? durableResearch.at(-1)?.artifact.createdAt,
  })
  if (!dossier.success) {
    throw invalidRoundCheckpoint('No se pudo reconstruir el expediente desde los artefactos durables')
  }

  const pendingAnalysisRound = durableResearchRounds[completedAnalysisRound]
  return {
    ...checkpoint,
    state: pendingAnalysisRound === 1
      ? 'analyzing_round_1'
      : pendingAnalysisRound === 2
        ? 'analyzing_round_2'
        : checkpoint.state,
    dossier: dossier.data,
  }
}

export function realEditorialIdentityKey(variantKey = 'initial'): string {
  return createHash('sha256').update(JSON.stringify({
    normalizedDestination: REAL_EDITORIAL_PILOT_POLICY.normalizedDestination,
    countryCode: REAL_EDITORIAL_PILOT_POLICY.countryCode,
    destinationType: REAL_EDITORIAL_PILOT_POLICY.destinationType,
    mode: 'real_editorial_pilot',
    pipelineVersion: REAL_EDITORIAL_PILOT_POLICY.pipelineVersion,
    profiles: [
      { profile: 'adventure', targetWords: 1_000 },
      { profile: 'student', targetWords: 1_800 },
    ],
    taskOrigin: 'human_authorized',
    variantKey,
  })).digest('hex')
}

function pilotFromRows(
  pilot: Record<string, unknown>,
  budget: Record<string, unknown> | null,
): RealEditorialPilotRecord {
  return RealEditorialPilotRecordSchema.parse({
    id: pilot.id,
    policyId: pilot.policy_id,
    mode: pilot.mode,
    taskOrigin: pilot.task_origin,
    variantKey: pilot.variant_key,
    preparationKey: pilot.preparation_key,
    identityKey: pilot.identity_key,
    canonicalDestinationId: pilot.canonical_destination_id,
    destinationName: pilot.destination_name,
    normalizedDestination: pilot.normalized_destination,
    countryCode: pilot.country_code,
    destinationType: pilot.destination_type,
    language: pilot.language,
    pipelineVersion: pilot.pipeline_version,
    profiles: pilot.profile_configuration,
    state: pilot.state,
    budgetConfirmed: pilot.budget_confirmed,
    publicationCount: pilot.publication_count,
    trawelConnected: pilot.trawel_connected,
    automaticEnabled: pilot.automatic_enabled,
    currentRunId: pilot.current_run_id,
    version: pilot.version,
    createdAt: pilot.created_at,
    updatedAt: pilot.updated_at,
    budget: budget ? budgetFromRow(budget) : undefined,
  })
}

function budgetFromRow(row: Record<string, unknown>): RealEditorialPilotBudget {
  return RealEditorialPilotBudgetSchema.parse({
    pilotId: String(row.pilot_id),
    taskId: String(row.task_id),
    batchId: String(row.batch_id),
    dailyScopeId: String(row.daily_scope_id),
    budgetDate: String(row.budget_date),
    currency: 'EUR',
    targetCost: Number(row.target_cost),
    warningCost: Number(row.warning_cost),
    taskLimitCost: Number(row.task_limit_cost),
    batchLimitCost: Number(row.batch_limit_cost),
    dailyLimitCost: Number(row.daily_limit_cost),
    manualExtensionCost: Number(row.manual_extension_cost),
    technicalLimitCost: Number(row.technical_limit_cost),
    reservedCost: Number(row.reserved_cost),
    spentCost: Number(row.spent_cost),
    confirmedAt: String(row.confirmed_at),
  })
}

function validBudgetRow(row: Record<string, unknown>): boolean {
  return validBudget(budgetFromRow(row))
}

function validBudget(budget: RealEditorialPilotBudget): boolean {
  return budget.taskLimitCost >= REAL_EDITORIAL_PILOT_POLICY.automaticStopCostEur
    && budget.taskLimitCost === budget.batchLimitCost
    && budget.batchLimitCost === budget.dailyLimitCost
    && budget.dailyLimitCost <= budget.technicalLimitCost
    && budget.technicalLimitCost === REAL_EDITORIAL_PILOT_POLICY.technicalLimitCostEur
    && budget.reservedCost + budget.spentCost <= budget.taskLimitCost
}

function reopenBudgetCheckpoint(payload: unknown, now: Date): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new RealEditorialRepositoryError(
      'CHECKPOINT_INVALID',
      'El checkpoint presupuestario no es un objeto',
    )
  }
  const decision = RealContinueDecisionSchema.safeParse(payload.lastDecision)
  if (
    payload.state !== 'review_required'
    || payload.completedRound !== 1
    || !decision.success
    || decision.data.action !== 'continue_focused'
  ) {
    throw new RealEditorialRepositoryError(
      'CHECKPOINT_INVALID',
      'El checkpoint no conserva una segunda ronda focalizada pendiente',
    )
  }
  return {
    ...payload,
    state: 'researching_round_2',
    nextRoundQueries: decision.data.queries,
    updatedAt: now.toISOString(),
  }
}

function mapWorkflowState(state: RealWorkflowCheckpoint['state']): RealEditorialPilotState {
  if (state === 'analyzing_round_1') return 'evaluating_round_1'
  if (state === 'analyzing_round_2') return 'evaluating_round_2'
  if (state === 'ready_for_drafting') return 'generating_adventure'
  return state
}

function resumeWorkflowState(
  checkpoint: RealWorkflowCheckpoint,
): RealWorkflowCheckpoint['state'] {
  if (checkpoint.completedRound === 0) return 'queued'
  if (
    checkpoint.completedRound === 2
    || checkpoint.coverage?.sufficient
    || checkpoint.lastDecision?.action === 'stop_ready'
  ) return 'ready_for_drafting'
  if (checkpoint.lastDecision?.action === 'stop_review_required') return 'review_required'
  return 'researching_round_2'
}

export function realEditorialPayloadHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalJson(payload))).digest('hex')
}

export function canonicalRealEditorialFocusedQuery(
  existing: RealEditorialArtifact | undefined,
  candidate: unknown,
): RealFocusedQuery {
  const parsedCandidate = RealFocusedQuerySchema.safeParse(candidate)
  if (!parsedCandidate.success) {
    throw new RealEditorialRepositoryError(
      'CHECKPOINT_INVALID',
      'La consulta focalizada candidata no supera el contrato durable',
    )
  }
  if (!existing) return parsedCandidate.data
  if (existing.kind !== 'query' || existing.key !== parsedCandidate.data.id || existing.version !== 1) {
    throw new RealEditorialRepositoryError(
      'VERSION_CONFLICT',
      `El artefacto durable query/${parsedCandidate.data.id} no pertenece a la misma etapa y versión`,
    )
  }
  const parsedExisting = RealFocusedQuerySchema.safeParse(existing.payload)
  if (!parsedExisting.success) {
    throw new RealEditorialRepositoryError(
      'CHECKPOINT_INVALID',
      `El artefacto durable query/${parsedCandidate.data.id} está incompleto o es inválido`,
    )
  }
  const semanticDifferences = (['id', 'gapId', 'query'] as const)
    .filter(field => parsedExisting.data[field] !== parsedCandidate.data[field])
  if (semanticDifferences.length > 0) {
    throw new RealEditorialRepositoryError(
      'VERSION_CONFLICT',
      `El artefacto durable query/${parsedCandidate.data.id} v1 diverge en campos semánticos: ${
        semanticDifferences.join(', ')
      }`,
    )
  }
  return parsedExisting.data
}

export function realEditorialPayloadDifferencePaths(
  existing: unknown,
  candidate: unknown,
  path = '$',
): string[] {
  if (Object.is(existing, candidate)) return []
  if (Array.isArray(existing) || Array.isArray(candidate)) {
    if (!Array.isArray(existing) || !Array.isArray(candidate)) return [path]
    const differences = existing.length === candidate.length ? [] : [`${path}.length`]
    for (let index = 0; index < Math.max(existing.length, candidate.length); index += 1) {
      if (index >= existing.length || index >= candidate.length) {
        differences.push(`${path}[${index}]`)
      } else {
        differences.push(
          ...realEditorialPayloadDifferencePaths(existing[index], candidate[index], `${path}[${index}]`),
        )
      }
    }
    return differences
  }
  if (isRecord(existing) && isRecord(candidate)) {
    const differences: string[] = []
    const keys = [...new Set([...Object.keys(existing), ...Object.keys(candidate)])].sort()
    for (const key of keys) {
      if (!(key in existing) || !(key in candidate)) {
        differences.push(`${path}.${key}`)
      } else {
        differences.push(
          ...realEditorialPayloadDifferencePaths(existing[key], candidate[key], `${path}.${key}`),
        )
      }
    }
    return differences
  }
  return [path]
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalJson(nested)]),
    )
  }
  return value
}

export function dateInMadrid(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(entry => entry.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function assertNoError(
  error: { message: string; code?: string } | null,
  message: string,
): void {
  if (error) throw new RealEditorialRepositoryError('PERSISTENCE_ERROR', message, error)
}

function persistenceError(error: { message: string; code?: string }): RealEditorialRepositoryError {
  return new RealEditorialRepositoryError(
    'PERSISTENCE_ERROR',
    'La persistencia editorial real rechazó la operación',
    error,
  )
}

function invalidRoundCheckpoint(message: string): RealEditorialRepositoryError {
  return new RealEditorialRepositoryError('CHECKPOINT_INVALID', message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function humanResolutionPersistenceError(
  error: { message: string; code?: string },
): RealEditorialRepositoryError {
  if (error.message.includes('HUMAN_RESOLUTION_BUDGET_EXCEEDED')) {
    return new RealEditorialRepositoryError(
      'HUMAN_RESOLUTION_BUDGET_EXCEEDED',
      'El coste conciliado superaría el máximo vigente durable',
    )
  }
  if (error.message.includes('PRUDENTIAL_PROVIDER_RESULT_BECAME_DURABLE')) {
    return new RealEditorialRepositoryError(
      'HUMAN_RESOLUTION_CONFLICT',
      'El proveedor ya conserva un resultado durable y exige otra conciliación',
    )
  }
  if (
    error.message.includes('AMBIGUOUS_CALL_ALREADY_RESOLVED')
    || error.message.includes('HUMAN_RESOLUTION_IDEMPOTENCY_CONFLICT')
  ) {
    return new RealEditorialRepositoryError(
      'HUMAN_RESOLUTION_CONFLICT',
      'La llamada ya tiene una resolución humana incompatible',
    )
  }
  if (
    error.message.includes('AMBIGUOUS_CALL_NOT_FOUND')
    || error.message.includes('AMBIGUOUS_RESERVATION_MISMATCH')
    || error.message.includes('AMBIGUOUS_RESERVATION_STATE_CHANGED')
  ) {
    return new RealEditorialRepositoryError(
      'HUMAN_RESOLUTION_REQUIRED',
      'La llamada ya no está pendiente de revisión humana',
    )
  }
  if (
    error.message.includes('PRUDENTIAL_COST_INVALID')
    || error.message.includes('PRUDENTIAL_COST_ABOVE_RESERVATION')
    || error.message.includes('PRUDENTIAL_COST_ABOVE_SUBREQUEST_MAXIMUM')
    || error.message.includes('PRUDENTIAL_COST_MUST_EQUAL_SUBREQUEST_MAXIMUM')
    || error.message.includes('PRUDENTIAL_CURRENCY')
    || error.message.includes('PRUDENTIAL_TARIFF_INVALID')
  ) {
    return new RealEditorialRepositoryError(
      'HUMAN_RESOLUTION_NOT_ALLOWED',
      'El coste prudencial debe coincidir con el máximo tarifado de la subpetición y caber en la reserva',
    )
  }
  return new RealEditorialRepositoryError(
    'HUMAN_RESOLUTION_NOT_ALLOWED',
    'La resolución humana durable fue rechazada',
  )
}

function budgetDecisionPersistenceError(
  error: { message: string; code?: string },
): RealEditorialRepositoryError {
  if (
    error.message.includes('BUDGET_EXTENSION_BELOW_LEDGER')
    || error.message.includes('BUDGET_EXTENSION_BELOW_TOTAL_ESTIMATE')
    || error.message.includes('BUDGET_EXTENSION_NOT_GREATER')
    || error.message.includes('BUDGET_EXTENSION_ABOVE_TECHNICAL_LIMIT')
    || error.message.includes('BUDGET_DECISION_MAXIMUM_INVALID')
  ) {
    return new RealEditorialRepositoryError(
      'BUDGET_EXTENSION_INVALID',
      'El nuevo máximo no cubre el ledger y el trabajo restante o supera el límite técnico',
    )
  }
  if (
    error.message.includes('BUDGET_DECISION_IDEMPOTENCY_CONFLICT')
    || error.message.includes('BUDGET_DECISION_ALREADY_TERMINAL')
    || error.message.includes('BUDGET_REVIEW_CONFLICT')
  ) {
    return new RealEditorialRepositoryError(
      'BUDGET_DECISION_CONFLICT',
      'La barrera económica ya tiene una decisión humana incompatible',
    )
  }
  if (
    error.message.includes('BUDGET_REVIEW_NOT_FOUND')
    || error.message.includes('BUDGET_REVIEW_INCIDENT_INVALID')
  ) {
    return new RealEditorialRepositoryError(
      'BUDGET_REVIEW_REQUIRED',
      'No existe una barrera económica pendiente para este piloto y run',
    )
  }
  return new RealEditorialRepositoryError(
    'BUDGET_DECISION_NOT_ALLOWED',
    'La decisión presupuestaria durable fue rechazada',
  )
}

function moneyValue(value: number): number {
  return Number(value.toFixed(9))
}

function focusedQueryFromCheckpoint(
  payload: Record<string, unknown>,
): string | undefined {
  if (payload.state !== 'researching_round_2' || payload.completedRound !== 1) {
    return undefined
  }
  const first = Array.isArray(payload.nextRoundQueries)
    ? payload.nextRoundQueries[0]
    : undefined
  return isRecord(first) && typeof first.query === 'string' && first.query.trim()
    ? first.query
    : undefined
}

function unavailableInspection(): RealEditorialRepositoryInspection {
  return {
    repositoryAvailable: false,
    connectivityValidated: false,
    guardFree: false,
    activeExecutions: 0,
    pendingReservations: 0,
    recoverableReservations: 0,
    humanRequiredCalls: 0,
    manualMorellaCount: 0,
    identicalPilotCount: 0,
    budgetValid: false,
  }
}

const activeStates: RealEditorialPilotState[] = [
  'researching_round_1',
  'evaluating_round_1',
  'researching_round_2',
  'evaluating_round_2',
  'generating_adventure',
  'generating_student',
  'final_review',
]

const resumableStates: RealEditorialPilotState[] = [
  'preflight',
  'cancelled',
  ...activeStates,
]

const terminalStates: RealEditorialPilotState[] = [
  'pending_human_review',
  'ready_for_human_review',
  'review_required',
  'failed',
  'cancelled',
]
