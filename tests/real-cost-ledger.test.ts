import { describe, expect, it } from 'vitest'
import {
  CostLedgerError,
  CostLedgerService,
  MemoryCostLedgerRepository,
  type CostLedgerDependencies,
} from '@modules/real-pipeline/cost-ledger'
import { ProviderCallSettlementSchema } from '@shared/real-cost-contracts'

const inputHash = 'a'.repeat(64)
const outputHash = 'b'.repeat(64)
const limits = { task: 0.2, batch: 0.5, daily: 1, currency: 'EUR' }

function harness(
  customLimits = limits,
  initialUsage: ConstructorParameters<typeof MemoryCostLedgerRepository>[2] = {},
) {
  let sequence = 0
  const dependencies: Required<CostLedgerDependencies> = {
    now: () => new Date('2026-07-25T10:30:00.000Z'),
    id: () => `generated-${++sequence}`,
  }
  const repository = new MemoryCostLedgerRepository(customLimits, dependencies, initialUsage)
  const ledger = new CostLedgerService(repository, dependencies)
  return { ledger, repository }
}

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: 'call-morella-round-1',
    executionId: 'execution-morella',
    requestId: 'request-morella',
    runId: 'run-morella',
    taskId: 'task-morella',
    batchId: 'batch-pilot',
    stage: 'researching_round_1',
    operation: 'search',
    providerId: 'tavily',
    model: 'search-and-extract',
    attempt: 1,
    estimatedCost: 0.08,
    currency: 'EUR',
    tariffId: 'tariff-synthetic-v1',
    promptVersion: 'mission-v1',
    schemaVersion: 'real-v1',
    inputHash,
    ...overrides,
  }
}

function usage() {
  return {
    remoteId: 'synthetic-remote-id',
    inputTokens: 0,
    outputTokens: 0,
    toolCalls: 1,
    credits: 1,
    outputHash,
  }
}

async function guarded(
  customLimits = limits,
  initialUsage: ConstructorParameters<typeof MemoryCostLedgerRepository>[2] = {},
) {
  const context = harness(customLimits, initialUsage)
  expect(await context.ledger.acquireExecution(
    'execution-morella',
    'lease-one',
    new Date('2026-07-25T10:35:00.000Z'),
  )).toBe(true)
  return context
}

describe('ledger y cortafuegos de gasto real', () => {
  it('reserva antes de la llamada y refleja el importe en los tres presupuestos', async () => {
    const { ledger, repository } = await guarded()
    const result = await ledger.reserve(reservation())

    expect(result.state).toBe('reserved')
    expect(repository.budgetSnapshot()).toEqual({
      task: { limit: 0.2, reserved: 0.08, spent: 0 },
      batch: { limit: 0.5, reserved: 0.08, spent: 0 },
      daily: { limit: 1, reserved: 0.08, spent: 0 },
    })
    expect((await repository.entries(result.callId)).map(entry => entry.state)).toEqual(['reserved'])
  })

  it('inicia y concilia una llamada liberando el sobrante de la reserva', async () => {
    const { ledger, repository } = await guarded()
    const reserved = await ledger.reserve(reservation())
    await ledger.start(reserved.id)
    const reconciled = await ledger.settle({
      reservationId: reserved.id,
      outcome: 'succeeded',
      calculatedCost: 0.05,
      usage: usage(),
    })

    expect(reconciled).toMatchObject({ state: 'reconciled', calculatedCost: 0.05 })
    expect(repository.budgetSnapshot().task).toEqual({ limit: 0.2, reserved: 0, spent: 0.05 })
    expect((await repository.entries(reserved.callId)).map(entry => entry.state)).toEqual([
      'reserved', 'started', 'succeeded',
    ])
  })

  it.each([
    ['failed', 0.01],
    ['cancelled', 0],
  ] as const)('cierra el resultado %s y libera la reserva', async (outcome, calculatedCost) => {
    const { ledger, repository } = await guarded()
    const reserved = await ledger.reserve(reservation())
    const result = await ledger.settle({
      reservationId: reserved.id,
      outcome,
      calculatedCost,
      usage: usage(),
      sanitizedError: outcome === 'failed' ? 'PROVIDER_5XX' : undefined,
    })

    expect(result.state).toBe(outcome)
    expect(repository.budgetSnapshot().task).toEqual({ limit: 0.2, reserved: 0, spent: calculatedCost })
  })

  it('conserva la reserva ante resultado desconocido y prohíbe su reintento', async () => {
    const { ledger, repository } = await guarded()
    const reserved = await ledger.reserve(reservation())
    const unknown = await ledger.settle({
      reservationId: reserved.id,
      outcome: 'unknown',
      usage: usage(),
      sanitizedError: 'AMBIGUOUS_TIMEOUT',
    })

    expect(unknown.state).toBe('unknown')
    expect(repository.budgetSnapshot().task.reserved).toBe(0.08)
    await expect(ledger.reserve(reservation({
      idempotencyKey: 'retry-after-ambiguous',
      retryOfCallId: reserved.callId,
      attempt: 2,
    }))).rejects.toMatchObject({ code: 'AMBIGUOUS_TIMEOUT_NOT_RETRYABLE' })
  })

  it('devuelve la misma reserva idempotente sin duplicar gasto', async () => {
    const { ledger, repository } = await guarded()
    const [first, second] = await Promise.all([
      ledger.reserve(reservation()),
      ledger.reserve(reservation()),
    ])

    expect(first.id).toBe(second.id)
    expect(repository.budgetSnapshot().task.reserved).toBe(0.08)
    expect(await repository.entries()).toHaveLength(1)
  })

  it.each([
    ['execution', { executionId: 'execution-other' }],
    ['request', { requestId: 'request-other' }],
    ['run', { runId: 'run-other' }],
    ['task', { taskId: 'task-other' }],
    ['batch', { batchId: 'batch-other' }],
    ['provider', { providerId: 'openai' }],
    ['model', { model: 'model-other' }],
    ['stage', { stage: 'analyzing_round_1' }],
    ['operation', { operation: 'extract' }],
    ['attempt', { attempt: 2 }],
    ['retry origin', { retryOfCallId: 'call-previous' }],
    ['estimated and maximum reserved cost', { estimatedCost: 0.07 }],
    ['currency and tariff', { currency: 'USD', tariffId: 'tariff-synthetic-usd-v1' }],
    ['tariff version', { tariffId: 'tariff-synthetic-v2' }],
    ['prompt version', { promptVersion: 'mission-v2' }],
    ['schema version', { schemaVersion: 'real-v2' }],
    ['canonical payload and limits hash', { inputHash: 'c'.repeat(64) }],
  ])('rechaza una colisión idempotente por %s sin alterar reserva, presupuesto o ledger', async (_field, patch) => {
    const { ledger, repository } = await guarded()
    const original = await ledger.reserve(reservation())

    await expect(ledger.reserve(reservation(patch))).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      retryable: false,
    })

    expect(repository.budgetSnapshot().task).toEqual({ limit: 0.2, reserved: 0.08, spent: 0 })
    expect(await repository.entries()).toHaveLength(1)
    expect(await repository.findByIdempotencyKey('call-morella-round-1')).toEqual(original)
  })

  it('resuelve una carrera conflictiva con un único ganador y error tipado no reintentable', async () => {
    const { ledger, repository } = await guarded()
    const results = await Promise.allSettled([
      ledger.reserve(reservation({ providerId: 'tavily' })),
      ledger.reserve(reservation({ providerId: 'openai' })),
    ])
    const fulfilled = results.filter(result => result.status === 'fulfilled')
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toBeInstanceOf(CostLedgerError)
    expect(rejected[0].reason).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      retryable: false,
      message: 'La clave idempotente ya pertenece a otra reserva',
    })
    expect(rejected[0].reason.message).not.toMatch(/tavily|openai|request|task|hash/i)
    expect(repository.budgetSnapshot().task.reserved).toBe(0.08)
    expect(await repository.entries()).toHaveLength(1)
  })

  it('permite una sola ejecución global vigente', async () => {
    const { ledger } = harness()
    expect(await ledger.acquireExecution(
      'execution-one',
      'lease-one',
      new Date('2026-07-25T10:35:00.000Z'),
    )).toBe(true)
    expect(await ledger.acquireExecution(
      'execution-two',
      'lease-two',
      new Date('2026-07-25T10:35:00.000Z'),
    )).toBe(false)
    expect(await ledger.releaseExecution('lease-one')).toBe(true)
  })

  it('detiene en el primer límite: tarea antes que lote y día', async () => {
    const { ledger } = await guarded({ task: 0.05, batch: 0.1, daily: 0.2, currency: 'EUR' })
    await expect(ledger.reserve(reservation({ estimatedCost: 0.08 }))).rejects.toMatchObject({
      code: 'TASK_BUDGET_EXCEEDED',
    })
  })

  it('aplica el límite diario cuando tarea y lote aún admiten la reserva', async () => {
    const { ledger } = await guarded(
      { task: 0.2, batch: 0.5, daily: 1, currency: 'EUR' },
      { daily: { spent: 0.95 } },
    )
    await expect(ledger.reserve(reservation({ estimatedCost: 0.08 }))).rejects.toMatchObject({
      code: 'DAILY_BUDGET_EXCEEDED',
    })
  })

  it('detiene si el coste real supera la reserva', async () => {
    const { ledger } = await guarded()
    const reserved = await ledger.reserve(reservation())
    await expect(ledger.settle({
      reservationId: reserved.id,
      outcome: 'succeeded',
      calculatedCost: 0.09,
      usage: usage(),
    })).rejects.toMatchObject({ code: 'ACTUAL_COST_EXCEEDS_RESERVATION' })
  })

  it('mantiene el ledger append-only ante mutaciones de una lectura', async () => {
    const { ledger, repository } = await guarded()
    const reserved = await ledger.reserve(reservation())
    const snapshot = await repository.entries(reserved.callId)
    snapshot[0].state = 'failed'

    expect((await repository.entries(reserved.callId))[0].state).toBe('reserved')
  })

  it('rechaza errores que puedan contener secretos', () => {
    expect(ProviderCallSettlementSchema.safeParse({
      reservationId: 'reservation',
      outcome: 'failed',
      calculatedCost: 0,
      usage: usage(),
      sanitizedError: 'Authorization: Bearer secret-value',
    }).success).toBe(false)
  })
})
