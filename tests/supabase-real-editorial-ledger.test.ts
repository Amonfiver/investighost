import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseRealEditorialLedgerRepository } from '@modules/real-pipeline'

describe('errores contractuales del ledger editorial Supabase', () => {
  it('propaga sanitizados la RPC y el código exacto al rechazar una conciliación', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        message: 'REAL_EDITORIAL_COST_EXCEEDS_RESERVATION',
      },
    }))
    const repository = new SupabaseRealEditorialLedgerRepository(
      { rpc } as unknown as SupabaseClient,
      '480d9c05-3ef7-4c44-a6f1-7762b7179a03',
      '467dc951-26f5-45f6-895c-d2f06c496d6e',
    )

    await expect(repository.settle({
      reservationId: 'e5a4f2ec-4149-48ba-954a-05343abd755f',
      outcome: 'succeeded',
      calculatedCost: 0.049838,
      usage: {
        inputTokens: 26_942,
        outputTokens: 3_816,
        toolCalls: 1,
        credits: 0,
      },
    })).rejects.toMatchObject({
      code: 'ACTUAL_COST_EXCEEDS_RESERVATION',
      message: [
        'El ledger editorial durable rechazó settle_real_editorial_call',
        '(ACTUAL_COST_EXCEEDS_RESERVATION)',
      ].join(' '),
    })
    expect(rpc).toHaveBeenCalledWith('settle_real_editorial_call', expect.objectContaining({
      p_reservation_id: 'e5a4f2ec-4149-48ba-954a-05343abd755f',
      p_calculated_cost: 0.049838,
    }))
  })
})
