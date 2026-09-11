import {
  TRAWEL_EDITORIAL_DELIVERY_V2_FINGERPRINT_SCHEMA,
  TRAWEL_EDITORIAL_DELIVERY_V2_IDENTITY_SCHEMA,
  TRAWEL_EDITORIAL_DELIVERY_V2_SCHEMA,
  TrawelEditorialDeliveryTargetSchema,
  TrawelEditorialDeliveryV2PayloadSchema,
  type TrawelEditorialDeliveryTarget,
  type TrawelEditorialDeliveryV2Payload,
  type TrawelEditorialProfile,
} from '@shared/trawel-editorial-delivery-contracts'
import { LibraryTrawelApprovedPairSchema, type LibraryTrawelApprovedSource } from '@shared/trawel-editorial-handoff-contracts'
import { canonicalPayloadHash } from '@modules/library-versioning/canonicalization'
import { projectLibraryEntryToTrawelEditorialProfile } from './editorial-profile-projection'

export interface PrepareTrawelEditorialDeliveryV2Command {
  target: TrawelEditorialDeliveryTarget
  sources: readonly [LibraryTrawelApprovedSource, LibraryTrawelApprovedSource]
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
    adventure: requiredProfile(byProfile, 'adventure', target),
    student: requiredProfile(byProfile, 'student', target),
  }
  const handoffKey = canonicalPayloadHash({
    schema: TRAWEL_EDITORIAL_DELIVERY_V2_IDENTITY_SCHEMA,
    mappingId: target.sourceMappingId,
    canonicalDestinationId: target.canonicalDestinationId,
    profiles: identityProfiles(profiles),
  })
  const payloadFingerprint = fingerprint({
    schemaVersion: TRAWEL_EDITORIAL_DELIVERY_V2_SCHEMA,
    mappingId: target.sourceMappingId,
    canonicalDestinationId: target.canonicalDestinationId,
    handoffKey,
    profiles,
  })
  return TrawelEditorialDeliveryV2PayloadSchema.parse({
    schemaVersion: TRAWEL_EDITORIAL_DELIVERY_V2_SCHEMA,
    mappingId: target.sourceMappingId,
    canonicalDestinationId: target.canonicalDestinationId,
    handoffKey,
    payloadFingerprint,
    profiles,
  })
}

export function assertTrawelEditorialDeliveryV2Integrity(payload: TrawelEditorialDeliveryV2Payload): void {
  const parsed = TrawelEditorialDeliveryV2PayloadSchema.parse(payload)
  const handoffKey = canonicalPayloadHash({
    schema: TRAWEL_EDITORIAL_DELIVERY_V2_IDENTITY_SCHEMA,
    mappingId: parsed.mappingId,
    canonicalDestinationId: parsed.canonicalDestinationId,
    profiles: identityProfiles(parsed.profiles),
  })
  if (handoffKey !== parsed.handoffKey) throw new TrawelEditorialDeliveryV2Error('V2 handoffKey inválida')
  const payloadFingerprint = fingerprint({
    schemaVersion: parsed.schemaVersion,
    mappingId: parsed.mappingId,
    canonicalDestinationId: parsed.canonicalDestinationId,
    handoffKey,
    profiles: parsed.profiles,
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
    const current = profiles[profile].metadata.investighost as { libraryEntryId: string; currentApproved: Record<string, unknown> }
    return [profile, { libraryEntryId: current.libraryEntryId, currentApproved: current.currentApproved }]
  }))
}

function fingerprint(value: Record<string, unknown>): string {
  return canonicalPayloadHash({ schema: TRAWEL_EDITORIAL_DELIVERY_V2_FINGERPRINT_SCHEMA, ...value })
}
