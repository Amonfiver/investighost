/**
 * Investighost - Servicio de Busqueda Web
 *
 * Proposito: preparar la capa de recoleccion de informacion real antes del
 * analisis/redaccion con IA. Este modulo NO llama todavia a internet.
 */

import type {
  ResearchInput,
  SearchProvider,
  WebResearchBundle,
  WebSearchQuery,
  WebSearchResult,
  WebSourceType,
} from '@shared/types'
import { generateId } from '@utils/helpers'

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

export interface SearchProviderFactoryOptions {
  provider?: SearchProvider
}

export function createSearchProvider(
  options: SearchProviderFactoryOptions = {}
): BaseSearchProvider {
  const provider = options.provider ?? 'mock'

  switch (provider) {
    case 'mock':
      console.log('[Search] provider selected:', 'MOCK_SEARCH_PROVIDER')
      return new LocalMockSearchProvider()
    case 'serpapi':
    case 'searchapi':
    case 'brave':
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

export async function collectWebResearchBundle(
  input: ResearchInput,
  options: SearchProviderFactoryOptions & SearchProviderOptions = {}
): Promise<WebResearchBundle> {
  const provider = createSearchProvider(options)
  const queries = generateDestinationSearchQueries(input)
  const resultsByQuery = await Promise.all(
    queries.map(query => provider.search(query, options))
  )
  const results = resultsByQuery.flat()

  console.log('[Search] results collected:', results.length)

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
