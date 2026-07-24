import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { GeographicResolver } from '@modules/editorial-pipeline/geography'
import { ManualResearchService } from '@modules/editorial-pipeline/manual-workflow'
import { SupabaseEditorialResearchRepository } from '@modules/editorial-pipeline/supabase-repository'
import { SupabaseGeographyCatalogRepository } from '@modules/editorial-pipeline/supabase-geography-repository'
import { createLocalSupabaseClientFromEnv } from '@services/supabase'

const integration = process.env.RUN_SUPABASE_INTEGRATION === 'true' ? describe : describe.skip

integration('Supabase local Manual workflow', () => {
  it('persists scaffold, checkpoints, aggregate, human edit and version history', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const repository = new SupabaseEditorialResearchRepository(client)
    const service = new ManualResearchService(
      repository,
      new GeographicResolver(new SupabaseGeographyCatalogRepository(client), 'geonames-2026-07-20'),
      { ownerProcess: 'manual-supabase-integration' },
    )
    let requestId: string | undefined

    try {
      const result = await service.start({
        destinationQuery: 'Morella',
        countryCode: 'ES',
        destinationType: 'locality',
        profiles: ['adventure', 'student'],
        language: 'es',
        depth: 'standard',
        notes: 'Integración Manual sintética',
        budgetLimit: 2,
        maxAttempts: 3,
        idempotencyKey: `manual-integration:${randomUUID()}`,
        actorId: '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11',
      })
      requestId = result.request.id
      expect(result.run.stage).toBe('human_review')
      expect(result.qualityChecks).toHaveLength(34)
      expect(await repository.getByRequestId(requestId)).toEqual(result)

      const adventure = result.drafts.find(item => item.draft.profile === 'adventure')
      const practical = adventure?.sections.find(section => section.kind === 'practical')
      if (!adventure || !practical) throw new Error('missing synthetic draft section')
      const edited = await service.editSection({
        requestId,
        draftId: adventure.draft.id,
        sectionId: practical.id,
        heading: practical.heading,
        content: `${practical.content} Esta edición humana exige confirmar los datos justo antes de utilizar el contenido.`,
        reason: 'Validar historial durable en integración local',
        actorId: result.request.actorId,
      })
      expect(edited.drafts.find(item => item.draft.profile === 'adventure')?.draft.contentVersion).toBe(2)
      expect((await service.listDraftVersions(requestId)).filter(item => item.profile === 'adventure')).toHaveLength(2)

      const { count: checkpointCount, error: checkpointError } = await client
        .from('stage_checkpoints')
        .select('id', { head: true, count: 'exact' })
        .eq('request_id', requestId)
      expect(checkpointError).toBeNull()
      expect(checkpointCount).toBeGreaterThanOrEqual(2)
    } finally {
      if (requestId) {
        const { error } = await client.from('editorial_research_requests').delete().eq('id', requestId)
        expect(error).toBeNull()
      }
    }
  })

  it('serializes accidental concurrent starts with one durable aggregate', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const repository = new SupabaseEditorialResearchRepository(client)
    const service = new ManualResearchService(
      repository,
      new GeographicResolver(new SupabaseGeographyCatalogRepository(client), 'geonames-2026-07-20'),
      { ownerProcess: 'manual-supabase-concurrency' },
    )
    const idempotencyKey = `manual-concurrency:${randomUUID()}`
    const candidate = {
      destinationQuery: 'Morella', countryCode: 'ES', destinationType: 'locality' as const,
      profiles: ['adventure', 'student'] as const, language: 'es', depth: 'standard' as const,
      notes: 'Concurrencia accidental sintética', budgetLimit: 2, maxAttempts: 3, idempotencyKey,
      actorId: '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11',
    }
    let requestId: string | undefined
    try {
      const settled = await Promise.allSettled([service.start(candidate), service.start(candidate)])
      const completed = settled.filter(item => item.status === 'fulfilled')
      const rejected = settled.filter(item => item.status === 'rejected')
      expect(completed).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(rejected[0]).toMatchObject({ reason: { code: 'ALREADY_RUNNING' } })
      if (completed[0].status !== 'fulfilled') throw new Error('Falta ejecución completada')
      requestId = completed[0].value.request.id
      expect(await repository.listRuns(requestId)).toHaveLength(1)
      expect(await repository.findByIdempotencyKey(idempotencyKey)).toEqual(completed[0].value)
    } finally {
      if (requestId) {
        const { error } = await client.from('editorial_research_requests').delete().eq('id', requestId)
        expect(error).toBeNull()
      }
    }
  })

  it('recovers the provider-unavailable acceptance fixture without duplicating the request', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const repository = new SupabaseEditorialResearchRepository(client)
    const service = new ManualResearchService(
      repository,
      new GeographicResolver(new SupabaseGeographyCatalogRepository(client), 'geonames-2026-07-20'),
      { ownerProcess: 'manual-supabase-acceptance-retry', retryBackoffMs: [0] },
    )
    const idempotencyKey = `manual-acceptance-retry:${randomUUID()}`
    let requestId: string | undefined
    try {
      await expect(service.start({
        destinationQuery: 'Morella', countryCode: 'ES', destinationType: 'locality',
        profiles: ['adventure', 'student'], language: 'es', depth: 'standard',
        notes: 'Fixture 3J de proveedor recuperable', budgetLimit: 2, maxAttempts: 3,
        simulationScenario: 'provider_unavailable', idempotencyKey,
        actorId: '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11',
      })).rejects.toMatchObject({ code: 'PERMANENT' })
      const scaffold = await repository.findScaffoldByIdempotencyKey(idempotencyKey)
      if (!scaffold) throw new Error('Falta scaffold fallido de aceptación')
      requestId = scaffold.request.id
      const recovered = await service.retry({ requestId, actorId: scaffold.request.actorId })
      expect(recovered.previousRuns).toHaveLength(1)
      expect(recovered.run).toMatchObject({ attempt: 2, state: 'completed' })
      expect(await repository.listRuns(requestId)).toHaveLength(2)
      expect((await repository.list()).items.filter(item => item.requestId === requestId)).toHaveLength(1)
    } finally {
      if (requestId) {
        const { error } = await client.from('editorial_research_requests').delete().eq('id', requestId)
        expect(error).toBeNull()
      }
    }
  })

  it('persists and audits J06 HTTP 404 while completing with the remaining evidence', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const repository = new SupabaseEditorialResearchRepository(client)
    const service = new ManualResearchService(
      repository,
      new GeographicResolver(new SupabaseGeographyCatalogRepository(client), 'geonames-2026-07-20'),
      { ownerProcess: 'manual-supabase-j06' },
    )
    let requestId: string | undefined

    try {
      const result = await service.start({
        destinationQuery: 'Morella', countryCode: 'ES', destinationType: 'locality',
        profiles: ['adventure', 'student'], language: 'es', depth: 'standard',
        notes: 'J06 sintético de integración', budgetLimit: 2, maxAttempts: 3,
        simulationScenario: 'broken_source', idempotencyKey: `manual-j06:${randomUUID()}`,
        actorId: '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11',
      })
      requestId = result.request.id
      expect(result).toMatchObject({
        request: { state: 'completed' },
        run: { stage: 'human_review', state: 'completed' },
      })
      expect(result.sources.map(source => source.status)).toEqual(expect.arrayContaining(['accepted', 'unavailable']))
      expect(result.facts).toHaveLength(3)
      expect(result.places).toHaveLength(1)
      expect(result.activities).toHaveLength(1)
      expect(result.drafts).toHaveLength(2)

      const { data: source, error: sourceError } = await client.from('research_sources')
        .select('id,run_id,status,metadata,captured_at')
        .eq('run_id', result.run.id).eq('status', 'unavailable').single()
      expect(sourceError).toBeNull()
      expect(source).toMatchObject({
        run_id: result.run.id,
        status: 'unavailable',
        metadata: {
          errorCode: 'HTTP_404',
          failure: {
            errorCode: 'HTTP_404',
            httpStatus: 404,
            stage: 'source_reading',
            attempt: 1,
            providerId: 'mock-source-provider',
            operation: 'reading',
            occurredAt: expect.any(String),
          },
        },
      })

      const { data: unavailableEvent, error: eventError } = await client.from('research_events')
        .select('request_id,run_id,event_type,stage,payload,occurred_at')
        .eq('request_id', requestId).eq('event_type', 'source.unavailable').single()
      expect(eventError).toBeNull()
      expect(unavailableEvent).toMatchObject({
        request_id: requestId,
        run_id: result.run.id,
        stage: 'source_reading',
        payload: {
          sourceId: source?.id,
          errorCode: 'HTTP_404',
          httpStatus: 404,
          attempt: 1,
          message: 'La lectura de la fuente devolvió HTTP 404; se marcó como no disponible y el pipeline continuó con la evidencia válida.',
        },
      })

      const { count: successfulReadings, error: successError } = await client.from('research_events')
        .select('id', { head: true, count: 'exact' })
        .eq('request_id', requestId).eq('event_type', 'provider.reading.succeeded')
      expect(successError).toBeNull()
      expect(successfulReadings).toBe(1)
      expect(await repository.getByRequestId(requestId)).toEqual(result)
    } finally {
      if (requestId) {
        const { error } = await client.from('editorial_research_requests').delete().eq('id', requestId)
        expect(error).toBeNull()
      }
    }
  })

  it('persists and exposes the J05 insufficient-sources incident without duplicating Morella', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const repository = new SupabaseEditorialResearchRepository(client)
    const service = new ManualResearchService(
      repository,
      new GeographicResolver(new SupabaseGeographyCatalogRepository(client), 'geonames-2026-07-20'),
      { ownerProcess: 'manual-supabase-j05', retryBackoffMs: [0] },
    )
    const idempotencyKey = `manual-j05:${randomUUID()}`
    const morellaId = '70000000-0000-4000-8000-000000000003'
    let requestId: string | undefined

    try {
      const { count: destinationsBefore, error: beforeError } = await client
        .from('geographic_entities').select('id', { head: true, count: 'exact' }).eq('id', morellaId)
      expect(beforeError).toBeNull()

      const outcome = await service.startForInterface({
        destinationQuery: 'Morella', countryCode: 'ES', destinationType: 'locality',
        profiles: ['adventure', 'student'], language: 'es', depth: 'standard',
        notes: 'J05 sintético de integración', budgetLimit: 2, maxAttempts: 3,
        simulationScenario: 'insufficient_sources', idempotencyKey,
        actorId: '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11',
      })
      expect(outcome).toMatchObject({
        status: 'failed',
        incident: {
          destinationId: morellaId,
          stage: 'fact_structuring',
          errorCode: 'NO_ACCEPTED_SOURCES',
          failureClassification: 'data_quality',
        },
      })
      if (outcome.status !== 'failed') throw new Error('J05 debía persistir una incidencia')
      requestId = outcome.incident.requestId

      expect(await repository.getScaffold(requestId)).toMatchObject({
        request: { id: requestId, destinationId: morellaId, state: 'failed' },
        run: {
          id: outcome.incident.runId,
          stage: 'fact_structuring',
          state: 'failed',
          errorCode: 'NO_ACCEPTED_SOURCES',
          failureClassification: 'data_quality',
        },
      })
      expect((await repository.list()).items.filter(item => item.requestId === requestId)).toHaveLength(1)

      const { data: failureEvent, error: eventError } = await client.from('research_events')
        .select('request_id,run_id,event_type,stage,payload,occurred_at')
        .eq('request_id', requestId).eq('event_type', 'manual.execution.failed').single()
      expect(eventError).toBeNull()
      expect(failureEvent).toMatchObject({
        request_id: requestId,
        run_id: outcome.incident.runId,
        stage: 'fact_structuring',
        payload: {
          errorCode: 'NO_ACCEPTED_SOURCES',
          failureClassification: 'data_quality',
        },
      })

      const retried = await service.retryForInterface({ requestId, actorId: '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11' })
      expect(retried).toMatchObject({ status: 'failed', incident: { requestId, destinationId: morellaId } })
      expect(await repository.listRuns(requestId)).toHaveLength(2)
      expect((await repository.list()).items.filter(item => item.requestId === requestId)).toHaveLength(1)

      const { count: destinationsAfter, error: afterError } = await client
        .from('geographic_entities').select('id', { head: true, count: 'exact' }).eq('id', morellaId)
      expect(afterError).toBeNull()
      expect(destinationsAfter).toBe(destinationsBefore)
    } finally {
      if (requestId) {
        const { error } = await client.from('editorial_research_requests').delete().eq('id', requestId)
        expect(error).toBeNull()
      }
    }
  })
})
