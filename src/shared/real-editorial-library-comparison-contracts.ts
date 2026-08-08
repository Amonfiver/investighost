import { z } from 'zod'
import {
  LibraryVersionCanonicalizationContractSchema,
  LibraryVersionDomainErrorCodeSchema,
  LibraryVersionSha256Schema,
  LibraryVersionTitleSchema,
  LibraryVersionUuidSchema,
  REAL_EDITORIAL_LIBRARY_MAX_CONTENT_LENGTH,
  isCanonicalLibraryContent,
} from './real-editorial-library-contracts'

export const REAL_EDITORIAL_LIBRARY_COMPARISON_SCHEMA =
  'investighost-library-comparison-v1' as const
export const REAL_EDITORIAL_LIBRARY_COMPARISON_ALGORITHM = 'lcs-lines-v1' as const
export const REAL_EDITORIAL_LIBRARY_COMPARISON_MAX_LINES_PER_SIDE = 5_000
export const REAL_EDITORIAL_LIBRARY_COMPARISON_MAX_LCS_CELLS = 4_000_000

export const LibraryVersionComparisonEndpointSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('origin_v1'),
    libraryEntryId: LibraryVersionUuidSchema,
  }).strict(),
  z.object({
    kind: z.literal('revision'),
    versionId: LibraryVersionUuidSchema,
    revisionId: LibraryVersionUuidSchema,
  }).strict(),
])

export const CompareLibraryVersionsCommandSchema = z.object({
  left: LibraryVersionComparisonEndpointSchema,
  right: LibraryVersionComparisonEndpointSchema,
}).strict()

export const CompareLibraryVersionToParentCommandSchema = z.object({
  revision: z.object({
    kind: z.literal('revision'),
    versionId: LibraryVersionUuidSchema,
    revisionId: LibraryVersionUuidSchema,
  }).strict(),
}).strict()

const ComparableContentSchema = z.string()
  .max(REAL_EDITORIAL_LIBRARY_MAX_CONTENT_LENGTH)
  .refine(
    value => value === '' || isCanonicalLibraryContent(value),
    'El contenido comparable debe estar vacio o canonicalizado',
  )

export const LibraryVersionComparisonSideSchema = z.object({
  kind: z.enum(['origin_v1', 'revision']),
  label: z.string().regex(/^v\d+(?:\/r\d+)?$/),
  libraryEntryId: LibraryVersionUuidSchema,
  versionId: LibraryVersionUuidSchema.nullable(),
  versionNumber: z.number().int().positive(),
  revisionId: LibraryVersionUuidSchema.nullable(),
  revisionNumber: z.number().int().positive().nullable(),
  referenceHash: LibraryVersionSha256Schema,
  contentHash: LibraryVersionSha256Schema,
  title: LibraryVersionTitleSchema,
  content: ComparableContentSchema,
  lines: z.array(z.string()),
}).strict().superRefine((value, context) => {
  const origin = value.kind === 'origin_v1'
  const derivedIdentity = [value.versionId, value.revisionId, value.revisionNumber]
  const hasCompleteDerivedIdentity = derivedIdentity.every(item => item !== null)
  const hasAnyDerivedIdentity = derivedIdentity.some(item => item !== null)
  if (origin !== (value.versionNumber === 1)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['versionNumber'],
      message: 'Solo el origen v1 puede usar versionNumber 1',
    })
  }
  if ((origin && hasAnyDerivedIdentity) || (!origin && !hasCompleteDerivedIdentity)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['versionId'],
      message: 'La identidad derivada debe existir solo para revisiones',
    })
  }
  const expectedLabel = origin ? 'v1' : `v${value.versionNumber}/r${value.revisionNumber}`
  if (value.label !== expectedLabel) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['label'],
      message: 'La etiqueta debe derivarse de la version y revision',
    })
  }
  const expectedLines = value.content === '' ? [] : value.content.slice(0, -1).split('\n')
  if (
    expectedLines.length !== value.lines.length
    || expectedLines.some((line, index) => line !== value.lines[index])
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lines'],
      message: 'Las lineas deben representar exactamente el contenido canonicalizado',
    })
  }
})

export const LibraryVersionComparisonLineRangeSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().nonnegative(),
  lineCount: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (value.endLine !== value.startLine + value.lineCount - 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endLine'],
      message: 'El rango de lineas no coincide con su cantidad',
    })
  }
})

export const LibraryVersionComparisonSegmentSchema = z.object({
  kind: z.enum(['context', 'removed', 'added']),
  header: z.string().regex(/^@@ -\d+,\d+ \+\d+,\d+ @@$/),
  left: LibraryVersionComparisonLineRangeSchema,
  right: LibraryVersionComparisonLineRangeSchema,
  leftLines: z.array(z.string()),
  rightLines: z.array(z.string()),
}).strict().superRefine((value, context) => {
  const expectedLeft = value.kind === 'added' ? 0 : value.leftLines.length
  const expectedRight = value.kind === 'removed' ? 0 : value.rightLines.length
  if (value.left.lineCount !== expectedLeft) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['left', 'lineCount'],
      message: 'El rango izquierdo no coincide con las lineas del segmento',
    })
  }
  if (value.right.lineCount !== expectedRight) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['right', 'lineCount'],
      message: 'El rango derecho no coincide con las lineas del segmento',
    })
  }
  if (value.kind === 'added' && value.leftLines.length !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['leftLines'],
      message: 'Un segmento añadido no contiene lineas izquierdas',
    })
  }
  if (value.kind === 'removed' && value.rightLines.length !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rightLines'],
      message: 'Un segmento eliminado no contiene lineas derechas',
    })
  }
  if (
    value.kind === 'context'
    && (
      value.leftLines.length !== value.rightLines.length
      || value.leftLines.some((line, index) => line !== value.rightLines[index])
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rightLines'],
      message: 'El contexto debe ser identico en ambos lados',
    })
  }
  const expectedHeader = `@@ -${value.left.startLine},${value.left.lineCount} +${value.right.startLine},${value.right.lineCount} @@`
  if (value.header !== expectedHeader) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['header'],
      message: 'El encabezado debe derivarse de los rangos del segmento',
    })
  }
})

export const LibraryVersionComparisonStatisticsSchema = z.object({
  leftLines: z.number().int().nonnegative(),
  rightLines: z.number().int().nonnegative(),
  addedLines: z.number().int().nonnegative(),
  removedLines: z.number().int().nonnegative(),
  unchangedLines: z.number().int().nonnegative(),
  changedSegments: z.number().int().nonnegative(),
  totalSegments: z.number().int().nonnegative(),
  titleChanged: z.boolean(),
}).strict()

export const LibraryVersionComparisonSchema = z.object({
  schema: z.literal(REAL_EDITORIAL_LIBRARY_COMPARISON_SCHEMA),
  algorithm: z.literal(REAL_EDITORIAL_LIBRARY_COMPARISON_ALGORITHM),
  canonicalizationContract: LibraryVersionCanonicalizationContractSchema,
  comparisonKind: z.enum([
    'origin_to_origin',
    'origin_to_revision',
    'revision_to_origin',
    'revision_to_revision',
  ]),
  title: z.string().trim().min(1).max(1_100),
  left: LibraryVersionComparisonSideSchema,
  right: LibraryVersionComparisonSideSchema,
  titleChange: z.object({
    changed: z.boolean(),
    leftTitle: LibraryVersionTitleSchema,
    rightTitle: LibraryVersionTitleSchema,
  }).strict(),
  segments: z.array(LibraryVersionComparisonSegmentSchema),
  statistics: LibraryVersionComparisonStatisticsSchema,
  fingerprint: LibraryVersionSha256Schema,
}).strict().superRefine((value, context) => {
  const expected = {
    leftLines: value.left.lines.length,
    rightLines: value.right.lines.length,
    addedLines: value.segments.filter(segment => segment.kind === 'added')
      .reduce((total, segment) => total + segment.right.lineCount, 0),
    removedLines: value.segments.filter(segment => segment.kind === 'removed')
      .reduce((total, segment) => total + segment.left.lineCount, 0),
    unchangedLines: value.segments.filter(segment => segment.kind === 'context')
      .reduce((total, segment) => total + segment.left.lineCount, 0),
    changedSegments: value.segments.filter(segment => segment.kind !== 'context').length,
    totalSegments: value.segments.length,
    titleChanged: value.left.title !== value.right.title,
  }
  if (Object.entries(expected).some(([key, item]) =>
    value.statistics[key as keyof typeof expected] !== item)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['statistics'],
      message: 'Las estadisticas deben derivarse exactamente de lados y segmentos',
    })
  }
  if (
    value.titleChange.changed !== expected.titleChanged
    || value.titleChange.leftTitle !== value.left.title
    || value.titleChange.rightTitle !== value.right.title
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['titleChange'],
      message: 'El cambio de titulo debe coincidir con los extremos',
    })
  }
  const expectedKind = value.left.kind === 'origin_v1'
    ? (value.right.kind === 'origin_v1' ? 'origin_to_origin' : 'origin_to_revision')
    : (value.right.kind === 'origin_v1' ? 'revision_to_origin' : 'revision_to_revision')
  if (value.comparisonKind !== expectedKind) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['comparisonKind'],
      message: 'El tipo de comparacion debe derivarse de sus extremos',
    })
  }
  if (value.title !== `${value.left.label} (${value.left.title}) → ${value.right.label} (${value.right.title})`) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['title'],
      message: 'El titulo debe derivarse de sus extremos',
    })
  }
  let expectedLeftStart = 1
  let expectedRightStart = 1
  for (const [index, segment] of value.segments.entries()) {
    if (
      segment.left.startLine !== expectedLeftStart
      || segment.right.startLine !== expectedRightStart
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['segments', index],
        message: 'Los segmentos deben cubrir ambos contenidos en orden continuo',
      })
      break
    }
    expectedLeftStart += segment.left.lineCount
    expectedRightStart += segment.right.lineCount
  }
  if (
    expectedLeftStart !== value.left.lines.length + 1
    || expectedRightStart !== value.right.lines.length + 1
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['segments'],
      message: 'Los segmentos deben cubrir todas las lineas de ambos extremos',
    })
  }
})

export const LibraryVersionComparisonErrorCodeSchema = z.union([
  LibraryVersionDomainErrorCodeSchema,
  z.enum([
    'VALIDATION_ERROR',
    'COMPARISON_INCOMPATIBLE',
    'COMPARISON_PARENT_NOT_FOUND',
    'COMPARISON_LIMIT_EXCEEDED',
  ]),
])

export const LibraryVersionComparisonSuccessSchema = z.object({
  status: z.literal('ok'),
  comparison: LibraryVersionComparisonSchema,
}).strict()

export const LibraryVersionComparisonErrorSchema = z.object({
  status: z.literal('error'),
  code: LibraryVersionComparisonErrorCodeSchema,
  message: z.string().trim().min(1).max(500),
}).strict()

export const LibraryVersionComparisonResultSchema = z.discriminatedUnion('status', [
  LibraryVersionComparisonSuccessSchema,
  LibraryVersionComparisonErrorSchema,
])

export type LibraryVersionComparisonEndpoint = z.infer<
  typeof LibraryVersionComparisonEndpointSchema
>
export type CompareLibraryVersionsCommand = z.infer<typeof CompareLibraryVersionsCommandSchema>
export type CompareLibraryVersionToParentCommand = z.infer<
  typeof CompareLibraryVersionToParentCommandSchema
>
export type LibraryVersionComparisonSide = z.infer<typeof LibraryVersionComparisonSideSchema>
export type LibraryVersionComparisonLineRange = z.infer<
  typeof LibraryVersionComparisonLineRangeSchema
>
export type LibraryVersionComparisonSegment = z.infer<
  typeof LibraryVersionComparisonSegmentSchema
>
export type LibraryVersionComparisonStatistics = z.infer<
  typeof LibraryVersionComparisonStatisticsSchema
>
export type LibraryVersionComparison = z.infer<typeof LibraryVersionComparisonSchema>
export type LibraryVersionComparisonErrorCode = z.infer<
  typeof LibraryVersionComparisonErrorCodeSchema
>
export type LibraryVersionComparisonResult = z.infer<typeof LibraryVersionComparisonResultSchema>
