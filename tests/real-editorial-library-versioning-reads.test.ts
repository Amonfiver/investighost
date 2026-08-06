import { readFile } from 'node:fs/promises'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { SupabaseRealEditorialLibraryVersioningRepository } from
  '@modules/library-versioning/supabase-repository'
import { LibraryVersioningRepositoryError } from '@modules/library-versioning/repository'
import {
  CurrentApprovedLibraryContentSchema,
  EffectiveLibraryVersionFindingsSchema,
  LibraryEntryVersioningSummarySchema,
  LibraryVersionDecisionDetailSchema,
  LibraryVersionDetailSchema,
  LibraryVersionFindingHistoryItemSchema,
  LibraryVersionListItemSchema,
  LibraryVersionRevisionDetailSchema,
  LibraryVersionStateReadSnapshotSchema,
  LibraryVersionTimelineSchema,
} from '@shared/real-editorial-library-read-contracts'

const ids = {
  entry: '10000000-0000-4000-8000-000000000001',
  transfer: '10000000-0000-4000-8000-000000000002',
  artifact: '10000000-0000-4000-8000-000000000003',
  review: '10000000-0000-4000-8000-000000000004',
  originDecision: '10000000-0000-4000-8000-000000000005',
  actor: '10000000-0000-4000-8000-000000000006',
  version: '10000000-0000-4000-8000-000000000007',
  revision: '10000000-0000-4000-8000-000000000008',
  finding: '10000000-0000-4000-8000-000000000009',
  decision: '10000000-0000-4000-8000-000000000010',
}
const hash = (value: string) => value.repeat(64)
const hashes = {
  entry: hash('1'), origin: hash('2'), content: hash('3'), artifact: hash('4'),
  review: hash('5'), version: hash('6'), revision: hash('7'), finding: hash('8'),
  trace: hash('9'), target: hash('a'), operation: hash('b'),
}
const createdAt = '2026-08-07T10:00:00.000Z'

const originV1 = {
  libraryEntryId: ids.entry,
  entryKey: hashes.entry,
  versionNumber: 1,
  profile: 'adventure',
  language: 'es-ES',
  title: 'Origen sintético',
  content: 'Contenido original sintético.\n',
  contentHash: hashes.content,
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
    transferredAt: createdAt, publicationCount: 0, trawelConnected: false,
    automaticEnabled: false,
  },
  reviewOutcome: 'passed_with_warnings',
  reviewPayload: {}, warnings: [{ id: 'w1' }], gaps: [{ id: 'g1' }],
  contradictions: [{ id: 'x1' }], claims: [{ id: 'c1' }],
  evidence: [{ claimId: 'c1' }], sources: [{ id: 's1' }],
  approvalActorId: ids.actor, transferActorId: ids.actor,
  approvedAt: createdAt, createdAt, publicationState: 'unpublished',
} as const

const revision = {
  id: ids.revision, versionId: ids.version, revisionNumber: 1,
  previousRevisionId: null, expectedPreviousRevisionHash: null,
  title: 'Versión derivada', content: 'Contenido derivado sintético.\n',
  contentSchemaContract: 'investighost-library-content-v1',
  canonicalizationContract: 'investighost-library-c14n-v1',
  contentHash: hashes.content, revisionHash: hashes.revision,
  changeSummary: 'Crear versión derivada.', createdByActorId: ids.actor,
  createdAt, operationKey: hashes.operation,
} as const

const finding = {
  id: ids.finding, versionId: ids.version, revisionId: ids.revision,
  findingKey: 'warning:w1', sequence: 1, supersedesFindingId: null,
  sourceFindingType: 'warning', sourceFindingId: 'w1', origin: 'inherited',
  disposition: 'pending', claimRelation: 'not_applicable',
  supportStatus: 'not_applicable', subjectText: 'Warning sintético', diffAnchor: null,
  claimIds: [], evidenceReferences: [], sourceIds: [],
  editorDeclaration: 'Pendiente de reconciliación.', justification: '',
  findingHash: hashes.finding, createdByActorId: ids.actor, createdAt,
  operationKey: hashes.operation, isBaseline: true, resultTraceabilityHash: null,
} as const

const decision = {
  id: ids.decision, versionId: ids.version, revisionId: ids.revision, sequence: 1,
  decisionType: 'submit_for_review', expectedPreviousState: 'draft',
  resultingState: 'ready_for_review', revisionHash: hashes.revision,
  traceabilityHash: hashes.trace, decisionTargetHash: hashes.target,
  aggregateHash: hashes.target, reason: 'Enviar a revisión.', actorId: ids.actor,
  actorRoleSnapshot: 'local_owner:submit', affectedFindingKeys: [],
  changeInstructions: [], acceptedRiskFindingKeys: [],
  separationOfDutiesException: false, separationOfDutiesReason: null,
  publicationCount: 0, trawelConnected: false, automaticEnabled: false,
  createdAt, operationKey: hashes.operation, isTerminal: false,
} as const

const currentApproved = {
  source: 'origin_v1', libraryEntryId: ids.entry, profile: 'adventure', language: 'es-ES',
  versionId: null, versionNumber: 1, revisionId: null,
  title: originV1.title, content: originV1.content, contentHash: hashes.content,
  versionHash: hashes.origin, revisionHash: null, approvalDecisionId: null,
  approvedAt: createdAt, originV1, publicationState: 'unpublished',
} as const

const listItem = {
  versionId: ids.version, libraryEntryId: ids.entry, versionNumber: 2,
  parentVersionId: null, parentReference: 'origin_v1', parentHash: hashes.origin,
  originVersionHash: hashes.origin, versionHash: hashes.version,
  createdByActorId: ids.actor, createdAt, effectiveState: 'ready_for_review',
  displayState: 'ready_for_review', currentRevisionId: ids.revision,
  currentRevisionNumber: 1, currentRevisionHash: hashes.revision,
  revisionCount: 1, effectiveFindingCount: 1, terminalDecision: null,
  isSuperseded: false, isCurrentApproved: false, publicationState: 'unpublished',
} as const

describe('read models internos BIB-V03', () => {
  it('valida procedencia v1, revisión, findings y decisiones con Zod strict', () => {
    expect(CurrentApprovedLibraryContentSchema.parse(currentApproved)).toEqual(currentApproved)
    expect(LibraryVersionRevisionDetailSchema.parse(revision)).toEqual(revision)
    expect(LibraryVersionFindingHistoryItemSchema.parse(finding)).toEqual(finding)
    expect(LibraryVersionDecisionDetailSchema.parse(decision)).toEqual(decision)
    expect(CurrentApprovedLibraryContentSchema.safeParse({ ...currentApproved, secret: 'x' }).success)
      .toBe(false)
  })

  it('distingue findings efectivos y valida estado derivado sin estado mutable', () => {
    const effective = {
      versionId: ids.version, revisionId: ids.revision, traceabilityHash: hashes.trace,
      items: [{ ...finding, effectiveTraceabilityHash: hashes.trace }],
    }
    expect(EffectiveLibraryVersionFindingsSchema.parse(effective)).toEqual(effective)
    expect(LibraryVersionStateReadSnapshotSchema.safeParse({
      libraryEntryId: ids.entry, versionId: ids.version, versionNumber: 2,
      initialState: 'draft', transitions: [decision], terminalDecision: null,
      effectiveState: 'ready_for_review', currentRevisionId: ids.revision,
      currentRevisionHash: hashes.revision, traceabilityHash: hashes.trace,
      aggregateHash: hashes.target, isTerminal: false, isCurrentApproved: false,
      publicationState: 'unpublished',
    }).success).toBe(true)
  })

  it('valida resumen, detalle y flags de lectura sin convertir aprobación en publicación', () => {
    const summary = {
      libraryEntryId: ids.entry, profile: 'adventure', originalVersion: originV1,
      derivedVersionCount: 1, openVersion: listItem, currentApproved,
      latestVersion: listItem, latestEffectiveState: 'ready_for_review',
      publication: {
        entryState: 'unpublished', currentApprovedState: 'unpublished',
        publicationCount: 0, trawelConnected: false, automaticEnabled: false,
      },
    }
    expect(LibraryEntryVersioningSummarySchema.parse(summary)).toEqual(summary)
    expect(LibraryVersionListItemSchema.safeParse({
      ...listItem, isSuperseded: true,
    }).success).toBe(false)
    const state = {
      libraryEntryId: ids.entry, versionId: ids.version, versionNumber: 2,
      initialState: 'draft', transitions: [decision], terminalDecision: null,
      effectiveState: 'ready_for_review', currentRevisionId: ids.revision,
      currentRevisionHash: hashes.revision, traceabilityHash: hashes.trace,
      aggregateHash: hashes.target, isTerminal: false, isCurrentApproved: false,
      publicationState: 'unpublished',
    } as const
    expect(LibraryVersionDetailSchema.safeParse({
      version: listItem, profile: 'adventure', originV1,
      parent: { source: 'origin_v1', versionId: null, versionNumber: 1, hash: hashes.origin },
      revisions: [revision], currentRevision: revision, state,
      effectiveFindings: {
        versionId: ids.version, revisionId: ids.revision, traceabilityHash: hashes.trace,
        items: [{ ...finding, effectiveTraceabilityHash: hashes.trace }],
      },
      findingHistory: [finding], decisions: [decision], aggregateHash: hashes.target,
      acceptedRiskFindingKeys: [], separationOfDuties: null, currentApproved,
      flags: {
        editable: false, canSaveRevision: false, canReconcileFindings: false,
        canSubmitForReview: false, canDecide: true, canCreateNextVersion: false,
      }, publicationState: 'unpublished',
    }).success).toBe(true)
  })

  it('exige timeline ordenable con referencia exacta a la fila append-only', () => {
    expect(LibraryVersionTimelineSchema.safeParse({
      libraryEntryId: ids.entry,
      events: [{
        ordinal: 1, eventType: 'version_created', timestamp: createdAt,
        versionId: ids.version, versionNumber: 2, revisionId: null,
        actorId: ids.actor, targetHash: hashes.version,
        description: 'Versión derivada creada',
        source: { table: 'real_editorial_library_versions', rowId: ids.version },
      }],
      publicationState: 'unpublished',
    }).success).toBe(true)
  })
})

describe('adaptador interno de lecturas BIB-V03', () => {
  it('usa RPC parametrizado y valida entrada y salida', async () => {
    const data = {
      libraryEntryId: ids.entry, profile: 'adventure', originalVersion: originV1,
      derivedVersionCount: 0, openVersion: null, currentApproved,
      latestVersion: null, latestEffectiveState: 'origin_approved',
      publication: {
        entryState: 'unpublished', currentApprovedState: 'unpublished',
        publicationCount: 0, trawelConnected: false, automaticEnabled: false,
      },
    }
    const rpc = vi.fn().mockResolvedValue({ data, error: null })
    const repository = new SupabaseRealEditorialLibraryVersioningRepository(
      { rpc } as unknown as SupabaseClient,
    )
    await expect(repository.getVersioningSummary(ids.entry)).resolves.toEqual(data)
    expect(rpc).toHaveBeenCalledWith('real_editorial_library_versioning_summary', {
      p_library_entry_id: ids.entry,
    })
    expect(() => repository.getVersioningSummary('not-a-uuid')).toThrow()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('mantiene errores de lectura discriminados', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null, error: { message: 'REVISION_VERSION_MISMATCH' },
    })
    const repository = new SupabaseRealEditorialLibraryVersioningRepository(
      { rpc } as unknown as SupabaseClient,
    )
    await expect(repository.getVersionRevision(ids.version, ids.revision)).rejects
      .toMatchObject<Partial<LibraryVersioningRepositoryError>>({
        code: 'REVISION_VERSION_MISMATCH',
      })
  })
})

describe('migración estática BIB-V03', () => {
  it('contiene únicamente funciones estables de lectura y ninguna escritura de dominio', async () => {
    const sql = await readFile(new URL(
      '../supabase/migrations/20260807120000_real_editorial_library_version_history_reads.sql',
      import.meta.url,
    ), 'utf8')
    for (const read of [
      'versioning_summary', 'list_versions', 'version_detail', 'list_revisions',
      'version_revision', 'list_finding_history', 'effective_findings', 'list_decisions',
      'state_snapshot', 'current_approved_detail', 'timeline',
    ]) expect(sql).toContain(`real_editorial_library_${read}`)
    expect(sql).not.toMatch(/^\s*(?:insert\s+into|update|delete\s+from|truncate)\b/im)
    expect(sql).not.toMatch(/create\s+table|alter\s+table|create\s+trigger/i)
    expect(sql.match(/language plpgsql stable/g)?.length).toBeGreaterThanOrEqual(13)
  })

  it('restringe las lecturas a service_role y conserva publicación aislada', async () => {
    const sql = await readFile(new URL(
      '../supabase/migrations/20260807120000_real_editorial_library_version_history_reads.sql',
      import.meta.url,
    ), 'utf8')
    expect(sql).toContain('from public,anon,authenticated')
    expect(sql).toContain('grant execute on function public.real_editorial_library_timeline')
    expect(sql).toContain("'publicationState','unpublished'")
    expect(sql).not.toMatch(/publish\s*\(|enqueue\s*\(/i)
  })
})
