import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  RealResearchMissionSchema,
  RealResearchSourceSchema,
  type RealResearchMission,
  type RealResearchSource,
} from '@shared/real-pipeline-contracts'
import type {
  ProviderCallExecutionContext,
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
  readonly abortGuarantee?: 'best_effort' | 'confirmed'
  assertReady?(): void
  post(pathname: '/search' | '/extract', body: Record<string, unknown>, signal: AbortSignal): Promise<TavilyHttpResponse>
}

export interface TavilyFetchTransportOptions {
  credential: string
  fetchImplementation?: typeof fetch
  baseUrl?: string
  networkPermit?: LiveProviderNetworkPermit
}

export class TavilyFetchTransport implements TavilyTransport {
  readonly abortGuarantee = 'best_effort' as const
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
    this.assertReady()
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

  assertReady(): void {
    try {
      assertLiveProviderNetworkPermit(this.options.networkPermit)
    } catch {
      throw new TavilyResearchError('NETWORK_DISABLED', 'Tavily real permanece desactivado')
    }
  }
}

export interface TavilyResearchLimits {
  timeoutMs: number
  maxQueries: number
  maxResultsPerQuery: number
  maxUrls: number
  maxCharactersPerSource: number
}

export const REAL_TAVILY_TIMEOUT_ENV = 'INVESTIGHOST_REAL_TAVILY_TIMEOUT_MS'
export const DEFAULT_REAL_TAVILY_TIMEOUT_MS = 60_000
export const MIN_REAL_TAVILY_TIMEOUT_MS = 15_000
export const MAX_REAL_TAVILY_TIMEOUT_MS = 120_000

export interface RealTavilyTimeoutPolicy {
  timeoutMs: number
  source: 'default' | 'environment' | 'invalid_environment_fallback'
}

export function readRealTavilyTimeoutPolicy(
  environment: NodeJS.ProcessEnv = process.env,
): RealTavilyTimeoutPolicy {
  const configured = environment[REAL_TAVILY_TIMEOUT_ENV]
  if (configured === undefined || configured.trim() === '') {
    return { timeoutMs: DEFAULT_REAL_TAVILY_TIMEOUT_MS, source: 'default' }
  }
  const parsed = Number(configured)
  if (
    Number.isInteger(parsed)
    && parsed >= MIN_REAL_TAVILY_TIMEOUT_MS
    && parsed <= MAX_REAL_TAVILY_TIMEOUT_MS
  ) {
    return { timeoutMs: parsed, source: 'environment' }
  }
  return {
    timeoutMs: DEFAULT_REAL_TAVILY_TIMEOUT_MS,
    source: 'invalid_environment_fallback',
  }
}

const defaultLimits: TavilyResearchLimits = {
  timeoutMs: DEFAULT_REAL_TAVILY_TIMEOUT_MS,
  maxQueries: 5,
  maxResultsPerQuery: 10,
  maxUrls: 20,
  maxCharactersPerSource: 100_000,
}

const MIN_VALID_SOURCES = 1

export type TavilyResearchErrorCode =
  | 'NETWORK_DISABLED'
  | 'TIMEOUT'
  | 'TIMEOUT_CANCELLED'
  | 'NETWORK_AMBIGUOUS'
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
    readonly requestState?: TavilyRequestFailureState,
  ) {
    super(message)
    this.name = 'TavilyResearchError'
  }
}

export interface TavilyRequestIdentity {
  version: 'tavily-request-v1'
  correlationId: string
  requestHash: string
  pathname: '/search' | '/extract'
  query?: string
  round: 1 | 2
  requestIndex: number
  timeoutMs: number
  context: ProviderCallExecutionContext
}

export interface TavilyJournaledResponse {
  response: TavilyHttpResponse
  billable: boolean
}

export interface TavilyRequestJournal {
  load(identity: TavilyRequestIdentity): Promise<TavilyJournaledResponse | undefined>
  started(identity: TavilyRequestIdentity): Promise<void>
  completed(
    identity: TavilyRequestIdentity,
    response: TavilyHttpResponse,
    late: boolean,
  ): Promise<void>
  reused(identity: TavilyRequestIdentity, response: TavilyHttpResponse): Promise<void>
  failed(
    identity: TavilyRequestIdentity,
    state: TavilyRequestFailureState,
  ): Promise<void>
}

export interface TavilyRequestFailureState {
  providerOutcome: 'not_sent' | 'cancelled_confirmed' | 'ambiguous'
  correlationId: string
  stage: string
  query?: string
  timeoutMs: number
  retrySafe: boolean
  detail: string
}

export interface TavilyResearchDependencies {
  now?: () => Date
  simulation?: boolean
  requestJournal?: TavilyRequestJournal
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
    private readonly dependencies: TavilyResearchDependencies = {},
  ) {
    this.limits = { ...defaultLimits, ...limits }
    this.now = dependencies.now ?? (() => new Date())
    this.simulation = dependencies.simulation ?? true
  }

  async research(
    candidate: RealResearchMission,
    signal: AbortSignal,
    context?: ProviderCallExecutionContext,
  ): Promise<ResearchToolResult> {
    const mission = RealResearchMissionSchema.parse(candidate)
    this.assertNotCancelled(signal)
    if (this.dependencies.requestJournal && !context) {
      throw new TavilyResearchError(
        'NETWORK_DISABLED',
        'El journal Tavily durable requiere el contexto de la reserva',
      )
    }
    const queries = this.queries(mission)
    const maxQueries = mission.round === 1
      ? Math.min(this.limits.maxQueries, 4)
      : Math.min(this.limits.maxQueries, mission.limits.maxFocusedQueriesPerRound)
    if (queries.length > maxQueries) {
      throw new TavilyResearchError('LIMIT_EXCEEDED', 'La misión supera el límite de consultas')
    }

    const candidates = new Map<string, SearchCandidate>()
    const providerRequestIds: string[] = []
    const billableProviderRequestIds: string[] = []
    const sanitization = emptySanitization()
    let credits = 0
    let billableCredits = 0
    let requestIndex = 0
    for (const query of queries) {
      const request = await this.request('/search', {
        query,
        max_results: Math.min(this.limits.maxResultsPerQuery, mission.limits.maxSources),
        include_raw_content: false,
        include_usage: true,
        search_depth: 'basic',
      }, signal, TavilySearchResponseSchema, mission, ++requestIndex, context)
      const response = request.data
      providerRequestIds.push(response.request_id)
      credits += response.usage.credits
      if (request.billable) {
        billableProviderRequestIds.push(response.request_id)
        billableCredits += response.usage.credits
      }
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
      const usage = this.dependencies.requestJournal
        ? failureUsage(billableProviderRequestIds, billableCredits)
        : failureUsage(providerRequestIds, credits)
      throw new TavilyResearchError(
        'NO_VALID_HTTPS_SOURCES',
        'Tavily no devolvió ninguna URL HTTPS absoluta y válida',
        usage,
        sanitization,
      )
    }

    const extractionRequest = await this.request('/extract', {
      urls: selected.map(candidate => candidate.url),
      extract_depth: mission.depth === 'deep' ? 'advanced' : 'basic',
      include_usage: true,
      timeout: Math.max(1, Math.min(60, Math.floor((this.limits.timeoutMs - 5_000) / 1_000))),
    }, signal, TavilyExtractResponseSchema, mission, ++requestIndex, context)
    const extraction = extractionRequest.data
    providerRequestIds.push(extraction.request_id)
    credits += extraction.usage.credits
    if (extractionRequest.billable) {
      billableProviderRequestIds.push(extraction.request_id)
      billableCredits += extraction.usage.credits
    }

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
      const usage = this.dependencies.requestJournal
        ? failureUsage(billableProviderRequestIds, billableCredits)
        : failureUsage(providerRequestIds, credits)
      throw new TavilyResearchError(
        'INSUFFICIENT_VALID_SOURCES',
        'Tavily no dejó ninguna fuente HTTPS válida con contenido utilizable; se exige al menos una',
        usage,
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
      ...(this.dependencies.requestJournal
        ? { billableProviderRequestIds, billableCredits }
        : {}),
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
    mission: RealResearchMission,
    requestIndex: number,
    context?: ProviderCallExecutionContext,
  ): Promise<{ data: T; billable: boolean }> {
    const identity = context
      ? tavilyRequestIdentity(
          mission,
          pathname,
          body,
          requestIndex,
          this.limits.timeoutMs,
          context,
        )
      : undefined
    const journal = this.dependencies.requestJournal
    if (journal && identity) {
      const stored = await journal.load(identity)
      if (stored) {
        const data = validateTavilyResponse(stored.response, schema)
        await journal.reused(identity, stored.response)
        return { data, billable: stored.billable }
      }
    }

    try {
      this.transport.assertReady?.()
    } catch (error) {
      if (error instanceof TavilyResearchError) {
        if (journal && identity) {
          await journal.failed(identity, failureState(
            identity,
            'not_sent',
            true,
            'El permiso de red impidió enviar la petición.',
          ))
        }
        throw error
      }
      throw error
    }

    if (journal && identity) await journal.started(identity)
    const controller = new AbortController()
    const operation = Promise.resolve()
      .then(() => this.transport.post(pathname, body, controller.signal))
      .then(response => ({
        response,
        data: validateTavilyResponse(response, schema),
      }))
    try {
      const completed = await withTavilyTimeout(
        operation,
        this.limits.timeoutMs,
        signal,
        controller,
      )
      if (journal && identity) await journal.completed(identity, completed.response, false)
      return { data: completed.data, billable: true }
    } catch (error) {
      if (error instanceof TavilyResearchError) throw error
      if (error instanceof TavilyWaitError) {
        const confirmed = this.transport.abortGuarantee === 'confirmed'
        const providerOutcome = confirmed ? 'cancelled_confirmed' : 'ambiguous'
        const retrySafe = confirmed
        const state = identity
          ? failureState(
              identity,
              providerOutcome,
              retrySafe,
              error.reason === 'timeout'
                ? confirmed
                  ? 'El transporte confirmó la cancelación después del timeout.'
                  : 'El aborto fue local; Tavily puede haber procesado la petición.'
                : confirmed
                  ? 'El transporte confirmó la cancelación solicitada.'
                  : 'La cancelación local no confirma el resultado remoto.',
            )
          : undefined
        if (journal && identity && state) {
          await recordTavilyFailure(journal, identity, state)
        }
        if (!confirmed && journal && identity) {
          void operation
            .then(async completed => {
              await journal.completed(identity, completed.response, true)
            })
            .catch(() => undefined)
        } else {
          void operation.catch(() => undefined)
        }
        if (error.reason === 'timeout') {
          const message = tavilyTimeoutMessage(identity, this.limits.timeoutMs, confirmed)
          throw new TavilyResearchError(
            confirmed ? 'TIMEOUT_CANCELLED' : 'TIMEOUT',
            message,
            undefined,
            undefined,
            state,
          )
        }
        throw new TavilyResearchError(
          confirmed ? 'CANCELLED' : 'NETWORK_AMBIGUOUS',
          confirmed
            ? 'La petición Tavily fue cancelada con confirmación del transporte'
            : 'La petición Tavily fue cancelada localmente con resultado remoto ambiguo',
          undefined,
          undefined,
          state,
        )
      }
      const state = identity
        ? failureState(
            identity,
            'ambiguous',
            false,
            'El transporte falló después de iniciar el envío y no devolvió estado remoto.',
          )
        : undefined
      if (journal && identity && state) {
        await recordTavilyFailure(journal, identity, state)
      }
      throw new TavilyResearchError(
        'NETWORK_AMBIGUOUS',
        'Tavily no devolvió una respuesta y el resultado remoto es ambiguo',
        undefined,
        undefined,
        state,
      )
    }
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

class TavilyWaitError extends Error {
  constructor(readonly reason: 'timeout' | 'cancelled') {
    super(reason)
    this.name = 'TavilyWaitError'
  }
}

async function withTavilyTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  parentSignal: AbortSignal,
  controller: AbortController,
): Promise<T> {
  if (parentSignal.aborted) {
    controller.abort()
    throw new TavilyWaitError('cancelled')
  }
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let cancellationListener: (() => void) | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort()
        reject(new TavilyWaitError('timeout'))
      }, timeoutMs)
    })
    const cancellation = new Promise<never>((_, reject) => {
      cancellationListener = () => {
        controller.abort()
        reject(new TavilyWaitError('cancelled'))
      }
      parentSignal.addEventListener('abort', cancellationListener, { once: true })
    })
    return await Promise.race([operation, timeout, cancellation])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    if (cancellationListener) parentSignal.removeEventListener('abort', cancellationListener)
  }
}

async function recordTavilyFailure(
  journal: TavilyRequestJournal,
  identity: TavilyRequestIdentity,
  state: TavilyRequestFailureState,
): Promise<void> {
  try {
    await journal.failed(identity, state)
  } catch {
    // El ledger debe conservar la ambigüedad aunque falle su evento diagnóstico.
  }
}

function validateTavilyResponse<T>(
  response: TavilyHttpResponse,
  schema: z.ZodType<T>,
): T {
  if (response.status === 429) {
    throw new TavilyResearchError('RATE_LIMITED', 'Tavily rechazó la operación por límite')
  }
  if (response.status >= 500) {
    throw new TavilyResearchError(
      'PROVIDER_ERROR',
      `Tavily no está disponible (${response.status})`,
    )
  }
  if (response.status < 200 || response.status >= 300) {
    throw new TavilyResearchError(
      'PROVIDER_ERROR',
      `Tavily rechazó la operación (${response.status})`,
    )
  }
  const parsed = schema.safeParse(response.body)
  if (!parsed.success) {
    throw new TavilyResearchError('INVALID_RESPONSE', 'Tavily devolvió un payload no válido')
  }
  return parsed.data
}

function tavilyRequestIdentity(
  mission: RealResearchMission,
  pathname: '/search' | '/extract',
  body: Record<string, unknown>,
  requestIndex: number,
  timeoutMs: number,
  context: ProviderCallExecutionContext,
): TavilyRequestIdentity {
  const requestHash = sha256(JSON.stringify(canonicalJson(body)))
  const correlationId = sha256(JSON.stringify(canonicalJson({
    version: 'tavily-request-v1',
    runId: mission.runId,
    round: mission.round,
    pathname,
    requestHash,
  })))
  return {
    version: 'tavily-request-v1',
    correlationId,
    requestHash,
    pathname,
    query: pathname === '/search' && typeof body.query === 'string'
      ? body.query
      : undefined,
    round: mission.round,
    requestIndex,
    timeoutMs,
    context,
  }
}

function failureState(
  identity: TavilyRequestIdentity,
  providerOutcome: TavilyRequestFailureState['providerOutcome'],
  retrySafe: boolean,
  detail: string,
): TavilyRequestFailureState {
  return {
    providerOutcome,
    correlationId: identity.correlationId,
    stage: `round-${identity.round}:${identity.pathname.slice(1)}:${identity.requestIndex}`,
    query: identity.query,
    timeoutMs: identity.timeoutMs,
    retrySafe,
    detail,
  }
}

function tavilyTimeoutMessage(
  identity: TavilyRequestIdentity | undefined,
  timeoutMs: number,
  confirmed: boolean,
): string {
  const stage = identity
    ? `ronda ${identity.round}, ${identity.pathname.slice(1)} ${identity.requestIndex}`
    : 'petición sin etapa'
  const query = identity?.query ? `, query “${identity.query.slice(0, 300)}”` : ''
  const outcome = confirmed
    ? 'el transporte confirmó la cancelación; el reintento controlado es seguro'
    : 'la petición fue enviada y su resultado remoto es ambiguo; requiere conciliación humana antes de reintentar'
  const correlation = identity ? `; correlación ${identity.correlationId}` : ''
  return `Tavily ${stage}${query} superó ${timeoutMs} ms; ${outcome}${correlation}`
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalJson(item)]),
    )
  }
  return value
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function sanitizeFailure(value: string): string {
  return /(?:sk-|tvly-|api[_ -]?key|authorization|bearer\s)/i.test(value)
    ? 'EXTRACTION_FAILED'
    : value.slice(0, 500)
}
