import { z } from 'zod'
import { LibraryVersionSha256Schema, LibraryVersionUuidSchema } from './real-editorial-library-contracts'
import { TrawelEditorialPublicSourceSchema } from './trawel-editorial-handoff-contracts'

/** Wire contract for Trawel's deployed internal-editorial-deliveries ingress. */
export const TRAWEL_EDITORIAL_DELIVERY_V2_SCHEMA = 'v2' as const
export const TRAWEL_EDITORIAL_DELIVERY_V2_IDENTITY_SCHEMA = 'investighost-trawel-editorial-delivery-identity-v2' as const
export const TRAWEL_EDITORIAL_DELIVERY_V2_FINGERPRINT_SCHEMA = 'investighost-trawel-editorial-delivery-fingerprint-v2' as const

const ProfileSchema = z.enum(['adventure', 'student'])
const EntityTypeSchema = z.enum(['country', 'zone'])
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200)
const MappingIdSchema = z.string().regex(/^[a-z][a-z0-9:_-]{2,199}$/)
const CanonicalDestinationIdSchema = z.string().regex(/^[a-z][a-z0-9:_-]{2,199}$/)
const JsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema),
]))

export const TrawelEditorialDeliveryStateSchema = z.enum([
  'PENDING', 'DELIVERING', 'RETRYABLE', 'RECONCILING', 'CONFIRMED', 'CONFLICT', 'FAILED',
])

export const TrawelEditorialDeliveryTargetSchema = z.object({
  sourceMappingId: MappingIdSchema,
  canonicalDestinationId: CanonicalDestinationIdSchema,
  entityType: EntityTypeSchema,
  entitySlug: SlugSchema,
  countrySlug: SlugSchema,
  zoneSlug: SlugSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.entityType === 'zone' && (value.zoneSlug === null || value.zoneSlug !== value.entitySlug)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['zoneSlug'], message: 'Un destino zone requiere zoneSlug igual a entitySlug' })
  }
  if (value.entityType === 'country' && (value.zoneSlug !== null || value.entitySlug !== value.countrySlug)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['entitySlug'], message: 'Un destino country no admite zoneSlug' })
  }
})

export const TrawelEditorialSectionSchema = z.object({
  kind: z.string().trim().min(1).max(80),
  heading: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(20_000),
  position: z.number().int().nonnegative(),
}).strict()

export const TrawelEditorialProfileSchema = z.object({
  headline: z.string().trim().min(1).max(500),
  intro: z.string().trim().min(1).max(20_000),
  whatMakesSpecial: z.string().trim().min(1).max(20_000),
  highlights: z.array(z.string().trim().min(1).max(4_000)).min(1).max(100).optional(),
  suggestedRoute: z.string().trim().min(1).max(20_000).optional(),
  practicalTips: z.array(z.string().trim().min(1).max(4_000)).min(1).max(100),
  sections: z.array(TrawelEditorialSectionSchema).max(100),
  sources: z.array(TrawelEditorialPublicSourceSchema).max(500),
  metadata: z.record(JsonValueSchema),
}).strict()

export const TrawelEditorialDeliveryV2PayloadSchema = z.object({
  schemaVersion: z.literal(TRAWEL_EDITORIAL_DELIVERY_V2_SCHEMA),
  mappingId: MappingIdSchema,
  canonicalDestinationId: CanonicalDestinationIdSchema,
  handoffKey: LibraryVersionSha256Schema,
  payloadFingerprint: LibraryVersionSha256Schema,
  libraryEntryId: z.string().trim().min(1).max(200),
  versionHash: LibraryVersionSha256Schema,
  contentHash: LibraryVersionSha256Schema,
  provenance: z.record(JsonValueSchema),
  approval: z.record(JsonValueSchema),
  profiles: z.object({ adventure: TrawelEditorialProfileSchema, student: TrawelEditorialProfileSchema }).strict(),
}).strict()

const DeliveryResultSchema = z.object({
  editorial_content_ids: z.array(LibraryVersionUuidSchema).max(2).optional(),
  profiles_created: z.array(ProfileSchema).max(2).optional(),
  publication: z.literal('draft_only').optional(),
}).passthrough()
const DeliverySchema = z.object({
  id: LibraryVersionUuidSchema,
  handoffKey: z.string().trim().min(1).max(200).optional(),
  canonicalDestinationId: CanonicalDestinationIdSchema.optional(),
  mappingId: z.string().trim().min(1).max(200).optional(),
  status: z.string().trim().min(1).max(80).optional(),
  result: DeliveryResultSchema.optional(),
}).passthrough()

/** Trawel's returned mapping UUID is a remote receipt, never the input source mapping ID. */
export const TrawelEditorialIngressResponseSchema = z.object({
  success: z.boolean(),
  idempotent: z.boolean().optional(),
  status: z.string().trim().min(1).max(80).optional(),
  delivery: DeliverySchema.optional(),
  deliveryId: LibraryVersionUuidSchema.optional(),
  handoffKey: LibraryVersionSha256Schema.optional(),
  payloadFingerprint: LibraryVersionSha256Schema.optional(),
  mappingId: LibraryVersionUuidSchema.optional(),
  canonicalDestinationId: CanonicalDestinationIdSchema.optional(),
  profiles_created: z.array(ProfileSchema).max(2).optional(),
  editorial_content_ids: z.array(LibraryVersionUuidSchema).max(2).optional(),
  publication: z.literal('draft_only').optional(),
  error: z.string().trim().min(1).max(2_000).optional(),
}).passthrough()

export type TrawelEditorialDeliveryTarget = z.infer<typeof TrawelEditorialDeliveryTargetSchema>
export type TrawelEditorialProfile = z.infer<typeof TrawelEditorialProfileSchema>
export type TrawelEditorialDeliveryV2Payload = z.infer<typeof TrawelEditorialDeliveryV2PayloadSchema>
export type TrawelEditorialDeliveryState = z.infer<typeof TrawelEditorialDeliveryStateSchema>
export type TrawelEditorialIngressResponse = z.infer<typeof TrawelEditorialIngressResponseSchema>
