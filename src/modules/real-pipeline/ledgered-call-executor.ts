import type {
  ProviderCallReservation,
  ProviderCallReservationInput,
} from '@shared/real-cost-contracts'
import { CostLedgerService } from './cost-ledger'
import { RealWorkflowError, type WorkflowCallExecutor } from './real-workflow'

export interface LedgeredCallMetadataFactory {
  create(
    operationId: string,
    attempt: number,
    estimatedCost: number,
    retryOfCallId?: string,
  ): ProviderCallReservationInput
}

export class LedgeredWorkflowCallExecutor implements WorkflowCallExecutor {
  private readonly completed = new Map<string, unknown>()
  private readonly running = new Map<string, Promise<unknown>>()
  private readonly attempts = new Map<string, number>()
  private readonly previousReservations = new Map<string, ProviderCallReservation>()
  private spentCost = 0
  private activeOperation?: string

  constructor(
    private readonly ledger: CostLedgerService,
    private readonly metadata: LedgeredCallMetadataFactory,
    private readonly budgetLimit: number,
  ) {}

  async execute<T>(operationId: string, estimatedCost: number, operation: () => Promise<T>): Promise<T> {
    if (this.completed.has(operationId)) return structuredClone(this.completed.get(operationId)) as T
    const current = this.running.get(operationId)
    if (current) return structuredClone(await current) as T
    if (this.activeOperation && this.activeOperation !== operationId) {
      throw new RealWorkflowError('LIMIT_EXCEEDED', 'La concurrencia global está limitada a una operación')
    }
    if (!this.canReserve(estimatedCost)) {
      throw new RealWorkflowError('BUDGET_EXCEEDED', 'El presupuesto impide reservar la operación')
    }
    const attempt = (this.attempts.get(operationId) ?? 0) + 1
    this.attempts.set(operationId, attempt)
    const previous = this.previousReservations.get(operationId)
    const reservation = await this.ledger.reserve(this.metadata.create(
      operationId,
      attempt,
      estimatedCost,
      previous?.callId,
    ))
    this.previousReservations.set(operationId, reservation)
    await this.ledger.start(reservation.id)

    const execution = operation()
    this.running.set(operationId, execution)
    this.activeOperation = operationId
    try {
      const result = await execution
      await this.ledger.settle({
        reservationId: reservation.id,
        outcome: 'succeeded',
        calculatedCost: estimatedCost,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          toolCalls: 1,
          credits: 0,
        },
      })
      this.completed.set(operationId, structuredClone(result))
      this.spentCost += estimatedCost
      return structuredClone(result)
    } catch (error) {
      await this.ledger.settle({
        reservationId: reservation.id,
        outcome: 'failed',
        calculatedCost: 0,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          toolCalls: 1,
          credits: 0,
        },
        sanitizedError: errorCode(error),
      })
      throw error
    } finally {
      this.running.delete(operationId)
      this.activeOperation = undefined
    }
  }

  canReserve(estimatedCost: number): boolean {
    return this.spentCost + estimatedCost <= this.budgetLimit
  }

  canExecute(operationId: string, estimatedCost: number): boolean {
    return this.completed.has(operationId) || this.running.has(operationId) || this.canReserve(estimatedCost)
  }

  snapshot() {
    return { operationIds: [...this.completed.keys()], spentCost: this.spentCost }
  }
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return /^[A-Z0-9_]{1,120}$/.test(error.code) ? error.code : 'PROVIDER_OPERATION_FAILED'
  }
  return 'PROVIDER_OPERATION_FAILED'
}
