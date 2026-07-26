import { createHash } from 'node:crypto'
import type {
  ProviderCallReservation,
  ProviderCallReservationInput,
  ProviderCallSettlement,
} from '@shared/real-cost-contracts'
import { CostLedgerService } from './cost-ledger'
import type { ProviderFailureUsage } from './ports'
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
    private readonly durableResultAvailable: (operationId: string) => Promise<boolean> =
      async () => false,
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
    let attempt = (this.attempts.get(operationId) ?? 0) + 1
    let previous = this.previousReservations.get(operationId)
    this.attempts.set(operationId, attempt)
    let reservation = await this.ledger.reserve(this.metadata.create(
      operationId,
      attempt,
      estimatedCost,
      previous?.callId,
    ))
    this.previousReservations.set(operationId, reservation)
    while (['failed', 'cancelled'].includes(reservation.state)) {
      if (attempt >= 10) {
        throw new RealWorkflowError(
          'LIMIT_EXCEEDED',
          'La operación alcanzó el máximo de intentos durables',
        )
      }
      previous = reservation
      attempt += 1
      this.attempts.set(operationId, attempt)
      reservation = await this.ledger.reserve(this.metadata.create(
        operationId,
        attempt,
        estimatedCost,
        previous?.callId,
      ))
      this.previousReservations.set(operationId, reservation)
    }
    if (reservation.state === 'reconciled') {
      if (!await this.durableResultAvailable(operationId)) {
        throw new RealWorkflowError(
          'LIMIT_EXCEEDED',
          'La llamada conciliada no conserva un resultado durable reutilizable',
        )
      }
      const result = await operation()
      this.completed.set(operationId, structuredClone(result))
      this.spentCost += reservation.calculatedCost ?? 0
      return structuredClone(result)
    }
    if (reservation.state === 'started' && await this.durableResultAvailable(operationId)) {
      const result = await operation()
      const settlement = settlementFromResult(reservation.id, result, estimatedCost)
      await this.ledger.settle(settlement)
      this.completed.set(operationId, structuredClone(result))
      this.spentCost += settlement.calculatedCost
      return structuredClone(result)
    }
    if (reservation.state !== 'reserved') {
      throw new RealWorkflowError(
        reservation.state === 'unknown' ? 'BUDGET_EXCEEDED' : 'LIMIT_EXCEEDED',
        'La llamada durable previa requiere revisión humana y no se reintenta',
      )
    }
    await this.ledger.start(reservation.id)

    const execution = Promise.resolve().then(operation)
    this.running.set(operationId, execution)
    this.activeOperation = operationId
    let result: T
    try {
      result = await execution
    } catch (error) {
      const code = errorCode(error)
      const ambiguous = [
        'TIMEOUT',
        'NETWORK_AMBIGUOUS',
        'REMOTE_RESPONSE_ERROR',
        'REMOTE_INVALID_RESPONSE',
      ].includes(code)
      const cancelled = code === 'CANCELLED'
      const providerUsage = failureUsage(error)
      try {
        await this.ledger.settle({
          reservationId: reservation.id,
          outcome: ambiguous ? 'unknown' : cancelled ? 'cancelled' : 'failed',
          calculatedCost: ambiguous
            ? undefined
            : cancelled
              ? 0
              : providerUsage?.calculatedCost ?? 0,
          usage: {
            remoteId: providerUsage?.providerRequestIds[0],
            inputTokens: 0,
            outputTokens: 0,
            toolCalls: providerUsage?.toolCalls ?? 1,
            credits: providerUsage?.credits ?? 0,
          },
          sanitizedError: sanitizedProviderError(error, code),
        })
      } finally {
        this.running.delete(operationId)
        this.activeOperation = undefined
      }
      throw error
    }
    try {
      const settlement = settlementFromResult(reservation.id, result, estimatedCost)
      await this.ledger.settle(settlement)
      this.completed.set(operationId, structuredClone(result))
      this.spentCost += settlement.calculatedCost
      return structuredClone(result)
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

function failureUsage(error: unknown): ProviderFailureUsage | undefined {
  if (!error || typeof error !== 'object' || !('providerUsage' in error)) return undefined
  const usage = error.providerUsage
  if (!usage || typeof usage !== 'object') return undefined
  const providerRequestIds = 'providerRequestIds' in usage && Array.isArray(usage.providerRequestIds)
    ? usage.providerRequestIds.filter(value => typeof value === 'string')
    : []
  const credits = 'credits' in usage && typeof usage.credits === 'number'
    ? usage.credits
    : Number.NaN
  const calculatedCost = 'calculatedCost' in usage && typeof usage.calculatedCost === 'number'
    ? usage.calculatedCost
    : Number.NaN
  const toolCalls = 'toolCalls' in usage && typeof usage.toolCalls === 'number'
    ? usage.toolCalls
    : Number.NaN
  if (
    !Number.isFinite(credits)
    || credits < 0
    || !Number.isFinite(calculatedCost)
    || calculatedCost < 0
    || !Number.isInteger(toolCalls)
    || toolCalls < 0
  ) return undefined
  return { providerRequestIds, credits, calculatedCost, toolCalls }
}

function sanitizedProviderError(error: unknown, fallback: string): string {
  if (!isRecord(error) || !isRecord(error.remoteError)) return fallback
  const remote = error.remoteError
  const fields = [
    fallback,
    numericMetadata(remote.status, 'status'),
    textMetadata(remote.type, 'type'),
    textMetadata(remote.code, 'code'),
    textMetadata(remote.param, 'param'),
    textMetadata(remote.requestId, 'request_id'),
    textMetadata(remote.message, 'message'),
  ].filter((value): value is string => Boolean(value))
  return fields.join('|').slice(0, 500)
}

function numericMetadata(value: unknown, label: string): string | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${label}=${value}`
    : undefined
}

function textMetadata(value: unknown, label: string): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const sanitized = value
    .replace(/\b(?:sk|tvly)-[A-Za-z0-9_-]+\b/gi, '[redacted]')
    .replace(/\b(?:api[_ -]?key|authorization|bearer(?:\s+\S+)?)\b/gi, '[redacted]')
    .replace(/\|/g, ' ')
  const withoutControls = [...sanitized]
    .map(character => {
      const codePoint = character.charCodeAt(0)
      return codePoint < 32 || codePoint === 127 ? ' ' : character
    })
    .join('')
  const compact = withoutControls
    .replace(/\s+/g, ' ')
    .trim()
  return compact ? `${label}=${compact}` : undefined
}

function settlementFromResult<T>(
  reservationId: string,
  result: T,
  fallbackCost: number,
): ProviderCallSettlement & { calculatedCost: number } {
  const records = Array.isArray(result)
    ? result.filter(isRecord)
    : isRecord(result) ? [result] : []
  let inputTokens = 0
  let outputTokens = 0
  let calculatedCost = 0
  let credits = 0
  let toolCalls = 1
  let remoteId: string | undefined
  for (const record of records) {
    if (isRecord(record.usage)) {
      inputTokens += number(record.usage.inputTokens)
      outputTokens += number(record.usage.outputTokens)
      calculatedCost += number(record.usage.estimatedCost)
    }
    credits += number(record.credits)
    if (Array.isArray(record.providerRequestIds)) {
      const ids = record.providerRequestIds.filter(value => typeof value === 'string')
      toolCalls = Math.max(toolCalls, ids.length)
      remoteId ??= ids[0]
    }
  }
  if (credits > 0 && calculatedCost === 0) calculatedCost = credits * 0.008
  if (calculatedCost === 0) calculatedCost = fallbackCost
  return {
    reservationId,
    outcome: 'succeeded',
    calculatedCost,
    usage: {
      remoteId,
      inputTokens,
      outputTokens,
      toolCalls,
      credits,
      outputHash: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
