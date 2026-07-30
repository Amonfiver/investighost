import { z } from 'zod'
import {
  RealCoverageSchema,
  RealMasterKnowledgeSchema,
  RealPipelineLimitsSchema,
  RealProfileConfigurationSchema,
  RealResearchDossierSchema,
  RealResearchMissionSchema,
  RealRoundResultSchema,
} from './real-pipeline-contracts'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().datetime({ offset: true })
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const EuroAmountSchema = z.number().finite().nonnegative().refine(
  hasRealEditorialMoneyPrecision,
  'El importe no puede superar nueve decimales',
)
const PositiveEuroAmountSchema = z.number().finite().positive().refine(
  hasRealEditorialMoneyPrecision,
  'El importe no puede superar nueve decimales',
)

export const REAL_EDITORIAL_OPENAI_MODEL = {
  displayName: 'GPT-5.6 Luna',
  apiId: 'gpt-5.6-luna',
} as const

export const REAL_EDITORIAL_PILOT_POLICY = {
  id: 'morella-real-editorial-pilot-v1',
  destination: 'Morella',
  normalizedDestination: 'morella',
  countryCode: 'ES',
  destinationType: 'locality',
  language: 'es',
  pipelineVersion: 'real-editorial-v1',
  targetCostEur: 0.125,
  warningCostEur: 0.16,
  automaticStopCostEur: 0.20,
  manualExtensionCostEur: 0.25,
  technicalLimitCostEur: 0.50,
  dailyLimitCostEur: 0.20,
  currency: 'EUR',
  fxPolicyVersion: 'real-editorial-fx-2026-07-25.1',
  usdToEur: 1,
  maxRounds: 2,
  maxInitialSearches: 4,
  maxFocusedQueries: 3,
  maxAcceptedSources: 8,
  maxConcurrency: 1,
  maxRegenerations: 0,
  maxPublications: 0,
  providers: {
    research: 'tavily',
    intelligence: 'openai',
    model: REAL_EDITORIAL_OPENAI_MODEL.apiId,
  },
} as const

const CurrentMaximumCostSchema = z.number().finite()
  .min(REAL_EDITORIAL_PILOT_POLICY.automaticStopCostEur)
  .max(REAL_EDITORIAL_PILOT_POLICY.technicalLimitCostEur)
  .refine(
    hasRealEditorialMoneyPrecision,
    'El importe no puede superar nueve decimales',
  )

export const REAL_EDITORIAL_FEATURE_TOKEN = 'morella-real-editorial-pilot-authorized'

export function resolveRealEditorialFeatureFlag(value?: string): boolean {
  return value === REAL_EDITORIAL_FEATURE_TOKEN
}

export const RealEditorialPilotPolicySchema = z.object({
  id: z.literal(REAL_EDITORIAL_PILOT_POLICY.id),
  destination: z.literal(REAL_EDITORIAL_PILOT_POLICY.destination),
  normalizedDestination: z.literal(REAL_EDITORIAL_PILOT_POLICY.normalizedDestination),
  countryCode: z.literal(REAL_EDITORIAL_PILOT_POLICY.countryCode),
  destinationType: z.literal(REAL_EDITORIAL_PILOT_POLICY.destinationType),
  language: z.literal(REAL_EDITORIAL_PILOT_POLICY.language),
  pipelineVersion: z.literal(REAL_EDITORIAL_PILOT_POLICY.pipelineVersion),
  targetCostEur: z.literal(REAL_EDITORIAL_PILOT_POLICY.targetCostEur),
  warningCostEur: z.literal(REAL_EDITORIAL_PILOT_POLICY.warningCostEur),
  automaticStopCostEur: z.literal(REAL_EDITORIAL_PILOT_POLICY.automaticStopCostEur),
  manualExtensionCostEur: z.literal(REAL_EDITORIAL_PILOT_POLICY.manualExtensionCostEur),
  technicalLimitCostEur: z.literal(REAL_EDITORIAL_PILOT_POLICY.technicalLimitCostEur),
  dailyLimitCostEur: z.literal(REAL_EDITORIAL_PILOT_POLICY.dailyLimitCostEur),
  currency: z.literal(REAL_EDITORIAL_PILOT_POLICY.currency),
  fxPolicyVersion: z.literal(REAL_EDITORIAL_PILOT_POLICY.fxPolicyVersion),
  usdToEur: z.literal(REAL_EDITORIAL_PILOT_POLICY.usdToEur),
  maxRounds: z.literal(REAL_EDITORIAL_PILOT_POLICY.maxRounds),
  maxInitialSearches: z.literal(REAL_EDITORIAL_PILOT_POLICY.maxInitialSearches),
  maxFocusedQueries: z.literal(REAL_EDITORIAL_PILOT_POLICY.maxFocusedQueries),
  maxAcceptedSources: z.literal(REAL_EDITORIAL_PILOT_POLICY.maxAcceptedSources),
  maxConcurrency: z.literal(REAL_EDITORIAL_PILOT_POLICY.maxConcurrency),
  maxRegenerations: z.literal(REAL_EDITORIAL_PILOT_POLICY.maxRegenerations),
  maxPublications: z.literal(REAL_EDITORIAL_PILOT_POLICY.maxPublications),
  providers: z.object({
    research: z.literal(REAL_EDITORIAL_PILOT_POLICY.providers.research),
    intelligence: z.literal(REAL_EDITORIAL_PILOT_POLICY.providers.intelligence),
    model: z.literal(REAL_EDITORIAL_PILOT_POLICY.providers.model),
  }),
})

export const EditorialExecutionModeSchema = z.enum([
  'manual',
  'real_editorial_pilot',
  'automatic',
])

export const RealEditorialPilotStateSchema = z.enum([
  'queued',
  'preflight',
  'researching_round_1',
  'evaluating_round_1',
  'researching_round_2',
  'evaluating_round_2',
  'generating_adventure',
  'generating_student',
  'final_review',
  'pending_human_review',
  'ready_for_human_review',
  'review_required',
  'failed',
  'cancelled',
])

export const RealEditorialPilotIdentitySchema = z.object({
  normalizedDestination: z.literal('morella'),
  countryCode: z.literal('ES'),
  destinationType: z.literal('locality'),
  mode: z.literal('real_editorial_pilot'),
  pipelineVersion: z.literal(REAL_EDITORIAL_PILOT_POLICY.pipelineVersion),
  profiles: z.tuple([
    z.object({ profile: z.literal('adventure'), targetWords: z.literal(1_000) }),
    z.object({ profile: z.literal('student'), targetWords: z.literal(1_800) }),
  ]),
  taskOrigin: z.literal('human_authorized'),
  variantKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
})

export const RealEditorialPilotPrepareSchema = z.object({
  variantKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).default('initial'),
  preparationKey: IdentifierSchema.default('morella-real-editorial-pilot-v1-initial-prepare'),
  taskOrigin: z.literal('human_authorized').default('human_authorized'),
  profiles: z.array(RealProfileConfigurationSchema).length(2).default([
    { profile: 'adventure', enabled: true, targetWords: 1_000, depth: 'standard' },
    { profile: 'student', enabled: true, targetWords: 1_800, depth: 'deep' },
  ]),
}).superRefine((value, context) => {
  const adventure = value.profiles.find(profile => profile.profile === 'adventure')
  const student = value.profiles.find(profile => profile.profile === 'student')
  if (!adventure?.enabled || adventure.targetWords !== 1_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['profiles'],
      message: 'Aventura debe estar activa con 1.000 palabras',
    })
  }
  if (!student?.enabled || student.targetWords !== 1_800) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['profiles'],
      message: 'Estudiante debe estar activo con 1.800 palabras',
    })
  }
})

export const RealEditorialPilotActionSchema = z.object({
  pilotId: z.string().uuid(),
})

export const RealEditorialPilotCancelSchema = RealEditorialPilotActionSchema.extend({
  reason: z.string().trim().min(1).max(1_000),
})

export const RealEditorialAmbiguousCallDecisionSchema = z.enum([
  'no_consumption',
  'consumption_confirmed',
  'indeterminate',
  'prudential_cost_assumed',
  'cancel_permanently',
])

const HumanResolutionNoteSchema = z.string().trim().min(1).max(1_000).refine(
  value => !/(?:sk-|tvly-|api[_ -]?key|authorization|bearer\s)/i.test(value),
  'La nota no puede contener credenciales ni cabeceras de autorización',
)

const HumanBudgetReasonSchema = z.string().trim().min(1).max(500).refine(
  value => !/(?:sk-|tvly-|api[_ -]?key|authorization|bearer\s)/i.test(value),
  'El motivo no puede contener credenciales ni cabeceras de autorización',
)

const HumanResolutionReasonSchema = z.string().trim().min(1).max(500).refine(
  value => !/(?:sk-|tvly-|api[_ -]?key|authorization|bearer\s)/i.test(value),
  'El motivo no puede contener credenciales ni cabeceras de autorización',
)

export const RealEditorialAmbiguousCallResolutionSchema = z.object({
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  callId: z.string().uuid(),
  actorId: z.string().uuid(),
  decision: RealEditorialAmbiguousCallDecisionSchema,
  recognizedCostEur: z.number().finite().nonnegative()
    .max(REAL_EDITORIAL_PILOT_POLICY.automaticStopCostEur).optional(),
  credits: z.number().finite().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  prudentialCostEur: PositiveEuroAmountSchema.optional(),
  currency: z.literal('EUR').optional(),
  reason: HumanResolutionReasonSchema.optional(),
  acceptsPotentialDuplicateCharge: z.literal(true).optional(),
  note: HumanResolutionNoteSchema.optional(),
  confirmed: z.literal(true),
}).superRefine((value, context) => {
  const prudentialFields = [
    'prudentialCostEur',
    'currency',
    'reason',
    'acceptsPotentialDuplicateCharge',
  ] as const
  if (value.decision === 'prudential_cost_assumed') {
    for (const field of prudentialFields) {
      if (value[field] === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'La conciliación prudencial requiere coste, moneda, motivo y riesgo aceptado',
        })
      }
    }
    for (const field of ['recognizedCostEur', 'credits', 'inputTokens', 'outputTokens'] as const) {
      if (value[field] !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'El coste prudencial no es consumo confirmado por el proveedor',
        })
      }
    }
    return
  }
  for (const field of prudentialFields) {
    if (value[field] !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: 'Los datos prudenciales solo corresponden a esa conciliación',
      })
    }
  }
  const usageProvided = (value.recognizedCostEur ?? 0) > 0
    || (value.credits ?? 0) > 0
    || (value.inputTokens ?? 0) > 0
    || (value.outputTokens ?? 0) > 0
  if (value.decision === 'consumption_confirmed') {
    if (value.recognizedCostEur === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recognizedCostEur'],
        message: 'Confirmar consumo requiere indicar el coste conocido',
      })
    }
    if (!usageProvided) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recognizedCostEur'],
        message: 'Confirmar consumo requiere coste, créditos o tokens observados',
      })
    }
    return
  }
  for (const field of ['recognizedCostEur', 'credits', 'inputTokens', 'outputTokens'] as const) {
    if (value[field] !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: 'Los datos de consumo solo corresponden a consumo confirmado',
      })
    }
  }
})

export const RealEditorialAmbiguousCallSchema = z.object({
  callId: z.string().uuid(),
  reservationId: z.string().uuid(),
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  providerId: IdentifierSchema,
  operation: IdentifierSchema,
  attempt: z.number().int().positive(),
  retryOfCallId: z.string().uuid().optional(),
  sourceState: z.enum(['unknown', 'failed']),
  reviewState: z.literal('human_required'),
  occurredAt: TimestampSchema,
  openedAt: TimestampSchema,
  localKnownCostEur: EuroAmountSchema,
  maximumExposureEur: PositiveEuroAmountSchema,
  spentCostEur: EuroAmountSchema,
  initialAutomaticLimitEur: z.literal(REAL_EDITORIAL_PILOT_POLICY.automaticStopCostEur),
  currentMaximumCostEur: CurrentMaximumCostSchema,
  incidentId: z.string().uuid().optional(),
  incidentCode: IdentifierSchema.optional(),
  latestDecision: z.object({
    decision: z.literal('indeterminate'),
    actorId: z.string().uuid(),
    decidedAt: TimestampSchema,
    note: HumanResolutionNoteSchema.optional(),
  }).optional(),
  prudentialReconciliation: z.object({
    query: z.string().trim().min(1).max(2_000),
    maximumSubrequestCostEur: PositiveEuroAmountSchema,
    releasedReserveEur: EuroAmountSchema,
    currency: z.literal('EUR'),
    providerConfirmed: z.literal(false),
    possibleDuplicateCharge: z.literal(true),
    checkpointVersion: z.number().int().positive(),
    workflowVersion: IdentifierSchema,
  }).optional(),
}).superRefine((value, context) => {
  if (
    value.sourceState === 'unknown'
    && value.spentCostEur + value.maximumExposureEur
      > value.currentMaximumCostEur + 0.000000001
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['currentMaximumCostEur'],
      message: 'El máximo vigente no cubre el gasto confirmado y la reserva ambigua',
    })
  }
  const prudential = value.prudentialReconciliation
  if (
    prudential
    && Math.abs(
      prudential.maximumSubrequestCostEur
      + prudential.releasedReserveEur
      - value.maximumExposureEur,
    ) > 0.000000001
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['prudentialReconciliation', 'releasedReserveEur'],
      message: 'El coste prudencial y la liberación deben conciliar toda la reserva',
    })
  }
})

function hasRealEditorialMoneyPrecision(value: number): boolean {
  const rounded = Number(value.toFixed(9))
  return Math.abs(value - rounded) <= Number.EPSILON * Math.max(1, Math.abs(value))
}

export const RealEditorialAmbiguousCallResolutionResultSchema = z.object({
  resolutionId: z.string().uuid(),
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  callId: z.string().uuid(),
  actorId: z.string().uuid(),
  decision: RealEditorialAmbiguousCallDecisionSchema,
  recognizedCostEur: z.number().nonnegative(),
  credits: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  note: HumanResolutionNoteSchema.optional(),
  decidedAt: TimestampSchema,
  nextAction: z.enum(['blocked', 'resume_from_checkpoint', 'cancelled']),
  prudentialReconciliation: z.object({
    reservationId: z.string().uuid(),
    providerId: IdentifierSchema,
    operation: IdentifierSchema,
    query: z.string().trim().min(1).max(2_000),
    prudentialCostEur: PositiveEuroAmountSchema,
    releasedReserveEur: EuroAmountSchema,
    currency: z.literal('EUR'),
    reason: HumanResolutionReasonSchema,
    origin: z.literal('human_prudential_reconciliation'),
    providerConfirmed: z.literal(false),
    possibleDuplicateChargeAccepted: z.literal(true),
    checkpointVersion: z.number().int().positive(),
    workflowVersion: IdentifierSchema,
  }).optional(),
}).superRefine((value, context) => {
  if (
    value.decision === 'prudential_cost_assumed'
    && !value.prudentialReconciliation
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['prudentialReconciliation'],
      message: 'Falta la trazabilidad de la conciliación prudencial',
    })
  }
  if (
    value.decision !== 'prudential_cost_assumed'
    && value.prudentialReconciliation
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['prudentialReconciliation'],
      message: 'La trazabilidad prudencial no corresponde a esta decisión',
    })
  }
})

const SourceLimitRecoveryReasonSchema = z.string().trim().min(1).max(500).refine(
  value => !/(?:sk-|tvly-|api[_ -]?key|authorization|bearer\s)/i.test(value),
  'El motivo no puede contener credenciales ni cabeceras de autorización',
)

const RealEditorialSourceTraceSchema = z.object({
  id: IdentifierSchema,
  round: z.literal(2),
  normalizedUrl: z.string().url().refine(value => value.startsWith('https://'), {
    message: 'La fuente debe usar HTTPS',
  }),
  title: z.string().trim().min(1).max(500),
  score: z.number().finite().min(0).max(1),
  contentHash: Sha256Schema,
})

const RealEditorialExistingSourceTraceSchema = RealEditorialSourceTraceSchema.extend({
  round: z.literal(1),
})

const RealEditorialExcludedSourceTraceSchema = RealEditorialSourceTraceSchema.extend({
  rank: z.number().int().positive(),
  reason: z.literal('global_source_limit_exhausted'),
})

const RealEditorialSourceLimitRecoveryPlanShapeSchema = z.object({
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  incidentId: z.string().uuid(),
  diagnosticMessage: z.literal(
    'El expediente supera el máximo global de fuentes y necesita una selección durable antes de continuar.',
  ),
  previousCheckpointVersion: z.number().int().positive(),
  recoveredCheckpointVersion: z.number().int().positive(),
  workflowVersion: z.literal('real-workflow-v1'),
  maximumSources: z.literal(REAL_EDITORIAL_PILOT_POLICY.maxAcceptedSources),
  availableSlots: z.number().int().nonnegative(),
  existingSources: z.array(RealEditorialExistingSourceTraceSchema),
  candidateSources: z.array(RealEditorialSourceTraceSchema).min(1),
  selectedSources: z.array(RealEditorialSourceTraceSchema),
  excludedSources: z.array(RealEditorialExcludedSourceTraceSchema).min(1),
  providerCallsBefore: z.number().int().nonnegative(),
  researchProviderCalls: z.number().int().positive(),
  providerCallsAfter: z.number().int().positive(),
  spentCostEur: EuroAmountSchema,
  reservedCostEur: z.literal(0),
  currentMaximumCostEur: CurrentMaximumCostSchema,
  openAIAnalysisRoundTwoPending: z.literal(true),
})

const validateSourceLimitRecoveryPlan = (
  value: z.infer<typeof RealEditorialSourceLimitRecoveryPlanShapeSchema>,
  context: z.RefinementCtx,
) => {
  if (value.recoveredCheckpointVersion !== value.previousCheckpointVersion + 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recoveredCheckpointVersion'],
      message: 'La recuperación debe crear la siguiente versión del checkpoint',
    })
  }
  if (value.availableSlots !== value.maximumSources - value.existingSources.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['availableSlots'],
      message: 'Las plazas disponibles no coinciden con el límite global',
    })
  }
  if (
    value.selectedSources.length !== value.availableSlots
    || value.existingSources.length + value.selectedSources.length !== value.maximumSources
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selectedSources'],
      message: 'La selección no completa exactamente el máximo global',
    })
  }
  if (
    value.candidateSources.length
      !== value.selectedSources.length + value.excludedSources.length
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidateSources'],
      message: 'Las fuentes candidatas no están completamente trazadas',
    })
  }
  const existingUrls = new Set(value.existingSources.map(source => source.normalizedUrl))
  const candidateUrls = value.candidateSources.map(source => source.normalizedUrl)
  if (
    existingUrls.size !== value.existingSources.length
    || new Set(candidateUrls).size !== candidateUrls.length
    || candidateUrls.some(url => existingUrls.has(url))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidateSources'],
      message: 'Las fuentes candidatas deben ser únicas y nuevas para el expediente',
    })
  }
  const selectedMatch = value.selectedSources.every((source, index) =>
    source.id === value.candidateSources[index]?.id
    && source.contentHash === value.candidateSources[index]?.contentHash)
  const excludedMatch = value.excludedSources.every((source, index) => {
    const candidate = value.candidateSources[value.availableSlots + index]
    return source.id === candidate?.id
      && source.contentHash === candidate?.contentHash
      && source.rank === value.availableSlots + index + 1
  })
  if (!selectedMatch || !excludedMatch) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selectedSources'],
      message: 'La partición seleccionada y excluida no coincide con el ranking durable',
    })
  }
  if (
    value.providerCallsAfter
      !== value.providerCallsBefore + value.researchProviderCalls
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['providerCallsAfter'],
      message: 'Las llamadas del checkpoint no coinciden con la evidencia durable',
    })
  }
  if (value.spentCostEur + value.reservedCostEur > value.currentMaximumCostEur) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['spentCostEur'],
      message: 'El ledger recuperado supera el máximo vigente',
    })
  }
}

export const RealEditorialSourceLimitRecoveryPlanSchema = z.discriminatedUnion('status', [
  RealEditorialSourceLimitRecoveryPlanShapeSchema.extend({
    status: z.literal('required'),
  }),
  RealEditorialSourceLimitRecoveryPlanShapeSchema.extend({
    status: z.literal('applied'),
    recoveryId: z.string().uuid(),
    recoveryKey: Sha256Schema,
    actorId: z.string().uuid(),
    reason: SourceLimitRecoveryReasonSchema,
    recoveredAt: TimestampSchema,
  }),
]).superRefine(validateSourceLimitRecoveryPlan)

export const RealEditorialSourceLimitRecoverySchema = z.object({
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  incidentId: z.string().uuid(),
  actorId: z.string().uuid(),
  reason: SourceLimitRecoveryReasonSchema,
  confirmed: z.literal(true),
}).strict()

export const RealEditorialSourceLimitRecoveryResultSchema =
  RealEditorialSourceLimitRecoveryPlanShapeSchema.extend({
      status: z.literal('applied'),
      recoveryId: z.string().uuid(),
      recoveryKey: Sha256Schema,
      actorId: z.string().uuid(),
      reason: SourceLimitRecoveryReasonSchema,
      recoveredAt: TimestampSchema,
      nextAction: z.literal('resume_from_checkpoint'),
    })
    .superRefine(validateSourceLimitRecoveryPlan)

export const RealEditorialBudgetDecisionSchema = z.enum([
  'keep_limit',
  'authorize_extension',
  'cancel_permanently',
])

const RealEditorialBudgetDecisionBaseSchema = z.object({
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  actorId: z.string().uuid(),
  reason: HumanBudgetReasonSchema,
  note: HumanResolutionNoteSchema.optional(),
  confirmed: z.literal(true),
})

export const RealEditorialBudgetResolutionSchema = z.discriminatedUnion('decision', [
  RealEditorialBudgetDecisionBaseSchema.extend({
    decision: z.literal('keep_limit'),
  }).strict(),
  RealEditorialBudgetDecisionBaseSchema.extend({
    decision: z.literal('authorize_extension'),
    newMaximumCostEur: z.number().finite().nonnegative()
      .max(REAL_EDITORIAL_PILOT_POLICY.technicalLimitCostEur),
  }).strict(),
  RealEditorialBudgetDecisionBaseSchema.extend({
    decision: z.literal('cancel_permanently'),
  }).strict(),
])

export const RealEditorialBudgetReviewSchema = z.object({
  reviewId: z.string().uuid(),
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  incidentId: z.string().uuid(),
  status: z.enum(['pending', 'kept', 'authorized', 'cancelled']),
  currency: z.literal('EUR'),
  source: z.literal('real_editorial_pilot_budgets'),
  currentMaximumCostEur: z.number().nonnegative(),
  previousMaximumCostEur: z.number().nonnegative(),
  spentCostEur: z.number().nonnegative(),
  reservedCostEur: z.number().nonnegative(),
  availableCostEur: z.number().nonnegative(),
  remainingEstimatedCostEur: z.number().nonnegative(),
  totalEstimatedCostEur: z.number().nonnegative(),
  shortfallCostEur: z.number().nonnegative(),
  marginCostEur: z.number(),
  openedAt: TimestampSchema,
  resolvedAt: TimestampSchema.optional(),
  tavilyRoundOnePersisted: z.boolean(),
  openAIAnalysisRoundOnePersisted: z.boolean(),
  latestDecision: z.object({
    decisionId: z.string().uuid(),
    actorId: z.string().uuid(),
    decision: RealEditorialBudgetDecisionSchema,
    previousMaximumCostEur: z.number().nonnegative(),
    newMaximumCostEur: z.number().nonnegative(),
    reason: HumanBudgetReasonSchema,
    note: HumanResolutionNoteSchema.optional(),
    decidedAt: TimestampSchema,
  }).optional(),
})

export const RealEditorialBudgetResolutionResultSchema = z.object({
  decisionId: z.string().uuid(),
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  actorId: z.string().uuid(),
  decision: RealEditorialBudgetDecisionSchema,
  previousMaximumCostEur: z.number().nonnegative(),
  newMaximumCostEur: z.number().nonnegative(),
  reason: HumanBudgetReasonSchema,
  note: HumanResolutionNoteSchema.optional(),
  decidedAt: TimestampSchema,
  nextAction: z.enum(['blocked', 'resume_from_checkpoint', 'cancelled']),
  review: RealEditorialBudgetReviewSchema,
})

export const RealEditorialPilotBudgetSchema = z.object({
  pilotId: z.string().uuid(),
  taskId: IdentifierSchema,
  batchId: IdentifierSchema,
  dailyScopeId: IdentifierSchema,
  budgetDate: z.string().date(),
  currency: z.literal('EUR'),
  targetCost: z.literal(REAL_EDITORIAL_PILOT_POLICY.targetCostEur),
  warningCost: z.literal(REAL_EDITORIAL_PILOT_POLICY.warningCostEur),
  taskLimitCost: z.number()
    .min(REAL_EDITORIAL_PILOT_POLICY.automaticStopCostEur)
    .max(REAL_EDITORIAL_PILOT_POLICY.technicalLimitCostEur),
  batchLimitCost: z.number()
    .min(REAL_EDITORIAL_PILOT_POLICY.automaticStopCostEur)
    .max(REAL_EDITORIAL_PILOT_POLICY.technicalLimitCostEur),
  dailyLimitCost: z.number()
    .min(REAL_EDITORIAL_PILOT_POLICY.dailyLimitCostEur)
    .max(REAL_EDITORIAL_PILOT_POLICY.technicalLimitCostEur),
  manualExtensionCost: z.literal(REAL_EDITORIAL_PILOT_POLICY.manualExtensionCostEur),
  technicalLimitCost: z.literal(REAL_EDITORIAL_PILOT_POLICY.technicalLimitCostEur),
  reservedCost: z.number().nonnegative(),
  spentCost: z.number().nonnegative(),
  confirmedAt: TimestampSchema,
}).superRefine((value, context) => {
  if (
    value.taskLimitCost !== value.batchLimitCost
    || value.batchLimitCost !== value.dailyLimitCost
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['taskLimitCost'],
      message: 'Los máximos de tarea, lote y día deben permanecer sincronizados',
    })
  }
  if (value.spentCost + value.reservedCost > value.taskLimitCost) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['spentCost'],
      message: 'El gasto y las reservas no pueden superar el máximo autorizado',
    })
  }
})

export const RealEditorialPilotRecordSchema = z.object({
  id: z.string().uuid(),
  policyId: z.literal(REAL_EDITORIAL_PILOT_POLICY.id),
  mode: z.literal('real_editorial_pilot'),
  taskOrigin: z.literal('human_authorized'),
  variantKey: z.string().trim().min(1).max(120),
  preparationKey: IdentifierSchema,
  identityKey: Sha256Schema,
  canonicalDestinationId: z.string().uuid(),
  destinationName: z.literal('Morella'),
  normalizedDestination: z.literal('morella'),
  countryCode: z.literal('ES'),
  destinationType: z.literal('locality'),
  language: z.literal('es'),
  pipelineVersion: z.literal(REAL_EDITORIAL_PILOT_POLICY.pipelineVersion),
  profiles: z.array(RealProfileConfigurationSchema).length(2),
  state: RealEditorialPilotStateSchema,
  budgetConfirmed: z.boolean(),
  publicationCount: z.literal(0),
  trawelConnected: z.literal(false),
  automaticEnabled: z.literal(false),
  currentRunId: z.string().uuid(),
  version: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  budget: RealEditorialPilotBudgetSchema.optional(),
})

export const RealEditorialDraftSchema = z.object({
  profile: z.enum(['adventure', 'student']),
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(100_000),
  approximateWordCount: z.number().int().positive(),
  promptVersion: IdentifierSchema,
  schemaVersion: IdentifierSchema,
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    estimatedCost: z.number().nonnegative(),
    currency: z.enum(['EUR', 'USD']),
  }),
})

export const RealEditorialReviewSchema = z.object({
  outcome: z.enum(['passed', 'passed_with_warnings', 'review_required']),
  issues: z.array(z.string().trim().min(1).max(1_000)),
  promptVersion: IdentifierSchema,
  schemaVersion: IdentifierSchema,
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    estimatedCost: z.number().nonnegative(),
    currency: z.enum(['EUR', 'USD']),
  }),
})

export const RealEditorialPilotSnapshotSchema = z.object({
  version: z.literal('real-editorial-snapshot-v1'),
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  state: RealEditorialPilotStateSchema,
  currentRound: z.number().int().min(0).max(2),
  mission: RealResearchMissionSchema,
  roundResults: z.array(RealRoundResultSchema).max(2),
  dossier: RealResearchDossierSchema.optional(),
  masterKnowledge: RealMasterKnowledgeSchema.optional(),
  coverage: RealCoverageSchema.optional(),
  drafts: z.array(RealEditorialDraftSchema).max(2),
  review: RealEditorialReviewSchema.optional(),
  limits: RealPipelineLimitsSchema,
  accumulatedCost: z.number().nonnegative(),
  providerCalls: z.number().int().nonnegative(),
  publicationCount: z.literal(0),
  regenerationCount: z.literal(0),
  trawelConnected: z.literal(false),
  automaticEnabled: z.literal(false),
  updatedAt: TimestampSchema,
})

export const RealEditorialPilotProgressSchema = z.object({
  pilot: RealEditorialPilotRecordSchema,
  snapshot: RealEditorialPilotSnapshotSchema.optional(),
  currentRound: z.number().int().min(0).max(2),
  accumulatedCost: z.number().nonnegative(),
  incidentCount: z.number().int().nonnegative(),
  latestIncident: z.object({
    code: IdentifierSchema,
    classification: z.enum(['recoverable', 'permanent', 'ambiguous', 'human_required']),
    message: z.string().trim().min(1).max(1_000),
    createdAt: TimestampSchema,
  }).optional(),
  pendingReservations: z.number().int().nonnegative(),
  humanRequiredCall: RealEditorialAmbiguousCallSchema.optional(),
  budgetReview: RealEditorialBudgetReviewSchema.optional(),
  sourceLimitRecovery: RealEditorialSourceLimitRecoveryPlanSchema.optional(),
  checkpointAvailable: z.boolean(),
  resumeAvailable: z.boolean(),
  guardFree: z.boolean(),
})

export const RealEditorialPreflightStatusSchema = z.enum([
  'ready_for_real_editorial_pilot',
  'missing_credentials',
  'provider_inactive',
  'missing_tariff',
  'budget_invalid',
  'unsafe_storage',
  'duplicate_requires_resolution',
  'repository_unavailable',
  'real_feature_disabled',
  'blocked',
])

export const RealEditorialPreflightCheckSchema = z.object({
  code: IdentifierSchema,
  label: z.string().trim().min(1).max(200),
  status: z.enum(['pass', 'warning', 'block']),
  detail: z.string().trim().min(1).max(1_000),
})

export const RealEditorialPreflightSchema = z.object({
  status: RealEditorialPreflightStatusSchema,
  checks: z.array(RealEditorialPreflightCheckSchema),
  policy: RealEditorialPilotPolicySchema,
  pilot: RealEditorialPilotRecordSchema.optional(),
  repositoryAvailable: z.boolean(),
  duplicateResolution: z.enum([
    'manual_only_coexists',
    'no_conflict',
    'current_pilot',
    'identical_real_pilot_exists',
    'variant_authorized',
  ]),
  researchExecutionAllowed: z.boolean(),
  startActionEnabled: z.boolean(),
  networkCallsPerformed: z.literal(0),
})

export type EditorialExecutionMode = z.infer<typeof EditorialExecutionModeSchema>
export type RealEditorialPilotState = z.infer<typeof RealEditorialPilotStateSchema>
export type RealEditorialPilotPrepare = z.infer<typeof RealEditorialPilotPrepareSchema>
export type RealEditorialPilotAction = z.infer<typeof RealEditorialPilotActionSchema>
export type RealEditorialPilotCancel = z.infer<typeof RealEditorialPilotCancelSchema>
export type RealEditorialAmbiguousCallDecision = z.infer<
  typeof RealEditorialAmbiguousCallDecisionSchema
>
export type RealEditorialAmbiguousCallResolution = z.infer<
  typeof RealEditorialAmbiguousCallResolutionSchema
>
export type RealEditorialAmbiguousCall = z.infer<typeof RealEditorialAmbiguousCallSchema>
export type RealEditorialAmbiguousCallResolutionResult = z.infer<
  typeof RealEditorialAmbiguousCallResolutionResultSchema
>
export type RealEditorialBudgetDecision = z.infer<typeof RealEditorialBudgetDecisionSchema>
export type RealEditorialBudgetResolution = z.infer<
  typeof RealEditorialBudgetResolutionSchema
>
export type RealEditorialBudgetReview = z.infer<typeof RealEditorialBudgetReviewSchema>
export type RealEditorialBudgetResolutionResult = z.infer<
  typeof RealEditorialBudgetResolutionResultSchema
>
export type RealEditorialSourceLimitRecoveryPlan = z.infer<
  typeof RealEditorialSourceLimitRecoveryPlanSchema
>
export type RealEditorialSourceLimitRecovery = z.infer<
  typeof RealEditorialSourceLimitRecoverySchema
>
export type RealEditorialSourceLimitRecoveryResult = z.infer<
  typeof RealEditorialSourceLimitRecoveryResultSchema
>
export type RealEditorialPilotBudget = z.infer<typeof RealEditorialPilotBudgetSchema>
export type RealEditorialPilotRecord = z.infer<typeof RealEditorialPilotRecordSchema>
export type RealEditorialPilotSnapshot = z.infer<typeof RealEditorialPilotSnapshotSchema>
export type RealEditorialPilotProgress = z.infer<typeof RealEditorialPilotProgressSchema>
export type RealEditorialPreflight = z.infer<typeof RealEditorialPreflightSchema>
