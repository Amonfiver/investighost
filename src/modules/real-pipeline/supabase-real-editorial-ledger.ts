import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ProviderCallReservationInputSchema,
  ProviderCallSettlementSchema,
  type ProviderCallLedgerEntry,
  type ProviderCallReservation,
  type ProviderCallReservationInput,
  type ProviderCallSettlement,
} from '@shared/real-cost-contracts'
import {
  CostLedgerError,
  type CostLedgerErrorCode,
  type CostLedgerRepository,
} from './cost-ledger'

export class SupabaseRealEditorialLedgerRepository implements CostLedgerRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly pilotId: string,
    private readonly runId: string,
  ) {}

  async acquireGlobalGuard(
    executionId: string,
    leaseToken: string,
    expiresAt: string,
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc('acquire_real_editorial_guard', {
      p_execution_id: executionId,
      p_lease_token: leaseToken,
      p_expires_at: expiresAt,
    })
    if (error) throw ledgerError(error)
    return data === true
  }

  async releaseGlobalGuard(leaseToken: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('release_real_editorial_guard', {
      p_lease_token: leaseToken,
    })
    if (error) throw ledgerError(error)
    return data === true
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<ProviderCallReservation | undefined> {
    const { data, error } = await this.client.from('real_editorial_call_reservations')
      .select('*').eq('idempotency_key', idempotencyKey).maybeSingle()
    if (error) throw ledgerError(error)
    return data ? reservationFromRow(data) : undefined
  }

  async findByCallId(callId: string): Promise<ProviderCallReservation | undefined> {
    const { data, error } = await this.client.from('real_editorial_call_reservations')
      .select('*').eq('call_id', callId).maybeSingle()
    if (error) throw ledgerError(error)
    return data ? reservationFromRow(data) : undefined
  }

  async reserve(candidate: ProviderCallReservationInput): Promise<ProviderCallReservation> {
    const input = ProviderCallReservationInputSchema.parse(candidate)
    this.assertPilotIdentity(input)
    const { data, error } = await this.client.rpc('reserve_real_editorial_call', {
      p_idempotency_key: input.idempotencyKey,
      p_execution_id: input.executionId,
      p_pilot_id: this.pilotId,
      p_run_id: this.runId,
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
    if (error) throw ledgerError(error)
    const stored = typeof data === 'string' ? await this.readReservation(data) : undefined
    if (!stored) throw new CostLedgerError('RESERVATION_NOT_FOUND', 'La reserva editorial no se creó')
    return stored
  }

  async start(reservationId: string): Promise<ProviderCallReservation> {
    const { data, error } = await this.client.rpc('start_real_editorial_call', {
      p_reservation_id: reservationId,
    })
    if (error) throw ledgerError(error)
    if (data !== true) throw new CostLedgerError(
      'INVALID_RESERVATION_STATE',
      'La reserva editorial no pudo iniciarse',
    )
    const stored = await this.readReservation(reservationId)
    if (!stored) throw new CostLedgerError('RESERVATION_NOT_FOUND', 'La reserva editorial no existe')
    return stored
  }

  async settle(candidate: ProviderCallSettlement): Promise<ProviderCallReservation> {
    const settlement = ProviderCallSettlementSchema.parse(candidate)
    const { data, error } = await this.client.rpc('settle_real_editorial_call', {
      p_reservation_id: settlement.reservationId,
      p_outcome: settlement.outcome,
      p_calculated_cost: settlement.calculatedCost ?? null,
      p_remote_id: settlement.usage.remoteId ?? null,
      p_input_tokens: settlement.usage.inputTokens,
      p_output_tokens: settlement.usage.outputTokens,
      p_tool_calls: settlement.usage.toolCalls,
      p_tools: [],
      p_credits: settlement.usage.credits,
      p_sanitized_error: settlement.sanitizedError ?? null,
      p_output_hash: settlement.usage.outputHash ?? null,
    })
    if (error) throw ledgerError(error)
    if (data !== true) throw new CostLedgerError(
      'INVALID_RESERVATION_STATE',
      'La reserva editorial no pudo conciliarse',
    )
    const stored = await this.readReservation(settlement.reservationId)
    if (!stored) throw new CostLedgerError('RESERVATION_NOT_FOUND', 'La reserva editorial no existe')
    return stored
  }

  async entries(callId?: string): Promise<ProviderCallLedgerEntry[]> {
    let query = this.client.from('real_editorial_provider_calls').select('*')
      .eq('pilot_id', this.pilotId).eq('run_id', this.runId)
      .order('created_at', { ascending: true }).order('sequence', { ascending: true })
    if (callId) query = query.eq('call_id', callId)
    const { data, error } = await query
    if (error) throw ledgerError(error)
    return (data ?? []).map(entryFromRow)
  }

  private async readReservation(id: string): Promise<ProviderCallReservation | undefined> {
    const { data, error } = await this.client.from('real_editorial_call_reservations')
      .select('*').eq('id', id).eq('pilot_id', this.pilotId).eq('run_id', this.runId)
      .maybeSingle()
    if (error) throw ledgerError(error)
    return data ? reservationFromRow(data) : undefined
  }

  private assertPilotIdentity(input: ProviderCallReservationInput): void {
    if (
      input.requestId !== this.pilotId
      || input.runId !== this.runId
    ) {
      throw new CostLedgerError(
        'IDEMPOTENCY_CONFLICT',
        'La reserva no pertenece al piloto, run y fecha presupuestaria activos',
      )
    }
  }
}

function reservationFromRow(row: Record<string, unknown>): ProviderCallReservation {
  const input = ProviderCallReservationInputSchema.parse({
    idempotencyKey: row.idempotency_key,
    executionId: row.execution_id,
    requestId: row.pilot_id,
    runId: row.run_id,
    taskId: row.task_id,
    batchId: row.batch_id,
    stage: row.stage,
    operation: row.operation,
    providerId: row.provider_id,
    model: row.model,
    attempt: Number(row.attempt),
    retryOfCallId: row.retry_of_call_id ?? undefined,
    estimatedCost: Number(row.estimated_cost),
    currency: row.currency,
    tariffId: row.tariff_id,
    promptVersion: row.prompt_version,
    schemaVersion: row.schema_version,
    inputHash: row.input_hash,
  })
  return {
    id: String(row.id),
    callId: String(row.call_id),
    input,
    state: String(row.state) as ProviderCallReservation['state'],
    reservedCost: Number(row.reserved_cost),
    calculatedCost: row.calculated_cost === null ? undefined : Number(row.calculated_cost),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function entryFromRow(row: Record<string, unknown>): ProviderCallLedgerEntry {
  return {
    sequence: Number(row.sequence),
    callId: String(row.call_id),
    reservationId: String(row.reservation_id),
    state: String(row.state) as ProviderCallLedgerEntry['state'],
    attempt: Number(row.attempt),
    retryOfCallId: row.retry_of_call_id ? String(row.retry_of_call_id) : undefined,
    estimatedCost: Number(row.estimated_cost),
    reservedCost: Number(row.reserved_cost),
    calculatedCost: row.calculated_cost === null ? undefined : Number(row.calculated_cost),
    currency: String(row.currency),
    remoteId: row.remote_id ? String(row.remote_id) : undefined,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    toolCalls: Number(row.tool_calls),
    credits: Number(row.credits),
    sanitizedError: row.sanitized_error ? String(row.sanitized_error) : undefined,
    promptVersion: String(row.prompt_version),
    schemaVersion: String(row.schema_version),
    inputHash: String(row.input_hash),
    outputHash: row.output_hash ? String(row.output_hash) : undefined,
    createdAt: String(row.created_at),
  }
}

function ledgerError(error: { message: string }): CostLedgerError {
  const codes: Array<[string, CostLedgerErrorCode]> = [
    ['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT'],
    ['AMBIGUOUS_TIMEOUT_NOT_RETRYABLE', 'AMBIGUOUS_TIMEOUT_NOT_RETRYABLE'],
    ['REAL_EDITORIAL_GUARD_REQUIRED', 'GLOBAL_GUARD_REQUIRED'],
    ['REAL_EDITORIAL_BUDGET_EXCEEDED', 'TASK_BUDGET_EXCEEDED'],
    ['REAL_EDITORIAL_RESERVATION_NOT_FOUND', 'RESERVATION_NOT_FOUND'],
    ['REAL_EDITORIAL_RESERVATION_ALREADY_STARTED', 'INVALID_RESERVATION_STATE'],
    ['REAL_EDITORIAL_RESERVATION_TERMINAL', 'INVALID_RESERVATION_STATE'],
    ['REAL_EDITORIAL_COST_EXCEEDS_RESERVATION', 'ACTUAL_COST_EXCEEDS_RESERVATION'],
  ]
  const code = codes.find(([databaseCode]) => error.message.includes(databaseCode))?.[1]
    ?? 'INVALID_RESERVATION_STATE'
  return new CostLedgerError(code, 'El ledger editorial durable rechazó la operación')
}
