import { createHash, randomUUID } from 'node:crypto'
import {
  REAL_CONNECTIVITY_FX_POLICY,
  REAL_CONNECTIVITY_POLICY,
  RealConnectivityAuthorizationSchema,
  RealConnectivityResultSchema,
  type RealConnectivityAudit,
  type RealConnectivityCallResult,
  type RealConnectivityResult,
} from '@shared/real-connectivity-contracts'

export interface RealConnectivityReservationInput {
  idempotencyKey: string
  executionId: string
  requestId: string
  runId: string
  taskId: string
  batchId: string
  budgetDate: string
  stage: 'connectivity_tavily' | 'connectivity_openai'
  operation: 'search' | 'responses'
  providerId: 'tavily' | 'openai'
  model: string
  estimatedCostEur: number
  tariffId: string
  promptVersion: string
  schemaVersion: string
  inputHash: string
}

export interface RealConnectivitySettlementInput {
  reservationId: string
  outcome: 'succeeded' | 'failed' | 'unknown'
  calculatedCostEur?: number
  remoteId?: string
  inputTokens: number
  outputTokens: number
  credits: number
  tools: string[]
  sanitizedError?: string
  outputHash?: string
}

export interface RealConnectivityLedgerPort {
  inspect(): Promise<RealConnectivityAudit>
  prepare(): Promise<void>
  acquire(executionId: string, leaseToken: string, expiresAt: string): Promise<boolean>
  release(leaseToken: string): Promise<boolean>
  reserve(input: RealConnectivityReservationInput): Promise<string>
  start(reservationId: string): Promise<void>
  settle(input: RealConnectivitySettlementInput): Promise<void>
}

export interface TavilyConnectivityResponse {
  remoteId: string
  credits: number
  url: string
  durationMs: number
}

export interface OpenAIConnectivityResponse {
  remoteId: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  outputText: string
  durationMs: number
}

export interface RealConnectivityNetworkPort {
  tavilySearch(signal: AbortSignal): Promise<TavilyConnectivityResponse>
  openAIResponse(signal: AbortSignal): Promise<OpenAIConnectivityResponse>
}

export type RealConnectivityProviderFailureKind = 'failed' | 'unknown'

export class RealConnectivityProviderError extends Error {
  readonly retryable = false

  constructor(
    readonly code: string,
    message: string,
    readonly kind: RealConnectivityProviderFailureKind,
    readonly durationMs: number,
  ) {
    super(message)
    this.name = 'RealConnectivityProviderError'
  }
}

export class RealConnectivityCheckService {
  constructor(
    private readonly ledger: RealConnectivityLedgerPort,
    private readonly network: RealConnectivityNetworkPort,
    private readonly now: () => Date = () => new Date(),
    private readonly id: () => string = randomUUID,
  ) {}

  async execute(candidate: unknown): Promise<RealConnectivityResult> {
    RealConnectivityAuthorizationSchema.parse(candidate)
    const startedAt = this.now().toISOString()
    const executionId = `connectivity-${this.id()}`
    const leaseToken = this.id()
    const calls: RealConnectivityCallResult[] = []
    let status: RealConnectivityResult['status'] = 'blocked'
    let errorCode: string | undefined
    let errorMessage: string | undefined
    let acquired = false

    const initial = await this.ledger.inspect()
    if (
      initial.providerCalls !== 0
      || initial.reservations !== 0
      || initial.pendingReservations !== 0
      || initial.reservedEur !== 0
      || initial.spentEur !== 0
    ) {
      return this.result({
        executionId,
        status: 'blocked',
        startedAt,
        calls,
        audit: initial,
        errorCode: 'SECOND_ATTEMPT_BLOCKED',
        errorMessage: 'La prueba de conectividad ya fue iniciada y no admite una segunda ejecución',
      })
    }

    try {
      await this.ledger.prepare()
      acquired = await this.ledger.acquire(
        executionId,
        leaseToken,
        new Date(this.now().getTime() + 5 * 60_000).toISOString(),
      )
      if (!acquired) {
        status = 'blocked'
        errorCode = 'GLOBAL_GUARD_BUSY'
        errorMessage = 'La guarda global está ocupada'
      } else {
        const tavily = await this.executeTavily(executionId, calls)
        if (!tavily.ok) {
          status = tavily.status
          errorCode = tavily.errorCode
          errorMessage = tavily.errorMessage
        } else {
          const openai = await this.executeOpenAI(executionId, calls)
          status = openai.ok ? 'succeeded' : openai.status
          errorCode = openai.ok ? undefined : openai.errorCode
          errorMessage = openai.ok ? undefined : openai.errorMessage
        }
      }
    } catch (error) {
      status = 'failed'
      errorCode = connectivityErrorCode(error)
      errorMessage = connectivityErrorMessage(error)
    } finally {
      if (acquired) {
        try {
          const released = await this.ledger.release(leaseToken)
          if (!released && status === 'succeeded') {
            status = 'failed'
            errorCode = 'GLOBAL_GUARD_RELEASE_FAILED'
            errorMessage = 'La guarda global no pudo liberarse'
          }
        } catch {
          if (status === 'succeeded') {
            status = 'failed'
            errorCode = 'GLOBAL_GUARD_RELEASE_FAILED'
            errorMessage = 'La guarda global no pudo liberarse'
          }
        }
      }
    }

    const audit = await this.ledger.inspect()
    if (
      status === 'succeeded'
      && (
        calls.length !== REAL_CONNECTIVITY_POLICY.maxProviderCalls
        || audit.pendingReservations !== 0
        || audit.reservedEur !== 0
        || !audit.guardFree
      )
    ) {
      status = 'failed'
      errorCode = 'POSTFLIGHT_RECONCILIATION_FAILED'
      errorMessage = 'La conciliación final no dejó el ledger y la guarda en estado seguro'
    }
    return this.result({
      executionId,
      status,
      startedAt,
      calls,
      audit,
      errorCode,
      errorMessage,
    })
  }

  private async executeTavily(
    executionId: string,
    calls: RealConnectivityCallResult[],
  ): Promise<StepOutcome> {
    const policy = REAL_CONNECTIVITY_POLICY.tavily
    const reservationId = await this.ledger.reserve({
      ...reservationBase(executionId, this.now()),
      idempotencyKey: 'connectivity-10d-tavily-v1',
      stage: 'connectivity_tavily',
      operation: policy.operation,
      providerId: policy.providerId,
      model: policy.model,
      estimatedCostEur: policy.reserveEur,
      tariffId: REAL_CONNECTIVITY_TARIFF_IDS.tavily,
      promptVersion: REAL_CONNECTIVITY_POLICY.version,
      schemaVersion: 'connectivity-tavily-v1',
      inputHash: hash({
        query: policy.query,
        searchDepth: policy.searchDepth,
        maxResults: policy.maxResults,
        includeAnswer: policy.includeAnswer,
        includeRawContent: policy.includeRawContent,
        includeImages: policy.includeImages,
        autoParameters: policy.autoParameters,
        maxRetries: REAL_CONNECTIVITY_POLICY.maxRetries,
      }),
    })
    await this.ledger.start(reservationId)

    try {
      const response = await this.network.tavilySearch(new AbortController().signal)
      const costUsd = roundMoney(response.credits * 0.008)
      const costEur = convertUsdToEur(costUsd)
      await this.ledger.settle({
        reservationId,
        outcome: 'succeeded',
        calculatedCostEur: costEur,
        remoteId: response.remoteId,
        inputTokens: 0,
        outputTokens: 0,
        credits: response.credits,
        tools: ['search'],
        outputHash: hash({ url: response.url }),
      })
      calls.push({
        providerId: 'tavily',
        status: 'succeeded',
        remoteIdMask: maskRemoteId(response.remoteId),
        durationMs: response.durationMs,
        credits: response.credits,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        estimatedCostEur: policy.reserveEur,
        costUsd,
        costEur,
        url: response.url,
        domain: new URL(response.url).hostname,
      })
      return { ok: true }
    } catch (error) {
      return this.settleFailure('tavily', reservationId, error, calls)
    }
  }

  private async executeOpenAI(
    executionId: string,
    calls: RealConnectivityCallResult[],
  ): Promise<StepOutcome> {
    const policy = REAL_CONNECTIVITY_POLICY.openai
    const reservationId = await this.ledger.reserve({
      ...reservationBase(executionId, this.now()),
      idempotencyKey: 'connectivity-10d-openai-v1',
      stage: 'connectivity_openai',
      operation: policy.operation,
      providerId: policy.providerId,
      model: policy.model,
      estimatedCostEur: policy.reserveEur,
      tariffId: REAL_CONNECTIVITY_TARIFF_IDS.openai,
      promptVersion: REAL_CONNECTIVITY_POLICY.version,
      schemaVersion: 'connectivity-openai-v1',
      inputHash: hash({
        prompt: policy.prompt,
        model: policy.model,
        maxOutputTokens: policy.maxOutputTokens,
        store: policy.store,
        tools: policy.tools,
        reasoningEffort: policy.reasoningEffort,
        maxRetries: REAL_CONNECTIVITY_POLICY.maxRetries,
      }),
    })
    await this.ledger.start(reservationId)

    try {
      const response = await this.network.openAIResponse(new AbortController().signal)
      const costUsd = openAICostUsd(response)
      const costEur = convertUsdToEur(costUsd)
      await this.ledger.settle({
        reservationId,
        outcome: 'succeeded',
        calculatedCostEur: costEur,
        remoteId: response.remoteId,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        credits: 0,
        tools: [],
        outputHash: hash(response.outputText),
      })
      const expectedOutputMatched = response.outputText === policy.expectedOutput
      calls.push({
        providerId: 'openai',
        status: 'succeeded',
        remoteIdMask: maskRemoteId(response.remoteId),
        durationMs: response.durationMs,
        credits: 0,
        inputTokens: response.inputTokens,
        cachedInputTokens: response.cachedInputTokens,
        outputTokens: response.outputTokens,
        estimatedCostEur: policy.reserveEur,
        costUsd,
        costEur,
        expectedOutputMatched,
        ...(!expectedOutputMatched && {
          errorCode: 'UNEXPECTED_OPENAI_OUTPUT',
          errorMessage: 'OpenAI no devolvió el literal esperado',
        }),
      })
      return expectedOutputMatched
        ? { ok: true }
        : {
            ok: false,
            status: 'failed',
            errorCode: 'UNEXPECTED_OPENAI_OUTPUT',
            errorMessage: 'OpenAI no devolvió el literal esperado',
          }
    } catch (error) {
      return this.settleFailure('openai', reservationId, error, calls)
    }
  }

  private async settleFailure(
    providerId: 'tavily' | 'openai',
    reservationId: string,
    error: unknown,
    calls: RealConnectivityCallResult[],
  ): Promise<StepOutcome> {
    const failure = error instanceof RealConnectivityProviderError
      ? error
      : new RealConnectivityProviderError(
          'UNCLASSIFIED_PROVIDER_FAILURE',
          'El proveedor devolvió un fallo no clasificable',
          'unknown',
          0,
        )
    await this.ledger.settle({
      reservationId,
      outcome: failure.kind,
      ...(failure.kind === 'failed' && { calculatedCostEur: 0 }),
      inputTokens: 0,
      outputTokens: 0,
      credits: 0,
      tools: providerId === 'tavily' ? ['search'] : [],
      sanitizedError: failure.message,
    })
    calls.push({
      providerId,
      status: failure.kind,
      durationMs: failure.durationMs,
      credits: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      estimatedCostEur: providerId === 'tavily'
        ? REAL_CONNECTIVITY_POLICY.tavily.reserveEur
        : REAL_CONNECTIVITY_POLICY.openai.reserveEur,
      ...(failure.kind === 'failed' && { costUsd: 0, costEur: 0 }),
      errorCode: failure.code,
      errorMessage: failure.message,
    })
    return {
      ok: false,
      status: failure.kind,
      errorCode: failure.code,
      errorMessage: failure.message,
    }
  }

  private result(input: {
    executionId: string
    status: RealConnectivityResult['status']
    startedAt: string
    calls: RealConnectivityCallResult[]
    audit: RealConnectivityAudit
    errorCode?: string
    errorMessage?: string
  }): RealConnectivityResult {
    return RealConnectivityResultSchema.parse({
      executionId: input.executionId,
      status: input.status,
      startedAt: input.startedAt,
      completedAt: this.now().toISOString(),
      policyVersion: REAL_CONNECTIVITY_POLICY.version,
      conversionVersion: REAL_CONNECTIVITY_FX_POLICY.version,
      conversionRate: REAL_CONNECTIVITY_FX_POLICY.usdToEur,
      calls: input.calls,
      audit: input.audit,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      researchExecuted: false,
      publicationCount: 0,
      automaticEnabled: false,
      trawelConnected: false,
    })
  }
}

export const REAL_CONNECTIVITY_TARIFF_IDS = {
  tavily: '76000000-0000-4000-8000-000000000001',
  openai: '76000000-0000-4000-8000-000000000002',
} as const

interface StepSuccess {
  ok: true
}

interface StepFailure {
  ok: false
  status: 'failed' | 'unknown'
  errorCode: string
  errorMessage: string
}

type StepOutcome = StepSuccess | StepFailure

function reservationBase(executionId: string, now: Date) {
  return {
    executionId,
    requestId: 'connectivity-check-10d',
    runId: 'connectivity-check-10d-run',
    taskId: 'connectivity-check-10d-task',
    batchId: 'connectivity-check-10d-batch',
    budgetDate: dateInMadrid(now),
  }
}

function dateInMadrid(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function openAICostUsd(response: OpenAIConnectivityResponse): number {
  const cached = Math.min(response.inputTokens, response.cachedInputTokens)
  const uncached = response.inputTokens - cached
  return roundMoney(
    uncached / 1_000_000
    + cached * 0.1 / 1_000_000
    + response.outputTokens * 6 / 1_000_000,
  )
}

export function convertUsdToEur(costUsd: number): number {
  return roundMoney(costUsd * REAL_CONNECTIVITY_FX_POLICY.usdToEur)
}

function roundMoney(value: number): number {
  return Math.ceil((value - Number.EPSILON) * 1_000_000_000) / 1_000_000_000
}

function maskRemoteId(value: string): string {
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

function hash(value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  return createHash('sha256').update(serialized).digest('hex')
}

function connectivityErrorCode(error: unknown): string {
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && typeof error.code === 'string'
  ) return error.code
  return 'CONNECTIVITY_EXECUTION_FAILED'
}

function connectivityErrorMessage(error: unknown): string {
  const code = connectivityErrorCode(error)
  const known: Record<string, string> = {
    IDEMPOTENCY_CONFLICT: 'La reserva entra en conflicto con una ejecución anterior',
    TASK_BUDGET_EXCEEDED: 'El presupuesto máximo de 0,02 EUR bloqueó la llamada',
    BATCH_BUDGET_EXCEEDED: 'El presupuesto máximo de 0,02 EUR bloqueó la llamada',
    DAILY_BUDGET_EXCEEDED: 'El presupuesto máximo de 0,02 EUR bloqueó la llamada',
  }
  return known[code] ?? 'La prueba se detuvo sin reintentar'
}
