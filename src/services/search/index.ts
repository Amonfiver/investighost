/**
 * Investighost - Servicio de Busqueda Web
 *
 * Proposito: preparar la capa de recoleccion de informacion real antes del
 * analisis/redaccion con IA.
 */

import type {
  ResearchInput,
  SearchProvider,
  WebResearchBundle,
  WebSearchQuery,
  WebSearchResult,
  WebSourceType,
} from '@shared/types'
import { assertLegacyProviderRuntimeDisabled } from '@services/legacy-provider-guard'
import { generateId } from '@utils/helpers'

const BRAVE_WEB_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'
const BRAVE_SEARCH_TIMEOUT_MS = 20_000

export interface SearchProviderOptions {
  maxResultsPerQuery?: number
}

export abstract class BaseSearchProvider {
  abstract readonly name: SearchProvider
  abstract readonly label: string

  abstract search(
    query: WebSearchQuery,
    options?: SearchProviderOptions
  ): Promise<WebSearchResult[]>
}

export class LocalMockSearchProvider extends BaseSearchProvider {
  readonly name = 'mock'
  readonly label = 'MOCK_SEARCH_PROVIDER'

  async search(
    query: WebSearchQuery,
    options: SearchProviderOptions = {}
  ): Promise<WebSearchResult[]> {
    const maxResults = options.maxResultsPerQuery ?? 2
    const now = new Date()
    const sourceTypes: WebSourceType[] = ['official', 'blog', 'review']

    return Array.from({ length: maxResults }, (_, index) => ({
      id: generateId(),
      query: query.query,
      title: `[MOCK_SEARCH_PROVIDER] Resultado ${index + 1} para ${query.query}`,
      url: `mock-search:///${encodeURIComponent(query.query)}/${index + 1}`,
      snippet: 'Resultado simulado. Sustituir por un proveedor real de busqueda antes de usar en produccion editorial.',
      sourceType: sourceTypes[index % sourceTypes.length],
      reliabilityScore: index === 0 ? 0.4 : 0.25,
      capturedAt: now,
      provider: this.name,
    }))
  }
}

interface BraveSearchProviderConfig {
  apiKey: string
}

interface BraveWebResult {
  title?: string
  url?: string
  description?: string
  extra_snippets?: string[]
}

interface BraveSearchResponse {
  web?: {
    results?: BraveWebResult[]
  }
}

export class BraveSearchProvider extends BaseSearchProvider {
  readonly name = 'brave'
  readonly label = 'Brave Search API'

  constructor(private config: BraveSearchProviderConfig) {
    super()
  }

  async search(
    query: WebSearchQuery,
    options: SearchProviderOptions = {}
  ): Promise<WebSearchResult[]> {
    assertLegacyProviderRuntimeDisabled('search.BraveSearchProvider')
    const maxResults = options.maxResultsPerQuery ?? 5
    const url = new URL(BRAVE_WEB_SEARCH_ENDPOINT)
    url.searchParams.set('q', query.query)
    url.searchParams.set('count', String(maxResults))
    url.searchParams.set('search_lang', 'es')

    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.config.apiKey,
        },
      }, BRAVE_SEARCH_TIMEOUT_MS)

      if (!response.ok) {
        throw new Error(`Brave Search API returned ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as BraveSearchResponse
      const results = data.web?.results ?? []
      const capturedAt = new Date()

      return results
        .filter(result => result.title && result.url)
        .map(result => {
          const snippet = buildSnippet(result)
          const urlValue = result.url ?? ''
          const sourceType = inferSourceType(urlValue, result.title ?? '', snippet)

          return {
            id: generateId(),
            query: query.query,
            title: result.title ?? urlValue,
            url: urlValue,
            snippet,
            sourceType,
            reliabilityScore: estimateReliability(urlValue, sourceType),
            capturedAt,
            provider: this.name,
          }
        })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Brave Search failed for "${query.query}": ${message}`)
    }
  }
}

export interface SearchProviderFactoryOptions {
  provider?: SearchProvider
  braveApiKey?: string
}

/** @deprecated Ruta histórica; solo conserva el mock y bloquea proveedores externos. */
export function createSearchProvider(
  options: SearchProviderFactoryOptions = {}
): BaseSearchProvider {
  const provider = options.provider ?? 'mock'
  const braveApiKey = options.braveApiKey

  switch (provider) {
    case 'mock':
      console.log('[Search] provider selected:', 'mock')
      return new LocalMockSearchProvider()
    case 'serpapi':
    case 'searchapi':
    case 'brave':
      assertLegacyProviderRuntimeDisabled('search.createSearchProvider')
      if (!braveApiKey) {
        console.warn('[Search] provider selected: mock (Brave API key missing)')
        return new LocalMockSearchProvider()
      }

      console.log('[Search] provider selected:', 'brave')
      return new BraveSearchProvider({ apiKey: braveApiKey })
    case 'tavily':
      throw new Error(`Search provider ${provider} not implemented yet`)
    default:
      throw new Error(`Unknown search provider: ${provider satisfies never}`)
  }
}

export function generateDestinationSearchQueries(input: ResearchInput): WebSearchQuery[] {
  const destination = input.region ? `${input.region}, ${input.country}` : input.country
  const focus = input.focus?.trim()
  const userNotes = input.userNotes?.trim()
  const now = new Date()

  const baseQueries = [
    `${destination} que ver turismo`,
    `${destination} historia cultura`,
    `${destination} opiniones viajeros merece la pena`,
    `${destination} restaurantes gastronomia tipica`,
    `${destination} consejos aparcamiento acceso`,
    `${destination} problemas turistas resenas`,
  ]

  const contextualQueries = [
    focus ? `${destination} ${focus} recomendaciones viajeros` : undefined,
    userNotes ? `${destination} ${userNotes}` : undefined,
  ].filter((query): query is string => Boolean(query))

  const queries = [...baseQueries, ...contextualQueries].map(query => ({
    id: generateId(),
    destination: {
      country: input.country,
      region: input.region,
    },
    query,
    focus: input.focus,
    createdAt: now,
  }))

  console.log('[Search] generated queries:', queries.map(query => query.query))

  return queries
}

/** @deprecated Sustituido por ResearchTool; permanece bloqueado fail-closed. */
export async function collectWebResearchBundle(
  input: ResearchInput,
  options: SearchProviderFactoryOptions & SearchProviderOptions = {}
): Promise<WebResearchBundle> {
  assertLegacyProviderRuntimeDisabled('search.collectWebResearchBundle')
  const provider = createSearchProvider(options)
  const queries = generateDestinationSearchQueries(input)
  const resultsByQuery = await Promise.all(
    queries.map(query => provider.search(query, options))
  )
  const results = resultsByQuery.flat()

  console.log('[Search] collected results:', results.length)

  return {
    id: generateId(),
    destination: {
      country: input.country,
      region: input.region,
    },
    queries,
    results,
    provider: provider.name,
    createdAt: new Date(),
    notes: provider.name === 'mock'
      ? ['MOCK_SEARCH_PROVIDER: no se ha llamado a internet todavia.']
      : undefined,
  }
}

async function fetchWithTimeout(
  url: URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Brave Search request timeout after ${timeoutMs} ms`)
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

function buildSnippet(result: BraveWebResult): string {
  return [
    result.description,
    ...(result.extra_snippets ?? []),
  ]
    .filter((snippet): snippet is string => Boolean(snippet))
    .join(' ')
    .trim()
}

function inferSourceType(url: string, title: string, snippet: string): WebSourceType {
  const text = `${url} ${title} ${snippet}`.toLowerCase()

  if (text.includes('turismo') || text.includes('tourism') || text.includes('ayuntamiento') || text.includes('.gob') || text.includes('.gov')) {
    return 'official'
  }

  if (text.includes('tripadvisor') || text.includes('google.com/travel') || text.includes('booking') || text.includes('review') || text.includes('reseña')) {
    return 'review'
  }

  if (text.includes('forum') || text.includes('foro') || text.includes('reddit')) {
    return 'forum'
  }

  if (text.includes('instagram') || text.includes('facebook') || text.includes('tiktok') || text.includes('youtube')) {
    return 'social'
  }

  if (text.includes('news') || text.includes('noticia') || text.includes('diario') || text.includes('elpais') || text.includes('bbc')) {
    return 'news'
  }

  if (text.includes('blog') || text.includes('viaj') || text.includes('travel')) {
    return 'blog'
  }

  return 'unknown'
}

function estimateReliability(url: string, sourceType: WebSourceType): number {
  if (sourceType === 'official') return 0.85
  if (sourceType === 'news') return 0.7
  if (sourceType === 'review') return 0.55
  if (sourceType === 'blog') return 0.5
  if (sourceType === 'forum') return 0.35
  if (sourceType === 'social') return 0.3
  if (url.startsWith('https://')) return 0.45
  return 0.35
}
