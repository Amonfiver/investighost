import { createHash } from 'node:crypto'
import {
  LibraryVersionContentSchema,
  LibraryVersionTitleSchema,
  REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
  REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
} from '@shared/real-editorial-library-contracts'

export const LIBRARY_ORIGIN_SCHEMA = 'investighost-library-origin-v1' as const
export const LIBRARY_VERSION_SCHEMA = 'investighost-library-version-v1' as const
export const LIBRARY_REVISION_SCHEMA = 'investighost-library-revision-v1' as const
export const LIBRARY_FINDING_SCHEMA = 'investighost-library-finding-v1' as const
export const LIBRARY_TRACEABILITY_SCHEMA = 'investighost-library-traceability-v1' as const
export const LIBRARY_REVIEW_TARGET_SCHEMA = 'investighost-library-review-target-v1' as const
export const LIBRARY_REQUEST_SCHEMA = 'investighost-library-request-v1' as const

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | {
  [key: string]: CanonicalJson
}

export interface CanonicalLibraryDocument {
  title: string
  content: string
}

export interface LibraryContentHashInput extends CanonicalLibraryDocument {
  profile: string
  language: string
}

export interface LibraryOriginHashInput {
  entryId: string
  entryKey: string
  profile: string
  language: string
  contentHash: string
  sourceArtifactId: string
  sourceArtifactHash: string
  finalReviewHash: string
  terminalDecisionId: string
}

export interface LibraryVersionHashInput {
  entryId: string
  versionId: string
  versionNumber: number
  parentVersionId: string | null
  parentHash: string
  createdBy: string
  createdAt: string
  creationReason: string
}

export interface LibraryRevisionHashInput {
  versionHash: string
  revisionId: string
  revisionNumber: number
  previousRevisionId: string | null
  previousRevisionHash: string | null
  contentHash: string
  createdBy: string
  createdAt: string
  reason: string
}

export interface LibraryFindingHashInput {
  versionHash: string
  revisionHash: string
  findingId: string
  findingKey: string
  sequence: number
  supersedesFindingId: string | null
  sourceFindingType: string
  sourceFindingId: string
  origin: string
  disposition: string
  claimRelation: string
  supportStatus: string
  subjectText: string
  diffAnchor: CanonicalJson
  claimIds: string[]
  evidenceReferences: CanonicalJson[]
  sourceIds: string[]
  editorDeclaration: string
  justification: string
  createdBy: string
  createdAt: string
}

export interface LibraryTraceabilityHashInput {
  originVersionHash: string
  findings: Array<{ findingKey: string; findingHash: string }>
}

export interface LibraryReviewTargetHashInput {
  versionHash: string
  revisionHash: string
  traceabilityHash: string
}

export class LibraryCanonicalizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LibraryCanonicalizationError'
  }
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return true
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

function normalizedUnicode(value: string): string {
  if (value.includes('\0') || hasLoneSurrogate(value)) {
    throw new LibraryCanonicalizationError('El texto contiene Unicode no valido')
  }
  const withoutBom = value.startsWith('\uFEFF') ? value.slice(1) : value
  return withoutBom.normalize('NFC').replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

export function canonicalizeLibraryTitle(value: string): string {
  const canonical = normalizedUnicode(value).trim()
  if (canonical.includes('\n')) {
    throw new LibraryCanonicalizationError('El titulo no puede contener saltos de linea')
  }
  const parsed = LibraryVersionTitleSchema.safeParse(canonical)
  if (!parsed.success) {
    throw new LibraryCanonicalizationError('El titulo canonicalizado no cumple el contrato')
  }
  return parsed.data
}

export function canonicalizeLibraryContent(value: string): string {
  const normalized = normalizedUnicode(value)
  const lines = normalized.split('\n').map(line => line.replace(/[ \t]+$/u, ''))
  while (lines.length > 0 && lines.at(-1) === '') lines.pop()
  const canonical = `${lines.join('\n')}\n`
  const parsed = LibraryVersionContentSchema.safeParse(canonical)
  if (!parsed.success) {
    throw new LibraryCanonicalizationError('El contenido canonicalizado no cumple el contrato')
  }
  return parsed.data
}

export function canonicalizeLibraryDocument(
  title: string,
  content: string,
): CanonicalLibraryDocument {
  return {
    title: canonicalizeLibraryTitle(title),
    content: canonicalizeLibraryContent(content),
  }
}

export function canonicalizeLibraryAuditText(value: string): string {
  const canonical = normalizedUnicode(value)
    .split('\n')
    .map(line => line.replace(/[ \t]+$/u, ''))
    .join('\n')
    .trim()
  if (!canonical) throw new LibraryCanonicalizationError('El texto de auditoria esta vacio')
  return canonical
}

export function canonicalJsonStringify(value: unknown): string {
  return serializeCanonicalJson(value)
}

function serializeCanonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') {
    if (hasLoneSurrogate(value)) {
      throw new LibraryCanonicalizationError('JCS no admite Unicode no valido')
    }
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new LibraryCanonicalizationError('JCS no admite numeros no finitos ni -0')
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeCanonicalJson).join(',')}]`
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const entries = Object.keys(record).sort().map(key => {
      if (record[key] === undefined) {
        throw new LibraryCanonicalizationError('JCS exige omitir opcionales undefined')
      }
      return `${JSON.stringify(key)}:${serializeCanonicalJson(record[key])}`
    })
    return `{${entries.join(',')}}`
  }
  throw new LibraryCanonicalizationError(`JCS no admite valores ${typeof value}`)
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export function canonicalPayloadHash(payload: unknown): string {
  return sha256Hex(Buffer.from(canonicalJsonStringify(payload), 'utf8'))
}

export function libraryContentHash(input: LibraryContentHashInput): string {
  LibraryVersionTitleSchema.parse(input.title)
  LibraryVersionContentSchema.parse(input.content)
  return canonicalPayloadHash({
    schema: REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
    canonicalization: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
    profile: input.profile,
    language: input.language,
    title: input.title,
    content: input.content,
  })
}

export function libraryOriginVersionHash(input: LibraryOriginHashInput): string {
  return canonicalPayloadHash({ schema: LIBRARY_ORIGIN_SCHEMA, ...input })
}

export function libraryVersionHash(input: LibraryVersionHashInput): string {
  return canonicalPayloadHash({
    schema: LIBRARY_VERSION_SCHEMA,
    ...input,
    createdAt: canonicalTimestamp(input.createdAt),
  })
}

export function libraryRevisionHash(input: LibraryRevisionHashInput): string {
  return canonicalPayloadHash({
    schema: LIBRARY_REVISION_SCHEMA,
    ...input,
    createdAt: canonicalTimestamp(input.createdAt),
  })
}

export function libraryFindingHash(input: LibraryFindingHashInput): string {
  return canonicalPayloadHash({
    schema: LIBRARY_FINDING_SCHEMA,
    ...input,
    createdAt: canonicalTimestamp(input.createdAt),
  })
}

export function libraryTraceabilityHash(input: LibraryTraceabilityHashInput): string {
  const findings = [...input.findings].sort((left, right) => {
    if (left.findingKey === right.findingKey) return 0
    return left.findingKey < right.findingKey ? -1 : 1
  })
  if (new Set(findings.map(finding => finding.findingKey)).size !== findings.length) {
    throw new LibraryCanonicalizationError('Traceability contiene finding_key duplicada')
  }
  return canonicalPayloadHash({
    schema: LIBRARY_TRACEABILITY_SCHEMA,
    originVersionHash: input.originVersionHash,
    findings,
  })
}

export function libraryDecisionTargetHash(input: LibraryReviewTargetHashInput): string {
  return canonicalPayloadHash({ schema: LIBRARY_REVIEW_TARGET_SCHEMA, ...input })
}

export function libraryRequestFingerprint(operation: string, payload: unknown): string {
  return canonicalPayloadHash({ schema: LIBRARY_REQUEST_SCHEMA, operation, payload })
}

export function canonicalTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new LibraryCanonicalizationError('El timestamp no es valido')
  }
  return date.toISOString()
}
