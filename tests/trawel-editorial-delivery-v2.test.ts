import { describe, expect, it } from 'vitest'
import {
  DurableTrawelDeliveryService,
  MemoryEditorialDeliveryRepository,
  TrawelIngressError,
  prepareTrawelEditorialDeliveryV2,
  type TrawelIngressClient,
} from '@modules/trawel-handoff'
import { TrawelEditorialDeliveryV2PayloadSchema, type TrawelEditorialIngressResponse } from '@shared/trawel-editorial-delivery-contracts'
import { buildSyntheticApprovedSource, syntheticTrawelIds } from './support/trawel-handoff-fixture'

const mapping = {
  mappingId: syntheticTrawelIds.target,
  investighostCanonicalDestinationId: syntheticTrawelIds.destination,
  trawelEntityType: 'zone' as const,
  trawelEntityId: syntheticTrawelIds.actor,
}

function payload() {
  return prepareTrawelEditorialDeliveryV2({
    mapping,
    sources: [buildSyntheticApprovedSource('student'), buildSyntheticApprovedSource('adventure')],
  })
}

function response(value: ReturnType<typeof payload>, result: TrawelEditorialIngressResponse['result'] = 'CONFIRMED'): TrawelEditorialIngressResponse {
  return {
    result, schema: value.schema, handoffKey: value.handoffKey, payloadFingerprint: value.payloadFingerprint,
    mappingId: value.mapping.mappingId, receiptId: 'receipt-v2', rows: value.rows.map(row => ({ profile: row.profile })),
    publicationState: 'private_draft', publiclyVisible: false, serverTimestamp: '2026-09-10T12:00:00.000Z',
  }
}

class FakeIngress implements TrawelIngressClient {
  delivered: string[] = []
  constructor(private readonly post: (value: ReturnType<typeof payload>) => Promise<TrawelEditorialIngressResponse>, private readonly get: (key: string) => Promise<TrawelEditorialIngressResponse | { result: 'NOT_FOUND' }>) {}
  async deliver(value: ReturnType<typeof payload>) { this.delivered.push(value.handoffKey); return this.post(value) }
  lookup(key: string) { return this.get(key) }
}

describe('V2 durable editorial delivery', () => {
  it('has an explicit V2 contract with exactly adventure and student', () => {
    const value = payload()
    expect(TrawelEditorialDeliveryV2PayloadSchema.parse(value)).toEqual(value)
    expect(TrawelEditorialDeliveryV2PayloadSchema.safeParse({ ...value, rows: [value.rows[0], value.rows[0]] }).success).toBe(false)
  })

  it('is deterministic, but versions and mappings create a new immutable handoff identity', () => {
    const first = payload(); const equal = payload()
    const newVersion = prepareTrawelEditorialDeliveryV2({ mapping, sources: [
      buildSyntheticApprovedSource('adventure'),
      buildSyntheticApprovedSource('student', true, { title: 'Estudiante v3', content: 'Contenido de una revisión nueva.\n' }),
    ] })
    const newMapping = prepareTrawelEditorialDeliveryV2({ mapping: { ...mapping, mappingId: syntheticTrawelIds.studentVersion }, sources: [buildSyntheticApprovedSource('adventure'), buildSyntheticApprovedSource('student')] })
    expect(equal).toEqual(first)
    expect(newVersion.handoffKey).not.toBe(first.handoffKey)
    expect(newMapping.handoffKey).not.toBe(first.handoffKey)
  })

  it('persists a frozen snapshot before POST, preserves it across restart, and leases once', async () => {
    const repository = new MemoryEditorialDeliveryRepository()
    const ingress = new FakeIngress(async value => response(value), async () => ({ result: 'NOT_FOUND' }))
    const firstService = new DurableTrawelDeliveryService(repository, ingress)
    const enqueued = await firstService.enqueue(payload())
    const frozen = structuredClone(enqueued.payload)
    frozen.rows[0].content = 'Biblioteca changed afterwards\n'
    expect((await repository.findById(enqueued.id))?.payload.rows[0].content).not.toBe(frozen.rows[0].content)
    const lease = await repository.acquireForDelivery(enqueued.id, new Date(), 30_000)
    expect(lease).not.toBeNull()
    expect(await repository.acquireForDelivery(enqueued.id, new Date(), 30_000)).toBeNull()
    await repository.transition(enqueued.id, lease!.token, { state: 'RETRYABLE', nextAttemptAt: new Date(0) }, new Date())
    const restartedService = new DurableTrawelDeliveryService(repository, ingress)
    await restartedService.deliver(enqueued.id)
    expect(ingress.delivered).toEqual([enqueued.handoffKey])
    expect((await repository.findById(enqueued.id))?.state).toBe('CONFIRMED')
  })

  it('recovers an expired delivery lease through reconciliation and keeps a new revision separate', async () => {
    const repository = new MemoryEditorialDeliveryRepository(); const first = payload()
    const second = prepareTrawelEditorialDeliveryV2({ mapping, sources: [
      buildSyntheticApprovedSource('adventure'),
      buildSyntheticApprovedSource('student', true, { title: 'Estudiante v3', content: 'Contenido de una revisión nueva.\n' }),
    ] })
    const firstDelivery = await repository.enqueue(first); const secondDelivery = await repository.enqueue(second)
    expect(secondDelivery.id).not.toBe(firstDelivery.id)
    const start = new Date('2026-09-10T12:00:00.000Z')
    expect(await repository.acquireForDelivery(firstDelivery.id, start, 1)).not.toBeNull()
    await repository.recoverExpiredLeases(new Date(start.getTime() + 2))
    expect((await repository.findById(firstDelivery.id))?.state).toBe('RECONCILING')
  })

  it('moves ambiguous leases and timeouts into reconciliation, then confirms matching receipt', async () => {
    const repository = new MemoryEditorialDeliveryRepository(); const value = payload()
    const ingress = new FakeIngress(async () => { throw new TrawelIngressError('ambiguous', 'timeout') }, async () => response(value, 'NO_DUPLICATE'))
    const service = new DurableTrawelDeliveryService(repository, ingress, { retryDelayMs: 0 })
    const enqueued = await service.enqueue(value)
    await service.deliver(enqueued.id)
    expect((await repository.findById(enqueued.id))?.state).toBe('RECONCILING')
    await service.reconcile(enqueued.id)
    expect((await repository.findById(enqueued.id))?.state).toBe('CONFIRMED')
    expect((await repository.listAttempts(enqueued.id)).map(item => item.outcome)).toEqual(['AMBIGUOUS', 'NO_DUPLICATE'])
  })

  it('uses retry only after pre-persistence evidence and keeps partial delivery observable', async () => {
    const retryRepository = new MemoryEditorialDeliveryRepository(); const value = payload()
    const retryIngress = new FakeIngress(async () => { throw new TrawelIngressError('pre_persistence', 'connection rejected') }, async () => ({ result: 'NOT_FOUND' }))
    const retryService = new DurableTrawelDeliveryService(retryRepository, retryIngress, { retryDelayMs: 0 })
    const retryDelivery = await retryService.enqueue(value); await retryService.deliver(retryDelivery.id)
    expect((await retryRepository.findById(retryDelivery.id))?.state).toBe('RETRYABLE')

    const partialRepository = new MemoryEditorialDeliveryRepository()
    const partialService = new DurableTrawelDeliveryService(partialRepository, new FakeIngress(async item => response(item, 'PARTIAL'), async () => response(value, 'PARTIAL')))
    const partialDelivery = await partialService.enqueue(value); await partialService.deliver(partialDelivery.id)
    expect((await partialRepository.findById(partialDelivery.id))?.state).toBe('RECONCILING')
  })

  it('makes incompatible confirmation a terminal conflict and validation terminal failed', async () => {
    const conflictRepo = new MemoryEditorialDeliveryRepository(); const value = payload()
    const conflict = response(value); conflict.payloadFingerprint = 'f'.repeat(64)
    const conflictService = new DurableTrawelDeliveryService(conflictRepo, new FakeIngress(async () => conflict, async () => ({ result: 'NOT_FOUND' })))
    const conflictDelivery = await conflictService.enqueue(value); await conflictService.deliver(conflictDelivery.id)
    expect((await conflictRepo.findById(conflictDelivery.id))?.state).toBe('CONFLICT')

    const failedRepo = new MemoryEditorialDeliveryRepository()
    const failedService = new DurableTrawelDeliveryService(failedRepo, new FakeIngress(async item => response(item, 'VALIDATION_ERROR'), async () => ({ result: 'NOT_FOUND' })))
    const failedDelivery = await failedService.enqueue(value); await failedService.deliver(failedDelivery.id)
    expect((await failedRepo.findById(failedDelivery.id))?.state).toBe('FAILED')
  })
})
