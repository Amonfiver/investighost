import {
  PrepareTrawelEditorialHandoffCommandSchema,
  TRAWEL_EDITORIAL_HANDOFF_FINGERPRINT_SCHEMA,
  TRAWEL_EDITORIAL_HANDOFF_IDENTITY_SCHEMA,
  TRAWEL_EDITORIAL_HANDOFF_ROW_ID_SCHEMA,
  TRAWEL_EDITORIAL_HANDOFF_SCHEMA,
  TrawelEditorialContentDraftSchema,
  TrawelEditorialContentReadRowSchema,
  TrawelEditorialHandoffPayloadSchema,
  TrawelEditorialHandoffVerificationResultSchema,
  type LibraryTrawelApprovedSource,
  type PrepareTrawelEditorialHandoffCommand,
  type TrawelEditorialContentDraft,
  type TrawelEditorialHandoffPayload,
  type TrawelEditorialHandoffVerificationResult,
  type TrawelEditorialPublicSource,
  type TrawelEditorialSourceMetadata,
  type TrawelEditorialTarget,
} from '@shared/trawel-editorial-handoff-contracts'
import {
  canonicalJsonStringify,
  canonicalPayloadHash,
  libraryContentHash,
  libraryOriginVersionHash,
} from '@modules/library-versioning/canonicalization'

export type TrawelEditorialHandoffContractErrorCode =
  | 'SOURCE_HASH_MISMATCH'
  | 'SOURCE_ORIGIN_MISMATCH'
  | 'SOURCE_DUPLICATE'
  | 'PAYLOAD_INTEGRITY_ERROR'

export class TrawelEditorialHandoffContractError extends Error {
  constructor(
    readonly code: TrawelEditorialHandoffContractErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'TrawelEditorialHandoffContractError'
  }
}

interface DraftRowWithoutFingerprint extends Omit<TrawelEditorialContentDraft, 'metadata'> {
  metadata: {
    investighost: Omit<
      TrawelEditorialContentDraft['metadata']['investighost'],
      'payloadFingerprint'
    >
  }
}

export function prepareTrawelEditorialHandoff(
  candidate: PrepareTrawelEditorialHandoffCommand,
): TrawelEditorialHandoffPayload {
  const command = PrepareTrawelEditorialHandoffCommandSchema.parse(candidate)
  const sources = [...command.sources].sort(compareApprovedSources)
  for (const source of sources) assertApprovedSourceIntegrity(source)
  const handoffKey = calculateHandoffKey(command.target, sources)
  const rowsWithoutFingerprint = sources.map(source => buildDraftRowWithoutFingerprint(
    source,
    command.target,
    command.actorId,
    handoffKey,
  ))
  const payloadFingerprint = calculatePayloadFingerprint(
    handoffKey,
    command.target,
    rowsWithoutFingerprint,
  )
  const rows = rowsWithoutFingerprint.map(row => TrawelEditorialContentDraftSchema.parse({
    ...row,
    metadata: {
      investighost: {
        ...row.metadata.investighost,
        payloadFingerprint,
      },
    },
  }))
  const payload = TrawelEditorialHandoffPayloadSchema.parse({
    schema: TRAWEL_EDITORIAL_HANDOFF_SCHEMA,
    handoffKey,
    payloadFingerprint,
    target: command.target,
    rows,
  })
  assertPayloadIntegrity(payload)
  return payload
}

export function verifyTrawelEditorialHandoff(
  payloadCandidate: unknown,
  observedCandidates: unknown,
): TrawelEditorialHandoffVerificationResult {
  const payloadResult = TrawelEditorialHandoffPayloadSchema.safeParse(payloadCandidate)
  if (!payloadResult.success) {
    return verificationError('VALIDATION_ERROR', 'El payload esperado no cumple el contrato')
  }
  try {
    assertPayloadIntegrity(payloadResult.data)
  } catch {
    return verificationError('PAYLOAD_INTEGRITY_ERROR', 'La identidad del payload esperado no es válida')
  }
  if (!Array.isArray(observedCandidates)) {
    return verificationError('VALIDATION_ERROR', 'La lectura Trawel debe ser una colección de filas')
  }
  const observed: TrawelEditorialContentDraft[] = []
  for (const candidate of observedCandidates) {
    const draft = TrawelEditorialContentDraftSchema.safeParse(candidate)
    if (draft.success) {
      observed.push(draft.data)
      continue
    }
    const read = TrawelEditorialContentReadRowSchema.safeParse(candidate)
    if (!read.success) {
      return verificationError('VALIDATION_ERROR', 'Una fila Trawel no cumple el contrato privado draft')
    }
    observed.push(projectReadRow(read.data))
  }
  const expectedRows = sortRows(payloadResult.data.rows)
  const observedRows = sortRows(observed)
  if (
    observedRows.length !== expectedRows.length
    || new Set(observedRows.map(row => row.id)).size !== observedRows.length
    || observedRows.some((row, index) => row.id !== expectedRows[index]?.id)
  ) {
    return verificationError('ROW_SET_MISMATCH', 'Trawel no devolvió exactamente las dos filas esperadas')
  }
  if (canonicalJsonStringify(observedRows) !== canonicalJsonStringify(expectedRows)) {
    return verificationError('CONTENT_MISMATCH', 'El subconjunto editorial almacenado no coincide exactamente')
  }
  return TrawelEditorialHandoffVerificationResultSchema.parse({
    status: 'verified',
    handoffKey: payloadResult.data.handoffKey,
    payloadFingerprint: payloadResult.data.payloadFingerprint,
    rowIds: expectedRows.map(row => row.id),
    publicationState: 'private_draft',
  })
}

export function assertPayloadIntegrity(payload: TrawelEditorialHandoffPayload): void {
  const rows = sortRows(payload.rows)
  const sourceIds = rows.map(row => row.metadata.investighost.source.libraryEntryId).sort()
  const expectedHandoffKey = canonicalPayloadHash({
    schema: TRAWEL_EDITORIAL_HANDOFF_IDENTITY_SCHEMA,
    target: payload.target,
    libraryEntryIds: sourceIds,
  })
  if (payload.handoffKey !== expectedHandoffKey) {
    throw new TrawelEditorialHandoffContractError(
      'PAYLOAD_INTEGRITY_ERROR',
      'La handoffKey no coincide con entradas y target',
    )
  }
  for (const row of rows) {
    if (row.id !== deterministicRowId(payload.handoffKey, row.mode)) {
      throw new TrawelEditorialHandoffContractError(
        'PAYLOAD_INTEGRITY_ERROR',
        'El ID Trawel no coincide con la identidad estable del perfil',
      )
    }
    const expectedContentHash = libraryContentHash({
      profile: row.mode,
      language: row.metadata.investighost.source.language,
      title: row.headline,
      content: row.intro,
    })
    if (row.metadata.investighost.source.currentApproved.contentHash !== expectedContentHash) {
      throw new TrawelEditorialHandoffContractError(
        'PAYLOAD_INTEGRITY_ERROR',
        'La fila Trawel no coincide con el hash del contenido aprobado',
      )
    }
  }
  const expectedFingerprint = calculatePayloadFingerprint(
    payload.handoffKey,
    payload.target,
    rows.map(removePayloadFingerprint),
  )
  if (payload.payloadFingerprint !== expectedFingerprint) {
    throw new TrawelEditorialHandoffContractError(
      'PAYLOAD_INTEGRITY_ERROR',
      'El fingerprint no coincide con la proyección editorial',
    )
  }
}

function assertApprovedSourceIntegrity(source: LibraryTrawelApprovedSource): void {
  const { entry, currentApproved } = source
  const expectedCurrentContentHash = libraryContentHash({
    profile: currentApproved.profile,
    language: currentApproved.language,
    title: currentApproved.title,
    content: currentApproved.content,
  })
  if (currentApproved.contentHash !== expectedCurrentContentHash) {
    throw new TrawelEditorialHandoffContractError(
      'SOURCE_HASH_MISMATCH',
      'El contenido current approved no coincide con su hash',
    )
  }
  const origin = currentApproved.originV1
  const expectedOriginContentHash = libraryContentHash({
    profile: origin.profile,
    language: origin.language,
    title: origin.title,
    content: origin.content,
  })
  const expectedOriginVersionHash = libraryOriginVersionHash({
    entryId: origin.libraryEntryId,
    entryKey: origin.entryKey,
    profile: origin.profile,
    language: origin.language,
    contentHash: expectedOriginContentHash,
    sourceArtifactId: origin.sourceArtifact.artifactId,
    sourceArtifactHash: origin.sourceArtifact.hash,
    finalReviewHash: origin.finalReviewArtifact.hash,
    terminalDecisionId: origin.terminalDecisionId,
  })
  if (
    origin.contentHash !== expectedOriginContentHash
    || origin.originVersionHash !== expectedOriginVersionHash
  ) {
    throw new TrawelEditorialHandoffContractError(
      'SOURCE_ORIGIN_MISMATCH',
      'El origen v1 no coincide con sus hashes canónicos',
    )
  }
  if (new Set(entry.sources.map(item => item.id)).size !== entry.sources.length) {
    throw new TrawelEditorialHandoffContractError(
      'SOURCE_DUPLICATE',
      'La entrada contiene IDs de fuente duplicados',
    )
  }
}

function buildDraftRowWithoutFingerprint(
  source: LibraryTrawelApprovedSource,
  target: TrawelEditorialTarget,
  actorId: string,
  handoffKey: string,
): DraftRowWithoutFingerprint {
  const current = source.currentApproved
  const sourceMetadata: TrawelEditorialSourceMetadata = {
    libraryEntryId: source.entry.entryId,
    transferId: source.entry.transferId,
    pilotId: source.entry.pilotId,
    runId: source.entry.runId,
    terminalDecisionId: source.entry.terminalDecisionId,
    destination: source.entry.destination,
    profile: source.entry.profile,
    language: current.language,
    currentApproved: {
      source: current.source,
      versionId: current.versionId,
      versionNumber: current.versionNumber,
      revisionId: current.revisionId,
      contentHash: current.contentHash,
      versionHash: current.versionHash,
      revisionHash: current.revisionHash,
      originVersionHash: current.originV1.originVersionHash,
      approval: current.source === 'origin_v1'
        ? { kind: 'terminal', decisionId: current.originV1.terminalDecisionId }
        : { kind: 'library_version', decisionId: requireDerivedApproval(current.approvalDecisionId) },
      approvedAt: current.approvedAt,
    },
  }
  return {
    id: deterministicRowId(handoffKey, source.entry.profile),
    entity_type: target.entityType,
    entity_id: target.entityId,
    entity_slug: target.entitySlug,
    country_slug: target.countrySlug,
    zone_slug: target.zoneSlug,
    mode: source.entry.profile,
    headline: current.title,
    intro: current.content,
    what_makes_special: null,
    highlights: [],
    suggested_route: null,
    practical_tips: [],
    sections: [],
    sources: projectPublicSources(source),
    metadata: {
      investighost: {
        schema: TRAWEL_EDITORIAL_HANDOFF_SCHEMA,
        handoffKey,
        actorId,
        source: sourceMetadata,
      },
    },
    status: 'draft',
    review_state: 'approved_in_investighost',
    published_at: null,
  }
}

function projectPublicSources(
  source: LibraryTrawelApprovedSource,
): TrawelEditorialPublicSource[] {
  return source.entry.sources.map(item => ({
    sourceId: item.id,
    title: item.title,
    url: item.url,
    publisher: item.publisher ?? null,
    publishedAt: item.publishedAt ?? null,
    contentHash: item.contentHash,
  })).sort((left, right) => compareText(left.sourceId, right.sourceId))
}

function calculateHandoffKey(
  target: TrawelEditorialTarget,
  sources: LibraryTrawelApprovedSource[],
): string {
  return canonicalPayloadHash({
    schema: TRAWEL_EDITORIAL_HANDOFF_IDENTITY_SCHEMA,
    target,
    libraryEntryIds: sources.map(source => source.entry.entryId).sort(),
  })
}

function calculatePayloadFingerprint(
  handoffKey: string,
  target: TrawelEditorialTarget,
  rows: DraftRowWithoutFingerprint[],
): string {
  return canonicalPayloadHash({
    schema: TRAWEL_EDITORIAL_HANDOFF_FINGERPRINT_SCHEMA,
    handoffKey,
    target,
    rows: [...rows].sort((left, right) => compareText(left.mode, right.mode)),
  })
}

function deterministicRowId(handoffKey: string, profile: 'adventure' | 'student'): string {
  const characters = canonicalPayloadHash({
    schema: TRAWEL_EDITORIAL_HANDOFF_ROW_ID_SCHEMA,
    handoffKey,
    profile,
  }).slice(0, 32).split('')
  characters[12] = '8'
  characters[16] = ((Number.parseInt(characters[16] ?? '0', 16) & 0x3) | 0x8).toString(16)
  const hex = characters.join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function removePayloadFingerprint(row: TrawelEditorialContentDraft): DraftRowWithoutFingerprint {
  return {
    ...row,
    metadata: {
      investighost: {
        schema: row.metadata.investighost.schema,
        handoffKey: row.metadata.investighost.handoffKey,
        actorId: row.metadata.investighost.actorId,
        source: row.metadata.investighost.source,
      },
    },
  }
}

function projectReadRow(
  row: ReturnType<typeof TrawelEditorialContentReadRowSchema.parse>,
): TrawelEditorialContentDraft {
  return TrawelEditorialContentDraftSchema.parse({
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    entity_slug: row.entity_slug,
    country_slug: row.country_slug,
    zone_slug: row.zone_slug,
    mode: row.mode,
    headline: row.headline,
    intro: row.intro,
    what_makes_special: row.what_makes_special,
    highlights: row.highlights,
    suggested_route: row.suggested_route,
    practical_tips: row.practical_tips,
    sections: row.sections,
    sources: row.sources,
    metadata: row.metadata,
    status: row.status,
    review_state: row.review_state,
    published_at: row.published_at,
  })
}

function requireDerivedApproval(value: string | null): string {
  if (value === null) {
    throw new TrawelEditorialHandoffContractError(
      'SOURCE_ORIGIN_MISMATCH',
      'Una versión derivada current approved requiere su decisión de aprobación',
    )
  }
  return value
}

function sortRows(rows: TrawelEditorialContentDraft[]): TrawelEditorialContentDraft[] {
  return [...rows].sort((left, right) => compareText(left.id, right.id))
}

function compareApprovedSources(
  left: LibraryTrawelApprovedSource,
  right: LibraryTrawelApprovedSource,
): number {
  return compareText(left.entry.profile, right.entry.profile)
}

function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function verificationError(
  code: 'VALIDATION_ERROR' | 'PAYLOAD_INTEGRITY_ERROR' | 'ROW_SET_MISMATCH' | 'CONTENT_MISMATCH',
  message: string,
): TrawelEditorialHandoffVerificationResult {
  return TrawelEditorialHandoffVerificationResultSchema.parse({ status: 'error', code, message })
}
