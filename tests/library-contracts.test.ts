import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  LIBRARY_DEFAULT_PAGE_SIZE,
  LIBRARY_MAX_PAGE_SIZE,
  LibraryCursorSchema,
  LibraryPageQuerySchema,
  LibraryPageSchema,
} from '@shared/library-contracts'

const validCursor = () => ({
  sort: { field: 'updated_at' as const, direction: 'desc' as const },
  updatedAt: '2026-07-25T10:15:30.000Z',
  requestId: randomUUID(),
})

describe('Library pagination contracts', () => {
  it('applies the canonical order and default page size', () => {
    expect(LibraryPageQuerySchema.parse({})).toEqual({
      pageSize: LIBRARY_DEFAULT_PAGE_SIZE,
      sort: { field: 'updated_at', direction: 'desc' },
    })
  })

  it('accepts the maximum page size and a valid cursor', () => {
    const parsed = LibraryPageQuerySchema.parse({
      pageSize: LIBRARY_MAX_PAGE_SIZE,
      cursor: validCursor(),
    })
    expect(parsed.pageSize).toBe(100)
    expect(parsed.cursor?.updatedAt).toBe('2026-07-25T10:15:30.000Z')
  })

  it('preserves PostgreSQL timestamp precision in the cursor', () => {
    const cursor = LibraryCursorSchema.parse({
      ...validCursor(),
      updatedAt: '2026-07-25T10:15:30.123456+00:00',
    })
    expect(cursor.updatedAt).toBe('2026-07-25T10:15:30.123456+00:00')
  })

  it.each([
    { pageSize: 0 },
    { pageSize: LIBRARY_MAX_PAGE_SIZE + 1 },
    { pageSize: 1.5 },
    { pageSize: '25' },
    { unexpected: true },
  ])('rejects an invalid page query: %o', candidate => {
    expect(LibraryPageQuerySchema.safeParse(candidate).success).toBe(false)
  })

  it.each([
    { ...validCursor(), updatedAt: 'not-a-date' },
    { ...validCursor(), requestId: 'not-a-uuid' },
    { ...validCursor(), sort: { field: 'created_at', direction: 'desc' } },
    { ...validCursor(), sort: { field: 'updated_at', direction: 'asc' } },
    { ...validCursor(), arbitrary: 'value' },
  ])('rejects an invalid or foreign cursor: %o', candidate => {
    expect(LibraryCursorSchema.safeParse(candidate).success).toBe(false)
  })

  it('accepts an empty final page and enforces cursor/hasMore consistency', () => {
    expect(LibraryPageSchema.parse({ items: [], hasMore: false })).toEqual({
      items: [],
      hasMore: false,
    })
    expect(LibraryPageSchema.safeParse({
      items: [],
      hasMore: true,
      nextCursor: validCursor(),
    }).success).toBe(false)
    expect(LibraryPageSchema.safeParse({
      items: [],
      hasMore: true,
    }).success).toBe(false)
  })
})
