import { z } from 'zod'
import { LibraryVersionSha256Schema, LibraryVersionUuidSchema } from './real-editorial-library-contracts'
import { VisualAssetCategorySchema, VisualAssetRoleSchema } from './destination-visual-media-contract'

export const VISUAL_CANDIDATE_PROVIDER = 'wikimedia_commons' as const
export const VisualCandidateProviderSchema = z.literal(VISUAL_CANDIDATE_PROVIDER)
export const VisualCandidateStateSchema = z.enum(['DISCOVERED', 'ELIGIBLE', 'REFERENCE_ONLY', 'REJECTED'])
export const VisualCandidateLicenseSchema = z.enum([
  'PUBLIC_DOMAIN', 'CC0', 'CC_BY_4_0', 'CC_BY_3_0', 'CC_BY_SA', 'CC_BY_ND', 'CC_BY_NC',
  'ALL_RIGHTS_RESERVED', 'CUSTOM', 'UNKNOWN',
])

const HttpsUrlSchema = z.string().url().refine(value => new URL(value).protocol === 'https:', 'La URL debe usar HTTPS')
const NullableText = z.string().trim().min(1).max(4_000).nullable()
const NullableUrl = HttpsUrlSchema.nullable()
const NullablePositiveInteger = z.number().int().positive().nullable()

/** Declarative request; role/category guide discovery but never select a final asset. */
export const WikimediaCommonsDiscoveryQuerySchema = z.object({
  destinationId: LibraryVersionUuidSchema,
  destinationName: z.string().trim().min(1).max(300),
  countryOrRegion: z.string().trim().min(1).max(300).nullable(),
  category: VisualAssetCategorySchema,
  role: VisualAssetRoleSchema,
  limit: z.number().int().min(1).max(20),
}).strict()

/** Internal candidate only: it cannot carry a public-storage URL or become a Visual Bridge asset directly. */
export const VisualCandidateSchema = z.object({
  candidateId: LibraryVersionUuidSchema,
  destinationId: LibraryVersionUuidSchema,
  provider: VisualCandidateProviderSchema,
  providerAssetId: z.string().trim().min(1).max(200),
  canonicalTitle: z.string().trim().min(1).max(1_000),
  sourcePageUrl: HttpsUrlSchema,
  originalMediaUrl: NullableUrl,
  mimeType: NullableText,
  width: NullablePositiveInteger,
  height: NullablePositiveInteger,
  byteSize: NullablePositiveInteger,
  creator: NullableText,
  uploader: NullableText,
  sourceName: z.literal('Wikimedia Commons'),
  licenseShortName: NullableText,
  licenseUrl: NullableUrl,
  usageTerms: NullableText,
  attributionText: NullableText,
  description: NullableText,
  requestedCategory: VisualAssetCategorySchema,
  requestedRole: VisualAssetRoleSchema,
  discoveredAt: z.string().datetime({ offset: true }),
  providerMetadataHash: LibraryVersionSha256Schema,
  normalizedLicense: VisualCandidateLicenseSchema,
  state: VisualCandidateStateSchema,
  rejectionReason: NullableText,
}).strict().superRefine((candidate, context) => {
  if (candidate.state === 'ELIGIBLE' && (
    candidate.creator === null || candidate.licenseShortName === null || candidate.licenseUrl === null
    || candidate.attributionText === null || candidate.originalMediaUrl === null
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'ELIGIBLE exige autor, licencia, atribución y URL original verificables' })
  }
  if (candidate.state === 'REJECTED' && candidate.rejectionReason === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'REJECTED exige motivo' })
  }
})

export type WikimediaCommonsDiscoveryQuery = z.infer<typeof WikimediaCommonsDiscoveryQuerySchema>
export type VisualCandidate = z.infer<typeof VisualCandidateSchema>
