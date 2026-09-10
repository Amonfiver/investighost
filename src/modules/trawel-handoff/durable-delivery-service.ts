import { randomUUID } from 'node:crypto'
import type { TrawelEditorialDeliveryV2Payload, TrawelEditorialIngressResponse } from '@shared/trawel-editorial-delivery-contracts'
import { assertTrawelEditorialDeliveryV2Integrity } from './delivery-v2-adapter'
import type { EditorialDelivery, EditorialDeliveryRepository } from './delivery-repository'
import { TrawelIngressError, type TrawelIngressClient } from './trawel-ingress-client'

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
      const ambiguous = !(error instanceof TrawelIngressError) || error.disposition === 'ambiguous'
      const result = ambiguous
        ? await this.repository.transition(lease.delivery.id, lease.token, { state: 'RECONCILING', lastResultCode: 'AMBIGUOUS_DELIVERY_RESULT' }, this.now())
        : await this.repository.transition(lease.delivery.id, lease.token, { state: 'RETRYABLE', nextAttemptAt: this.retryAt(), lastResultCode: 'PRE_PERSISTENCE_ERROR' }, this.now())
      await this.repository.completeAttempt(attempt.id, {
        outcome: ambiguous ? 'AMBIGUOUS' : 'RETRYABLE', remoteStatusCode: null, trawelReceiptId: null,
        errorCode: ambiguous ? 'AMBIGUOUS_DELIVERY_RESULT' : 'PRE_PERSISTENCE_ERROR', errorSummary: redact(error),
      }, this.now())
      return result
    }
  }

  /** Reconciliation is the only path out of an ambiguous lease/timeout before another POST. */
  async reconcile(deliveryId: string): Promise<EditorialDelivery | null> {
    const now = this.now(); await this.repository.recoverExpiredLeases(now)
    const lease = await this.repository.acquireForReconciliation(deliveryId, now, this.leaseForMs)
    if (lease === null) return this.repository.findById(deliveryId)
    const attempt = await this.repository.recordAttemptStart(lease.delivery.id, this.correlationId(), now)
    try {
      const response = await this.ingress.lookup(lease.delivery.handoffKey)
      if (response.result === 'NOT_FOUND') {
        const result = await this.repository.transition(lease.delivery.id, lease.token, { state: 'RETRYABLE', nextAttemptAt: this.retryAt(), lastResultCode: 'REMOTE_NOT_FOUND_SAFE_RETRY' }, this.now())
        await this.repository.completeAttempt(attempt.id, { outcome: 'RETRYABLE', remoteStatusCode: null, trawelReceiptId: null, errorCode: null, errorSummary: null }, this.now())
        return result
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
    if (response.result === 'CONFIRMED' || response.result === 'NO_DUPLICATE') {
      return this.repository.transition(delivery.id, token, this.confirmation(delivery, response), this.now())
    }
    if (response.result === 'CONFLICT') return this.repository.transition(delivery.id, token, { state: 'CONFLICT', lastResultCode: 'CONFLICT' }, this.now())
    if (response.result === 'VALIDATION_ERROR') return this.repository.transition(delivery.id, token, { state: 'FAILED', lastResultCode: 'VALIDATION_ERROR' }, this.now())
    if (response.result === 'RETRYABLE_ERROR') return this.repository.transition(delivery.id, token, { state: 'RETRYABLE', nextAttemptAt: this.retryAt(), lastResultCode: 'RETRYABLE_ERROR' }, this.now())
    return this.repository.transition(delivery.id, token, { state: 'RECONCILING', lastResultCode: 'PARTIAL' }, this.now())
  }
  private async applyReconciliationResponse(delivery: EditorialDelivery, token: string, response: TrawelEditorialIngressResponse): Promise<EditorialDelivery> {
    if (response.result === 'CONFIRMED' || response.result === 'NO_DUPLICATE') return this.repository.transition(delivery.id, token, this.confirmation(delivery, response), this.now())
    if (response.result === 'CONFLICT') return this.repository.transition(delivery.id, token, { state: 'CONFLICT', lastResultCode: 'CONFLICT' }, this.now())
    if (response.result === 'VALIDATION_ERROR') return this.repository.transition(delivery.id, token, { state: 'FAILED', lastResultCode: 'VALIDATION_ERROR' }, this.now())
    if (response.result === 'RETRYABLE_ERROR') return this.repository.transition(delivery.id, token, { state: 'RETRYABLE', nextAttemptAt: this.retryAt(), lastResultCode: 'RETRYABLE_ERROR' }, this.now())
    return this.repository.releaseReconciliation(delivery.id, token, this.retryAt(), 'PARTIAL', this.now())
  }
  private confirmation(delivery: EditorialDelivery, response: TrawelEditorialIngressResponse) {
    const profiles = response.rows.map(row => row.profile).sort()
    const expectedProfiles = delivery.payload.rows.map(row => row.profile).sort()
    if (response.handoffKey !== delivery.handoffKey || response.payloadFingerprint !== delivery.payloadFingerprint
      || response.mappingId !== delivery.destinationMappingId || response.publiclyVisible || response.publicationState !== 'private_draft'
      || profiles.join(',') !== expectedProfiles.join(',')) {
      return { state: 'CONFLICT' as const, lastResultCode: 'RESPONSE_IDENTITY_MISMATCH' }
    }
    return { state: 'CONFIRMED' as const, lastResultCode: response.result, trawelReceiptId: response.receiptId, confirmedAt: this.now() }
  }
  private retryAt(): Date { return new Date(this.now().getTime() + this.retryDelayMs) }
}

function attemptResult(response: TrawelEditorialIngressResponse) {
  return { outcome: response.result, remoteStatusCode: response.result, trawelReceiptId: response.receiptId,
    errorCode: response.result === 'RETRYABLE_ERROR' || response.result === 'VALIDATION_ERROR' ? response.result : null, errorSummary: null }
}
function redact(error: unknown): string { return (error instanceof Error ? error.message : 'Unknown ingress error').replace(/[\r\n]/g, ' ').slice(0, 500) }
