import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  RealResearchMissionSchema,
  RealResearchSourceSchema,
  type RealResearchMission,
  type RealResearchSource,
} from '@shared/real-pipeline-contracts'
import type {
  ProviderFailureUsage,
  ProviderResultDiscardReason,
  ProviderResultSanitization,
  ResearchTool,
  ResearchToolResult,
} from './ports'
import {
  assertLiveProviderNetworkPermit,
  type LiveProviderNetworkPermit,
} from './live-provider-access'

const TavilyUsageSchema = z.object({
  credits: z.number().nonnegative(),
})

const TavilySearchResponseSchema = z.object({
  request_id: z.string().trim().min(1),
  results: z.array(z.object({
    url: z.unknown(),
    title: z.string().trim().min(1).max(500),
    content: z.string().default(''),
    score: z.number().min(0).max(1),
  })),
  usage: TavilyUsageSchema,
})

const TavilyExtractResponseSchema = z.object({
  request_id: z.string().trim().min(1),
  results: z.array(z.object({
    url: z.unknown(),
    raw_content: z.string(),
  })),
  failed_results: z.array(z.object({
    url: z.unknown(),
    error: z.string().trim().min(1).max(500),
  })),
  usage: TavilyUsageSchema,
})

export interface TavilyHttpResponse {
  status: number
  body: unknown
}

export interface TavilyTransport {
  post(pathname: '/search' | '/extract', body: Record<string, unknown>, signal: AbortSignal): Promise<TavilyHttpResponse>
}

export interface TavilyFetchTransportOptions {
  credential: string
  fetchImplementation?: typeof fetch
  baseUrl?: string
  networkPermit?: LiveProviderNetworkPermit
}

export class TavilyFetchTransport implements TavilyTransport {
  private readonly fetchImplementation: typeof fetch
  private readonly baseUrl: string

  constructor(private readonly options: TavilyFetchTransportOptions) {
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch
    this.baseUrl = options.baseUrl ?? 'https://api.tavily.com'
  }

  async post(
    pathname: '/search' | '/extract',
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<TavilyHttpResponse> {
    try {
      assertLiveProviderNetworkPermit(this.options.networkPermit)
    } catch {
      throw new TavilyResearchError('NETWORK_DISABLED', 'Tavily real permanece desactivado')
    }
    const response = await this.fetchImplementation(`${this.baseUrl}${pathname}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.credential}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    })
    let responseBody: unknown
    try {
      responseBody = await response.json()
    } catch {
      responseBody = undefined
    }
    return { status: response.status, body: responseBody }
  }
}

export interface TavilyResearchLimits {
  timeoutMs: number
  maxQueries: number
  maxResultsPerQuery: number
  maxUrls: number
  maxCharactersPerSource: number
}

const defaultLimits: TavilyResearchLimits = {
  timeoutMs: 10_000,
  maxQueries: 5,
  maxResultsPerQuery: 10,
  maxUrls: 20,
  maxCharactersPerSource: 100_000,
}

const MIN_VALID_SOURCES = 1

export type TavilyResearchErrorCode =
  | 'NETWORK_DISABLED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'NO_VALID_HTTPS_SOURCES'
  | 'INSUFFICIENT_VALID_SOURCES'
  | 'LIMIT_EXCEEDED'

export class TavilyResearchError extends Error {
  constructor(
    readonly code: TavilyResearchErrorCode,
    message: string,
    readonly providerUsage?: ProviderFailureUsage,
    readonly urlSanitization?: ProviderResultSanitization,
  ) {
    super(message)
    this.name = 'TavilyResearchError'
  }
}

export interface TavilyResearchDependencies {
  now?: () => Date
  simulation?: boolean
}

export class TavilyResearchTool implements ResearchTool {
  readonly id = 'tavily'
  readonly model = 'search-and-extract'
  readonly simulation: boolean
  private readonly limits: TavilyResearchLimits
  private readonly now: () => Date

  constructor(
    private readonly transport: TavilyTransport,
    limits: Partial<TavilyResearchLimits> = {},
    dependencies: TavilyResearchDependencies = {},
  ) {
    this.limits = { ...defaultLimits, ...limits }
    this.now = dependencies.now ?? (() => new Date())
    this.simulation = dependencies.simulation ?? true
  }

  async research(candidate: RealResearchMission, signal: AbortSignal): Promise<ResearchToolResult> {
    const mission = RealResearchMissionSchema.parse(candidate)
    this.assertNotCancelled(signal)
    const queries = this.queries(mission)
    const maxQueries = mission.round === 1
      ? Math.min(this.limits.maxQueries, 4)
      : Math.min(this.limits.maxQueries, mission.limits.maxFocusedQueriesPerRound)
    if (queries.length > maxQueries) {
      throw new TavilyResearchError('LIMIT_EXCEEDED', 'La misión supera el límite de consultas')
    }

    const candidates = new Map<string, SearchCandidate>()
    const providerRequestIds: string[] = []
    const sanitization = emptySanitization()
    let credits = 0
    for (const query of queries) {
      const response = await this.request('/search', {
        query,
        max_results: Math.min(this.limits.maxResultsPerQuery, mission.limits.maxSources),
        include_raw_content: false,
        include_usage: true,
        search_depth: 'basic',
      }, signal, TavilySearchResponseSchema)
      providerRequestIds.push(response.request_id)
      credits += response.usage.credits
      for (const result of response.results) {
        const inspected = inspectTavilyUrl(result.url)
        sanitization.totalReceived += 1
        if (!inspected.accepted) {
          discard(sanitization, inspected.reason)
          continue
        }
        const normalizedUrl = inspected.normalizedUrl
        const previous = candidates.get(normalizedUrl)
        if (previous) {
          discard(sanitization, 'duplicate')
          if (result.score > previous.score) {
            candidates.set(normalizedUrl, {
              url: normalizedUrl,
              normalizedUrl,
              title: result.title,
              score: result.score,
            })
          }
        } else {
          sanitization.accepted += 1
          candidates.set(normalizedUrl, {
            url: normalizedUrl,
            normalizedUrl,
            title: result.title,
            score: result.score,
          })
        }
      }
    }

    const ranked = [...candidates.values()]
      .sort((left, right) => right.score - left.score || left.normalizedUrl.localeCompare(right.normalizedUrl))
    const selected = ranked.slice(0, Math.min(this.limits.maxUrls, mission.limits.maxSources))
    const excludedByLimit = ranked.length - selected.length
    if (excludedByLimit > 0) {
      sanitization.accepted -= excludedByLimit
      discard(sanitization, 'limit', excludedByLimit)
    }
    if (selected.length === 0) {
      throw new TavilyResearchError(
        'NO_VALID_HTTPS_SOURCES',
        'Tavily no devolvió ninguna URL HTTPS absoluta y válida',
        failureUsage(providerRequestIds, credits),
        sanitization,
      )
    }

    const extraction = await this.request('/extract', {
      urls: selected.map(candidate => candidate.url),
      extract_depth: mission.depth === 'deep' ? 'advanced' : 'basic',
      include_usage: true,
    }, signal, TavilyExtractResponseSchema)
    providerRequestIds.push(extraction.request_id)
    credits += extraction.usage.credits

    const selectedByUrl = new Map(selected.map(item => [item.normalizedUrl, item]))
    const sources: RealResearchSource[] = []
    const seenContent = new Set<string>()
    for (const extracted of extraction.results) {
      const inspected = inspectTavilyUrl(extracted.url)
      sanitization.totalReceived += 1
      if (!inspected.accepted) {
        discard(sanitization, inspected.reason)
        continue
      }
      const normalizedUrl = inspected.normalizedUrl
      const search = selectedByUrl.get(normalizedUrl)
      if (!search) {
        discard(sanitization, 'unmatched')
        continue
      }
      if (!extracted.raw_content.trim()) {
        discard(sanitization, 'empty_content')
        continue
      }
      const content = extracted.raw_content.slice(
        0,
        Math.min(this.limits.maxCharactersPerSource, mission.limits.maxCharactersPerSource),
      )
      const contentHash = sha256(content)
      const technicalKey = `${normalizedUrl}:${contentHash}`
      if (seenContent.has(technicalKey)) {
        discard(sanitization, 'duplicate')
        continue
      }
      seenContent.add(technicalKey)
      sanitization.accepted += 1
      sources.push(RealResearchSourceSchema.parse({
        id: `tavily-${sha256(normalizedUrl).slice(0, 32)}`,
        round: mission.round,
        url: search.url,
        normalizedUrl,
        title: search.title,
        capturedAt: this.now().toISOString(),
        contentHash,
        score: search.score,
        content,
      }))
    }

    const failures: ResearchToolResult['failures'] = []
    for (const item of extraction.failed_results) {
      const inspected = inspectTavilyUrl(item.url)
      sanitization.totalReceived += 1
      if (!inspected.accepted) {
        discard(sanitization, inspected.reason)
        continue
      }
      if (!selectedByUrl.has(inspected.normalizedUrl)) {
        discard(sanitization, 'unmatched')
        continue
      }
      discard(sanitization, 'extraction_failed')
      failures.push({
        url: inspected.normalizedUrl,
        code: 'EXTRACTION_FAILED',
        message: sanitizeFailure(item.error),
      })
    }

    if (sources.length < MIN_VALID_SOURCES) {
      throw new TavilyResearchError(
        'INSUFFICIENT_VALID_SOURCES',
        'Tavily no dejó ninguna fuente HTTPS válida con contenido utilizable; se exige al menos una',
        failureUsage(providerRequestIds, credits),
        sanitization,
      )
    }

    return {
      round: mission.round,
      sources,
      providerRequestIds,
      failures,
      usageUnits: credits,
      credits,
      urlSanitization: sanitization,
    }
  }

  private queries(mission: RealResearchMission): string[] {
    if (mission.round === 2) return mission.focusedQueries
    return mission.objectives.map(objective => `${mission.destination.name} ${objective}`)
  }

  private async request<T>(
    pathname: '/search' | '/extract',
    body: Record<string, unknown>,
    signal: AbortSignal,
    schema: z.ZodType<T>,
  ): Promise<T> {
    let response: TavilyHttpResponse
    try {
      response = await withTavilyTimeout(
        operationSignal => this.transport.post(pathname, body, operationSignal),
        this.limits.timeoutMs,
        signal,
      )
    } catch (error) {
      if (error instanceof TavilyResearchError) throw error
      throw new TavilyResearchError('PROVIDER_ERROR', 'Tavily devolvió un fallo no clasificable')
    }
    if (response.status === 429) {
      throw new TavilyResearchError('RATE_LIMITED', 'Tavily rechazó la operación por límite')
    }
    if (response.status >= 500) {
      throw new TavilyResearchError('PROVIDER_ERROR', `Tavily no está disponible (${response.status})`)
    }
    if (response.status < 200 || response.status >= 300) {
      throw new TavilyResearchError('PROVIDER_ERROR', `Tavily rechazó la operación (${response.status})`)
    }
    const parsed = schema.safeParse(response.body)
    if (!parsed.success) {
      throw new TavilyResearchError('INVALID_RESPONSE', 'Tavily devolvió un payload no válido')
    }
    return parsed.data
  }

  private assertNotCancelled(signal: AbortSignal): void {
    if (signal.aborted) throw new TavilyResearchError('CANCELLED', 'La investigación fue cancelada')
  }
}

interface SearchCandidate {
  url: string
  normalizedUrl: string
  title: string
  score: number
}

export function normalizeTavilyUrl(value: string): string {
  const inspected = inspectTavilyUrl(value)
  if (!inspected.accepted) {
    throw new TavilyResearchError(
      'INVALID_RESPONSE',
      `Tavily devolvió una URL descartada (${inspected.reason})`,
    )
  }
  return inspected.normalizedUrl
}

type UrlOnlyDiscardReason = Exclude<
  ProviderResultDiscardReason,
  'duplicate' | 'limit' | 'unmatched' | 'empty_content' | 'extraction_failed'
>

type InspectedTavilyUrl =
  | { accepted: true; normalizedUrl: string }
  | { accepted: false; reason: UrlOnlyDiscardReason }

function inspectTavilyUrl(value: unknown): InspectedTavilyUrl {
  if (typeof value !== 'string') return { accepted: false, reason: 'malformed' }
  if (value.trim().length === 0) return { accepted: false, reason: 'empty' }
  if (value !== value.trim() || /\s/.test(value)) return { accepted: false, reason: 'malformed' }
  if (/^(?:[./?#]|\.\.\/)/.test(value)) return { accepted: false, reason: 'relative' }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { accepted: false, reason: 'malformed' }
  }
  if (url.protocol === 'http:') return { accepted: false, reason: 'http' }
  if (url.protocol !== 'https:') return { accepted: false, reason: 'unsupported_scheme' }
  if (!url.hostname || url.origin === 'null') return { accepted: false, reason: 'malformed' }
  if (url.username || url.password) return { accepted: false, reason: 'credentials' }
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key)
  }
  url.searchParams.sort()
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
  return { accepted: true, normalizedUrl: url.toString() }
}

function emptySanitization(): ProviderResultSanitization {
  return { totalReceived: 0, accepted: 0, discarded: 0, discardReasons: {} }
}

function discard(
  summary: ProviderResultSanitization,
  reason: ProviderResultDiscardReason,
  count = 1,
): void {
  summary.discarded += count
  summary.discardReasons[reason] = (summary.discardReasons[reason] ?? 0) + count
}

function failureUsage(providerRequestIds: string[], credits: number): ProviderFailureUsage {
  return {
    providerRequestIds: [...providerRequestIds],
    credits,
    calculatedCost: credits * 0.008,
    toolCalls: providerRequestIds.length,
  }
}

async function withTavilyTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal: AbortSignal,
): Promise<T> {
  if (parentSignal.aborted) throw new TavilyResearchError('CANCELLED', 'La investigación fue cancelada')
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let cancellationListener: (() => void) | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort()
        reject(new TavilyResearchError('TIMEOUT', `Tavily superó ${timeoutMs} ms`))
      }, timeoutMs)
    })
    const cancellation = new Promise<never>((_, reject) => {
      cancellationListener = () => {
        controller.abort()
        reject(new TavilyResearchError('CANCELLED', 'La investigación fue cancelada'))
      }
      parentSignal.addEventListener('abort', cancellationListener, { once: true })
    })
    return await Promise.race([operation(controller.signal), timeout, cancellation])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    if (cancellationListener) parentSignal.removeEventListener('abort', cancellationListener)
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function sanitizeFailure(value: string): string {
  return /(?:sk-|tvly-|api[_ -]?key|authorization|bearer\s)/i.test(value)
    ? 'EXTRACTION_FAILED'
    : value.slice(0, 500)
}
