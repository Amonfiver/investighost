import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ProviderCallLedgerEntry,
  ProviderCallReservation,
  ProviderCallReservationInput,
  ProviderCallSettlement,
} from '@shared/real-cost-contracts'
import type { RealWorkflowCheckpoint, RealWorkflowCheckpointStore } from './real-workflow'
import { CostLedgerError, type CostLedgerRepository } from './cost-ledger'
import {
  realEditorialPayloadHash,
  type RealEditorialArtifact,
  type RealEditorialArtifactKind,
} from './real-editorial-repository'
import type { GenericRealEditorialExecutionContext } from './generic-real-editorial-execution'

export interface GenericDurableExecutionBudget {
  taskLimitCost: number
  batchLimitCost: number
  dailyLimitCost: number
}

export interface GenericDurableExecutionRecord {
  id: string
  ownerType: 'PILOT' | 'BATCH_JOB'
  ownerId: string
  destinationId: string
  runId: string
  taskId: string
  batchId: string
  state: string
  budget: GenericDurableExecutionBudget
  policy: Record<string, unknown>
}

export interface GenericDurableArtifactReference extends RealEditorialArtifact {
  id: string
}

/**
 * Batch execution persistence intentionally reuses the append-only real
 * artifacts and provider ledger tables. It does not create a second research
 * store or a second cost ledger.
 */
export class SupabaseGenericDurableExecutionRepository {
  constructor(
    readonly client: SupabaseClient,
    private readonly id: () => string = randomUUID,
  ) {}

  async ensureExecution(
    context: GenericRealEditorialExecutionContext,
    budget: GenericDurableExecutionBudget,
  ): Promise<GenericDurableExecutionRecord> {
    const payload = {
      id: this.id(),
      owner_type: context.owner.type,
      owner_id: context.owner.id,
      destination_id: context.destination.destinationId,
      run_id: context.runId,
      task_id: context.taskId,
      batch_id: context.batchId,
      state: 'queued',
      task_limit_cost: budget.taskLimitCost,
      batch_limit_cost: budget.batchLimitCost,
      daily_limit_cost: budget.dailyLimitCost,
      policy: {
        language: context.policy.language,
        depth: context.policy.depth,
        promptVersion: context.policy.promptVersion,
      },
    }
    const { data, error } = await this.client.from('real_editorial_executions')
      .upsert(payload, { onConflict: 'owner_type,owner_id', ignoreDuplicates: true })
      .select('*').maybeSingle()
    if (error) throw new GenericDurableExecutionError('PERSISTENCE_ERROR', 'No se pudo crear la ejecución editorial durable', error)
    if (data) return executionFromRow(data)
    const { data: existing, error: readError } = await this.client.from('real_editorial_executions')
      .select('*').eq('owner_type', context.owner.type).eq('owner_id', context.owner.id).maybeSingle()
    if (readError || !existing) throw new GenericDurableExecutionError('PERSISTENCE_ERROR', 'No se pudo recuperar la ejecución editorial durable', readError)
    const record = executionFromRow(existing)
    if (record.destinationId !== context.destination.destinationId || record.runId !== context.runId) {
      throw new GenericDurableExecutionError('IDEMPOTENCY_CONFLICT', 'El owner ya pertenece a otra ejecución editorial')
    }
    return record
  }

  async latestArtifact(
    executionOwnerId: string,
    kind: RealEditorialArtifactKind,
    key: string,
  ): Promise<RealEditorialArtifact | undefined> {
    const { data, error } = await this.client.from('real_editorial_artifacts').select('*')
      .eq('execution_owner_id', executionOwnerId).eq('artifact_kind', kind).eq('artifact_key', key)
      .order('version', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new GenericDurableExecutionError('PERSISTENCE_ERROR', 'No se pudo leer el artifact editorial', error)
    return data ? artifactFromRow(data) : undefined
  }

  async latestArtifactReference(
    executionOwnerId: string,
    kind: RealEditorialArtifactKind,
    key: string,
  ): Promise<GenericDurableArtifactReference | undefined> {
    const { data, error } = await this.client.from('real_editorial_artifacts').select('*')
      .eq('execution_owner_id', executionOwnerId).eq('artifact_kind', kind).eq('artifact_key', key)
      .order('version', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new GenericDurableExecutionError('PERSISTENCE_ERROR', 'No se pudo leer la referencia durable', error)
    return data ? { id: String(data.id), ...artifactFromRow(data) } : undefined
  }

  async appendArtifact(
    executionOwnerId: string,
    kind: RealEditorialArtifactKind,
    key: string,
    version: number,
    payload: unknown,
  ): Promise<void> {
    const payloadHash = realEditorialPayloadHash(payload)
    const existing = await this.client.from('real_editorial_artifacts').select('payload_hash')
      .eq('execution_owner_id', executionOwnerId).eq('artifact_kind', kind)
      .eq('artifact_key', key).eq('version', version).maybeSingle()
    if (existing.error) throw new GenericDurableExecutionError('PERSISTENCE_ERROR', 'No se pudo comprobar el artifact editorial', existing.error)
    if (existing.data) {
      if (existing.data.payload_hash !== payloadHash) {
        throw new GenericDurableExecutionError('IDEMPOTENCY_CONFLICT', 'El artifact durable ya existe con otro payload')
      }
      return
    }
    const { error } = await this.client.from('real_editorial_artifacts').insert({
      execution_owner_id: executionOwnerId,
      artifact_kind: kind,
      artifact_key: key,
      version,
      payload,
      payload_hash: payloadHash,
    })
    if (error) throw new GenericDurableExecutionError('PERSISTENCE_ERROR', 'No se pudo guardar el artifact editorial', error)
  }

  async updateState(executionOwnerId: string, state: string): Promise<void> {
    const { error } = await this.client.from('real_editorial_executions').update({ state })
      .eq('id', executionOwnerId)
    if (error) throw new GenericDurableExecutionError('PERSISTENCE_ERROR', 'No se pudo actualizar la fase editorial', error)
  }

  checkpointStore(executionOwnerId: string): RealWorkflowCheckpointStore {
    return new GenericDurableWorkflowCheckpointStore(this, executionOwnerId)
  }
}

export class GenericDurableWorkflowCheckpointStore implements RealWorkflowCheckpointStore {
  constructor(
    private readonly repository: Pick<SupabaseGenericDurableExecutionRepository, 'latestArtifact' | 'appendArtifact'>,
    private readonly executionOwnerId: string,
  ) {}

  async load(taskId: string): Promise<RealWorkflowCheckpoint | undefined> {
    const artifact = await this.repository.latestArtifact(this.executionOwnerId, 'checkpoint', 'workflow')
    if (!artifact) return undefined
    const checkpoint = artifact.payload as RealWorkflowCheckpoint
    if (checkpoint.version !== 'real-workflow-v1' || checkpoint.taskId !== taskId) {
      throw new GenericDurableExecutionError('CHECKPOINT_INVALID', 'El checkpoint no pertenece a la ejecución actual')
    }
    return structuredClone(checkpoint)
  }

  async save(checkpoint: RealWorkflowCheckpoint): Promise<void> {
    const latest = await this.repository.latestArtifact(this.executionOwnerId, 'checkpoint', 'workflow')
    await this.repository.appendArtifact(
      this.executionOwnerId,
      'checkpoint',
      'workflow',
      (latest?.version ?? 0) + 1,
      checkpoint,
    )
  }
}

export class SupabaseGenericExecutionLedgerRepository implements CostLedgerRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly executionOwnerId: string,
    private readonly context: Pick<GenericRealEditorialExecutionContext, 'owner' | 'runId' | 'taskId' | 'batchId'>,
  ) {}

  async acquireGlobalGuard(): Promise<boolean> { return true }
  async releaseGlobalGuard(): Promise<boolean> { return true }

  async findByIdempotencyKey(idempotencyKey: string): Promise<ProviderCallReservation | undefined> {
    const { data, error } = await this.client.from('real_editorial_call_reservations').select('*')
      .eq('execution_owner_id', this.executionOwnerId).eq('idempotency_key', idempotencyKey).maybeSingle()
    if (error) throw new CostLedgerError('INVALID_RESERVATION_STATE', 'No se pudo consultar el ledger de batch')
    return data ? reservationFromRow(data, this.context) : undefined
  }

  async findByCallId(callId: string): Promise<ProviderCallReservation | undefined> {
    const { data, error } = await this.client.from('real_editorial_call_reservations').select('*')
      .eq('execution_owner_id', this.executionOwnerId).eq('call_id', callId).maybeSingle()
    if (error) throw new CostLedgerError('INVALID_RESERVATION_STATE', 'No se pudo consultar la llamada durable')
    return data ? reservationFromRow(data, this.context) : undefined
  }

  async reserve(input: ProviderCallReservationInput): Promise<ProviderCallReservation> {
    this.assertOwner(input)
    const { data, error } = await this.client.rpc('reserve_generic_real_editorial_call', {
      p_execution_owner_id: this.executionOwnerId,
      p_idempotency_key: input.idempotencyKey,
      p_execution_id: input.executionId,
      p_task_id: input.taskId,
      p_batch_id: input.batchId,
      p_stage: input.stage,
      p_operation: input.operation,
      p_provider_id: input.providerId,
      p_model: input.model,
      p_attempt: input.attempt,
      p_retry_of_call_id: input.retryOfCallId ?? null,
      p_estimated_cost: input.estimatedCost,
      p_currency: input.currency,
      p_tariff_id: input.tariffId,
      p_prompt_version: input.promptVersion,
      p_schema_version: input.schemaVersion,
      p_input_hash: input.inputHash,
    })
    if (error || typeof data !== 'string') {
      throw new CostLedgerError(
        'TASK_BUDGET_EXCEEDED',
        `El ledger durable rechazó la reserva batch${error?.message ? `: ${error.message}` : ''}`,
      )
    }
    const stored = await this.readReservation(data)
    if (!stored) throw new CostLedgerError('RESERVATION_NOT_FOUND', 'La reserva batch no quedó persistida')
    return stored
  }

  async start(reservationId: string): Promise<ProviderCallReservation> {
    const { data, error } = await this.client.rpc('start_generic_real_editorial_call', { p_reservation_id: reservationId })
    if (error || data !== true) throw new CostLedgerError('INVALID_RESERVATION_STATE', 'La reserva batch no pudo iniciarse')
    const stored = await this.readReservation(reservationId)
    if (!stored) throw new CostLedgerError('RESERVATION_NOT_FOUND', 'La reserva batch no existe')
    return stored
  }

  async settle(settlement: ProviderCallSettlement): Promise<ProviderCallReservation> {
    const { data, error } = await this.client.rpc('settle_generic_real_editorial_call', {
      p_reservation_id: settlement.reservationId,
      p_outcome: settlement.outcome,
      p_calculated_cost: settlement.calculatedCost ?? null,
      p_remote_id: settlement.usage.remoteId ?? null,
      p_input_tokens: settlement.usage.inputTokens,
      p_output_tokens: settlement.usage.outputTokens,
      p_tool_calls: settlement.usage.toolCalls,
      p_credits: settlement.usage.credits,
      p_sanitized_error: settlement.sanitizedError ?? null,
      p_output_hash: settlement.usage.outputHash ?? null,
    })
    if (error || data !== true) throw new CostLedgerError('INVALID_RESERVATION_STATE', 'La reserva batch no pudo conciliarse')
    const stored = await this.readReservation(settlement.reservationId)
    if (!stored) throw new CostLedgerError('RESERVATION_NOT_FOUND', 'La reserva batch no existe')
    return stored
  }

  async entries(callId?: string): Promise<ProviderCallLedgerEntry[]> {
    let query = this.client.from('real_editorial_provider_calls').select('*')
      .eq('execution_owner_id', this.executionOwnerId).order('created_at', { ascending: true })
      .order('sequence', { ascending: true })
    if (callId) query = query.eq('call_id', callId)
    const { data, error } = await query
    if (error) throw new CostLedgerError('INVALID_RESERVATION_STATE', 'No se pudo leer el ledger batch')
    return (data ?? []).map(entryFromRow)
  }

  private async readReservation(id: string): Promise<ProviderCallReservation | undefined> {
    const { data, error } = await this.client.from('real_editorial_call_reservations').select('*')
      .eq('id', id).eq('execution_owner_id', this.executionOwnerId).maybeSingle()
    if (error) throw new CostLedgerError('INVALID_RESERVATION_STATE', 'No se pudo leer la reserva batch')
    return data ? reservationFromRow(data, this.context) : undefined
  }

  private assertOwner(input: ProviderCallReservationInput): void {
    if (input.requestId !== this.context.owner.id || input.runId !== this.context.runId) {
      throw new CostLedgerError('IDEMPOTENCY_CONFLICT', 'La reserva no pertenece a la ejecución batch activa')
    }
  }
}

export class GenericDurableExecutionError extends Error {
  constructor(readonly code: 'PERSISTENCE_ERROR' | 'IDEMPOTENCY_CONFLICT' | 'CHECKPOINT_INVALID', message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'GenericDurableExecutionError'
  }
}

function executionFromRow(row: Record<string, unknown>): GenericDurableExecutionRecord {
  return {
    id: String(row.id), ownerType: row.owner_type as 'PILOT' | 'BATCH_JOB', ownerId: String(row.owner_id),
    destinationId: String(row.destination_id), runId: String(row.run_id), taskId: String(row.task_id),
    batchId: String(row.batch_id), state: String(row.state),
    budget: { taskLimitCost: Number(row.task_limit_cost), batchLimitCost: Number(row.batch_limit_cost), dailyLimitCost: Number(row.daily_limit_cost) },
    policy: (row.policy ?? {}) as Record<string, unknown>,
  }
}

function artifactFromRow(row: Record<string, unknown>): RealEditorialArtifact {
  return { kind: row.artifact_kind as RealEditorialArtifactKind, key: String(row.artifact_key), version: Number(row.version), payload: structuredClone(row.payload), payloadHash: String(row.payload_hash), createdAt: String(row.created_at) }
}

function reservationFromRow(
  row: Record<string, unknown>,
  context: Pick<GenericRealEditorialExecutionContext, 'owner' | 'runId' | 'taskId' | 'batchId'>,
): ProviderCallReservation {
  return {
    id: String(row.id), callId: String(row.call_id),
    input: {
      idempotencyKey: String(row.idempotency_key), executionId: String(row.execution_id), requestId: context.owner.id,
      runId: context.runId, taskId: String(row.task_id), batchId: String(row.batch_id), stage: String(row.stage), operation: String(row.operation),
      providerId: String(row.provider_id), model: String(row.model), attempt: Number(row.attempt),
      retryOfCallId: row.retry_of_call_id ? String(row.retry_of_call_id) : undefined, estimatedCost: Number(row.estimated_cost),
      currency: String(row.currency), tariffId: String(row.tariff_id), promptVersion: String(row.prompt_version),
      schemaVersion: String(row.schema_version), inputHash: String(row.input_hash),
    }, state: String(row.state) as ProviderCallReservation['state'], reservedCost: Number(row.reserved_cost),
    calculatedCost: row.calculated_cost === null || row.calculated_cost === undefined ? undefined : Number(row.calculated_cost),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  }
}

function entryFromRow(row: Record<string, unknown>): ProviderCallLedgerEntry {
  return {
    sequence: Number(row.sequence), callId: String(row.call_id), reservationId: String(row.reservation_id),
    state: String(row.state) as ProviderCallLedgerEntry['state'], attempt: Number(row.attempt),
    retryOfCallId: row.retry_of_call_id ? String(row.retry_of_call_id) : undefined,
    estimatedCost: Number(row.estimated_cost), reservedCost: Number(row.reserved_cost),
    calculatedCost: row.calculated_cost === null || row.calculated_cost === undefined ? undefined : Number(row.calculated_cost),
    currency: String(row.currency), remoteId: row.remote_id ? String(row.remote_id) : undefined,
    inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens), toolCalls: Number(row.tool_calls), credits: Number(row.credits),
    sanitizedError: row.sanitized_error ? String(row.sanitized_error) : undefined, promptVersion: String(row.prompt_version),
    schemaVersion: String(row.schema_version), inputHash: String(row.input_hash), outputHash: row.output_hash ? String(row.output_hash) : undefined,
    createdAt: String(row.created_at),
  }
}
