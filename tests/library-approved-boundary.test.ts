import { describe, expect, it, vi } from 'vitest'
import { SupabaseRealEditorialPilotRepository } from '@modules/real-pipeline/real-editorial-repository'
import { CurrentApprovedLibraryContentSchema } from '@shared/real-editorial-library-read-contracts'

const ids = {
  entry: 'd3000000-0000-4000-8000-000000000001', transfer: 'd3000000-0000-4000-8000-000000000002',
  pilot: 'd3000000-0000-4000-8000-000000000003', run: 'd3000000-0000-4000-8000-000000000004',
  destination: 'd3000000-0000-4000-8000-000000000005', source: 'd3000000-0000-4000-8000-000000000006',
  review: 'd3000000-0000-4000-8000-000000000007', decision: 'd3000000-0000-4000-8000-000000000008',
  actor: '00000000-0000-4000-8000-000000000001',
}
const timestamp = '2026-09-23T18:00:00.000Z'
const hash = 'a'.repeat(64)

function approvedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ids.entry, transfer_id: ids.transfer, pilot_id: ids.pilot, run_id: ids.run,
    canonical_destination_id: ids.destination, destination_name: 'Morella', country_code: 'ES', destination_type: 'locality',
    profile: 'student', title: 'Morella', content: 'Morella conserva un patrimonio histórico documentado.', editorial_version: 1,
    language: 'es-ES', status: 'approved_unpublished', editorial_state: 'approved', library_state: 'ready_for_library',
    publication_state: 'unpublished', origin: 'real_editorial_pilot', source_artifact_id: ids.source,
    source_artifact_kind: 'draft_student', source_artifact_key: 'student', source_artifact_version: 1,
    source_artifact_hash: hash, source_artifact_created_at: timestamp, final_review_artifact_id: ids.review,
    final_review_version: 1, final_review_hash: hash, final_review_created_at: timestamp, terminal_decision_id: ids.decision,
    review_outcome: 'passed_with_warnings', warnings: ['Advertencia aceptada.'],
    gaps: [{ id: 'gap-1', topic: 'detalle', description: 'Dato pendiente documentado.', importance: 'low', requiredForProfiles: ['student'], resolvableWithResearch: false }],
    contradictions: ['Contradicción documentada.'],
    claims: [{ id: 'claim-1', topic: 'historia', statement: 'Morella conserva patrimonio.', evidenceIds: ['source-1'], confidence: 0.9, suitableProfiles: ['student'] }],
    evidence: [{ claimId: 'claim-1', statement: 'Fuente trazable.', confidence: 0.9, evidenceIds: ['source-1'] }],
    sources: [{ id: 'source-1', round: 1, url: 'https://example.test/morella', normalizedUrl: 'https://example.test/morella', title: 'Fuente', capturedAt: timestamp, contentHash: hash, score: 0.9, content: 'Contenido durable.' }],
    approval_actor_id: ids.actor, transfer_actor_id: ids.actor, final_run_cost: 0.1, currency: 'EUR', approved_at: timestamp, created_at: timestamp,
    ...overrides,
  }
}

function repositoryFor(rows: Record<string, unknown>[]) {
  const filters: Array<[string, unknown]> = []
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((field: string, value: unknown) => { filters.push([field, value]); return query }),
    ilike: vi.fn(() => query),
    order: vi.fn(() => query),
    then: <T>(resolve: (value: { data: Record<string, unknown>[]; error: null }) => T) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  }
  const client = { from: vi.fn(() => query) }
  return { repository: new SupabaseRealEditorialPilotRepository(client as never), filters }
}

describe('frontera de lectura de Biblioteca aprobada', () => {
  it('consulta únicamente filas aprobadas antes de aplicar el schema estricto', async () => {
    const { repository, filters } = repositoryFor([approvedRow()])
    await expect(repository.listLibraryEntries()).resolves.toMatchObject([{ entryId: ids.entry, status: 'approved_unpublished' }])
    expect(filters).toEqual(expect.arrayContaining([
      ['status', 'approved_unpublished'], ['editorial_state', 'approved'], ['library_state', 'ready_for_library'],
      ['publication_state', 'unpublished'], ['origin', 'real_editorial_pilot'],
    ]))
  })

  it('rechaza explícitamente una fila corrupta que pretenda ser aprobada', async () => {
    const { repository } = repositoryFor([approvedRow({ transfer_id: null })])
    await expect(repository.listLibraryEntries()).rejects.toThrow()
  })

  it('mantiene nulls legítimos en el read model de currentApproved, no en el schema legado', () => {
    const current = CurrentApprovedLibraryContentSchema.parse({
      source: 'origin_v1', libraryEntryId: ids.entry, profile: 'student', language: 'es-ES', versionId: null,
      versionNumber: 1, revisionId: null, title: 'Morella', content: 'Morella conserva un patrimonio histórico documentado.\n',
      contentHash: hash, versionHash: hash, revisionHash: null, approvalDecisionId: null, approvedAt: timestamp,
      originV1: {
        libraryEntryId: ids.entry, entryKey: hash, versionNumber: 1, profile: 'student', language: 'es-ES',
        title: 'Morella', content: 'Morella conserva un patrimonio histórico documentado.\n', contentHash: hash, originVersionHash: hash,
        sourceArtifact: { artifactId: ids.source, kind: 'draft_student', key: 'student', version: 1, hash, createdAt: timestamp },
        finalReviewArtifact: null, terminalDecisionId: null, transfer: null, reviewOutcome: null, reviewPayload: {}, warnings: [],
        gaps: [], contradictions: [], claims: [], evidence: [], sources: [], approvalActorId: null, transferActorId: null,
        approvedAt: null, createdAt: timestamp, publicationState: 'unpublished',
      },
      publicationState: 'unpublished',
    })
    expect(current.originV1.transfer).toBeNull()
    expect(current.originV1.finalReviewArtifact).toBeNull()
  })
})
