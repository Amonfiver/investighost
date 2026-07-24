import { z } from 'zod'

const UuidSchema = z.string().uuid()
const TimestampSchema = z.date()
const NonEmptyTextSchema = z.string().trim().min(1)
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const HttpsUrlSchema = z.string().url().refine(value => value.startsWith('https://'), {
  message: 'La fuente debe usar HTTPS',
})

export const EditorialProfileSchema = z.enum(['adventure', 'student'])
export const ResearchDepthSchema = z.enum(['standard', 'deep'])
export const ResearchStateSchema = z.enum([
  'draft',
  'queued',
  'researching',
  'structuring',
  'validating',
  'completed',
  'retry_pending',
  'failed',
  'cancelled',
])
export const ResearchStageSchema = z.enum([
  'destination_resolution',
  'source_discovery',
  'source_reading',
  'fact_structuring',
  'profile_generation',
  'quality_review',
  'human_review',
])
export const ResearchRunStateSchema = z.enum([
  'queued', 'running', 'checkpointed', 'completed', 'retry_pending', 'failed', 'cancelled',
])
export const ResearchFailureClassificationSchema = z.enum([
  'data_quality', 'provider', 'persistence', 'checkpoint', 'budget', 'cancellation', 'pipeline',
])
export const EditorialDraftStateSchema = z.enum([
  'generating', 'ready', 'in_review', 'changes_requested', 'approved', 'rejected', 'archived',
])
export const QualityOutcomeSchema = z.enum([
  'passed', 'passed_with_warnings', 'changes_requested', 'blocked', 'rejected',
])

export const researchStateTransitions = {
  draft: ['queued', 'cancelled'],
  queued: ['researching', 'cancelled', 'failed'],
  researching: ['structuring', 'retry_pending', 'failed', 'cancelled'],
  structuring: ['validating', 'retry_pending', 'failed', 'cancelled'],
  validating: ['completed', 'retry_pending', 'failed', 'cancelled'],
  completed: [],
  retry_pending: ['researching', 'structuring', 'validating', 'failed', 'cancelled'],
  failed: ['queued', 'cancelled'],
  cancelled: [],
} as const satisfies Record<z.infer<typeof ResearchStateSchema>, readonly string[]>

export const editorialDraftTransitions = {
  generating: ['ready', 'rejected'],
  ready: ['in_review', 'archived'],
  in_review: ['changes_requested', 'approved', 'rejected'],
  changes_requested: ['generating', 'in_review', 'archived'],
  approved: ['in_review', 'archived'],
  rejected: ['generating', 'in_review', 'archived'],
  archived: [],
} as const satisfies Record<z.infer<typeof EditorialDraftStateSchema>, readonly string[]>

export const GeographicEntitySchema = z.object({
  id: UuidSchema,
  parentId: UuidSchema.optional(),
  type: z.enum(['country', 'region', 'locality', 'zone']),
  name: NonEmptyTextSchema.max(160),
  normalizedName: NonEmptyTextSchema.max(160),
  aliases: z.array(NonEmptyTextSchema.max(160)).max(50),
  countryCode: z.string().length(2),
  regionCode: z.string().max(20).optional(),
  slug: SlugSchema,
  coordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).optional(),
  sourceName: NonEmptyTextSchema.max(120),
  sourceVersion: NonEmptyTextSchema.max(80),
  sourceLicense: NonEmptyTextSchema.max(160),
  sourceSnapshotId: UuidSchema.optional(),
  sourceCheckedAt: TimestampSchema.optional(),
  externalIds: z.record(NonEmptyTextSchema.max(160)).optional(),
  status: z.enum(['active', 'deprecated']),
  resolutionMethod: z.enum(['exact', 'alias', 'tolerant', 'human']),
  ambiguityCandidateIds: z.array(UuidSchema).max(20),
  version: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).superRefine((value, context) => {
  if (value.type !== 'country' && !value.parentId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['parentId'], message: 'Una entidad no país requiere padre' })
  }
  if (value.resolutionMethod !== 'human' && value.ambiguityCandidateIds.includes(value.id)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ambiguityCandidateIds'], message: 'Una entidad no puede ser su propia alternativa' })
  }
})

export const EditorialResearchRequestSchema = z.object({
  id: UuidSchema,
  destinationId: UuidSchema,
  destinationQuerySnapshot: NonEmptyTextSchema.max(300),
  profiles: z.array(EditorialProfileSchema).min(1).max(2),
  language: z.string().length(2),
  depth: ResearchDepthSchema,
  notes: z.string().max(2000).optional(),
  options: z.record(z.unknown()),
  configurationVersion: NonEmptyTextSchema.max(80),
  idempotencyKey: NonEmptyTextSchema.max(200),
  actorId: UuidSchema,
  state: ResearchStateSchema,
  version: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).superRefine((value, context) => {
  if (new Set(value.profiles).size !== value.profiles.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['profiles'], message: 'Los perfiles no pueden repetirse' })
  }
})

export const EditorialResearchRunSchema = z.object({
  id: UuidSchema,
  requestId: UuidSchema,
  stage: ResearchStageSchema,
  providerId: NonEmptyTextSchema.max(80),
  model: NonEmptyTextSchema.max(120),
  promptVersion: NonEmptyTextSchema.max(80),
  contractVersion: NonEmptyTextSchema.max(80),
  attempt: z.number().int().positive(),
  estimatedCost: z.number().nonnegative(),
  actualCost: z.number().nonnegative().optional(),
  currency: z.string().length(3),
  inputUnits: z.number().int().nonnegative(),
  outputUnits: z.number().int().nonnegative(),
  startedAt: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional(),
  errorCode: z.string().max(120).optional(),
  errorMessage: z.string().max(2000).optional(),
  failureClassification: ResearchFailureClassificationSchema.optional(),
  recoveryFromRunId: UuidSchema.optional(),
  cancelledBy: UuidSchema.optional(),
  state: ResearchRunStateSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).superRefine((value, context) => {
  if (value.completedAt && value.startedAt && value.completedAt < value.startedAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['completedAt'], message: 'El fin no puede preceder al inicio' })
  }
  if (value.state === 'failed' && !value.errorCode) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['errorCode'], message: 'Una ejecución fallida requiere código de error' })
  }
  if (value.state === 'failed' && !value.failureClassification) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['failureClassification'], message: 'Una ejecución fallida requiere clasificación' })
  }
})

export const ResearchSourceFailureSchema = z.object({
  errorCode: NonEmptyTextSchema.max(120),
  httpStatus: z.number().int().min(100).max(599).optional(),
  message: NonEmptyTextSchema.max(2000),
  stage: z.literal('source_reading'),
  occurredAt: TimestampSchema,
  attempt: z.number().int().positive(),
  providerId: NonEmptyTextSchema.max(80),
  operation: z.enum(['reading', 'evaluation']),
})

export const ResearchSourceSchema = z.object({
  id: UuidSchema,
  runId: UuidSchema,
  url: HttpsUrlSchema,
  normalizedUrl: HttpsUrlSchema,
  title: NonEmptyTextSchema.max(500),
  author: z.string().max(200).optional(),
  publisher: z.string().max(200).optional(),
  publishedAt: TimestampSchema.optional(),
  query: NonEmptyTextSchema.max(500),
  sourceType: z.enum(['official', 'tourism', 'heritage', 'news', 'academic', 'blog', 'reviews', 'other']),
  territorialScope: z.enum(['destination', 'local', 'regional', 'national', 'global']),
  freshness: z.enum(['current', 'dated', 'unknown']),
  reliability: z.number().min(0).max(1),
  duplicateOfId: UuidSchema.optional(),
  status: z.enum(['discovered', 'read', 'accepted', 'rejected', 'unavailable']),
  fingerprint: Sha256Schema,
  metadata: z.record(z.unknown()),
  capturedAt: TimestampSchema,
}).superRefine((value, context) => {
  if (value.metadata.failure === undefined) return
  const parsed = ResearchSourceFailureSchema.safeParse(value.metadata.failure)
  if (!parsed.success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['metadata', 'failure'], message: 'El fallo de fuente no cumple el contrato durable' })
    return
  }
  if (value.status !== 'unavailable') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Solo una fuente no disponible puede conservar un fallo' })
  }
  if (value.metadata.errorCode !== parsed.data.errorCode) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['metadata', 'errorCode'], message: 'El código resumido y el fallo de fuente deben coincidir' })
  }
})

export const ResearchFactSchema = z.object({
  id: UuidSchema,
  requestId: UuidSchema,
  destinationId: UuidSchema,
  statement: NonEmptyTextSchema.max(5000),
  category: z.enum(['geography', 'history', 'culture', 'nature', 'logistics', 'cost', 'safety', 'accessibility', 'service', 'other']),
  sourceIds: z.array(UuidSchema).min(1),
  confidence: z.number().min(0).max(1),
  contradiction: z.enum(['none', 'suspected', 'confirmed']),
  volatility: z.enum(['stable', 'seasonal', 'volatile']),
  reviewStatus: z.enum(['pending', 'verified', 'disputed', 'rejected']),
  validFrom: TimestampSchema.optional(),
  validUntil: TimestampSchema.optional(),
  version: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).superRefine((value, context) => {
  if (value.validFrom && value.validUntil && value.validUntil < value.validFrom) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['validUntil'], message: 'La validez final no puede preceder a la inicial' })
  }
})

const ProfileRelevanceSchema = z.object({
  adventure: z.number().min(0).max(1),
  student: z.number().min(0).max(1),
})

export const ResearchPlaceSchema = z.object({
  id: UuidSchema,
  requestId: UuidSchema,
  destinationId: UuidSchema,
  name: NonEmptyTextSchema.max(300),
  category: z.enum(['monument', 'museum', 'nature', 'experience', 'food', 'hidden_gem', 'neighborhood', 'service', 'other']),
  position: z.number().int().nonnegative(),
  factIds: z.array(UuidSchema).min(1),
  sourceIds: z.array(UuidSchema).min(1),
  profileRelevance: ProfileRelevanceSchema,
  status: z.enum(['candidate', 'accepted', 'rejected', 'duplicate']),
  duplicateOfId: UuidSchema.optional(),
  version: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export const ResearchActivitySchema = z.object({
  id: UuidSchema,
  requestId: UuidSchema,
  destinationId: UuidSchema,
  name: NonEmptyTextSchema.max(300),
  audienceProfiles: z.array(EditorialProfileSchema).min(1),
  durationMinutes: z.number().int().positive().optional(),
  costBand: z.enum(['free', 'budget', 'moderate', 'high', 'unknown']),
  season: z.string().max(200).optional(),
  requirements: z.array(NonEmptyTextSchema.max(300)),
  accessibility: z.array(NonEmptyTextSchema.max(300)),
  riskNotes: z.array(NonEmptyTextSchema.max(500)),
  factIds: z.array(UuidSchema).min(1),
  sourceIds: z.array(UuidSchema).min(1),
  version: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export const EditorialDraftSchema = z.object({
  id: UuidSchema,
  requestId: UuidSchema,
  runId: UuidSchema,
  profile: EditorialProfileSchema,
  title: NonEmptyTextSchema.max(300),
  introduction: NonEmptyTextSchema.max(5000),
  promptVersion: NonEmptyTextSchema.max(80),
  contentVersion: z.number().int().positive(),
  state: EditorialDraftStateSchema,
  previousDraftId: UuidSchema.optional(),
  regenerationReason: z.string().trim().min(1).max(1000).optional(),
  humanEdited: z.boolean(),
  createdBy: UuidSchema,
  updatedBy: UuidSchema,
  version: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export const EditorialSectionSchema = z.object({
  id: UuidSchema,
  draftId: UuidSchema,
  kind: z.enum(['overview', 'highlights', 'route', 'practical', 'risks', 'budget', 'daily_life', 'study', 'sources', 'other']),
  heading: NonEmptyTextSchema.max(300),
  content: NonEmptyTextSchema.max(20_000),
  position: z.number().int().nonnegative(),
  factIds: z.array(UuidSchema).min(1),
  sourceIds: z.array(UuidSchema).min(1),
  promptVersion: NonEmptyTextSchema.max(80),
  humanEdited: z.boolean(),
  regenerationReason: z.string().max(1000).optional(),
  version: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export const QualityCheckSchema = z.object({
  id: UuidSchema,
  reviewId: UuidSchema,
  code: NonEmptyTextSchema.max(120),
  severity: z.enum(['info', 'warning', 'error', 'blocker']),
  result: z.enum(['passed', 'warning', 'failed']),
  evidence: NonEmptyTextSchema.max(5000),
  correction: z.string().max(5000).optional(),
  responsible: z.enum(['system', 'editor', 'reviewer']),
  ruleVersion: NonEmptyTextSchema.max(80),
  createdAt: TimestampSchema,
})

export const QualityReviewSchema = z.object({
  id: UuidSchema,
  draftId: UuidSchema,
  draftVersion: z.number().int().positive(),
  outcome: QualityOutcomeSchema,
  ruleVersion: NonEmptyTextSchema.max(80),
  checkIds: z.array(UuidSchema).min(1),
  reviewedAt: TimestampSchema,
})

export const ProviderUsageSchema = z.object({
  id: UuidSchema,
  runId: UuidSchema,
  stage: ResearchStageSchema,
  providerId: NonEmptyTextSchema.max(80),
  model: NonEmptyTextSchema.max(120),
  inputUnits: z.number().int().nonnegative(),
  outputUnits: z.number().int().nonnegative(),
  estimatedCost: z.number().nonnegative(),
  actualCost: z.number().nonnegative().optional(),
  currency: z.string().length(3),
  budgetLimit: z.number().nonnegative(),
  cause: NonEmptyTextSchema.max(300),
  createdAt: TimestampSchema,
})

export const ResearchEventSchema = z.object({
  id: UuidSchema,
  requestId: UuidSchema,
  runId: UuidSchema.optional(),
  type: NonEmptyTextSchema.max(120),
  stage: ResearchStageSchema.optional(),
  actorId: UuidSchema.optional(),
  correlationId: NonEmptyTextSchema.max(200),
  payload: z.record(z.unknown()),
  occurredAt: TimestampSchema,
})

export const EditorialDraftBundleSchema = z.object({
  draft: EditorialDraftSchema,
  sections: z.array(EditorialSectionSchema).min(1),
})

export const ResearchDestinationInputSchema = z.object({
  destinationQuery: NonEmptyTextSchema.max(300),
  profiles: z.array(EditorialProfileSchema).min(1).max(2),
  language: z.string().length(2).default('es'),
  depth: ResearchDepthSchema.default('standard'),
  notes: z.string().max(2000).optional(),
  options: z.record(z.unknown()).default({}),
  idempotencyKey: NonEmptyTextSchema.max(200),
  actorId: UuidSchema,
}).superRefine((value, context) => {
  if (new Set(value.profiles).size !== value.profiles.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['profiles'], message: 'Los perfiles no pueden repetirse' })
  }
})

export const ResearchDestinationResultSchema = z.object({
  request: EditorialResearchRequestSchema,
  run: EditorialResearchRunSchema,
  previousRuns: z.array(EditorialResearchRunSchema).default([]),
  destination: GeographicEntitySchema,
  sources: z.array(ResearchSourceSchema).min(1),
  facts: z.array(ResearchFactSchema).min(1),
  places: z.array(ResearchPlaceSchema),
  activities: z.array(ResearchActivitySchema),
  drafts: z.array(EditorialDraftBundleSchema).min(1),
  qualityReviews: z.array(QualityReviewSchema),
  qualityChecks: z.array(QualityCheckSchema),
  usage: z.array(ProviderUsageSchema),
  events: z.array(ResearchEventSchema).min(1),
}).superRefine((value, context) => {
  const addIntegrityIssue = (path: (string | number)[], message: string) => {
    context.addIssue({ code: z.ZodIssueCode.custom, path, message })
  }
  if (value.request.destinationId !== value.destination.id) {
    addIntegrityIssue(['request', 'destinationId'], 'La solicitud no pertenece al destino del agregado')
  }
  if (value.run.requestId !== value.request.id) {
    addIntegrityIssue(['run', 'requestId'], 'La ejecución no pertenece a la solicitud del agregado')
  }
  const knownRunIds = new Set([value.run.id, ...value.previousRuns.map(run => run.id)])
  if (knownRunIds.size !== value.previousRuns.length + 1) {
    addIntegrityIssue(['previousRuns'], 'El historial de ejecuciones contiene identificadores duplicados')
  }
  if (value.previousRuns.some(run => run.requestId !== value.request.id)) {
    addIntegrityIssue(['previousRuns'], 'Una ejecución histórica pertenece a otra solicitud')
  }
  const requestedProfiles = new Set(value.request.profiles)
  const draftProfiles = value.drafts.map(bundle => bundle.draft.profile)
  if (new Set(draftProfiles).size !== draftProfiles.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['drafts'], message: 'Solo puede existir un borrador actual por perfil' })
  }
  for (const profile of requestedProfiles) {
    if (!draftProfiles.includes(profile)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['drafts'], message: `Falta el perfil ${profile}` })
    }
  }
  const knownSourceIds = new Set(value.sources.map(source => source.id))
  const knownFactIds = new Set(value.facts.map(fact => fact.id))
  const knownPlaceIds = new Set(value.places.map(place => place.id))
  const knownDraftIds = new Set(value.drafts.map(bundle => bundle.draft.id))
  const knownReviewIds = new Set(value.qualityReviews.map(review => review.id))
  for (const source of value.sources) {
    if (source.runId !== value.run.id) {
      addIntegrityIssue(['sources'], 'Una fuente pertenece a otra ejecución')
    }
    if (source.duplicateOfId && !knownSourceIds.has(source.duplicateOfId)) {
      addIntegrityIssue(['sources'], 'Una fuente duplicada referencia una fuente inexistente')
    }
  }
  for (const fact of value.facts) {
    if (fact.requestId !== value.request.id || fact.destinationId !== value.destination.id) {
      addIntegrityIssue(['facts'], 'Un hecho pertenece a otra solicitud o destino')
    }
    if (fact.sourceIds.some(sourceId => !knownSourceIds.has(sourceId))) {
      addIntegrityIssue(['facts'], 'Un hecho referencia una fuente inexistente')
    }
  }
  for (const place of value.places) {
    if (place.requestId !== value.request.id || place.destinationId !== value.destination.id) {
      addIntegrityIssue(['places'], 'Un lugar pertenece a otra solicitud o destino')
    }
    if (place.factIds.some(factId => !knownFactIds.has(factId)) || place.sourceIds.some(sourceId => !knownSourceIds.has(sourceId))) {
      addIntegrityIssue(['places'], 'Un lugar referencia hechos o fuentes inexistentes')
    }
    if (place.duplicateOfId && !knownPlaceIds.has(place.duplicateOfId)) {
      addIntegrityIssue(['places'], 'Un lugar duplicado referencia un lugar inexistente')
    }
  }
  for (const activity of value.activities) {
    if (activity.requestId !== value.request.id || activity.destinationId !== value.destination.id) {
      addIntegrityIssue(['activities'], 'Una actividad pertenece a otra solicitud o destino')
    }
    if (activity.factIds.some(factId => !knownFactIds.has(factId)) || activity.sourceIds.some(sourceId => !knownSourceIds.has(sourceId))) {
      addIntegrityIssue(['activities'], 'Una actividad referencia hechos o fuentes inexistentes')
    }
  }
  for (const bundle of value.drafts) {
    if (bundle.draft.requestId !== value.request.id || bundle.draft.runId !== value.run.id) {
      addIntegrityIssue(['drafts'], 'Un borrador pertenece a otra solicitud o ejecución')
    }
    for (const section of bundle.sections) {
      if (section.draftId !== bundle.draft.id) {
        addIntegrityIssue(['drafts'], 'Una sección pertenece a otro borrador')
      }
      if (section.factIds.some(factId => !knownFactIds.has(factId)) || section.sourceIds.some(sourceId => !knownSourceIds.has(sourceId))) {
        addIntegrityIssue(['drafts'], 'Una sección perdió la trazabilidad fuente→hecho→texto')
      }
    }
  }
  for (const review of value.qualityReviews) {
    if (!knownDraftIds.has(review.draftId)) {
      addIntegrityIssue(['qualityReviews'], 'Una revisión pertenece a un borrador inexistente')
    }
    if (review.checkIds.some(checkId => !value.qualityChecks.some(check => check.id === checkId && check.reviewId === review.id))) {
      addIntegrityIssue(['qualityReviews'], 'Una revisión referencia un control inexistente o ajeno')
    }
  }
  for (const check of value.qualityChecks) {
    if (!knownReviewIds.has(check.reviewId)) {
      addIntegrityIssue(['qualityChecks'], 'Un control pertenece a una revisión inexistente')
    }
  }
  if (value.usage.some(usage => usage.runId !== value.run.id)) {
    addIntegrityIssue(['usage'], 'Un registro de uso pertenece a otra ejecución')
  }
  if (value.events.some(event => event.requestId !== value.request.id || (event.runId && !knownRunIds.has(event.runId)))) {
    addIntegrityIssue(['events'], 'Un evento pertenece a otra solicitud o ejecución')
  }
  const adventure = value.drafts.find(bundle => bundle.draft.profile === 'adventure')
  const student = value.drafts.find(bundle => bundle.draft.profile === 'student')
  if (adventure && student) {
    const signature = (bundle: z.infer<typeof EditorialDraftBundleSchema>) =>
      bundle.sections.map(section => `${section.kind}:${section.heading}:${section.content}`).join('|').toLocaleLowerCase()
    if (signature(adventure) === signature(student)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['drafts'], message: 'Aventura y Estudiante deben diferenciarse por contenido y utilidad' })
    }
  }
})

export type EditorialProfile = z.infer<typeof EditorialProfileSchema>
export type ResearchFailureClassification = z.infer<typeof ResearchFailureClassificationSchema>
export type ResearchState = z.infer<typeof ResearchStateSchema>
export type ResearchStage = z.infer<typeof ResearchStageSchema>
export type GeographicEntity = z.infer<typeof GeographicEntitySchema>
export type EditorialResearchRequest = z.infer<typeof EditorialResearchRequestSchema>
export type EditorialResearchRun = z.infer<typeof EditorialResearchRunSchema>
export type ResearchSourceFailure = z.infer<typeof ResearchSourceFailureSchema>
export type ResearchSource = z.infer<typeof ResearchSourceSchema>
export type ResearchFact = z.infer<typeof ResearchFactSchema>
export type ResearchPlace = z.infer<typeof ResearchPlaceSchema>
export type ResearchActivity = z.infer<typeof ResearchActivitySchema>
export type CanonicalEditorialDraft = z.infer<typeof EditorialDraftSchema>
export type EditorialSection = z.infer<typeof EditorialSectionSchema>
export type QualityCheck = z.infer<typeof QualityCheckSchema>
export type QualityReview = z.infer<typeof QualityReviewSchema>
export type QualityOutcome = z.infer<typeof QualityOutcomeSchema>
export type ProviderUsage = z.infer<typeof ProviderUsageSchema>
export type ResearchEvent = z.infer<typeof ResearchEventSchema>
export type EditorialDraftBundle = z.infer<typeof EditorialDraftBundleSchema>
export type ResearchDestinationInput = z.infer<typeof ResearchDestinationInputSchema>
export type ResearchDestinationResult = z.infer<typeof ResearchDestinationResultSchema>
