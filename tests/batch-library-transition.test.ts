import { describe, expect, it, vi } from 'vitest'
import {
  BatchSharedLibraryTransition,
  type BatchLibraryCandidateGateway,
} from '@modules/library-versioning/batch-library-transition'

const sha = 'a'.repeat(64)
const ids = {
  owner: '70000000-0000-4000-8000-000000000101',
  artifact: '70000000-0000-4000-8000-000000000102',
  entry: '70000000-0000-4000-8000-000000000103',
  version: '70000000-0000-4000-8000-000000000104',
  revision: '70000000-0000-4000-8000-000000000105',
  actor: '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11',
}

describe('BatchSharedLibraryTransition', () => {
  it('materializes a batch artifact in the existing Library as a draft, never current approved', async () => {
    const gateway: BatchLibraryCandidateGateway = {
      createCandidate: vi.fn().mockResolvedValue({ libraryEntryId: ids.entry, originHash: sha, reused: false }),
    }
    const createDraft = vi.fn().mockResolvedValue({
      status: 'ok', operationReplayed: false,
      receipt: {
        libraryEntryId: ids.entry, versionId: ids.version, revisionId: ids.revision,
        versionHash: sha, revisionHash: sha, operationKey: sha, requestFingerprint: sha,
        operation: 'create_draft', actorId: ids.actor, confirmedAt: '2026-09-22T12:00:00.000Z',
      },
    })
    const transition = new BatchSharedLibraryTransition(gateway, { createDraft } as never)

    const result = await transition.materialize({
      executionOwnerId: ids.owner,
      destination: { name: 'Granada', countryCode: 'ES', destinationType: 'locality' },
      sourceArtifact: { id: ids.artifact, payloadHash: sha },
      draft: {
        profile: 'student', title: 'Granada', content: 'Contenido editorial.\n', approximateWordCount: 2,
        promptVersion: 'test', schemaVersion: 'test',
        usage: { providerId: 'mock', model: 'mock', inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: 'EUR' },
      },
      actorId: ids.actor,
    })

    expect(gateway.createCandidate).toHaveBeenCalledOnce()
    expect(createDraft).toHaveBeenCalledWith(expect.objectContaining({
      libraryEntryId: ids.entry, expectedHeadHash: sha, actorId: ids.actor,
    }))
    expect(result).toEqual({
      libraryEntryId: ids.entry, versionId: ids.version, revisionId: ids.revision,
      versionHash: sha, revisionHash: sha, entryReused: false, versionReplayed: false,
    })
  })

  it('preserves replay identity rather than creating a second Library draft', async () => {
    const gateway: BatchLibraryCandidateGateway = {
      createCandidate: vi.fn().mockResolvedValue({ libraryEntryId: ids.entry, originHash: sha, reused: true }),
    }
    const createDraft = vi.fn().mockResolvedValue({
      status: 'ok', operationReplayed: true,
      receipt: {
        libraryEntryId: ids.entry, versionId: ids.version, revisionId: ids.revision,
        versionHash: sha, revisionHash: sha, operationKey: sha, requestFingerprint: sha,
        operation: 'create_draft', actorId: ids.actor, confirmedAt: '2026-09-22T12:00:00.000Z',
      },
    })
    const transition = new BatchSharedLibraryTransition(gateway, { createDraft } as never)
    const input = {
      executionOwnerId: ids.owner,
      destination: { name: 'Granada', countryCode: 'ES', destinationType: 'locality' as const },
      sourceArtifact: { id: ids.artifact, payloadHash: sha },
      draft: {
        profile: 'adventure' as const, title: 'Granada', content: 'Contenido editorial.\n', approximateWordCount: 2,
        promptVersion: 'test', schemaVersion: 'test',
        usage: { providerId: 'mock', model: 'mock', inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: 'EUR' as const },
      },
      actorId: ids.actor,
    }
    const first = await transition.materialize(input)
    const second = await transition.materialize(input)
    expect(first).toEqual(second)
    expect(createDraft).toHaveBeenCalledTimes(2)
    expect(createDraft.mock.calls[0]?.[0]?.operationKey).toBe(createDraft.mock.calls[1]?.[0]?.operationKey)
  })
})
