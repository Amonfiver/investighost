import { readFile } from 'node:fs/promises'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import {
  canonicalJsonStringify,
  canonicalizeLibraryContent,
  canonicalizeLibraryDocument,
  canonicalizeLibraryTitle,
  libraryContentHash,
  libraryDecisionTargetHash,
  libraryFindingHash,
  libraryOriginVersionHash,
  libraryRequestFingerprint,
  libraryRevisionHash,
  libraryTraceabilityHash,
  libraryVersionHash,
} from '@modules/library-versioning/canonicalization'
import {
  LibraryVersioningRepositoryError,
  RealEditorialLibraryVersioningService,
  type RealEditorialLibraryVersioningRepository,
} from '@modules/library-versioning/repository'
import { SupabaseRealEditorialLibraryVersioningRepository } from
  '@modules/library-versioning/supabase-repository'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
  REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
} from '@shared/real-editorial-library-contracts'

const ids = {
  entry: '10000000-0000-4000-8000-000000000002',
  version: '10000000-0000-4000-8000-000000000003',
  revision: '10000000-0000-4000-8000-000000000004',
}
const hashes = {
  head: 'a'.repeat(64),
  version: 'b'.repeat(64),
  revision: 'c'.repeat(64),
  operation: 'd'.repeat(64),
}

describe('canonicalizacion y hashes autoritativos BIB-V02', () => {
  it('aplica NFC, LF, limpieza final por linea y exactamente un LF final', () => {
    expect(canonicalizeLibraryDocument(
      '\uFEFF  Cafe\u0301  ',
      'Linea uno \t\r\nLinea dos\t\r\n\r\n',
    )).toEqual({ title: 'Café', content: 'Linea uno\nLinea dos\n' })
    expect(canonicalizeLibraryTitle('  Titulo\u00a0')).toBe('Titulo')
    expect(canonicalizeLibraryContent('  espacio interno  \n')).toBe('  espacio interno\n')
  })

  it('rechaza NUL, surrogates aislados y saltos en titulo', () => {
    expect(() => canonicalizeLibraryContent('Texto\0')).toThrow(/Unicode/)
    expect(() => canonicalizeLibraryContent(`Texto${String.fromCharCode(0xd800)}`)).toThrow(/Unicode/)
    expect(() => canonicalizeLibraryTitle('Dos\nlineas')).toThrow(/saltos/)
  })

  it('serializa JSON por claves ordenadas y fija vectores SHA-256 reproducibles', () => {
    expect(canonicalJsonStringify({ z: [3, true], a: 'á' })).toBe('{"a":"á","z":[3,true]}')
    expect(libraryContentHash({
      profile: 'adventure',
      language: 'es-ES',
      title: 'Viaje',
      content: 'Linea\n',
    })).toBe('e2ea124409ab1dbe84b970ce8c606e11f9a929852a202deb6e78124574318e09')
    const payload = {
      actor: { actorId: MANUAL_LOCAL_ACTOR_ID, roleSnapshot: 'local_owner:edit' },
      canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
      content: 'Linea\n',
      contentSchemaContract: REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
      creationReason: 'Crear version',
      expectedHeadHash: hashes.head,
      libraryEntryId: ids.entry,
      title: 'Viaje',
    }
    expect(libraryRequestFingerprint('create_version', payload)).toBe(
      '6bcac8a2eba8e43c03ec64ab7102ad6768d7989eee8d91ed8d1b522840325527',
    )
  })

  it('fija vectores para origen, version, revision, finding, traza y target', () => {
    const artifactId = '10000000-0000-4000-8000-000000000006'
    const decisionId = '10000000-0000-4000-8000-000000000007'
    const findingId = '10000000-0000-4000-8000-000000000005'
    const createdAt = '2026-08-06T10:00:00.000Z'
    const originHash = libraryOriginVersionHash({
      entryId: ids.entry, entryKey: hashes.head, profile: 'adventure', language: 'es-ES',
      contentHash: hashes.version, sourceArtifactId: artifactId,
      sourceArtifactHash: hashes.head, finalReviewHash: hashes.version,
      terminalDecisionId: decisionId,
    })
    expect(originHash).toBe('29707b630d2da3cffdb2b3b6eedcdea1ba672802e16f655475ff0c755ae45275')
    const versionHash = libraryVersionHash({
      entryId: ids.entry, versionId: ids.version, versionNumber: 2,
      parentVersionId: null, parentHash: originHash, createdBy: MANUAL_LOCAL_ACTOR_ID,
      createdAt, creationReason: 'Crear version',
    })
    expect(versionHash).toBe('65055f04bf5369b803464e0b35bdace14cef11194f1823e11c28430f60ea414a')
    const revisionHash = libraryRevisionHash({
      versionHash, revisionId: ids.revision, revisionNumber: 1,
      previousRevisionId: null, previousRevisionHash: null,
      contentHash: hashes.version, createdBy: MANUAL_LOCAL_ACTOR_ID,
      createdAt, reason: 'Crear version',
    })
    expect(revisionHash).toBe('3ee29d5108a6ab4427d75240ec620e64882fe668dd7b379a6bae24e88beefa19')
    const findingHash = libraryFindingHash({
      versionHash, revisionHash, findingId, findingKey: 'warning:w1', sequence: 1,
      supersedesFindingId: null, sourceFindingType: 'warning', sourceFindingId: 'w1',
      origin: 'inherited', disposition: 'pending', claimRelation: 'not_applicable',
      supportStatus: 'not_applicable', subjectText: 'Warning', diffAnchor: null,
      claimIds: [], evidenceReferences: [], sourceIds: [], editorDeclaration: 'Revisado',
      justification: '', createdBy: MANUAL_LOCAL_ACTOR_ID, createdAt,
    })
    expect(findingHash).toBe('d3205860e884a8eeb11b47713f41f7ef95f8203f5356c4b924f771fad44cdcff')
    const traceabilityHash = libraryTraceabilityHash({
      originVersionHash: originHash,
      findings: [{ findingKey: 'warning:w1', findingHash }],
    })
    expect(traceabilityHash).toBe(
      '67297cd8e180f4143ac38e151f432b9375c9dd96bc5035ed0492bdb4b3e25b42',
    )
    expect(libraryDecisionTargetHash({ versionHash, revisionHash, traceabilityHash })).toBe(
      '9f9003f5cd00a91f6c7db7598c0f785064839750c056c59efccb78196e8ba46f',
    )
  })
})

describe('orquestacion y adaptador de repositorio BIB-V02', () => {
  it('canonicaliza antes de persistir y no acepta un actor distinto del local', async () => {
    const success = {
      status: 'ok' as const,
      operation: 'create_version' as const,
      reused: false,
      versionId: ids.version,
      revisionId: ids.revision,
      state: 'draft' as const,
      versionHash: hashes.version,
      revisionHash: hashes.revision,
      traceabilityHash: null,
      decisionTargetHash: null,
    }
    const repository = repositoryDouble(success)
    const service = new RealEditorialLibraryVersioningService(repository)
    await expect(service.createVersion({
      libraryEntryId: ids.entry,
      expectedHeadHash: hashes.head,
      canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
      contentSchemaContract: REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
      title: '\uFEFF Viaje ',
      content: 'Linea \t\r\n\r\n',
      creationReason: ' Crear version ',
      createdByActorId: MANUAL_LOCAL_ACTOR_ID,
      operationKey: hashes.operation,
    })).resolves.toEqual(success)
    expect(repository.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Viaje',
      content: 'Linea\n',
      creationReason: 'Crear version',
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      actor: { actorId: MANUAL_LOCAL_ACTOR_ID, roleSnapshot: 'local_owner:edit' },
    }))
    await expect(service.createVersion({
      libraryEntryId: ids.entry,
      expectedHeadHash: hashes.head,
      canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
      contentSchemaContract: REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
      title: 'Viaje',
      content: 'Linea\n',
      creationReason: 'Crear version',
      createdByActorId: ids.version,
      operationKey: hashes.operation,
    })).rejects.toMatchObject<Partial<LibraryVersioningRepositoryError>>({
      code: 'ACTOR_NOT_AUTHORIZED',
    })
  })

  it('invoca solo el RPC privado esperado y recupera errores discriminados', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          status: 'ok', operation: 'create_version', reused: false,
          versionId: ids.version, revisionId: ids.revision, state: 'draft',
          versionHash: hashes.version, revisionHash: hashes.revision,
          traceabilityHash: null, decisionTargetHash: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'STALE_REVISION' },
      })
    const repository = new SupabaseRealEditorialLibraryVersioningRepository(
      { rpc } as unknown as SupabaseClient,
    )
    const prepared = {
      operationKey: hashes.operation,
      requestFingerprint: 'e'.repeat(64),
      requestPayload: { libraryEntryId: ids.entry },
      actor: { actorId: MANUAL_LOCAL_ACTOR_ID, roleSnapshot: 'local_owner:edit' },
      libraryEntryId: ids.entry,
      expectedHeadHash: hashes.head,
      canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
      contentSchemaContract: REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
      title: 'Viaje', content: 'Linea\n', creationReason: 'Crear version',
    }
    await expect(repository.createVersion(prepared)).resolves.toMatchObject({ status: 'ok' })
    await expect(repository.createVersion(prepared)).resolves.toMatchObject({
      status: 'error', code: 'STALE_REVISION', retryable: true,
    })
    expect(rpc).toHaveBeenCalledWith('real_editorial_library_create_version', {
      p_command: expect.objectContaining({
        operationKey: hashes.operation,
        requestFingerprint: 'e'.repeat(64),
        actorRoleSnapshot: 'local_owner:edit',
      }),
    })
  })
})

describe('migracion estatica BIB-V02', () => {
  it('contiene las cinco transacciones, locks, CAS, idempotencia y lectura vigente', async () => {
    const sql = await readFile(new URL(
      '../supabase/migrations/20260806230000_real_editorial_library_versioning_transactions.sql',
      import.meta.url,
    ), 'utf8')
    for (const operation of [
      'create_version', 'save_revision', 'reconcile_finding',
      'submit_for_review', 'decide_version',
    ]) expect(sql).toContain(`real_editorial_library_${operation}`)
    expect(sql).toContain('real_editorial_library_current_approved')
    expect(sql.match(/pg_advisory_xact_lock/g)).toHaveLength(10)
    expect(sql).toContain('expectedPreviousRevisionHash')
    expect(sql).toContain('expectedTraceabilityHash')
    expect(sql).toContain('expectedDecisionTargetHash')
    expect(sql).toContain('IDEMPOTENCY_CONFLICT')
    expect(sql).toContain('FINDINGS_NOT_RECONCILED')
    expect(sql).toContain('UNSUPPORTED_CLAIM_BLOCKS_APPROVAL')
    expect(sql).toContain('BIB_V02_REQUIRES_EMPTY_VERSIONING_TABLES')
  })

  it('mantiene frontera negativa y solo concede los RPC a service_role', async () => {
    const sql = await readFile(new URL(
      '../supabase/migrations/20260806230000_real_editorial_library_versioning_transactions.sql',
      import.meta.url,
    ), 'utf8')
    expect(sql).not.toMatch(/insert into public\.real_editorial_library_entries/i)
    expect(sql).not.toMatch(/update public\.real_editorial_library_entries/i)
    expect(sql).not.toMatch(/tavily|openai|morella/i)
    expect(sql).toContain("'publicationState','unpublished'")
    expect(sql).toContain('grant execute on function public.real_editorial_library_create_version')
    expect(sql).toContain('from public,anon,authenticated')
  })
})

function repositoryDouble(
  result: Awaited<ReturnType<RealEditorialLibraryVersioningRepository['createVersion']>>,
): RealEditorialLibraryVersioningRepository {
  return {
    createVersion: vi.fn().mockResolvedValue(result),
    saveRevision: vi.fn(),
    reconcileFindings: vi.fn(),
    submitForReview: vi.fn(),
    decideVersion: vi.fn(),
    getCurrentApproved: vi.fn(),
  }
}
