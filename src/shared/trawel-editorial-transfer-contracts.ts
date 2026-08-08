import { z } from 'zod'
import {
  LibraryVersionSha256Schema,
  LibraryVersionUuidSchema,
} from './real-editorial-library-contracts'
import { TrawelEditorialTargetSchema } from './trawel-editorial-handoff-contracts'

export const TRAWEL_EDITORIAL_TRANSFER_SCHEMA =
  'investighost-trawel-editorial-transfer-v1' as const

export const TrawelEditorialTransferCommandSchema = z.object({
  libraryEntryIds: z.tuple([LibraryVersionUuidSchema, LibraryVersionUuidSchema]),
  target: TrawelEditorialTargetSchema,
  actorId: LibraryVersionUuidSchema,
  confirmed: z.literal(true),
}).strict().superRefine((value, context) => {
  if (value.libraryEntryIds[0] === value.libraryEntryIds[1]) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['libraryEntryIds'],
      message: 'La transferencia exige dos entradas de Biblioteca distintas',
    })
  }
})

export const TrawelEditorialDifferenceSchema = z.object({
  path: z.string().trim().min(1).max(300),
  kind: z.enum(['missing', 'unexpected', 'different', 'invalid']),
  expected: z.string().max(1_000).nullable(),
  actual: z.string().max(1_000).nullable(),
}).strict()

const TransferIdentityShape = {
  schema: z.literal(TRAWEL_EDITORIAL_TRANSFER_SCHEMA),
  handoffKey: LibraryVersionSha256Schema,
  payloadFingerprint: LibraryVersionSha256Schema,
  rowIds: z.array(LibraryVersionUuidSchema).length(2),
}

export const TrawelEditorialTransferErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'SOURCE_READ_FAILED',
  'SOURCE_NOT_APPROVED',
  'SOURCE_VERSION_AMBIGUOUS',
  'SOURCE_INTEGRITY_ERROR',
  'TARGET_READ_FAILED',
  'TARGET_NOT_FOUND',
  'TARGET_MISMATCH',
  'PRIVATE_READ_FAILED',
  'WRITE_FAILED',
  'PUBLIC_READ_FAILED',
  'PUBLIC_VISIBILITY_VIOLATION',
])

const TrawelEditorialTransferResultBaseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('verified'),
    outcome: z.literal('PASS'),
    ...TransferIdentityShape,
    operation: z.enum(['inserted', 'reused', 'recovered_partial']),
    insertedRowIds: z.array(LibraryVersionUuidSchema).max(2),
    reusedRowIds: z.array(LibraryVersionUuidSchema).max(2),
    readBackPerformed: z.literal(true),
    publicReadPerformed: z.literal(true),
    publicationState: z.literal('private_draft'),
    publiclyVisible: z.literal(false),
    differences: z.array(TrawelEditorialDifferenceSchema).length(0),
  }).strict(),
  z.object({
    status: z.literal('partial_private_draft'),
    outcome: z.literal('FAIL'),
    ...TransferIdentityShape,
    code: z.enum(['WRITE_FAILED', 'READ_BACK_INCOMPLETE']),
    presentRowIds: z.array(LibraryVersionUuidSchema).length(1),
    missingRowIds: z.array(LibraryVersionUuidSchema).length(1),
    readBackPerformed: z.literal(true),
    publicReadPerformed: z.literal(true),
    publicationState: z.literal('private_draft'),
    publiclyVisible: z.literal(false),
    differences: z.array(TrawelEditorialDifferenceSchema).min(1).max(100),
  }).strict(),
  z.object({
    status: z.literal('conflict'),
    outcome: z.literal('FAIL'),
    ...TransferIdentityShape,
    code: z.enum(['EXISTING_ROW_CONFLICT', 'READ_BACK_MISMATCH']),
    readBackPerformed: z.literal(true),
    publicReadPerformed: z.boolean(),
    publiclyVisible: z.boolean().nullable(),
    differences: z.array(TrawelEditorialDifferenceSchema).min(1).max(100),
  }).strict(),
  z.object({
    status: z.literal('error'),
    outcome: z.literal('FAIL'),
    schema: z.literal(TRAWEL_EDITORIAL_TRANSFER_SCHEMA),
    code: TrawelEditorialTransferErrorCodeSchema,
    message: z.string().trim().min(1).max(500),
    handoffKey: LibraryVersionSha256Schema.nullable(),
    payloadFingerprint: LibraryVersionSha256Schema.nullable(),
    rowIds: z.array(LibraryVersionUuidSchema).max(2),
    readBackPerformed: z.boolean(),
    publicReadPerformed: z.boolean(),
    publiclyVisible: z.boolean().nullable(),
    differences: z.array(TrawelEditorialDifferenceSchema).max(100),
  }).strict(),
])

export const TrawelEditorialTransferResultSchema =
  TrawelEditorialTransferResultBaseSchema.superRefine((value, context) => {
    if (value.status === 'error') return
    if (new Set(value.rowIds).size !== 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rowIds'],
        message: 'La identidad de transferencia debe contener dos IDs distintos',
      })
    }
    if (value.status === 'partial_private_draft') {
      const partialIds = [...value.presentRowIds, ...value.missingRowIds]
      if (
        new Set(partialIds).size !== 2
        || [...partialIds].sort().join('|') !== [...value.rowIds].sort().join('|')
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['presentRowIds'],
          message: 'El parcial debe identificar exactamente una fila presente y una ausente',
        })
      }
      return
    }
    if (value.status !== 'verified') return
    const handled = [...value.insertedRowIds, ...value.reusedRowIds]
    const cardinalityMatchesOperation =
      (value.operation === 'inserted'
        && value.insertedRowIds.length === 2 && value.reusedRowIds.length === 0)
      || (value.operation === 'reused'
        && value.insertedRowIds.length === 0 && value.reusedRowIds.length === 2)
      || (value.operation === 'recovered_partial'
        && value.insertedRowIds.length === 1 && value.reusedRowIds.length === 1)
    if (
      new Set(handled).size !== 2
      || [...handled].sort().join('|') !== [...value.rowIds].sort().join('|')
      || !cardinalityMatchesOperation
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['insertedRowIds'],
        message: 'La operación y las filas insertadas/reutilizadas deben cubrir el read-back',
      })
    }
  })

export type TrawelEditorialTransferCommand = z.infer<
  typeof TrawelEditorialTransferCommandSchema
>
export type TrawelEditorialDifference = z.infer<typeof TrawelEditorialDifferenceSchema>
export type TrawelEditorialTransferErrorCode = z.infer<
  typeof TrawelEditorialTransferErrorCodeSchema
>
export type TrawelEditorialTransferResult = z.infer<
  typeof TrawelEditorialTransferResultSchema
>
