import { randomUUID } from 'node:crypto'
import {
  type TrawelEditorialDeliveryState,
  type TrawelEditorialDeliveryV2Payload,
} from '@shared/trawel-editorial-delivery-contracts'

export interface EditorialDeliverySource {
  profile: 'adventure' | 'student'
  libraryEntryId: string
  versionHash: string
  contentHash: string
  approvalReference: Record<string, unknown>
}

export interface EditorialDelivery {
  id: string
  protocolSchema: string
  handoffKey: string
  payloadFingerprint: string
  destinationMappingId: string
  investighostCanonicalDestinationId: string
  targetSnapshot: Record<string, unknown>
  /** Immutable snapshot; never rebuilt from Biblioteca during delivery/retry. */
  payload: TrawelEditorialDeliveryV2Payload
  sources: EditorialDeliverySource[]
  state: TrawelEditorialDeliveryState
  attemptCount: number
  nextAttemptAt: Date
  leaseExpiresAt: Date | null
  leaseToken: string | null
  lastResultCode: string | null
  trawelReceiptId: string | null
  confirmedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface EditorialDeliveryAttempt {
  id: string
  deliveryId: string
  attemptNumber: number
  startedAt: Date
  completedAt: Date | null
  outcome: string
  remoteStatusCode: string | null
  trawelReceiptId: string | null
  correlationId: string
  errorCode: string | null
  errorSummary: string | null
}

export interface DeliveryLease {
  delivery: EditorialDelivery
  token: string
}

export interface DeliveryStateUpdate {
  state: TrawelEditorialDeliveryState
  nextAttemptAt?: Date
  lastResultCode?: string | null
  trawelReceiptId?: string | null
  confirmedAt?: Date | null
}

export interface EditorialDeliveryRepository {
  enqueue(payload: TrawelEditorialDeliveryV2Payload): Promise<EditorialDelivery>
  findById(id: string): Promise<EditorialDelivery | null>
  findByHandoffKey(handoffKey: string): Promise<EditorialDelivery | null>
  listByState(state: TrawelEditorialDeliveryState): Promise<EditorialDelivery[]>
  acquireForDelivery(id: string, now: Date, leaseForMs: number): Promise<DeliveryLease | null>
  acquireForReconciliation(id: string, now: Date, leaseForMs: number): Promise<DeliveryLease | null>
  recoverExpiredLeases(now: Date): Promise<number>
  recordAttemptStart(deliveryId: string, correlationId: string, now: Date): Promise<EditorialDeliveryAttempt>
  completeAttempt(attemptId: string, result: Omit<EditorialDeliveryAttempt, 'id' | 'deliveryId' | 'attemptNumber' | 'startedAt' | 'completedAt' | 'correlationId'>, now: Date): Promise<void>
  transition(id: string, leaseToken: string, update: DeliveryStateUpdate, now: Date): Promise<EditorialDelivery>
  releaseReconciliation(id: string, leaseToken: string, nextAttemptAt: Date, resultCode: string, now: Date): Promise<EditorialDelivery>
  listAttempts(deliveryId: string): Promise<EditorialDeliveryAttempt[]>
}

const TRANSITIONS: Record<TrawelEditorialDeliveryState, readonly TrawelEditorialDeliveryState[]> = {
  PENDING: ['DELIVERING'],
  DELIVERING: ['CONFIRMED', 'RETRYABLE', 'RECONCILING', 'CONFLICT', 'FAILED'],
  RETRYABLE: ['DELIVERING'],
  RECONCILING: ['CONFIRMED', 'RETRYABLE', 'CONFLICT', 'RECONCILING'],
  CONFIRMED: [], CONFLICT: [], FAILED: [],
}

export function assertLegalDeliveryTransition(from: TrawelEditorialDeliveryState, to: TrawelEditorialDeliveryState): void {
  if (!TRANSITIONS[from].includes(to)) throw new Error(`ILLEGAL_DELIVERY_TRANSITION:${from}->${to}`)
}

/** Test/local double with the same immutable snapshot and lease semantics as the SQL repository. */
export class MemoryEditorialDeliveryRepository implements EditorialDeliveryRepository {
  private readonly deliveries = new Map<string, EditorialDelivery>()
  private readonly handoffKeys = new Map<string, string>()
  private readonly attempts = new Map<string, EditorialDeliveryAttempt[]>()

  async enqueue(payload: TrawelEditorialDeliveryV2Payload): Promise<EditorialDelivery> {
    const existingId = this.handoffKeys.get(payload.handoffKey)
    if (existingId) return clone(this.deliveries.get(existingId)!)
    const now = new Date()
    const delivery: EditorialDelivery = {
      id: randomUUID(), protocolSchema: payload.schema, handoffKey: payload.handoffKey,
      payloadFingerprint: payload.payloadFingerprint, destinationMappingId: payload.mapping.mappingId,
      investighostCanonicalDestinationId: payload.mapping.investighostCanonicalDestinationId,
      targetSnapshot: structuredClone(payload.mapping), payload: structuredClone(payload),
      sources: payload.rows.map(row => ({ profile: row.profile, libraryEntryId: row.libraryEntryId,
        versionHash: row.versionHash, contentHash: row.contentHash, approvalReference: structuredClone(row.approval) })),
      state: 'PENDING', attemptCount: 0, nextAttemptAt: now, leaseExpiresAt: null, leaseToken: null,
      lastResultCode: null, trawelReceiptId: null, confirmedAt: null, createdAt: now, updatedAt: now,
    }
    this.deliveries.set(delivery.id, delivery); this.handoffKeys.set(delivery.handoffKey, delivery.id)
    return clone(delivery)
  }

  async findById(id: string): Promise<EditorialDelivery | null> { return nullableClone(this.deliveries.get(id)) }
  async findByHandoffKey(key: string): Promise<EditorialDelivery | null> { return nullableClone(this.deliveries.get(this.handoffKeys.get(key) ?? '')) }
  async listByState(state: TrawelEditorialDeliveryState): Promise<EditorialDelivery[]> {
    return [...this.deliveries.values()].filter(item => item.state === state).map(clone)
  }

  acquireForDelivery(id: string, now: Date, leaseForMs: number): Promise<DeliveryLease | null> {
    return this.acquire(id, ['PENDING', 'RETRYABLE'], 'DELIVERING', now, leaseForMs)
  }
  acquireForReconciliation(id: string, now: Date, leaseForMs: number): Promise<DeliveryLease | null> {
    return this.acquire(id, ['RECONCILING'], 'RECONCILING', now, leaseForMs)
  }
  private async acquire(id: string, expected: TrawelEditorialDeliveryState[], target: TrawelEditorialDeliveryState, now: Date, leaseForMs: number): Promise<DeliveryLease | null> {
    const delivery = this.deliveries.get(id)
    if (!delivery || !expected.includes(delivery.state) || delivery.nextAttemptAt > now || delivery.leaseExpiresAt !== null) return null
    if (target !== delivery.state) assertLegalDeliveryTransition(delivery.state, target)
    delivery.state = target; delivery.leaseToken = randomUUID(); delivery.leaseExpiresAt = new Date(now.getTime() + leaseForMs); delivery.updatedAt = now
    return { delivery: clone(delivery), token: delivery.leaseToken }
  }
  async recoverExpiredLeases(now: Date): Promise<number> {
    let recovered = 0
    for (const delivery of this.deliveries.values()) {
      if (delivery.state === 'DELIVERING' && delivery.leaseExpiresAt !== null && delivery.leaseExpiresAt <= now) {
        delivery.state = 'RECONCILING'; delivery.leaseExpiresAt = null; delivery.leaseToken = null
        delivery.nextAttemptAt = now; delivery.lastResultCode = 'LEASE_EXPIRED_AMBIGUOUS'; delivery.updatedAt = now; recovered += 1
      }
    }
    return recovered
  }
  async recordAttemptStart(deliveryId: string, correlationId: string, now: Date): Promise<EditorialDeliveryAttempt> {
    const delivery = this.deliveries.get(deliveryId); if (!delivery) throw new Error('DELIVERY_NOT_FOUND')
    delivery.attemptCount += 1; delivery.updatedAt = now
    const attempt: EditorialDeliveryAttempt = { id: randomUUID(), deliveryId, attemptNumber: delivery.attemptCount,
      startedAt: now, completedAt: null, outcome: 'STARTED', remoteStatusCode: null, trawelReceiptId: null,
      correlationId, errorCode: null, errorSummary: null }
    const list = this.attempts.get(deliveryId) ?? []; list.push(attempt); this.attempts.set(deliveryId, list)
    return clone(attempt)
  }
  async completeAttempt(id: string, result: Omit<EditorialDeliveryAttempt, 'id' | 'deliveryId' | 'attemptNumber' | 'startedAt' | 'completedAt' | 'correlationId'>, now: Date): Promise<void> {
    for (const attempts of this.attempts.values()) { const attempt = attempts.find(item => item.id === id); if (attempt) { Object.assign(attempt, result, { completedAt: now }); return } }
    throw new Error('ATTEMPT_NOT_FOUND')
  }
  async transition(id: string, token: string, update: DeliveryStateUpdate, now: Date): Promise<EditorialDelivery> {
    const delivery = this.assertLease(id, token); assertLegalDeliveryTransition(delivery.state, update.state)
    Object.assign(delivery, update, { leaseToken: null, leaseExpiresAt: null, updatedAt: now })
    return clone(delivery)
  }
  async releaseReconciliation(id: string, token: string, nextAttemptAt: Date, resultCode: string, now: Date): Promise<EditorialDelivery> {
    const delivery = this.assertLease(id, token); if (delivery.state !== 'RECONCILING') throw new Error('RECONCILIATION_LEASE_REQUIRED')
    Object.assign(delivery, { leaseToken: null, leaseExpiresAt: null, nextAttemptAt, lastResultCode: resultCode, updatedAt: now })
    return clone(delivery)
  }
  async listAttempts(deliveryId: string): Promise<EditorialDeliveryAttempt[]> { return (this.attempts.get(deliveryId) ?? []).map(clone) }
  private assertLease(id: string, token: string): EditorialDelivery {
    const delivery = this.deliveries.get(id); if (!delivery || delivery.leaseToken !== token) throw new Error('DELIVERY_LEASE_LOST'); return delivery
  }
}

function clone<T>(value: T): T { return structuredClone(value) }
function nullableClone<T>(value: T | undefined): T | null { return value === undefined ? null : clone(value) }
