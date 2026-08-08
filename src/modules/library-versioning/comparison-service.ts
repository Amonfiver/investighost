import { z } from 'zod'
import {
  CompareLibraryVersionsCommandSchema,
  CompareLibraryVersionToParentCommandSchema,
  LibraryVersionComparisonResultSchema,
  LibraryVersionComparisonSchema,
  LibraryVersionComparisonSideSchema,
  REAL_EDITORIAL_LIBRARY_COMPARISON_ALGORITHM,
  REAL_EDITORIAL_LIBRARY_COMPARISON_MAX_LCS_CELLS,
  REAL_EDITORIAL_LIBRARY_COMPARISON_MAX_LINES_PER_SIDE,
  REAL_EDITORIAL_LIBRARY_COMPARISON_SCHEMA,
  type CompareLibraryVersionsCommand,
  type CompareLibraryVersionToParentCommand,
  type LibraryVersionComparison,
  type LibraryVersionComparisonEndpoint,
  type LibraryVersionComparisonErrorCode,
  type LibraryVersionComparisonResult,
  type LibraryVersionComparisonSegment,
  type LibraryVersionComparisonSide,
  type LibraryVersionComparisonStatistics,
} from '@shared/real-editorial-library-comparison-contracts'
import {
  REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
} from '@shared/real-editorial-library-contracts'
import type {
  LibraryEntryVersioningSummary,
  LibraryVersionDetail,
  LibraryVersionRevisionDetail,
} from '@shared/real-editorial-library-read-contracts'
import {
  canonicalPayloadHash,
  canonicalizeLibraryComparableContent,
  canonicalizeLibraryTitle,
} from './canonicalization'
import {
  LibraryVersioningRepositoryError,
  type RealEditorialLibraryVersioningReadRepository,
} from './repository'

type ComparisonSideInput = Omit<LibraryVersionComparisonSide, 'content' | 'lines' | 'title'> & {
  title: string
  content: string
}

type DiffOperation = { kind: 'context' | 'removed' | 'added'; line: string }

interface ResolvedRevision {
  side: ComparisonSideInput
  detail: LibraryVersionDetail
  revision: LibraryVersionRevisionDetail
}

interface CanonicalLineDiff {
  leftContent: string
  rightContent: string
  leftLines: string[]
  rightLines: string[]
  segments: LibraryVersionComparisonSegment[]
}

class LibraryVersionComparisonFailure extends Error {
  constructor(readonly code: LibraryVersionComparisonErrorCode) {
    super(comparisonErrorMessage(code))
    this.name = 'LibraryVersionComparisonFailure'
  }
}

export class RealEditorialLibraryVersionComparisonService {
  constructor(private readonly repository: RealEditorialLibraryVersioningReadRepository) {}

  async compare(
    candidate: CompareLibraryVersionsCommand,
  ): Promise<LibraryVersionComparisonResult> {
    const parsed = CompareLibraryVersionsCommandSchema.safeParse(candidate)
    if (!parsed.success) return comparisonError('VALIDATION_ERROR')
    try {
      const reads = new ComparisonReadContext(this.repository)
      const left = await reads.resolveEndpoint(parsed.data.left)
      const right = await reads.resolveEndpoint(parsed.data.right)
      assertCompatible(left, right)
      return comparisonSuccess(buildLibraryVersionComparison(left, right))
    } catch (error) {
      return mapComparisonError(error)
    }
  }

  async compareToParent(
    candidate: CompareLibraryVersionToParentCommand,
  ): Promise<LibraryVersionComparisonResult> {
    const parsed = CompareLibraryVersionToParentCommandSchema.safeParse(candidate)
    if (!parsed.success) return comparisonError('VALIDATION_ERROR')
    try {
      const reads = new ComparisonReadContext(this.repository)
      const child = await reads.resolveRevision(parsed.data.revision)
      const previousRevisionId = child.revision.previousRevisionId
      if (previousRevisionId === null) {
        throw new LibraryVersionComparisonFailure('COMPARISON_PARENT_NOT_FOUND')
      }
      const parent = await reads.resolveRevision({
        kind: 'revision',
        versionId: child.revision.versionId,
        revisionId: previousRevisionId,
      })
      if (
        child.revision.revisionNumber !== parent.revision.revisionNumber + 1
        || child.revision.expectedPreviousRevisionHash !== parent.revision.revisionHash
      ) {
        throw new LibraryVersionComparisonFailure('INVALID_VERSION_HISTORY')
      }
      return comparisonSuccess(buildLibraryVersionComparison(parent.side, child.side))
    } catch (error) {
      return mapComparisonError(error)
    }
  }
}

class ComparisonReadContext {
  private readonly details = new Map<string, Promise<LibraryVersionDetail>>()
  private readonly summaries = new Map<string, Promise<LibraryEntryVersioningSummary>>()

  constructor(private readonly repository: RealEditorialLibraryVersioningReadRepository) {}

  async resolveEndpoint(endpoint: LibraryVersionComparisonEndpoint): Promise<ComparisonSideInput> {
    if (endpoint.kind === 'origin_v1') return this.resolveOrigin(endpoint.libraryEntryId)
    return (await this.resolveRevision(endpoint)).side
  }

  async resolveRevision(
    endpoint: Extract<LibraryVersionComparisonEndpoint, { kind: 'revision' }>,
  ): Promise<ResolvedRevision> {
    const detail = await this.cached(
      this.details,
      endpoint.versionId,
      () => this.repository.getVersionDetail(endpoint.versionId),
    )
    const detailRevision = detail.revisions.find(item => item.id === endpoint.revisionId)
    if (detailRevision === undefined) {
      await this.repository.getVersionRevision(endpoint.versionId, endpoint.revisionId)
      throw new LibraryVersionComparisonFailure('INVALID_VERSION_HISTORY')
    }
    const revision = detailRevision
    if (
      detail.version.versionId !== endpoint.versionId
      || revision.versionId !== endpoint.versionId
    ) {
      throw new LibraryVersionComparisonFailure('INVALID_VERSION_HISTORY')
    }
    return {
      detail,
      revision,
      side: {
        kind: 'revision',
        label: `v${detail.version.versionNumber}/r${revision.revisionNumber}`,
        libraryEntryId: detail.version.libraryEntryId,
        versionId: detail.version.versionId,
        versionNumber: detail.version.versionNumber,
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        referenceHash: revision.revisionHash,
        contentHash: revision.contentHash,
        title: revision.title,
        content: revision.content,
      },
    }
  }

  private async resolveOrigin(libraryEntryId: string): Promise<ComparisonSideInput> {
    const summary = await this.cached(
      this.summaries,
      libraryEntryId,
      () => this.repository.getVersioningSummary(libraryEntryId),
    )
    const origin = summary.originalVersion
    if (summary.libraryEntryId !== libraryEntryId || origin.libraryEntryId !== libraryEntryId) {
      throw new LibraryVersionComparisonFailure('INVALID_VERSION_HISTORY')
    }
    return {
      kind: 'origin_v1',
      label: 'v1',
      libraryEntryId,
      versionId: null,
      versionNumber: 1,
      revisionId: null,
      revisionNumber: null,
      referenceHash: origin.originVersionHash,
      contentHash: origin.contentHash,
      title: origin.title,
      content: origin.content,
    }
  }

  private cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
    const existing = cache.get(key)
    if (existing !== undefined) return existing
    const pending = load()
    cache.set(key, pending)
    return pending
  }
}

export function buildLibraryVersionComparison(
  leftInput: ComparisonSideInput,
  rightInput: ComparisonSideInput,
): LibraryVersionComparison {
  const diff = diffLibraryVersionContent(leftInput.content, rightInput.content)
  const left = LibraryVersionComparisonSideSchema.parse({
    ...leftInput,
    title: canonicalizeLibraryTitle(leftInput.title),
    content: diff.leftContent,
    lines: diff.leftLines,
  })
  const right = LibraryVersionComparisonSideSchema.parse({
    ...rightInput,
    title: canonicalizeLibraryTitle(rightInput.title),
    content: diff.rightContent,
    lines: diff.rightLines,
  })
  assertCompatible(left, right)
  const titleChanged = left.title !== right.title
  const statistics = comparisonStatistics(
    diff.segments,
    left.lines.length,
    right.lines.length,
    titleChanged,
  )
  const logicalComparison = {
    schema: REAL_EDITORIAL_LIBRARY_COMPARISON_SCHEMA,
    algorithm: REAL_EDITORIAL_LIBRARY_COMPARISON_ALGORITHM,
    canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
    comparisonKind: comparisonKind(left, right),
    title: `${left.label} (${left.title}) → ${right.label} (${right.title})`,
    left,
    right,
    titleChange: { changed: titleChanged, leftTitle: left.title, rightTitle: right.title },
    segments: diff.segments,
    statistics,
  }
  return LibraryVersionComparisonSchema.parse({
    ...logicalComparison,
    fingerprint: canonicalPayloadHash(logicalComparison),
  })
}

export function diffLibraryVersionContent(
  leftInput: string,
  rightInput: string,
): CanonicalLineDiff {
  const leftContent = canonicalizeLibraryComparableContent(leftInput)
  const rightContent = canonicalizeLibraryComparableContent(rightInput)
  const leftLines = contentLines(leftContent)
  const rightLines = contentLines(rightContent)
  if (
    leftLines.length > REAL_EDITORIAL_LIBRARY_COMPARISON_MAX_LINES_PER_SIDE
    || rightLines.length > REAL_EDITORIAL_LIBRARY_COMPARISON_MAX_LINES_PER_SIDE
  ) {
    throw new LibraryVersionComparisonFailure('COMPARISON_LIMIT_EXCEEDED')
  }
  const operations = lineOperations(leftLines, rightLines)
  return {
    leftContent,
    rightContent,
    leftLines,
    rightLines,
    segments: groupOperations(operations),
  }
}

function lineOperations(left: string[], right: string[]): DiffOperation[] {
  let prefixLength = 0
  while (
    prefixLength < left.length
    && prefixLength < right.length
    && left[prefixLength] === right[prefixLength]
  ) prefixLength += 1

  let suffixLength = 0
  while (
    suffixLength < left.length - prefixLength
    && suffixLength < right.length - prefixLength
    && left[left.length - suffixLength - 1] === right[right.length - suffixLength - 1]
  ) suffixLength += 1

  const leftMiddle = left.slice(prefixLength, left.length - suffixLength)
  const rightMiddle = right.slice(prefixLength, right.length - suffixLength)
  const matrixCells = (leftMiddle.length + 1) * (rightMiddle.length + 1)
  if (matrixCells > REAL_EDITORIAL_LIBRARY_COMPARISON_MAX_LCS_CELLS) {
    throw new LibraryVersionComparisonFailure('COMPARISON_LIMIT_EXCEEDED')
  }

  const operations: DiffOperation[] = left.slice(0, prefixLength)
    .map(line => ({ kind: 'context' as const, line }))
  operations.push(...middleLineOperations(leftMiddle, rightMiddle))
  operations.push(...left.slice(left.length - suffixLength)
    .map(line => ({ kind: 'context' as const, line })))
  return operations
}

function middleLineOperations(left: string[], right: string[]): DiffOperation[] {
  const width = right.length + 1
  const lcs = new Uint32Array((left.length + 1) * width)
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      const index = leftIndex * width + rightIndex
      lcs[index] = left[leftIndex] === right[rightIndex]
        ? lcs[(leftIndex + 1) * width + rightIndex + 1] + 1
        : Math.max(lcs[(leftIndex + 1) * width + rightIndex], lcs[index + 1])
    }
  }

  const operations: DiffOperation[] = []
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length || rightIndex < right.length) {
    if (
      leftIndex < left.length
      && rightIndex < right.length
      && left[leftIndex] === right[rightIndex]
    ) {
      operations.push({ kind: 'context', line: left[leftIndex] })
      leftIndex += 1
      rightIndex += 1
    } else if (
      leftIndex < left.length
      && (
        rightIndex >= right.length
        || lcs[(leftIndex + 1) * width + rightIndex]
          >= lcs[leftIndex * width + rightIndex + 1]
      )
    ) {
      operations.push({ kind: 'removed', line: left[leftIndex] })
      leftIndex += 1
    } else {
      operations.push({ kind: 'added', line: right[rightIndex] })
      rightIndex += 1
    }
  }
  return operations
}

function groupOperations(operations: DiffOperation[]): LibraryVersionComparisonSegment[] {
  const segments: LibraryVersionComparisonSegment[] = []
  let leftLine = 1
  let rightLine = 1
  for (let operationIndex = 0; operationIndex < operations.length;) {
    const kind = operations[operationIndex].kind
    const leftStart = leftLine
    const rightStart = rightLine
    const leftLines: string[] = []
    const rightLines: string[] = []
    while (operationIndex < operations.length && operations[operationIndex].kind === kind) {
      const operation = operations[operationIndex]
      if (operation.kind !== 'added') {
        leftLines.push(operation.line)
        leftLine += 1
      }
      if (operation.kind !== 'removed') {
        rightLines.push(operation.line)
        rightLine += 1
      }
      operationIndex += 1
    }
    const left = lineRange(leftStart, leftLines.length)
    const right = lineRange(rightStart, rightLines.length)
    segments.push({
      kind,
      header: `@@ -${left.startLine},${left.lineCount} +${right.startLine},${right.lineCount} @@`,
      left,
      right,
      leftLines,
      rightLines,
    })
  }
  return segments
}

function lineRange(startLine: number, lineCount: number) {
  return { startLine, endLine: startLine + lineCount - 1, lineCount }
}

function contentLines(content: string): string[] {
  return content === '' ? [] : content.slice(0, -1).split('\n')
}

function comparisonStatistics(
  segments: LibraryVersionComparisonSegment[],
  leftLines: number,
  rightLines: number,
  titleChanged: boolean,
): LibraryVersionComparisonStatistics {
  return {
    leftLines,
    rightLines,
    addedLines: sumSegmentLines(segments, 'added', 'right'),
    removedLines: sumSegmentLines(segments, 'removed', 'left'),
    unchangedLines: sumSegmentLines(segments, 'context', 'left'),
    changedSegments: segments.filter(segment => segment.kind !== 'context').length,
    totalSegments: segments.length,
    titleChanged,
  }
}

function sumSegmentLines(
  segments: LibraryVersionComparisonSegment[],
  kind: LibraryVersionComparisonSegment['kind'],
  side: 'left' | 'right',
): number {
  return segments
    .filter(segment => segment.kind === kind)
    .reduce((total, segment) => total + segment[side].lineCount, 0)
}

function assertCompatible(
  left: Pick<LibraryVersionComparisonSide, 'libraryEntryId'>,
  right: Pick<LibraryVersionComparisonSide, 'libraryEntryId'>,
): void {
  if (left.libraryEntryId !== right.libraryEntryId) {
    throw new LibraryVersionComparisonFailure('COMPARISON_INCOMPATIBLE')
  }
}

function comparisonKind(
  left: LibraryVersionComparisonSide,
  right: LibraryVersionComparisonSide,
): LibraryVersionComparison['comparisonKind'] {
  if (left.kind === 'origin_v1') {
    return right.kind === 'origin_v1' ? 'origin_to_origin' : 'origin_to_revision'
  }
  return right.kind === 'origin_v1' ? 'revision_to_origin' : 'revision_to_revision'
}

function comparisonSuccess(comparison: LibraryVersionComparison): LibraryVersionComparisonResult {
  return LibraryVersionComparisonResultSchema.parse({ status: 'ok', comparison })
}

function comparisonError(code: LibraryVersionComparisonErrorCode): LibraryVersionComparisonResult {
  return LibraryVersionComparisonResultSchema.parse({
    status: 'error',
    code,
    message: comparisonErrorMessage(code),
  })
}

function mapComparisonError(error: unknown): LibraryVersionComparisonResult {
  if (error instanceof LibraryVersionComparisonFailure) return comparisonError(error.code)
  if (error instanceof LibraryVersioningRepositoryError) return comparisonError(error.code)
  if (error instanceof z.ZodError) return comparisonError('INVALID_VERSION_HISTORY')
  return comparisonError('PERSISTENCE_ERROR')
}

function comparisonErrorMessage(code: LibraryVersionComparisonErrorCode): string {
  const messages: Record<LibraryVersionComparisonErrorCode, string> = {
    STALE_REVISION: 'La revision solicitada ya no es vigente',
    STALE_VERSION_STATE: 'El estado de version solicitado ya no es vigente',
    STALE_DECISION_TARGET: 'El target de decision solicitado ya no es vigente',
    IDEMPOTENCY_CONFLICT: 'La operacion entra en conflicto con otra existente',
    VERSION_ALREADY_OPEN: 'Ya existe una version abierta para el artefacto',
    INVALID_STATE_TRANSITION: 'La transicion de estado no es valida',
    HASH_MISMATCH: 'La integridad de los hashes no coincide',
    UNSUPPORTED_CLAIM_BLOCKS_APPROVAL: 'Una afirmacion sin respaldo bloquea la operacion',
    FINDINGS_NOT_RECONCILED: 'Los findings no estan reconciliados',
    LIBRARY_ENTRY_NOT_FOUND: 'No existe el artefacto de Biblioteca solicitado',
    ORIGIN_REFERENCE_INVALID: 'La referencia al origen no es valida',
    VERSION_NOT_FOUND: 'No existe la version solicitada',
    REVISION_NOT_FOUND: 'No existe la revision solicitada',
    REVISION_VERSION_MISMATCH: 'La revision no pertenece a la version indicada',
    INVALID_VERSION_HISTORY: 'El historial de version es incoherente',
    INVALID_DECISION_HISTORY: 'El historial de decisiones es incoherente',
    ACTOR_NOT_AUTHORIZED: 'El actor no esta autorizado',
    PERSISTENCE_ERROR: 'No se pudo completar la lectura de comparacion',
    VALIDATION_ERROR: 'La solicitud de comparacion no cumple el contrato',
    COMPARISON_INCOMPATIBLE: 'Los extremos no pertenecen al mismo artefacto',
    COMPARISON_PARENT_NOT_FOUND: 'La revision no tiene un padre inmediato valido',
    COMPARISON_LIMIT_EXCEEDED: 'La comparacion excede los limites deterministas',
  }
  return messages[code]
}
