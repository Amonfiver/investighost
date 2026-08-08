import { z } from 'zod'
import {
  LibraryVersionContentSchema,
  LibraryVersionSha256Schema,
  LibraryVersionTitleSchema,
  LibraryVersionUuidSchema,
} from './real-editorial-library-contracts'
import { CurrentApprovedLibraryContentSchema } from './real-editorial-library-read-contracts'
import { RealEditorialLibraryEntrySchema } from './real-editorial-pilot-contracts'

export const TRAWEL_EDITORIAL_HANDOFF_SCHEMA =
  'investighost-trawel-editorial-handoff-v1' as const
export const TRAWEL_EDITORIAL_HANDOFF_IDENTITY_SCHEMA =
  'investighost-trawel-handoff-identity-v1' as const
export const TRAWEL_EDITORIAL_HANDOFF_FINGERPRINT_SCHEMA =
  'investighost-trawel-handoff-fingerprint-v1' as const
export const TRAWEL_EDITORIAL_HANDOFF_ROW_ID_SCHEMA =
  'investighost-trawel-editorial-row-id-v1' as const

const ProfileSchema = z.enum(['adventure', 'student'])
const SourceDestinationTypeSchema = z.enum(['country', 'region', 'locality', 'zone'])
const TrawelEntityTypeSchema = z.enum(['country', 'zone'])
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200)
const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/)
const SupabaseProjectRefSchema = z.string().regex(/^[a-z0-9]{20}$/)
const IsoTimestampSchema = z.string().datetime({ offset: true })

export const TrawelEditorialTargetSchema = z.object({
  projectRef: SupabaseProjectRefSchema,
  entityType: TrawelEntityTypeSchema,
  entityId: LibraryVersionUuidSchema,
  entitySlug: SlugSchema,
  countrySlug: SlugSchema,
  zoneSlug: SlugSchema.nullable(),
  countryCode: CountryCodeSchema,
}).strict().superRefine((value, context) => {
  if (value.entityType === 'country') {
    if (value.zoneSlug !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['zoneSlug'],
        message: 'Un target country no admite zoneSlug',
      })
    }
    if (value.entitySlug !== value.countrySlug) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entitySlug'],
        message: 'Un target country debe usar el mismo entitySlug y countrySlug',
      })
    }
    return
  }
  if (value.zoneSlug === null || value.entitySlug !== value.zoneSlug) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['zoneSlug'],
      message: 'Un target zone debe conservar su slug en entitySlug y zoneSlug',
    })
  }
})

export const LibraryTrawelApprovedSourceSchema = z.object({
  entry: RealEditorialLibraryEntrySchema,
  currentApproved: CurrentApprovedLibraryContentSchema,
}).strict().superRefine((value, context) => {
  const { entry, currentApproved } = value
  const origin = currentApproved.originV1
  const mismatches: Array<[Array<string | number>, string]> = []
  if (currentApproved.libraryEntryId !== entry.entryId) {
    mismatches.push([['currentApproved', 'libraryEntryId'], 'La selección no pertenece a la entrada'])
  }
  if (currentApproved.profile !== entry.profile || origin.profile !== entry.profile) {
    mismatches.push([['currentApproved', 'profile'], 'El perfil aprobado no coincide con la entrada'])
  }
  if (currentApproved.language !== entry.language || origin.language !== entry.language) {
    mismatches.push([['currentApproved', 'language'], 'El idioma aprobado no coincide con la entrada'])
  }
  if (
    origin.libraryEntryId !== entry.entryId
    || origin.title !== entry.title
    || origin.content !== entry.content
  ) {
    mismatches.push([['currentApproved', 'originV1'], 'El origen v1 no reproduce la entrada inmutable'])
  }
  if (
    origin.sourceArtifact.artifactId !== entry.sourceArtifact.artifactId
    || origin.sourceArtifact.hash !== entry.sourceArtifact.hash
    || origin.sourceArtifact.kind !== entry.sourceArtifact.kind
    || origin.sourceArtifact.key !== entry.sourceArtifact.key
    || origin.sourceArtifact.version !== entry.sourceArtifact.version
  ) {
    mismatches.push([['currentApproved', 'originV1', 'sourceArtifact'],
      'El artefacto de origen no coincide con la entrada'])
  }
  if (
    origin.finalReviewArtifact.artifactId !== entry.finalReviewArtifact.artifactId
    || origin.finalReviewArtifact.hash !== entry.finalReviewArtifact.hash
    || origin.terminalDecisionId !== entry.terminalDecisionId
  ) {
    mismatches.push([['currentApproved', 'originV1', 'finalReviewArtifact'],
      'La aprobación v1 no coincide con la entrada'])
  }
  if (origin.transfer.transferId !== entry.transferId) {
    mismatches.push([['currentApproved', 'originV1', 'transfer', 'transferId'],
      'La transferencia de origen no coincide con la entrada'])
  }
  if (
    currentApproved.source === 'origin_v1'
    && (
      currentApproved.title !== origin.title
      || currentApproved.content !== origin.content
      || currentApproved.contentHash !== origin.contentHash
      || currentApproved.versionHash !== origin.originVersionHash
      || currentApproved.approvedAt !== origin.approvedAt
    )
  ) {
    mismatches.push([['currentApproved'], 'La selección v1 no coincide exactamente con su origen'])
  }
  for (const [path, message] of mismatches) {
    context.addIssue({ code: z.ZodIssueCode.custom, path, message })
  }
})

export const LibraryTrawelApprovedPairSchema = z.array(LibraryTrawelApprovedSourceSchema)
  .length(2)
  .superRefine((value, context) => {
    if (value.length !== 2) return
    const profiles = new Set(value.map(item => item.entry.profile))
    if (profiles.size !== 2 || !profiles.has('adventure') || !profiles.has('student')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'El handoff requiere exactamente Aventura y Estudiante',
      })
    }
    const [left, right] = value
    if (
      left.entry.transferId !== right.entry.transferId
      || left.entry.pilotId !== right.entry.pilotId
      || left.entry.runId !== right.entry.runId
      || left.entry.terminalDecisionId !== right.entry.terminalDecisionId
      || left.entry.finalReviewArtifact.artifactId !== right.entry.finalReviewArtifact.artifactId
      || left.entry.finalReviewArtifact.hash !== right.entry.finalReviewArtifact.hash
      || left.entry.destination.canonicalId !== right.entry.destination.canonicalId
      || left.entry.destination.name !== right.entry.destination.name
      || left.entry.destination.countryCode !== right.entry.destination.countryCode
      || left.entry.destination.type !== right.entry.destination.type
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'Ambos perfiles deben pertenecer al mismo resultado aprobado y destino',
      })
    }
  })

export const PrepareTrawelEditorialHandoffCommandSchema = z.object({
  sources: LibraryTrawelApprovedPairSchema,
  target: TrawelEditorialTargetSchema,
  actorId: LibraryVersionUuidSchema,
  confirmed: z.literal(true),
}).strict().superRefine((value, context) => {
  const source = value.sources[0]?.entry.destination
  if (!source) return
  const expectedType = source.type === 'country' ? 'country' : 'zone'
  if (value.target.entityType !== expectedType) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['target', 'entityType'],
      message: 'El tipo Trawel no representa el tipo geográfico aprobado',
    })
  }
  if (value.target.countryCode !== source.countryCode) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['target', 'countryCode'],
      message: 'El país Trawel no coincide con el resultado aprobado',
    })
  }
})

export const TrawelEditorialPublicSourceSchema = z.object({
  sourceId: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(500),
  url: z.string().url().refine(value => value.startsWith('https://')),
  publisher: z.string().trim().min(1).max(240).nullable(),
  publishedAt: IsoTimestampSchema.nullable(),
  contentHash: LibraryVersionSha256Schema,
}).strict()

const TrawelApprovalReferenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('terminal'),
    decisionId: LibraryVersionUuidSchema,
  }).strict(),
  z.object({
    kind: z.literal('library_version'),
    decisionId: LibraryVersionUuidSchema,
  }).strict(),
])

const TrawelEditorialSourceMetadataObjectSchema = z.object({
  libraryEntryId: LibraryVersionUuidSchema,
  transferId: LibraryVersionUuidSchema,
  pilotId: LibraryVersionUuidSchema,
  runId: LibraryVersionUuidSchema,
  terminalDecisionId: LibraryVersionUuidSchema,
  destination: z.object({
    canonicalId: LibraryVersionUuidSchema,
    name: z.string().trim().min(1).max(200),
    countryCode: CountryCodeSchema,
    type: SourceDestinationTypeSchema,
  }).strict(),
  profile: ProfileSchema,
  language: z.literal('es-ES'),
  currentApproved: z.object({
    source: z.enum(['origin_v1', 'derived']),
    versionId: LibraryVersionUuidSchema.nullable(),
    versionNumber: z.number().int().positive(),
    revisionId: LibraryVersionUuidSchema.nullable(),
    contentHash: LibraryVersionSha256Schema,
    versionHash: LibraryVersionSha256Schema,
    revisionHash: LibraryVersionSha256Schema.nullable(),
    originVersionHash: LibraryVersionSha256Schema,
    approval: TrawelApprovalReferenceSchema,
    approvedAt: IsoTimestampSchema,
  }).strict(),
}).strict()

export const TrawelEditorialSourceMetadataSchema = TrawelEditorialSourceMetadataObjectSchema
  .superRefine((value, context) => {
    const current = value.currentApproved
    const origin = current.source === 'origin_v1'
    const noDerivedIdentity = current.versionId === null
      && current.revisionId === null
      && current.revisionHash === null
    if (
      origin !== (current.versionNumber === 1)
      || origin !== noDerivedIdentity
      || origin !== (current.approval.kind === 'terminal')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currentApproved'],
        message: 'La identidad y aprobación deben representar inequívocamente v1 o una derivada',
      })
    }
  })

export const TrawelEditorialHandoffMetadataSchema = z.object({
  investighost: z.object({
    schema: z.literal(TRAWEL_EDITORIAL_HANDOFF_SCHEMA),
    handoffKey: LibraryVersionSha256Schema,
    payloadFingerprint: LibraryVersionSha256Schema,
    actorId: LibraryVersionUuidSchema,
    source: TrawelEditorialSourceMetadataSchema,
  }).strict(),
}).strict()

const TrawelEditorialContentDraftObjectSchema = z.object({
  id: LibraryVersionUuidSchema,
  entity_type: TrawelEntityTypeSchema,
  entity_id: LibraryVersionUuidSchema,
  entity_slug: SlugSchema,
  country_slug: SlugSchema,
  zone_slug: SlugSchema.nullable(),
  mode: ProfileSchema,
  headline: LibraryVersionTitleSchema,
  intro: LibraryVersionContentSchema,
  what_makes_special: z.null(),
  highlights: z.array(z.never()).length(0),
  suggested_route: z.null(),
  practical_tips: z.array(z.never()).length(0),
  sections: z.array(z.never()).length(0),
  sources: z.array(TrawelEditorialPublicSourceSchema).max(500),
  metadata: TrawelEditorialHandoffMetadataSchema,
  status: z.literal('draft'),
  review_state: z.literal('approved_in_investighost'),
  published_at: z.null(),
}).strict()

function validateTrawelEditorialContentDraft(
  value: z.infer<typeof TrawelEditorialContentDraftObjectSchema>,
  context: z.RefinementCtx,
): void {
  if (value.metadata.investighost.source.profile !== value.mode) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['metadata', 'investighost', 'source', 'profile'],
      message: 'El perfil de procedencia debe coincidir con mode',
    })
  }
  const sourceIds = value.sources.map(source => source.sourceId)
  if (
    new Set(sourceIds).size !== sourceIds.length
    || sourceIds.some((sourceId, index) => index > 0 && sourceId < (sourceIds[index - 1] ?? ''))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sources'],
      message: 'Las fuentes deben ser únicas y estar ordenadas por sourceId',
    })
  }
}

export const TrawelEditorialContentDraftSchema = TrawelEditorialContentDraftObjectSchema
  .superRefine(validateTrawelEditorialContentDraft)

export const TrawelEditorialContentReadRowSchema = TrawelEditorialContentDraftObjectSchema
  .extend({
    created_at: IsoTimestampSchema,
    updated_at: IsoTimestampSchema,
  }).strict().superRefine(validateTrawelEditorialContentDraft)

export const TrawelEditorialHandoffPayloadSchema = z.object({
  schema: z.literal(TRAWEL_EDITORIAL_HANDOFF_SCHEMA),
  handoffKey: LibraryVersionSha256Schema,
  payloadFingerprint: LibraryVersionSha256Schema,
  target: TrawelEditorialTargetSchema,
  rows: z.array(TrawelEditorialContentDraftSchema).length(2),
}).strict().superRefine((value, context) => {
  const profiles = new Set(value.rows.map(row => row.mode))
  if (profiles.size !== 2 || !profiles.has('adventure') || !profiles.has('student')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rows'],
      message: 'El payload debe conservar exactamente ambos perfiles',
    })
  }
  if (new Set(value.rows.map(row => row.id)).size !== value.rows.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rows'],
      message: 'Cada perfil debe tener un ID Trawel distinto',
    })
  }
  const first = value.rows[0]?.metadata.investighost
  for (const [index, row] of value.rows.entries()) {
    const metadata = row.metadata.investighost
    if (
      metadata.handoffKey !== value.handoffKey
      || metadata.payloadFingerprint !== value.payloadFingerprint
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rows', index, 'metadata'],
        message: 'La fila no conserva la identidad del payload',
      })
    }
    if (
      row.entity_type !== value.target.entityType
      || row.entity_id !== value.target.entityId
      || row.entity_slug !== value.target.entitySlug
      || row.country_slug !== value.target.countrySlug
      || row.zone_slug !== value.target.zoneSlug
      || metadata.source.destination.countryCode !== value.target.countryCode
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rows', index],
        message: 'La fila no conserva exactamente el target confirmado',
      })
    }
    const source = metadata.source
    const expectedEntityType = source.destination.type === 'country' ? 'country' : 'zone'
    if (row.entity_type !== expectedEntityType) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rows', index, 'entity_type'],
        message: 'La entidad Trawel no representa el tipo geográfico de origen',
      })
    }
    if (first && (
      metadata.actorId !== first.actorId
      || source.transferId !== first.source.transferId
      || source.pilotId !== first.source.pilotId
      || source.runId !== first.source.runId
      || source.terminalDecisionId !== first.source.terminalDecisionId
      || source.destination.canonicalId !== first.source.destination.canonicalId
      || source.destination.name !== first.source.destination.name
      || source.destination.countryCode !== first.source.destination.countryCode
      || source.destination.type !== first.source.destination.type
    )) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rows', index, 'metadata'],
        message: 'Ambas filas deben proceder del mismo resultado, destino y actor',
      })
    }
  }
})

export const TrawelEditorialHandoffVerificationErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'PAYLOAD_INTEGRITY_ERROR',
  'ROW_SET_MISMATCH',
  'CONTENT_MISMATCH',
])

export const TrawelEditorialHandoffVerificationResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('verified'),
    handoffKey: LibraryVersionSha256Schema,
    payloadFingerprint: LibraryVersionSha256Schema,
    rowIds: z.array(LibraryVersionUuidSchema).length(2),
    publicationState: z.literal('private_draft'),
  }).strict(),
  z.object({
    status: z.literal('error'),
    code: TrawelEditorialHandoffVerificationErrorCodeSchema,
    message: z.string().trim().min(1).max(500),
  }).strict(),
])

export type TrawelEditorialTarget = z.infer<typeof TrawelEditorialTargetSchema>
export type LibraryTrawelApprovedSource = z.infer<typeof LibraryTrawelApprovedSourceSchema>
export type PrepareTrawelEditorialHandoffCommand = z.infer<
  typeof PrepareTrawelEditorialHandoffCommandSchema
>
export type TrawelEditorialPublicSource = z.infer<typeof TrawelEditorialPublicSourceSchema>
export type TrawelEditorialSourceMetadata = z.infer<
  typeof TrawelEditorialSourceMetadataSchema
>
export type TrawelEditorialContentDraft = z.infer<typeof TrawelEditorialContentDraftSchema>
export type TrawelEditorialContentReadRow = z.infer<typeof TrawelEditorialContentReadRowSchema>
export type TrawelEditorialHandoffPayload = z.infer<typeof TrawelEditorialHandoffPayloadSchema>
export type TrawelEditorialHandoffVerificationResult = z.infer<
  typeof TrawelEditorialHandoffVerificationResultSchema
>
