import { describe, expect, it, vi } from 'vitest'
import {
  CostLedgerService,
  LedgeredWorkflowCallExecutor,
  MemoryCostLedgerRepository,
  TavilyResearchError,
  type LedgeredCallMetadataFactory,
} from '@modules/real-pipeline'

const now = '2026-07-25T22:00:00.000Z'
const operationId = 'task-morella:round:1:research'

function metadata(): LedgeredCallMetadataFactory {
  return {
    create(targetOperationId, attempt, estimatedCost, retryOfCallId) {
      return {
        idempotencyKey: `${targetOperationId}:attempt:${attempt}`,
        executionId: 'real-editorial:run-morella',
        requestId: 'pilot-morella',
        runId: 'run-morella',
        taskId: 'task-morella',
        batchId: 'batch-morella',
        stage: '1_research',
        operation: 'research',
        providerId: 'tavily',
        model: 'search-and-extract',
        attempt,
        retryOfCallId,
        estimatedCost,
        currency: 'EUR',
        tariffId: 'morella-v1-tavily-search',
        promptVersion: 'morella-real-editorial-v1',
        schemaVersion: 'real-editorial-snapshot-v1',
        inputHash: 'a'.repeat(64),
      }
    },
  }
}

describe('conciliación de fallos facturables y reanudación idempotente', () => {
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
})
