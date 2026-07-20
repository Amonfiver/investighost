import type {
  DiscoveryCandidate,
  EditorialSourceProvider,
  SourceDiscoveryRequest,
  SourceDocument,
  SourceEvaluation,
  SourceEvaluationRequest,
  SourceReadingRequest,
} from './source-providers'
import { SourceProviderError, normalizeSourceUrl } from './source-providers'

export interface MockSourceSeed {
  queries: string[]
  url: string
  title: string
  publisher?: string
  snippet?: string
  content?: string
  httpStatus?: number
  publishedAt?: Date
  author?: string
  contentType?: string
  evaluation?: SourceEvaluation
  transientReadFailures?: number
}

export interface MockSourceProviderOptions {
  discoveryFailures?: number
  evaluationFailures?: number
  latencyMs?: number
}

export class MockEditorialSourceProvider implements EditorialSourceProvider {
  readonly id = 'mock-source-provider'
  readonly model = 'deterministic-source-fixture-v1'
  readonly simulation = true
  private discoveryFailures: number
  private evaluationFailures: number
  private readonly readFailures = new Map<string, number>()

  constructor(
    private readonly seeds: MockSourceSeed[],
    private readonly options: MockSourceProviderOptions = {},
  ) {
    this.discoveryFailures = options.discoveryFailures ?? 0
    this.evaluationFailures = options.evaluationFailures ?? 0
    for (const seed of seeds) this.readFailures.set(normalizeSourceUrl(seed.url), seed.transientReadFailures ?? 0)
  }

  async discover(request: SourceDiscoveryRequest): Promise<DiscoveryCandidate[]> {
    await delay(this.options.latencyMs ?? 0, request.signal)
    if (this.discoveryFailures > 0) {
      this.discoveryFailures -= 1
      throw new SourceProviderError('TRANSIENT', 'Fallo transitorio simulado en descubrimiento', true)
    }
    return this.seeds
      .filter(seed => seed.queries.includes(request.query))
      .slice(0, request.maxResults)
      .map(seed => ({
        url: seed.url,
        title: seed.title,
        publisher: seed.publisher,
        snippet: seed.snippet,
        query: request.query,
        discoveredAt: new Date('2026-07-21T10:00:00.000Z'),
      }))
  }

  async read(request: SourceReadingRequest): Promise<SourceDocument> {
    await delay(this.options.latencyMs ?? 0, request.signal)
    const normalizedUrl = normalizeSourceUrl(request.candidate.url)
    const remainingFailures = this.readFailures.get(normalizedUrl) ?? 0
    if (remainingFailures > 0) {
      this.readFailures.set(normalizedUrl, remainingFailures - 1)
      throw new SourceProviderError('TRANSIENT', 'Fallo transitorio simulado en lectura', true)
    }
    const seed = this.seeds.find(item => normalizeSourceUrl(item.url) === normalizedUrl)
    if (!seed) return { url: request.candidate.url, status: 'unavailable', httpStatus: 404 }
    if (!seed.content) return { url: seed.url, status: 'broken', httpStatus: seed.httpStatus ?? 404 }
    return {
      url: seed.url,
      status: 'read',
      content: seed.content,
      httpStatus: seed.httpStatus ?? 200,
      publishedAt: seed.publishedAt,
      author: seed.author,
      publisher: seed.publisher,
      contentType: seed.contentType ?? 'text/html',
    }
  }

  async evaluate(request: SourceEvaluationRequest): Promise<SourceEvaluation> {
    await delay(this.options.latencyMs ?? 0, request.signal)
    if (this.evaluationFailures > 0) {
      this.evaluationFailures -= 1
      throw new SourceProviderError('TRANSIENT', 'Fallo transitorio simulado en evaluación', true)
    }
    const seed = this.seeds.find(item => normalizeSourceUrl(item.url) === normalizeSourceUrl(request.candidate.url))
    return seed?.evaluation ?? {
      accepted: true,
      sourceType: 'other',
      territorialScope: 'destination',
      freshness: 'unknown',
      reliability: 0.6,
      reason: 'Evaluación determinista por defecto del fixture',
    }
  }
}

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new SourceProviderError('CANCELLED', 'Operación mock cancelada', false)
  if (milliseconds <= 0) return
  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(resolve, milliseconds)
    signal.addEventListener('abort', () => {
      clearTimeout(timeoutId)
      reject(new SourceProviderError('CANCELLED', 'Operación mock cancelada', false))
    }, { once: true })
  })
}
