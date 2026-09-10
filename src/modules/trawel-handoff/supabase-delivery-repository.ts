import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrawelEditorialDeliveryState, TrawelEditorialDeliveryV2Payload } from '@shared/trawel-editorial-delivery-contracts'
import type {
  DeliveryLease, DeliveryStateUpdate, EditorialDelivery, EditorialDeliveryAttempt, EditorialDeliveryRepository,
} from './delivery-repository'

const TABLE = 'real_editorial_trawel_deliveries'

/** Supabase implementation uses local migration RPCs for atomic enqueue/lease/transition. */
export class SupabaseEditorialDeliveryRepository implements EditorialDeliveryRepository {
  constructor(private readonly client: Pick<SupabaseClient, 'from' | 'rpc'>) {}

  async enqueue(payload: TrawelEditorialDeliveryV2Payload): Promise<EditorialDelivery> {
    const { data, error } = await this.client.rpc('real_editorial_enqueue_trawel_delivery', { p_payload: payload })
    if (error) throw repositoryError('DELIVERY_ENQUEUE_FAILED', error)
    return parseDelivery(single(data))
  }
  async findById(id: string): Promise<EditorialDelivery | null> {
    const { data, error } = await this.client.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) throw repositoryError('DELIVERY_LOOKUP_FAILED', error)
    return data === null ? null : parseDelivery(data)
  }
  async findByHandoffKey(handoffKey: string): Promise<EditorialDelivery | null> {
    const { data, error } = await this.client.from(TABLE).select('*').eq('handoff_key', handoffKey).maybeSingle()
    if (error) throw repositoryError('DELIVERY_LOOKUP_FAILED', error)
    return data === null ? null : parseDelivery(data)
  }
  async listByState(state: TrawelEditorialDeliveryState): Promise<EditorialDelivery[]> {
    const { data, error } = await this.client.from(TABLE).select('*').eq('state', state).order('next_attempt_at')
    if (error) throw repositoryError('DELIVERY_LOOKUP_FAILED', error)
    return (data ?? []).map(parseDelivery)
  }
  async acquireForDelivery(id: string, now: Date, leaseForMs: number): Promise<DeliveryLease | null> {
    return this.acquire(id, 'delivery', now, leaseForMs)
  }
  async acquireForReconciliation(id: string, now: Date, leaseForMs: number): Promise<DeliveryLease | null> {
    return this.acquire(id, 'reconciliation', now, leaseForMs)
  }
  private async acquire(id: string, mode: 'delivery' | 'reconciliation', now: Date, leaseForMs: number): Promise<DeliveryLease | null> {
    const { data, error } = await this.client.rpc('real_editorial_acquire_trawel_delivery', {
      p_delivery_id: id, p_mode: mode, p_now: now.toISOString(), p_lease_ms: leaseForMs,
    })
    if (error) throw repositoryError('DELIVERY_LEASE_FAILED', error)
    if (data === null) return null
    const row = single(data); const delivery = parseDelivery(row)
    if (delivery.leaseToken === null) throw new Error('DELIVERY_LEASE_TOKEN_MISSING')
    return { delivery, token: delivery.leaseToken }
  }
  async recoverExpiredLeases(now: Date): Promise<number> {
    const { data, error } = await this.client.rpc('real_editorial_recover_expired_trawel_delivery_leases', { p_now: now.toISOString() })
    if (error) throw repositoryError('DELIVERY_RECOVERY_FAILED', error)
    return Number(data ?? 0)
  }
  async recordAttemptStart(deliveryId: string, correlationId: string, now: Date): Promise<EditorialDeliveryAttempt> {
    const { data, error } = await this.client.rpc('real_editorial_start_trawel_delivery_attempt', {
      p_delivery_id: deliveryId, p_correlation_id: correlationId, p_started_at: now.toISOString(),
    })
    if (error) throw repositoryError('DELIVERY_ATTEMPT_START_FAILED', error)
    return parseAttempt(single(data))
  }
  async completeAttempt(id: string, result: Omit<EditorialDeliveryAttempt, 'id' | 'deliveryId' | 'attemptNumber' | 'startedAt' | 'completedAt' | 'correlationId'>, now: Date): Promise<void> {
    const { error } = await this.client.from('real_editorial_trawel_delivery_attempts').update({
      completed_at: now.toISOString(), outcome: result.outcome, remote_status_code: result.remoteStatusCode,
      trawel_receipt_id: result.trawelReceiptId, error_code: result.errorCode, error_summary: result.errorSummary,
    }).eq('id', id).is('completed_at', null)
    if (error) throw repositoryError('DELIVERY_ATTEMPT_COMPLETE_FAILED', error)
  }
  async transition(id: string, token: string, update: DeliveryStateUpdate, now: Date): Promise<EditorialDelivery> {
    const { data, error } = await this.client.rpc('real_editorial_transition_trawel_delivery', {
      p_delivery_id: id, p_lease_token: token, p_state: update.state,
      p_next_attempt_at: update.nextAttemptAt?.toISOString() ?? null, p_last_result_code: update.lastResultCode ?? null,
      p_trawel_receipt_id: update.trawelReceiptId ?? null, p_confirmed_at: update.confirmedAt?.toISOString() ?? null,
      p_now: now.toISOString(),
    })
    if (error) throw repositoryError('DELIVERY_TRANSITION_FAILED', error)
    return parseDelivery(single(data))
  }
  async releaseReconciliation(id: string, token: string, nextAttemptAt: Date, resultCode: string, now: Date): Promise<EditorialDelivery> {
    const { data, error } = await this.client.rpc('real_editorial_release_trawel_reconciliation', {
      p_delivery_id: id, p_lease_token: token, p_next_attempt_at: nextAttemptAt.toISOString(),
      p_result_code: resultCode, p_now: now.toISOString(),
    })
    if (error) throw repositoryError('DELIVERY_RECONCILIATION_RELEASE_FAILED', error)
    return parseDelivery(single(data))
  }
  async listAttempts(deliveryId: string): Promise<EditorialDeliveryAttempt[]> {
    const { data, error } = await this.client.from('real_editorial_trawel_delivery_attempts').select('*')
      .eq('delivery_id', deliveryId).order('attempt_number')
    if (error) throw repositoryError('DELIVERY_ATTEMPT_LOOKUP_FAILED', error)
    return (data ?? []).map(parseAttempt)
  }
}

function single(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value
  if (row === null || typeof row !== 'object') throw new Error('DELIVERY_RPC_RESULT_INVALID')
  return row as Record<string, unknown>
}
function parseDelivery(row: Record<string, unknown>): EditorialDelivery {
  return {
    id: text(row.id), protocolSchema: text(row.protocol_schema), handoffKey: text(row.handoff_key), payloadFingerprint: text(row.payload_fingerprint),
    destinationMappingId: text(row.destination_mapping_id), investighostCanonicalDestinationId: text(row.investighost_canonical_destination_id),
    targetSnapshot: object(row.target_snapshot), payload: row.payload as TrawelEditorialDeliveryV2Payload,
    sources: [], state: row.state as TrawelEditorialDeliveryState, attemptCount: Number(row.attempt_count), nextAttemptAt: date(row.next_attempt_at),
    leaseExpiresAt: nullableDate(row.lease_expires_at), leaseToken: nullableText(row.lease_token), lastResultCode: nullableText(row.last_result_code),
    trawelReceiptId: nullableText(row.trawel_receipt_id), confirmedAt: nullableDate(row.confirmed_at), createdAt: date(row.created_at), updatedAt: date(row.updated_at),
  }
}
function parseAttempt(row: Record<string, unknown>): EditorialDeliveryAttempt {
  return { id: text(row.id), deliveryId: text(row.delivery_id), attemptNumber: Number(row.attempt_number), startedAt: date(row.started_at),
    completedAt: nullableDate(row.completed_at), outcome: text(row.outcome), remoteStatusCode: nullableText(row.remote_status_code),
    trawelReceiptId: nullableText(row.trawel_receipt_id), correlationId: text(row.correlation_id), errorCode: nullableText(row.error_code), errorSummary: nullableText(row.error_summary) }
}
function text(value: unknown): string { if (typeof value !== 'string') throw new Error('DELIVERY_ROW_INVALID'); return value }
function nullableText(value: unknown): string | null { return value === null || value === undefined ? null : text(value) }
function object(value: unknown): Record<string, unknown> { if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('DELIVERY_ROW_INVALID'); return value as Record<string, unknown> }
function date(value: unknown): Date { return new Date(text(value)) }
function nullableDate(value: unknown): Date | null { return value === null || value === undefined ? null : date(value) }
function repositoryError(code: string, error: { message: string }): Error { return new Error(`${code}:${error.message}`) }
