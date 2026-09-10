import {
  TrawelEditorialIngressResponseSchema,
  type TrawelEditorialDeliveryV2Payload,
  type TrawelEditorialIngressResponse,
} from '@shared/trawel-editorial-delivery-contracts'

export interface TrawelIngressClient {
  deliver(payload: TrawelEditorialDeliveryV2Payload): Promise<TrawelEditorialIngressResponse>
  lookup(handoffKey: string): Promise<TrawelEditorialIngressResponse | { result: 'NOT_FOUND' }>
}

/** Lets transports distinguish a rejected request from a request whose remote outcome is unknown. */
export class TrawelIngressError extends Error {
  constructor(readonly disposition: 'pre_persistence' | 'ambiguous', message: string) {
    super(message); this.name = 'TrawelIngressError'
  }
}

export interface HttpTrawelIngressClientOptions { baseUrl: string; fetchFn?: typeof fetch }

/** No runtime is wired to this client: using it requires an explicit caller and future Trawel endpoint. */
export class HttpTrawelIngressClient implements TrawelIngressClient {
  private readonly fetchFn: typeof fetch
  constructor(private readonly options: HttpTrawelIngressClientOptions) { this.fetchFn = options.fetchFn ?? fetch }
  async deliver(payload: TrawelEditorialDeliveryV2Payload): Promise<TrawelEditorialIngressResponse> {
    return this.request('/internal/editorial-deliveries', { method: 'POST', body: JSON.stringify(payload) })
  }
  async lookup(handoffKey: string): Promise<TrawelEditorialIngressResponse | { result: 'NOT_FOUND' }> {
    const response = await this.fetchFn(`${this.options.baseUrl}/internal/editorial-deliveries/${encodeURIComponent(handoffKey)}`)
      .catch(error => { throw new TrawelIngressError('ambiguous', error instanceof Error ? error.message : 'Trawel lookup failed') })
    if (response.status === 404) return { result: 'NOT_FOUND' }
    if (!response.ok) throw new TrawelIngressError(response.status >= 500 ? 'ambiguous' : 'pre_persistence', `Trawel lookup HTTP ${response.status}`)
    return TrawelEditorialIngressResponseSchema.parse(await response.json())
  }
  private async request(path: string, init: RequestInit): Promise<TrawelEditorialIngressResponse> {
    const response = await this.fetchFn(`${this.options.baseUrl}${path}`, { ...init, headers: { 'content-type': 'application/json' } })
      .catch(error => { throw new TrawelIngressError('ambiguous', error instanceof Error ? error.message : 'Trawel delivery failed') })
    if (!response.ok) throw new TrawelIngressError(response.status >= 500 ? 'ambiguous' : 'pre_persistence', `Trawel delivery HTTP ${response.status}`)
    return TrawelEditorialIngressResponseSchema.parse(await response.json())
  }
}
