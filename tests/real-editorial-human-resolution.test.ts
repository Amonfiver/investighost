import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  REAL_EDITORIAL_PILOT_POLICY,
  RealEditorialAmbiguousCallResolutionSchema,
  RealEditorialAmbiguousCallSchema,
  type RealEditorialAmbiguousCall,
} from '@shared/real-editorial-pilot-contracts'
import { RealEditorialAmbiguousCallPanel } from '../src/renderer/App'

const pilotId = '91000000-0000-4000-8000-000000000001'
const runId = '91000000-0000-4000-8000-000000000002'
const callId = '91000000-0000-4000-8000-000000000003'
const actorId = '91000000-0000-4000-8000-000000000004'

function call(): RealEditorialAmbiguousCall {
  return RealEditorialAmbiguousCallSchema.parse({
    callId,
    reservationId: '91000000-0000-4000-8000-000000000005',
    pilotId,
    runId,
    providerId: 'openai',
    operation: 'analysis',
    attempt: 1,
    sourceState: 'failed',
    reviewState: 'human_required',
    occurredAt: '2026-07-25T22:43:44.001Z',
    openedAt: '2026-07-25T22:43:44.001Z',
    localKnownCostEur: 0,
    maximumExposureEur: 0.022,
    spentCostEur: 0.04,
    automaticLimitEur: REAL_EDITORIAL_PILOT_POLICY.automaticStopCostEur,
    incidentId: '91000000-0000-4000-8000-000000000006',
    incidentCode: 'PROVIDER_ERROR',
  })
}

function resolution(overrides: Record<string, unknown> = {}) {
  return {
    pilotId,
    runId,
    callId,
    actorId,
    decision: 'no_consumption',
    confirmed: true,
    ...overrides,
  }
}

describe('contrato e interfaz mínima de resolución humana', () => {
  it('admite las cuatro decisiones y exige evidencia para consumo confirmado', () => {
    expect(RealEditorialAmbiguousCallResolutionSchema.parse(resolution()).decision)
      .toBe('no_consumption')
    expect(RealEditorialAmbiguousCallResolutionSchema.parse(resolution({
      decision: 'indeterminate',
      note: 'El panel del proveedor todavía no permite identificar la llamada.',
    })).decision).toBe('indeterminate')
    expect(RealEditorialAmbiguousCallResolutionSchema.parse(resolution({
      decision: 'cancel_permanently',
    })).decision).toBe('cancel_permanently')
    expect(RealEditorialAmbiguousCallResolutionSchema.safeParse(resolution({
      decision: 'consumption_confirmed',
      recognizedCostEur: 0,
    })).success).toBe(false)
    expect(RealEditorialAmbiguousCallResolutionSchema.parse(resolution({
      decision: 'consumption_confirmed',
      recognizedCostEur: 0.0001,
      inputTokens: 20,
      outputTokens: 10,
    })).decision).toBe('consumption_confirmed')
  })

  it('rechaza coste negativo, coste fuera de consumo, falta de confirmación y secretos', () => {
    expect(RealEditorialAmbiguousCallResolutionSchema.safeParse(resolution({
      decision: 'consumption_confirmed',
      recognizedCostEur: -0.01,
      inputTokens: 1,
    })).success).toBe(false)
    expect(RealEditorialAmbiguousCallResolutionSchema.safeParse(resolution({
      recognizedCostEur: 0.01,
    })).success).toBe(false)
    expect(RealEditorialAmbiguousCallResolutionSchema.safeParse({
      ...resolution(),
      confirmed: false,
    }).success).toBe(false)
    const unsafe = RealEditorialAmbiguousCallResolutionSchema.safeParse(resolution({
      note: 'Authorization: Bearer synthetic-secret',
    }))
    expect(unsafe.success).toBe(false)
    expect(JSON.stringify(unsafe.success ? unsafe.data : unsafe.error.issues))
      .not.toContain('synthetic-secret')
  })

  it('muestra la llamada y todas las opciones sin convertirla en consola de actividad', () => {
    const html = renderToStaticMarkup(
      createElement(RealEditorialAmbiguousCallPanel, {
        call: call(),
        actorId,
        busy: false,
        onResolve: vi.fn(),
      }),
    )

    expect(html).toContain('DECISIÓN HUMANA REQUERIDA')
    expect(html).toContain('openai')
    expect(html).toContain('analysis')
    expect(html).toContain('human_required')
    expect(html).toContain('Coste local conocido')
    expect(html).toContain('Exposición máxima de la llamada')
    expect(html).toContain('El proveedor no registró consumo')
    expect(html).toContain('El proveedor sí registró consumo')
    expect(html).toContain('No puedo determinarlo')
    expect(html).toContain('Cancelar definitivamente')
    expect(html).not.toContain('spinner')
    expect(html).not.toContain('log de actividad')
  })
})
