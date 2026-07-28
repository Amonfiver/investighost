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

function call(
  overrides: Partial<RealEditorialAmbiguousCall> = {},
): RealEditorialAmbiguousCall {
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
    initialAutomaticLimitEur: REAL_EDITORIAL_PILOT_POLICY.automaticStopCostEur,
    currentMaximumCostEur: REAL_EDITORIAL_PILOT_POLICY.automaticStopCostEur,
    incidentId: '91000000-0000-4000-8000-000000000006',
    incidentCode: 'PROVIDER_ERROR',
    ...overrides,
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
  it('admite las cinco decisiones y separa coste prudencial de consumo confirmado', () => {
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
    expect(RealEditorialAmbiguousCallResolutionSchema.parse(resolution({
      decision: 'prudential_cost_assumed',
      prudentialCostEur: 0.008,
      currency: 'EUR',
      reason: 'El proveedor no permite determinar el consumo individual.',
      acceptsPotentialDuplicateCharge: true,
    })).decision).toBe('prudential_cost_assumed')
  })

  it('rechaza coste negativo, campos cruzados, falta de confirmación y secretos', () => {
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
    expect(RealEditorialAmbiguousCallResolutionSchema.safeParse(resolution({
      decision: 'prudential_cost_assumed',
      prudentialCostEur: -0.008,
      currency: 'EUR',
      reason: 'Conciliación sintética.',
      acceptsPotentialDuplicateCharge: true,
    })).success).toBe(false)
    expect(RealEditorialAmbiguousCallResolutionSchema.safeParse(resolution({
      decision: 'prudential_cost_assumed',
      prudentialCostEur: 0.008,
      currency: 'EUR',
      reason: '',
      acceptsPotentialDuplicateCharge: true,
    })).success).toBe(false)
    expect(RealEditorialAmbiguousCallResolutionSchema.safeParse(resolution({
      decision: 'prudential_cost_assumed',
      prudentialCostEur: 0.008,
      currency: 'EUR',
      reason: 'Conciliación sintética.',
      acceptsPotentialDuplicateCharge: false,
    })).success).toBe(false)
    expect(RealEditorialAmbiguousCallResolutionSchema.safeParse(resolution({
      decision: 'prudential_cost_assumed',
      prudentialCostEur: 0.008,
      currency: 'USD',
      reason: 'Conciliación sintética.',
      acceptsPotentialDuplicateCharge: true,
    })).success).toBe(false)
    const unsafe = RealEditorialAmbiguousCallResolutionSchema.safeParse(resolution({
      note: 'Authorization: Bearer synthetic-secret',
    }))
    expect(unsafe.success).toBe(false)
    expect(JSON.stringify(unsafe.success ? unsafe.data : unsafe.error.issues))
      .not.toContain('synthetic-secret')
  })

  it('separa el límite automático inicial del máximo durable vigente', () => {
    expect(call()).toMatchObject({
      initialAutomaticLimitEur: 0.2,
      currentMaximumCostEur: 0.2,
    })
    expect(call({
      sourceState: 'unknown',
      maximumExposureEur: 0.048,
      spentCostEur: 0.099838,
      currentMaximumCostEur: 0.27,
    })).toMatchObject({
      initialAutomaticLimitEur: 0.2,
      currentMaximumCostEur: 0.27,
      spentCostEur: 0.099838,
      maximumExposureEur: 0.048,
    })
  })

  it.each([
    ['negativo', { currentMaximumCostEur: -0.27 }],
    ['NaN', { currentMaximumCostEur: Number.NaN }],
    ['string', { currentMaximumCostEur: '0.27' }],
    ['precisión superior a nueve decimales', { currentMaximumCostEur: 0.2700000001 }],
    ['no cubre gasto y reserva', {
      sourceState: 'unknown',
      spentCostEur: 0.18,
      maximumExposureEur: 0.048,
      currentMaximumCostEur: 0.2,
    }],
    ['altera el límite automático inicial', { initialAutomaticLimitEur: 0.27 }],
  ])('rechaza un importe %s', (_label, overrides) => {
    const base = {
      callId,
      reservationId: '91000000-0000-4000-8000-000000000005',
      pilotId,
      runId,
      providerId: 'tavily',
      operation: 'research',
      attempt: 1,
      sourceState: 'unknown',
      reviewState: 'human_required',
      occurredAt: '2026-07-25T22:43:44.001Z',
      openedAt: '2026-07-25T22:43:44.001Z',
      localKnownCostEur: 0,
      maximumExposureEur: 0.048,
      spentCostEur: 0.099838,
      initialAutomaticLimitEur: 0.2,
      currentMaximumCostEur: 0.27,
      ...overrides,
    }
    expect(RealEditorialAmbiguousCallSchema.safeParse(base).success).toBe(false)
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
    expect(html).toContain('Límite automático inicial')
    expect(html).toContain('Gastado / máximo vigente')
    expect(html).toContain('El proveedor no registró consumo')
    expect(html).toContain('El proveedor sí registró consumo')
    expect(html).toContain('No puedo determinarlo')
    expect(html).toContain('Decisión tras comprobar el panel de OpenAI')
    expect(html).toContain('Asumir coste prudencial y permitir reintento')
    expect(html).toContain('Cancelar definitivamente')
    expect(html).not.toContain('spinner')
    expect(html).not.toContain('log de actividad')
  })

  it('muestra el máximo vigente ampliado sin alterar el límite automático', () => {
    const html = renderToStaticMarkup(
      createElement(RealEditorialAmbiguousCallPanel, {
        call: call({
          providerId: 'tavily',
          operation: 'research',
          sourceState: 'unknown',
          spentCostEur: 0.099838,
          maximumExposureEur: 0.048,
          currentMaximumCostEur: 0.27,
          prudentialReconciliation: {
            query: 'Morella turismo oficial horarios y tarifas',
            maximumSubrequestCostEur: 0.008,
            releasedReserveEur: 0.04,
            currency: 'EUR',
            providerConfirmed: false,
            possibleDuplicateCharge: true,
            checkpointVersion: 12,
            workflowVersion: 'real-workflow-v1',
          },
        }),
        actorId,
        busy: false,
        onResolve: vi.fn(),
      }),
    )

    expect(html).toContain('Límite automático inicial')
    expect(html).toContain('0,20')
    expect(html).toContain('Gastado / máximo vigente')
    expect(html).toContain('0,10')
    expect(html).toContain('0,27')
    expect(html).toContain('Decisión tras comprobar el panel de Tavily')
    expect(html).toContain('Asumir coste prudencial y permitir reintento')
    expect(html).not.toContain('panel de OpenAI')
  })
})
