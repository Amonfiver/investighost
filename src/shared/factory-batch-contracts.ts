import { z } from 'zod'

const IdSchema = z.string().uuid()
const TimestampSchema = z.date()
const NonEmptyText = z.string().trim().min(1)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const DestinationBatchInputSchema = z.object({
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
  retryable: z.boolean(),
  retryRequestedAt: TimestampSchema.optional(),
  actualCost: z.number().nonnegative(),
  claimedBy: z.string().trim().min(1).max(160).optional(),
  claimToken: z.string().uuid().optional(),
  claimExpiresAt: TimestampSchema.optional(),
  startedAt: TimestampSchema.optional(),
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
  student: z.object({ libraryEntryId: IdSchema, versionId: IdSchema, revisionId: IdSchema }).nullable(),
  adventure: z.object({ libraryEntryId: IdSchema, versionId: IdSchema, revisionId: IdSchema }).nullable(),
  visualPackageId: IdSchema.nullable(),
  reviewArtifactId: IdSchema.nullable(),
  reviewSummary: z.record(z.unknown()).nullable(),
  warnings: z.array(z.string()),
  cost: z.number().nonnegative(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().max(2000).nullable(),
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
export type DestinationBatchReadModel = z.infer<typeof DestinationBatchReadModelSchema>
export type DestinationBatchJobReviewReadModel = z.infer<typeof DestinationBatchJobReviewReadModelSchema>
export type DestinationBatchImportResult = z.infer<typeof DestinationBatchImportResultSchema>
export type DestinationBatchDestination = z.infer<typeof DestinationBatchDestinationSchema>
export type DestinationJobPhase = z.infer<typeof DestinationJobPhaseSchema>
