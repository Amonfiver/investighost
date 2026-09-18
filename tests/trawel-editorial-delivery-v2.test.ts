import { describe, expect, it, vi } from 'vitest'
import {
  DurableTrawelDeliveryService,
  ExplicitTrawelDeliveryRuntime,
  HttpTrawelIngressClient,
  HttpTrawelDeliveryReconciler,
  MemoryEditorialDeliveryRepository,
  TrawelEditorialProjectionError,
  TrawelIngressError,
  prepareTrawelEditorialDeliveryV2,
  parseTrawelIngressConfig,
  projectLibraryEntryToTrawelEditorialProfile,
  PublicSafeContentError,
  type TrawelDeliveryReconciler,
  type TrawelIngressClient,
} from '@modules/trawel-handoff'
import { TrawelEditorialDeliveryV2PayloadSchema, TrawelEditorialIngressResponseSchema, type TrawelEditorialIngressResponse } from '@shared/trawel-editorial-delivery-contracts'
import { emptyDestinationVisualContract, projectDestinationVisualsForTrawel } from '@shared/destination-visual-contract'
import { buildSyntheticApprovedSource, syntheticTrawelIds } from './support/trawel-handoff-fixture'

const target = {
  sourceMappingId: 'zone:espana:albarracin',
  canonicalDestinationId: 'investighost:zone:espana:albarracin',
  entityType: 'zone' as const,
  entitySlug: 'albarracin',
  countrySlug: 'espana',
  zoneSlug: 'albarracin',
}

const content = {
  adventure: `## [intro] Introducción
Llegada prudente a la zona.
## [overview] Contexto
La lectura se apoya en evidencia revisada.
## [highlights] Destacados
- Murallas y paisaje
- Senderos documentados
## [route] Ruta sugerida
Recorrido principal descrito por las fuentes.
## [practical] Consejos prácticos
- Confirmar horarios
- Llevar agua
## [risks] Riesgos
Las condiciones requieren comprobación.
`,
  student: `## [intro] Introducción
Contexto útil para una estancia de estudio.
## [overview] Contexto
La información distingue datos y verificaciones pendientes.
## [budget] Presupuesto
Los costes deben confirmarse antes de reservar.
## [daily_life] Vida diaria
Los servicios se contrastan con fuentes públicas.
## [study] Estudio
La planificación depende de la oferta confirmada.
## [practical] Consejos prácticos
- Confirmar transporte
- Revisar alojamiento
## [risks] Riesgos
No asumir disponibilidad estacional.
`,
}

function source(profile: 'adventure' | 'student', replacement = content[profile]) {
  return buildSyntheticApprovedSource(profile, true, { title: `${profile} estructurado`, content: replacement })
}
function payload() {
  return prepareTrawelEditorialDeliveryV2({ target, sources: [source('student'), source('adventure')] })
}
function response(value: ReturnType<typeof payload>, overrides: Partial<TrawelEditorialIngressResponse> = {}): TrawelEditorialIngressResponse {
  return {
    success: true, idempotent: false, status: 'accepted', delivery: { id: syntheticTrawelIds.target, status: 'accepted' },
    handoffKey: value.handoffKey, payloadFingerprint: value.payloadFingerprint,
    mappingId: syntheticTrawelIds.actor, canonicalDestinationId: value.canonicalDestinationId,
    profiles_created: ['adventure', 'student'], editorial_content_ids: [syntheticTrawelIds.adventureEntry, syntheticTrawelIds.studentEntry],
    publication: 'draft_only', ...overrides,
  }
}

class FakeIngress implements TrawelIngressClient {
  delivered: string[] = []
  constructor(private readonly post: (value: ReturnType<typeof payload>) => Promise<TrawelEditorialIngressResponse>) {}
  async deliver(value: ReturnType<typeof payload>) { this.delivered.push(value.handoffKey); return this.post(value) }
}

describe('Trawel V2 structured projection and durable delivery', () => {
  it('projects deterministic adventure and student profiles with only public traceability', () => {
    const adventure = projectLibraryEntryToTrawelEditorialProfile(source('adventure'), target)
    const student = projectLibraryEntryToTrawelEditorialProfile(source('student'), target)
    expect(adventure.headline).toBe('adventure estructurado')
    expect(adventure.intro).toBe('Llegada prudente a la zona.')
    expect(adventure.highlights).toEqual(['Murallas y paisaje', 'Senderos documentados'])
    expect(adventure.suggestedRoute).toContain('Recorrido principal')
    expect(student.practicalTips).toEqual(['Confirmar transporte', 'Revisar alojamiento'])
    expect(adventure.sources).toEqual([{
      sourceId: 'source-sintetica', title: 'Fuente pública sintética', url: 'https://example.test/fuente-sintetica',
      publisher: 'Editorial Sintética', publishedAt: '2026-01-01T00:00:00.000Z', contentHash: '4'.repeat(64),
    }])
    expect(adventure.metadata.investighost).toMatchObject({
      profile: 'adventure', libraryEntryId: syntheticTrawelIds.adventureEntry,
      currentApproved: expect.objectContaining({ versionId: syntheticTrawelIds.studentVersion }),
    })
    expect(JSON.stringify(adventure.metadata)).not.toContain('Captura interna')
    expect(JSON.stringify(adventure.metadata)).not.toContain('finalRunCostEur')
    expect(JSON.stringify(adventure.metadata)).not.toContain('gap-sintetico')
    expect(JSON.stringify(adventure.metadata)).not.toContain('Contradicción sintética')
    expect(JSON.stringify(adventure.sources)).not.toContain('Captura interna')
    expect(JSON.stringify(adventure.sources)).not.toContain('finalRunCostEur')
  })

  it('accepts only the exact Student alias Introducción for intro', () => {
    const aliased = content.student.replace('## [intro] Introducción', '## Introducción')
    expect(projectLibraryEntryToTrawelEditorialProfile(source('student', aliased), target).intro)
      .toBe('Contexto útil para una estancia de estudio.')
    for (const heading of ['Intro general', 'Presentación', 'Introduccion larga', 'Introducción y contexto', 'Acerca de']) {
      expect(() => projectLibraryEntryToTrawelEditorialProfile(
        source('student', content.student.replace('## [intro] Introducción', `## ${heading}`)), target,
      )).toThrow(TrawelEditorialProjectionError)
    }
  })

  it('does not create aliases for Student daily_life/practical or Adventure risks', () => {
    expect(() => projectLibraryEntryToTrawelEditorialProfile(source(
      'student', content.student.replace('## [daily_life] Vida diaria', '## Población, economía y vida cotidiana'),
    ), target)).toThrow(TrawelEditorialProjectionError)
    expect(() => projectLibraryEntryToTrawelEditorialProfile(source(
      'student', content.student.replace('## [practical] Consejos prácticos', '## Acceso y gestión del turismo'),
    ), target)).toThrow(TrawelEditorialProjectionError)
    expect(() => projectLibraryEntryToTrawelEditorialProfile(source(
      'adventure', content.adventure.replace('## [risks] Riesgos', '## No confundas los dos Guadalaviar'),
    ), target)).toThrow(TrawelEditorialProjectionError)
  })

  it('projects ordered durable sources without a Markdown sources block and rejects their absence', () => {
    const adventure = source('adventure')
    const original = adventure.entry.sources[0]!
    adventure.entry.sources = [
      { ...original, id: 'source-zeta', url: 'https://example.test/zeta', normalizedUrl: 'https://example.test/zeta' },
      { ...original, id: 'source-alpha', url: 'https://example.test/alpha', normalizedUrl: 'https://example.test/alpha' },
    ]
    const projected = projectLibraryEntryToTrawelEditorialProfile(adventure, target)
    expect(projected.sources.map(item => item.sourceId)).toEqual(['source-alpha', 'source-zeta'])
    expect(projected.metadata.investighost).not.toHaveProperty('sourceReferences')
    expect(projected.metadata.investighost).not.toHaveProperty('gaps')
    expect(projected.metadata.investighost).not.toHaveProperty('contradictions')

    const withoutSources = source('student')
    withoutSources.entry.sources = []
    expect(() => projectLibraryEntryToTrawelEditorialProfile(withoutSources, target))
      .toThrow(/Faltan fuentes durables/)
  })

  it('keeps Albarracín-like free-form headings fail-closed after Pack A', () => {
    const adventureOrigin = `Introducción narrativa sin etiqueta\n## Una primera jornada entre murallas y edificios históricos\nContenido aprobado.\n`
    const studentOrigin = `## Introducción\nContexto aprobado.\n## Una historia de larga duración\nContenido aprobado.\n`
    expect(() => projectLibraryEntryToTrawelEditorialProfile(source('adventure', adventureOrigin), target))
      .toThrow(TrawelEditorialProjectionError)
    expect(() => projectLibraryEntryToTrawelEditorialProfile(source('student', studentOrigin), target))
      .toThrow(TrawelEditorialProjectionError)
  })

  it('fails closed for absent or ambiguous required Markdown blocks', () => {
    expect(() => projectLibraryEntryToTrawelEditorialProfile(source('adventure', content.adventure.replace('## [route] Ruta sugerida\nRecorrido principal descrito por las fuentes.\n', '')), target)).toThrow(TrawelEditorialProjectionError)
    expect(() => projectLibraryEntryToTrawelEditorialProfile(source('student', `${content.student}\n## [practical] Duplicada\n- No válida\n`), target)).toThrow(TrawelEditorialProjectionError)
  })

  it('blocks internal editorial markers and visible escaped Markdown before V2 projection', () => {
    for (const forbidden of ['(c11)', 'g7', 'El expediente no acredita esta visita.', 'claimId: c3', 'texto \\*\\*destacado\\*\\*']) {
      expect(() => projectLibraryEntryToTrawelEditorialProfile(
        source('adventure', content.adventure.replace('Llegada prudente a la zona.', forbidden)), target,
      )).toThrow(PublicSafeContentError)
    }
  })

  it('preserves valid Markdown while rejecting only visibly escaped Markdown', () => {
    const validMarkdown = content.adventure.replace('Llegada prudente a la zona.', '**Llegada prudente** a la zona.')
    expect(projectLibraryEntryToTrawelEditorialProfile(source('adventure', validMarkdown), target).intro)
      .toBe('**Llegada prudente** a la zona.')
  })

  it('constructs exact profiles payload, requires both profiles, and fingerprints final wire content', () => {
    const value = payload(); const equal = payload()
    expect(TrawelEditorialDeliveryV2PayloadSchema.parse(value)).toEqual(value)
    expect(value).toMatchObject({ schemaVersion: 'v2', mappingId: target.sourceMappingId, canonicalDestinationId: target.canonicalDestinationId })
    expect(Object.keys(value.profiles)).toEqual(['adventure', 'student'])
    expect(equal.payloadFingerprint).toBe(value.payloadFingerprint)
    const revised = prepareTrawelEditorialDeliveryV2({ target, sources: [source('adventure'), source('student', content.student.replace('Confirmar transporte', 'Confirmar transporte actualizado'))] })
    expect(revised.payloadFingerprint).not.toBe(value.payloadFingerprint)
    expect(TrawelEditorialDeliveryV2PayloadSchema.safeParse({ ...value, profiles: { adventure: value.profiles.adventure } }).success).toBe(false)
    expect(JSON.stringify(value)).not.toContain('TRAWEL_INTERNAL_EDITORIAL_DELIVERIES_SECRET')
  })

  it('keeps V2 text-only compatible and can carry two empty destination-level visual slots', () => {
    const textOnly = payload()
    expect(textOnly.destinationVisuals).toBeUndefined()
    const visuals = projectDestinationVisualsForTrawel(emptyDestinationVisualContract(syntheticTrawelIds.destination))
    const extended = prepareTrawelEditorialDeliveryV2({
      target, sources: [source('adventure'), source('student')], destinationVisuals: visuals,
    })
    expect(extended.destinationVisuals).toMatchObject({
      destinationId: syntheticTrawelIds.destination,
      imageSlot1: { state: 'EMPTY', imageUrl: null }, imageSlot2: { state: 'EMPTY', imageUrl: null },
    })
    expect(JSON.stringify(extended.profiles)).not.toContain('imageSlot')
  })

  it('persists an immutable snapshot and recovers an expired lease using its persisted clock', async () => {
    const repository = new MemoryEditorialDeliveryRepository(); const value = payload()
    const service = new DurableTrawelDeliveryService(repository, new FakeIngress(async item => response(item)))
    const delivery = await service.enqueue(value)
    const frozen = structuredClone(delivery.payload); frozen.profiles.adventure.intro = 'Mutated afterwards'
    expect((await repository.findById(delivery.id))?.payload.profiles.adventure.intro).not.toBe(frozen.profiles.adventure.intro)
    const first = await repository.findById(delivery.id)
    const start = new Date(first!.nextAttemptAt.getTime() + 1)
    expect(await repository.acquireForDelivery(delivery.id, start, 1)).not.toBeNull()
    await repository.recoverExpiredLeases(new Date(start.getTime() + 2))
    expect((await repository.findById(delivery.id))?.state).toBe('RECONCILING')
    const revised = await service.enqueue(prepareTrawelEditorialDeliveryV2({ target, sources: [source('adventure'), source('student', content.student.replace('Revisar alojamiento', 'Revisar alojamiento nuevo'))] }))
    expect(revised.id).not.toBe(delivery.id)
  })

  it('handles success, idempotent success, conflict, permanent error, retryable error and timeout without blind POST', async () => {
    const value = payload()
    for (const [expected, ingress] of [
      ['CONFIRMED', new FakeIngress(async item => response(item))],
      ['CONFIRMED', new FakeIngress(async item => response(item, { idempotent: true }))],
      ['CONFLICT', new FakeIngress(async () => response(value, { success: false, status: 'conflict' }))],
      ['FAILED', new FakeIngress(async () => response(value, { success: false, status: 'validation_error' }))],
      ['RETRYABLE', new FakeIngress(async () => { throw new TrawelIngressError('retryable', 'rate limited') })],
      ['RECONCILING', new FakeIngress(async () => { throw new TrawelIngressError('ambiguous', 'timeout') })],
    ] as const) {
      const repository = new MemoryEditorialDeliveryRepository()
      const service = new DurableTrawelDeliveryService(repository, ingress, { retryDelayMs: 0 })
      const delivery = await service.enqueue(value); await service.deliver(delivery.id)
      expect((await repository.findById(delivery.id))?.state).toBe(expected)
    }
  })

  it('uses only an explicit reconciliation abstraction', async () => {
    const repository = new MemoryEditorialDeliveryRepository(); const value = payload()
    const ingress = new FakeIngress(async () => { throw new TrawelIngressError('ambiguous', 'timeout') })
    const reconciler: TrawelDeliveryReconciler = { reconcile: async () => response(value, { idempotent: true }) }
    const service = new DurableTrawelDeliveryService(repository, ingress, { retryDelayMs: 0 }, reconciler)
    const delivery = await service.enqueue(value); await service.deliver(delivery.id); await service.reconcile(delivery.id)
    expect((await repository.findById(delivery.id))?.state).toBe('CONFIRMED')
  })

  it('accepts the deployed nested delivery response and authenticates GET reconciliation', async () => {
    const value = payload()
    const deployedResponse = {
      success: true,
      idempotent: false,
      delivery: {
        id: syntheticTrawelIds.target,
        handoffKey: value.handoffKey,
        canonicalDestinationId: value.canonicalDestinationId,
        mappingId: value.mappingId,
        status: 'accepted',
        result: {
          editorial_content_ids: [syntheticTrawelIds.adventureEntry, syntheticTrawelIds.studentEntry],
          profiles_created: ['adventure', 'student'], publication: 'draft_only',
        },
      },
    }
    const get = vi.fn(async () => new Response(JSON.stringify(deployedResponse), { status: 200 }))
    const reconciler = new HttpTrawelDeliveryReconciler({ url: 'http://localhost/edge', internalSecret: 'test-secret', allowInsecureForTests: true, fetchFn: get })
    expect(await reconciler.reconcile({ handoffKey: value.handoffKey, payloadFingerprint: value.payloadFingerprint })).toMatchObject({ success: true })
    expect(get.mock.calls[0]?.[0]).toBe(`http://localhost/edge/${value.handoffKey}`)
    expect(get.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-internal-editorial-secret': 'test-secret' })
    const repository = new MemoryEditorialDeliveryRepository()
    const service = new DurableTrawelDeliveryService(repository, new FakeIngress(async () => TrawelEditorialIngressResponseSchema.parse(deployedResponse)))
    const delivery = await service.enqueue(value); await service.deliver(delivery.id)
    expect((await repository.findById(delivery.id))?.state).toBe('CONFIRMED')
  })

  it('runs a dry run through the Library port without enqueueing or POSTing', async () => {
    const ingress = new FakeIngress(async item => response(item))
    const service = new DurableTrawelDeliveryService(new MemoryEditorialDeliveryRepository(), ingress)
    const runtime = new ExplicitTrawelDeliveryRuntime({
      loadApprovedPair: async () => [source('adventure'), source('student')],
    }, service)
    const dryRun = await runtime.dryRun({ target, adventureLibraryEntryId: syntheticTrawelIds.adventureEntry, studentLibraryEntryId: syntheticTrawelIds.studentEntry })
    expect(dryRun).toMatchObject({ sourceMappingId: target.sourceMappingId, canonicalDestinationId: target.canonicalDestinationId })
    expect(dryRun.profiles).toHaveLength(2)
    expect(ingress.delivered).toEqual([])
  })

  it('sends the internal header but never logs the secret, and classifies HTTP outcomes', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(response(payload())), { status: 200 }))
    const secret = 'secret-only-for-test'
    expect(parseTrawelIngressConfig({ TRAWEL_INTERNAL_EDITORIAL_DELIVERIES_URL: 'https://example.test/function', TRAWEL_INTERNAL_EDITORIAL_DELIVERIES_SECRET: secret })).toEqual({ url: 'https://example.test/function', internalSecret: secret })
    expect(() => parseTrawelIngressConfig({})).toThrow('TRAWEL_INGRESS_CONFIG_MISSING')
    const client = new HttpTrawelIngressClient({ url: 'http://localhost/edge', internalSecret: secret, allowInsecureForTests: true, fetchFn })
    await client.deliver(payload())
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-internal-editorial-secret': secret, 'content-type': 'application/json' })
    await expect(new HttpTrawelIngressClient({ url: 'http://localhost/edge', internalSecret: secret, allowInsecureForTests: true, fetchFn: async () => new Response('', { status: 401 }) }).deliver(payload())).rejects.toMatchObject({ disposition: 'permanent' })
    await expect(new HttpTrawelIngressClient({ url: 'http://localhost/edge', internalSecret: secret, allowInsecureForTests: true, fetchFn: async () => new Response('', { status: 429 }) }).deliver(payload())).rejects.toMatchObject({ disposition: 'retryable' })
    await expect(new HttpTrawelIngressClient({ url: 'http://localhost/edge', internalSecret: secret, allowInsecureForTests: true, fetchFn: async () => { throw new DOMException('aborted', 'AbortError') } }).deliver(payload())).rejects.toMatchObject({ disposition: 'ambiguous' })
  })
})
