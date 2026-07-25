import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const NonEmptyTextSchema = z.string().trim().min(1)
const IsoTimestampSchema = z.string().datetime({ offset: true })
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const HttpsUrlSchema = z.string().url().refine(value => value.startsWith('https://'), {
  message: 'La fuente debe usar HTTPS',
})

export const RealProviderCategorySchema = z.enum(['research_tool', 'intelligence_engine'])
export const RealProviderReferenceSchema = z.object({
  id: IdentifierSchema,
  category: RealProviderCategorySchema,
  displayName: NonEmptyTextSchema.max(120),
  model: NonEmptyTextSchema.max(160),
  active: z.boolean(),
})

export const RealEditorialProfileSchema = z.enum(['adventure', 'student'])
export const RealResearchDepthSchema = z.enum(['standard', 'deep'])
export const RealTargetWordCountSchema = z.number().int().min(100).max(10_000).refine(
  value => value % 100 === 0,
  'La extensión debe expresarse en incrementos de 100 palabras',
)
export const RealProfileConfigurationSchema = z.object({
  profile: RealEditorialProfileSchema,
  enabled: z.boolean(),
  targetWords: RealTargetWordCountSchema,
})

export const RealRoundNumberSchema = z.union([z.literal(1), z.literal(2)])
export const RealPipelineLimitsSchema = z.object({
  maxRounds: z.literal(2),
  maxFocusedQueriesPerRound: z.number().int().min(1).max(20),
  maxSources: z.number().int().min(1).max(200),
  maxCharactersPerSource: z.number().int().min(1_000).max(500_000),
  maxProviderCalls: z.number().int().min(1).max(100),
  maxInputTokens: z.number().int().min(1).max(1_000_000),
  maxOutputTokens: z.number().int().min(1).max(1_000_000),
  taskBudgetEur: z.number().positive().max(100),
  batchBudgetEur: z.number().positive().max(1_000),
  dailyBudgetEur: z.number().positive().max(10_000),
}).superRefine((value, context) => {
  if (value.taskBudgetEur > value.batchBudgetEur) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['taskBudgetEur'],
      message: 'El presupuesto de tarea no puede superar el presupuesto de lote',
    })
  }
  if (value.batchBudgetEur > value.dailyBudgetEur) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['batchBudgetEur'],
      message: 'El presupuesto de lote no puede superar el límite diario',
    })
  }
})

export const RealResearchMissionSchema = z.object({
  requestId: IdentifierSchema,
  runId: IdentifierSchema,
  taskId: IdentifierSchema,
  destination: z.object({
    canonicalId: IdentifierSchema,
    name: NonEmptyTextSchema.max(200),
    countryCode: z.string().length(2).transform(value => value.toUpperCase()),
    type: z.enum(['country', 'region', 'locality', 'zone']),
  }),
  language: z.string().length(2),
  profiles: z.array(RealProfileConfigurationSchema).min(1).max(2),
  depth: RealResearchDepthSchema,
  round: RealRoundNumberSchema,
  objectives: z.array(NonEmptyTextSchema.max(500)).min(1).max(30),
  focusedQueries: z.array(IdentifierSchema.max(500)).max(20),
  limits: RealPipelineLimitsSchema,
  createdAt: IsoTimestampSchema,
}).superRefine((value, context) => {
  const activeProfiles = value.profiles.filter(profile => profile.enabled)
  if (activeProfiles.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['profiles'],
      message: 'La misión requiere al menos un perfil activo',
    })
  }
  if (new Set(value.profiles.map(profile => profile.profile)).size !== value.profiles.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['profiles'],
      message: 'Los perfiles no pueden repetirse',
    })
  }
  if (value.round === 1 && value.focusedQueries.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['focusedQueries'],
      message: 'La ronda inicial no admite consultas de ampliación focalizada',
    })
  }
  if (value.round === 2 && value.focusedQueries.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['focusedQueries'],
      message: 'La segunda ronda requiere consultas focalizadas',
    })
  }
})

export const RealResearchSourceSchema = z.object({
  id: IdentifierSchema,
  round: RealRoundNumberSchema,
  url: HttpsUrlSchema,
  normalizedUrl: HttpsUrlSchema,
  title: NonEmptyTextSchema.max(500),
  publisher: z.string().trim().max(240).optional(),
  publishedAt: IsoTimestampSchema.optional(),
  capturedAt: IsoTimestampSchema,
  contentHash: Sha256Schema,
  score: z.number().min(0).max(1),
  content: z.string().max(500_000),
})

export const RealEvidenceSchema = z.object({
  id: IdentifierSchema,
  statement: NonEmptyTextSchema.max(5_000),
  sourceIds: z.array(IdentifierSchema).min(1).max(30),
  confidence: z.number().min(0).max(1),
  contradiction: z.enum(['none', 'suspected', 'confirmed']),
  freshness: z.enum(['current', 'dated', 'unknown']),
})

export const RealResearchDossierSchema = z.object({
  requestId: IdentifierSchema,
  runId: IdentifierSchema,
  taskId: IdentifierSchema,
  destinationId: IdentifierSchema,
  rounds: z.array(RealRoundNumberSchema).min(1).max(2).refine(
    rounds => new Set(rounds).size === rounds.length && rounds.every((round, index) => round === index + 1),
    'Las rondas deben ser únicas, correlativas y empezar en 1',
  ),
  sources: z.array(RealResearchSourceSchema),
  evidence: z.array(RealEvidenceSchema),
  generatedAt: IsoTimestampSchema,
})

export const RealKnowledgeClaimSchema = z.object({
  id: IdentifierSchema,
  topic: IdentifierSchema.max(160),
  statement: NonEmptyTextSchema.max(5_000),
  evidenceIds: z.array(IdentifierSchema).min(1).max(30),
  confidence: z.number().min(0).max(1),
  suitableProfiles: z.array(RealEditorialProfileSchema).min(1).max(2),
})

export const RealMasterKnowledgeSchema = z.object({
  requestId: IdentifierSchema,
  destinationId: IdentifierSchema,
  revision: z.number().int().min(1).max(2),
  claims: z.array(RealKnowledgeClaimSchema),
  contradictions: z.array(NonEmptyTextSchema.max(2_000)),
  generatedAt: IsoTimestampSchema,
})

export const RealCoverageTopicSchema = z.object({
  topic: IdentifierSchema.max(160),
  required: z.boolean(),
  coverage: z.number().min(0).max(1),
  evidenceIds: z.array(IdentifierSchema).max(30),
})
export const RealCoverageSchema = z.object({
  score: z.number().min(0).max(1),
  sufficient: z.boolean(),
  topics: z.array(RealCoverageTopicSchema).min(1),
})

export const RealKnowledgeGapSchema = z.object({
  id: IdentifierSchema,
  topic: IdentifierSchema.max(160),
  description: NonEmptyTextSchema.max(1_000),
  importance: z.enum(['low', 'medium', 'high', 'critical']),
  requiredForProfiles: z.array(RealEditorialProfileSchema).min(1).max(2),
  resolvableWithResearch: z.boolean(),
})

export const RealFocusedQuerySchema = z.object({
  id: IdentifierSchema,
  gapId: IdentifierSchema,
  query: NonEmptyTextSchema.max(500),
  rationale: NonEmptyTextSchema.max(1_000),
})

export const RealRoundResultSchema = z.object({
  round: RealRoundNumberSchema,
  dossier: RealResearchDossierSchema,
  masterKnowledge: RealMasterKnowledgeSchema,
  coverage: RealCoverageSchema,
  gaps: z.array(RealKnowledgeGapSchema),
  proposedQueries: z.array(RealFocusedQuerySchema),
  completedAt: IsoTimestampSchema,
}).superRefine((value, context) => {
  if (!value.dossier.rounds.includes(value.round)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dossier', 'rounds'],
      message: 'El expediente debe contener la ronda declarada',
    })
  }
  if (value.proposedQueries.some(query => !value.gaps.some(gap => gap.id === query.gapId))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['proposedQueries'],
      message: 'Cada consulta focalizada debe responder a una carencia conocida',
    })
  }
})

export const RealContinueDecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('continue_focused'),
    nextRound: z.literal(2),
    reason: NonEmptyTextSchema.max(1_000),
    queries: z.array(RealFocusedQuerySchema).min(1).max(20),
  }),
  z.object({
    action: z.literal('stop_ready'),
    reason: NonEmptyTextSchema.max(1_000),
    queries: z.array(RealFocusedQuerySchema).max(0),
  }),
  z.object({
    action: z.literal('stop_review_required'),
    reason: NonEmptyTextSchema.max(1_000),
    unresolvedGapIds: z.array(IdentifierSchema).min(1),
    queries: z.array(RealFocusedQuerySchema).max(0),
  }),
])

export const RealPipelineStateSchema = z.enum([
  'configured',
  'queued',
  'researching_round_1',
  'analyzing_round_1',
  'researching_round_2',
  'analyzing_round_2',
  'drafting',
  'quality_review',
  'ready_for_human_review',
  'review_required',
  'completed',
  'failed',
  'cancelled',
])

export type RealProviderCategory = z.infer<typeof RealProviderCategorySchema>
export type RealProviderReference = z.infer<typeof RealProviderReferenceSchema>
export type RealEditorialProfile = z.infer<typeof RealEditorialProfileSchema>
export type RealResearchDepth = z.infer<typeof RealResearchDepthSchema>
export type RealProfileConfiguration = z.infer<typeof RealProfileConfigurationSchema>
export type RealPipelineLimits = z.infer<typeof RealPipelineLimitsSchema>
export type RealResearchMission = z.infer<typeof RealResearchMissionSchema>
export type RealResearchSource = z.infer<typeof RealResearchSourceSchema>
export type RealEvidence = z.infer<typeof RealEvidenceSchema>
export type RealResearchDossier = z.infer<typeof RealResearchDossierSchema>
export type RealMasterKnowledge = z.infer<typeof RealMasterKnowledgeSchema>
export type RealCoverage = z.infer<typeof RealCoverageSchema>
export type RealKnowledgeGap = z.infer<typeof RealKnowledgeGapSchema>
export type RealFocusedQuery = z.infer<typeof RealFocusedQuerySchema>
export type RealRoundNumber = z.infer<typeof RealRoundNumberSchema>
export type RealRoundResult = z.infer<typeof RealRoundResultSchema>
export type RealContinueDecision = z.infer<typeof RealContinueDecisionSchema>
export type RealPipelineState = z.infer<typeof RealPipelineStateSchema>
