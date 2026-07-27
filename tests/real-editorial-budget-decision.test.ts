import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import {
  RealEditorialBudgetResolutionSchema,
  RealEditorialBudgetReviewSchema,
  RealEditorialPilotBudgetSchema,
  type RealEditorialBudgetReview,
} from '@shared/real-editorial-pilot-contracts'
import { RealEditorialBudgetDecisionPanel } from '../src/renderer/App'

const pilotId = '94000000-0000-4000-8000-000000000001'
const runId = '94000000-0000-4000-8000-000000000002'
const actorId = '94000000-0000-4000-8000-000000000003'

function review(
  overrides: Partial<RealEditorialBudgetReview> = {},
): RealEditorialBudgetReview {
  return RealEditorialBudgetReviewSchema.parse({
    reviewId: '94000000-0000-4000-8000-000000000004',
    pilotId,
    runId,
    incidentId: '94000000-0000-4000-8000-000000000005',
    status: 'pending',
    currency: 'EUR',
    source: 'real_editorial_pilot_budgets',
    currentMaximumCostEur: 0.2,
    previousMaximumCostEur: 0.2,
    spentCostEur: 0.099838,
    reservedCostEur: 0,
    availableCostEur: 0.100162,
    remainingEstimatedCostEur: 0.157838,
    totalEstimatedCostEur: 0.257676,
    shortfallCostEur: 0.057676,
    marginCostEur: -0.057676,
    openedAt: '2026-07-26T01:37:38.152Z',
    tavilyRoundOnePersisted: true,
    openAIAnalysisRoundOnePersisted: true,
    ...overrides,
  })
}

function resolution(overrides: Record<string, unknown> = {}) {
  return {
    pilotId,
    runId,
    actorId,
    decision: 'authorize_extension',
    newMaximumCostEur: 0.26,
    reason: 'El operador acepta el coste restante estimado.',
    confirmed: true,
    ...overrides,
  }
}

describe('decisión humana durable de presupuesto', () => {
  it('valida las tres decisiones y exige confirmación, actor y motivo', () => {
    expect(RealEditorialBudgetResolutionSchema.parse(resolution()).decision)
      .toBe('authorize_extension')
    const base = {
      pilotId,
      runId,
      actorId,
      reason: 'El operador conserva el bloqueo.',
      confirmed: true,
    }
    expect(RealEditorialBudgetResolutionSchema.parse({
      ...base,
      decision: 'keep_limit',
    }).decision).toBe('keep_limit')
    expect(RealEditorialBudgetResolutionSchema.parse({
      ...base,
      decision: 'cancel_permanently',
    }).decision).toBe('cancel_permanently')
    expect(RealEditorialBudgetResolutionSchema.safeParse(resolution({
      confirmed: false,
    })).success).toBe(false)
    expect(RealEditorialBudgetResolutionSchema.safeParse(resolution({
      reason: '',
    })).success).toBe(false)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 0.500001])(
    'rechaza máximo negativo, no finito o superior al técnico: %s',
    newMaximumCostEur => {
      expect(RealEditorialBudgetResolutionSchema.safeParse(resolution({
        newMaximumCostEur,
      })).success).toBe(false)
    },
  )

  it('admite solo máximos humanos sincronizados y cubiertos por el ledger', () => {
    const budget = {
      pilotId,
      taskId: `real-editorial-task:${pilotId}`,
      batchId: `real-editorial-batch:${pilotId}`,
      dailyScopeId: `real-editorial-day:${pilotId}`,
      budgetDate: '2026-07-27',
      currency: 'EUR',
      targetCost: 0.125,
      warningCost: 0.16,
      taskLimitCost: 0.26,
      batchLimitCost: 0.26,
      dailyLimitCost: 0.26,
      manualExtensionCost: 0.25,
      technicalLimitCost: 0.5,
      reservedCost: 0,
      spentCost: 0.099838,
      confirmedAt: '2026-07-27T10:00:00.000Z',
    }
    expect(RealEditorialPilotBudgetSchema.parse(budget).taskLimitCost).toBe(0.26)
    expect(RealEditorialPilotBudgetSchema.safeParse({
      ...budget,
      batchLimitCost: 0.25,
    }).success).toBe(false)
    expect(RealEditorialPilotBudgetSchema.safeParse({
      ...budget,
      spentCost: 0.27,
    }).success).toBe(false)
  })

  it('rechaza campos extra, secretos y un máximo en decisiones sin ampliación', () => {
    expect(RealEditorialBudgetResolutionSchema.safeParse(resolution({
      reason: 'Authorization: Bearer synthetic-secret',
    })).success).toBe(false)
    expect(RealEditorialBudgetResolutionSchema.safeParse(resolution({
      decision: 'keep_limit',
    })).success).toBe(false)
    expect(RealEditorialBudgetResolutionSchema.safeParse(resolution({
      decision: 'cancel_permanently',
    })).success).toBe(false)
  })

  it('muestra el déficit desde el ledger y las tres acciones sin rellenar un máximo', () => {
    const html = renderToStaticMarkup(createElement(RealEditorialBudgetDecisionPanel, {
      review: review(),
      actorId,
      busy: false,
      onResolve: vi.fn(),
    }))

    expect(html).toContain('DECISIÓN HUMANA DE PRESUPUESTO')
    expect(html).toContain('Gasto actual')
    expect(html).toContain('Máximo anterior')
    expect(html).toContain('Disponible')
    expect(html).toContain('Coste restante estimado')
    expect(html).toContain('Déficit')
    expect(html).toContain('Total estimado')
    expect(html).toContain('0,099838')
    expect(html).toContain('0,100162')
    expect(html).toContain('0,157838')
    expect(html).toContain('0,057676')
    expect(html).toContain('0,257676')
    expect(html).toContain('Nuevo máximo total')
    expect(html).toContain('Margen tras ampliación')
    expect(html).toContain('Mantener límite')
    expect(html).toContain('Autorizar ampliación')
    expect(html).toContain('Cancelar definitivamente')
    expect(html).toContain('placeholder="Introducir manualmente"')
    expect(html).not.toContain('value="0.5"')
    expect(html).not.toContain('value="0.26"')
  })

  it('tras autorizar informa de la reutilización durable y oculta nuevas decisiones', () => {
    const authorized = review({
      status: 'authorized',
      currentMaximumCostEur: 0.26,
      shortfallCostEur: 0,
      marginCostEur: 0.002324,
      resolvedAt: '2026-07-27T10:00:00.000Z',
      latestDecision: {
        decisionId: '94000000-0000-4000-8000-000000000006',
        actorId,
        decision: 'authorize_extension',
        previousMaximumCostEur: 0.2,
        newMaximumCostEur: 0.26,
        reason: 'El operador acepta el coste restante estimado.',
        decidedAt: '2026-07-27T10:00:00.000Z',
      },
    })
    const html = renderToStaticMarkup(createElement(RealEditorialBudgetDecisionPanel, {
      review: authorized,
      actorId,
      busy: false,
      onResolve: vi.fn(),
    }))

    expect(html).toContain('Tavily ronda 1 y el análisis OpenAI ronda 1 ya están guardados')
    expect(html).toContain('Solo se ejecutará el trabajo restante')
    expect(html).not.toContain('Nuevo máximo total')
    expect(html).not.toContain('Autorizar ampliación</button>')
  })

  it('la ruta principal no ofrece iniciar ni reanudar mientras el déficit está pendiente', async () => {
    const renderer = await readFile(
      new URL('../src/renderer/App.tsx', import.meta.url),
      'utf8',
    )
    expect(renderer).toContain("pilot.state === 'preflight' && !progress?.checkpointAvailable")
    expect(renderer).toContain('!progress?.humanRequiredCall && !progress?.budgetReview')
    expect(renderer).toContain('pilot && progress?.resumeAvailable')
    expect(renderer).not.toContain("pilot.state !== 'pending_human_review'")
  })
})
