import { randomUUID } from 'node:crypto'
import {
  ProviderCallReservationInputSchema,
  ProviderCallSettlementSchema,
  RealBudgetLimitsSchema,
  type ProviderCallLedgerEntry,
  type ProviderCallReservation,
  type ProviderCallReservationInput,
  type ProviderCallSettlement,
  type RealBudgetLimits,
} from '@shared/real-cost-contracts'

export type CostLedgerErrorCode =
  | 'GLOBAL_GUARD_BUSY'
  | 'GLOBAL_GUARD_REQUIRED'
  | 'TASK_BUDGET_EXCEEDED'
  | 'BATCH_BUDGET_EXCEEDED'
  | 'DAILY_BUDGET_EXCEEDED'
  | 'RESERVATION_NOT_FOUND'
  | 'INVALID_RESERVATION_STATE'
  | 'ACTUAL_COST_EXCEEDS_RESERVATION'
  | 'AMBIGUOUS_TIMEOUT_NOT_RETRYABLE'
  | 'IDEMPOTENCY_CONFLICT'

export class CostLedgerError extends Error {
  constructor(readonly code: CostLedgerErrorCode, message: string) {
    super(message)
    this.name = 'CostLedgerError'
  }
}

export interface CostLedgerRepository {
  acquireGlobalGuard(executionId: string, leaseToken: string, expiresAt: string): Promise<boolean>
  releaseGlobalGuard(leaseToken: string): Promise<boolean>
  findByIdempotencyKey(idempotencyKey: string): Promise<ProviderCallReservation | undefined>
  findByCallId(callId: string): Promise<ProviderCallReservation | undefined>
  reserve(input: ProviderCallReservationInput): Promise<ProviderCallReservation>
  start(reservationId: string): Promise<ProviderCallReservation>
  settle(settlement: ProviderCallSettlement): Promise<ProviderCallReservation>
  entries(callId?: string): Promise<ProviderCallLedgerEntry[]>
}

export interface CostLedgerDependencies {
  now?: () => Date
  id?: () => string
}

export class CostLedgerService {
  private readonly now: () => Date

  constructor(
    private readonly repository: CostLedgerRepository,
    dependencies: CostLedgerDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date())
  }

  acquireExecution(executionId: string, leaseToken: string, expiresAt: Date): Promise<boolean> {
    if (expiresAt <= this.now()) {
      throw new CostLedgerError('GLOBAL_GUARD_BUSY', 'La guarda global requiere una vigencia futura')
    }
    return this.repository.acquireGlobalGuard(executionId, leaseToken, expiresAt.toISOString())
  }

  releaseExecution(leaseToken: string): Promise<boolean> {
    return this.repository.releaseGlobalGuard(leaseToken)
  }

  async reserve(candidate: unknown): Promise<ProviderCallReservation> {
    const input = ProviderCallReservationInputSchema.parse(candidate)
    const existing = await this.repository.findByIdempotencyKey(input.idempotencyKey)
    if (existing) {
      if (!sameReservationInput(existing.input, input)) {
        throw new CostLedgerError('IDEMPOTENCY_CONFLICT', 'La clave idempotente ya pertenece a otra reserva')
      }
      return existing
    }
    if (input.retryOfCallId) {
      const previous = await this.repository.findByCallId(input.retryOfCallId)
      if (previous?.state === 'unknown') {
        throw new CostLedgerError(
          'AMBIGUOUS_TIMEOUT_NOT_RETRYABLE',
          'Una llamada con facturación ambigua requiere revisión humana y no se reintenta',
        )
      }
    }
    return this.repository.reserve(input)
  }

  start(reservationId: string): Promise<ProviderCallReservation> {
    return this.repository.start(reservationId)
  }

  settle(candidate: unknown): Promise<ProviderCallReservation> {
    return this.repository.settle(ProviderCallSettlementSchema.parse(candidate))
  }
}

interface BudgetAccount {
  limit: number
  reserved: number
  spent: number
}

interface Guard {
  executionId: string
  leaseToken: string
  expiresAt: string
}

export class MemoryCostLedgerRepository implements CostLedgerRepository {
  private readonly budgets: Record<'task' | 'batch' | 'daily', BudgetAccount>
  private readonly reservations = new Map<string, ProviderCallReservation>()
  private readonly idempotency = new Map<string, string>()
  private readonly ledger: ProviderCallLedgerEntry[] = []
  private guard?: Guard

  constructor(
    limits: RealBudgetLimits,
    private readonly dependencies: Required<CostLedgerDependencies> = {
      now: () => new Date(),
      id: randomUUID,
    },
    initialUsage: Partial<Record<'task' | 'batch' | 'daily', Partial<Pick<BudgetAccount, 'reserved' | 'spent'>>>> = {},
  ) {
    RealBudgetLimitsSchema.parse(limits)
    this.budgets = {
      task: { limit: limits.task, reserved: initialUsage.task?.reserved ?? 0, spent: initialUsage.task?.spent ?? 0 },
      batch: { limit: limits.batch, reserved: initialUsage.batch?.reserved ?? 0, spent: initialUsage.batch?.spent ?? 0 },
      daily: { limit: limits.daily, reserved: initialUsage.daily?.reserved ?? 0, spent: initialUsage.daily?.spent ?? 0 },
    }
  }

  async acquireGlobalGuard(executionId: string, leaseToken: string, expiresAt: string): Promise<boolean> {
    const now = this.dependencies.now().toISOString()
    if (this.guard && this.guard.expiresAt > now && this.guard.leaseToken !== leaseToken) return false
    this.guard = { executionId, leaseToken, expiresAt }
    return true
  }

  async releaseGlobalGuard(leaseToken: string): Promise<boolean> {
    if (this.guard?.leaseToken !== leaseToken) return false
    this.guard = undefined
    return true
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<ProviderCallReservation | undefined> {
    const id = this.idempotency.get(idempotencyKey)
    return id ? this.cloneReservation(this.reservations.get(id)) : undefined
  }

  async findByCallId(callId: string): Promise<ProviderCallReservation | undefined> {
    return this.cloneReservation([...this.reservations.values()].find(item => item.callId === callId))
  }

  async reserve(input: ProviderCallReservationInput): Promise<ProviderCallReservation> {
    const existingId = this.idempotency.get(input.idempotencyKey)
    if (existingId) {
      return this.cloneReservation(this.reservations.get(existingId)) as ProviderCallReservation
    }
    const now = this.dependencies.now().toISOString()
    if (!this.guard || this.guard.expiresAt <= now || this.guard.executionId !== input.executionId) {
      throw new CostLedgerError('GLOBAL_GUARD_REQUIRED', 'La ejecución no posee la guarda global vigente')
    }
    this.assertBudget('task', input.estimatedCost, 'TASK_BUDGET_EXCEEDED')
    this.assertBudget('batch', input.estimatedCost, 'BATCH_BUDGET_EXCEEDED')
    this.assertBudget('daily', input.estimatedCost, 'DAILY_BUDGET_EXCEEDED')
    const reservation: ProviderCallReservation = {
      id: this.dependencies.id(),
      callId: this.dependencies.id(),
      input: structuredClone(input),
      state: 'reserved',
      reservedCost: input.estimatedCost,
      createdAt: now,
      updatedAt: now,
    }
    for (const budget of Object.values(this.budgets)) budget.reserved += input.estimatedCost
    this.reservations.set(reservation.id, reservation)
    this.idempotency.set(input.idempotencyKey, reservation.id)
    this.append(reservation, 'reserved')
    return this.cloneReservation(reservation) as ProviderCallReservation
  }

  async start(reservationId: string): Promise<ProviderCallReservation> {
    const reservation = this.requireReservation(reservationId)
    if (reservation.state !== 'reserved') {
      throw new CostLedgerError('INVALID_RESERVATION_STATE', 'La reserva ya no puede iniciar otra llamada')
    }
    reservation.state = 'started'
    reservation.updatedAt = this.dependencies.now().toISOString()
    this.append(reservation, 'started')
    return this.cloneReservation(reservation) as ProviderCallReservation
  }

  async settle(settlement: ProviderCallSettlement): Promise<ProviderCallReservation> {
    const reservation = this.requireReservation(settlement.reservationId)
    if (!['reserved', 'started'].includes(reservation.state)) {
      throw new CostLedgerError('INVALID_RESERVATION_STATE', 'La reserva ya tiene un resultado terminal')
    }
    if (settlement.outcome === 'unknown') {
      reservation.state = 'unknown'
      reservation.updatedAt = this.dependencies.now().toISOString()
      this.append(reservation, 'unknown', settlement)
      return this.cloneReservation(reservation) as ProviderCallReservation
    }
    const actualCost = settlement.calculatedCost ?? 0
    if (actualCost > reservation.reservedCost) {
      throw new CostLedgerError(
        'ACTUAL_COST_EXCEEDS_RESERVATION',
        'El coste calculado supera la reserva; la ejecución debe detenerse',
      )
    }
    for (const budget of Object.values(this.budgets)) {
      budget.reserved -= reservation.reservedCost
      budget.spent += actualCost
    }
    reservation.state = settlement.outcome === 'succeeded'
      ? 'reconciled'
      : settlement.outcome
    reservation.calculatedCost = actualCost
    reservation.updatedAt = this.dependencies.now().toISOString()
    this.append(reservation, settlement.outcome, settlement)
    return this.cloneReservation(reservation) as ProviderCallReservation
  }

  async entries(callId?: string): Promise<ProviderCallLedgerEntry[]> {
    return this.ledger
      .filter(entry => !callId || entry.callId === callId)
      .map(entry => structuredClone(entry))
  }

  budgetSnapshot(): Readonly<Record<'task' | 'batch' | 'daily', BudgetAccount>> {
    return structuredClone(this.budgets)
  }

  private assertBudget(
    scope: 'task' | 'batch' | 'daily',
    amount: number,
    code: 'TASK_BUDGET_EXCEEDED' | 'BATCH_BUDGET_EXCEEDED' | 'DAILY_BUDGET_EXCEEDED',
  ): void {
    const budget = this.budgets[scope]
    if (budget.spent + budget.reserved + amount > budget.limit) {
      throw new CostLedgerError(code, `El límite ${scope} detuvo la reserva`)
    }
  }

  private requireReservation(reservationId: string): ProviderCallReservation {
    const reservation = this.reservations.get(reservationId)
    if (!reservation) throw new CostLedgerError('RESERVATION_NOT_FOUND', 'La reserva solicitada no existe')
    return reservation
  }

  private append(
    reservation: ProviderCallReservation,
    state: ProviderCallLedgerEntry['state'],
    settlement?: ProviderCallSettlement,
  ): void {
    this.ledger.push(Object.freeze({
      sequence: this.ledger.filter(entry => entry.callId === reservation.callId).length + 1,
      callId: reservation.callId,
      reservationId: reservation.id,
      state,
      attempt: reservation.input.attempt,
      retryOfCallId: reservation.input.retryOfCallId,
      estimatedCost: reservation.input.estimatedCost,
      reservedCost: reservation.reservedCost,
      calculatedCost: settlement?.calculatedCost,
      currency: reservation.input.currency,
      remoteId: settlement?.usage.remoteId,
      inputTokens: settlement?.usage.inputTokens ?? 0,
      outputTokens: settlement?.usage.outputTokens ?? 0,
      toolCalls: settlement?.usage.toolCalls ?? 0,
      credits: settlement?.usage.credits ?? 0,
      sanitizedError: settlement?.sanitizedError,
      promptVersion: reservation.input.promptVersion,
      schemaVersion: reservation.input.schemaVersion,
      inputHash: reservation.input.inputHash,
      outputHash: settlement?.usage.outputHash,
      createdAt: this.dependencies.now().toISOString(),
    }))
  }

  private cloneReservation(value: ProviderCallReservation | undefined): ProviderCallReservation | undefined {
    return value ? structuredClone(value) : undefined
  }
}

function sameReservationInput(left: ProviderCallReservationInput, right: ProviderCallReservationInput): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
