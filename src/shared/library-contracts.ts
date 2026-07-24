import { z } from 'zod'
import {
  EditorialProfileSchema,
  ResearchFailureClassificationSchema,
  ResearchRunStateSchema,
  ResearchStageSchema,
  ResearchStateSchema,
} from './editorial-contracts'

const UuidSchema = z.string().uuid()
const IsoTimestampSchema = z.string().datetime({ offset: true })

export const LIBRARY_DEFAULT_PAGE_SIZE = 25
export const LIBRARY_MAX_PAGE_SIZE = 100
export const LIBRARY_DEFAULT_SORT = {
  field: 'updated_at',
  direction: 'desc',
} as const

export const LibrarySortSchema = z.object({
  field: z.literal('updated_at'),
  direction: z.literal('desc'),
}).strict()

export const LibraryCursorSchema = z.object({
  sort: LibrarySortSchema,
  updatedAt: IsoTimestampSchema,
  requestId: UuidSchema,
}).strict()

export const LibraryPageQuerySchema = z.object({
  pageSize: z.number().int().min(1).max(LIBRARY_MAX_PAGE_SIZE).default(LIBRARY_DEFAULT_PAGE_SIZE),
  sort: LibrarySortSchema.default(LIBRARY_DEFAULT_SORT),
  cursor: LibraryCursorSchema.optional(),
}).strict().superRefine((value, context) => {
  if (
    value.cursor
    && (
      value.cursor.sort.field !== value.sort.field
      || value.cursor.sort.direction !== value.sort.direction
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cursor', 'sort'],
      message: 'El cursor pertenece a otra ordenación de Biblioteca',
    })
  }
})

export const LibraryItemSchema = z.object({
  requestId: UuidSchema,
  runId: UuidSchema.optional(),
  destinationId: UuidSchema,
  destinationQuery: z.string().trim().min(1).max(300),
  profiles: z.array(EditorialProfileSchema).min(1).max(2),
  state: ResearchStateSchema,
  version: z.number().int().positive(),
  stage: ResearchStageSchema.optional(),
  runState: ResearchRunStateSchema.optional(),
  errorCode: z.string().max(120).optional(),
  errorMessage: z.string().max(2000).optional(),
  failureClassification: ResearchFailureClassificationSchema.optional(),
  failedAt: z.date().optional(),
  hasActiveIncident: z.boolean(),
  hasHistoricalIncident: z.boolean().optional(),
  latestRunActualCost: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
}).strict()

export const LibraryPageSchema = z.object({
  items: z.array(LibraryItemSchema).max(LIBRARY_MAX_PAGE_SIZE),
  nextCursor: LibraryCursorSchema.optional(),
  hasMore: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.hasMore !== Boolean(value.nextCursor)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['nextCursor'],
      message: 'nextCursor debe existir exactamente cuando hasMore es verdadero',
    })
  }
  if (value.items.length === 0 && value.nextCursor) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['nextCursor'],
      message: 'Una página vacía no puede ofrecer cursor siguiente',
    })
  }
})

export type LibrarySort = z.infer<typeof LibrarySortSchema>
export type LibraryCursor = z.infer<typeof LibraryCursorSchema>
export type LibraryPageQueryInput = z.input<typeof LibraryPageQuerySchema>
export type LibraryPageQuery = z.output<typeof LibraryPageQuerySchema>
export type LibraryItem = z.infer<typeof LibraryItemSchema>
export type LibraryPage = z.infer<typeof LibraryPageSchema>

export function createLibraryCursor(
  item: { requestId: string; updatedAt: Date | string },
  sort: LibrarySort = LIBRARY_DEFAULT_SORT,
): LibraryCursor {
  return LibraryCursorSchema.parse({
    sort,
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
    requestId: item.requestId,
  })
}

export function compareLibraryItems(
  left: Pick<LibraryItem, 'requestId' | 'updatedAt'>,
  right: Pick<LibraryItem, 'requestId' | 'updatedAt'>,
): number {
  const byUpdatedAt = right.updatedAt.getTime() - left.updatedAt.getTime()
  if (byUpdatedAt !== 0) return byUpdatedAt
  return right.requestId.localeCompare(left.requestId)
}

export function isLibraryItemAfterCursor(
  item: Pick<LibraryItem, 'requestId' | 'updatedAt'>,
  cursor: LibraryCursor,
): boolean {
  const itemTime = item.updatedAt.getTime()
  const cursorTime = new Date(cursor.updatedAt).getTime()
  return itemTime < cursorTime || (itemTime === cursorTime && item.requestId < cursor.requestId)
}
