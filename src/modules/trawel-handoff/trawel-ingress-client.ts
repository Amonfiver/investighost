import {
  TrawelEditorialIngressResponseSchema,
  type TrawelEditorialDeliveryV2Payload,
  type TrawelEditorialIngressResponse,
} from '@shared/trawel-editorial-delivery-contracts'

export interface TrawelIngressClient {
  deliver(payload: TrawelEditorialDeliveryV2Payload): Promise<TrawelEditorialIngressResponse>
}

export interface TrawelDeliveryReconciler {
  reconcile(input: { handoffKey: string; payloadFingerprint: string }): Promise<TrawelEditorialIngressResponse | { status: 'NOT_CONFIGURED' | 'NOT_FOUND' }>
}

/** Trawel has no validated read-back endpoint yet; this fails closed without inventing one. */
export class UnsupportedTrawelDeliveryReconciler implements TrawelDeliveryReconciler {
  async reconcile(): Promise<{ status: 'NOT_CONFIGURED' }> { return { status: 'NOT_CONFIGURED' } }
}

export class TrawelIngressError extends Error {
  constructor(readonly disposition: 'retryable' | 'permanent' | 'ambiguous', message: string) {
    super(message); this.name = 'TrawelIngressError'
  }
}

export interface HttpTrawelIngressClientOptions {
  url: string
  internalSecret: string
  timeoutMs?: number
  fetchFn?: typeof fetch
  allowInsecureForTests?: boolean
}

export function parseTrawelIngressConfig(environment: NodeJS.ProcessEnv): Pick<HttpTrawelIngressClientOptions, 'url' | 'internalSecret'> {
  const url = environment.TRAWEL_INTERNAL_EDITORIAL_DELIVERIES_URL
  const internalSecret = environment.TRAWEL_INTERNAL_EDITORIAL_DELIVERIES_SECRET
  if (!url || !internalSecret) throw new Error('TRAWEL_INGRESS_CONFIG_MISSING')
  return { url, internalSecret }
}

/** Privileged-only client. It never serializes or logs its internal secret. */
export class HttpTrawelIngressClient implements TrawelIngressClient {
  private readonly fetchFn: typeof fetch
  private readonly url: string
  private readonly timeoutMs: number

  constructor(private readonly options: HttpTrawelIngressClientOptions) {
    const parsed = new URL(options.url)
    if (parsed.protocol !== 'https:' && !options.allowInsecureForTests) throw new Error('TRAWEL_INGRESS_HTTPS_REQUIRED')
    if (!options.internalSecret.trim()) throw new Error('TRAWEL_INGRESS_SECRET_REQUIRED')
    this.url = parsed.toString()
    this.timeoutMs = options.timeoutMs ?? 10_000
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 120_000) throw new Error('TRAWEL_INGRESS_TIMEOUT_INVALID')
    this.fetchFn = options.fetchFn ?? fetch
  }

  async deliver(payload: TrawelEditorialDeliveryV2Payload): Promise<TrawelEditorialIngressResponse> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchFn(this.url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-internal-editorial-secret': this.options.internalSecret,
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new TrawelIngressError(classifyHttp(response.status), `Trawel delivery HTTP ${response.status}`)
      return TrawelEditorialIngressResponseSchema.parse(await response.json())
    } catch (error) {
      if (error instanceof TrawelIngressError) throw error
      if (isAbort(error)) throw new TrawelIngressError('ambiguous', 'Trawel delivery timed out')
      throw new TrawelIngressError('ambiguous', 'Trawel delivery transport failed')
    } finally {
      clearTimeout(timeout)
    }
  }
}

/** Authenticated GET supported by the deployed Edge Function, used only after an ambiguous POST. */
export class HttpTrawelDeliveryReconciler implements TrawelDeliveryReconciler {
  private readonly fetchFn: typeof fetch
  private readonly url: string
  private readonly timeoutMs: number
  constructor(private readonly options: HttpTrawelIngressClientOptions) {
    const parsed = new URL(options.url)
    if (parsed.protocol !== 'https:' && !options.allowInsecureForTests) throw new Error('TRAWEL_INGRESS_HTTPS_REQUIRED')
    if (!options.internalSecret.trim()) throw new Error('TRAWEL_INGRESS_SECRET_REQUIRED')
    this.url = parsed.toString().replace(/\/$/, '')
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.fetchFn = options.fetchFn ?? fetch
  }
  async reconcile(input: { handoffKey: string }): Promise<TrawelEditorialIngressResponse | { status: 'NOT_FOUND' }> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchFn(`${this.url}/${encodeURIComponent(input.handoffKey)}`, {
        method: 'GET', signal: controller.signal,
        headers: { 'x-internal-editorial-secret': this.options.internalSecret },
      })
      if (response.status === 404) return { status: 'NOT_FOUND' }
      if (!response.ok) throw new TrawelIngressError(classifyHttp(response.status), `Trawel reconciliation HTTP ${response.status}`)
      return TrawelEditorialIngressResponseSchema.parse(await response.json())
    } catch (error) {
      if (error instanceof TrawelIngressError) throw error
      if (isAbort(error)) throw new TrawelIngressError('ambiguous', 'Trawel reconciliation timed out')
      throw new TrawelIngressError('ambiguous', 'Trawel reconciliation transport failed')
    } finally {
      clearTimeout(timeout)
    }
  }
}

function classifyHttp(status: number): 'retryable' | 'permanent' | 'ambiguous' {
  if (status === 429) return 'retryable'
  if (status === 408 || status >= 500) return 'ambiguous'
  return 'permanent'
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
