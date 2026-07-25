import type {
  LibraryCursor,
  LibraryPage,
  LibraryPageQueryInput,
} from '@shared/library-contracts'

export const LIBRARY_PAGE_SUMMARY_LABEL = 'Resumen de esta página'

export type LibraryNavigationErrorKind = 'read' | 'cursor'

export interface LibraryNavigationError {
  kind: LibraryNavigationErrorKind
  message: string
  detail: string
}

export interface LibraryNavigationState {
  page: LibraryPage
  cursorStack: readonly LibraryCursor[]
  loading: boolean
  initialized: boolean
  error?: LibraryNavigationError
}

export interface LibraryNavigationAvailability {
  canFirst: boolean
  canPrevious: boolean
  canNext: boolean
  canRefresh: boolean
}

export type LibraryPageLoader = (query: LibraryPageQueryInput) => Promise<LibraryPage>
type LibraryNavigationListener = (state: LibraryNavigationState) => void

const emptyPage = (): LibraryPage => ({
  items: [],
  hasMore: false,
})

export function initialLibraryNavigationState(): LibraryNavigationState {
  return {
    page: emptyPage(),
    cursorStack: [],
    loading: false,
    initialized: false,
  }
}

export function libraryPageNumber(state: LibraryNavigationState): number {
  return state.cursorStack.length + 1
}

export function libraryNavigationAvailability(
  state: LibraryNavigationState,
): LibraryNavigationAvailability {
  return {
    canFirst: !state.loading && state.cursorStack.length > 0,
    canPrevious: !state.loading && state.cursorStack.length > 0,
    canNext: !state.loading && state.page.hasMore && Boolean(state.page.nextCursor),
    canRefresh: !state.loading && state.initialized,
  }
}

export class LibraryNavigator {
  private state: LibraryNavigationState = initialLibraryNavigationState()
  private readonly listeners = new Set<LibraryNavigationListener>()
  private inFlight = false

  constructor(private readonly loadPage: LibraryPageLoader) {}

  get snapshot(): LibraryNavigationState {
    return this.state
  }

  subscribe(listener: LibraryNavigationListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  first(): Promise<LibraryPage | undefined> {
    return this.loadAt([], false)
  }

  refresh(): Promise<LibraryPage | undefined> {
    return this.loadAt(this.state.cursorStack, false)
  }

  next(): Promise<LibraryPage | undefined> {
    const cursor = this.state.page.nextCursor
    if (!this.state.page.hasMore || !cursor) return Promise.resolve(undefined)
    return this.loadAt([...this.state.cursorStack, cursor], false)
  }

  previous(): Promise<LibraryPage | undefined> {
    if (this.state.cursorStack.length === 0) return Promise.resolve(undefined)
    return this.loadAt(this.state.cursorStack.slice(0, -1), false)
  }

  resetAfterMutation(): Promise<LibraryPage | undefined> {
    return this.loadAt([], true)
  }

  private async loadAt(
    targetCursorStack: readonly LibraryCursor[],
    discardCurrentPage: boolean,
  ): Promise<LibraryPage | undefined> {
    if (this.inFlight) return undefined
    this.inFlight = true

    const stableState = discardCurrentPage
      ? {
          ...this.state,
          page: emptyPage(),
          cursorStack: [],
          initialized: false,
          error: undefined,
        }
      : this.state

    this.update({
      ...stableState,
      loading: true,
      error: undefined,
    })

    const cursor = targetCursorStack.at(-1)
    const query: LibraryPageQueryInput = cursor ? { cursor } : {}

    try {
      const page = await this.loadPage(query)
      if (cursor && page.items.length === 0) {
        throw new Error('El cursor ya no devuelve una página de resultados')
      }

      this.inFlight = false
      this.update({
        page,
        cursorStack: [...targetCursorStack],
        loading: false,
        initialized: true,
      })
      return page
    } catch (reason) {
      const kind: LibraryNavigationErrorKind = cursor ? 'cursor' : 'read'
      this.inFlight = false
      this.update({
        ...stableState,
        loading: false,
        initialized: true,
        error: {
          kind,
          message: kind === 'cursor'
            ? 'No se pudo cargar la página solicitada. El cursor puede haber vencido por cambios en la Biblioteca.'
            : 'No se pudo leer la Biblioteca. Comprueba Supabase local e inténtalo de nuevo.',
          detail: reason instanceof Error ? reason.message : String(reason),
        },
      })
      return undefined
    }
  }

  private update(state: LibraryNavigationState): void {
    this.state = state
    for (const listener of this.listeners) listener(state)
  }
}
