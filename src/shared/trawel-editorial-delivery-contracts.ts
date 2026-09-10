import { z } from 'zod'
import {
  LibraryVersionContentSchema,
  LibraryVersionSha256Schema,
  LibraryVersionTitleSchema,
  LibraryVersionUuidSchema,
} from './real-editorial-library-contracts'
import { TrawelEditorialPublicSourceSchema } from './trawel-editorial-handoff-contracts'

/** A separate, immutable delivery protocol. V1 remains intentionally untouched. */
export const TRAWEL_EDITORIAL_DELIVERY_V2_SCHEMA =
  'investighost-trawel-editorial-delivery-v2' as const
export const TRAWEL_EDITORIAL_DELIVERY_V2_IDENTITY_SCHEMA =
  'investighost-trawel-editorial-delivery-identity-v2' as const
export const TRAWEL_EDITORIAL_DELIVERY_V2_FINGERPRINT_SCHEMA =
  'investighost-trawel-editorial-delivery-fingerprint-v2' as const

export const TrawelEditorialDeliveryProfileSchema = z.enum(['adventure', 'student'])
export const TrawelEditorialDeliveryEntityTypeSchema = z.enum(['country', 'zone'])
export const TrawelEditorialDeliveryStateSchema = z.enum([
  'PENDING', 'DELIVERING', 'RETRYABLE', 'RECONCILING', 'CONFIRMED', 'CONFLICT', 'FAILED',
])

export const TrawelEditorialDeliveryMappingSchema = z.object({
  mappingId: LibraryVersionUuidSchema,
  investighostCanonicalDestinationId: LibraryVersionUuidSchema,
  trawelEntityType: TrawelEditorialDeliveryEntityTypeSchema,
  trawelEntityId: LibraryVersionUuidSchema,
}).strict()

export const TrawelEditorialDeliveryApprovalSchema = z.object({
  kind: z.enum(['terminal', 'library_version']),
  decisionId: LibraryVersionUuidSchema,
  approvedAt: z.string().datetime({ offset: true }),
}).strict()

export const TrawelEditorialDeliveryV2RowSchema = z.object({
  profile: TrawelEditorialDeliveryProfileSchema,
  libraryEntryId: LibraryVersionUuidSchema,
  versionHash: LibraryVersionSha256Schema,
  contentHash: LibraryVersionSha256Schema,
  language: z.literal('es-ES'),
  title: LibraryVersionTitleSchema,
  content: LibraryVersionContentSchema,
  approval: TrawelEditorialDeliveryApprovalSchema,
  provenance: z.object({
    source: z.enum(['origin_v1', 'derived']),
    versionId: LibraryVersionUuidSchema.nullable(),
    revisionId: LibraryVersionUuidSchema.nullable(),
    originVersionHash: LibraryVersionSha256Schema,
  }).strict(),
  sources: z.array(TrawelEditorialPublicSourceSchema).max(500),
}).strict()

export const TrawelEditorialDeliveryV2PayloadSchema = z.object({
  schema: z.literal(TRAWEL_EDITORIAL_DELIVERY_V2_SCHEMA),
  handoffKey: LibraryVersionSha256Schema,
  payloadFingerprint: LibraryVersionSha256Schema,
  mapping: TrawelEditorialDeliveryMappingSchema,
  rows: z.array(TrawelEditorialDeliveryV2RowSchema).length(2),
  publicationState: z.literal('private_draft'),
  publiclyVisible: z.literal(false),
}).strict().superRefine((value, context) => {
  const profiles = value.rows.map(row => row.profile)
  if (new Set(profiles).size !== 2 || !profiles.includes('adventure') || !profiles.includes('student')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'V2 requiere exactamente adventure y student' })
  }
  for (const [index, row] of value.rows.entries()) {
    const sourceIds = row.sources.map(source => source.sourceId)
    if (new Set(sourceIds).size !== sourceIds.length || sourceIds.some((id, sourceIndex) => sourceIndex > 0 && id < (sourceIds[sourceIndex - 1] ?? ''))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['rows', index, 'sources'], message: 'Las fuentes de cada fila deben ser únicas y deterministas' })
    }
  }
})

export const TrawelEditorialIngressResultSchema = z.enum([
  'CONFIRMED', 'NO_DUPLICATE', 'PARTIAL', 'CONFLICT', 'RETRYABLE_ERROR', 'VALIDATION_ERROR',
])

export const TrawelEditorialIngressResponseSchema = z.object({
  result: TrawelEditorialIngressResultSchema,
  schema: z.literal(TRAWEL_EDITORIAL_DELIVERY_V2_SCHEMA),
  handoffKey: LibraryVersionSha256Schema,
  payloadFingerprint: LibraryVersionSha256Schema,
  mappingId: LibraryVersionUuidSchema,
  receiptId: z.string().trim().min(1).max(500).nullable(),
  rows: z.array(z.object({ profile: TrawelEditorialDeliveryProfileSchema }).strict()).max(2),
  publicationState: z.literal('private_draft'),
  publiclyVisible: z.literal(false),
  serverTimestamp: z.string().datetime({ offset: true }),
}).strict()

export type TrawelEditorialDeliveryMapping = z.infer<typeof TrawelEditorialDeliveryMappingSchema>
export type TrawelEditorialDeliveryV2Row = z.infer<typeof TrawelEditorialDeliveryV2RowSchema>
export type TrawelEditorialDeliveryV2Payload = z.infer<typeof TrawelEditorialDeliveryV2PayloadSchema>
export type TrawelEditorialDeliveryState = z.infer<typeof TrawelEditorialDeliveryStateSchema>
export type TrawelEditorialIngressResponse = z.infer<typeof TrawelEditorialIngressResponseSchema>
