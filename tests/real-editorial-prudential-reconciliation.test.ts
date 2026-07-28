import { describe, expect, it, vi } from 'vitest'
import { SupabaseRealEditorialPilotRepository } from '@modules/real-pipeline'
import {
  RealEditorialAmbiguousCallResolutionSchema,
  type RealEditorialAmbiguousCallResolution,
} from '@shared/real-editorial-pilot-contracts'

const pilotId = '99000000-0000-4000-8000-000000000001'
const runId = '99000000-0000-4000-8000-000000000002'
const callId = '99000000-0000-4000-8000-000000000003'
const reservationId = '99000000-0000-4000-8000-000000000004'
const actorId = '99000000-0000-4000-8000-000000000005'
const resolutionId = '99000000-0000-4000-8000-000000000006'

function resolution(): RealEditorialAmbiguousCallResolution {
  return RealEditorialAmbiguousCallResolutionSchema.parse({
    pilotId,
    runId,
    callId,
    actorId,
    decision: 'prudential_cost_assumed',
    prudentialCostEur: 0.008,
    currency: 'EUR',
    reason: 'El proveedor no aporta evidencia granular del consumo.',
    note: 'Se asume el máximo de la subpetición por prudencia.',
    acceptsPotentialDuplicateCharge: true,
    confirmed: true,
  })
}

function repository() {
  const stored = {
    id: resolutionId,
    pilot_id: pilotId,
    run_id: runId,
    call_id: callId,
    reservation_id: reservationId,
    actor_id: actorId,
    decision: 'prudential_cost_assumed',
    recognized_cost: 0,
    credits: 0,
    input_tokens: 0,
    output_tokens: 0,
    note: 'Se asume el máximo de la subpetición por prudencia.',
    decided_at: '2026-07-28T20:00:00.000Z',
    provider_id: 'tavily',
    operation: 'research',
    query: 'Morella turismo oficial horarios tarifas 2026',
    prudential_cost: 0.008,
    released_reserve: 0.04,
    currency: 'EUR',
    reason: 'El proveedor no aporta evidencia granular del consumo.',
    origin: 'human_prudential_reconciliation',
    provider_confirmed: false,
    duplicate_charge_risk_accepted: true,
    checkpoint_version: 12,
    workflow_version: 'real-workflow-v1',
  }
  const rpc = vi.fn(async () => ({ data: resolutionId, error: null }))
  const client = {
    rpc,
    from: vi.fn(() => {
      const builder: Record<string, (...args: unknown[]) => unknown> = {}
      for (const method of ['select', 'eq']) builder[method] = () => builder
      builder.single = () => Promise.resolve({ data: stored, error: null })
      return builder
    }),
  }
  return {
    repository: new SupabaseRealEditorialPilotRepository(client as never),
    rpc,
  }
}

describe('servicio de conciliación prudencial', () => {
  it('usa el RPC específico y devuelve trazabilidad sin consumo confirmado', async () => {
    const target = repository()

    await expect(target.repository.resolveHumanRequiredCall(resolution()))
      .resolves.toMatchObject({
        resolutionId,
        decision: 'prudential_cost_assumed',
        recognizedCostEur: 0,
        nextAction: 'resume_from_checkpoint',
        prudentialReconciliation: {
          reservationId,
          providerId: 'tavily',
          operation: 'research',
          prudentialCostEur: 0.008,
          releasedReserveEur: 0.04,
          providerConfirmed: false,
          possibleDuplicateChargeAccepted: true,
          checkpointVersion: 12,
          workflowVersion: 'real-workflow-v1',
        },
      })

    expect(target.rpc).toHaveBeenCalledWith(
      'reconcile_real_editorial_ambiguous_call_prudential',
      expect.objectContaining({
        p_pilot_id: pilotId,
        p_run_id: runId,
        p_call_id: callId,
        p_actor_id: actorId,
        p_prudential_cost: 0.008,
        p_currency: 'EUR',
        p_duplicate_charge_risk_accepted: true,
      }),
    )
    expect(target.rpc.mock.calls[0]?.[1]).not.toHaveProperty('p_recognized_cost')
  })

  it('genera la misma clave para una repetición idéntica', async () => {
    const target = repository()

    await target.repository.resolveHumanRequiredCall(resolution())
    await target.repository.resolveHumanRequiredCall(resolution())

    expect(target.rpc).toHaveBeenCalledTimes(2)
    expect(target.rpc.mock.calls[0]?.[1].p_resolution_key)
      .toBe(target.rpc.mock.calls[1]?.[1].p_resolution_key)
  })
})
