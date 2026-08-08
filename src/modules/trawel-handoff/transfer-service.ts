import { canonicalJsonStringify } from '@modules/library-versioning/canonicalization'
import {
  LibraryTrawelApprovedSourceSchema,
  TrawelEditorialContentDraftSchema,
  TrawelEditorialContentReadRowSchema,
  TrawelEditorialTargetSchema,
  type LibraryTrawelApprovedSource,
  type TrawelEditorialContentDraft,
  type TrawelEditorialHandoffPayload,
  type TrawelEditorialTarget,
} from '@shared/trawel-editorial-handoff-contracts'
import {
  TRAWEL_EDITORIAL_TRANSFER_SCHEMA,
  TrawelEditorialTransferCommandSchema,
  TrawelEditorialTransferResultSchema,
  type TrawelEditorialDifference,
  type TrawelEditorialTransferErrorCode,
  type TrawelEditorialTransferResult,
} from '@shared/trawel-editorial-transfer-contracts'
import {
  prepareTrawelEditorialHandoff,
  verifyTrawelEditorialHandoff,
} from './contract-adapter'

export interface TrawelEditorialApprovedSourcePort {
  loadApprovedSources(libraryEntryIds: readonly [string, string]): Promise<unknown[]>
}

export interface TrawelEditorialTransferPort {
  resolveTarget(target: TrawelEditorialTarget): Promise<unknown | null>
  readPrivateDrafts(projectRef: string, rowIds: readonly string[]): Promise<unknown[]>
  insertPrivateDraft(projectRef: string, row: TrawelEditorialContentDraft): Promise<void>
  readPublicRows(projectRef: string, rowIds: readonly string[]): Promise<unknown[]>
}

interface RowInspection {
  presentRowIds: string[]
  missingRowIds: string[]
  differences: TrawelEditorialDifference[]
}

interface TransferIdentity {
  handoffKey: string | null
  payloadFingerprint: string | null
  rowIds: string[]
}

export class TrawelEditorialTransferService {
  constructor(
    private readonly sources: TrawelEditorialApprovedSourcePort,
    private readonly trawel: TrawelEditorialTransferPort,
  ) {}

  async transfer(candidate: unknown): Promise<TrawelEditorialTransferResult> {
    const commandResult = TrawelEditorialTransferCommandSchema.safeParse(candidate)
    if (!commandResult.success) {
      return transferError(
        'VALIDATION_ERROR',
        'El comando de transferencia no cumple el contrato cerrado.',
      )
    }
    const command = commandResult.data
    let rawSources: unknown[]
    try {
      rawSources = await this.sources.loadApprovedSources(command.libraryEntryIds)
    } catch {
      return transferError(
        'SOURCE_READ_FAILED',
        'No fue posible leer las versiones aprobadas de Biblioteca.',
      )
    }
    const sourceResult = parseApprovedSources(rawSources, command.libraryEntryIds)
    if (!sourceResult.success) {
      return transferError(sourceResult.code, sourceResult.message)
    }

    let payload: TrawelEditorialHandoffPayload
    try {
      payload = prepareTrawelEditorialHandoff({
        sources: sourceResult.sources,
        target: command.target,
        actorId: command.actorId,
        confirmed: command.confirmed,
      })
    } catch {
      return transferError(
        'SOURCE_INTEGRITY_ERROR',
        'La pareja aprobada no supera las comprobaciones de integridad del handoff.',
      )
    }
    const identity = identityFor(payload)
    const targetResult = await this.confirmTarget(payload.target, identity)
    if (targetResult !== null) return targetResult

    const initialRead = await this.readPrivate(payload, identity)
    if ('error' in initialRead) return initialRead.error
    const initialInspection = inspectRows(payload, initialRead.rows, false)
    const initialConflict = await this.rejectInitialConflict(
      payload,
      initialInspection,
      identity,
    )
    if (initialConflict !== null) return initialConflict

    const initialPresent = new Set(initialInspection.presentRowIds)
    let writeFailed = false
    for (const row of payload.rows) {
      if (initialPresent.has(row.id)) continue
      try {
        await this.trawel.insertPrivateDraft(payload.target.projectRef, row)
      } catch {
        writeFailed = true
        break
      }
    }

    const readBack = await this.readPrivate(payload, identity)
    if ('error' in readBack) return readBack.error
    const finalInspection = inspectRows(payload, readBack.rows, true)
    const publicResult = await this.confirmNotPublic(payload, identity, true)
    if ('error' in publicResult) return publicResult.error

    if (finalInspection.differences.length > 0) {
      if (
        finalInspection.presentRowIds.length === 1
        && finalInspection.missingRowIds.length === 1
        && onlyMissingDifferences(finalInspection)
      ) {
        return TrawelEditorialTransferResultSchema.parse({
          status: 'partial_private_draft',
          outcome: 'FAIL',
          schema: TRAWEL_EDITORIAL_TRANSFER_SCHEMA,
          ...identity,
          code: writeFailed ? 'WRITE_FAILED' : 'READ_BACK_INCOMPLETE',
          presentRowIds: finalInspection.presentRowIds,
          missingRowIds: finalInspection.missingRowIds,
          readBackPerformed: true,
          publicReadPerformed: true,
          publicationState: 'private_draft',
          publiclyVisible: false,
          differences: finalInspection.differences,
        })
      }
      if (finalInspection.presentRowIds.length === 0 && writeFailed) {
        return transferError(
          'WRITE_FAILED',
          'La escritura falló y el read-back no encontró ninguna fila durable.',
          identity,
          true,
          true,
          false,
          finalInspection.differences,
        )
      }
      return transferConflict(
        'READ_BACK_MISMATCH',
        identity,
        finalInspection.differences,
        true,
        false,
      )
    }

    const verification = verifyTrawelEditorialHandoff(payload, readBack.rows)
    if (verification.status !== 'verified') {
      return transferConflict(
        'READ_BACK_MISMATCH',
        identity,
        [difference(
          'rows',
          'invalid',
          'dos drafts contractualmente idénticos',
          `${verification.code}: ${verification.message}`,
        )],
        true,
        false,
      )
    }
    const reusedRowIds = identity.rowIds.filter(rowId => initialPresent.has(rowId))
    const insertedRowIds = identity.rowIds.filter(rowId => !initialPresent.has(rowId))
    return TrawelEditorialTransferResultSchema.parse({
      status: 'verified',
      outcome: 'PASS',
      schema: TRAWEL_EDITORIAL_TRANSFER_SCHEMA,
      ...identity,
      operation: reusedRowIds.length === 2
        ? 'reused'
        : reusedRowIds.length === 1
          ? 'recovered_partial'
          : 'inserted',
      insertedRowIds,
      reusedRowIds,
      readBackPerformed: true,
      publicReadPerformed: true,
      publicationState: 'private_draft',
      publiclyVisible: false,
      differences: [],
    })
  }

  private async confirmTarget(
    expected: TrawelEditorialTarget,
    identity: TransferIdentity,
  ): Promise<TrawelEditorialTransferResult | null> {
    let candidate: unknown | null
    try {
      candidate = await this.trawel.resolveTarget(expected)
    } catch {
      return transferError(
        'TARGET_READ_FAILED',
        'No fue posible confirmar el target Trawel.',
        identity,
      )
    }
    if (candidate === null) {
      return transferError(
        'TARGET_NOT_FOUND',
        'El target Trawel confirmado no existe.',
        identity,
      )
    }
    const parsed = TrawelEditorialTargetSchema.safeParse(candidate)
    if (
      !parsed.success
      || canonicalJsonStringify(parsed.data) !== canonicalJsonStringify(expected)
    ) {
      return transferError(
        'TARGET_MISMATCH',
        'La lectura de Trawel no coincide exactamente con el target confirmado.',
        identity,
        false,
        false,
        null,
        [difference(
          'target',
          parsed.success ? 'different' : 'invalid',
          expected,
          parsed.success ? parsed.data : 'target inválido',
        )],
      )
    }
    return null
  }

  private async readPrivate(
    payload: TrawelEditorialHandoffPayload,
    identity: TransferIdentity,
  ): Promise<{ rows: unknown[] } | { error: TrawelEditorialTransferResult }> {
    try {
      const rows = await this.trawel.readPrivateDrafts(
        payload.target.projectRef,
        identity.rowIds,
      )
      if (!Array.isArray(rows)) throw new TypeError('private read is not an array')
      return { rows }
    } catch {
      return { error: transferError(
        'PRIVATE_READ_FAILED',
        'No fue posible releer las filas privadas de Trawel.',
        identity,
      ) }
    }
  }

  private async rejectInitialConflict(
    payload: TrawelEditorialHandoffPayload,
    inspection: RowInspection,
    identity: TransferIdentity,
  ): Promise<TrawelEditorialTransferResult | null> {
    if (inspection.differences.length === 0) return null
    const publicResult = await this.confirmNotPublic(payload, identity, true)
    if ('error' in publicResult) return publicResult.error
    return transferConflict(
      'EXISTING_ROW_CONFLICT',
      identity,
      inspection.differences,
      true,
      false,
    )
  }

  private async confirmNotPublic(
    payload: TrawelEditorialHandoffPayload,
    identity: TransferIdentity,
    readBackPerformed: boolean,
  ): Promise<{ visible: false } | { error: TrawelEditorialTransferResult }> {
    let rows: unknown[]
    try {
      rows = await this.trawel.readPublicRows(payload.target.projectRef, identity.rowIds)
      if (!Array.isArray(rows)) throw new TypeError('public read is not an array')
    } catch {
      return { error: transferError(
        'PUBLIC_READ_FAILED',
        'No fue posible demostrar la invisibilidad pública de las filas.',
        identity,
        readBackPerformed,
        true,
      ) }
    }
    if (rows.length > 0) {
      return { error: transferError(
        'PUBLIC_VISIBILITY_VIOLATION',
        'La lectura pública devolvió al menos una fila del handoff privado.',
        identity,
        readBackPerformed,
        true,
        true,
        [difference('publicRows', 'unexpected', [], { count: rows.length })],
      ) }
    }
    return { visible: false }
  }
}

function parseApprovedSources(
  candidates: unknown[],
  requestedIds: readonly [string, string],
):
  | { success: true; sources: [LibraryTrawelApprovedSource, LibraryTrawelApprovedSource] }
  | { success: false; code: TrawelEditorialTransferErrorCode; message: string } {
  if (!Array.isArray(candidates) || candidates.length !== 2) {
    return {
      success: false,
      code: 'SOURCE_VERSION_AMBIGUOUS',
      message: 'Biblioteca no devolvió exactamente una versión aprobada por entrada.',
    }
  }
  if (candidates.some(candidate => !hasApprovedBoundary(candidate))) {
    return {
      success: false,
      code: 'SOURCE_NOT_APPROVED',
      message: 'Al menos una entrada o versión fuente no está aprobada y sin publicar.',
    }
  }
  const parsed = candidates.map(candidate => LibraryTrawelApprovedSourceSchema.safeParse(candidate))
  if (parsed.some(result => !result.success)) {
    return {
      success: false,
      code: 'SOURCE_INTEGRITY_ERROR',
      message: 'La versión aprobada no coincide de forma íntegra con su entrada de Biblioteca.',
    }
  }
  const sources = parsed.map(result => {
    if (!result.success) throw new TypeError('unreachable source parse')
    return result.data
  })
  const expectedIds = [...requestedIds].sort()
  const observedIds = sources.map(source => source.entry.entryId).sort()
  if (
    new Set(observedIds).size !== 2
    || canonicalJsonStringify(observedIds) !== canonicalJsonStringify(expectedIds)
  ) {
    return {
      success: false,
      code: 'SOURCE_VERSION_AMBIGUOUS',
      message: 'La lectura no identifica una única versión para cada entrada solicitada.',
    }
  }
  return {
    success: true,
    sources: [sources[0] as LibraryTrawelApprovedSource,
      sources[1] as LibraryTrawelApprovedSource],
  }
}

function hasApprovedBoundary(candidate: unknown): boolean {
  if (!isRecord(candidate) || !isRecord(candidate.entry) || !isRecord(candidate.currentApproved)) {
    return false
  }
  return candidate.entry.status === 'approved_unpublished'
    && candidate.entry.editorialState === 'approved'
    && candidate.entry.libraryState === 'ready_for_library'
    && candidate.entry.publicationState === 'unpublished'
    && candidate.currentApproved.publicationState === 'unpublished'
}

function inspectRows(
  payload: TrawelEditorialHandoffPayload,
  candidates: unknown[],
  includeMissing: boolean,
): RowInspection {
  const expectedById = new Map(payload.rows.map(row => [row.id, row]))
  const observedById = new Map<string, TrawelEditorialContentDraft>()
  const differences: TrawelEditorialDifference[] = []
  const orderedCandidates = [...candidates].sort((left, right) => {
    const leftKey = candidateSortKey(left)
    const rightKey = candidateSortKey(right)
    if (leftKey === rightKey) return 0
    return leftKey < rightKey ? -1 : 1
  })
  for (const [index, candidate] of orderedCandidates.entries()) {
    const comparable = comparableDraft(candidate)
    if (comparable === null) {
      pushDifference(differences, difference(
        `rows[${index}]`,
        'invalid',
        'draft privado válido',
        candidate,
      ))
      continue
    }
    const expected = expectedById.get(comparable.id)
    if (expected === undefined) {
      pushDifference(differences, difference(
        `rows.${comparable.id}`,
        'unexpected',
        null,
        comparable,
      ))
      continue
    }
    if (observedById.has(comparable.id)) {
      pushDifference(differences, difference(
        `rows.${comparable.id}`,
        'unexpected',
        'una fila por ID',
        'ID duplicado',
      ))
      continue
    }
    observedById.set(comparable.id, comparable)
    collectDifferences(expected, comparable, `rows.${comparable.id}`, differences)
  }
  const presentRowIds = [...observedById.keys()].sort()
  const missingRowIds = payload.rows
    .map(row => row.id)
    .filter(rowId => !observedById.has(rowId))
    .sort()
  if (includeMissing) {
    for (const rowId of missingRowIds) {
      pushDifference(differences, difference(
        `rows.${rowId}`,
        'missing',
        expectedById.get(rowId) ?? 'fila esperada',
        null,
      ))
    }
  }
  return {
    presentRowIds,
    missingRowIds,
    differences,
  }
}

function comparableDraft(candidate: unknown): TrawelEditorialContentDraft | null {
  const direct = TrawelEditorialContentDraftSchema.safeParse(candidate)
  if (direct.success) return direct.data
  const read = TrawelEditorialContentReadRowSchema.safeParse(candidate)
  if (!read.success) return null
  const row = read.data
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

function collectDifferences(
  expected: unknown,
  actual: unknown,
  path: string,
  differences: TrawelEditorialDifference[],
): void {
  if (differences.length >= 100) return
  if (Object.is(expected, actual)) return
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const length = Math.max(expected.length, actual.length)
    for (let index = 0; index < length; index += 1) {
      if (index >= expected.length) {
        pushDifference(differences, difference(
          `${path}[${index}]`, 'unexpected', null, actual[index],
        ))
      } else if (index >= actual.length) {
        pushDifference(differences, difference(
          `${path}[${index}]`, 'missing', expected[index], null,
        ))
      } else {
        collectDifferences(expected[index], actual[index], `${path}[${index}]`, differences)
      }
    }
    return
  }
  if (isRecord(expected) && isRecord(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()
    for (const key of keys) {
      if (!(key in expected)) {
        pushDifference(differences, difference(`${path}.${key}`, 'unexpected', null, actual[key]))
      } else if (!(key in actual)) {
        pushDifference(differences, difference(`${path}.${key}`, 'missing', expected[key], null))
      } else {
        collectDifferences(expected[key], actual[key], `${path}.${key}`, differences)
      }
    }
    return
  }
  pushDifference(differences, difference(path, 'different', expected, actual))
}

function onlyMissingDifferences(inspection: RowInspection): boolean {
  return inspection.differences.every(item =>
    item.kind === 'missing' && inspection.missingRowIds.some(rowId => item.path === `rows.${rowId}`),
  )
}

function identityFor(payload: TrawelEditorialHandoffPayload): TransferIdentity {
  return {
    handoffKey: payload.handoffKey,
    payloadFingerprint: payload.payloadFingerprint,
    rowIds: payload.rows.map(row => row.id).sort(),
  }
}

function transferConflict(
  code: 'EXISTING_ROW_CONFLICT' | 'READ_BACK_MISMATCH',
  identity: TransferIdentity,
  differences: TrawelEditorialDifference[],
  publicReadPerformed: boolean,
  publiclyVisible: boolean | null,
): TrawelEditorialTransferResult {
  return TrawelEditorialTransferResultSchema.parse({
    status: 'conflict',
    outcome: 'FAIL',
    schema: TRAWEL_EDITORIAL_TRANSFER_SCHEMA,
    ...identity,
    code,
    readBackPerformed: true,
    publicReadPerformed,
    publiclyVisible,
    differences,
  })
}

function transferError(
  code: TrawelEditorialTransferErrorCode,
  message: string,
  identity: TransferIdentity = { handoffKey: null, payloadFingerprint: null, rowIds: [] },
  readBackPerformed = false,
  publicReadPerformed = false,
  publiclyVisible: boolean | null = null,
  differences: TrawelEditorialDifference[] = [],
): TrawelEditorialTransferResult {
  return TrawelEditorialTransferResultSchema.parse({
    status: 'error',
    outcome: 'FAIL',
    schema: TRAWEL_EDITORIAL_TRANSFER_SCHEMA,
    code,
    message,
    ...identity,
    readBackPerformed,
    publicReadPerformed,
    publiclyVisible,
    differences,
  })
}

function difference(
  path: string,
  kind: TrawelEditorialDifference['kind'],
  expected: unknown,
  actual: unknown,
): TrawelEditorialDifference {
  return {
    path,
    kind,
    expected: displayValue(expected),
    actual: displayValue(actual),
  }
}

function displayValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  let rendered: string
  try {
    rendered = typeof value === 'string' ? value : canonicalJsonStringify(value)
  } catch {
    rendered = '[valor no serializable]'
  }
  return rendered.length <= 1_000 ? rendered : `${rendered.slice(0, 997)}...`
}

function pushDifference(
  differences: TrawelEditorialDifference[],
  item: TrawelEditorialDifference,
): void {
  if (differences.length < 100) differences.push(item)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function candidateSortKey(value: unknown): string {
  if (isRecord(value) && typeof value.id === 'string') return `0:${value.id}`
  return `1:${displayValue(value) ?? ''}`
}
