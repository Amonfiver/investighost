import {
  type LibraryTrawelApprovedSource,
  LibraryTrawelApprovedPairSchema,
} from '@shared/trawel-editorial-handoff-contracts'
import {
  TRAWEL_EDITORIAL_DELIVERY_V2_FINGERPRINT_SCHEMA,
  TRAWEL_EDITORIAL_DELIVERY_V2_IDENTITY_SCHEMA,
  TRAWEL_EDITORIAL_DELIVERY_V2_SCHEMA,
  TrawelEditorialDeliveryMappingSchema,
  TrawelEditorialDeliveryV2PayloadSchema,
  type TrawelEditorialDeliveryMapping,
  type TrawelEditorialDeliveryV2Payload,
  type TrawelEditorialDeliveryV2Row,
} from '@shared/trawel-editorial-delivery-contracts'
import { canonicalPayloadHash, libraryContentHash } from '@modules/library-versioning/canonicalization'

export interface PrepareTrawelEditorialDeliveryV2Command {
  mapping: TrawelEditorialDeliveryMapping
  sources: readonly [LibraryTrawelApprovedSource, LibraryTrawelApprovedSource]
}

export class TrawelEditorialDeliveryV2Error extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrawelEditorialDeliveryV2Error'
  }
}

export function prepareTrawelEditorialDeliveryV2(
  candidate: PrepareTrawelEditorialDeliveryV2Command,
): TrawelEditorialDeliveryV2Payload {
  const mapping = TrawelEditorialDeliveryMappingSchema.parse(candidate.mapping)
  const sources = LibraryTrawelApprovedPairSchema.parse(candidate.sources)
  const rows = sources.map(projectRow).sort((left, right) => compareText(left.profile, right.profile))
  for (const row of rows) assertRowContentHash(row)
  const handoffKey = canonicalPayloadHash({
    schema: TRAWEL_EDITORIAL_DELIVERY_V2_IDENTITY_SCHEMA,
    mapping,
    rows: rows.map(identityRow),
  })
  const payloadFingerprint = canonicalPayloadHash({
    schema: TRAWEL_EDITORIAL_DELIVERY_V2_FINGERPRINT_SCHEMA,
    handoffKey,
    mapping,
    rows,
    publicationState: 'private_draft',
    publiclyVisible: false,
  })
  return TrawelEditorialDeliveryV2PayloadSchema.parse({
    schema: TRAWEL_EDITORIAL_DELIVERY_V2_SCHEMA,
    handoffKey,
    payloadFingerprint,
    mapping,
    rows,
    publicationState: 'private_draft',
    publiclyVisible: false,
  })
}

export function assertTrawelEditorialDeliveryV2Integrity(payload: TrawelEditorialDeliveryV2Payload): void {
  const parsed = TrawelEditorialDeliveryV2PayloadSchema.parse(payload)
  const rows = [...parsed.rows].sort((left, right) => compareText(left.profile, right.profile))
  for (const row of rows) assertRowContentHash(row)
  const handoffKey = canonicalPayloadHash({
    schema: TRAWEL_EDITORIAL_DELIVERY_V2_IDENTITY_SCHEMA,
    mapping: parsed.mapping,
    rows: rows.map(identityRow),
  })
  if (handoffKey !== parsed.handoffKey) throw new TrawelEditorialDeliveryV2Error('V2 handoffKey inválida')
  const fingerprint = canonicalPayloadHash({
    schema: TRAWEL_EDITORIAL_DELIVERY_V2_FINGERPRINT_SCHEMA,
    handoffKey,
    mapping: parsed.mapping,
    rows,
    publicationState: parsed.publicationState,
    publiclyVisible: parsed.publiclyVisible,
  })
  if (fingerprint !== parsed.payloadFingerprint) throw new TrawelEditorialDeliveryV2Error('V2 payloadFingerprint inválido')
}

function projectRow(source: LibraryTrawelApprovedSource): TrawelEditorialDeliveryV2Row {
  const current = source.currentApproved
  return {
    profile: source.entry.profile,
    libraryEntryId: source.entry.entryId,
    versionHash: current.versionHash,
    contentHash: current.contentHash,
    language: current.language,
    title: current.title,
    content: current.content,
    approval: current.source === 'origin_v1'
      ? { kind: 'terminal', decisionId: current.originV1.terminalDecisionId, approvedAt: current.approvedAt }
      : { kind: 'library_version', decisionId: requiredApproval(current.approvalDecisionId), approvedAt: current.approvedAt },
    provenance: {
      source: current.source,
      versionId: current.versionId,
      revisionId: current.revisionId,
      originVersionHash: current.originV1.originVersionHash,
    },
    sources: source.entry.sources.map(item => ({
      sourceId: item.id, title: item.title, url: item.url, publisher: item.publisher ?? null,
      publishedAt: item.publishedAt ?? null, contentHash: item.contentHash,
    })).sort((left, right) => compareText(left.sourceId, right.sourceId)),
  }
}

function identityRow(row: TrawelEditorialDeliveryV2Row): Record<string, unknown> {
  return {
    profile: row.profile,
    libraryEntryId: row.libraryEntryId,
    versionHash: row.versionHash,
    contentHash: row.contentHash,
    language: row.language,
    approval: row.approval,
  }
}

function assertRowContentHash(row: TrawelEditorialDeliveryV2Row): void {
  if (row.contentHash !== libraryContentHash({
    profile: row.profile, language: row.language, title: row.title, content: row.content,
  })) throw new TrawelEditorialDeliveryV2Error('El contenido V2 no coincide con contentHash')
}

function requiredApproval(value: string | null): string {
  if (value === null) throw new TrawelEditorialDeliveryV2Error('La versión derivada carece de aprobación')
  return value
}

function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}
