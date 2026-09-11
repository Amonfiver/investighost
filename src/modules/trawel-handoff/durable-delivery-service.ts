import { randomUUID } from 'node:crypto'
import type { TrawelEditorialDeliveryV2Payload, TrawelEditorialIngressResponse } from '@shared/trawel-editorial-delivery-contracts'
import { assertTrawelEditorialDeliveryV2Integrity } from './delivery-v2-adapter'
import type { EditorialDelivery, EditorialDeliveryRepository } from './delivery-repository'
import {
  TrawelIngressError,
  UnsupportedTrawelDeliveryReconciler,
  type TrawelDeliveryReconciler,
  type TrawelIngressClient,
} from './trawel-ingress-client'

export interface DurableDeliveryServiceOptions {
  now?: () => Date
  correlationId?: () => string
  leaseForMs?: number
  retryDelayMs?: number
}

/** Explicit command service. It deliberately does not install a scheduler or publish anything. */
export class DurableTrawelDeliveryService {
  private readonly now: () => Date
  private readonly correlationId: () => string
  private readonly leaseForMs: number
  private readonly retryDelayMs: number
  constructor(
    private readonly repository: EditorialDeliveryRepository,
    private readonly ingress: TrawelIngressClient,
    options: DurableDeliveryServiceOptions = {},
    private readonly reconciler: TrawelDeliveryReconciler = new UnsupportedTrawelDeliveryReconciler(),
  ) {
    this.now = options.now ?? (() => new Date())
    this.correlationId = options.correlationId ?? randomUUID
    this.leaseForMs = options.leaseForMs ?? 30_000
    this.retryDelayMs = options.retryDelayMs ?? 15_000
  }

  /** Persist the exact immutable V2 payload before any network operation. */
  async enqueue(payload: TrawelEditorialDeliveryV2Payload): Promise<EditorialDelivery> {
    assertTrawelEditorialDeliveryV2Integrity(payload)
    return this.repository.enqueue(payload)
  }

  async deliver(deliveryId: string): Promise<EditorialDelivery | null> {
    const now = this.now(); await this.repository.recoverExpiredLeases(now)
    const lease = await this.repository.acquireForDelivery(deliveryId, now, this.leaseForMs)
    if (lease === null) return this.repository.findById(deliveryId)
    const attempt = await this.repository.recordAttemptStart(lease.delivery.id, this.correlationId(), now)
    try {
      const response = await this.ingress.deliver(lease.delivery.payload)
      const result = await this.applyDeliveryResponse(lease.delivery, lease.token, response)
      await this.repository.completeAttempt(attempt.id, attemptResult(response), this.now())
      return result
    } catch (error) {
      const disposition = error instanceof TrawelIngressError ? error.disposition : 'ambiguous'
      const result = disposition === 'ambiguous'
        ? await this.repository.transition(lease.delivery.id, lease.token, { state: 'RECONCILING', lastResultCode: 'AMBIGUOUS_DELIVERY_RESULT' }, this.now())
        : disposition === 'retryable'
          ? await this.repository.transition(lease.delivery.id, lease.token, { state: 'RETRYABLE', nextAttemptAt: this.retryAt(), lastResultCode: 'RETRYABLE_FAILURE' }, this.now())
          : await this.repository.transition(lease.delivery.id, lease.token, { state: 'FAILED', lastResultCode: 'PERMANENT_FAILURE' }, this.now())
      await this.repository.completeAttempt(attempt.id, {
        outcome: disposition.toUpperCase(), remoteStatusCode: null, trawelReceiptId: null,
        errorCode: disposition.toUpperCase(), errorSummary: redact(error),
      }, this.now())
      return result
    }
  }

  /** Reconciliation is explicit because Trawel has no assumed GET endpoint. */
  async reconcile(deliveryId: string): Promise<EditorialDelivery | null> {
    const now = this.now(); await this.repository.recoverExpiredLeases(now)
    const lease = await this.repository.acquireForReconciliation(deliveryId, now, this.leaseForMs)
    if (lease === null) return this.repository.findById(deliveryId)
    const attempt = await this.repository.recordAttemptStart(lease.delivery.id, this.correlationId(), now)
    try {
      const response = await this.reconciler.reconcile({ handoffKey: lease.delivery.handoffKey, payloadFingerprint: lease.delivery.payloadFingerprint })
      if (!('success' in response)) {
        if (response.status === 'NOT_FOUND') {
          const result = await this.repository.transition(lease.delivery.id, lease.token, { state: 'RETRYABLE', nextAttemptAt: this.retryAt(), lastResultCode: 'REMOTE_NOT_FOUND_SAFE_RETRY' }, this.now())
          await this.repository.completeAttempt(attempt.id, { outcome: 'RETRYABLE', remoteStatusCode: 'NOT_FOUND', trawelReceiptId: null, errorCode: null, errorSummary: null }, this.now())
          return result
        }
        throw new TrawelIngressError('ambiguous', 'Trawel reconciliation is not configured')
      }
      const result = await this.applyReconciliationResponse(lease.delivery, lease.token, response)
      await this.repository.completeAttempt(attempt.id, attemptResult(response), this.now())
      return result
    } catch (error) {
      const result = await this.repository.releaseReconciliation(lease.delivery.id, lease.token, this.retryAt(), 'RECONCILIATION_UNAVAILABLE', this.now())
      await this.repository.completeAttempt(attempt.id, { outcome: 'AMBIGUOUS', remoteStatusCode: null, trawelReceiptId: null, errorCode: 'RECONCILIATION_UNAVAILABLE', errorSummary: redact(error) }, this.now())
      return result
    }
  }

  /** A retry is explicit and is permitted only after durable retry-safe evidence. */
  async retry(deliveryId: string): Promise<EditorialDelivery | null> {
    const delivery = await this.repository.findById(deliveryId)
    if (delivery === null || delivery.state !== 'RETRYABLE') return delivery
    return this.deliver(deliveryId)
  }

  private async applyDeliveryResponse(delivery: EditorialDelivery, token: string, response: TrawelEditorialIngressResponse): Promise<EditorialDelivery> {
    if (response.success) return this.applySuccessfulRemoteStatus(delivery, token, response)
    if (response.status === 'conflict') return this.repository.transition(delivery.id, token, { state: 'CONFLICT', lastResultCode: 'CONFLICT' }, this.now())
    if (response.status === 'retryable_error') return this.repository.transition(delivery.id, token, { state: 'RETRYABLE', nextAttemptAt: this.retryAt(), lastResultCode: 'RETRYABLE_ERROR' }, this.now())
    return this.repository.transition(delivery.id, token, { state: 'FAILED', lastResultCode: response.status ?? 'FAILED' }, this.now())
  }
  private async applyReconciliationResponse(delivery: EditorialDelivery, token: string, response: TrawelEditorialIngressResponse): Promise<EditorialDelivery> {
    if (response.success) return this.applySuccessfulRemoteStatus(delivery, token, response)
    if (response.status === 'conflict') return this.repository.transition(delivery.id, token, { state: 'CONFLICT', lastResultCode: 'CONFLICT' }, this.now())
    if (response.status === 'retryable_error') return this.repository.transition(delivery.id, token, { state: 'RETRYABLE', nextAttemptAt: this.retryAt(), lastResultCode: 'RETRYABLE_ERROR' }, this.now())
    return this.repository.transition(delivery.id, token, { state: 'FAILED', lastResultCode: response.status ?? 'FAILED' }, this.now())
  }
  private confirmation(delivery: EditorialDelivery, response: TrawelEditorialIngressResponse) {
    const result = response.delivery?.result
    const profiles = [...(response.profiles_created ?? result?.profiles_created ?? [])].sort()
    if ((response.handoffKey !== undefined && response.handoffKey !== delivery.handoffKey)
      || (response.delivery?.handoffKey !== undefined && response.delivery.handoffKey !== delivery.handoffKey)
      || (response.payloadFingerprint !== undefined && response.payloadFingerprint !== delivery.payloadFingerprint)
      || (response.canonicalDestinationId !== undefined && response.canonicalDestinationId !== delivery.canonicalDestinationId)
      || (response.delivery?.canonicalDestinationId !== undefined && response.delivery.canonicalDestinationId !== delivery.canonicalDestinationId)
      || ((response.publication ?? result?.publication) !== undefined && (response.publication ?? result?.publication) !== 'draft_only')
      || (profiles.length > 0 && profiles.join(',') !== 'adventure,student')
      || ((response.editorial_content_ids ?? result?.editorial_content_ids) !== undefined && (response.editorial_content_ids ?? result?.editorial_content_ids)?.length !== 2)) {
      return { state: 'CONFLICT' as const, lastResultCode: 'RESPONSE_IDENTITY_MISMATCH' }
    }
    return { state: 'CONFIRMED' as const, lastResultCode: response.idempotent ? 'IDEMPOTENT_SUCCESS' : 'SUCCESS', trawelReceiptId: response.delivery?.id ?? response.deliveryId ?? null, confirmedAt: this.now() }
  }
  private applySuccessfulRemoteStatus(delivery: EditorialDelivery, token: string, response: TrawelEditorialIngressResponse): Promise<EditorialDelivery> {
    const status = response.delivery?.status
    if (status === undefined || status === 'accepted') return this.repository.transition(delivery.id, token, this.confirmation(delivery, response), this.now())
    if (status === 'failed') return this.repository.transition(delivery.id, token, { state: 'RETRYABLE', nextAttemptAt: this.retryAt(), lastResultCode: 'REMOTE_FAILED_RETRYABLE' }, this.now())
    if (status === 'rejected') return this.repository.transition(delivery.id, token, { state: 'FAILED', lastResultCode: 'REMOTE_REJECTED' }, this.now())
    return this.repository.transition(delivery.id, token, { state: 'RECONCILING', lastResultCode: `REMOTE_${status.toUpperCase()}` }, this.now())
  }
  private retryAt(): Date { return new Date(this.now().getTime() + this.retryDelayMs) }
}

function attemptResult(response: TrawelEditorialIngressResponse) {
  return { outcome: response.success ? (response.idempotent ? 'IDEMPOTENT_SUCCESS' : 'SUCCESS') : response.status ?? 'FAILED',
    remoteStatusCode: response.status ?? response.delivery?.status ?? null, trawelReceiptId: response.delivery?.id ?? response.deliveryId ?? null,
    errorCode: response.success ? null : response.status ?? 'FAILED', errorSummary: response.error ?? null }
}
function redact(error: unknown): string { return (error instanceof Error ? error.message : 'Unknown ingress error').replace(/[\r\n]/g, ' ').slice(0, 500) }
