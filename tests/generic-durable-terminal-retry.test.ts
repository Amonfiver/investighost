import { describe, expect, it } from 'vitest'
import { SupabaseGenericDurableExecutionRepository } from '@modules/real-pipeline'
import type { ProviderCallReservation } from '@shared/real-cost-contracts'

const reservation: ProviderCallReservation = {
  id: 'f3018e35-cab8-42d9-b7c3-cbff863377b2', callId: '42e4c84d-80e6-4394-ac5e-db32f0e9dca2',
  input: {
    idempotencyKey: 'factory-batch:segovia:round:1:analysis.stage_a:attempt:1', executionId: 'factory-batch:segovia', requestId: 'segovia-job', runId: 'segovia-job', taskId: 'factory-batch:segovia', batchId: 'batch-segovia',
    stage: '1_analysis.stage_a', operation: 'analysis.stage_a', providerId: 'deepseek', model: 'deepseek-flash', attempt: 1,
    estimatedCost: 0.02, currency: 'EUR', tariffId: 'deepseek-flash', promptVersion: 'segovia-v1', schemaVersion: 'real-editorial-snapshot-v1', inputHash: 'a'.repeat(64),
  },
  state: 'failed', reservedCost: 0.02, createdAt: '2026-09-27T18:37:34.700Z', updatedAt: '2026-09-29T19:57:15.600Z',
}

function repository(responseRecovered: boolean) {
  const client = {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        not: () => query,
        maybeSingle: async () => table === 'real_editorial_ambiguous_calls'
          ? { data: { terminal_resolution_id: '60bb2fc1-288b-49ff-bf5b-feffc0f734cb' }, error: null }
          : { data: { decision: 'consumption_confirmed', response_recovered: responseRecovered }, error: null },
      }
      return query
    },
  }
  return new SupabaseGenericDurableExecutionRepository(client as never)
}

describe('generic durable terminal analysis retry permission', () => {
  it('permits a fresh analysis.stage_a reservation only after CONFIRMED_CONSUMED_RESPONSE_LOST', async () => {
    expect(await repository(false).canRetryTerminalAnalysisAfterHumanResolution('8b450640-17a5-4e1a-a12c-73d98a9e95a4', reservation)).toBe(true)
  })

  it('NO_SILENT_LIMIT_BYPASS rejects recovered responses or unrelated terminal calls', async () => {
    expect(await repository(true).canRetryTerminalAnalysisAfterHumanResolution('8b450640-17a5-4e1a-a12c-73d98a9e95a4', reservation)).toBe(false)
    expect(await repository(false).canRetryTerminalAnalysisAfterHumanResolution('8b450640-17a5-4e1a-a12c-73d98a9e95a4', {
      ...reservation, input: { ...reservation.input, operation: 'analysis', providerId: 'deepseek' },
    })).toBe(false)
  })
})
