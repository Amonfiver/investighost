import { describe, expect, it } from 'vitest'
import {
  REAL_CONNECTIVITY_CONFIRMATION,
  REAL_CONNECTIVITY_POLICY,
  type RealConnectivityAudit,
} from '@shared/real-connectivity-contracts'
import {
  RealConnectivityCheckService,
  RealConnectivityProviderError,
  type OpenAIConnectivityResponse,
  type RealConnectivityLedgerPort,
  type RealConnectivityNetworkPort,
  type RealConnectivityReservationInput,
  type RealConnectivitySettlementInput,
  type TavilyConnectivityResponse,
} from '@modules/real-pipeline'

const authorization = {
  humanConfirmation: REAL_CONNECTIVITY_CONFIRMATION,
  morellaExecutionRequested: false,
  publicationRequested: false,
  automaticRequested: false,
  trawelRequested: false,
} as const

class FakeLedger implements RealConnectivityLedgerPort {
  readonly reservations = new Map<string, {
    input: RealConnectivityReservationInput
    state: 'reserved' | 'started' | 'succeeded' | 'failed' | 'unknown'
    calculatedCostEur?: number
  }>()
  guardFree = true
  initialProviderCalls = 0
  spentEur = 0
  reservedEur = 0
  reserveError?: Error & { code?: string }
  prepared = false

  async inspect(): Promise<RealConnectivityAudit> {
    const pendingReservations = [...this.reservations.values()]
      .filter(item => item.state === 'reserved' || item.state === 'started' || item.state === 'unknown')
      .length
    return {
      providerCalls: this.initialProviderCalls + this.reservations.size,
      reservations: this.initialProviderCalls + this.reservations.size,
      pendingReservations,
      reservedEur: this.reservedEur,
      spentEur: this.spentEur,
      remainingEur: Math.max(0, REAL_CONNECTIVITY_POLICY.budgetEur - this.spentEur - this.reservedEur),
      guardFree: this.guardFree,
    }
  }

  async prepare(): Promise<void> {
    this.prepared = true
  }

  async acquire(): Promise<boolean> {
    if (!this.guardFree) return false
    this.guardFree = false
    return true
  }

  async release(): Promise<boolean> {
    this.guardFree = true
    return true
  }

  async reserve(input: RealConnectivityReservationInput): Promise<string> {
    if (this.reserveError) throw this.reserveError
    if (this.spentEur + this.reservedEur + input.estimatedCostEur > REAL_CONNECTIVITY_POLICY.budgetEur) {
      throw Object.assign(new Error('budget'), { code: 'TASK_BUDGET_EXCEEDED' })
    }
    const id = `reservation-${this.reservations.size + 1}`
    this.reservations.set(id, { input, state: 'reserved' })
    this.reservedEur += input.estimatedCostEur
    return id
  }

  async start(reservationId: string): Promise<void> {
    const reservation = this.reservations.get(reservationId)
    if (!reservation) throw new Error('missing')
    reservation.state = 'started'
  }

  async settle(input: RealConnectivitySettlementInput): Promise<void> {
    const reservation = this.reservations.get(input.reservationId)
    if (!reservation) throw new Error('missing')
    if (input.outcome === 'unknown') {
      reservation.state = 'unknown'
      return
    }
    this.reservedEur -= reservation.input.estimatedCostEur
    this.spentEur += input.calculatedCostEur ?? 0
    reservation.calculatedCostEur = input.calculatedCostEur
    reservation.state = input.outcome
  }
}

class FakeNetwork implements RealConnectivityNetworkPort {
  tavilyCalls = 0
  openAICalls = 0

  constructor(
    private readonly tavilyResult: TavilyConnectivityResponse | Error = tavilySuccess(),
    private readonly openAIResult: OpenAIConnectivityResponse | Error = openAISuccess(),
  ) {}

  async tavilySearch(): Promise<TavilyConnectivityResponse> {
    this.tavilyCalls += 1
    if (this.tavilyResult instanceof Error) throw this.tavilyResult
    return this.tavilyResult
  }

  async openAIResponse(): Promise<OpenAIConnectivityResponse> {
    this.openAICalls += 1
    if (this.openAIResult instanceof Error) throw this.openAIResult
    return this.openAIResult
  }
}

describe('PROMPT 10D · prueba real mínima simulada antes de red', () => {
  it('Tavily success: registra exactamente un crédito y un resultado', async () => {
    const { result, network } = await execute()
    expect(result.calls[0]).toMatchObject({
      providerId: 'tavily',
      status: 'succeeded',
      credits: 1,
      domain: 'www.morella.net',
      costEur: 0.008,
    })
    expect(network.tavilyCalls).toBe(1)
  })

  it('Tavily 401: concilia fallo y no llama a OpenAI', async () => {
    const { result, network } = await execute(providerFailure('TAVILY_AUTH_REJECTED', 'failed'))
    expect(result.status).toBe('failed')
    expect(result.calls[0].errorCode).toBe('TAVILY_AUTH_REJECTED')
    expect(network.openAICalls).toBe(0)
  })

  it('Tavily 429: se detiene sin reintento', async () => {
    const { result, network } = await execute(providerFailure('TAVILY_RATE_LIMITED', 'failed'))
    expect(result.status).toBe('failed')
    expect(network.tavilyCalls).toBe(1)
  })

  it('Tavily timeout ambiguo: conserva estado unknown y se detiene', async () => {
    const { result } = await execute(providerFailure('TAVILY_AMBIGUOUS_TIMEOUT', 'unknown'))
    expect(result.status).toBe('unknown')
    expect(result.audit.pendingReservations).toBe(1)
  })

  it('Tavily respuesta inválida: no adivina coste ni continúa', async () => {
    const { result, network } = await execute(providerFailure('TAVILY_INVALID_RESPONSE', 'unknown'))
    expect(result.calls[0].status).toBe('unknown')
    expect(network.openAICalls).toBe(0)
  })

  it('OpenAI success: exige el literal exacto y concilia tokens', async () => {
    const { result } = await execute()
    expect(result.calls[1]).toMatchObject({
      providerId: 'openai',
      status: 'succeeded',
      expectedOutputMatched: true,
      inputTokens: 14,
      outputTokens: 6,
    })
  })

  it('OpenAI 401: Tavily queda conciliado y la segunda llamada falla', async () => {
    const { result } = await execute(undefined, providerFailure('OPENAI_AUTH_REJECTED', 'failed'))
    expect(result.status).toBe('failed')
    expect(result.calls.map(call => call.status)).toEqual(['succeeded', 'failed'])
  })

  it('OpenAI 429: no abre una tercera llamada', async () => {
    const { result, network } = await execute(undefined, providerFailure('OPENAI_RATE_LIMITED', 'failed'))
    expect(result.status).toBe('failed')
    expect(network.tavilyCalls + network.openAICalls).toBe(2)
  })

  it('OpenAI timeout ambiguo: se detiene con reserva unknown', async () => {
    const { result } = await execute(undefined, providerFailure('OPENAI_AMBIGUOUS_TIMEOUT', 'unknown'))
    expect(result.status).toBe('unknown')
    expect(result.audit.pendingReservations).toBe(1)
  })

  it('OpenAI salida inesperada: concilia el uso y no reintenta', async () => {
    const unexpected = { ...openAISuccess(), outputText: 'OTRA_RESPUESTA' }
    const { result, network } = await execute(undefined, unexpected)
    expect(result.status).toBe('failed')
    expect(result.calls[1].errorCode).toBe('UNEXPECTED_OPENAI_OUTPUT')
    expect(result.audit.pendingReservations).toBe(0)
    expect(network.openAICalls).toBe(1)
  })

  it('presupuesto insuficiente: bloquea antes de usar red', async () => {
    const ledger = new FakeLedger()
    ledger.reserveError = Object.assign(new Error('budget'), { code: 'TASK_BUDGET_EXCEEDED' })
    const network = new FakeNetwork()
    const result = await service(ledger, network).execute(authorization)
    expect(result.errorCode).toBe('TASK_BUDGET_EXCEEDED')
    expect(network.tavilyCalls).toBe(0)
  })

  it('conflicto de reserva: no intenta resolverlo con otra clave', async () => {
    const ledger = new FakeLedger()
    ledger.reserveError = Object.assign(new Error('conflict'), { code: 'IDEMPOTENCY_CONFLICT' })
    const network = new FakeNetwork()
    const result = await service(ledger, network).execute(authorization)
    expect(result.errorCode).toBe('IDEMPOTENCY_CONFLICT')
    expect(network.tavilyCalls).toBe(0)
  })

  it('guarda ocupada: no crea ninguna reserva ni llamada', async () => {
    const ledger = new FakeLedger()
    ledger.guardFree = false
    const network = new FakeNetwork()
    const result = await service(ledger, network).execute(authorization)
    expect(result.errorCode).toBe('GLOBAL_GUARD_BUSY')
    expect(ledger.reservations.size).toBe(0)
    expect(network.tavilyCalls).toBe(0)
  })

  it('segundo intento: el historial durable bloquea antes de preparar', async () => {
    const ledger = new FakeLedger()
    ledger.initialProviderCalls = 1
    const network = new FakeNetwork()
    const result = await service(ledger, network).execute(authorization)
    expect(result.errorCode).toBe('SECOND_ATTEMPT_BLOCKED')
    expect(ledger.prepared).toBe(false)
    expect(network.tavilyCalls).toBe(0)
  })

  it('Morella: el contrato rechaza iniciar investigación', async () => {
    await expect(service(new FakeLedger(), new FakeNetwork()).execute({
      ...authorization,
      morellaExecutionRequested: true,
    })).rejects.toThrow()
  })

  it('publicación: el contrato rechaza cualquier solicitud', async () => {
    await expect(service(new FakeLedger(), new FakeNetwork()).execute({
      ...authorization,
      publicationRequested: true,
    })).rejects.toThrow()
  })

  it('secretos: el resultado público no contiene credenciales ni cabeceras', async () => {
    const { result } = await execute()
    expect(JSON.stringify(result)).not.toMatch(/(?:sk-|tvly-|api[_ -]?key|authorization|bearer\s)/i)
    expect(result.calls.every(call => !call.remoteIdMask?.includes('remote-request-0001'))).toBe(true)
  })

  it('conciliación: el éxito deja cero reservas pendientes y cero retenido', async () => {
    const { result } = await execute()
    expect(result.status).toBe('succeeded')
    expect(result.audit.pendingReservations).toBe(0)
    expect(result.audit.reservedEur).toBeCloseTo(0)
    expect(result.audit.guardFree).toBe(true)
  })

  it('zero retry: un fallo invoca al proveedor una sola vez', async () => {
    const { network } = await execute(providerFailure('TAVILY_SERVER_ERROR', 'failed'))
    expect(network.tavilyCalls).toBe(1)
    expect(network.openAICalls).toBe(0)
    expect(REAL_CONNECTIVITY_POLICY.maxRetries).toBe(0)
  })

  it('máximo dos llamadas: el camino feliz ejecuta una por proveedor', async () => {
    const { result, network } = await execute()
    expect(network.tavilyCalls).toBe(1)
    expect(network.openAICalls).toBe(1)
    expect(result.calls).toHaveLength(REAL_CONNECTIVITY_POLICY.maxProviderCalls)
  })
})

async function execute(
  tavilyResult?: TavilyConnectivityResponse | Error,
  openAIResult?: OpenAIConnectivityResponse | Error,
) {
  const ledger = new FakeLedger()
  const network = new FakeNetwork(tavilyResult, openAIResult)
  const result = await service(ledger, network).execute(authorization)
  return { ledger, network, result }
}

function service(ledger: FakeLedger, network: FakeNetwork): RealConnectivityCheckService {
  const timestamps = [
    '2026-07-25T20:00:00.000+02:00',
    '2026-07-25T20:00:01.000+02:00',
    '2026-07-25T20:00:02.000+02:00',
    '2026-07-25T20:00:03.000+02:00',
  ]
  let timestamp = 0
  let identifier = 0
  return new RealConnectivityCheckService(
    ledger,
    network,
    () => new Date(timestamps[Math.min(timestamp++, timestamps.length - 1)]),
    () => `00000000-0000-4000-8000-${String(++identifier).padStart(12, '0')}`,
  )
}

function tavilySuccess(): TavilyConnectivityResponse {
  return {
    remoteId: 'remote-request-0001',
    credits: 1,
    url: 'https://www.morella.net/',
    durationMs: 40,
  }
}

function openAISuccess(): OpenAIConnectivityResponse {
  return {
    remoteId: 'response-remote-0002',
    inputTokens: 14,
    cachedInputTokens: 0,
    outputTokens: 6,
    outputText: REAL_CONNECTIVITY_POLICY.openai.expectedOutput,
    durationMs: 50,
  }
}

function providerFailure(
  code: string,
  kind: 'failed' | 'unknown',
): RealConnectivityProviderError {
  return new RealConnectivityProviderError(
    code,
    'Fallo simulado y sanitizado',
    kind,
    25,
  )
}
