import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  REAL_EDITORIAL_COVERAGE_BUDGET,
  REAL_EDITORIAL_COVERAGE_SAFETY_RULES,
  RealEditorialCoverageResolutionSchema,
  RealEditorialCoverageReviewSchema,
  type RealEditorialCoverageReview,
} from '@shared/real-editorial-pilot-contracts'
import { realEditorialCoverageAllowsResume } from '@modules/real-pipeline/real-editorial-repository'
import { RealEditorialCoverageDecisionPanel } from '../src/renderer/App'

const pilotId = 'a7000000-0000-4000-8000-000000000001'
const runId = 'a7000000-0000-4000-8000-000000000002'
const actorId = 'a7000000-0000-4000-8000-000000000003'
const decisionId = 'a7000000-0000-4000-8000-000000000004'
const checkpointHash = 'a'.repeat(64)

const gaps = [
  {
    id: 'g1',
    topic: 'castillo',
    description: 'Horarios, tarifas y duración coherentes del castillo.',
    importance: 'critical' as const,
    requiredForProfiles: ['adventure', 'student'] as const,
    resolvableWithResearch: true,
  },
  {
    id: 'g2',
    topic: 'autocaravanas',
    description: 'Estado, ubicación, capacidad, tarifa y servicios del área.',
    importance: 'critical' as const,
    requiredForProfiles: ['adventure'] as const,
    resolvableWithResearch: true,
  },
  {
    id: 'g3',
    topic: 'ruta',
    description: 'Ruta verificable con distancia, desnivel, dificultad y seguridad.',
    importance: 'high' as const,
    requiredForProfiles: ['adventure'] as const,
    resolvableWithResearch: true,
  },
  {
    id: 'g4',
    topic: 'acceso',
    description: 'Transporte, aparcamiento, restricciones y accesibilidad.',
    importance: 'high' as const,
    requiredForProfiles: ['adventure', 'student'] as const,
    resolvableWithResearch: true,
  },
  {
    id: 'g5',
    topic: 'vida-cotidiana',
    description: 'Población, economía, servicios y vida cotidiana.',
    importance: 'medium' as const,
    requiredForProfiles: ['student'] as const,
    resolvableWithResearch: true,
  },
]

const contradictions = [
  'Horarios y tarifas del castillo.',
  'Estado y condiciones del área de autocaravanas.',
  'Duración recomendada del castillo.',
]

function review(overrides: Partial<RealEditorialCoverageReview> = {}) {
  return RealEditorialCoverageReviewSchema.parse({
    pilotId,
    runId,
    status: 'required',
    checkpointVersion: 15,
    checkpointHash,
    coverageScore: 0.78,
    gaps,
    contradictions,
    affectedProfiles: ['adventure', 'student'],
    spentCostEur: 0.258648,
    reservedCostEur: 0,
    currentMaximumCostEur: 0.27,
    availableCostEur: 0.011352,
    estimates: {
      keepReviewRequired: {
        remainingEstimatedCostEur: 0,
        projectedTotalCostEur: 0.258648,
        shortfallCostEur: 0,
      },
      rejectEditorialRun: {
        remainingEstimatedCostEur: 0,
        projectedTotalCostEur: 0.258648,
        shortfallCostEur: 0,
      },
      acceptWithWarnings: {
        remainingEstimatedCostEur: 0.06,
        projectedTotalCostEur: 0.318648,
        shortfallCostEur: 0.048648,
      },
    },
    ...overrides,
  })
}

function resolution(decision: string, extra: Record<string, unknown> = {}) {
  return {
    pilotId,
    runId,
    actorId,
    decision,
    reason: 'Decisión editorial humana sintética.',
    confirmed: true,
    ...extra,
  }
}

describe('decisión humana durable de cobertura', () => {
  it('contrata las tres opciones y exige aceptación explícita del riesgo', () => {
    expect(RealEditorialCoverageResolutionSchema.parse(
      resolution('keep_review_required'),
    ).decision).toBe('keep_review_required')
    expect(RealEditorialCoverageResolutionSchema.parse(
      resolution('reject_editorial_run'),
    ).decision).toBe('reject_editorial_run')
    expect(RealEditorialCoverageResolutionSchema.parse(
      resolution('accept_with_warnings', { riskAccepted: true }),
    ).decision).toBe('accept_with_warnings')
    expect(RealEditorialCoverageResolutionSchema.safeParse(
      resolution('accept_with_warnings'),
    ).success).toBe(false)
  })

  it('concilia el ledger actual con 0,060000 EUR, sin reutilizar 0,157838 EUR', () => {
    const parsed = review()
    expect(REAL_EDITORIAL_COVERAGE_BUDGET).toEqual({
      draftingCostEur: 0.04,
      finalReviewCostEur: 0.02,
      remainingCostEur: 0.06,
    })
    expect(parsed.estimates.acceptWithWarnings).toEqual({
      remainingEstimatedCostEur: 0.06,
      projectedTotalCostEur: 0.318648,
      shortfallCostEur: 0.048648,
    })
    expect(RealEditorialCoverageReviewSchema.safeParse({
      ...parsed,
      estimates: {
        ...parsed.estimates,
        acceptWithWarnings: {
          remainingEstimatedCostEur: 0.157838,
          projectedTotalCostEur: 0.416486,
          shortfallCostEur: 0.146486,
        },
      },
    }).success).toBe(false)
  })

  it('presenta por separado mantener, rechazar y aceptar con advertencias', () => {
    const html = renderToStaticMarkup(createElement(RealEditorialCoverageDecisionPanel, {
      review: review(),
      actorId,
      busy: false,
      onResolve: vi.fn(),
    }))

    expect(html).toContain('DECISIÓN HUMANA DE COBERTURA')
    expect(html).toContain('Mantener revisión')
    expect(html).toContain('Rechazar expediente')
    expect(html).toContain('Aceptar con advertencias')
    expect(html).toContain('0,060000')
    expect(html).toContain('0,318648')
    expect(html).toContain('0,048648')
    expect(html).toContain('0,258648')
    expect(html).toContain('0,011352')
    expect(html).not.toContain('0,157838')
    expect(html).toContain('Gaps abiertos</dt><dd>5')
    expect(html).toContain('Contradicciones</dt><dd>3')
  })

  it('mantiene resume bloqueado hasta presupuesto y checkpoint derivados', () => {
    expect(realEditorialCoverageAllowsResume({ required: true })).toBe(false)
    expect(realEditorialCoverageAllowsResume({
      required: true,
      coverageStatus: 'accepted',
      coverageDecisionId: decisionId,
      budgetStatus: 'pending',
      budgetContext: 'coverage_acceptance',
      checkpointState: 'review_required',
    })).toBe(false)
    expect(realEditorialCoverageAllowsResume({
      required: true,
      coverageStatus: 'accepted',
      coverageDecisionId: decisionId,
      budgetStatus: 'authorized',
      budgetContext: 'coverage_acceptance',
      checkpointState: 'ready_for_drafting',
      checkpointConstraintDecisionId: decisionId,
    })).toBe(true)
    expect(realEditorialCoverageAllowsResume({
      required: true,
      coverageStatus: 'accepted',
      coverageDecisionId: decisionId,
      budgetStatus: 'authorized',
      budgetContext: 'workflow_completion',
      checkpointState: 'ready_for_drafting',
      checkpointConstraintDecisionId: decisionId,
    })).toBe(false)
  })

  it('conserva gaps no resueltos y todas las reglas de seguridad editorial', () => {
    const accepted = review({
      status: 'accepted',
      editorialConstraints: {
        decisionId,
        checkpointVersion: 15,
        checkpointHash,
        mode: 'accept_with_warnings',
        unresolvedGapIds: gaps.map(gap => gap.id),
        contradictions,
        affectedProfiles: ['adventure', 'student'],
        safetyRules: [...REAL_EDITORIAL_COVERAGE_SAFETY_RULES],
      },
      latestDecision: {
        decisionId,
        actorId,
        decision: 'accept_with_warnings',
        reason: 'Cobertura sintética aceptada para probar el contrato.',
        riskAccepted: true,
        riskStatement: 'Los gaps continúan abiertos y deben tratarse prudentemente.',
        gapDispositions: gaps.map(gap => ({
          gapId: gap.id,
          disposition: 'accepted_unresolved' as const,
        })),
        decidedAt: '2026-08-01T12:00:00.000Z',
      },
    })
    expect(accepted.editorialConstraints?.unresolvedGapIds).toEqual([
      'g1', 'g2', 'g3', 'g4', 'g5',
    ])
    expect(accepted.editorialConstraints?.contradictions).toHaveLength(3)
    expect(accepted.editorialConstraints?.safetyRules)
      .toEqual(REAL_EDITORIAL_COVERAGE_SAFETY_RULES)
  })

  it('la ruta durable no contiene proveedores, tercera ronda ni reanudación automática', async () => {
    const [migration, runtime, repository] = await Promise.all([
      readFile(new URL(
        '../supabase/migrations/20260801210000_real_editorial_coverage_decision.sql',
        import.meta.url,
      ), 'utf8'),
      readFile(new URL('../src/main/real-editorial-pilot-runtime.ts', import.meta.url), 'utf8'),
      readFile(new URL(
        '../src/modules/real-pipeline/real-editorial-repository.ts',
        import.meta.url,
      ), 'utf8'),
    ])
    expect(migration).toContain("'providerCalled',false,'workflowResumed',false")
    expect(migration).toContain("p_checkpoint_payload->>'state' <> 'ready_for_drafting'")
    expect(migration).not.toContain('researching_round_3')
    expect(runtime).toContain('return this.repository.resolveCoverageDecision(input)')
    expect(repository).toContain("state: 'ready_for_drafting'")
    expect(repository).not.toContain("state: 'researching_round_3'")
  })
})
