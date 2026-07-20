import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  ProviderUsageSchema,
  ResearchEventSchema,
  ResearchSourceSchema,
  type GeographicEntity,
  type ProviderUsage,
  type ResearchEvent,
  type ResearchSource,
} from '@shared/editorial-contracts'

export type SourceProviderOperation = 'discovery' | 'reading' | 'evaluation'
export type SourceProviderErrorCode =
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'TRANSIENT'
  | 'PERMANENT'
  | 'BUDGET_EXCEEDED'
  | 'LIMIT_EXCEEDED'
  | 'CIRCUIT_OPEN'

export class SourceProviderError extends Error {
  constructor(
    readonly code: SourceProviderErrorCode,
    message: string,
    readonly retryable = false,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'SourceProviderError'
  }
}

const DiscoveryCandidateSchema = z.object({
  url: z.string().url().refine(value => value.startsWith('https://'), 'La fuente debe usar HTTPS'),
  title: z.string().trim().min(1).max(500),
  publisher: z.string().trim().max(200).optional(),
  snippet: z.string().trim().max(2000).optional(),
  query: z.string().trim().min(1).max(500),
  discoveredAt: z.date(),
})

const SourceDocumentSchema = z.object({
  url: z.string().url().refine(value => value.startsWith('https://'), 'La fuente debe usar HTTPS'),
  status: z.enum(['read', 'broken', 'unavailable']),
  content: z.string().max(200_000).optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  publishedAt: z.date().optional(),
  author: z.string().trim().max(200).optional(),
  publisher: z.string().trim().max(200).optional(),
  contentType: z.string().trim().max(120).optional(),
})

const SourceEvaluationSchema = z.object({
  accepted: z.boolean(),
  sourceType: z.enum(['official', 'tourism', 'heritage', 'news', 'academic', 'blog', 'reviews', 'other']),
  territorialScope: z.enum(['destination', 'local', 'regional', 'national', 'global']),
  freshness: z.enum(['current', 'dated', 'unknown']),
  reliability: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(1000),
})

export type DiscoveryCandidate = z.infer<typeof DiscoveryCandidateSchema>
export type SourceDocument = z.infer<typeof SourceDocumentSchema>
export type SourceEvaluation = z.infer<typeof SourceEvaluationSchema>

export interface SourceDiscoveryRequest {
  query: string
  destination: GeographicEntity
  language: string
  maxResults: number
  signal: AbortSignal
}

export interface SourceReadingRequest {
  candidate: DiscoveryCandidate
  signal: AbortSignal
}

export interface SourceEvaluationRequest {
  candidate: DiscoveryCandidate
  document: SourceDocument
  destination: GeographicEntity
  signal: AbortSignal
}

export interface EditorialSourceProvider {
  readonly id: string
  readonly model: string
  readonly simulation: boolean
  discover(request: SourceDiscoveryRequest): Promise<DiscoveryCandidate[]>
  read(request: SourceReadingRequest): Promise<SourceDocument>
  evaluate(request: SourceEvaluationRequest): Promise<SourceEvaluation>
}

export interface SourceAcquisitionLimits {
  timeoutMs: number
  maxAttempts: number
  backoffMs: number[]
  maxQueries: number
  maxResultsPerQuery: number
  maxSources: number
  maxDocumentCharacters: number
  budgetLimit: number
  currency: string
  costs: Record<SourceProviderOperation, number>
  circuitFailureThreshold: number
  circuitOpenMs: number
}

export interface SourceAcquisitionInput {
  requestId: string
  runId: string
  actorId: string
  correlationId: string
  destination: GeographicEntity
  queries: string[]
  language: string
  signal?: AbortSignal
}

export interface EvaluatedSourceDocument {
  source: ResearchSource
  content?: string
  evaluation?: SourceEvaluation
}

export interface SourceAcquisitionResult {
  sources: ResearchSource[]
  documents: EvaluatedSourceDocument[]
  usage: ProviderUsage[]
  events: ResearchEvent[]
  estimatedCost: number
  actualCost: number
  currency: string
  simulation: boolean
}

export interface SourceAcquisitionDependencies {
  now?: () => Date
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  id?: () => string
}

const defaultLimits: SourceAcquisitionLimits = {
  timeoutMs: 5_000,
  maxAttempts: 3,
  backoffMs: [0, 250, 1_000],
  maxQueries: 5,
  maxResultsPerQuery: 10,
  maxSources: 20,
  maxDocumentCharacters: 100_000,
  budgetLimit: 0,
  currency: 'EUR',
  costs: { discovery: 0, reading: 0, evaluation: 0 },
  circuitFailureThreshold: 3,
  circuitOpenMs: 30_000,
}

interface CircuitState {
  failures: number
  openUntil?: number
}

interface OperationResult<T> {
  value: T
  attempt: number
}

export class SourceAcquisitionService {
  private readonly limits: SourceAcquisitionLimits
  private readonly now: () => Date
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  private readonly id: () => string
  private readonly circuit: CircuitState = { failures: 0 }
  private readonly usage: ProviderUsage[] = []
  private readonly events: ResearchEvent[] = []
  private spent = 0

  constructor(
    private readonly provider: EditorialSourceProvider,
    limits: Partial<SourceAcquisitionLimits> = {},
    dependencies: SourceAcquisitionDependencies = {},
  ) {
    this.limits = {
      ...defaultLimits,
      ...limits,
      costs: { ...defaultLimits.costs, ...limits.costs },
    }
    this.now = dependencies.now ?? (() => new Date())
    this.sleep = dependencies.sleep ?? abortableSleep
    this.id = dependencies.id ?? randomUUID
  }

  estimateCost(queryCount: number, sourceCount: number): number {
    return queryCount * this.limits.costs.discovery
      + sourceCount * (this.limits.costs.reading + this.limits.costs.evaluation)
  }

  async acquire(input: SourceAcquisitionInput): Promise<SourceAcquisitionResult> {
    this.usage.length = 0
    this.events.length = 0
    this.spent = 0
    this.validateInput(input)
    const signal = input.signal ?? new AbortController().signal
    const discovered: DiscoveryCandidate[] = []

    for (const query of input.queries) {
      const result = await this.executeOperation(
        'discovery',
        query.length,
        input,
        signal,
        operationSignal => this.provider.discover({
          query,
          destination: input.destination,
          language: input.language,
          maxResults: this.limits.maxResultsPerQuery,
          signal: operationSignal,
        }).then(value => z.array(DiscoveryCandidateSchema).max(this.limits.maxResultsPerQuery).parse(value)),
      )
      discovered.push(...result.value)
    }

    const candidates = deduplicateCandidates(discovered).slice(0, this.limits.maxSources)
    const documents: EvaluatedSourceDocument[] = []
    const contentFingerprints = new Map<string, string>()
    for (const candidate of candidates) {
      if (signal.aborted) throw new SourceProviderError('CANCELLED', 'La adquisición fue cancelada', false)
      let document: SourceDocument
      try {
        const read = await this.executeOperation(
          'reading',
          candidate.url.length,
          input,
          signal,
          operationSignal => this.provider.read({ candidate, signal: operationSignal })
            .then(value => SourceDocumentSchema.parse(value)),
        )
        document = read.value
      } catch (error) {
        const normalized = normalizeProviderError(error)
        if (['CANCELLED', 'BUDGET_EXCEEDED', 'LIMIT_EXCEEDED'].includes(normalized.code)) throw normalized
        documents.push({ source: this.unavailableSource(candidate, input.runId, normalized.code) })
        continue
      }

      if (document.status !== 'read' || !document.content) {
        documents.push({ source: this.unavailableSource(candidate, input.runId, `HTTP_${document.httpStatus ?? 'UNAVAILABLE'}`) })
        continue
      }
      const content = document.content.slice(0, this.limits.maxDocumentCharacters)
      let evaluation: SourceEvaluation
      try {
        const evaluated = await this.executeOperation(
          'evaluation',
          content.length,
          input,
          signal,
          operationSignal => this.provider.evaluate({
            candidate,
            document: { ...document, content },
            destination: input.destination,
            signal: operationSignal,
          }).then(value => SourceEvaluationSchema.parse(value)),
        )
        evaluation = evaluated.value
      } catch (error) {
        const normalized = normalizeProviderError(error)
        if (['CANCELLED', 'BUDGET_EXCEEDED', 'LIMIT_EXCEEDED'].includes(normalized.code)) throw normalized
        documents.push({ source: this.unavailableSource(candidate, input.runId, normalized.code), content })
        continue
      }

      const contentFingerprint = sha256(content)
      const duplicateOfId = contentFingerprints.get(contentFingerprint)
      const source = ResearchSourceSchema.parse({
        id: deterministicUuid(`${input.runId}:${normalizeSourceUrl(candidate.url)}`),
        runId: input.runId,
        url: candidate.url,
        normalizedUrl: normalizeSourceUrl(candidate.url),
        title: candidate.title,
        author: document.author,
        publisher: document.publisher ?? candidate.publisher,
        publishedAt: document.publishedAt,
        query: candidate.query,
        sourceType: evaluation.sourceType,
        territorialScope: evaluation.territorialScope,
        freshness: evaluation.freshness,
        reliability: evaluation.reliability,
        duplicateOfId,
        status: duplicateOfId ? 'rejected' : evaluation.accepted ? 'accepted' : 'rejected',
        fingerprint: sha256(`${contentFingerprint}:${normalizeSourceUrl(candidate.url)}`),
        metadata: {
          simulation: this.provider.simulation,
          evaluationReason: evaluation.reason,
          contentFingerprint,
          truncated: content.length < document.content.length,
        },
        capturedAt: this.now(),
      })
      if (!duplicateOfId) contentFingerprints.set(contentFingerprint, source.id)
      documents.push({ source, content, evaluation })
    }

    return {
      sources: documents.map(document => document.source),
      documents,
      usage: structuredClone(this.usage),
      events: structuredClone(this.events),
      estimatedCost: this.spent,
      actualCost: this.spent,
      currency: this.limits.currency,
      simulation: this.provider.simulation,
    }
  }

  private validateInput(input: SourceAcquisitionInput): void {
    if (input.queries.length === 0 || input.queries.length > this.limits.maxQueries) {
      throw new SourceProviderError('LIMIT_EXCEEDED', `Se permiten entre 1 y ${this.limits.maxQueries} consultas`, false)
    }
    if (new Set(input.queries.map(query => query.trim())).size !== input.queries.length || input.queries.some(query => !query.trim() || query.length > 500)) {
      throw new SourceProviderError('LIMIT_EXCEEDED', 'Las consultas deben ser únicas y tener entre 1 y 500 caracteres', false)
    }
    if (!/^[a-z]{2}$/.test(input.language)) throw new SourceProviderError('LIMIT_EXCEEDED', 'El idioma debe usar dos letras minúsculas', false)
  }

  private async executeOperation<T>(
    operation: SourceProviderOperation,
    inputCharacters: number,
    input: SourceAcquisitionInput,
    signal: AbortSignal,
    action: (signal: AbortSignal) => Promise<T>,
  ): Promise<OperationResult<T>> {
    this.assertCircuitClosed()
    let lastError: SourceProviderError | undefined
    for (let attempt = 1; attempt <= this.limits.maxAttempts; attempt += 1) {
      if (signal.aborted) throw new SourceProviderError('CANCELLED', 'La adquisición fue cancelada', false)
      this.charge(operation)
      const startedAt = this.now()
      try {
        const value = await withTimeout(action, this.limits.timeoutMs, signal)
        this.circuit.failures = 0
        this.circuit.openUntil = undefined
        this.recordUsage(operation, inputCharacters, outputCharacters(value), attempt, input.runId)
        this.recordEvent(input, operation, 'succeeded', attempt, startedAt)
        return { value, attempt }
      } catch (error) {
        const normalized = normalizeProviderError(error)
        lastError = normalized
        this.recordUsage(operation, inputCharacters, 0, attempt, input.runId)
        this.recordEvent(input, operation, normalized.code, attempt, startedAt)
        if (normalized.code === 'CANCELLED') throw normalized
        this.recordCircuitFailure()
        if (!normalized.retryable || attempt >= this.limits.maxAttempts) throw normalized
        await this.sleep(this.limits.backoffMs[Math.min(attempt - 1, this.limits.backoffMs.length - 1)] ?? 0, signal)
        this.assertCircuitClosed()
      }
    }
    throw lastError ?? new SourceProviderError('PERMANENT', 'Operación de proveedor sin resultado', false)
  }

  private charge(operation: SourceProviderOperation): void {
    const next = this.spent + this.limits.costs[operation]
    if (next > this.limits.budgetLimit) {
      throw new SourceProviderError('BUDGET_EXCEEDED', `El presupuesto ${this.limits.currency} se agotó antes de ${operation}`, false)
    }
    this.spent = Number(next.toFixed(6))
  }

  private assertCircuitClosed(): void {
    if (this.circuit.openUntil && this.circuit.openUntil > this.now().getTime()) {
      throw new SourceProviderError('CIRCUIT_OPEN', 'El circuit breaker del proveedor está abierto', true)
    }
    if (this.circuit.openUntil) {
      this.circuit.openUntil = undefined
      this.circuit.failures = 0
    }
  }

  private recordCircuitFailure(): void {
    this.circuit.failures += 1
    if (this.circuit.failures >= this.limits.circuitFailureThreshold) {
      this.circuit.openUntil = this.now().getTime() + this.limits.circuitOpenMs
    }
  }

  private recordUsage(operation: SourceProviderOperation, inputCharacters: number, output: number, attempt: number, runId: string): void {
    const unitsIn = Math.ceil(inputCharacters / 4)
    const unitsOut = Math.ceil(output / 4)
    const cost = this.limits.costs[operation]
    this.usage.push(ProviderUsageSchema.parse({
      id: this.id(),
      runId,
      stage: operation === 'discovery' ? 'source_discovery' : 'source_reading',
      providerId: this.provider.id,
      model: this.provider.model,
      inputUnits: unitsIn,
      outputUnits: unitsOut,
      estimatedCost: cost,
      actualCost: cost,
      currency: this.limits.currency,
      budgetLimit: this.limits.budgetLimit,
      cause: `${operation}:attempt:${attempt}`,
      createdAt: this.now(),
    }))
  }

  private recordEvent(
    input: SourceAcquisitionInput,
    operation: SourceProviderOperation,
    outcome: string,
    attempt: number,
    startedAt: Date,
  ): void {
    this.events.push(ResearchEventSchema.parse({
      id: this.id(),
      requestId: input.requestId,
      runId: input.runId,
      type: `provider.${operation}.${outcome}`,
      stage: operation === 'discovery' ? 'source_discovery' : 'source_reading',
      actorId: input.actorId,
      correlationId: input.correlationId,
      payload: {
        providerId: this.provider.id,
        simulation: this.provider.simulation,
        attempt,
        durationMs: Math.max(0, this.now().getTime() - startedAt.getTime()),
      },
      occurredAt: this.now(),
    }))
  }

  private unavailableSource(candidate: DiscoveryCandidate, runId: string, reason: string): ResearchSource {
    const normalizedUrl = normalizeSourceUrl(candidate.url)
    return ResearchSourceSchema.parse({
      id: deterministicUuid(`${runId}:${normalizedUrl}`),
      runId,
      url: candidate.url,
      normalizedUrl,
      title: candidate.title,
      publisher: candidate.publisher,
      query: candidate.query,
      sourceType: 'other',
      territorialScope: 'destination',
      freshness: 'unknown',
      reliability: 0,
      status: 'unavailable',
      fingerprint: sha256(`unavailable:${normalizedUrl}`),
      metadata: { simulation: this.provider.simulation, errorCode: reason },
      capturedAt: this.now(),
    })
  }
}

export function normalizeSourceUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''
  url.hostname = url.hostname.toLocaleLowerCase()
  url.pathname = url.pathname !== '/' ? url.pathname.replace(/\/+$/, '') : '/'
  url.searchParams.sort()
  return url.toString()
}

function deduplicateCandidates(candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const unique = new Map<string, DiscoveryCandidate>()
  for (const candidate of candidates) {
    const parsed = DiscoveryCandidateSchema.parse(candidate)
    const key = normalizeSourceUrl(parsed.url)
    if (!unique.has(key)) unique.set(key, parsed)
  }
  return [...unique.values()]
}

function normalizeProviderError(error: unknown): SourceProviderError {
  if (error instanceof SourceProviderError) return error
  if (error instanceof z.ZodError) return new SourceProviderError('PERMANENT', 'El proveedor devolvió un contrato inválido', false, error)
  if (error instanceof Error && error.name === 'AbortError') return new SourceProviderError('CANCELLED', 'La adquisición fue cancelada', false, error)
  return new SourceProviderError('PERMANENT', 'El proveedor falló sin un error contractual', false, error)
}

async function withTimeout<T>(
  action: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const onParentAbort = () => controller.abort()
  parentSignal.addEventListener('abort', onParentAbort, { once: true })
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort()
        reject(new SourceProviderError('TIMEOUT', `El proveedor superó ${timeoutMs} ms`, true))
      }, timeoutMs)
    })
    const operation = action(controller.signal)
    return await Promise.race([operation, timeout])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    parentSignal.removeEventListener('abort', onParentAbort)
  }
}

async function abortableSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return
  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(resolve, milliseconds)
    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId)
      reject(new SourceProviderError('CANCELLED', 'La espera de reintento fue cancelada', false))
    }, { once: true })
  })
}

function deterministicUuid(value: string): string {
  const hex = sha256(value).slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4]
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function outputCharacters(value: unknown): number {
  return JSON.stringify(value).length
}
