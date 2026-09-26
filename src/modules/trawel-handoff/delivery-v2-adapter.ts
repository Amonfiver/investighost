import {
  TRAWEL_EDITORIAL_DELIVERY_V2_FINGERPRINT_SCHEMA,
  TRAWEL_EDITORIAL_DELIVERY_V2_IDENTITY_SCHEMA,
  TRAWEL_EDITORIAL_DELIVERY_V2_SCHEMA,
  TrawelEditorialDeliveryTargetSchema,
  TrawelEditorialDeliveryV2PayloadSchema,
  TrawelEditorialProfileSchema,
  type TrawelEditorialDeliveryTarget,
  type TrawelEditorialDeliveryV2Payload,
  type TrawelEditorialProfile,
} from '@shared/trawel-editorial-delivery-contracts'
import { LibraryTrawelApprovedPairSchema, type LibraryTrawelApprovedSource } from '@shared/trawel-editorial-handoff-contracts'
import { canonicalPayloadHash } from '@modules/library-versioning/canonicalization'
import { projectLibraryEntryToTrawelEditorialProfile } from './editorial-profile-projection'
import {
  TrawelDestinationVisualContractSchema,
  type DestinationVisualContractSchema,
} from '@shared/destination-visual-contract'
import {
  DestinationVisualMediaPackageSchema,
  TrawelDestinationVisualMediaSchema,
  projectDestinationVisualMediaForTrawel,
} from '@shared/destination-visual-media-contract'
import { assertDestinationVisualMediaPackageHash } from './visual-media-package'

export interface PrepareTrawelEditorialDeliveryV2Command {
  target: TrawelEditorialDeliveryTarget
  sources: readonly [LibraryTrawelApprovedSource, LibraryTrawelApprovedSource]
  /** Optional destination metadata; it never becomes Adventure/Student body text. */
  destinationVisuals?: typeof DestinationVisualContractSchema._output
  /** Canonical collection for Visual Bridge V1; only its public projection crosses the boundary. */
  destinationVisualMedia?: typeof DestinationVisualMediaPackageSchema._output
  /** Additive V2 metadata. Legacy consumers ignore this record while its content remains fingerprinted. */
  profileMetadataExtensions?: Partial<Record<'adventure' | 'student', Record<string, unknown>>>
}

export class TrawelEditorialDeliveryV2Error extends Error {
  constructor(message: string) { super(message); this.name = 'TrawelEditorialDeliveryV2Error' }
}

/** Builds the exact wire payload accepted by Trawel, before any outbox write. */
export function prepareTrawelEditorialDeliveryV2(candidate: PrepareTrawelEditorialDeliveryV2Command): TrawelEditorialDeliveryV2Payload {
  const target = TrawelEditorialDeliveryTargetSchema.parse(candidate.target)
  const sources = LibraryTrawelApprovedPairSchema.parse(candidate.sources)
  const byProfile = new Map(sources.map(source => [source.entry.profile, source]))
  const profiles = {
    adventure: extendProfile(requiredProfile(byProfile, 'adventure', target), candidate.profileMetadataExtensions?.adventure),
    student: extendProfile(requiredProfile(byProfile, 'student', target), candidate.profileMetadataExtensions?.student),
  }
  const envelope = deliveryEnvelope(byProfile)
  const destinationVisuals = candidate.destinationVisuals === undefined
    ? undefined
    : TrawelDestinationVisualContractSchema.parse(candidate.destinationVisuals)
  const destinationVisualMedia = candidate.destinationVisualMedia === undefined
    ? undefined
    : projectVisualMedia(candidate.destinationVisualMedia)
  if (destinationVisuals !== undefined && destinationVisualMedia !== undefined) {
    throw new TrawelEditorialDeliveryV2Error('Los slots legacy y la colección visual no pueden convivir en un mismo handoff')
  }
  if (destinationVisuals !== undefined && destinationVisuals.destinationId !== sources[0].entry.destination.canonicalId) {
    throw new TrawelEditorialDeliveryV2Error('Los slots visuales no pertenecen al destino del handoff')
  }
  if (destinationVisualMedia !== undefined && destinationVisualMedia.destinationId !== sources[0].entry.destination.canonicalId) {
    throw new TrawelEditorialDeliveryV2Error('La colección visual no pertenece al destino del handoff')
  }
  const handoffKey = canonicalPayloadHash({
    schema: TRAWEL_EDITORIAL_DELIVERY_V2_IDENTITY_SCHEMA,
    mappingId: target.sourceMappingId,
    canonicalDestinationId: target.canonicalDestinationId,
    envelope,
    profiles: identityProfiles(profiles),
    ...(destinationVisuals === undefined ? {} : { destinationVisuals }),
    ...(destinationVisualMedia === undefined ? {} : { destinationVisualMedia }),
  })
  const payloadFingerprint = fingerprint({
    schemaVersion: TRAWEL_EDITORIAL_DELIVERY_V2_SCHEMA,
    mappingId: target.sourceMappingId,
    canonicalDestinationId: target.canonicalDestinationId,
    handoffKey,
    ...envelope,
    profiles,
    ...(destinationVisuals === undefined ? {} : { destinationVisuals }),
    ...(destinationVisualMedia === undefined ? {} : { destinationVisualMedia }),
  })
  return TrawelEditorialDeliveryV2PayloadSchema.parse({
    schemaVersion: TRAWEL_EDITORIAL_DELIVERY_V2_SCHEMA,
    mappingId: target.sourceMappingId,
    canonicalDestinationId: target.canonicalDestinationId,
    handoffKey,
    payloadFingerprint,
    ...envelope,
    profiles,
    ...(destinationVisuals === undefined ? {} : { destinationVisuals }),
    ...(destinationVisualMedia === undefined ? {} : { destinationVisualMedia }),
  })
}

export function assertTrawelEditorialDeliveryV2Integrity(payload: TrawelEditorialDeliveryV2Payload): void {
  const parsed = TrawelEditorialDeliveryV2PayloadSchema.parse(payload)
  const handoffKey = canonicalPayloadHash({
    schema: TRAWEL_EDITORIAL_DELIVERY_V2_IDENTITY_SCHEMA,
    mappingId: parsed.mappingId,
    canonicalDestinationId: parsed.canonicalDestinationId,
    envelope: envelopeFromPayload(parsed),
    profiles: identityProfiles(parsed.profiles),
    ...(parsed.destinationVisuals === undefined ? {} : { destinationVisuals: parsed.destinationVisuals }),
    ...(parsed.destinationVisualMedia === undefined ? {} : { destinationVisualMedia: TrawelDestinationVisualMediaSchema.parse(parsed.destinationVisualMedia) }),
  })
  if (handoffKey !== parsed.handoffKey) throw new TrawelEditorialDeliveryV2Error('V2 handoffKey inválida')
  const payloadFingerprint = fingerprint({
    schemaVersion: parsed.schemaVersion,
    mappingId: parsed.mappingId,
    canonicalDestinationId: parsed.canonicalDestinationId,
    handoffKey,
    ...envelopeFromPayload(parsed),
    profiles: parsed.profiles,
    ...(parsed.destinationVisuals === undefined ? {} : { destinationVisuals: parsed.destinationVisuals }),
    ...(parsed.destinationVisualMedia === undefined ? {} : { destinationVisualMedia: TrawelDestinationVisualMediaSchema.parse(parsed.destinationVisualMedia) }),
  })
  if (payloadFingerprint !== parsed.payloadFingerprint) throw new TrawelEditorialDeliveryV2Error('V2 payloadFingerprint inválido')
}

function requiredProfile(
  byProfile: Map<'adventure' | 'student', LibraryTrawelApprovedSource>,
  profile: 'adventure' | 'student',
  target: TrawelEditorialDeliveryTarget,
): TrawelEditorialProfile {
  const source = byProfile.get(profile)
  if (!source) throw new TrawelEditorialDeliveryV2Error(`Falta el perfil ${profile}`)
  return projectLibraryEntryToTrawelEditorialProfile(source, target)
}

function identityProfiles(profiles: Record<'adventure' | 'student', TrawelEditorialProfile>) {
  return Object.fromEntries((['adventure', 'student'] as const).map(profile => {
    const current = profiles[profile].metadata.investighost as { libraryEntryId: string; currentApproved: Record<string, unknown>; structuredPackage?: Record<string, unknown> }
    const structuredPackage = current.structuredPackage
    return [profile, { libraryEntryId: current.libraryEntryId, currentApproved: current.currentApproved, ...(structuredPackage === undefined ? {} : { structuredPackage }) }]
  }))
}

function extendProfile(profile: TrawelEditorialProfile, extension: Record<string, unknown> | undefined): TrawelEditorialProfile {
  if (extension === undefined) return profile
  const metadata = profile.metadata.investighost as Record<string, unknown>
  return TrawelEditorialProfileSchema.parse({ ...profile, metadata: { ...profile.metadata, investighost: { ...metadata, ...extension } } })
}

function deliveryEnvelope(byProfile: Map<'adventure' | 'student', LibraryTrawelApprovedSource>) {
  const adventure = byProfile.get('adventure')
  const student = byProfile.get('student')
  if (!adventure || !student) throw new TrawelEditorialDeliveryV2Error('Faltan perfiles para el sobre de entrega')
  const current = adventure.currentApproved
  return {
    // Trawel V2 has a single root trace. Adventure is the deterministic anchor;
    // both per-profile identities remain in profile metadata.
    libraryEntryId: adventure.entry.entryId,
    versionHash: current.versionHash,
    contentHash: current.contentHash,
    provenance: {
      source: current.source,
      versionId: current.versionId,
      revisionId: current.revisionId,
      originVersionHash: current.originV1.originVersionHash,
      anchoredProfile: 'adventure',
      profileLibraryEntries: { adventure: adventure.entry.entryId, student: student.entry.entryId },
    },
    approval: {
      kind: current.source === 'origin_v1' ? 'terminal' : 'library_version',
      decisionId: current.approvalDecisionId ?? current.originV1.terminalDecisionId,
      approvedAt: current.approvedAt,
    },
  }
}

function envelopeFromPayload(payload: TrawelEditorialDeliveryV2Payload) {
  return {
    libraryEntryId: payload.libraryEntryId,
    versionHash: payload.versionHash,
    contentHash: payload.contentHash,
    provenance: payload.provenance,
    approval: payload.approval,
  }
}

function fingerprint(value: Record<string, unknown>): string {
  return canonicalPayloadHash({ schema: TRAWEL_EDITORIAL_DELIVERY_V2_FINGERPRINT_SCHEMA, ...value })
}

function projectVisualMedia(value: typeof DestinationVisualMediaPackageSchema._output) {
  const parsed = DestinationVisualMediaPackageSchema.parse(value)
  assertDestinationVisualMediaPackageHash(parsed)
  return projectDestinationVisualMediaForTrawel(parsed)
}
