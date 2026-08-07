import { readFile } from 'node:fs/promises'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import {
  RealEditorialLibraryVersionDraftApplicationService,
  type LibraryVersionDraftApplicationLogger,
} from '@modules/library-versioning/draft-application-service'
import {
  LibraryVersioningRepositoryError,
  prepareCreateLibraryVersionCommand,
  type RealEditorialLibraryDraftOperationReceiptRepository,
  type RealEditorialLibraryVersioningReadRepository,
  type RealEditorialLibraryVersioningRepository,
} from '@modules/library-versioning/repository'
import { SupabaseRealEditorialLibraryVersioningRepository } from
  '@modules/library-versioning/supabase-repository'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import type { LibraryVersionDraftOperationReceipt } from
  '@shared/real-editorial-library-draft-application-contracts'
import type {
  LibraryEntryVersioningSummary,
  LibraryVersionDetail,
  LibraryVersionRevisionDetail,
  LibraryVersionStateReadSnapshot,
} from '@shared/real-editorial-library-read-contracts'
import {
  REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
  REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
} from '@shared/real-editorial-library-contracts'

const ids = {
  entry: '10000000-0000-4000-8000-000000000001',
  transfer: '10000000-0000-4000-8000-000000000002',
  artifact: '10000000-0000-4000-8000-000000000003',
  review: '10000000-0000-4000-8000-000000000004',
  originDecision: '10000000-0000-4000-8000-000000000005',
  version: '10000000-0000-4000-8000-000000000006',
  revision1: '10000000-0000-4000-8000-000000000007',
  revision2: '10000000-0000-4000-8000-000000000008',
  foreignActor: '10000000-0000-4000-8000-000000000009',
}
const hash = (character: string) => character.repeat(64)
const hashes = {
  origin: hash('1'), version: hash('2'), revision1: hash('3'), revision2: hash('4'),
  content1: hash('5'), content2: hash('6'), trace: hash('7'), operation: hash('8'),
  saveOperation: hash('9'), fingerprint: hash('a'), entry: hash('b'), artifact: hash('c'),
  review: hash('d'),
}
const createdAt = '2026-08-07T10:00:00.000Z'

describe('casos de uso internos BIB-V04', () => {
  it('crea un draft canonicalizado y devuelve exclusivamente proyecciones autoritativas', async () => {
    const doubles = doublesForRevision(revision1)
    doubles.receipts.getDraftOperationReceipt
      .mockResolvedValueOnce(null)
      .mockImplementation(async () => createReceipt(
        doubles.writes.createVersion.mock.calls[0][0].requestFingerprint,
      ))
    const service = application(doubles)

    const result = await service.createDraft(createCommand({
      title: '\uFEFF Borrador ', content: 'Contenido \t\r\n\r\n',
      changeSummary: ' Crear borrador ',
    }))

    expect(result).toMatchObject({
      status: 'ok', operation: 'create_draft', operationReplayed: false,
      currentRevision: { id: ids.revision1, revisionNumber: 1 },
      stateSnapshot: { effectiveState: 'draft' },
      entrySummary: { publication: {
        publicationCount: 0, trawelConnected: false, automaticEnabled: false,
      } },
      warnings: ['title_canonicalized', 'content_canonicalized',
        'change_summary_canonicalized'],
    })
    expect(doubles.writes.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Borrador', content: 'Contenido\n', creationReason: 'Crear borrador',
      actor: { actorId: MANUAL_LOCAL_ACTOR_ID, roleSnapshot: 'local_owner:edit' },
    }))
    expect(doubles.writes.saveRevision).not.toHaveBeenCalled()
    expect(doubles.writes.submitForReview).not.toHaveBeenCalled()
    expect(doubles.writes.decideVersion).not.toHaveBeenCalled()
    expect(doubles.logger.info).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'create_draft', operationKeyPrefix: hashes.operation.slice(0, 12),
      outcome: 'ok',
    }))
  })

  it('guarda una revisión con CAS y confirma read-after-write sin decisiones', async () => {
    const doubles = doublesForRevision(revision2)
    doubles.reads.getVersionStateSnapshot
      .mockResolvedValueOnce(stateFor(revision1))
      .mockResolvedValueOnce(stateFor(revision2))
    doubles.receipts.getDraftOperationReceipt
      .mockResolvedValueOnce(null)
      .mockImplementation(async () => saveReceipt(
        doubles.writes.saveRevision.mock.calls[0][0].requestFingerprint,
      ))
    const service = application(doubles)

    const result = await service.saveDraft(saveCommand())

    expect(result).toMatchObject({
      status: 'ok', operation: 'save_draft', operationReplayed: false,
      savedRevision: {
        id: ids.revision2, revisionNumber: 2,
        expectedPreviousRevisionHash: hashes.revision1,
      },
      versionDetail: { currentRevision: { id: ids.revision2 }, decisions: [] },
      stateSnapshot: { effectiveState: 'draft', transitions: [] },
    })
    expect(doubles.writes.saveRevision).toHaveBeenCalledWith(expect.objectContaining({
      expectedPreviousRevisionHash: hashes.revision1,
      canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
      contentSchemaContract: REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
    }))
    expect(doubles.writes.reconcileFindings).not.toHaveBeenCalled()
    expect(doubles.writes.submitForReview).not.toHaveBeenCalled()
  })

  it('rechaza forma, límites, canonicalización y actor antes del repositorio', async () => {
    const doubles = doublesForRevision(revision1)
    const service = application(doubles)
    for (const candidate of [
      createCommand({ title: '   ' }),
      createCommand({ content: '   \r\n' }),
      createCommand({ title: 'Dos\nlíneas' }),
      createCommand({ content: `Texto${String.fromCharCode(0xd800)}` }),
      createCommand({ changeSummary: '   ' }),
      { ...createCommand(), versionNumber: 2 },
      createCommand({ operationKey: 'mal' }),
      createCommand({ libraryEntryId: 'mal' }),
      createCommand({ expectedHeadHash: 'mal' }),
      createCommand({ title: 'x'.repeat(1_001) }),
      createCommand({ content: 'x'.repeat(200_001) }),
      createCommand({ changeSummary: 'x'.repeat(2_001) }),
    ]) {
      await expect(service.createDraft(candidate)).resolves.toMatchObject({
        status: 'error', code: 'VALIDATION_ERROR',
      })
    }
    await expect(service.createDraft(createCommand({ actorId: ids.foreignActor })))
      .resolves.toMatchObject({ status: 'error', code: 'ACTOR_NOT_AUTHORIZED' })
    expect(doubles.writes.createVersion).not.toHaveBeenCalled()
    expect(doubles.receipts.getDraftOperationReceipt).not.toHaveBeenCalled()
  })

  it('conserva conflictos discriminados de entrada, apertura, versión, CAS y estado', async () => {
    for (const code of ['LIBRARY_ENTRY_NOT_FOUND', 'VERSION_ALREADY_OPEN'] as const) {
      const doubles = doublesForRevision(revision1)
      doubles.writes.createVersion.mockResolvedValue(commandError(code, hashes.operation))
      doubles.receipts.getDraftOperationReceipt.mockResolvedValue(null)
      await expect(application(doubles).createDraft(createCommand())).resolves.toMatchObject({
        status: 'error', code,
      })
    }

    const missing = doublesForRevision(revision2)
    missing.receipts.getDraftOperationReceipt.mockResolvedValue(null)
    missing.reads.getVersionStateSnapshot.mockRejectedValue(
      new LibraryVersioningRepositoryError('VERSION_NOT_FOUND', 'detalle SQL sensible'),
    )
    await expect(application(missing).saveDraft(saveCommand())).resolves.toEqual(
      expect.objectContaining({ status: 'error', code: 'VERSION_NOT_FOUND',
        message: 'La versión no existe.' }),
    )

    const stale = doublesForRevision(revision2)
    stale.receipts.getDraftOperationReceipt.mockResolvedValue(null)
    stale.reads.getVersionStateSnapshot.mockResolvedValue(stateFor(revision1, hash('f')))
    await expect(application(stale).saveDraft(saveCommand())).resolves.toMatchObject({
      status: 'error', code: 'STALE_REVISION', retryable: true,
    })
    expect(stale.writes.saveRevision).not.toHaveBeenCalled()

    const terminal = doublesForRevision(revision2)
    terminal.receipts.getDraftOperationReceipt.mockResolvedValue(null)
    terminal.reads.getVersionStateSnapshot.mockResolvedValue({
      ...stateFor(revision1), effectiveState: 'abandoned', isTerminal: true,
    })
    await expect(application(terminal).saveDraft(saveCommand())).resolves.toMatchObject({
      status: 'error', code: 'INVALID_STATE_TRANSITION',
    })
    expect(terminal.writes.saveRevision).not.toHaveBeenCalled()
  })

  it('reutiliza retry idéntico y rechaza operation_key con fingerprint divergente', async () => {
    const command = createCommand()
    const prepared = await prepareCreateLibraryVersionCommand({
      libraryEntryId: command.libraryEntryId, expectedHeadHash: command.expectedHeadHash,
      canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
      contentSchemaContract: REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
      title: command.title, content: command.content, creationReason: command.changeSummary,
      createdByActorId: command.actorId, operationKey: command.operationKey,
    })
    const replay = doublesForRevision(revision1)
    replay.receipts.getDraftOperationReceipt.mockResolvedValue(
      createReceipt(prepared.requestFingerprint),
    )
    await expect(application(replay).createDraft(command)).resolves.toMatchObject({
      status: 'ok', operationReplayed: true,
    })
    expect(replay.writes.createVersion).not.toHaveBeenCalled()

    const divergent = doublesForRevision(revision1)
    divergent.receipts.getDraftOperationReceipt.mockResolvedValue(
      createReceipt(hashes.fingerprint),
    )
    await expect(application(divergent).createDraft(command)).resolves.toMatchObject({
      status: 'error', code: 'IDEMPOTENCY_CONFLICT',
    })
    expect(divergent.writes.createVersion).not.toHaveBeenCalled()
  })

  it('recupera un resultado perdido y distingue ausencia y fingerprint divergente', async () => {
    const receipt = saveReceipt(hashes.fingerprint)
    const confirmed = doublesForRevision(revision2)
    confirmed.receipts.getDraftOperationReceipt.mockResolvedValue(receipt)
    await expect(application(confirmed).recoverOperationResult({
      operationKey: receipt.operationKey, expectedOperation: receipt.operation,
      expectedRequestFingerprint: receipt.requestFingerprint,
      actorId: MANUAL_LOCAL_ACTOR_ID,
    })).resolves.toMatchObject({
      status: 'confirmed', recoveredOperation: 'save_draft',
      operationRevision: { id: ids.revision2 },
    })

    const absent = doublesForRevision(revision1)
    absent.receipts.getDraftOperationReceipt.mockResolvedValue(null)
    await expect(application(absent).recoverOperationResult({
      operationKey: hashes.operation, expectedOperation: 'create_draft',
      expectedRequestFingerprint: hashes.fingerprint, actorId: MANUAL_LOCAL_ACTOR_ID,
    })).resolves.toEqual({
      status: 'not_found', operation: 'recover_operation', operationKey: hashes.operation,
    })

    const conflict = doublesForRevision(revision2)
    conflict.receipts.getDraftOperationReceipt.mockResolvedValue(receipt)
    await expect(application(conflict).recoverOperationResult({
      operationKey: receipt.operationKey, expectedOperation: receipt.operation,
      expectedRequestFingerprint: hash('f'), actorId: MANUAL_LOCAL_ACTOR_ID,
    })).resolves.toMatchObject({ status: 'error', code: 'IDEMPOTENCY_CONFLICT' })
  })

  it('rechaza un read-after-write incoherente sin exponer el error SQL', async () => {
    const doubles = doublesForRevision(revision1)
    doubles.receipts.getDraftOperationReceipt
      .mockResolvedValueOnce(null)
      .mockImplementation(async () => ({
        ...createReceipt(doubles.writes.createVersion.mock.calls[0][0].requestFingerprint),
        revisionHash: hash('f'),
      }))
    await expect(application(doubles).createDraft(createCommand())).resolves.toMatchObject({
      status: 'error', code: 'HASH_MISMATCH', message: 'Los hashes confirmados no coinciden.',
    })
  })
})

describe('recibo PostgreSQL y adaptador BIB-V04', () => {
  it('usa RPC parametrizado y valida el recibo estricto', async () => {
    const receipt = createReceipt(hashes.fingerprint)
    const rpc = vi.fn().mockResolvedValue({ data: receipt, error: null })
    const repository = new SupabaseRealEditorialLibraryVersioningRepository(
      { rpc } as unknown as SupabaseClient,
    )
    await expect(repository.getDraftOperationReceipt(receipt.operationKey)).resolves.toEqual(receipt)
    expect(rpc).toHaveBeenCalledWith('real_editorial_library_draft_operation_receipt', {
      p_operation_key: receipt.operationKey,
    })
    await expect(repository.getDraftOperationReceipt('mal')).rejects.toThrow()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('añade solo una lectura stable, sin tablas, triggers ni DML', async () => {
    const sql = await readFile(new URL(
      '../supabase/migrations/20260807160000_real_editorial_library_draft_operation_receipts.sql',
      import.meta.url,
    ), 'utf8')
    expect(sql).toContain('real_editorial_library_draft_operation_receipt')
    expect(sql).toContain('language plpgsql stable')
    expect(sql).toContain('from public,anon,authenticated')
    expect(sql).toContain('to service_role')
    expect(sql).not.toMatch(/^\s*(?:insert\s+into|update|delete\s+from|truncate)\b/im)
    expect(sql).not.toMatch(/create\s+table|alter\s+table|create\s+trigger/i)
    expect(sql).not.toMatch(/submit_for_review|approve|request_changes|publish\s*\(/i)
  })
})

function application(doubles: ReturnType<typeof doublesForRevision>) {
  return new RealEditorialLibraryVersionDraftApplicationService(
    doubles.writes, doubles.reads, doubles.receipts, undefined, doubles.logger,
  )
}

function doublesForRevision(currentRevision: LibraryVersionRevisionDetail) {
  const detail = detailFor(currentRevision)
  const state = stateFor(currentRevision)
  const summary = summaryFor(currentRevision)
  const createSuccess = {
    status: 'ok' as const, operation: 'create_version' as const, reused: false,
    versionId: ids.version, revisionId: ids.revision1, state: 'draft' as const,
    versionHash: hashes.version, revisionHash: hashes.revision1,
    traceabilityHash: null, decisionTargetHash: null,
  }
  const saveSuccess = {
    status: 'ok' as const, operation: 'save_revision' as const, reused: false,
    versionId: ids.version, revisionId: ids.revision2, state: 'draft' as const,
    versionHash: hashes.version, revisionHash: hashes.revision2,
    traceabilityHash: null, decisionTargetHash: null,
  }
  const writes = {
    createVersion: vi.fn().mockResolvedValue(createSuccess),
    saveRevision: vi.fn().mockResolvedValue(saveSuccess),
    reconcileFindings: vi.fn(), submitForReview: vi.fn(), decideVersion: vi.fn(),
    getCurrentApproved: vi.fn(),
  }
  const reads = {
    getVersioningSummary: vi.fn().mockResolvedValue(summary),
    listVersions: vi.fn(),
    getVersionDetail: vi.fn().mockResolvedValue(detail),
    listVersionRevisions: vi.fn(),
    getVersionRevision: vi.fn().mockImplementation(async (_versionId, revisionId) =>
      revisionId === ids.revision1 ? revision1 : revision2),
    listVersionFindingHistory: vi.fn(), getEffectiveVersionFindings: vi.fn(),
    listVersionDecisions: vi.fn(),
    getVersionStateSnapshot: vi.fn().mockResolvedValue(state),
    getCurrentApprovedVersion: vi.fn(), getVersionTimeline: vi.fn(),
  }
  const receipts = { getDraftOperationReceipt: vi.fn() }
  const logger = { info: vi.fn(), warn: vi.fn() }
  return {
    writes: writes as unknown as RealEditorialLibraryVersioningRepository & typeof writes,
    reads: reads as unknown as RealEditorialLibraryVersioningReadRepository & typeof reads,
    receipts: receipts as unknown as RealEditorialLibraryDraftOperationReceiptRepository
      & typeof receipts,
    logger: logger as LibraryVersionDraftApplicationLogger & typeof logger,
  }
}

function createCommand(patch: Record<string, unknown> = {}) {
  return {
    libraryEntryId: ids.entry, expectedHeadHash: hashes.origin,
    title: 'Borrador', content: 'Contenido\n', changeSummary: 'Crear borrador',
    actorId: MANUAL_LOCAL_ACTOR_ID, operationKey: hashes.operation, ...patch,
  }
}

function saveCommand(patch: Record<string, unknown> = {}) {
  return {
    versionId: ids.version, expectedPreviousRevisionHash: hashes.revision1,
    title: 'Segundo borrador', content: 'Segundo contenido\n',
    changeSummary: 'Guardar revisión', actorId: MANUAL_LOCAL_ACTOR_ID,
    operationKey: hashes.saveOperation, ...patch,
  }
}

const originV1 = {
  libraryEntryId: ids.entry, entryKey: hashes.entry, versionNumber: 1 as const,
  profile: 'adventure' as const, language: 'es-ES' as const, title: 'Origen',
  content: 'Contenido original\n', contentHash: hashes.content1,
  originVersionHash: hashes.origin,
  sourceArtifact: {
    artifactId: ids.artifact, kind: 'draft_adventure', key: 'adventure', version: 1,
    hash: hashes.artifact, createdAt,
  },
  finalReviewArtifact: {
    artifactId: ids.review, kind: 'final_review', key: 'final', version: 1,
    hash: hashes.review, createdAt,
  },
  terminalDecisionId: ids.originDecision,
  transfer: {
    transferId: ids.transfer, snapshotArtifactId: ids.artifact,
    snapshotHash: hashes.artifact, terminalDecisionId: ids.originDecision,
    transferredAt: createdAt, publicationCount: 0 as const, trawelConnected: false as const,
    automaticEnabled: false as const,
  },
  reviewOutcome: 'passed_with_warnings' as const, reviewPayload: {},
  warnings: [{ id: 'w1' }], gaps: [{ id: 'g1' }], contradictions: [{ id: 'x1' }],
  claims: [{ id: 'c1' }], evidence: [{ id: 'e1' }], sources: [{ id: 's1' }],
  approvalActorId: MANUAL_LOCAL_ACTOR_ID, transferActorId: MANUAL_LOCAL_ACTOR_ID,
  approvedAt: createdAt, createdAt, publicationState: 'unpublished' as const,
}

const currentApproved = {
  source: 'origin_v1' as const, libraryEntryId: ids.entry, profile: 'adventure' as const,
  language: 'es-ES' as const, versionId: null, versionNumber: 1, revisionId: null,
  title: originV1.title, content: originV1.content, contentHash: originV1.contentHash,
  versionHash: hashes.origin, revisionHash: null, approvalDecisionId: null,
  approvedAt: createdAt, originV1, publicationState: 'unpublished' as const,
}

const revision1: LibraryVersionRevisionDetail = {
  id: ids.revision1, versionId: ids.version, revisionNumber: 1,
  previousRevisionId: null, expectedPreviousRevisionHash: null,
  title: 'Borrador', content: 'Contenido\n',
  contentSchemaContract: REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
  canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
  contentHash: hashes.content1, revisionHash: hashes.revision1,
  changeSummary: 'Crear borrador', createdByActorId: MANUAL_LOCAL_ACTOR_ID,
  createdAt, operationKey: hashes.operation,
}

const revision2: LibraryVersionRevisionDetail = {
  id: ids.revision2, versionId: ids.version, revisionNumber: 2,
  previousRevisionId: ids.revision1, expectedPreviousRevisionHash: hashes.revision1,
  title: 'Segundo borrador', content: 'Segundo contenido\n',
  contentSchemaContract: REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
  canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
  contentHash: hashes.content2, revisionHash: hashes.revision2,
  changeSummary: 'Guardar revisión', createdByActorId: MANUAL_LOCAL_ACTOR_ID,
  createdAt, operationKey: hashes.saveOperation,
}

function listItemFor(currentRevision: LibraryVersionRevisionDetail) {
  return {
    versionId: ids.version, libraryEntryId: ids.entry, versionNumber: 2,
    parentVersionId: null, parentReference: 'origin_v1' as const,
    parentHash: hashes.origin, originVersionHash: hashes.origin,
    versionHash: hashes.version, createdByActorId: MANUAL_LOCAL_ACTOR_ID, createdAt,
    effectiveState: 'draft' as const, displayState: 'draft' as const,
    currentRevisionId: currentRevision.id,
    currentRevisionNumber: currentRevision.revisionNumber,
    currentRevisionHash: currentRevision.revisionHash,
    revisionCount: currentRevision.revisionNumber, effectiveFindingCount: 0,
    terminalDecision: null, isSuperseded: false, isCurrentApproved: false,
    publicationState: 'unpublished' as const,
  }
}

function stateFor(
  currentRevision: LibraryVersionRevisionDetail,
  currentRevisionHash = currentRevision.revisionHash,
): LibraryVersionStateReadSnapshot {
  return {
    libraryEntryId: ids.entry, versionId: ids.version, versionNumber: 2,
    initialState: 'draft', transitions: [], terminalDecision: null,
    effectiveState: 'draft', currentRevisionId: currentRevision.id,
    currentRevisionHash, traceabilityHash: hashes.trace, aggregateHash: null,
    isTerminal: false, isCurrentApproved: false, publicationState: 'unpublished',
  }
}

function summaryFor(currentRevision: LibraryVersionRevisionDetail): LibraryEntryVersioningSummary {
  const item = listItemFor(currentRevision)
  return {
    libraryEntryId: ids.entry, profile: 'adventure', originalVersion: originV1,
    derivedVersionCount: 1, openVersion: item, currentApproved,
    latestVersion: item, latestEffectiveState: 'draft',
    publication: {
      entryState: 'unpublished', currentApprovedState: 'unpublished', publicationCount: 0,
      trawelConnected: false, automaticEnabled: false,
    },
  }
}

function detailFor(currentRevision: LibraryVersionRevisionDetail): LibraryVersionDetail {
  const revisions = currentRevision.revisionNumber === 1 ? [revision1] : [revision1, revision2]
  return {
    version: listItemFor(currentRevision), profile: 'adventure', originV1,
    parent: { source: 'origin_v1', versionId: null, versionNumber: 1, hash: hashes.origin },
    revisions, currentRevision, state: stateFor(currentRevision),
    effectiveFindings: {
      versionId: ids.version, revisionId: currentRevision.id,
      traceabilityHash: hashes.trace, items: [],
    },
    findingHistory: [], decisions: [], aggregateHash: null,
    acceptedRiskFindingKeys: [], separationOfDuties: null, currentApproved,
    flags: {
      editable: true, canSaveRevision: true, canReconcileFindings: true,
      canSubmitForReview: true, canDecide: false, canCreateNextVersion: false,
    }, publicationState: 'unpublished',
  }
}

function createReceipt(requestFingerprint: string): LibraryVersionDraftOperationReceipt {
  return {
    operation: 'create_draft', operationKey: hashes.operation, requestFingerprint,
    actorId: MANUAL_LOCAL_ACTOR_ID, libraryEntryId: ids.entry, versionId: ids.version,
    revisionId: ids.revision1, versionHash: hashes.version,
    revisionHash: hashes.revision1, confirmedAt: createdAt,
  }
}

function saveReceipt(requestFingerprint: string): LibraryVersionDraftOperationReceipt {
  return {
    operation: 'save_draft', operationKey: hashes.saveOperation, requestFingerprint,
    actorId: MANUAL_LOCAL_ACTOR_ID, libraryEntryId: ids.entry, versionId: ids.version,
    revisionId: ids.revision2, versionHash: hashes.version,
    revisionHash: hashes.revision2, confirmedAt: createdAt,
  }
}

function commandError(code: 'LIBRARY_ENTRY_NOT_FOUND' | 'VERSION_ALREADY_OPEN', operationKey: string) {
  return {
    status: 'error' as const, code, message: 'mensaje SQL sensible',
    retryable: false, operationKey,
  }
}
