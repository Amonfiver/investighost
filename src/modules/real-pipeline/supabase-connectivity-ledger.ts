import type { SupabaseClient } from '@supabase/supabase-js'
import {
  REAL_CONNECTIVITY_FX_POLICY,
  REAL_CONNECTIVITY_POLICY,
  type RealConnectivityAudit,
} from '@shared/real-connectivity-contracts'
import {
  REAL_CONNECTIVITY_TARIFF_IDS,
  type RealConnectivityLedgerPort,
  type RealConnectivityReservationInput,
  type RealConnectivitySettlementInput,
} from './real-connectivity-check'

export class SupabaseConnectivityLedgerError extends Error {
  readonly retryable = false

  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'SupabaseConnectivityLedgerError'
  }
}

export class SupabaseConnectivityLedger implements RealConnectivityLedgerPort {
  constructor(
    private readonly client: SupabaseClient,
    private readonly budgetDate: string,
  ) {}

  async inspect(): Promise<RealConnectivityAudit> {
    const [
      reservations,
      pending,
      taskBudget,
      guard,
    ] = await Promise.all([
      this.client
        .from('provider_call_reservations')
        .select('id', { head: true, count: 'exact' }),
      this.client
        .from('provider_call_reservations')
        .select('id', { head: true, count: 'exact' })
        .in('state', ['reserved', 'started', 'unknown']),
      this.client
        .from('real_task_budgets')
        .select('reserved_cost,spent_cost')
        .eq('task_id', 'connectivity-check-10d-task')
        .maybeSingle(),
      this.client
        .from('real_execution_guard')
        .select('owner_execution_id,expires_at')
        .eq('guard_name', 'global')
        .single(),
    ])
    for (const result of [reservations, pending, taskBudget, guard]) {
      if (result.error) throw ledgerError(result.error)
    }
    const reservedEur = Number(taskBudget.data?.reserved_cost ?? 0)
    const spentEur = Number(taskBudget.data?.spent_cost ?? 0)
    const guardExpired = guard.data?.expires_at
      ? new Date(guard.data.expires_at).getTime() <= Date.now()
      : false
    const providerCalls = reservations.count ?? 0
    return {
      providerCalls,
      reservations: reservations.count ?? 0,
      pendingReservations: pending.count ?? 0,
      reservedEur,
      spentEur,
      remainingEur: roundMoney(Math.max(
        0,
        REAL_CONNECTIVITY_POLICY.budgetEur - reservedEur - spentEur,
      )),
      guardFree: !guard.data?.owner_execution_id || guardExpired,
    }
  }

  async prepare(): Promise<void> {
    await this.insertOrVerifyTariff({
      id: REAL_CONNECTIVITY_TARIFF_IDS.tavily,
      provider_id: 'tavily',
      model: REAL_CONNECTIVITY_POLICY.tavily.model,
      operation: REAL_CONNECTIVITY_POLICY.tavily.operation,
      version: 1,
      currency: 'EUR',
      unit_scale: 1,
      input_unit_cost: 0,
      output_unit_cost: 0,
      tool_unit_cost: 0,
      credit_unit_cost: 0.008,
      effective_from: REAL_CONNECTIVITY_FX_POLICY.effectiveFrom,
      source_reference: tariffSource('https://docs.tavily.com/documentation/api-credits'),
    })
    await this.insertOrVerifyTariff({
      id: REAL_CONNECTIVITY_TARIFF_IDS.openai,
      provider_id: 'openai',
      model: REAL_CONNECTIVITY_POLICY.openai.model,
      operation: REAL_CONNECTIVITY_POLICY.openai.operation,
      version: 1,
      currency: 'EUR',
      unit_scale: 1_000_000,
      input_unit_cost: 1,
      output_unit_cost: 6,
      tool_unit_cost: 0,
      credit_unit_cost: 0,
      effective_from: REAL_CONNECTIVITY_FX_POLICY.effectiveFrom,
      source_reference: tariffSource('https://developers.openai.com/api/docs/models/gpt-5.6-luna'),
    })
    await this.insertOrVerifyBudget(
      'real_task_budgets',
      { task_id: 'connectivity-check-10d-task' },
      {
        task_id: 'connectivity-check-10d-task',
        request_id: 'connectivity-check-10d',
        currency: 'EUR',
        limit_cost: REAL_CONNECTIVITY_POLICY.budgetEur,
      },
    )
    await this.insertOrVerifyBudget(
      'real_batch_budgets',
      { batch_id: 'connectivity-check-10d-batch' },
      {
        batch_id: 'connectivity-check-10d-batch',
        currency: 'EUR',
        limit_cost: REAL_CONNECTIVITY_POLICY.budgetEur,
      },
    )
    await this.insertOrVerifyBudget(
      'real_daily_budgets',
      { budget_date: this.budgetDate, currency: 'EUR' },
      {
        budget_date: this.budgetDate,
        currency: 'EUR',
        limit_cost: REAL_CONNECTIVITY_POLICY.budgetEur,
      },
    )
  }

  async acquire(executionId: string, leaseToken: string, expiresAt: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('acquire_real_execution_guard', {
      p_execution_id: executionId,
      p_lease_token: leaseToken,
      p_expires_at: expiresAt,
    })
    if (error) throw ledgerError(error)
    return data === true
  }

  async release(leaseToken: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('release_real_execution_guard', {
      p_lease_token: leaseToken,
    })
    if (error) throw ledgerError(error)
    return data === true
  }

  async reserve(input: RealConnectivityReservationInput): Promise<string> {
    const { data, error } = await this.client.rpc('reserve_provider_call', {
      p_idempotency_key: input.idempotencyKey,
      p_execution_id: input.executionId,
      p_request_id: input.requestId,
      p_run_id: input.runId,
      p_task_id: input.taskId,
      p_batch_id: input.batchId,
      p_budget_date: input.budgetDate,
      p_stage: input.stage,
      p_operation: input.operation,
      p_provider_id: input.providerId,
      p_model: input.model,
      p_attempt: 1,
      p_retry_of_call_id: null,
      p_estimated_cost: input.estimatedCostEur,
      p_currency: 'EUR',
      p_tariff_id: input.tariffId,
      p_prompt_version: input.promptVersion,
      p_schema_version: input.schemaVersion,
      p_input_hash: input.inputHash,
    })
    if (error) throw ledgerError(error)
    if (typeof data !== 'string' || !data) {
      throw new SupabaseConnectivityLedgerError(
        'RESERVATION_NOT_CREATED',
        'Supabase no devolvió una reserva durable',
      )
    }
    return data
  }

  async start(reservationId: string): Promise<void> {
    const { data, error } = await this.client.rpc('start_provider_call', {
      p_reservation_id: reservationId,
    })
    if (error) throw ledgerError(error)
    if (data !== true) {
      throw new SupabaseConnectivityLedgerError(
        'RESERVATION_NOT_STARTED',
        'La reserva durable no pudo iniciarse',
      )
    }
  }

  async settle(input: RealConnectivitySettlementInput): Promise<void> {
    const { data, error } = await this.client.rpc('settle_provider_call', {
      p_reservation_id: input.reservationId,
      p_outcome: input.outcome,
      p_calculated_cost: input.calculatedCostEur ?? null,
      p_remote_id: input.remoteId ?? null,
      p_input_tokens: input.inputTokens,
      p_output_tokens: input.outputTokens,
      p_tool_calls: input.tools.length,
      p_tools: input.tools,
      p_credits: input.credits,
      p_sanitized_error: input.sanitizedError ?? null,
      p_output_hash: input.outputHash ?? null,
    })
    if (error) throw ledgerError(error)
    if (data !== true) {
      throw new SupabaseConnectivityLedgerError(
        'RESERVATION_NOT_RECONCILED',
        'La reserva durable no pudo conciliarse',
      )
    }
  }

  private async insertOrVerifyTariff(candidate: Record<string, unknown>): Promise<void> {
    const { error } = await this.client.from('provider_tariffs').insert(candidate)
    if (!error) return
    if (error.code !== '23505') throw ledgerError(error)
    const { data, error: readError } = await this.client
      .from('provider_tariffs')
      .select('id,provider_id,model,operation,version,currency,unit_scale,input_unit_cost,output_unit_cost,tool_unit_cost,credit_unit_cost,effective_from,source_reference')
      .eq('id', candidate.id)
      .single()
    if (readError) throw ledgerError(readError)
    const stored = data as Record<string, unknown>
    for (const [field, expected] of Object.entries(candidate)) {
      if (!sameDatabaseValue(stored[field], expected)) {
        throw new SupabaseConnectivityLedgerError(
          'TARIFF_CONFLICT',
          'La tarifa durable existente no coincide con la política autorizada',
        )
      }
    }
  }

  private async insertOrVerifyBudget(
    table: 'real_task_budgets' | 'real_batch_budgets' | 'real_daily_budgets',
    identity: Record<string, string>,
    candidate: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.client.from(table).insert(candidate)
    if (!error) return
    if (error.code !== '23505') throw ledgerError(error)
    let query = this.client.from(table).select('*')
    for (const [field, value] of Object.entries(identity)) query = query.eq(field, value)
    const { data, error: readError } = await query.single()
    if (readError) throw ledgerError(readError)
    for (const [field, expected] of Object.entries(candidate)) {
      if (!sameDatabaseValue(data[field], expected)) {
        throw new SupabaseConnectivityLedgerError(
          'BUDGET_CONFLICT',
          'El presupuesto durable existente no coincide con la autorización',
        )
      }
    }
    if (Number(data.reserved_cost) !== 0 || Number(data.spent_cost) !== 0) {
      throw new SupabaseConnectivityLedgerError(
        'SECOND_ATTEMPT_BLOCKED',
        'El presupuesto durable ya registra actividad',
      )
    }
  }
}

function tariffSource(url: string): string {
  return `${url}; ${REAL_CONNECTIVITY_FX_POLICY.version}; ${REAL_CONNECTIVITY_FX_POLICY.source}; revisión ${REAL_CONNECTIVITY_FX_POLICY.reviewedAt}`
}

function ledgerError(error: { message: string; code?: string | null }): SupabaseConnectivityLedgerError {
  const knownCodes = [
    'IDEMPOTENCY_CONFLICT',
    'REAL_TASK_BUDGET_EXCEEDED',
    'REAL_BATCH_BUDGET_EXCEEDED',
    'REAL_DAILY_BUDGET_EXCEEDED',
    'REAL_GLOBAL_GUARD_REQUIRED',
    'REAL_RESERVATION_ALREADY_STARTED',
    'REAL_COST_EXCEEDS_RESERVATION',
  ]
  const matched = knownCodes.find(code => error.message.includes(code))
  const normalized = matched?.replace(/^REAL_/, '') ?? 'DURABLE_LEDGER_ERROR'
  return new SupabaseConnectivityLedgerError(
    normalized,
    'El ledger durable rechazó la operación de conectividad',
  )
}

function sameDatabaseValue(actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'number') return Number(actual) === expected
  if (typeof expected === 'string' && /T/.test(expected) && !Number.isNaN(Date.parse(expected))) {
    return new Date(String(actual)).getTime() === new Date(expected).getTime()
  }
  return actual === expected
}

function roundMoney(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000
}
