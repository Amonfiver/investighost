import { z } from 'zod'
import {
  LibraryVersionCanonicalizationContractSchema,
  LibraryVersionClaimRelationSchema,
  LibraryVersionContentSchema,
  LibraryVersionContentSchemaContractSchema,
  LibraryVersionDecisionTypeSchema,
  LibraryVersionDiffAnchorSchema,
  LibraryVersionDisplayStateSchema,
  LibraryVersionFindingDispositionSchema,
  LibraryVersionFindingOriginSchema,
  LibraryVersionFindingTypeSchema,
  LibraryVersionOperationKeySchema,
  LibraryVersionRevisionNumberSchema,
  LibraryVersionSha256Schema,
  LibraryVersionStateSchema,
  LibraryVersionSupportStatusSchema,
  LibraryVersionTitleSchema,
  LibraryVersionUuidSchema,
} from './real-editorial-library-contracts'

const IsoTimestampSchema = z.string().datetime({ offset: true })
const ProfileSchema = z.enum(['adventure', 'student'])
const JsonObjectSchema = z.record(z.string(), z.unknown())
const JsonArraySchema = z.array(z.unknown())
const StableTextSchema = z.string().trim().min(1).max(4_000)

export const LibraryOriginArtifactReferenceSchema = z.object({
  artifactId: LibraryVersionUuidSchema,
  kind: z.string().trim().min(1).max(120),
  key: z.string().trim().min(1).max(120),
  version: z.number().int().positive(),
  hash: LibraryVersionSha256Schema,
  createdAt: IsoTimestampSchema,
}).strict()

export const LibraryOriginTransferReferenceSchema = z.object({
  transferId: LibraryVersionUuidSchema,
  snapshotArtifactId: LibraryVersionUuidSchema,
  snapshotHash: LibraryVersionSha256Schema,
  terminalDecisionId: LibraryVersionUuidSchema,
  transferredAt: IsoTimestampSchema,
  publicationCount: z.literal(0),
  trawelConnected: z.literal(false),
  automaticEnabled: z.literal(false),
}).strict()

export const LibraryOriginV1ReferenceSchema = z.object({
  libraryEntryId: LibraryVersionUuidSchema,
  entryKey: LibraryVersionSha256Schema,
  versionNumber: z.literal(1),
  profile: ProfileSchema,
  language: z.literal('es-ES'),
  title: LibraryVersionTitleSchema,
  content: LibraryVersionContentSchema,
  contentHash: LibraryVersionSha256Schema,
  originVersionHash: LibraryVersionSha256Schema,
  sourceArtifact: LibraryOriginArtifactReferenceSchema,
  finalReviewArtifact: LibraryOriginArtifactReferenceSchema,
  terminalDecisionId: LibraryVersionUuidSchema,
  transfer: LibraryOriginTransferReferenceSchema,
  reviewOutcome: z.literal('passed_with_warnings'),
  reviewPayload: JsonObjectSchema,
  warnings: JsonArraySchema,
  gaps: JsonArraySchema,
  contradictions: JsonArraySchema,
  claims: JsonArraySchema,
  evidence: JsonArraySchema,
  sources: JsonArraySchema,
  approvalActorId: LibraryVersionUuidSchema,
  transferActorId: LibraryVersionUuidSchema,
  approvedAt: IsoTimestampSchema,
  createdAt: IsoTimestampSchema,
  publicationState: z.literal('unpublished'),
}).strict()

export const CurrentApprovedLibraryContentSchema = z.object({
  source: z.enum(['origin_v1', 'derived']),
  libraryEntryId: LibraryVersionUuidSchema,
  profile: ProfileSchema,
  language: z.literal('es-ES'),
  versionId: LibraryVersionUuidSchema.nullable(),
  versionNumber: z.number().int().positive(),
  revisionId: LibraryVersionUuidSchema.nullable(),
  title: LibraryVersionTitleSchema,
  content: LibraryVersionContentSchema,
  contentHash: LibraryVersionSha256Schema,
  versionHash: LibraryVersionSha256Schema,
  revisionHash: LibraryVersionSha256Schema.nullable(),
  approvalDecisionId: LibraryVersionUuidSchema.nullable(),
  approvedAt: IsoTimestampSchema,
  originV1: LibraryOriginV1ReferenceSchema,
  publicationState: z.literal('unpublished'),
}).strict().superRefine((value, context) => {
  const fromOrigin = value.source === 'origin_v1'
  if (fromOrigin !== (value.versionNumber === 1)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['versionNumber'],
      message: 'El origen current approved debe ser v1' })
  }
  if (fromOrigin !== (value.versionId === null && value.revisionId === null
    && value.revisionHash === null && value.approvalDecisionId === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['versionId'],
      message: 'Solo el fallback v1 carece de identidad derivada' })
  }
})

export const LibraryVersionRevisionDetailSchema = z.object({
  id: LibraryVersionUuidSchema,
  versionId: LibraryVersionUuidSchema,
  revisionNumber: LibraryVersionRevisionNumberSchema,
  previousRevisionId: LibraryVersionUuidSchema.nullable(),
  expectedPreviousRevisionHash: LibraryVersionSha256Schema.nullable(),
  title: LibraryVersionTitleSchema,
  content: LibraryVersionContentSchema,
  contentSchemaContract: LibraryVersionContentSchemaContractSchema,
  canonicalizationContract: LibraryVersionCanonicalizationContractSchema,
  contentHash: LibraryVersionSha256Schema,
  revisionHash: LibraryVersionSha256Schema,
  changeSummary: StableTextSchema,
  createdByActorId: LibraryVersionUuidSchema,
  createdAt: IsoTimestampSchema,
  operationKey: LibraryVersionOperationKeySchema,
}).strict()

const LibraryVersionFindingReadCoreSchema = z.object({
  id: LibraryVersionUuidSchema,
  versionId: LibraryVersionUuidSchema,
  revisionId: LibraryVersionUuidSchema,
  findingKey: z.string().trim().min(1).max(500),
  sequence: z.number().int().positive(),
  supersedesFindingId: LibraryVersionUuidSchema.nullable(),
  sourceFindingType: LibraryVersionFindingTypeSchema,
  sourceFindingId: z.string().trim().min(1).max(500),
  origin: LibraryVersionFindingOriginSchema,
  disposition: LibraryVersionFindingDispositionSchema,
  claimRelation: LibraryVersionClaimRelationSchema,
  supportStatus: LibraryVersionSupportStatusSchema,
  subjectText: StableTextSchema,
  diffAnchor: LibraryVersionDiffAnchorSchema.nullable(),
  claimIds: z.array(z.string().trim().min(1).max(500)),
  evidenceReferences: z.array(z.object({
    kind: z.enum(['evidence', 'source']),
    referenceId: z.string().trim().min(1).max(500),
    locator: z.string().trim().min(1).max(1_000),
    note: z.string().trim().max(1_000).optional(),
  }).strict()),
  sourceIds: z.array(z.string().trim().min(1).max(500)),
  editorDeclaration: z.string().trim().min(1).max(2_000),
  justification: z.string().max(2_000),
  findingHash: LibraryVersionSha256Schema,
  createdByActorId: LibraryVersionUuidSchema,
  createdAt: IsoTimestampSchema,
  operationKey: LibraryVersionOperationKeySchema,
  isBaseline: z.boolean(),
  resultTraceabilityHash: LibraryVersionSha256Schema.nullable(),
})

export const LibraryVersionFindingHistoryItemSchema = LibraryVersionFindingReadCoreSchema
  .strict()

export const EffectiveLibraryVersionFindingSchema = LibraryVersionFindingReadCoreSchema.extend({
  effectiveTraceabilityHash: LibraryVersionSha256Schema,
}).strict()

export const EffectiveLibraryVersionFindingsSchema = z.object({
  versionId: LibraryVersionUuidSchema,
  revisionId: LibraryVersionUuidSchema,
  traceabilityHash: LibraryVersionSha256Schema,
  items: z.array(EffectiveLibraryVersionFindingSchema),
}).strict()

export const LibraryVersionDecisionDetailSchema = z.object({
  id: LibraryVersionUuidSchema,
  versionId: LibraryVersionUuidSchema,
  revisionId: LibraryVersionUuidSchema,
  sequence: z.number().int().positive(),
  decisionType: LibraryVersionDecisionTypeSchema,
  expectedPreviousState: LibraryVersionStateSchema,
  resultingState: LibraryVersionStateSchema,
  revisionHash: LibraryVersionSha256Schema,
  traceabilityHash: LibraryVersionSha256Schema,
  decisionTargetHash: LibraryVersionSha256Schema,
  aggregateHash: LibraryVersionSha256Schema,
  reason: StableTextSchema,
  actorId: LibraryVersionUuidSchema,
  actorRoleSnapshot: z.string().trim().min(1).max(120),
  affectedFindingKeys: z.array(z.string().trim().min(1).max(500)),
  changeInstructions: z.array(z.string().trim().min(1).max(2_000)),
  acceptedRiskFindingKeys: z.array(z.string().trim().min(1).max(500)),
  separationOfDutiesException: z.boolean(),
  separationOfDutiesReason: z.string().trim().min(1).max(2_000).nullable(),
  publicationCount: z.literal(0),
  trawelConnected: z.literal(false),
  automaticEnabled: z.literal(false),
  createdAt: IsoTimestampSchema,
  operationKey: LibraryVersionOperationKeySchema,
  isTerminal: z.boolean(),
}).strict()

export const LibraryVersionStateReadSnapshotSchema = z.object({
  libraryEntryId: LibraryVersionUuidSchema,
  versionId: LibraryVersionUuidSchema,
  versionNumber: z.number().int().min(2),
  initialState: z.literal('draft'),
  transitions: z.array(LibraryVersionDecisionDetailSchema),
  terminalDecision: LibraryVersionDecisionDetailSchema.nullable(),
  effectiveState: LibraryVersionStateSchema,
  currentRevisionId: LibraryVersionUuidSchema,
  currentRevisionHash: LibraryVersionSha256Schema,
  traceabilityHash: LibraryVersionSha256Schema,
  aggregateHash: LibraryVersionSha256Schema.nullable(),
  isTerminal: z.boolean(),
  isCurrentApproved: z.boolean(),
  publicationState: z.literal('unpublished'),
}).strict()

export const LibraryVersionListItemSchema = z.object({
  versionId: LibraryVersionUuidSchema,
  libraryEntryId: LibraryVersionUuidSchema,
  versionNumber: z.number().int().min(2),
  parentVersionId: LibraryVersionUuidSchema.nullable(),
  parentReference: z.enum(['origin_v1', 'derived']),
  parentHash: LibraryVersionSha256Schema,
  originVersionHash: LibraryVersionSha256Schema,
  versionHash: LibraryVersionSha256Schema,
  createdByActorId: LibraryVersionUuidSchema,
  createdAt: IsoTimestampSchema,
  effectiveState: LibraryVersionStateSchema,
  displayState: LibraryVersionDisplayStateSchema,
  currentRevisionId: LibraryVersionUuidSchema,
  currentRevisionNumber: LibraryVersionRevisionNumberSchema,
  currentRevisionHash: LibraryVersionSha256Schema,
  revisionCount: z.number().int().positive(),
  effectiveFindingCount: z.number().int().nonnegative(),
  terminalDecision: LibraryVersionDecisionDetailSchema.nullable(),
  isSuperseded: z.boolean(),
  isCurrentApproved: z.boolean(),
  publicationState: z.literal('unpublished'),
}).strict().superRefine((value, context) => {
  if ((value.versionNumber === 2) !== (value.parentReference === 'origin_v1')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['parentReference'],
      message: 'Solo v2 referencia directamente el origen v1' })
  }
  if (value.isSuperseded && value.effectiveState !== 'approved') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['isSuperseded'],
      message: 'Solo una aprobación histórica puede estar superseded' })
  }
})

export const LibraryEntryVersioningSummarySchema = z.object({
  libraryEntryId: LibraryVersionUuidSchema,
  profile: ProfileSchema,
  originalVersion: LibraryOriginV1ReferenceSchema,
  derivedVersionCount: z.number().int().nonnegative(),
  openVersion: LibraryVersionListItemSchema.nullable(),
  currentApproved: CurrentApprovedLibraryContentSchema,
  latestVersion: LibraryVersionListItemSchema.nullable(),
  latestEffectiveState: z.union([LibraryVersionStateSchema, z.literal('origin_approved')]),
  publication: z.object({
    entryState: z.literal('unpublished'),
    currentApprovedState: z.literal('unpublished'),
    publicationCount: z.literal(0),
    trawelConnected: z.literal(false),
    automaticEnabled: z.literal(false),
  }).strict(),
}).strict()

export const LibraryVersionActionFlagsSchema = z.object({
  editable: z.boolean(),
  canSaveRevision: z.boolean(),
  canReconcileFindings: z.boolean(),
  canSubmitForReview: z.boolean(),
  canDecide: z.boolean(),
  canCreateNextVersion: z.boolean(),
}).strict()

export const LibraryVersionDetailSchema = z.object({
  version: LibraryVersionListItemSchema,
  profile: ProfileSchema,
  originV1: LibraryOriginV1ReferenceSchema,
  parent: z.object({
    source: z.enum(['origin_v1', 'derived']),
    versionId: LibraryVersionUuidSchema.nullable(),
    versionNumber: z.number().int().positive(),
    hash: LibraryVersionSha256Schema,
  }).strict(),
  revisions: z.array(LibraryVersionRevisionDetailSchema).min(1),
  currentRevision: LibraryVersionRevisionDetailSchema,
  state: LibraryVersionStateReadSnapshotSchema,
  effectiveFindings: EffectiveLibraryVersionFindingsSchema,
  findingHistory: z.array(LibraryVersionFindingHistoryItemSchema),
  decisions: z.array(LibraryVersionDecisionDetailSchema),
  aggregateHash: LibraryVersionSha256Schema.nullable(),
  acceptedRiskFindingKeys: z.array(z.string().trim().min(1).max(500)),
  separationOfDuties: z.object({
    exception: z.boolean(),
    reason: z.string().trim().min(1).max(2_000).nullable(),
    actorRoleSnapshot: z.string().trim().min(1).max(120),
  }).strict().nullable(),
  currentApproved: CurrentApprovedLibraryContentSchema,
  flags: LibraryVersionActionFlagsSchema,
  publicationState: z.literal('unpublished'),
}).strict()

export const LibraryVersionTimelineEventTypeSchema = z.enum([
  'version_created',
  'revision_saved',
  'finding_reconciled',
  'submit_for_review',
  'approve',
  'request_changes',
  'reject',
  'abandon',
])

export const LibraryVersionTimelineEventSchema = z.object({
  ordinal: z.number().int().positive(),
  eventType: LibraryVersionTimelineEventTypeSchema,
  timestamp: IsoTimestampSchema,
  versionId: LibraryVersionUuidSchema,
  versionNumber: z.number().int().min(2),
  revisionId: LibraryVersionUuidSchema.nullable(),
  actorId: LibraryVersionUuidSchema,
  targetHash: LibraryVersionSha256Schema,
  description: StableTextSchema,
  source: z.object({
    table: z.enum([
      'real_editorial_library_versions',
      'real_editorial_library_version_revisions',
      'real_editorial_library_version_findings',
      'real_editorial_library_version_decisions',
    ]),
    rowId: LibraryVersionUuidSchema,
  }).strict(),
}).strict()

export const LibraryVersionTimelineSchema = z.object({
  libraryEntryId: LibraryVersionUuidSchema,
  events: z.array(LibraryVersionTimelineEventSchema),
  publicationState: z.literal('unpublished'),
}).strict()

export type LibraryOriginV1Reference = z.infer<typeof LibraryOriginV1ReferenceSchema>
export type CurrentApprovedLibraryContent = z.infer<typeof CurrentApprovedLibraryContentSchema>
export type LibraryVersionRevisionDetail = z.infer<typeof LibraryVersionRevisionDetailSchema>
export type LibraryVersionFindingHistoryItem = z.infer<
  typeof LibraryVersionFindingHistoryItemSchema
>
export type EffectiveLibraryVersionFinding = z.infer<
  typeof EffectiveLibraryVersionFindingSchema
>
export type EffectiveLibraryVersionFindings = z.infer<
  typeof EffectiveLibraryVersionFindingsSchema
>
export type LibraryVersionDecisionDetail = z.infer<typeof LibraryVersionDecisionDetailSchema>
export type LibraryVersionStateReadSnapshot = z.infer<
  typeof LibraryVersionStateReadSnapshotSchema
>
export type LibraryVersionListItem = z.infer<typeof LibraryVersionListItemSchema>
export type LibraryEntryVersioningSummary = z.infer<
  typeof LibraryEntryVersioningSummarySchema
>
export type LibraryVersionDetail = z.infer<typeof LibraryVersionDetailSchema>
export type LibraryVersionTimelineEvent = z.infer<typeof LibraryVersionTimelineEventSchema>
export type LibraryVersionTimeline = z.infer<typeof LibraryVersionTimelineSchema>
