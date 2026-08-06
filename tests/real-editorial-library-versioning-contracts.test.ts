import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  CreateLibraryVersionCommandSchema,
  DecideLibraryVersionCommandSchema,
  getLibraryVersionDecisionTransition,
  isCanonicalLibraryContent,
  isCanonicalLibraryTitle,
  isTerminalLibraryVersionState,
  LibraryVersionCommandResultSchema,
  LibraryVersionDecisionSchema,
  LibraryVersionDomainErrorCodeSchema,
  LibraryVersionFindingSchema,
  LibraryVersionIdentitySchema,
  LibraryVersionRevisionSchema,
  LibraryVersionStateSnapshotSchema,
  LibraryVersionSummarySchema,
  ReconcileLibraryVersionFindingsCommandSchema,
  REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
  SaveLibraryVersionRevisionCommandSchema,
  SubmitLibraryVersionForReviewCommandSchema,
  type CreateLibraryVersionCommand,
  type LibraryVersionDecision,
  type LibraryVersionFinding,
  type LibraryVersionIdentity,
  type LibraryVersionRevision,
} from '@shared/real-editorial-library-contracts'

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  entry: '10000000-0000-4000-8000-000000000002',
  version: '10000000-0000-4000-8000-000000000003',
  parentVersion: '10000000-0000-4000-8000-000000000004',
  revision: '10000000-0000-4000-8000-000000000005',
  previousRevision: '10000000-0000-4000-8000-000000000006',
  finding: '10000000-0000-4000-8000-000000000007',
  decision: '10000000-0000-4000-8000-000000000008',
}
const hashes = {
  origin: 'a'.repeat(64),
  parent: 'b'.repeat(64),
  version: 'c'.repeat(64),
  content: 'd'.repeat(64),
  revision: 'e'.repeat(64),
  traceability: 'f'.repeat(64),
  target: '1'.repeat(64),
  request: '2'.repeat(64),
  finding: '3'.repeat(64),
  operation: '4'.repeat(64),
  changedText: '5'.repeat(64),
}
const createdAt = '2026-08-06T10:00:00.000Z'

const identityV2 = {
  id: ids.version,
  libraryEntryId: ids.entry,
  versionNumber: 2,
  parentVersionId: null,
  parentOriginVersionHash: hashes.origin,
  parentHash: hashes.origin,
  versionHash: hashes.version,
  canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
  creationReason: 'Primera version editorial derivada.',
  createdByActorId: ids.actor,
  createdAt,
  operationKey: hashes.operation,
  publicationState: 'unpublished',
} satisfies LibraryVersionIdentity

const revisionOne = {
  id: ids.revision,
  versionId: ids.version,
  revisionNumber: 1,
  previousRevisionId: null,
  expectedPreviousRevisionHash: null,
  title: 'Titulo canonicalizado',
  content: 'Contenido editorial con referencia [c1].\n',
  contentSchemaContract: 'investighost-library-content-v1',
  canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
  contentHash: hashes.content,
  revisionHash: hashes.revision,
  changeSummary: 'Snapshot inicial derivado sin alterar v1.',
  createdByActorId: ids.actor,
  createdAt,
  operationKey: hashes.operation,
} satisfies LibraryVersionRevision

const inheritedWarning = {
  id: ids.finding,
  versionId: ids.version,
  revisionId: ids.revision,
  findingKey: 'warning:w1',
  sequence: 1,
  supersedesFindingId: null,
  sourceFindingType: 'warning',
  sourceFindingId: 'w1',
  origin: 'inherited',
  disposition: 'pending',
  claimRelation: 'not_applicable',
  supportStatus: 'not_applicable',
  subjectText: 'Advertencia heredada de la revision final.',
  diffAnchor: null,
  claimIds: [],
  evidenceReferences: [],
  sourceIds: [],
  editorDeclaration: 'La advertencia permanece visible y pendiente.',
  justification: '',
  findingHash: hashes.finding,
  createdByActorId: ids.actor,
  createdAt,
  operationKey: hashes.operation,
} satisfies LibraryVersionFinding

const submittedDecision = {
  id: ids.decision,
  versionId: ids.version,
  revisionId: ids.revision,
  sequence: 1,
  decisionType: 'submit_for_review',
  expectedPreviousState: 'draft',
  resultingState: 'ready_for_review',
  revisionHash: hashes.revision,
  traceabilityHash: hashes.traceability,
  decisionTargetHash: hashes.target,
  aggregateHash: hashes.target,
  requestFingerprint: hashes.request,
  reason: 'Revision congelada para control humano.',
  actorId: ids.actor,
  actorRoleSnapshot: 'local_editor',
  affectedFindingKeys: [],
  changeInstructions: [],
  acceptedRiskFindingKeys: [],
  separationOfDutiesException: false,
  separationOfDutiesReason: null,
  publicationCount: 0,
  trawelConnected: false,
  automaticEnabled: false,
  createdAt,
  operationKey: hashes.operation,
} satisfies LibraryVersionDecision

describe('contratos BIB-V01 de versionado editorial', () => {
  it('acepta identidad v2, revision inicial, finding heredado y decision append-only', () => {
    expect(LibraryVersionIdentitySchema.parse(identityV2)).toEqual(identityV2)
    expect(LibraryVersionRevisionSchema.parse(revisionOne)).toEqual(revisionOne)
    expect(LibraryVersionFindingSchema.parse(inheritedWarning)).toEqual(inheritedWarning)
    expect(LibraryVersionDecisionSchema.parse(submittedDecision)).toEqual(submittedDecision)
  })

  it('impide representar v1 o romper el linaje derivado lineal', () => {
    expect(LibraryVersionIdentitySchema.safeParse({
      ...identityV2,
      versionNumber: 1,
    }).success).toBe(false)
    expect(LibraryVersionIdentitySchema.safeParse({
      ...identityV2,
      parentVersionId: ids.parentVersion,
    }).success).toBe(false)
    expect(LibraryVersionIdentitySchema.safeParse({
      ...identityV2,
      versionNumber: 3,
      parentVersionId: null,
      parentHash: hashes.parent,
    }).success).toBe(false)
  })

  it('solo admite SHA-256 minusculo y el contrato c14n aprobado', () => {
    expect(LibraryVersionIdentitySchema.safeParse({
      ...identityV2,
      versionHash: 'A'.repeat(64),
    }).success).toBe(false)
    expect(LibraryVersionIdentitySchema.safeParse({
      ...identityV2,
      canonicalizationContract: 'investighost-library-c14n-v2',
    }).success).toBe(false)
  })

  it('valida contenido ya canonicalizado sin afirmar paridad de hashes con PostgreSQL', () => {
    expect(isCanonicalLibraryTitle('Titulo NFC')).toBe(true)
    expect(isCanonicalLibraryContent('Linea uno\nLinea dos\n')).toBe(true)
    expect(isCanonicalLibraryTitle(' Titulo')).toBe(false)
    expect(isCanonicalLibraryTitle('Ti\u0065\u0301rra')).toBe(false)
    expect(isCanonicalLibraryContent('Linea CRLF\r\n')).toBe(false)
    expect(isCanonicalLibraryContent('Espacio final \n')).toBe(false)
    expect(isCanonicalLibraryContent('Dos saltos finales\n\n')).toBe(false)
    expect(isCanonicalLibraryContent('Sin salto final')).toBe(false)
    expect(isCanonicalLibraryContent('\n')).toBe(false)
  })

  it('exige cadena previa exactamente desde la revision 2', () => {
    expect(LibraryVersionRevisionSchema.safeParse({
      ...revisionOne,
      previousRevisionId: ids.previousRevision,
      expectedPreviousRevisionHash: hashes.parent,
    }).success).toBe(false)
    expect(LibraryVersionRevisionSchema.safeParse({
      ...revisionOne,
      revisionNumber: 2,
    }).success).toBe(false)
    expect(LibraryVersionRevisionSchema.safeParse({
      ...revisionOne,
      revisionNumber: 2,
      previousRevisionId: ids.previousRevision,
      expectedPreviousRevisionHash: hashes.parent,
    }).success).toBe(true)
  })

  it('distingue claims nuevos soportados y bloquea afirmaciones sin respaldo', () => {
    const supportedNewClaim = {
      ...inheritedWarning,
      sourceFindingType: 'claim',
      sourceFindingId: 'local-claim-1',
      findingKey: 'claim:local-claim-1',
      origin: 'new',
      claimRelation: 'new',
      supportStatus: 'supported',
      subjectText: 'Nueva afirmacion derivada de material capturado.',
      evidenceReferences: [{
        kind: 'evidence',
        referenceId: 'e1',
        locator: 'Expediente v1, evidencia e1',
      }],
      sourceIds: ['s1'],
    }
    expect(LibraryVersionFindingSchema.safeParse(supportedNewClaim).success).toBe(true)
    expect(LibraryVersionFindingSchema.safeParse({
      ...supportedNewClaim,
      evidenceReferences: [],
    }).success).toBe(false)
    expect(LibraryVersionFindingSchema.safeParse({
      ...supportedNewClaim,
      supportStatus: 'unsupported',
      disposition: 'accepted_risk',
      justification: 'Aceptado.',
    }).success).toBe(false)
  })

  it('requiere justificacion y ancla para resoluciones editoriales', () => {
    expect(LibraryVersionFindingSchema.safeParse({
      ...inheritedWarning,
      disposition: 'accepted_risk',
    }).success).toBe(false)
    expect(LibraryVersionFindingSchema.safeParse({
      ...inheritedWarning,
      disposition: 'resolved_editorially',
      justification: 'El texto advertido se elimino.',
      diffAnchor: null,
    }).success).toBe(false)
    expect(LibraryVersionFindingSchema.safeParse({
      ...inheritedWarning,
      disposition: 'resolved_editorially',
      justification: 'El texto advertido se elimino.',
      diffAnchor: {
        revisionHash: hashes.revision,
        startLine: 2,
        endLine: 2,
        changedTextHash: hashes.changedText,
      },
    }).success).toBe(true)
  })

  it('mantiene una tabla determinista y cerrada de transiciones', () => {
    expect(getLibraryVersionDecisionTransition('submit_for_review')).toEqual({
      from: 'draft',
      to: 'ready_for_review',
    })
    expect(getLibraryVersionDecisionTransition('approve')).toEqual({
      from: 'ready_for_review',
      to: 'approved',
    })
    expect(getLibraryVersionDecisionTransition('request_changes')).toEqual({
      from: 'ready_for_review',
      to: 'changes_requested',
    })
    expect(getLibraryVersionDecisionTransition('reject')).toEqual({
      from: 'ready_for_review',
      to: 'rejected',
    })
    expect(getLibraryVersionDecisionTransition('abandon')).toEqual({
      from: 'draft',
      to: 'abandoned',
    })
    expect(isTerminalLibraryVersionState('ready_for_review')).toBe(false)
    expect(isTerminalLibraryVersionState('changes_requested')).toBe(true)
  })

  it('rechaza transiciones, targets y excepciones humanas incoherentes', () => {
    expect(LibraryVersionDecisionSchema.safeParse({
      ...submittedDecision,
      resultingState: 'approved',
    }).success).toBe(false)
    expect(LibraryVersionDecisionSchema.safeParse({
      ...submittedDecision,
      aggregateHash: hashes.parent,
    }).success).toBe(false)
    expect(LibraryVersionDecisionSchema.safeParse({
      ...submittedDecision,
      separationOfDutiesException: true,
      separationOfDutiesReason: 'Unico operador local.',
    }).success).toBe(false)
  })

  it('valida read models derivados sin convertir approved en publicacion', () => {
    expect(LibraryVersionSummarySchema.safeParse({
      id: ids.version,
      libraryEntryId: ids.entry,
      versionNumber: 2,
      parentHash: hashes.origin,
      versionHash: hashes.version,
      state: 'approved',
      displayState: 'approved_current',
      latestRevisionId: ids.revision,
      latestRevisionNumber: 1,
      latestRevisionHash: hashes.revision,
      isCurrentApproved: true,
      publicationState: 'unpublished',
      createdByActorId: ids.actor,
      createdAt,
    }).success).toBe(true)
    expect(LibraryVersionStateSnapshotSchema.safeParse({
      libraryEntryId: ids.entry,
      versionId: ids.version,
      versionNumber: 2,
      state: 'approved',
      latestRevisionId: ids.revision,
      latestRevisionHash: hashes.revision,
      traceabilityHash: hashes.traceability,
      decisionTargetHash: hashes.target,
      latestDecisionId: ids.decision,
      isTerminal: true,
      isCurrentApproved: true,
      publicationState: 'unpublished',
      observedAt: createdAt,
    }).success).toBe(true)
  })
})

describe('comandos y resultados BIB-V01 aun no conectados', () => {
  const createCommand = {
    libraryEntryId: ids.entry,
    expectedHeadHash: hashes.origin,
    versionNumber: 2,
    parentVersionId: null,
    parentOriginVersionHash: hashes.origin,
    parentHash: hashes.origin,
    canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
    contentSchemaContract: 'investighost-library-content-v1',
    title: revisionOne.title,
    content: revisionOne.content,
    creationReason: 'Crear una version derivada.',
    createdByActorId: ids.actor,
    operationKey: hashes.operation,
  } satisfies CreateLibraryVersionCommand

  it('acepta create y exige CAS contra el head declarado', () => {
    expect(CreateLibraryVersionCommandSchema.safeParse(createCommand).success).toBe(true)
    expect(CreateLibraryVersionCommandSchema.safeParse({
      ...createCommand,
      expectedHeadHash: hashes.parent,
    }).success).toBe(false)
  })

  it('limita save y reconcile a draft con revision esperada', () => {
    const save = {
      versionId: ids.version,
      expectedState: 'draft',
      previousRevisionId: ids.revision,
      expectedPreviousRevisionHash: hashes.revision,
      revisionNumber: 2,
      canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
      contentSchemaContract: 'investighost-library-content-v1',
      title: revisionOne.title,
      content: 'Contenido revisado y completo.\n',
      changeSummary: 'Ajuste editorial trazable.',
      createdByActorId: ids.actor,
      operationKey: hashes.operation,
    }
    expect(SaveLibraryVersionRevisionCommandSchema.safeParse(save).success).toBe(true)
    expect(SaveLibraryVersionRevisionCommandSchema.safeParse({
      ...save,
      expectedState: 'ready_for_review',
    }).success).toBe(false)
    expect(ReconcileLibraryVersionFindingsCommandSchema.safeParse({
      versionId: ids.version,
      revisionId: ids.revision,
      expectedState: 'draft',
      expectedRevisionHash: hashes.revision,
      expectedTraceabilityHash: hashes.traceability,
      finding: {
        findingKey: inheritedWarning.findingKey,
        sequence: 2,
        supersedesFindingId: ids.finding,
        sourceFindingType: inheritedWarning.sourceFindingType,
        sourceFindingId: inheritedWarning.sourceFindingId,
        origin: inheritedWarning.origin,
        disposition: inheritedWarning.disposition,
        claimRelation: inheritedWarning.claimRelation,
        supportStatus: inheritedWarning.supportStatus,
        subjectText: inheritedWarning.subjectText,
        diffAnchor: inheritedWarning.diffAnchor,
        claimIds: inheritedWarning.claimIds,
        evidenceReferences: inheritedWarning.evidenceReferences,
        sourceIds: inheritedWarning.sourceIds,
        editorDeclaration: inheritedWarning.editorDeclaration,
        justification: inheritedWarning.justification,
      },
      createdByActorId: ids.actor,
      operationKey: hashes.operation,
    }).success).toBe(true)
  })

  it('congela el mismo target al enviar y decidir', () => {
    const submit = {
      versionId: ids.version,
      revisionId: ids.revision,
      expectedState: 'draft',
      revisionHash: hashes.revision,
      traceabilityHash: hashes.traceability,
      decisionTargetHash: hashes.target,
      aggregateHash: hashes.target,
      reason: 'Enviar a revision humana.',
      actorId: ids.actor,
      actorRoleSnapshot: 'local_editor',
      operationKey: hashes.operation,
      requestFingerprint: hashes.request,
    }
    expect(SubmitLibraryVersionForReviewCommandSchema.safeParse(submit).success).toBe(true)
    expect(SubmitLibraryVersionForReviewCommandSchema.safeParse({
      ...submit,
      aggregateHash: hashes.parent,
    }).success).toBe(false)

    const decide = {
      versionId: ids.version,
      revisionId: ids.revision,
      decisionType: 'request_changes',
      expectedPreviousState: 'ready_for_review',
      revisionHash: hashes.revision,
      traceabilityHash: hashes.traceability,
      decisionTargetHash: hashes.target,
      aggregateHash: hashes.target,
      reason: 'Debe corregirse el warning indicado.',
      actorId: ids.actor,
      actorRoleSnapshot: 'local_reviewer',
      affectedFindingKeys: [inheritedWarning.findingKey],
      changeInstructions: [],
      acceptedRiskFindingKeys: [],
      separationOfDutiesException: false,
      separationOfDutiesReason: null,
      operationKey: hashes.operation,
      requestFingerprint: hashes.request,
    }
    expect(DecideLibraryVersionCommandSchema.safeParse(decide).success).toBe(true)
    expect(DecideLibraryVersionCommandSchema.safeParse({
      ...decide,
      affectedFindingKeys: [],
    }).success).toBe(false)
    expect(DecideLibraryVersionCommandSchema.safeParse({
      ...decide,
      affectedFindingKeys: [],
      changeInstructions: ['Reescribir la frase sin ampliar el alcance factual.'],
    }).success).toBe(true)
  })

  it('expone errores previstos y resultados discriminados sin runtime', () => {
    expect(LibraryVersionDomainErrorCodeSchema.options).toEqual(expect.arrayContaining([
      'STALE_REVISION',
      'STALE_VERSION_STATE',
      'IDEMPOTENCY_CONFLICT',
      'VERSION_ALREADY_OPEN',
      'INVALID_STATE_TRANSITION',
      'HASH_MISMATCH',
      'UNSUPPORTED_CLAIM_BLOCKS_APPROVAL',
      'FINDINGS_NOT_RECONCILED',
      'VERSION_NOT_FOUND',
      'REVISION_NOT_FOUND',
      'ACTOR_NOT_AUTHORIZED',
    ]))
    expect(LibraryVersionCommandResultSchema.safeParse({
      status: 'error',
      code: 'STALE_REVISION',
      message: 'La revision esperada ya no es vigente.',
      retryable: true,
      operationKey: hashes.operation,
    }).success).toBe(true)
    expect(LibraryVersionCommandResultSchema.safeParse({
      status: 'ok',
      operation: 'save_revision',
      reused: false,
      versionId: ids.version,
      revisionId: ids.revision,
      state: 'draft',
      versionHash: hashes.version,
      revisionHash: hashes.revision,
      traceabilityHash: null,
      decisionTargetHash: null,
    }).success).toBe(true)
  })
})

describe('migracion estatica BIB-V01', () => {
  it('crea solo las cuatro tablas aditivas previstas y conserva v1', async () => {
    const sql = await readFile(new URL(
      '../supabase/migrations/20260806120000_real_editorial_library_versioning.sql',
      import.meta.url,
    ), 'utf8')

    expect(sql.match(/create table public\.real_editorial_library_version(?:s|_revisions|_findings|_decisions)\s*\(/g))
      .toHaveLength(4)
    expect(sql).not.toMatch(/alter table public\.real_editorial_library_entries/i)
    expect(sql).not.toMatch(/^\s*(?:insert\s+into|update|delete\s+from|truncate)\b/im)
    expect(sql).not.toMatch(/create\s+(?:or\s+replace\s+)?function/i)
    expect(sql).not.toMatch(/morella|tavily|openai|provider_calls|ledger|reservation/i)
  })

  it('declara linaje, hashes, restricciones, RLS e inmutabilidad', async () => {
    const sql = await readFile(new URL(
      '../supabase/migrations/20260806120000_real_editorial_library_versioning.sql',
      import.meta.url,
    ), 'utf8')

    expect(sql).toContain('version_number integer not null check (version_number >= 2)')
    expect(sql).toContain('unique (library_entry_id,version_number)')
    expect(sql).toContain('unique (library_entry_id,parent_hash)')
    expect(sql).toContain('parent_hash = parent_origin_version_hash')
    expect(sql).toContain("canonicalization_contract = 'investighost-library-c14n-v1'")
    expect(sql).toContain("operation_key ~ '^[a-f0-9]{64}$'")
    expect(sql).toContain('decision_target_hash = aggregate_hash')
    expect(sql).toContain("publication_count integer not null default 0 check (publication_count = 0)")
    expect(sql).toContain('trawel_connected boolean not null default false check (not trawel_connected)')
    expect(sql).toContain('automatic_enabled boolean not null default false check (not automatic_enabled)')
    expect(sql.match(/on delete restrict/g)?.length).toBeGreaterThanOrEqual(8)
    expect(sql.match(/enable row level security/g)).toHaveLength(4)
    expect(sql.match(/grant select on table public\./g)).toHaveLength(4)
    expect(sql.match(/before update or delete/g)).toHaveLength(4)
    expect(sql.match(/prevent_real_editorial_append_mutation\(\)/g)).toHaveLength(4)
  })
})
