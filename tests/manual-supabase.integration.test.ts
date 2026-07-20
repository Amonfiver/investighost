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
})
