import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  libraryRequestFingerprint,
  sha256Hex,
} from '@modules/library-versioning/canonicalization'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  CurrentApprovedLibraryContentSchema,
  EffectiveLibraryVersionFindingsSchema,
  LibraryEntryVersioningSummarySchema,
  LibraryVersionDetailSchema,
  LibraryVersionFindingHistoryItemSchema,
  LibraryVersionListItemSchema,
  LibraryVersionRevisionDetailSchema,
  LibraryVersionStateReadSnapshotSchema,
  LibraryVersionTimelineSchema,
} from '@shared/real-editorial-library-read-contracts'

const enabled = process.env.RUN_LIBRARY_VERSIONING_READS_INTEGRATION === '1'
const integrationDescribe = enabled ? describe : describe.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const database = 'investighost_library_versioning_bib_v03_test'
const migrations = [
  'supabase/migrations/20260806120000_real_editorial_library_versioning.sql',
  'supabase/migrations/20260806230000_real_editorial_library_versioning_transactions.sql',
  'supabase/migrations/20260807120000_real_editorial_library_version_history_reads.sql',
]
const actor = { actorId: MANUAL_LOCAL_ACTOR_ID, roleSnapshot: 'local_owner:edit' }

type CommandResult = {
  status: 'ok'
  versionId: string
  revisionId: string
  versionHash: string
  revisionHash: string
  traceabilityHash: string | null
  decisionTargetHash: string | null
  state: string
}

const scenario = {} as Record<string, CommandResult>
let readBaselineCounts = ''

integrationDescribe('BIB-V03 lecturas sobre PostgreSQL sintetico aislado', () => {
  beforeAll(() => {
    createDatabase()
    for (const migration of migrations) applyMigration(migration)
    seedSyntheticEntries(10)
    buildScenarios()
    readBaselineCounts = versioningCounts()
  }, 30_000)

  afterAll(() => dropDatabase())

  it('instala lecturas restringidas y resuelve resumen y fallback v1 sin escribir', () => {
    expect(psql(`select concat_ws('|',
      (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like 'real_editorial_library_%'
          and p.proname in (
            'real_editorial_library_origin_v1','real_editorial_library_list_revisions',
            'real_editorial_library_version_revision',
            'real_editorial_library_list_finding_history',
            'real_editorial_library_effective_findings',
            'real_editorial_library_list_decisions','real_editorial_library_state_snapshot',
            'real_editorial_library_current_approved_detail',
            'real_editorial_library_list_versions',
            'real_editorial_library_versioning_summary',
            'real_editorial_library_version_detail','real_editorial_library_timeline'
          ) and p.provolatile='s' and p.prosecdef),
      has_function_privilege('service_role',
        'public.real_editorial_library_versioning_summary(uuid)','EXECUTE'),
      not has_function_privilege('anon',
        'public.real_editorial_library_versioning_summary(uuid)','EXECUTE'),
      not has_function_privilege('authenticated',
        'public.real_editorial_library_versioning_summary(uuid)','EXECUTE')
    );`)).toBe('12|t|t|t')

    const entry = syntheticId('entry', 1)
    const summary = LibraryEntryVersioningSummarySchema.parse(readJson(
      `public.real_editorial_library_versioning_summary('${entry}')`,
    ))
    expect(summary).toMatchObject({
      libraryEntryId: entry,
      derivedVersionCount: 0,
      openVersion: null,
      latestVersion: null,
      latestEffectiveState: 'origin_approved',
      currentApproved: { source: 'origin_v1', versionNumber: 1 },
      publication: {
        publicationCount: 0, trawelConnected: false, automaticEnabled: false,
      },
    })
    expect(LibraryVersionListItemSchema.array().parse(readJson(
      `public.real_editorial_library_list_versions('${entry}')`,
    ))).toEqual([])
    expect(LibraryVersionTimelineSchema.parse(readJson(
      `public.real_editorial_library_timeline('${entry}')`,
    )).events).toEqual([])
    expectFailure(
      () => readJson(`public.real_editorial_library_versioning_summary('${syntheticId('entry', 99)}')`),
      'LIBRARY_ENTRY_NOT_FOUND',
    )
    expect(versioningCounts()).toBe(readBaselineCounts)
  }, 15_000)

  it('lee draft, revisiones, detalle y findings efectivos con orden y pertenencia', () => {
    const entry = syntheticId('entry', 2)
    const version = scenario.entry2
    const summary = LibraryEntryVersioningSummarySchema.parse(readJson(
      `public.real_editorial_library_versioning_summary('${entry}')`,
    ))
    expect(summary.openVersion).toMatchObject({
      versionId: version.versionId, effectiveState: 'draft', revisionCount: 2,
    })
    expect(summary.currentApproved.source).toBe('origin_v1')

    const revisions = LibraryVersionRevisionDetailSchema.array().parse(readJson(
      `public.real_editorial_library_list_revisions('${version.versionId}')`,
    ))
    expect(revisions.map(item => item.revisionNumber)).toEqual([1, 2])
    expect(revisions[1]).toMatchObject({
      id: version.revisionId,
      expectedPreviousRevisionHash: revisions[0].revisionHash,
    })
    expect(LibraryVersionRevisionDetailSchema.parse(readJson(
      `public.real_editorial_library_version_revision('${version.versionId}','${revisions[0].id}')`,
    )).revisionNumber).toBe(1)
    expectFailure(() => readJson(
      `public.real_editorial_library_version_revision('${version.versionId}',
        '${scenario.entry3.revisionId}')`,
    ), 'REVISION_VERSION_MISMATCH')
    expectFailure(() => readJson(
      `public.real_editorial_library_version_revision('${version.versionId}',
        '${syntheticId('revision', 99)}')`,
    ), 'REVISION_NOT_FOUND')

    const effective = EffectiveLibraryVersionFindingsSchema.parse(readJson(
      `public.real_editorial_library_effective_findings('${version.versionId}',null)`,
    ))
    expect(effective.revisionId).toBe(version.revisionId)
    expect(effective.items).toHaveLength(4)
    expect(effective.items.find(item => item.findingKey === 'warning:w1'))
      .toMatchObject({ sequence: 2, isBaseline: false, disposition: 'accepted_risk' })
    const history = LibraryVersionFindingHistoryItemSchema.array().parse(readJson(
      `public.real_editorial_library_list_finding_history('${version.versionId}')`,
    ))
    expect(history).toHaveLength(9)
    expect(history.filter(item => item.findingKey === 'warning:w1').map(item => item.sequence))
      .toEqual([1, 1, 2])

    const detail = LibraryVersionDetailSchema.parse(readJson(
      `public.real_editorial_library_version_detail('${version.versionId}')`,
    ))
    expect(detail.flags).toEqual({
      editable: true, canSaveRevision: true, canReconcileFindings: true,
      canSubmitForReview: true, canDecide: false, canCreateNextVersion: false,
    })
    expect(detail.originV1.evidence).toHaveLength(1)
    expect(detail.originV1.sources).toHaveLength(1)
    const timeline = LibraryVersionTimelineSchema.parse(readJson(
      `public.real_editorial_library_timeline('${entry}')`,
    ))
    expect(timeline.events.map(event => event.ordinal)).toEqual([1, 2, 3, 4])
    expect(timeline.events.map(event => event.eventType)).toEqual([
      'version_created', 'revision_saved', 'revision_saved', 'finding_reconciled',
    ])
  }, 15_000)

  it('proyecta aprobación vigente, riesgo aceptado y separación auditada', () => {
    const entry = syntheticId('entry', 3)
    const current = CurrentApprovedLibraryContentSchema.parse(readJson(
      `public.real_editorial_library_current_approved_detail('${entry}')`,
    ))
    expect(current).toMatchObject({
      source: 'derived', versionId: scenario.entry3.versionId,
      versionNumber: 3, revisionId: scenario.entry3.revisionId,
      publicationState: 'unpublished',
    })
    expect(current.approvalDecisionId).not.toBeNull()
    const detail = LibraryVersionDetailSchema.parse(readJson(
      `public.real_editorial_library_version_detail('${scenario.entry3.versionId}')`,
    ))
    expect(detail.state).toMatchObject({ effectiveState: 'approved', isTerminal: true })
    expect(detail.acceptedRiskFindingKeys).toEqual(['warning:w1'])
    expect(detail.separationOfDuties).toMatchObject({
      exception: true, actorRoleSnapshot: 'local_owner:approve',
    })
    expect(detail.version.terminalDecision).toMatchObject({
      decisionType: 'approve', publicationCount: 0,
      trawelConnected: false, automaticEnabled: false,
    })
  }, 15_000)

  it('calcula superseded y conserva current approved anterior ante una v3 abierta', () => {
    const entry = syntheticId('entry', 4)
    const versions = LibraryVersionListItemSchema.array().parse(readJson(
      `public.real_editorial_library_list_versions('${entry}')`,
    ))
    expect(versions.map(item => item.versionNumber)).toEqual([2, 3])
    expect(versions[0]).toMatchObject({
      effectiveState: 'approved', displayState: 'approved_current',
      isCurrentApproved: true, isSuperseded: false,
    })
    expect(versions[1]).toMatchObject({
      effectiveState: 'draft', parentVersionId: versions[0].versionId,
      parentHash: scenario.entry4v2.decisionTargetHash,
    })
    const summary = LibraryEntryVersioningSummarySchema.parse(readJson(
      `public.real_editorial_library_versioning_summary('${entry}')`,
    ))
    expect(summary.currentApproved.versionId).toBe(versions[0].versionId)
    expect(summary.openVersion?.versionId).toBe(versions[1].versionId)

    const approvedHistory = LibraryVersionListItemSchema.array().parse(readJson(
      `public.real_editorial_library_list_versions('${syntheticId('entry', 3)}')`,
    ))
    expect(approvedHistory[0]).toMatchObject({
      displayState: 'superseded', isSuperseded: true,
    })
    expect(approvedHistory[1]).toMatchObject({
      displayState: 'approved_current', isCurrentApproved: true,
    })
    expect(CurrentApprovedLibraryContentSchema.parse(readJson(
      `public.real_editorial_library_current_approved_detail('${syntheticId('entry', 3)}')`,
    )).versionId).toBe(scenario.entry3.versionId)
  }, 15_000)

  it('lee terminales, claims no respaldados y decisiones desde una única autoridad', () => {
    for (const [key, expected] of [
      ['entry5', 'changes_requested'], ['entry6', 'rejected'], ['entry7', 'abandoned'],
    ] as const) {
      const snapshot = LibraryVersionStateReadSnapshotSchema.parse(readJson(
        `public.real_editorial_library_state_snapshot('${scenario[key].versionId}')`,
      ))
      expect(snapshot.effectiveState).toBe(expected)
      expect(snapshot.terminalDecision?.resultingState).toBe(expected)
      expect(snapshot.isTerminal).toBe(true)
    }
    const unsupported = EffectiveLibraryVersionFindingsSchema.parse(readJson(
      `public.real_editorial_library_effective_findings('${scenario.entry8.versionId}',null)`,
    ))
    expect(unsupported.items.find(item => item.findingKey === 'claim:c1')).toMatchObject({
      claimRelation: 'modified', supportStatus: 'unsupported', disposition: 'pending',
    })
    expect(LibraryVersionStateReadSnapshotSchema.parse(readJson(
      `public.real_editorial_library_state_snapshot('${scenario.entry8.versionId}')`,
    )).effectiveState).toBe('draft')
    expect(versioningCounts()).not.toBe('0|0|0|0')
  }, 15_000)

  it('detecta historias y hashes corruptos sin ocultarlos', () => {
    psql(`set session_replication_role=replica;
      update public.real_editorial_library_version_decisions set sequence=3
       where version_id='${scenario.entry9.versionId}' and sequence=1;
      set session_replication_role=origin;`)
    expectFailure(() => readJson(
      `public.real_editorial_library_state_snapshot('${scenario.entry9.versionId}')`,
    ), 'INVALID_DECISION_HISTORY')

    psql(`set session_replication_role=replica;
      update public.real_editorial_library_version_revisions set content_hash='${'0'.repeat(64)}'
       where id='${scenario.entry10.revisionId}';
      set session_replication_role=origin;`)
    expectFailure(() => readJson(
      `public.real_editorial_library_version_detail('${scenario.entry10.versionId}')`,
    ), 'HASH_MISMATCH')
    expectFailure(() => readJson(
      `public.real_editorial_library_version_detail('${syntheticId('version', 99)}')`,
    ), 'VERSION_NOT_FOUND')
  }, 15_000)
})

function buildScenarios(): void {
  const entry2 = syntheticId('entry', 2)
  scenario.entry2 = save(
    createVersion(entry2, originHash(entry2), 'entry-2-v2'),
    'Segundo snapshot sintético', 'entry-2-save',
  )
  scenario.entry2 = reconcile(scenario.entry2, finding('warning', 'w1', {
    disposition: 'accepted_risk', justification: 'Riesgo sintético conservado.',
  }), 'entry-2-warning')

  scenario.entry3v2 = approveExistingDraft(
    createVersion(syntheticId('entry', 3), originHash(syntheticId('entry', 3)), 'entry-3-v2'),
    'entry-3-v2',
  )
  scenario.entry3 = approveExistingDraft(
    createVersion(
      syntheticId('entry', 3), scenario.entry3v2.decisionTargetHash!, 'entry-3-v3',
    ),
    'entry-3-v3', true,
  )

  scenario.entry4v2 = approveExistingDraft(
    createVersion(syntheticId('entry', 4), originHash(syntheticId('entry', 4)), 'entry-4-v2'),
    'entry-4-v2',
  )
  scenario.entry4v3 = createVersion(
    syntheticId('entry', 4), scenario.entry4v2.decisionTargetHash!, 'entry-4-v3',
  )

  scenario.entry5 = decideVersion(
    submitVersion(reconcileBaseline(createVersion(
      syntheticId('entry', 5), originHash(syntheticId('entry', 5)), 'entry-5-v2',
    ), 'entry-5-v2'), 'entry-5-submit'),
    'request_changes', 'entry-5-changes', { affectedFindingKeys: ['warning:w1'] },
  )
  scenario.entry6 = decideVersion(
    submitVersion(reconcileBaseline(createVersion(
      syntheticId('entry', 6), originHash(syntheticId('entry', 6)), 'entry-6-v2',
    ), 'entry-6-v2'), 'entry-6-submit'),
    'reject', 'entry-6-reject',
  )
  const abandoned = createVersion(
    syntheticId('entry', 7), originHash(syntheticId('entry', 7)), 'entry-7-v2',
  )
  scenario.entry7 = decideVersion(
    { ...abandoned, decisionTargetHash: decisionTarget(abandoned) },
    'abandon', 'entry-7-abandon',
  )

  const unsupported = createVersion(
    syntheticId('entry', 8), originHash(syntheticId('entry', 8)), 'entry-8-v2',
  )
  let current = { ...unsupported, traceabilityHash: traceHash(unsupported) }
  for (const item of [finding('warning', 'w1'), finding('gap', 'g1'),
    finding('contradiction', 'x1')]) {
    current = reconcile(current, item, `entry-8-${item.findingKey}`)
  }
  scenario.entry8 = reconcile(current, finding('claim', 'c1', {
    claimRelation: 'modified', supportStatus: 'unsupported',
  }), 'entry-8-claim')
  expectFailure(() => submitVersion(scenario.entry8, 'entry-8-submit'),
    'UNSUPPORTED_CLAIM_BLOCKS_APPROVAL')

  scenario.entry9 = submitVersion(reconcileBaseline(createVersion(
    syntheticId('entry', 9), originHash(syntheticId('entry', 9)), 'entry-9-v2',
  ), 'entry-9-v2'), 'entry-9-submit')
  scenario.entry10 = createVersion(
    syntheticId('entry', 10), originHash(syntheticId('entry', 10)), 'entry-10-v2',
  )
}

function approveExistingDraft(
  base: CommandResult,
  label: string,
  acceptedRisk = false,
): CommandResult {
  let reconciled = { ...base, traceabilityHash: traceHash(base) }
  for (const item of [
    finding('warning', 'w1', acceptedRisk ? {
      disposition: 'accepted_risk', justification: 'Riesgo sintético aceptado.',
    } : {}),
    finding('gap', 'g1'), finding('contradiction', 'x1'), finding('claim', 'c1'),
  ]) reconciled = reconcile(reconciled, item, `${label}-${item.findingKey}`)
  const submitted = submitVersion(reconciled, `${label}-submit`)
  return decideVersion(submitted, 'approve', `${label}-approve`, {
    acceptedRiskFindingKeys: acceptedRisk ? ['warning:w1'] : [],
    separationOfDutiesException: true,
    separationOfDutiesReason: 'Excepción local sintética auditada.',
  })
}

function createDatabase(): void {
  dropDatabase()
  docker(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', database])
  const schema = docker([
    'exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres',
    '--schema-only', '--no-owner', '--schema=public',
  ]).replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin.*;\r?$/gmu, '')
  psql(`drop schema public cascade;
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;`)
  docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1'], schema)
}

function applyMigration(path: string): void {
  if (migrationAlreadyInstalled(path)) return
  docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1'], readFileSync(path, 'utf8'))
}

function migrationAlreadyInstalled(path: string): boolean {
  const probe = path.includes('20260806120000')
    ? "to_regclass('public.real_editorial_library_versions')"
    : path.includes('20260806230000')
      ? "to_regprocedure('public.real_editorial_library_create_version(jsonb)')"
      : path.includes('20260807120000')
        ? "to_regprocedure('public.real_editorial_library_origin_v1(uuid)')"
        : null
  return probe !== null && psql(`select ${probe} is not null;`) === 't'
}

function seedSyntheticEntries(total: number): void {
  const rows = Array.from({ length: total }, (_, index) => index + 1).map(number => `
    insert into public.real_editorial_library_transfers (
      id,transfer_key,pilot_id,run_id,snapshot_artifact_id,snapshot_hash,
      adventure_artifact_id,adventure_hash,student_artifact_id,student_hash,
      review_artifact_id,review_hash,terminal_decision_id,approval_actor_id,
      transfer_actor_id,resulting_state,final_run_cost,currency,provider_calls_performed,
      reservations_created,ledger_cost,publication_count,trawel_connected,
      automatic_enabled,audit_event_id
    ) values (
      '${syntheticId('transfer', number)}','${String(number).padStart(64, '0')}',
      '${syntheticId('pilot', number)}','${syntheticId('run', number)}',
      '${syntheticId('snapshot', number)}','${'1'.repeat(64)}',
      '${syntheticId('adventure', number)}','${'2'.repeat(64)}',
      '${syntheticId('student', number)}','${'3'.repeat(64)}',
      '${syntheticId('review', number)}','${'4'.repeat(64)}',
      '${syntheticId('decision', number)}','${MANUAL_LOCAL_ACTOR_ID}',
      '${MANUAL_LOCAL_ACTOR_ID}','ready_for_library',0,'EUR',0,0,0,0,false,false,
      '${syntheticId('audit', number)}'
    );
    insert into public.real_editorial_library_entries (
      id,entry_key,transfer_id,pilot_id,run_id,canonical_destination_id,destination_name,
      country_code,destination_type,profile,title,content,editorial_version,language,status,
      editorial_state,library_state,publication_state,origin,source_artifact_id,
      source_artifact_kind,source_artifact_key,source_artifact_version,source_artifact_hash,
      source_artifact_created_at,final_review_artifact_id,final_review_hash,
      final_review_version,final_review_created_at,terminal_decision_id,review_outcome,
      review_payload,warnings,gaps,contradictions,claims,evidence,sources,
      approval_actor_id,transfer_actor_id,final_run_cost,currency,approved_at
    ) values (
      '${syntheticId('entry', number)}','${sha256Hex(`entry-${number}`)}',
      '${syntheticId('transfer', number)}','${syntheticId('pilot', number)}',
      '${syntheticId('run', number)}','${syntheticId('geo', number)}',
      'Destino sintético ${number}','ES','locality','adventure','Título origen ${number}',
      E'Contenido origen ${number}\\n',1,'es-ES','approved_unpublished','approved',
      'ready_for_library','unpublished','real_editorial_pilot',
      '${syntheticId('adventure', number)}','draft_adventure','adventure',1,
      '${'2'.repeat(64)}',now(),'${syntheticId('review', number)}','${'4'.repeat(64)}',
      1,now(),'${syntheticId('decision', number)}','passed_with_warnings','{}',
      '[{"id":"w1","message":"Warning sintético"}]',
      '[{"id":"g1","description":"Gap sintético"}]',
      '[{"id":"x1","message":"Contradicción sintética"}]',
      '[{"id":"c1","statement":"Claim sintético"}]',
      '[{"id":"e1","content":"Evidencia sintética"}]',
      '[{"id":"s1","content":"Fuente sintética"}]',
      '${MANUAL_LOCAL_ACTOR_ID}','${MANUAL_LOCAL_ACTOR_ID}',0,'EUR',now()
    );`).join('\n')
  psqlInput(`set session_replication_role=replica; ${rows}
    set session_replication_role=origin;`)
}

function createVersion(entryId: string, head: string, label: string): CommandResult {
  return call('real_editorial_library_create_version', rpcCommand('create_version', {
    libraryEntryId: entryId, expectedHeadHash: head,
    canonicalizationContract: 'investighost-library-c14n-v1',
    contentSchemaContract: 'investighost-library-content-v1',
    title: `Título ${label}`, content: 'Contenido derivado sintético.\n',
    creationReason: 'Creación sintética trazable.', actor,
  }, `${label}-create`))
}

function save(base: CommandResult, title: string, label: string): CommandResult {
  return call('real_editorial_library_save_revision', rpcCommand('save_revision', {
    versionId: base.versionId, expectedState: 'draft',
    expectedPreviousRevisionHash: base.revisionHash,
    canonicalizationContract: 'investighost-library-c14n-v1',
    contentSchemaContract: 'investighost-library-content-v1',
    title, content: `${title}.\n`, changeSummary: 'Guardado sintético.', actor,
  }, label))
}

function finding(type: 'warning' | 'gap' | 'contradiction' | 'claim', id: string,
  patch: Record<string, unknown> = {}) {
  return {
    findingKey: `${type}:${id}`, sourceFindingType: type, sourceFindingId: id,
    origin: 'inherited', disposition: 'pending',
    claimRelation: type === 'claim' ? 'preserved' : 'not_applicable',
    supportStatus: type === 'claim' ? 'supported' : 'not_applicable',
    subjectText: `Finding ${type} sintético`, diffAnchor: null,
    claimIds: type === 'claim' ? [id] : [], evidenceReferences: [], sourceIds: [],
    editorDeclaration: 'Reconciliación sintética explícita.', justification: '', ...patch,
  }
}

function reconcile(base: CommandResult, item: ReturnType<typeof finding>, label: string) {
  return call('real_editorial_library_reconcile_finding', rpcCommand('reconcile_findings', {
    versionId: base.versionId, revisionId: base.revisionId, expectedState: 'draft',
    expectedRevisionHash: base.revisionHash,
    expectedTraceabilityHash: base.traceabilityHash ?? traceHash(base), finding: item, actor,
  }, label))
}

function reconcileBaseline(base: CommandResult, label: string): CommandResult {
  let result = { ...base, traceabilityHash: traceHash(base) }
  for (const item of [finding('warning', 'w1'), finding('gap', 'g1'),
    finding('contradiction', 'x1'), finding('claim', 'c1')]) {
    result = reconcile(result, item, `${label}-${item.findingKey}`)
  }
  return result
}

function submitVersion(base: CommandResult, label: string): CommandResult {
  return call('real_editorial_library_submit_for_review', rpcCommand('submit_for_review', {
    versionId: base.versionId, revisionId: base.revisionId, expectedState: 'draft',
    expectedRevisionHash: base.revisionHash,
    expectedTraceabilityHash: base.traceabilityHash ?? traceHash(base),
    reason: 'Envío sintético a revisión.',
    actor: { ...actor, roleSnapshot: 'local_owner:submit' },
  }, label))
}

function decideVersion(base: CommandResult,
  type: 'approve' | 'request_changes' | 'reject' | 'abandon', label: string,
  patch: Record<string, unknown> = {}): CommandResult {
  return call('real_editorial_library_decide_version', rpcCommand('decide_version', {
    versionId: base.versionId, revisionId: base.revisionId, decisionType: type,
    expectedPreviousState: type === 'abandon' ? 'draft' : 'ready_for_review',
    expectedDecisionTargetHash: base.decisionTargetHash,
    reason: `Decisión sintética ${type}.`, affectedFindingKeys: [],
    changeInstructions: [], acceptedRiskFindingKeys: [],
    separationOfDutiesException: false, separationOfDutiesReason: null,
    actor: { ...actor, roleSnapshot: `local_owner:${type}` }, ...patch,
  }, label))
}

function rpcCommand(operation: string, semantic: Record<string, unknown>, label: string) {
  return {
    ...semantic, operationKey: sha256Hex(label),
    requestFingerprint: libraryRequestFingerprint(operation, semantic),
    actorRoleSnapshot: (semantic.actor as typeof actor).roleSnapshot,
  }
}

function call(functionName: string, command: Record<string, unknown>): CommandResult {
  return readJson(`public.${functionName}(${literalJson(command)})`) as CommandResult
}

function traceHash(result: CommandResult): string {
  return psql(`select public.real_editorial_library_traceability_hash(
    '${result.versionId}','${result.revisionId}');`)
}

function decisionTarget(result: CommandResult): string {
  return psql(`select public.real_editorial_library_decision_target_hash(
    '${result.versionHash}','${result.revisionHash}','${result.traceabilityHash ?? traceHash(result)}');`)
}

function originHash(entryId: string): string {
  return psql(`select public.real_editorial_library_origin_hash(e)
    from public.real_editorial_library_entries e where e.id='${entryId}';`)
}

function versioningCounts(): string {
  return psql(`select concat_ws('|',
    (select count(*) from public.real_editorial_library_versions),
    (select count(*) from public.real_editorial_library_version_revisions),
    (select count(*) from public.real_editorial_library_version_findings),
    (select count(*) from public.real_editorial_library_version_decisions));`)
}

function readJson(expression: string): unknown {
  return JSON.parse(psql(`select ${expression}::text;`))
}

function literalJson(value: unknown): string {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`
}

function psql(sql: string): string {
  return docker(['exec', container, 'psql', '-U', 'postgres', '-d', database,
    '-AtX', '-v', 'ON_ERROR_STOP=1', '-c', sql]).trim()
}

function psqlInput(sql: string): string {
  return docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database,
    '-AtX', '-v', 'ON_ERROR_STOP=1'], sql).trim()
}

function docker(args: string[], input?: string): string {
  return execFileSync(dockerExecutable, args, {
    encoding: 'utf8', input, stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : undefined,
  })
}

function dropDatabase(): void {
  docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database])
}

function expectFailure(action: () => unknown, code: string): void {
  try { action(); throw new Error(`${code} no fue rechazado`) }
  catch (error) { expect(sanitizedError(error)).toContain(code) }
}

function sanitizedError(error: unknown): string {
  const value = error as { stderr?: string; message?: string }
  return String(value.stderr ?? value.message ?? error).replace(/[a-f0-9]{64}/gi, '[hash]')
}

function syntheticId(kind: string, number: number): string {
  const prefixes: Record<string, string> = {
    transfer: '91000000', entry: '92000000', pilot: '93000000', run: '94000000',
    snapshot: '95000000', adventure: '96000000', student: '97000000',
    review: '98000000', decision: '99000000', audit: '9a000000', geo: '9b000000',
    revision: '9c000000', version: '9d000000',
  }
  return `${prefixes[kind]}-0000-4000-8000-${String(number).padStart(12, '0')}`
}
