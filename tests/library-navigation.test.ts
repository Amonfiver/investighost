import { describe, expect, it, vi } from 'vitest'
import type {
  LibraryCursor,
  LibraryItem,
  LibraryPage,
  LibraryPageQueryInput,
} from '@shared/library-contracts'
import {
  LIBRARY_PAGE_SUMMARY_LABEL,
  LibraryNavigator,
  libraryNavigationAvailability,
  libraryPageNumber,
} from '../src/renderer/library-navigation'

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function item(index: number): LibraryItem {
  const timestamp = new Date(Date.UTC(2026, 6, 25, 12, 0, 60 - index))
  return {
    requestId: uuid(index),
    runId: uuid(index + 100),
    destinationId: uuid(index + 200),
    destinationQuery: `Destino ${index}`,
    profiles: ['adventure'],
    state: 'completed',
    version: 1,
    stage: 'human_review',
    runState: 'completed',
    hasActiveIncident: false,
    latestRunActualCost: 0.01,
    currency: 'EUR',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function cursor(index: number): LibraryCursor {
  return {
    sort: {
      field: 'updated_at',
      direction: 'desc',
    },
    updatedAt: item(index).updatedAt.toISOString(),
    requestId: item(index).requestId,
  }
}

function page(indices: number[], nextCursor?: LibraryCursor): LibraryPage {
  return {
    items: indices.map(item),
    hasMore: Boolean(nextCursor),
    ...(nextCursor ? { nextCursor } : {}),
  }
}

function threePageLoader() {
  const first = page([1, 2], cursor(2))
  const second = page([3, 4], cursor(4))
  const third = page([5, 6])
  const load = vi.fn(async (query: LibraryPageQueryInput) => {
    if (!query.cursor) return first
    if (query.cursor.requestId === cursor(2).requestId) return second
    if (query.cursor.requestId === cursor(4).requestId) return third
    throw new Error('Cursor desconocido')
  })
  return { first, second, third, load }
}

describe('Library visible navigation', () => {
  it('loads the first page without a cursor and reports page 1', async () => {
    const { first, load } = threePageLoader()
    const navigator = new LibraryNavigator(load)

    await navigator.first()

    expect(load).toHaveBeenCalledWith({})
    expect(navigator.snapshot.page).toEqual(first)
    expect(libraryPageNumber(navigator.snapshot)).toBe(1)
  })

  it('enables Next when the current page has more results', async () => {
    const { load } = threePageLoader()
    const navigator = new LibraryNavigator(load)
    await navigator.first()

    expect(libraryNavigationAvailability(navigator.snapshot).canNext).toBe(true)
  })

  it('disables Next when the current page has no more results', async () => {
    const navigator = new LibraryNavigator(async () => page([1, 2]))
    await navigator.first()

    expect(libraryNavigationAvailability(navigator.snapshot).canNext).toBe(false)
  })

  it('disables Previous on page 1', async () => {
    const { load } = threePageLoader()
    const navigator = new LibraryNavigator(load)
    await navigator.first()

    expect(libraryNavigationAvailability(navigator.snapshot).canPrevious).toBe(false)
  })

  it('navigates from page 1 to page 2 using nextCursor', async () => {
    const { second, load } = threePageLoader()
    const navigator = new LibraryNavigator(load)
    await navigator.first()

    await navigator.next()

    expect(load).toHaveBeenLastCalledWith({ cursor: cursor(2) })
    expect(navigator.snapshot.page).toEqual(second)
    expect(libraryPageNumber(navigator.snapshot)).toBe(2)
  })

  it('navigates from page 1 through page 2 to page 3', async () => {
    const { third, load } = threePageLoader()
    const navigator = new LibraryNavigator(load)
    await navigator.first()
    await navigator.next()

    await navigator.next()

    expect(load).toHaveBeenLastCalledWith({ cursor: cursor(4) })
    expect(navigator.snapshot.page).toEqual(third)
    expect(libraryPageNumber(navigator.snapshot)).toBe(3)
  })

  it('returns exactly from page 3 to page 2 and then page 1', async () => {
    const { first, second, load } = threePageLoader()
    const navigator = new LibraryNavigator(load)
    await navigator.first()
    await navigator.next()
    await navigator.next()

    await navigator.previous()
    expect(navigator.snapshot.page).toEqual(second)
    expect(libraryPageNumber(navigator.snapshot)).toBe(2)
    expect(load).toHaveBeenLastCalledWith({ cursor: cursor(2) })

    await navigator.previous()
    expect(navigator.snapshot.page).toEqual(first)
    expect(libraryPageNumber(navigator.snapshot)).toBe(1)
    expect(load).toHaveBeenLastCalledWith({})
  })

  it('returns directly to the first page and clears visited cursors', async () => {
    const { first, load } = threePageLoader()
    const navigator = new LibraryNavigator(load)
    await navigator.first()
    await navigator.next()
    await navigator.next()

    await navigator.first()

    expect(navigator.snapshot.page).toEqual(first)
    expect(navigator.snapshot.cursorStack).toEqual([])
    expect(libraryPageNumber(navigator.snapshot)).toBe(1)
  })

  it('replaces visible rows between pages without duplicating records', async () => {
    const { load } = threePageLoader()
    const navigator = new LibraryNavigator(load)
    await navigator.first()
    const firstIds = navigator.snapshot.page.items.map(entry => entry.requestId)
    await navigator.next()
    const secondIds = navigator.snapshot.page.items.map(entry => entry.requestId)
    await navigator.next()
    const thirdIds = navigator.snapshot.page.items.map(entry => entry.requestId)

    const allIds = [...firstIds, ...secondIds, ...thirdIds]
    expect(new Set(allIds).size).toBe(allIds.length)
    expect(navigator.snapshot.page.items.map(entry => entry.requestId)).toEqual(thirdIds)
  })

  it('ignores a second page load while the first one is still pending', async () => {
    let resolveSecond: ((value: LibraryPage) => void) | undefined
    const pendingSecond = new Promise<LibraryPage>(resolve => {
      resolveSecond = resolve
    })
    const first = page([1, 2], cursor(2))
    const second = page([3, 4])
    const load = vi.fn((query: LibraryPageQueryInput) => (
      query.cursor ? pendingSecond : Promise.resolve(first)
    ))
    const navigator = new LibraryNavigator(load)
    await navigator.first()

    const firstClick = navigator.next()
    const doubleClick = navigator.next()

    expect(load).toHaveBeenCalledTimes(2)
    await expect(doubleClick).resolves.toBeUndefined()
    resolveSecond?.(second)
    await firstClick
    expect(navigator.snapshot.page).toEqual(second)
  })

  it('refreshes the current page with the same cursor and page number', async () => {
    const { load } = threePageLoader()
    const navigator = new LibraryNavigator(load)
    await navigator.first()
    await navigator.next()
    const callsBeforeRefresh = load.mock.calls.length

    await navigator.refresh()

    expect(load).toHaveBeenCalledTimes(callsBeforeRefresh + 1)
    expect(load).toHaveBeenLastCalledWith({ cursor: cursor(2) })
    expect(libraryPageNumber(navigator.snapshot)).toBe(2)
  })

  it('reports an expired cursor and recovers by returning to page 1', async () => {
    const first = page([1, 2], cursor(2))
    const load = vi.fn(async (query: LibraryPageQueryInput) => {
      if (query.cursor) throw new Error('Cursor inválido')
      return first
    })
    const navigator = new LibraryNavigator(load)
    await navigator.first()

    await navigator.next()
    expect(navigator.snapshot.error).toMatchObject({ kind: 'cursor' })

    await navigator.first()
    expect(navigator.snapshot.error).toBeUndefined()
    expect(libraryPageNumber(navigator.snapshot)).toBe(1)
    expect(navigator.snapshot.page).toEqual(first)
  })

  it('allows an item from page 2 to be selected for detail', async () => {
    const { load } = threePageLoader()
    const navigator = new LibraryNavigator(load)
    await navigator.first()
    await navigator.next()

    const selected = navigator.snapshot.page.items[0]

    expect(selected.destinationQuery).toBe('Destino 3')
    expect(libraryPageNumber(navigator.snapshot)).toBe(2)
  })

  it('keeps page and cursor history while detail is loaded and closed', async () => {
    const { load } = threePageLoader()
    const navigator = new LibraryNavigator(load)
    await navigator.first()
    await navigator.next()
    const navigationBeforeDetail = navigator.snapshot

    await Promise.resolve({ requestId: navigator.snapshot.page.items[0].requestId })

    expect(navigator.snapshot).toBe(navigationBeforeDetail)
    expect(libraryPageNumber(navigator.snapshot)).toBe(2)
    expect(navigator.snapshot.cursorStack).toEqual([cursor(2)])
  })

  it('resets navigation to page 1 after a data mutation', async () => {
    const { first, load } = threePageLoader()
    const navigator = new LibraryNavigator(load)
    await navigator.first()
    await navigator.next()

    await navigator.resetAfterMutation()

    expect(load).toHaveBeenLastCalledWith({})
    expect(navigator.snapshot.page).toEqual(first)
    expect(navigator.snapshot.cursorStack).toEqual([])
  })

  it('performs only read calls and does not mutate domain data while navigating', async () => {
    const { load } = threePageLoader()
    const domainMutation = vi.fn()
    const navigator = new LibraryNavigator(load)

    await navigator.first()
    await navigator.next()
    await navigator.refresh()
    await navigator.previous()

    expect(load).toHaveBeenCalledTimes(4)
    expect(domainMutation).not.toHaveBeenCalled()
  })

  it('supports an empty Library without offering navigation', async () => {
    const navigator = new LibraryNavigator(async () => page([]))

    await navigator.first()

    expect(navigator.snapshot.page.items).toEqual([])
    expect(navigator.snapshot.initialized).toBe(true)
    expect(libraryNavigationAvailability(navigator.snapshot)).toMatchObject({
      canPrevious: false,
      canNext: false,
    })
  })

  it('labels metrics explicitly as a summary of the current page', () => {
    expect(LIBRARY_PAGE_SUMMARY_LABEL).toBe('Resumen de esta página')
  })

  it('treats an empty result reached through a cursor as an expired cursor', async () => {
    const first = page([1, 2], cursor(2))
    const navigator = new LibraryNavigator(async query => (
      query.cursor ? page([]) : first
    ))
    await navigator.first()

    await navigator.next()

    expect(navigator.snapshot.error).toMatchObject({
      kind: 'cursor',
      detail: 'El cursor ya no devuelve una página de resultados',
    })
    expect(navigator.snapshot.page).toEqual(first)
  })
})
