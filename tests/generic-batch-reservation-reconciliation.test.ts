import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CostLedgerError,
  CostLedgerService,
  MemoryCostLedgerRepository,
} from '@modules/real-pipeline'

const migration = readFileSync(
  new URL('../supabase/migrations/20260927113000_generic_unknown_reservation_compatibility.sql', import.meta.url),
  'utf8',
)

const input = {
  idempotencyKey: 'factory-batch:segovia:analysis.stage_a:attempt:1',
  executionId: 'factory-batch:segovia', requestId: 'job-segovia', runId: 'job-segovia',
  taskId: 'factory-batch:segovia', batchId: 'batch-segovia', stage: '1_analysis.stage_a',
  operation: 'analysis.stage_a', providerId: 'deepseek', model: 'deepseek-flash', attempt: 1,
  estimatedCost: 0.02, currency: 'EUR', tariffId: 'deepseek-flash-v1',
  promptVersion: 'generic-editorial-v1', schemaVersion: 'real-editorial-snapshot-v1', inputHash: 'a'.repeat(64),
} as const

describe('conciliación de reservas genéricas batch', () => {
  it('permite UNKNOWN para un owner BATCH_JOB sin crear una incidencia pilot incompatible', () => {
    expect(migration).toContain("new.pilot_id is not null")
    expect(migration).toContain("new.run_id is not null")
    expect(migration).toContain("new.state = 'unknown'")
  })

  it('FAILED_ATTEMPT_RESERVATION_RECONCILED mantiene la reserva ambigua y no inventa gasto', async () => {
    let sequence = 0
    const repository = new MemoryCostLedgerRepository(
      { task: 0.2, batch: 0.5, daily: 1, currency: 'EUR' },
      { now: () => new Date('2026-09-27T18:38:04.750Z'), id: () => `reservation-${++sequence}` },
    )
    const ledger = new CostLedgerService(repository)
    await ledger.acquireExecution(input.executionId, 'lease-segovia', new Date('2026-09-27T19:38:04.750Z'))
    const reserved = await ledger.reserve(input)
    await ledger.start(reserved.id)
    const reconciled = await ledger.settle({
      reservationId: reserved.id, outcome: 'unknown', usage: { inputTokens: 0, outputTokens: 0, toolCalls: 1, credits: 0 },
      sanitizedError: 'REMOTE_OUTCOME_UNKNOWN',
    })

    expect(reconciled).toMatchObject({ state: 'unknown', reservedCost: 0.02 })
    expect(reconciled.calculatedCost).toBeUndefined()
    expect(repository.budgetSnapshot()).toMatchObject({ task: { reserved: 0.02, spent: 0 } })
    expect(await repository.entries()).toHaveLength(3)
    await expect(ledger.settle({
      reservationId: reserved.id, outcome: 'unknown', usage: { inputTokens: 0, outputTokens: 0, toolCalls: 1, credits: 0 },
    })).rejects.toBeInstanceOf(CostLedgerError)
  })

  it('RETRY_DOES_NOT_DUPLICATE_RESERVATION when a deterministic key is replayed', async () => {
    let sequence = 0
    const repository = new MemoryCostLedgerRepository(
      { task: 0.2, batch: 0.5, daily: 1, currency: 'EUR' },
      { now: () => new Date('2026-09-27T18:38:04.750Z'), id: () => `idempotent-${++sequence}` },
    )
    const ledger = new CostLedgerService(repository)
    await ledger.acquireExecution(input.executionId, 'lease-segovia', new Date('2026-09-27T19:38:04.750Z'))
    const first = await ledger.reserve(input)
    const replay = await ledger.reserve(input)
    expect(replay.id).toBe(first.id)
    expect(await repository.entries()).toHaveLength(1)
  })
})
