import { describe, expect, it, vi } from 'vitest'
import {
  CostLedgerService,
  LedgeredWorkflowCallExecutor,
  MemoryCostLedgerRepository,
  OpenAIIntelligenceError,
  RealEditorialProviderPersistenceError,
  TavilyResearchError,
  type LedgeredCallMetadataFactory,
} from '@modules/real-pipeline'

const now = '2026-07-25T22:00:00.000Z'
const operationId = 'task-morella:round:1:research'

function metadata(): LedgeredCallMetadataFactory {
  return {
    create(targetOperationId, attempt, estimatedCost, retryOfCallId) {
      const research = targetOperationId.endsWith(':research')
      const costAdjustment = targetOperationId.endsWith(':cost-adjustment')
      return {
        idempotencyKey: `${targetOperationId}:attempt:${attempt}`,
        executionId: 'real-editorial:run-morella',
        requestId: 'pilot-morella',
        runId: 'run-morella',
        taskId: 'task-morella',
        batchId: 'batch-morella',
        stage: research ? '1_research' : costAdjustment ? 'analysis_cost_adjustment' : '1_analysis',
        operation: research ? 'research' : costAdjustment ? 'cost_adjustment' : 'analysis',
        providerId: research ? 'tavily' : 'openai',
        model: research ? 'search-and-extract' : 'gpt-5.6-luna',
        attempt,
        retryOfCallId,
        estimatedCost,
        currency: 'EUR',
        tariffId: research ? 'morella-v1-tavily-search' : 'morella-v1-openai-responses',
        promptVersion: 'morella-real-editorial-v1',
        schemaVersion: 'real-editorial-snapshot-v1',
        inputHash: 'a'.repeat(64),
      }
    },
  }
}

describe('conciliación de fallos facturables y reanudación idempotente', () => {
  it('clasifica una respuesta recibida con fallo de persistencia como éxito remoto', async () => {
    let sequence = 0
    const repository = new MemoryCostLedgerRepository(
      { task: 0.2, batch: 0.2, daily: 0.2, currency: 'EUR' },
      {
        now: () => new Date(now),
        id: () => `persistence-ledger-id-${++sequence}`,
      },
    )
    const ledger = new CostLedgerService(repository, { now: () => new Date(now) })
    await ledger.acquireExecution(
      'real-editorial:run-morella',
      'lease-persistence',
      new Date('2026-07-26T00:00:00.000Z'),
    )
    const analysis = {
      masterKnowledge: { generatedAt: now },
      coverage: {},
      proposedQueries: [],
      gaps: [],
      decision: {},
      usage: {
        inputTokens: 120,
        outputTokens: 30,
        estimatedCost: 0.002,
        currency: 'EUR' as const,
        providerRequestIds: ['resp-persisted-before-artifacts'],
      },
    }
    const operation = vi.fn(async () => {
      throw new RealEditorialProviderPersistenceError(
        'Respuesta recibida; persistencia derivada fallida',
        analysis as never,
        new Error('PERSISTENCE_ERROR'),
      )
    })

    await expect(new LedgeredWorkflowCallExecutor(
      ledger,
      metadata(),
      0.2,
    ).execute('task-morella:round:1:analysis', 0.022, operation))
      .rejects.toMatchObject({ code: 'PERSISTENCE_ERROR' })

    const terminal = (await repository.entries()).at(-1)
    expect(terminal).toMatchObject({
      state: 'succeeded',
      remoteId: 'resp-persisted-before-artifacts',
      inputTokens: 120,
      outputTokens: 30,
      calculatedCost: 0.002,
      sanitizedError: 'PERSISTENCE_ERROR',
    })
    expect(repository.budgetSnapshot().task).toMatchObject({ reserved: 0, spent: 0.002 })
  })
  it('libera la reserva, concilia créditos conocidos y reintenta una sola vez con attempt 2', async () => {
    let sequence = 0
    const repository = new MemoryCostLedgerRepository(
      { task: 0.2, batch: 0.2, daily: 0.2, currency: 'EUR' },
      {
        now: () => new Date(now),
        id: () => `ledger-id-${++sequence}`,
      },
    )
    const ledger = new CostLedgerService(repository, { now: () => new Date(now) })
    await ledger.acquireExecution(
      'real-editorial:run-morella',
      'lease-morella',
      new Date('2026-07-26T00:00:00.000Z'),
    )
    const firstProviderCall = vi.fn(async () => {
      throw new TavilyResearchError(
        'NO_VALID_HTTPS_SOURCES',
        'Tavily no devolvió ninguna URL HTTPS absoluta y válida',
        {
          providerRequestIds: ['remote-request-sanitized'],
          credits: 1,
          calculatedCost: 0.008,
          toolCalls: 1,
        },
        {
          totalReceived: 1,
          accepted: 0,
          discarded: 1,
          discardReasons: { http: 1 },
        },
      )
    })
    const firstExecutor = new LedgeredWorkflowCallExecutor(ledger, metadata(), 0.2)

    await expect(firstExecutor.execute(operationId, 0.048, firstProviderCall))
      .rejects.toMatchObject({ code: 'NO_VALID_HTTPS_SOURCES' })
    expect(firstProviderCall).toHaveBeenCalledTimes(1)
    expect(repository.budgetSnapshot().task).toMatchObject({
      reserved: 0,
      spent: 0.008,
    })
    const failed = (await repository.entries()).find(entry => entry.state === 'failed')
    expect(failed).toMatchObject({
      attempt: 1,
      credits: 1,
      calculatedCost: 0.008,
      toolCalls: 1,
      sanitizedError: 'NO_VALID_HTTPS_SOURCES',
    })

    const resumedProviderCall = vi.fn(async () => ({
      providerRequestIds: ['resumed-request-sanitized'],
      credits: 1,
    }))
    const resumedExecutor = new LedgeredWorkflowCallExecutor(ledger, metadata(), 0.2)
    await resumedExecutor.execute(operationId, 0.048, resumedProviderCall)

    expect(resumedProviderCall).toHaveBeenCalledTimes(1)
    expect(repository.budgetSnapshot().task).toMatchObject({
      reserved: 0,
      spent: 0.016,
    })
    const entries = await repository.entries()
    const retry = entries.find(
      entry => entry.retryOfCallId === failed?.callId && entry.state === 'succeeded',
    )
    expect(retry).toMatchObject({
      attempt: 2,
      state: 'succeeded',
      credits: 1,
      calculatedCost: 0.008,
    })
    expect(new Set(entries.map(entry => entry.reservationId)).size).toBe(2)

    const durableResult = {
      providerRequestIds: ['resumed-request-sanitized'],
      credits: 1,
    }
    const durableReader = vi.fn(async () => durableResult)
    const restartedExecutor = new LedgeredWorkflowCallExecutor(
      ledger,
      metadata(),
      0.2,
      async targetOperationId => targetOperationId === operationId,
    )
    await expect(restartedExecutor.execute(operationId, 0.048, durableReader))
      .resolves.toEqual(durableResult)
    expect(durableReader).toHaveBeenCalledOnce()
    expect(await repository.findByIdempotencyKey(`${operationId}:attempt:3`)).toBeUndefined()
    expect(new Set((await repository.entries()).map(entry => entry.reservationId)).size).toBe(2)
  })

  it('mantiene una red ambigua sin conciliación ni reintento automático', async () => {
    let sequence = 0
    const repository = new MemoryCostLedgerRepository(
      { task: 0.2, batch: 0.2, daily: 0.2, currency: 'EUR' },
      {
        now: () => new Date(now),
        id: () => `ambiguous-ledger-id-${++sequence}`,
      },
    )
    const ledger = new CostLedgerService(repository, { now: () => new Date(now) })
    await ledger.acquireExecution(
      'real-editorial:run-morella',
      'lease-morella-ambiguous',
      new Date('2026-07-26T00:00:00.000Z'),
    )
    const firstProviderCall = vi.fn(async () => {
      throw { code: 'NETWORK_AMBIGUOUS' }
    })

    await expect(new LedgeredWorkflowCallExecutor(
      ledger,
      metadata(),
      0.2,
    ).execute(operationId, 0.048, firstProviderCall))
      .rejects.toMatchObject({ code: 'NETWORK_AMBIGUOUS' })

    expect(repository.budgetSnapshot().task).toMatchObject({
      reserved: 0.048,
      spent: 0,
    })
    expect(await repository.findByIdempotencyKey(`${operationId}:attempt:1`))
      .toMatchObject({ state: 'unknown' })

    const repeatedProviderCall = vi.fn()
    await expect(new LedgeredWorkflowCallExecutor(
      ledger,
      metadata(),
      0.2,
    ).execute(operationId, 0.048, repeatedProviderCall))
      .rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' })
    expect(repeatedProviderCall).not.toHaveBeenCalled()
    expect(await repository.findByIdempotencyKey(`${operationId}:attempt:2`)).toBeUndefined()
  })

  it('libera una cancelación confirmada y crea un único intento nuevo sin coste duplicado', async () => {
    let sequence = 0
    const repository = new MemoryCostLedgerRepository(
      { task: 0.2, batch: 0.2, daily: 0.2, currency: 'EUR' },
      {
        now: () => new Date(now),
        id: () => `confirmed-cancellation-ledger-id-${++sequence}`,
      },
    )
    const ledger = new CostLedgerService(repository, { now: () => new Date(now) })
    await ledger.acquireExecution(
      'real-editorial:run-morella',
      'lease-morella-confirmed-cancellation',
      new Date('2026-07-26T00:00:00.000Z'),
    )
    const cancelledCall = vi.fn(async () => {
      throw new TavilyResearchError(
        'TIMEOUT_CANCELLED',
        'El transporte confirmó la cancelación',
        undefined,
        undefined,
        {
          providerOutcome: 'cancelled_confirmed',
          correlationId: 'b'.repeat(64),
          stage: 'round-2:search:1',
          query: 'Morella patrimonio oficial',
          timeoutMs: 60_000,
          retrySafe: true,
          detail: 'Cancelación remota confirmada.',
        },
      )
    })

    await expect(new LedgeredWorkflowCallExecutor(
      ledger,
      metadata(),
      0.2,
    ).execute(operationId, 0.048, cancelledCall))
      .rejects.toMatchObject({ code: 'TIMEOUT_CANCELLED' })

    expect(repository.budgetSnapshot().task).toMatchObject({
      reserved: 0,
      spent: 0,
    })
    const cancelled = await repository.findByIdempotencyKey(`${operationId}:attempt:1`)
    expect(cancelled).toMatchObject({
      state: 'cancelled',
      calculatedCost: 0,
    })

    const resumedCall = vi.fn(async context => {
      expect(context).toMatchObject({
        operationId,
        attempt: 2,
      })
      return {
        providerRequestIds: ['cached-search', 'new-extract'],
        billableProviderRequestIds: ['new-extract'],
        credits: 3,
        billableCredits: 2,
      }
    })
    await new LedgeredWorkflowCallExecutor(
      ledger,
      metadata(),
      0.2,
    ).execute(operationId, 0.048, resumedCall)

    expect(resumedCall).toHaveBeenCalledOnce()
    expect(repository.budgetSnapshot().task).toMatchObject({
      reserved: 0,
      spent: 0.016,
    })
    const resumed = await repository.findByIdempotencyKey(`${operationId}:attempt:2`)
    expect(resumed).toMatchObject({
      state: 'reconciled',
      calculatedCost: 0.016,
      input: { retryOfCallId: cancelled?.callId },
    })
    expect((await repository.entries(resumed?.callId)).at(-1)).toMatchObject({
      state: 'succeeded',
      calculatedCost: 0.016,
      credits: 2,
      toolCalls: 1,
    })
    expect(await repository.findByIdempotencyKey(`${operationId}:attempt:3`)).toBeUndefined()
  })

  it('enlaza attempt 3 tras dos fallos terminales y protege una doble reanudación', async () => {
    let sequence = 0
    const repository = new MemoryCostLedgerRepository(
      { task: 0.2, batch: 0.2, daily: 0.2, currency: 'EUR' },
      {
        now: () => new Date(now),
        id: () => `openai-ledger-id-${++sequence}`,
      },
    )
    const ledger = new CostLedgerService(repository, { now: () => new Date(now) })
    await ledger.acquireExecution(
      'real-editorial:run-morella',
      'lease-openai',
      new Date('2026-07-26T00:00:00.000Z'),
    )
    const analysisOperation = 'task-morella:round:1:analysis'
    const remoteFailure = () => new OpenAIIntelligenceError(
      'REMOTE_HTTP_ERROR',
      'OpenAI rechazó la petición',
      {
        providerRequestIds: ['req_schema_synthetic'],
        credits: 0,
        calculatedCost: 0,
        toolCalls: 1,
      },
      {
        status: 400,
        type: 'invalid_request_error',
        code: 'invalid_json_schema',
        param: 'text.format.schema',
        requestId: 'req_schema_synthetic',
        message: 'Invalid schema.',
      },
    )

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const call = vi.fn(async () => {
        throw remoteFailure()
      })
      await expect(new LedgeredWorkflowCallExecutor(
        ledger,
        metadata(),
        0.2,
      ).execute(analysisOperation, 0.022, call))
        .rejects.toMatchObject({ code: 'REMOTE_HTTP_ERROR' })
      expect(call).toHaveBeenCalledOnce()
    }

    const successfulCall = vi.fn(async () => ({
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        estimatedCost: 0.001,
      },
      providerRequestIds: ['resp_success_synthetic'],
    }))
    await new LedgeredWorkflowCallExecutor(
      ledger,
      metadata(),
      0.2,
    ).execute(analysisOperation, 0.022, successfulCall)
    expect(successfulCall).toHaveBeenCalledOnce()

    const entries = await repository.entries()
    const terminal = entries.filter(entry =>
      ['failed', 'succeeded'].includes(entry.state))
    expect(terminal.map(entry => ({
      attempt: entry.attempt,
      state: entry.state,
      retryOfCallId: entry.retryOfCallId,
    }))).toEqual([
      { attempt: 1, state: 'failed', retryOfCallId: undefined },
      {
        attempt: 2,
        state: 'failed',
        retryOfCallId: terminal[0].callId,
      },
      {
        attempt: 3,
        state: 'succeeded',
        retryOfCallId: terminal[1].callId,
      },
    ])
    expect(terminal[1].sanitizedError).toContain('status=400')
    expect(terminal[1].sanitizedError).toContain('code=invalid_json_schema')
    expect(terminal[1].sanitizedError).toContain('param=text.format.schema')
    expect(repository.budgetSnapshot().task).toMatchObject({
      reserved: 0,
      spent: 0.001,
    })

    const durableReader = vi.fn(async () => ({
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        estimatedCost: 0.001,
      },
      providerRequestIds: ['resp_success_synthetic'],
    }))
    await new LedgeredWorkflowCallExecutor(
      ledger,
      metadata(),
      0.2,
      async target => target === analysisOperation,
    ).execute(analysisOperation, 0.022, durableReader)

    expect(durableReader).toHaveBeenCalledOnce()
    expect(await repository.findByIdempotencyKey(`${analysisOperation}:attempt:4`))
      .toBeUndefined()
    expect(repository.budgetSnapshot().task).toMatchObject({
      reserved: 0,
      spent: 0.001,
    })
  })

  it('concilia de forma append-only un coste real superior a la reserva sin repetir proveedor', async () => {
    let sequence = 0
    const analysisOperation = 'task-morella:round:1:analysis'
    const repository = new MemoryCostLedgerRepository(
      { task: 0.2, batch: 0.2, daily: 0.2, currency: 'EUR' },
      {
        now: () => new Date(now),
        id: () => `cost-adjustment-ledger-id-${++sequence}`,
      },
      {
        task: { spent: 0.05 },
        batch: { spent: 0.05 },
        daily: { spent: 0.05 },
      },
    )
    const ledger = new CostLedgerService(repository, { now: () => new Date(now) })
    await ledger.acquireExecution(
      'real-editorial:run-morella',
      'lease-cost-adjustment',
      new Date('2026-07-26T00:00:00.000Z'),
    )
    const historical = await ledger.reserve(metadata().create(
      analysisOperation,
      1,
      0.022,
    ))
    await ledger.start(historical.id)
    const durableAnalysis = {
      usage: {
        inputTokens: 26_942,
        outputTokens: 3_816,
        estimatedCost: 0.049838,
      },
    }
    const durableReader = vi.fn(async () => durableAnalysis)
    const resumed = new LedgeredWorkflowCallExecutor(
      ledger,
      metadata(),
      0.2,
      async target => target === analysisOperation,
      0.05,
    )

    await expect(resumed.execute(analysisOperation, 0.022, durableReader))
      .resolves.toEqual(durableAnalysis)

    expect(durableReader).toHaveBeenCalledOnce()
    expect(resumed.snapshot().spentCost).toBeCloseTo(0.099838, 9)
    expect(resumed.canReserve(0.100162)).toBe(true)
    expect(resumed.canReserve(0.100163)).toBe(false)
    expect(repository.budgetSnapshot().task).toMatchObject({ reserved: 0, limit: 0.2 })
    expect(repository.budgetSnapshot().task.spent).toBeCloseTo(0.099838, 9)
    expect(await repository.findByIdempotencyKey(`${analysisOperation}:attempt:1`))
      .toMatchObject({
        state: 'reconciled',
        calculatedCost: 0.022,
      })
    const adjustmentKey = `${analysisOperation}:cost-adjustment:attempt:1`
    const adjustment = await repository.findByIdempotencyKey(adjustmentKey)
    expect(adjustment).toMatchObject({
      state: 'reconciled',
      calculatedCost: 0.027838,
      input: {
        operation: 'cost_adjustment',
        retryOfCallId: historical.callId,
      },
    })
    const adjustmentEntries = await repository.entries(adjustment?.callId)
    expect(adjustmentEntries.at(-1)).toMatchObject({
      state: 'succeeded',
      toolCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      sanitizedError: 'ACTUAL_COST_DURABLE_ADJUSTMENT',
    })

    const duplicateReader = vi.fn(async () => durableAnalysis)
    const duplicated = new LedgeredWorkflowCallExecutor(
      ledger,
      metadata(),
      0.2,
      async target => target === analysisOperation,
      0.099838,
    )
    const entryCount = (await repository.entries()).length
    await duplicated.execute(analysisOperation, 0.022, duplicateReader)
    expect(duplicateReader).toHaveBeenCalledOnce()
    expect(await repository.entries()).toHaveLength(entryCount)
    expect(repository.budgetSnapshot().task.reserved).toBe(0)
    expect(repository.budgetSnapshot().task.spent).toBeCloseTo(0.099838, 9)
  })
})
