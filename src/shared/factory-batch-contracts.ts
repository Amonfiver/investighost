import { z } from 'zod'
import { RedoGenerationGuidanceSchema } from './redo-guidance-contracts'
import { DestinationVisualMediaPackageSchema } from './destination-visual-media-contract'
import { StructuredEditorialPackageV1Schema } from './structured-editorial-package-contracts'

const IdSchema = z.string().uuid()
const TimestampSchema = z.date()
const NonEmptyText = z.string().trim().min(1)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

const DestinationBatchInputCanonicalSchema = z.object({
  batch: z.object({
    name: z.string(),
    maxCostPerDestination: z.number().nonnegative().optional(),
    maxCostPerBatch: z.number().nonnegative().optional(),
  }).superRefine((value, context) => {
    if (value.maxCostPerDestination !== undefined && value.maxCostPerBatch !== undefined && value.maxCostPerDestination > value.maxCostPerBatch) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['maxCostPerDestination'], message: 'El límite por destino no puede superar el límite de lote' })
    }
  }),
  destinations: z.array(z.unknown()),
})

/** `batch.name` remains the persisted V1 contract. `batchName` is accepted at
 * the import boundary so a person can use the concise documented JSON form. */
export const DestinationBatchInputSchema = z.preprocess(value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const input = value as Record<string, unknown>
  if (typeof input.batchName !== 'string' || input.batch !== undefined) return value
  const { batchName, ...rest } = input
  return { ...rest, batch: { name: batchName } }
}, DestinationBatchInputCanonicalSchema)

export const DestinationBatchDestinationSchema = z.object({
  name: z.string().trim().min(1).max(160),
  country: z.string().trim().min(1).max(120),
  region: z.string().trim().min(1).max(120).optional(),
}).strict()

export const DestinationBatchStatusSchema = z.enum([
  'IMPORTED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS',
])

export const DestinationJobStatusSchema = z.enum([
  'QUEUED', 'PROCESSING', 'READY_FOR_REVIEW', 'APPROVED', 'REDO_REQUIRED',
  'DELIVERED', 'FAILED', 'BLOCKED_AMBIGUOUS', 'REUSED',
])

export const DestinationJobPhaseSchema = z.enum([
  'IDENTITY', 'RESEARCH', 'ANALYSIS', 'STUDENT', 'ADVENTURE', 'VISUALS',
  'AUTO_REVIEW', 'DELIVERY',
])
export const DestinationBatchRedoScopeSchema = z.enum(['STUDENT', 'ADVENTURE', 'VISUALS', 'EDITORIAL'])

export const DestinationIdentityStateSchema = z.enum([
  'NEW', 'EXISTS', 'EXISTS_DELIVERED', 'EXISTS_WITH_APPROVED_CONTENT', 'AMBIGUOUS',
])

export const DestinationReusePolicySchema = z.enum([
  'NEEDS_NEW_PRODUCTION', 'CAN_REUSE_EXISTING', 'WAIT_FOR_EXISTING', 'AMBIGUOUS',
])

export const DestinationBatchIssueKindSchema = z.enum(['INVALID_ROW', 'DUPLICATE_INPUT'])

export const DestinationBatchIssueSchema = z.object({
  id: IdSchema,
  batchId: IdSchema,
  inputIndex: z.number().int().nonnegative(),
  kind: DestinationBatchIssueKindSchema,
  message: NonEmptyText.max(1000),
  normalizedIdentity: z.string().max(600).optional(),
  createdAt: TimestampSchema,
})

/** A durable, secret-free failure record.  The raw provider error is never a
 * renderer contract; only this sanitized context is. */
export const DestinationBatchFailureDiagnosticSchema = z.object({
  code: NonEmptyText.max(160),
  phase: DestinationJobPhaseSchema,
  operation: NonEmptyText.max(160),
  cause: NonEmptyText.max(1000),
  retryable: z.boolean(),
  occurredAt: TimestampSchema,
}).strict()

const ProviderUsageEvidenceSchema = z.object({
  evidenceType: z.literal('PROVIDER_USAGE_EXPORT'),
  provider: z.literal('deepseek'),
  model: NonEmptyText.max(120),
  windowStart: z.string().datetime({ offset: true }),
  windowEnd: z.string().datetime({ offset: true }),
  apiKeyName: z.string().trim().min(1).max(120).refine(value => !/(sk-|api[_ -]?key|authorization|bearer)/i.test(value)),
  requestCount: z.number().int().positive(),
  inputCacheHitTokens: z.number().int().nonnegative().optional(),
  inputCacheMissTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  providerCost: z.number().nonnegative(),
  currency: z.literal('USD'),
  requestIdPresentInExport: z.literal(false),
  limitation: NonEmptyText.max(1000),
}).strict()

export const BatchAmbiguousCallResolutionSchema = z.object({
  jobId: IdSchema,
  reservationId: IdSchema,
  providerCallId: IdSchema,
  decision: z.enum(['NO_CONSUMPTION', 'CONSUMPTION_CONFIRMED', 'INDETERMINATE', 'PRUDENTIAL_COST_ASSUMED']),
  responseRecovered: z.boolean(),
  evidence: ProviderUsageEvidenceSchema.optional(),
  prudentialCostEur: z.number().finite().positive().optional(),
  currency: z.literal('EUR').optional(),
  reason: z.string().trim().min(1).max(500).refine(value => !/(sk-|api[_ -]?key|authorization|bearer)/i.test(value)).optional(),
  acceptsPotentialDuplicateCharge: z.literal(true).optional(),
  note: z.string().trim().min(1).max(1000).optional(),
}).superRefine((value, context) => {
  const prudentialFields = ['prudentialCostEur', 'currency', 'reason', 'acceptsPotentialDuplicateCharge'] as const
  if (value.decision === 'PRUDENTIAL_COST_ASSUMED') {
    if (value.responseRecovered || value.evidence) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence'], message: 'La conciliación prudencial no confirma consumo ni recupera respuesta.' })
    }
    for (const field of prudentialFields) if (value[field] === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'La conciliación prudencial requiere importe, moneda, motivo y aceptación de riesgo.' })
    }
    return
  }
  for (const field of prudentialFields) if (value[field] !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'Los datos prudenciales sólo corresponden a esa conciliación.' })
  }
  if (value.decision === 'CONSUMPTION_CONFIRMED' && (!value.evidence || value.responseRecovered)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence'], message: 'El consumo confirmado requiere evidence y respuesta no recuperada.' })
  }
  if (value.decision !== 'CONSUMPTION_CONFIRMED' && value.evidence) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence'], message: 'La evidencia de uso sólo corresponde a consumo confirmado.' })
  }
})

export const DestinationBatchSchema = z.object({
  id: IdSchema,
  name: NonEmptyText.max(200),
  normalizedName: NonEmptyText.max(200),
  importFingerprint: Sha256Schema,
  sourceOrigin: z.literal('json_v1'),
  status: DestinationBatchStatusSchema,
  totalItems: z.number().int().nonnegative(),
  validItems: z.number().int().nonnegative(),
  newItems: z.number().int().nonnegative(),
  existingItems: z.number().int().nonnegative(),
  reusableItems: z.number().int().nonnegative(),
  ambiguousItems: z.number().int().nonnegative(),
  duplicateItems: z.number().int().nonnegative(),
  invalidItems: z.number().int().nonnegative(),
  failedItems: z.number().int().nonnegative(),
  maxCostPerDestination: z.number().nonnegative().nullable(),
  maxCostPerBatch: z.number().nonnegative().nullable(),
  /** Set only by the local E2E seed; never inferred from a visible name. */
  smokeFixture: z.boolean().optional(),
  importedAt: TimestampSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export const DestinationBatchJobSchema = z.object({
  id: IdSchema,
  batchId: IdSchema,
  inputIndex: z.number().int().nonnegative(),
  originalName: NonEmptyText.max(160),
  country: NonEmptyText.max(120),
  region: z.string().max(120).optional(),
  normalizedName: NonEmptyText.max(160),
  normalizedCountry: NonEmptyText.max(120),
  normalizedRegion: z.string().max(120).optional(),
  normalizedIdentity: NonEmptyText.max(600),
  canonicalDestinationId: IdSchema.optional(),
  identityState: DestinationIdentityStateSchema,
  reusePolicy: DestinationReusePolicySchema,
  existingJobId: IdSchema.optional(),
  status: DestinationJobStatusSchema,
  currentPhase: DestinationJobPhaseSchema,
  completedPhases: z.array(DestinationJobPhaseSchema),
  artifactRefs: z.record(z.string().max(200)),
  attemptCount: z.number().int().nonnegative(),
  lastFailure: z.string().max(2000).optional(),
  failureDiagnostic: DestinationBatchFailureDiagnosticSchema.optional(),
  retryable: z.boolean(),
  retryRequestedAt: TimestampSchema.optional(),
  actualCost: z.number().nonnegative(),
  claimedBy: z.string().trim().min(1).max(160).optional(),
  claimToken: z.string().uuid().optional(),
  claimExpiresAt: TimestampSchema.optional(),
  startedAt: TimestampSchema.optional(),
  redoOperationId: IdSchema.optional(),
  redoScope: DestinationBatchRedoScopeSchema.optional(),
  redoGuidance: RedoGenerationGuidanceSchema.optional(),
  redoReason: z.string().max(1000).optional(),
  redoPreviousArtifactRefs: z.record(z.string()).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export const DestinationBatchReadModelSchema = z.object({
  batch: DestinationBatchSchema,
  jobs: z.array(DestinationBatchJobSchema),
  issues: z.array(DestinationBatchIssueSchema),
  countsByStatus: z.record(DestinationJobStatusSchema, z.number().int().nonnegative()),
})

/** Read-only handoff for the future Human Review Desk.  It deliberately
 * exposes durable references, never an approval or delivery action. */
export const DestinationBatchJobReviewReadModelSchema = z.object({
  jobId: IdSchema,
  batchId: IdSchema,
  destination: z.object({
    canonicalDestinationId: IdSchema.nullable(),
    name: NonEmptyText.max(160),
    country: NonEmptyText.max(120),
    region: z.string().max(120).nullable(),
  }),
  status: DestinationJobStatusSchema,
  phase: DestinationJobPhaseSchema,
  student: z.object({ libraryEntryId: IdSchema, versionId: IdSchema, revisionId: IdSchema, title: NonEmptyText.max(500), content: z.string().min(1) }).nullable(),
  adventure: z.object({ libraryEntryId: IdSchema, versionId: IdSchema, revisionId: IdSchema, title: NonEmptyText.max(500), content: z.string().min(1) }).nullable(),
  visualPackageId: IdSchema.nullable(),
  visualPackage: DestinationVisualMediaPackageSchema.nullable(),
  structuredPackage: StructuredEditorialPackageV1Schema.nullable(),
  /** Immutable artifact snapshot shown to the reviewer; approval must CAS it. */
  structuredPackageArtifactId: IdSchema.nullable().default(null),
  structuredPackageVersion: z.number().int().positive().nullable().default(null),
  mediaIngressState: z.enum(['MEDIA_PENDING', 'MEDIA_PARTIAL', 'MEDIA_COMPLETE']).nullable().default(null),
  mediaAssetCount: z.number().int().nonnegative().default(0),
  mediaUploadedCount: z.number().int().nonnegative().default(0),
  mediaReusedCount: z.number().int().nonnegative().default(0),
  mediaFailedCount: z.number().int().nonnegative().default(0),
  mediaBlockingIssues: z.array(z.string()).default([]),
  handoffState: z.enum(['NOT_READY', 'READY', 'PENDING', 'DELIVERED', 'FAILED']).default('NOT_READY'),
  handoffKey: z.string().nullable().default(null),
  handoffAttempts: z.number().int().nonnegative().default(0),
  handoffRemoteDeliveryId: z.string().nullable().default(null),
  handoffFailure: z.string().nullable().default(null),
  variationTraces: z.array(z.object({
    profile: z.enum(['student', 'adventure']),
    variation: z.enum(['LIGHT', 'CLEAR', 'VERY_DIFFERENT']),
    targetMet: z.boolean(),
    warning: z.enum(['REDO_OUTPUT_TOO_SIMILAR_TO_PREVIOUS', 'REDO_VARIATION_TARGET_NOT_MET']).nullable(),
    attempts: z.array(z.object({
      attempt: z.union([z.literal(1), z.literal(2)]), result: z.enum(['PASS', 'FAIL']), threshold: z.number().finite(), retryTriggered: z.boolean(),
      similarity: z.object({ lexicalOverlap: z.number().finite(), headlineOverlap: z.number().finite(), structuralOverlap: z.number().finite(), repeatedPhraseOverlap: z.number().finite(), score: z.number().finite() }),
    }).strict()).max(2),
  }).strict()).default([]),
  reviewArtifactId: IdSchema.nullable(),
  reviewSummary: z.record(z.unknown()).nullable(),
  warnings: z.array(z.string()),
  cost: z.number().nonnegative(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().max(2000).nullable(),
  redo: z.object({
    operationId: IdSchema,
    scope: DestinationBatchRedoScopeSchema,
    reason: z.string().max(1000).nullable(),
    guidance: RedoGenerationGuidanceSchema.nullable(),
    previousArtifactRefs: z.record(z.string()),
    requestedBy: z.string().min(1).max(160),
    requestedAt: TimestampSchema,
    status: z.enum(['REQUESTED', 'COMPLETED', 'FAILED']),
    completedAt: TimestampSchema.nullable(),
  }).nullable(),
})

export const DestinationBatchImportResultSchema = z.object({
  batch: DestinationBatchSchema,
  jobs: z.array(DestinationBatchJobSchema),
  issues: z.array(DestinationBatchIssueSchema),
  idempotentReplay: z.boolean(),
  summary: z.object({
    total: z.number().int().nonnegative(),
    valid: z.number().int().nonnegative(),
    new: z.number().int().nonnegative(),
    existing: z.number().int().nonnegative(),
    reusable: z.number().int().nonnegative(),
    ambiguous: z.number().int().nonnegative(),
    duplicateInput: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
  }),
})

export type DestinationBatch = z.infer<typeof DestinationBatchSchema>
export type DestinationBatchJob = z.infer<typeof DestinationBatchJobSchema>
export type DestinationBatchIssue = z.infer<typeof DestinationBatchIssueSchema>
export type DestinationBatchFailureDiagnostic = z.infer<typeof DestinationBatchFailureDiagnosticSchema>
export type BatchAmbiguousCallResolution = z.infer<typeof BatchAmbiguousCallResolutionSchema>
export type DestinationBatchReadModel = z.infer<typeof DestinationBatchReadModelSchema>
export type DestinationBatchJobReviewReadModel = z.infer<typeof DestinationBatchJobReviewReadModelSchema>
export type DestinationBatchImportResult = z.infer<typeof DestinationBatchImportResultSchema>
export type DestinationBatchDestination = z.infer<typeof DestinationBatchDestinationSchema>
export type DestinationJobPhase = z.infer<typeof DestinationJobPhaseSchema>
export type DestinationBatchRedoScope = z.infer<typeof DestinationBatchRedoScopeSchema>
