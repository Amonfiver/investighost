import { z } from 'zod'
import {
  RealCoverageSchema,
  RealKnowledgeGapSchema,
  RealKnowledgeClaimSchema,
  RealMasterKnowledgeSchema,
  RealPipelineLimitsSchema,
  RealProfileConfigurationSchema,
  RealResearchDossierSchema,
  RealResearchMissionSchema,
  RealResearchSourceSchema,
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

export const REAL_EDITORIAL_COVERAGE_BUDGET = {
  draftingCostEur: 0.04,
  finalReviewCostEur: 0.02,
  remainingCostEur: 0.06,
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
  'human_approved',
  'ready_for_library',
  'changes_requested',
  'human_rejected',
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

const PartialAnalysisRecoveryReasonSchema = z.string().trim().min(1).max(500).refine(
  value => !/(?:sk-|tvly-|api[_ -]?key|authorization|bearer\s)/i.test(value),
  'El motivo no puede contener credenciales ni cabeceras de autorización',
)

const RealEditorialPartialAnalysisArtifactSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum([
    'master_knowledge', 'coverage', 'fact', 'evidence', 'place', 'activity',
    'gap', 'contradiction',
  ]),
  key: IdentifierSchema,
  version: z.number().int().positive(),
  payloadHash: Sha256Schema,
  createdAt: TimestampSchema,
})

const RealEditorialPartialAnalysisCountsSchema = z.object({
  masterKnowledge: z.literal(1),
  coverage: z.literal(1),
  facts: z.literal(10),
  evidence: z.literal(10),
  places: z.literal(5),
  activities: z.literal(1),
  gaps: z.literal(6),
  contradictions: z.literal(4),
  queries: z.literal(0),
  total: z.literal(38),
})

const RealEditorialPartialAnalysisRecoveryBaseSchema = z.object({
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  incidentId: z.string().uuid(),
  callId: z.string().uuid(),
  reservationId: z.string().uuid(),
  round: z.literal(2),
  checkpointVersion: z.number().int().positive(),
  diagnosticMessage: z.literal(
    'OpenAI devolvió el análisis de ronda 2, pero su persistencia quedó parcial por un conflicto de versión.',
  ),
  duplicateRiskMessage: z.literal(
    'Repetir la reanudación antes de conciliar esta respuesta podría duplicar consumo de OpenAI.',
  ),
  responseReceived: z.literal(true),
  parsedResponseConfirmed: z.literal(true),
  completeResponseRecoverable: z.literal(false),
  partialArtifacts: z.array(RealEditorialPartialAnalysisArtifactSchema).length(38),
  counts: RealEditorialPartialAnalysisCountsSchema,
  maximumExposureCostEur: PositiveEuroAmountSchema,
  spentCostEur: EuroAmountSchema,
  reservedCostEur: z.literal(0),
  currentMaximumCostEur: CurrentMaximumCostSchema,
  openAIAnalysisRoundTwoPending: z.literal(true),
  noNewCheckpointCreated: z.literal(true),
})

export const RealEditorialPartialAnalysisRecoveryPlanSchema = z.discriminatedUnion('status', [
  RealEditorialPartialAnalysisRecoveryBaseSchema.extend({
    status: z.literal('required'),
    costStatus: z.literal('indeterminate'),
    recognizedCostEur: z.literal(0),
  }),
  RealEditorialPartialAnalysisRecoveryBaseSchema.extend({
    status: z.literal('applied'),
    costStatus: z.literal('prudentially_assumed'),
    recognizedCostEur: PositiveEuroAmountSchema,
    recoveryId: z.string().uuid(),
    recoveryKey: Sha256Schema,
    actorId: z.string().uuid(),
    reason: PartialAnalysisRecoveryReasonSchema,
    recoveredAt: TimestampSchema,
  }),
]).superRefine((value, context) => {
  if (value.spentCostEur + value.reservedCostEur > value.currentMaximumCostEur) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['spentCostEur'],
      message: 'El ledger supera el máximo vigente',
    })
  }
  if (
    value.status === 'applied'
    && value.recognizedCostEur !== value.maximumExposureCostEur
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recognizedCostEur'],
      message: 'La decisión prudencial debe asumir la exposición máxima de la llamada',
    })
  }
})

export const RealEditorialPartialAnalysisRecoverySchema = z.object({
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  incidentId: z.string().uuid(),
  callId: z.string().uuid(),
  reservationId: z.string().uuid(),
  actorId: z.string().uuid(),
  reason: PartialAnalysisRecoveryReasonSchema,
  assumedCostEur: PositiveEuroAmountSchema,
  confirmed: z.literal(true),
}).strict()

export const RealEditorialPartialAnalysisRecoveryResultSchema =
  RealEditorialPartialAnalysisRecoveryBaseSchema.extend({
    status: z.literal('applied'),
    costStatus: z.literal('prudentially_assumed'),
    recognizedCostEur: PositiveEuroAmountSchema,
    recoveryId: z.string().uuid(),
    recoveryKey: Sha256Schema,
    actorId: z.string().uuid(),
    reason: PartialAnalysisRecoveryReasonSchema,
    recoveredAt: TimestampSchema,
    nextAction: z.literal('resume_from_checkpoint'),
  }).superRefine((value, context) => {
    if (value.recognizedCostEur !== value.maximumExposureCostEur) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recognizedCostEur'],
        message: 'La decisión prudencial debe asumir la exposición máxima de la llamada',
      })
    }
  })

const HistoricalIncidentResolutionReasonSchema = z.string().trim().min(1).max(500).refine(
  value => !/(?:sk-|tvly-|api[_ -]?key|authorization|bearer\s)/i.test(value),
  'El motivo no puede contener credenciales ni cabeceras de autorización',
)

export const RealEditorialHistoricalIncidentClassificationSchema = z.enum([
  'active_blocker',
  'superseded_by_durable_recovery',
  'historical_non_blocking',
  'unresolved_requires_human_action',
])

export const RealEditorialHistoricalIncidentEvidenceKindSchema = z.enum([
  'durable_mission_reused',
  'equivalent_query_reused',
  'durable_recovery',
])

export const RealEditorialHistoricalIncidentAssessmentSchema = z.object({
  incidentId: z.string().uuid(),
  code: z.enum(['VERSION_CONFLICT', 'PERSISTENCE_ERROR']),
  message: z.string().trim().min(1).max(1_000),
  createdAt: TimestampSchema,
  classification: RealEditorialHistoricalIncidentClassificationSchema,
  evidenceKind: RealEditorialHistoricalIncidentEvidenceKindSchema.optional(),
  failureCheckpointVersion: z.number().int().positive().optional(),
  currentCheckpointVersion: z.number().int().positive(),
  failureCheckpointState: IdentifierSchema.optional(),
  currentCheckpointState: IdentifierSchema,
  artifactKind: z.enum(['mission', 'query']).optional(),
  artifactKey: z.string().trim().min(1).max(160).optional(),
  artifactVersion: z.number().int().positive().optional(),
  existingValue: z.string().trim().min(1).max(1_000).optional(),
  conflictingValue: z.string().trim().min(1).max(1_000).optional(),
  correctionReference: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  durableEvidence: z.array(z.string().trim().min(1).max(500)).max(12),
  riskEvaluation: z.string().trim().min(1).max(1_000),
  safeToResolve: z.boolean(),
})

const RealEditorialHistoricalIncidentReviewBaseSchema = z.object({
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  currentCheckpointVersion: z.number().int().positive(),
  currentCheckpointHash: Sha256Schema,
  spentCostEur: EuroAmountSchema,
  reservedCostEur: EuroAmountSchema,
  sourceCount: z.number().int().nonnegative(),
  assessments: z.array(RealEditorialHistoricalIncidentAssessmentSchema).min(1).max(10),
  providerCallsPerformed: z.literal(0),
  workflowResumed: z.literal(false),
})

export const RealEditorialHistoricalIncidentReviewSchema = z.discriminatedUnion('status', [
  RealEditorialHistoricalIncidentReviewBaseSchema.extend({
    status: z.literal('required'),
    resolutionAllowed: z.boolean(),
  }),
  RealEditorialHistoricalIncidentReviewBaseSchema.extend({
    status: z.literal('applied'),
    resolutionAllowed: z.literal(false),
    resolutionBatchId: z.string().uuid(),
    resolutionKey: Sha256Schema,
    actorId: z.string().uuid(),
    reason: HistoricalIncidentResolutionReasonSchema,
    resolvedAt: TimestampSchema,
  }),
]).superRefine((value, context) => {
  const safe = value.assessments.every(assessment => assessment.safeToResolve)
  if (value.status === 'required' && value.resolutionAllowed !== safe) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resolutionAllowed'],
      message: 'La resolución solo puede habilitarse cuando toda la evidencia es segura',
    })
  }
})

export const RealEditorialHistoricalIncidentResolutionSchema = z.object({
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  incidentIds: z.array(z.string().uuid()).min(1).max(10),
  actorId: z.string().uuid(),
  reason: HistoricalIncidentResolutionReasonSchema,
  confirmed: z.literal(true),
}).strict().superRefine((value, context) => {
  if (new Set(value.incidentIds).size !== value.incidentIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['incidentIds'],
      message: 'Los incidentes de la resolución deben ser únicos',
    })
  }
})

export const RealEditorialHistoricalIncidentResolutionResultSchema =
  RealEditorialHistoricalIncidentReviewBaseSchema.extend({
    status: z.literal('applied'),
    resolutionAllowed: z.literal(false),
    resolutionBatchId: z.string().uuid(),
    resolutionKey: Sha256Schema,
    actorId: z.string().uuid(),
    reason: HistoricalIncidentResolutionReasonSchema,
    resolvedAt: TimestampSchema,
    nextAction: z.literal('resume_from_checkpoint'),
  })

export const RealEditorialBudgetDecisionSchema = z.enum([
  'keep_limit',
  'authorize_extension',
  'cancel_permanently',
])

export const RealEditorialCoverageDecisionSchema = z.enum([
  'keep_review_required',
  'reject_editorial_run',
  'accept_with_warnings',
])

export const RealEditorialCoverageSafetyRuleSchema = z.enum([
  'avoid_categorical_contradictory_claims',
  'mark_pending_or_variable_data',
  'do_not_invent_operational_details',
  'adapt_warnings_to_profile',
  'preserve_evidence_traceability',
])

export const REAL_EDITORIAL_COVERAGE_SAFETY_RULES = [
  'avoid_categorical_contradictory_claims',
  'mark_pending_or_variable_data',
  'do_not_invent_operational_details',
  'adapt_warnings_to_profile',
  'preserve_evidence_traceability',
] as const

export const RealEditorialCoverageConstraintsSchema = z.object({
  decisionId: z.string().uuid(),
  checkpointVersion: z.number().int().positive(),
  checkpointHash: Sha256Schema,
  mode: z.literal('accept_with_warnings'),
  unresolvedGapIds: z.array(IdentifierSchema).min(1),
  contradictions: z.array(z.string().trim().min(1).max(2_000)).min(1),
  affectedProfiles: z.array(z.enum(['adventure', 'student'])).min(1),
  safetyRules: z.array(RealEditorialCoverageSafetyRuleSchema)
    .length(REAL_EDITORIAL_COVERAGE_SAFETY_RULES.length),
}).strict().superRefine((value, context) => {
  const uniqueGapIds = new Set(value.unresolvedGapIds)
  const uniqueContradictions = new Set(value.contradictions)
  const uniqueProfiles = new Set(value.affectedProfiles)
  const uniqueRules = new Set(value.safetyRules)
  if (uniqueGapIds.size !== value.unresolvedGapIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unresolvedGapIds'],
      message: 'Los gaps editoriales deben ser únicos',
    })
  }
  if (uniqueContradictions.size !== value.contradictions.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['contradictions'],
      message: 'Las contradicciones editoriales deben ser únicas',
    })
  }
  if (uniqueProfiles.size !== value.affectedProfiles.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['affectedProfiles'],
      message: 'Los perfiles afectados deben ser únicos',
    })
  }
  if (
    uniqueRules.size !== REAL_EDITORIAL_COVERAGE_SAFETY_RULES.length
    || REAL_EDITORIAL_COVERAGE_SAFETY_RULES.some(rule => !uniqueRules.has(rule))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['safetyRules'],
      message: 'Deben conservarse todas las protecciones editoriales de cobertura',
    })
  }
})

const RealEditorialCoverageDecisionBaseSchema = z.object({
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  actorId: z.string().uuid(),
  reason: HumanResolutionReasonSchema,
  note: HumanResolutionNoteSchema.optional(),
  confirmed: z.literal(true),
})

export const RealEditorialCoverageResolutionSchema = z.discriminatedUnion('decision', [
  RealEditorialCoverageDecisionBaseSchema.extend({
    decision: z.literal('keep_review_required'),
  }).strict(),
  RealEditorialCoverageDecisionBaseSchema.extend({
    decision: z.literal('reject_editorial_run'),
  }).strict(),
  RealEditorialCoverageDecisionBaseSchema.extend({
    decision: z.literal('accept_with_warnings'),
    riskAccepted: z.literal(true),
  }).strict(),
])

const RealEditorialCoverageGapDispositionSchema = z.object({
  gapId: IdentifierSchema,
  disposition: z.enum(['pending', 'rejected', 'accepted_unresolved']),
}).strict()

const RealEditorialCoverageDecisionSnapshotSchema = z.object({
  decisionId: z.string().uuid(),
  actorId: z.string().uuid(),
  decision: RealEditorialCoverageDecisionSchema,
  reason: HumanResolutionReasonSchema,
  note: HumanResolutionNoteSchema.optional(),
  riskAccepted: z.boolean(),
  riskStatement: z.string().trim().min(1).max(2_000),
  gapDispositions: z.array(RealEditorialCoverageGapDispositionSchema).min(1),
  decidedAt: TimestampSchema,
}).strict()

const RealEditorialCoverageEstimateSchema = z.object({
  remainingEstimatedCostEur: EuroAmountSchema,
  projectedTotalCostEur: EuroAmountSchema,
  shortfallCostEur: EuroAmountSchema,
}).strict()

export const RealEditorialCoverageReviewSchema = z.object({
  reviewId: z.string().uuid().optional(),
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  status: z.enum(['required', 'kept', 'accepted', 'rejected']),
  checkpointVersion: z.number().int().positive(),
  checkpointHash: Sha256Schema,
  coverageScore: z.number().min(0).max(1),
  gaps: z.array(RealKnowledgeGapSchema).min(1),
  contradictions: z.array(z.string().trim().min(1).max(2_000)).min(1),
  affectedProfiles: z.array(z.enum(['adventure', 'student'])).min(1),
  spentCostEur: EuroAmountSchema,
  reservedCostEur: EuroAmountSchema,
  currentMaximumCostEur: CurrentMaximumCostSchema,
  availableCostEur: EuroAmountSchema,
  estimates: z.object({
    keepReviewRequired: RealEditorialCoverageEstimateSchema,
    rejectEditorialRun: RealEditorialCoverageEstimateSchema,
    acceptWithWarnings: RealEditorialCoverageEstimateSchema,
  }).strict(),
  latestDecision: RealEditorialCoverageDecisionSnapshotSchema.optional(),
  editorialConstraints: RealEditorialCoverageConstraintsSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.status === 'accepted' && !value.editorialConstraints) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['editorialConstraints'],
      message: 'La cobertura aceptada debe conservar restricciones editoriales',
    })
  }
  const expectedAvailable = realEditorialEconomicValue(Math.max(
    0,
    value.currentMaximumCostEur - value.spentCostEur - value.reservedCostEur,
  ))
  if (!sameRealEditorialEconomicValue(value.availableCostEur, expectedAvailable)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['availableCostEur'],
      message: 'El disponible debe coincidir con el máximo vigente menos gasto y reserva',
    })
  }
  const expectedRemaining = {
    keepReviewRequired: 0,
    rejectEditorialRun: 0,
    acceptWithWarnings: REAL_EDITORIAL_COVERAGE_BUDGET.remainingCostEur,
  } as const
  for (const [key, remaining] of Object.entries(expectedRemaining) as Array<[
    keyof typeof expectedRemaining,
    number,
  ]>) {
    const estimate = value.estimates[key]
    const projected = realEditorialEconomicValue(
      value.spentCostEur + value.reservedCostEur + remaining,
    )
    const shortfall = realEditorialEconomicValue(Math.max(
      0,
      projected - value.currentMaximumCostEur,
    ))
    if (!sameRealEditorialEconomicValue(estimate.remainingEstimatedCostEur, remaining)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['estimates', key, 'remainingEstimatedCostEur'],
        message: 'La estimación restante no corresponde a la opción humana',
      })
    }
    if (!sameRealEditorialEconomicValue(estimate.projectedTotalCostEur, projected)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['estimates', key, 'projectedTotalCostEur'],
        message: 'El total proyectado no concilia con el ledger',
      })
    }
    if (!sameRealEditorialEconomicValue(estimate.shortfallCostEur, shortfall)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['estimates', key, 'shortfallCostEur'],
        message: 'El déficit proyectado no concilia con el máximo vigente',
      })
    }
  }
})

function realEditorialEconomicValue(value: number): number {
  return Number(value.toFixed(9))
}

function sameRealEditorialEconomicValue(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.000000001
}

export const RealEditorialCoverageResolutionResultSchema = z.object({
  decisionId: z.string().uuid(),
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  decision: RealEditorialCoverageDecisionSchema,
  nextAction: z.enum(['review_required', 'cancelled', 'budget_review_required']),
  budgetReviewId: z.string().uuid().optional(),
  review: RealEditorialCoverageReviewSchema,
}).strict()

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
  context: z.enum(['workflow_completion', 'coverage_acceptance']).optional(),
  coverageDecisionId: z.string().uuid().optional(),
  checkpointVersion: z.number().int().positive().optional(),
  checkpointHash: Sha256Schema.optional(),
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

const RealEditorialProviderUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedCost: z.number().nonnegative(),
  currency: z.enum(['EUR', 'USD']),
  providerRequestIds: z.array(z.string().trim().min(1).max(240)).max(32).optional(),
})

export const RealEditorialDraftSchema = z.object({
  profile: z.enum(['adventure', 'student']),
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(100_000),
  approximateWordCount: z.number().int().positive(),
  promptVersion: IdentifierSchema,
  schemaVersion: IdentifierSchema,
  usage: RealEditorialProviderUsageSchema,
})

export const RealEditorialReviewSchema = z.object({
  outcome: z.enum(['passed', 'passed_with_warnings', 'review_required']),
  issues: z.array(z.string().trim().min(1).max(1_000)),
  promptVersion: IdentifierSchema,
  schemaVersion: IdentifierSchema,
  usage: RealEditorialProviderUsageSchema,
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

export const RealEditorialTerminalDecisionSchema = z.enum([
  'approve_editorial_result',
  'request_changes',
  'reject_editorial_result',
])

const terminalDecisionTextSchema = (maximum: number) => z.string().trim().min(1).max(maximum).refine(
  value => !/(?:sk-|tvly-|api[_ -]?key|authorization|bearer\s)/i.test(value),
  'La decisión terminal no puede contener credenciales ni cabeceras de autorización',
)

const TerminalDecisionTextSchema = terminalDecisionTextSchema(2_000)
const TerminalDecisionReasonSchema = terminalDecisionTextSchema(500)

export const RealEditorialTerminalProfileCommentSchema = z.object({
  profile: z.enum(['adventure', 'student']),
  comment: TerminalDecisionTextSchema,
}).strict()

const RealEditorialTerminalResolutionBaseSchema = z.object({
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  actorId: z.string().uuid(),
  reason: TerminalDecisionReasonSchema,
  observations: TerminalDecisionTextSchema,
  confirmed: z.literal(true),
})

export const RealEditorialTerminalResolutionSchema = z.discriminatedUnion('decision', [
  RealEditorialTerminalResolutionBaseSchema.extend({
    decision: z.literal('approve_editorial_result'),
    affectedProfiles: z.tuple([z.literal('adventure'), z.literal('student')]),
    profileComments: z.array(RealEditorialTerminalProfileCommentSchema).max(0),
    warningsAccepted: z.literal(true),
  }).strict(),
  RealEditorialTerminalResolutionBaseSchema.extend({
    decision: z.literal('request_changes'),
    affectedProfiles: z.array(z.enum(['adventure', 'student'])).min(1).max(2),
    profileComments: z.array(RealEditorialTerminalProfileCommentSchema).min(1).max(2),
    warningsAccepted: z.literal(false),
  }).strict(),
  RealEditorialTerminalResolutionBaseSchema.extend({
    decision: z.literal('reject_editorial_result'),
    affectedProfiles: z.tuple([z.literal('adventure'), z.literal('student')]),
    profileComments: z.array(RealEditorialTerminalProfileCommentSchema).max(0),
    warningsAccepted: z.literal(false),
  }).strict(),
]).superRefine((value, context) => {
  const profiles = new Set(value.affectedProfiles)
  if (profiles.size !== value.affectedProfiles.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['affectedProfiles'],
      message: 'Los perfiles afectados deben ser únicos',
    })
  }
  if (value.decision !== 'request_changes') return
  const comments = new Map(value.profileComments.map(item => [item.profile, item.comment]))
  if (
    comments.size !== value.profileComments.length
    || comments.size !== profiles.size
    || [...profiles].some(profile => !comments.has(profile))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['profileComments'],
      message: 'Solicitar cambios exige un comentario concreto y único por perfil afectado',
    })
  }
})

export const RealEditorialTerminalArtifactReferenceSchema = z.object({
  artifactId: z.string().uuid(),
  kind: z.enum(['draft_adventure', 'draft_student', 'final_review', 'checkpoint']),
  key: IdentifierSchema,
  version: z.number().int().positive(),
  hash: Sha256Schema,
  createdAt: TimestampSchema,
}).strict()

export const RealEditorialTerminalBudgetSchema = z.object({
  spentCostEur: z.number().finite().nonnegative(),
  reservedCostEur: z.number().finite().nonnegative(),
  currentMaximumCostEur: CurrentMaximumCostSchema,
  availableCostEur: z.number().finite().nonnegative(),
  automatedWorkRemainingEur: z.literal(0),
  projectedTotalCostEur: z.number().finite().nonnegative(),
  shortfallCostEur: z.number().finite().nonnegative(),
}).strict().superRefine((value, context) => {
  const available = realEditorialEconomicValue(Math.max(
    0,
    value.currentMaximumCostEur - value.spentCostEur - value.reservedCostEur,
  ))
  const projected = realEditorialEconomicValue(value.spentCostEur + value.reservedCostEur)
  const shortfall = realEditorialEconomicValue(Math.max(
    0,
    projected - value.currentMaximumCostEur,
  ))
  for (const [path, received, expected] of [
    ['availableCostEur', value.availableCostEur, available],
    ['projectedTotalCostEur', value.projectedTotalCostEur, projected],
    ['shortfallCostEur', value.shortfallCostEur, shortfall],
  ] as const) {
    if (!sameRealEditorialEconomicValue(received, expected)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message: 'La proyección terminal debe coincidir con el ledger autoritativo',
      })
    }
  }
})

export const RealEditorialTerminalDecisionRecordSchema = z.object({
  decisionId: z.string().uuid(),
  decisionKey: Sha256Schema,
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  actorId: z.string().uuid(),
  decision: RealEditorialTerminalDecisionSchema,
  reason: TerminalDecisionReasonSchema,
  observations: TerminalDecisionTextSchema,
  affectedProfiles: z.array(z.enum(['adventure', 'student'])).min(1).max(2),
  profileComments: z.array(RealEditorialTerminalProfileCommentSchema).max(2),
  warningsAccepted: z.boolean(),
  resultingState: z.enum(['human_approved', 'changes_requested', 'human_rejected']),
  decidedAt: TimestampSchema,
  providerCallsPerformed: z.literal(0),
  reservationsCreated: z.literal(0),
  publicationCount: z.literal(0),
  trawelConnected: z.literal(false),
  automaticEnabled: z.literal(false),
}).strict().superRefine((value, context) => {
  const expectedState = value.decision === 'approve_editorial_result'
    ? 'human_approved'
    : value.decision === 'request_changes'
      ? 'changes_requested'
      : 'human_rejected'
  if (value.resultingState !== expectedState) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resultingState'],
      message: 'El estado durable no coincide con la decisión editorial terminal',
    })
  }
  if (value.warningsAccepted !== (value.decision === 'approve_editorial_result')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['warningsAccepted'],
      message: 'La aceptación de warnings no coincide con la decisión editorial terminal',
    })
  }
})

export const RealEditorialLibraryTransferSchema = z.object({
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  actorId: z.string().uuid(),
  confirmed: z.literal(true),
}).strict()

export const RealEditorialLibraryQuerySchema = z.object({
  destination: z.string().trim().min(1).max(200).optional(),
  profile: z.enum(['adventure', 'student']).optional(),
  status: z.literal('approved_unpublished').optional(),
  origin: z.literal('real_editorial_pilot').optional(),
}).strict()

export const RealEditorialLibraryEvidenceTraceSchema = z.object({
  claimId: IdentifierSchema,
  statement: z.string().trim().min(1).max(5_000),
  confidence: z.number().finite().min(0).max(1),
  evidenceIds: z.array(IdentifierSchema).min(1).max(30),
}).strict()

export const RealEditorialLibraryEntrySchema = z.object({
  entryId: z.string().uuid(),
  transferId: z.string().uuid(),
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  destination: z.object({
    canonicalId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    countryCode: z.string().length(2),
    type: z.enum(['country', 'region', 'locality', 'zone']),
  }).strict(),
  profile: z.enum(['adventure', 'student']),
  title: z.string().trim().min(1).max(500),
  content: z.string().min(1),
  editorialVersion: z.number().int().positive(),
  language: z.literal('es-ES'),
  status: z.literal('approved_unpublished'),
  editorialState: z.literal('approved'),
  libraryState: z.literal('ready_for_library'),
  publicationState: z.literal('unpublished'),
  origin: z.literal('real_editorial_pilot'),
  sourceArtifact: RealEditorialTerminalArtifactReferenceSchema,
  finalReviewArtifact: RealEditorialTerminalArtifactReferenceSchema.extend({
    kind: z.literal('final_review'),
    key: z.literal('final'),
  }),
  terminalDecisionId: z.string().uuid(),
  reviewOutcome: z.literal('passed_with_warnings'),
  warnings: z.array(z.string().trim().min(1).max(2_000)).min(1),
  gaps: z.array(RealKnowledgeGapSchema).min(1),
  contradictions: z.array(z.string().trim().min(1).max(2_000)).min(1),
  claims: z.array(RealKnowledgeClaimSchema).min(1),
  evidence: z.array(RealEditorialLibraryEvidenceTraceSchema).min(1),
  sources: z.array(RealResearchSourceSchema).min(1),
  approvalActorId: z.string().uuid(),
  transferActorId: z.string().uuid(),
  finalRunCostEur: z.number().finite().nonnegative(),
  currency: z.literal('EUR'),
  approvedAt: TimestampSchema,
  createdAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  const expectedKind = value.profile === 'adventure' ? 'draft_adventure' : 'draft_student'
  if (value.sourceArtifact.kind !== expectedKind || value.sourceArtifact.key !== value.profile) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceArtifact'],
      message: 'El perfil de Biblioteca no coincide con el artefacto editorial de origen',
    })
  }
  const sourceIds = new Set(value.sources.map(item => item.id))
  const claimIds = new Set(value.claims.map(item => item.id))
  if (
    value.claims.some(claim => claim.evidenceIds.some(id => !sourceIds.has(id)))
    || value.evidence.some(trace => !claimIds.has(trace.claimId))
    || value.claims.some(claim => !value.evidence.some(trace => trace.claimId === claim.id))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidence'],
      message: 'La Biblioteca debe conservar fuentes y trazas para todos los claims',
    })
  }
})

export const RealEditorialLibraryIntegrationSchema = z.object({
  status: z.literal('integrated'),
  transferId: z.string().uuid(),
  transferKey: Sha256Schema,
  state: z.literal('ready_for_library'),
  entries: z.array(RealEditorialLibraryEntrySchema).length(2),
  actorId: z.string().uuid(),
  transferredAt: TimestampSchema,
  providerCallsPerformed: z.literal(0),
  reservationsCreated: z.literal(0),
  ledgerCostEur: z.literal(0),
  publicationCount: z.literal(0),
  trawelConnected: z.literal(false),
  automaticEnabled: z.literal(false),
}).strict().superRefine((value, context) => {
  const profiles = new Set(value.entries.map(entry => entry.profile))
  if (!profiles.has('adventure') || !profiles.has('student')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['entries'],
      message: 'La incorporación debe contener Aventura y Estudiante exactamente una vez',
    })
  }
})

export const RealEditorialLibraryTransferResultSchema = z.intersection(
  RealEditorialLibraryIntegrationSchema,
  z.object({ reused: z.boolean() }).strict(),
)

export const RealEditorialTerminalResultSchema = z.object({
  pilotId: z.string().uuid(),
  runId: z.string().uuid(),
  state: z.enum([
    'pending_human_review',
    'human_approved',
    'ready_for_library',
    'changes_requested',
    'human_rejected',
  ]),
  snapshot: RealEditorialPilotSnapshotSchema,
  drafts: z.array(RealEditorialDraftSchema).length(2),
  review: RealEditorialReviewSchema,
  artifacts: z.object({
    snapshot: RealEditorialTerminalArtifactReferenceSchema.extend({
      kind: z.literal('checkpoint'),
      key: z.literal('pipeline'),
    }),
    adventure: RealEditorialTerminalArtifactReferenceSchema.extend({
      kind: z.literal('draft_adventure'),
      key: z.literal('adventure'),
    }),
    student: RealEditorialTerminalArtifactReferenceSchema.extend({
      kind: z.literal('draft_student'),
      key: z.literal('student'),
    }),
    finalReview: RealEditorialTerminalArtifactReferenceSchema.extend({
      kind: z.literal('final_review'),
      key: z.literal('final'),
    }),
  }).strict(),
  gaps: z.array(RealKnowledgeGapSchema).min(1),
  contradictions: z.array(z.string().trim().min(1).max(2_000)).min(1),
  budget: RealEditorialTerminalBudgetSchema,
  latestDecision: RealEditorialTerminalDecisionRecordSchema.optional(),
  libraryIntegration: z.union([
    z.literal('not_started'),
    RealEditorialLibraryIntegrationSchema,
  ]),
}).strict().superRefine((value, context) => {
  const snapshotProfiles = new Set(value.snapshot.drafts.map(draft => draft.profile))
  const authoritativeProfiles = new Set(value.drafts.map(draft => draft.profile))
  if (
    !snapshotProfiles.has('adventure')
    || !snapshotProfiles.has('student')
    || !value.snapshot.review
    || !authoritativeProfiles.has('adventure')
    || !authoritativeProfiles.has('student')
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['snapshot'],
      message: 'El resultado terminal exige ambos borradores y la revisión automática',
    })
  }
  const decisionState = value.state === 'ready_for_library' ? 'human_approved' : value.state
  if (value.latestDecision && value.latestDecision.resultingState !== decisionState) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['latestDecision', 'resultingState'],
      message: 'La decisión terminal debe coincidir con el estado durable actual',
    })
  }
})

export const RealEditorialTerminalResolutionResultSchema = z.object({
  decision: RealEditorialTerminalDecisionRecordSchema,
  nextAction: z.enum([
    'ready_for_library',
    'manual_regeneration_decision_required',
    'closed_without_publication',
  ]),
}).strict()

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
  coverageReview: RealEditorialCoverageReviewSchema.optional(),
  sourceLimitRecovery: RealEditorialSourceLimitRecoveryPlanSchema.optional(),
  partialAnalysisRecovery: RealEditorialPartialAnalysisRecoveryPlanSchema.optional(),
  historicalIncidentReview: RealEditorialHistoricalIncidentReviewSchema.optional(),
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
export type RealEditorialCoverageDecision = z.infer<
  typeof RealEditorialCoverageDecisionSchema
>
export type RealEditorialCoverageConstraints = z.infer<
  typeof RealEditorialCoverageConstraintsSchema
>
export type RealEditorialCoverageResolution = z.infer<
  typeof RealEditorialCoverageResolutionSchema
>
export type RealEditorialCoverageReview = z.infer<
  typeof RealEditorialCoverageReviewSchema
>
export type RealEditorialCoverageResolutionResult = z.infer<
  typeof RealEditorialCoverageResolutionResultSchema
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
export type RealEditorialPartialAnalysisRecoveryPlan = z.infer<
  typeof RealEditorialPartialAnalysisRecoveryPlanSchema
>
export type RealEditorialPartialAnalysisRecovery = z.infer<
  typeof RealEditorialPartialAnalysisRecoverySchema
>
export type RealEditorialPartialAnalysisRecoveryResult = z.infer<
  typeof RealEditorialPartialAnalysisRecoveryResultSchema
>
export type RealEditorialHistoricalIncidentClassification = z.infer<
  typeof RealEditorialHistoricalIncidentClassificationSchema
>
export type RealEditorialHistoricalIncidentEvidenceKind = z.infer<
  typeof RealEditorialHistoricalIncidentEvidenceKindSchema
>
export type RealEditorialHistoricalIncidentAssessment = z.infer<
  typeof RealEditorialHistoricalIncidentAssessmentSchema
>
export type RealEditorialHistoricalIncidentReview = z.infer<
  typeof RealEditorialHistoricalIncidentReviewSchema
>
export type RealEditorialHistoricalIncidentResolution = z.infer<
  typeof RealEditorialHistoricalIncidentResolutionSchema
>
export type RealEditorialHistoricalIncidentResolutionResult = z.infer<
  typeof RealEditorialHistoricalIncidentResolutionResultSchema
>
export type RealEditorialPilotBudget = z.infer<typeof RealEditorialPilotBudgetSchema>
export type RealEditorialPilotRecord = z.infer<typeof RealEditorialPilotRecordSchema>
export type RealEditorialPilotSnapshot = z.infer<typeof RealEditorialPilotSnapshotSchema>
export type RealEditorialPilotProgress = z.infer<typeof RealEditorialPilotProgressSchema>
export type RealEditorialTerminalDecision = z.infer<typeof RealEditorialTerminalDecisionSchema>
export type RealEditorialTerminalProfileComment = z.infer<
  typeof RealEditorialTerminalProfileCommentSchema
>
export type RealEditorialTerminalResolution = z.infer<
  typeof RealEditorialTerminalResolutionSchema
>
export type RealEditorialTerminalArtifactReference = z.infer<
  typeof RealEditorialTerminalArtifactReferenceSchema
>
export type RealEditorialTerminalBudget = z.infer<typeof RealEditorialTerminalBudgetSchema>
export type RealEditorialTerminalDecisionRecord = z.infer<
  typeof RealEditorialTerminalDecisionRecordSchema
>
export type RealEditorialLibraryTransfer = z.infer<
  typeof RealEditorialLibraryTransferSchema
>
export type RealEditorialLibraryQuery = z.infer<
  typeof RealEditorialLibraryQuerySchema
>
export type RealEditorialLibraryEntry = z.infer<
  typeof RealEditorialLibraryEntrySchema
>
export type RealEditorialLibraryEvidenceTrace = z.infer<
  typeof RealEditorialLibraryEvidenceTraceSchema
>
export type RealEditorialLibraryIntegration = z.infer<
  typeof RealEditorialLibraryIntegrationSchema
>
export type RealEditorialLibraryTransferResult = z.infer<
  typeof RealEditorialLibraryTransferResultSchema
>
export type RealEditorialTerminalResult = z.infer<typeof RealEditorialTerminalResultSchema>
export type RealEditorialTerminalResolutionResult = z.infer<
  typeof RealEditorialTerminalResolutionResultSchema
>
export type RealEditorialPreflight = z.infer<typeof RealEditorialPreflightSchema>
