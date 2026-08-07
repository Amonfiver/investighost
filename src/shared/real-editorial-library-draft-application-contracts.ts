import { z } from 'zod'
import {
  LibraryVersionDomainErrorCodeSchema,
  LibraryVersionOperationKeySchema,
  LibraryVersionSha256Schema,
  LibraryVersionUuidSchema,
  REAL_EDITORIAL_LIBRARY_MAX_EDITABLE_CONTENT_INPUT_LENGTH,
  REAL_EDITORIAL_LIBRARY_MAX_EDITABLE_TITLE_INPUT_LENGTH,
  REAL_EDITORIAL_LIBRARY_MAX_REASON_LENGTH,
} from './real-editorial-library-contracts'
import {
  LibraryEntryVersioningSummarySchema,
  LibraryVersionDetailSchema,
  LibraryVersionListItemSchema,
  LibraryVersionRevisionDetailSchema,
  LibraryVersionStateReadSnapshotSchema,
} from './real-editorial-library-read-contracts'

const IsoTimestampSchema = z.string().datetime({ offset: true })
const EditableTitleInputSchema = z.string().min(1)
  .max(REAL_EDITORIAL_LIBRARY_MAX_EDITABLE_TITLE_INPUT_LENGTH)
const EditableContentInputSchema = z.string().min(1)
  .max(REAL_EDITORIAL_LIBRARY_MAX_EDITABLE_CONTENT_INPUT_LENGTH)
const ChangeSummaryInputSchema = z.string().min(1)
  .max(REAL_EDITORIAL_LIBRARY_MAX_REASON_LENGTH)

export const CreateLibraryVersionDraftCommandSchema = z.object({
  libraryEntryId: LibraryVersionUuidSchema,
  expectedHeadHash: LibraryVersionSha256Schema,
  title: EditableTitleInputSchema,
  content: EditableContentInputSchema,
  changeSummary: ChangeSummaryInputSchema,
  actorId: LibraryVersionUuidSchema,
  operationKey: LibraryVersionOperationKeySchema,
}).strict()

export const SaveLibraryVersionDraftCommandSchema = z.object({
  versionId: LibraryVersionUuidSchema,
  expectedPreviousRevisionHash: LibraryVersionSha256Schema,
  title: EditableTitleInputSchema,
  content: EditableContentInputSchema,
  changeSummary: ChangeSummaryInputSchema,
  actorId: LibraryVersionUuidSchema,
  operationKey: LibraryVersionOperationKeySchema,
}).strict()

export const LibraryVersionDraftOperationSchema = z.enum(['create_draft', 'save_draft'])

export const RecoverLibraryVersionOperationCommandSchema = z.object({
  operationKey: LibraryVersionOperationKeySchema,
  expectedOperation: LibraryVersionDraftOperationSchema,
  expectedRequestFingerprint: LibraryVersionSha256Schema,
  actorId: LibraryVersionUuidSchema,
}).strict()

export const LibraryVersionDraftOperationReceiptSchema = z.object({
  operation: LibraryVersionDraftOperationSchema,
  operationKey: LibraryVersionOperationKeySchema,
  requestFingerprint: LibraryVersionSha256Schema,
  actorId: LibraryVersionUuidSchema,
  libraryEntryId: LibraryVersionUuidSchema,
  versionId: LibraryVersionUuidSchema,
  revisionId: LibraryVersionUuidSchema,
  versionHash: LibraryVersionSha256Schema,
  revisionHash: LibraryVersionSha256Schema,
  confirmedAt: IsoTimestampSchema,
}).strict()

export const LibraryVersionDraftApplicationWarningSchema = z.enum([
  'title_canonicalized',
  'content_canonicalized',
  'change_summary_canonicalized',
])

export const LibraryVersionDraftValidationIssueSchema = z.object({
  path: z.string(),
  code: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(500),
}).strict()

export const LibraryVersionDraftApplicationErrorCodeSchema = z.union([
  LibraryVersionDomainErrorCodeSchema,
  z.literal('VALIDATION_ERROR'),
])

const LibraryVersionDraftApplicationErrorCoreSchema = z.object({
  status: z.literal('error'),
  code: LibraryVersionDraftApplicationErrorCodeSchema,
  message: z.string().trim().min(1).max(500),
  retryable: z.boolean(),
  operationKey: LibraryVersionOperationKeySchema.nullable(),
  validationIssues: z.array(LibraryVersionDraftValidationIssueSchema).max(100),
}).strict()

export const LibraryVersionDraftApplicationErrorSchema =
  LibraryVersionDraftApplicationErrorCoreSchema.extend({
    operation: z.enum(['create_draft', 'save_draft', 'recover_operation']),
  }).strict()

export const CreateLibraryVersionDraftSuccessSchema = z.object({
  status: z.literal('ok'),
  operation: z.literal('create_draft'),
  operationReplayed: z.boolean(),
  receipt: LibraryVersionDraftOperationReceiptSchema,
  version: LibraryVersionListItemSchema,
  currentRevision: LibraryVersionRevisionDetailSchema,
  stateSnapshot: LibraryVersionStateReadSnapshotSchema,
  entrySummary: LibraryEntryVersioningSummarySchema,
  warnings: z.array(LibraryVersionDraftApplicationWarningSchema),
}).strict()

const CreateLibraryVersionDraftErrorSchema =
  LibraryVersionDraftApplicationErrorCoreSchema.extend({
    operation: z.literal('create_draft'),
  }).strict()

export const CreateLibraryVersionDraftResultSchema = z.discriminatedUnion('status', [
  CreateLibraryVersionDraftSuccessSchema,
  CreateLibraryVersionDraftErrorSchema,
])

export const SaveLibraryVersionDraftSuccessSchema = z.object({
  status: z.literal('ok'),
  operation: z.literal('save_draft'),
  operationReplayed: z.boolean(),
  receipt: LibraryVersionDraftOperationReceiptSchema,
  savedRevision: LibraryVersionRevisionDetailSchema,
  versionDetail: LibraryVersionDetailSchema,
  stateSnapshot: LibraryVersionStateReadSnapshotSchema,
  entrySummary: LibraryEntryVersioningSummarySchema,
  warnings: z.array(LibraryVersionDraftApplicationWarningSchema),
}).strict()

const SaveLibraryVersionDraftErrorSchema =
  LibraryVersionDraftApplicationErrorCoreSchema.extend({
    operation: z.literal('save_draft'),
  }).strict()

export const SaveLibraryVersionDraftResultSchema = z.discriminatedUnion('status', [
  SaveLibraryVersionDraftSuccessSchema,
  SaveLibraryVersionDraftErrorSchema,
])

export const RecoverLibraryVersionOperationConfirmedSchema = z.object({
  status: z.literal('confirmed'),
  operation: z.literal('recover_operation'),
  recoveredOperation: LibraryVersionDraftOperationSchema,
  receipt: LibraryVersionDraftOperationReceiptSchema,
  operationRevision: LibraryVersionRevisionDetailSchema,
  versionDetail: LibraryVersionDetailSchema,
  stateSnapshot: LibraryVersionStateReadSnapshotSchema,
  entrySummary: LibraryEntryVersioningSummarySchema,
}).strict()

export const RecoverLibraryVersionOperationNotFoundSchema = z.object({
  status: z.literal('not_found'),
  operation: z.literal('recover_operation'),
  operationKey: LibraryVersionOperationKeySchema,
}).strict()

const RecoverLibraryVersionOperationErrorSchema =
  LibraryVersionDraftApplicationErrorCoreSchema.extend({
    operation: z.literal('recover_operation'),
  }).strict()

export const RecoverLibraryVersionOperationResultSchema = z.discriminatedUnion('status', [
  RecoverLibraryVersionOperationConfirmedSchema,
  RecoverLibraryVersionOperationNotFoundSchema,
  RecoverLibraryVersionOperationErrorSchema,
])

export type CreateLibraryVersionDraftCommand = z.infer<
  typeof CreateLibraryVersionDraftCommandSchema
>
export type SaveLibraryVersionDraftCommand = z.infer<typeof SaveLibraryVersionDraftCommandSchema>
export type RecoverLibraryVersionOperationCommand = z.infer<
  typeof RecoverLibraryVersionOperationCommandSchema
>
export type LibraryVersionDraftOperation = z.infer<typeof LibraryVersionDraftOperationSchema>
export type LibraryVersionDraftOperationReceipt = z.infer<
  typeof LibraryVersionDraftOperationReceiptSchema
>
export type LibraryVersionDraftApplicationWarning = z.infer<
  typeof LibraryVersionDraftApplicationWarningSchema
>
export type LibraryVersionDraftApplicationError = z.infer<
  typeof LibraryVersionDraftApplicationErrorSchema
>
export type CreateLibraryVersionDraftResult = z.infer<
  typeof CreateLibraryVersionDraftResultSchema
>
export type SaveLibraryVersionDraftResult = z.infer<typeof SaveLibraryVersionDraftResultSchema>
export type RecoverLibraryVersionOperationResult = z.infer<
  typeof RecoverLibraryVersionOperationResultSchema
>
