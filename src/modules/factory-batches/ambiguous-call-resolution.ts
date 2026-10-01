import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BatchAmbiguousCallResolutionSchema,
  type BatchAmbiguousCallResolution,
  type DestinationBatchJob,
} from '@shared/factory-batch-contracts'
import { SupabaseDestinationBatchRepository } from './supabase-repository'

export type BatchAmbiguousCallResolutionResult = {
  resolutionId: string
  job: DestinationBatchJob
}

/** Batch adapter over the existing append-only ambiguous-call ledger. The
 * provider boundary remains untouched; this only records an explicit human
 * decision about a call whose response was not persisted. */
export class BatchAmbiguousCallResolutionService {
  constructor(private readonly client: SupabaseClient, private readonly actorId: string) {}

  async resolve(candidate: unknown): Promise<BatchAmbiguousCallResolutionResult> {
    const input = BatchAmbiguousCallResolutionSchema.parse(candidate)
    const repository = new SupabaseDestinationBatchRepository(this.client)
    const job = await repository.getJob(input.jobId)
    if (!job) throw new BatchAmbiguousCallResolutionError('JOB_NOT_FOUND', 'El trabajo batch no existe')

    const { data: execution, error: executionError } = await this.client
      .from('real_editorial_executions').select('id').eq('owner_type', 'BATCH_JOB').eq('owner_id', job.id).maybeSingle()
    if (executionError || !execution) throw new BatchAmbiguousCallResolutionError('EXECUTION_NOT_FOUND', 'No existe la ejecución durable del trabajo')
    const { data: ambiguity, error: ambiguityError } = await this.client
      .from('real_editorial_ambiguous_calls').select('call_id,reservation_id').eq('execution_owner_id', execution.id)
      .eq('call_id', input.providerCallId).eq('reservation_id', input.reservationId)
      .is('resolved_at', null).order('opened_at', { ascending: true }).limit(1).maybeSingle()
    if (ambiguityError || !ambiguity) throw new BatchAmbiguousCallResolutionError('AMBIGUITY_CHANGED', 'La llamada ambigua seleccionada ya no está pendiente para este trabajo')
    if (!matchesSelectedBatchAmbiguity(input, ambiguity)) {
      throw new BatchAmbiguousCallResolutionError('AMBIGUITY_CHANGED', 'La llamada ambigua seleccionada ya no coincide con la reserva pendiente')
    }

    const decision = input.decision === 'CONSUMPTION_CONFIRMED'
      ? 'consumption_confirmed'
      : input.decision === 'NO_CONSUMPTION' ? 'no_consumption' : 'indeterminate'
    const resolutionKey = createHash('sha256').update(JSON.stringify({
      executionOwnerId: execution.id, reservationId: ambiguity.reservation_id, callId: ambiguity.call_id, actorId: this.actorId,
      decision, responseRecovered: input.responseRecovered, evidence: input.evidence ?? null, note: input.note ?? null,
    })).digest('hex')
    const { data, error } = await this.client.rpc('resolve_generic_real_editorial_ambiguous_call', {
      p_resolution_key: resolutionKey,
      p_execution_owner_id: execution.id,
      p_call_id: ambiguity.call_id,
      p_actor_id: this.actorId,
      p_decision: decision,
      p_response_recovered: input.responseRecovered,
      p_external_usage_evidence: input.evidence ?? null,
      p_note: input.note ?? null,
    })
    if (error || typeof data !== 'string') {
      throw new BatchAmbiguousCallResolutionError('AMBIGUITY_RESOLUTION_FAILED', sanitize(error?.message ?? 'La resolución no devolvió identidad durable'))
    }
    const updated = await repository.getJob(job.id)
    if (!updated) throw new BatchAmbiguousCallResolutionError('JOB_NOT_FOUND', 'El trabajo dejó de existir tras la resolución')
    return { resolutionId: data, job: updated }
  }
}

export class BatchAmbiguousCallResolutionError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'BatchAmbiguousCallResolutionError' }
}

function sanitize(value: string): string {
  return value.replace(/(?:authorization|api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, 'credential=[REDACTED]').slice(0, 1000)
}

export function isAmbiguousBatchCallResolution(candidate: unknown): candidate is BatchAmbiguousCallResolution {
  return BatchAmbiguousCallResolutionSchema.safeParse(candidate).success
}

/** The renderer selects one current durable ambiguity.  Verify both stable
 * identities again in main before an irreversible human decision is written. */
export function matchesSelectedBatchAmbiguity(
  input: Pick<BatchAmbiguousCallResolution, 'reservationId' | 'providerCallId'>,
  ambiguity: { reservation_id: string; call_id: string },
): boolean {
  return ambiguity.call_id === input.providerCallId && ambiguity.reservation_id === input.reservationId
}
