import { execFile, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  libraryRequestFingerprint,
  sha256Hex,
} from '@modules/library-versioning/canonicalization'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'

const enabled = process.env.RUN_LIBRARY_VERSIONING_INTEGRATION === '1'
const integrationDescribe = enabled ? describe : describe.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const database = 'investighost_library_versioning_bib_v02_test'
const execFileAsync = promisify(execFile)
const migrationV01 = 'supabase/migrations/20260806120000_real_editorial_library_versioning.sql'
const migrationV02 =
  'supabase/migrations/20260806230000_real_editorial_library_versioning_transactions.sql'
const actor = { actorId: MANUAL_LOCAL_ACTOR_ID, roleSnapshot: 'local_owner:edit' }

type CommandResult = {
  status: 'ok'
  reused: boolean
  versionId: string
  revisionId: string
  versionHash: string
  revisionHash: string
  traceabilityHash: string | null
  decisionTargetHash: string | null
  state: string
}

integrationDescribe('BIB-V02 transaccional sobre PostgreSQL sintetico aislado', () => {
  beforeAll(() => {
    createDatabase()
    installMigrations()
    seedSyntheticEntries(10)
  })

  afterAll(() => dropDatabase())

  it('mantiene paridad reproducible entre canonicalizacion y hashes TypeScript/PostgreSQL', () => {
    expect(psql(`
      select concat_ws('|',
        (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relrowsecurity and c.relname in (
            'real_editorial_library_versions','real_editorial_library_version_revisions',
            'real_editorial_library_version_findings','real_editorial_library_version_decisions'
          )),
        (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
          where not t.tgisinternal and t.tgenabled='O' and t.tgname in (
            'real_editorial_library_versions_append_only',
            'real_editorial_library_version_revisions_append_only',
            'real_editorial_library_version_findings_append_only',
            'real_editorial_library_version_decisions_append_only'
          )),
        (select count(*) from information_schema.table_privileges
          where table_schema='public' and grantee='service_role' and privilege_type='SELECT'
            and table_name in (
              'real_editorial_library_versions','real_editorial_library_version_revisions',
              'real_editorial_library_version_findings','real_editorial_library_version_decisions'
            )),
        has_function_privilege('service_role',
          'public.real_editorial_library_create_version(jsonb)','EXECUTE')
          and not has_function_privilege('anon',
            'public.real_editorial_library_create_version(jsonb)','EXECUTE')
          and not has_function_privilege('authenticated',
            'public.real_editorial_library_create_version(jsonb)','EXECUTE')
      );
    `)).toBe('4|4|4|t')
    const payload = { z: [3, true], a: 'á' }
    expect(psql(`select public.real_editorial_library_jcs(${literalJson(payload)});`)).toBe(
      '{"a":"á","z":[3,true]}',
    )
    expect(psql(`select public.real_editorial_library_hash(${literalJson(payload)});`)).toBe(
      sha256Hex('{"a":"á","z":[3,true]}'),
    )
    expect(psql(`
      select public.real_editorial_library_canonical_title(
          chr(65279) || '  Cafe' || chr(769) || '  '
        ) = 'Café'
        and public.real_editorial_library_canonical_content(
          'Linea uno ' || chr(9) || chr(13) || chr(10)
          || 'Linea dos' || chr(9) || chr(13) || chr(10) || chr(13) || chr(10)
        ) = 'Linea uno' || chr(10) || 'Linea dos' || chr(10);
    `)).toBe('t')
  })

  it('crea v2/v3, reconcilia, aprueba y resuelve current approved sin alterar v1', () => {
    const entryId = syntheticId('entry', 1)
    const originBefore = originSnapshot(entryId)
    const v2 = createVersion(entryId, originHash(entryId), 'entry-1-v2')
    expect(v2.state).toBe('draft')
    expect(count('real_editorial_library_versions', `library_entry_id='${entryId}'`)).toBe(1)

    const reconciled = reconcileBaseline(v2, 'entry-1-v2')
    const submit = submitVersion(reconciled, 'entry-1-v2-submit')
    const approved = decideVersion(submit, 'approve', 'entry-1-v2-approve', {
      separationOfDutiesException: true,
      separationOfDutiesReason: 'Excepcion local sintetica auditada.',
    })
    expect(approved.state).toBe('approved')
    expect(psql(`select concat_ws('|',v.publication_state,d.publication_count,
      d.trawel_connected,d.automatic_enabled)
      from public.real_editorial_library_versions v
      join public.real_editorial_library_version_decisions d on d.version_id=v.id
      where v.id='${v2.versionId}' and d.decision_type='approve';`)).toBe(
      'unpublished|0|f|f',
    )
    const current = JSON.parse(psql(
      `select public.real_editorial_library_current_approved('${entryId}'::uuid)::text;`,
    )) as { source: string; versionNumber: number; publicationState: string }
    expect(current).toMatchObject({
      source: 'derived', versionNumber: 2, publicationState: 'unpublished',
    })

    const v3 = createVersion(entryId, approved.decisionTargetHash!, 'entry-1-v3')
    expect(psql(`select version_number || '|' || parent_version_id::text
      from public.real_editorial_library_versions where id='${v3.versionId}';`)).toBe(
      `3|${v2.versionId}`,
    )
    expect(originSnapshot(entryId)).toBe(originBefore)
  })

  it('aplica idempotencia conflict-aware y rollback completo', async () => {
    const entryId = syntheticId('entry', 2)
    const semantic = createSemantic(entryId, originHash(entryId), 'Titulo sintetico')
    const command = rpcCommand('create_version', semantic, 'entry-2-create')
    const first = call('real_editorial_library_create_version', command)
    const repeated = call('real_editorial_library_create_version', command)
    expect(repeated).toMatchObject({
      reused: true, versionId: first.versionId, revisionId: first.revisionId,
    })
    expectFailure(() => call('real_editorial_library_create_version', {
      ...command,
      title: 'Payload divergente',
      requestFingerprint: libraryRequestFingerprint('create_version', {
        ...semantic, title: 'Payload divergente',
      }),
    }), 'IDEMPOTENCY_CONFLICT')

    const entry3 = syntheticId('entry', 3)
    const same = rpcCommand(
      'create_version', createSemantic(entry3, originHash(entry3), 'Concurrente'),
      'entry-3-timeout-retry',
    )
    const concurrent = await Promise.all([
      callAsync('real_editorial_library_create_version', same),
      callAsync('real_editorial_library_create_version', same),
    ])
    expect(new Set(concurrent.map(result => result.versionId)).size).toBe(1)
    expect(concurrent.some(result => result.reused)).toBe(true)

    const entry10 = syntheticId('entry', 10)
    const head10 = originHash(entry10)
    const conflictKey = 'entry-10-same-operation-key'
    const divergent = await Promise.allSettled([
      callAsync('real_editorial_library_create_version', rpcCommand(
        'create_version', createSemantic(entry10, head10, 'Payload A'), conflictKey,
      )),
      callAsync('real_editorial_library_create_version', rpcCommand(
        'create_version', createSemantic(entry10, head10, 'Payload B'), conflictKey,
      )),
    ])
    expect(divergent.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(rejectionText(divergent)).toContain('IDEMPOTENCY_CONFLICT')

    const before = count('real_editorial_library_version_findings',
      `version_id='${first.versionId}'`)
    expectFailure(() => reconcile(first, {
      ...finding('warning', 'w1'),
      origin: 'inherited', sourceFindingId: 'foreign-warning',
    }, 'entry-2-invalid-origin'), 'ORIGIN_REFERENCE_INVALID')
    expect(count('real_editorial_library_version_findings',
      `version_id='${first.versionId}'`)).toBe(before)
  })

  it('serializa creaciones, saves, submits y decisiones concurrentes', async () => {
    const entry4 = syntheticId('entry', 4)
    const head4 = originHash(entry4)
    const creations = await Promise.allSettled([
      callAsync('real_editorial_library_create_version', rpcCommand(
        'create_version', createSemantic(entry4, head4, 'Candidato A'), 'entry-4-a',
      )),
      callAsync('real_editorial_library_create_version', rpcCommand(
        'create_version', createSemantic(entry4, head4, 'Candidato B'), 'entry-4-b',
      )),
    ])
    expect(creations.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(rejectionText(creations)).toMatch(/VERSION_ALREADY_OPEN|HASH_MISMATCH/)
    const open = creations.find(
      (result): result is PromiseFulfilledResult<CommandResult> => result.status === 'fulfilled',
    )!.value

    const saves = await Promise.allSettled([
      saveAsync(open, 'Guardado A', 'entry-4-save-a'),
      saveAsync(open, 'Guardado B', 'entry-4-save-b'),
    ])
    expect(saves.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(rejectionText(saves)).toContain('STALE_REVISION')
    const saved = saves.find(
      (result): result is PromiseFulfilledResult<CommandResult> => result.status === 'fulfilled',
    )!.value
    const ready = reconcileBaseline(saved, 'entry-4-ready')
    const submits = await Promise.allSettled([
      submitVersionAsync(ready, 'entry-4-submit-a'),
      submitVersionAsync(ready, 'entry-4-submit-b'),
    ])
    expect(submits.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(rejectionText(submits)).toContain('STALE_VERSION_STATE')
    const submitted = submits.find(
      (result): result is PromiseFulfilledResult<CommandResult> => result.status === 'fulfilled',
    )!.value
    const terminal = await Promise.allSettled([
      decideVersionAsync(submitted, 'approve', 'entry-4-approve', {
        separationOfDutiesException: true,
        separationOfDutiesReason: 'Excepcion local concurrente sintetica.',
      }),
      decideVersionAsync(submitted, 'reject', 'entry-4-reject'),
    ])
    expect(terminal.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(rejectionText(terminal)).toContain('STALE_VERSION_STATE')
    expect(count('real_editorial_library_version_decisions',
      `version_id='${open.versionId}' and decision_type in ('approve','reject')`)).toBe(1)
    expect(count('real_editorial_library_versions', `library_entry_id='${entry4}'`)).toBe(1)
    expect(count('real_editorial_library_version_revisions',
      `version_id='${open.versionId}'`)).toBe(2)
    expect(Number(psql(`select count(*) from public.real_editorial_library_versions v
      left join public.real_editorial_library_version_revisions r on r.version_id=v.id
      where r.id is null;`))).toBe(0)

    const submittedTwice = prepareSubmitted(9, 'entry-9-submit')
    const approvals = await Promise.allSettled([
      decideVersionAsync(submittedTwice, 'approve', 'entry-9-approve-a', {
        separationOfDutiesException: true,
        separationOfDutiesReason: 'Excepcion sintetica A.',
      }),
      decideVersionAsync(submittedTwice, 'approve', 'entry-9-approve-b', {
        separationOfDutiesException: true,
        separationOfDutiesReason: 'Excepcion sintetica B.',
      }),
    ])
    expect(approvals.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(rejectionText(approvals)).toContain('STALE_VERSION_STATE')
  })

  it('bloquea claims sin respaldo y registra cambios, rechazo y abandono terminales', () => {
    const unsupported = createVersion(
      syntheticId('entry', 5), originHash(syntheticId('entry', 5)), 'entry-5',
    )
    let current = traceHash(unsupported)
    for (const item of [finding('warning', 'w1'), finding('gap', 'g1'), finding('contradiction', 'x1')]) {
      const result = reconcile({ ...unsupported, traceabilityHash: current }, item,
        `entry-5-${item.findingKey}`)
      current = result.traceabilityHash!
    }
    const unsupportedClaim = finding('claim', 'c1', {
      claimRelation: 'modified', supportStatus: 'unsupported',
    })
    const blocked = reconcile(
      { ...unsupported, traceabilityHash: current }, unsupportedClaim, 'entry-5-claim',
    )
    expectFailure(() => submitVersion(blocked, 'entry-5-submit'),
      'UNSUPPORTED_CLAIM_BLOCKS_APPROVAL')

    const changes = prepareSubmitted(6, 'changes')
    expect(decideVersion(changes, 'request_changes', 'entry-6-changes', {
      affectedFindingKeys: ['warning:w1'],
    }).state).toBe('changes_requested')
    expect(decideVersion(prepareSubmitted(7, 'reject'), 'reject', 'entry-7-reject').state)
      .toBe('rejected')
    const abandoned = createVersion(
      syntheticId('entry', 8), originHash(syntheticId('entry', 8)), 'entry-8',
    )
    const abandonTarget = decisionTarget(abandoned)
    expect(decideVersion({ ...abandoned, decisionTargetHash: abandonTarget },
      'abandon', 'entry-8-abandon').state).toBe('abandoned')
    expectFailure(() => save(abandoned, 'No reabrir', 'entry-8-late-save'),
      'STALE_VERSION_STATE')
  })
})

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

function installMigrations(): void {
  if (psql("select to_regclass('public.real_editorial_library_versions') is not null;") !== 't') {
    applyMigration(migrationV01)
  }
  if (psql("select to_regprocedure('public.real_editorial_library_create_version(jsonb)') is not null;") !== 't') {
    applyMigration(migrationV02)
  }
}

function applyMigration(path: string): void {
  docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1'], readFileSync(path, 'utf8'))
}

function seedSyntheticEntries(total: number): void {
  const rows = Array.from({ length: total }, (_, index) => index + 1).map(number => {
    const transfer = syntheticId('transfer', number)
    const entry = syntheticId('entry', number)
    const pilot = syntheticId('pilot', number)
    const run = syntheticId('run', number)
    return `
      insert into public.real_editorial_library_transfers (
        id,transfer_key,pilot_id,run_id,snapshot_artifact_id,snapshot_hash,
        adventure_artifact_id,adventure_hash,student_artifact_id,student_hash,
        review_artifact_id,review_hash,terminal_decision_id,approval_actor_id,
        transfer_actor_id,resulting_state,final_run_cost,currency,provider_calls_performed,
        reservations_created,ledger_cost,publication_count,trawel_connected,
        automatic_enabled,audit_event_id
      ) values (
        '${transfer}','${String(number).padStart(64, '0')}','${pilot}','${run}',
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
        '${entry}','${sha256Hex(`entry-${number}`)}','${transfer}','${pilot}','${run}',
        '${syntheticId('geo', number)}','Destino sintetico ${number}','ES','locality',
        'adventure','Titulo origen ${number}',E'Contenido origen ${number}\\n',1,'es-ES',
        'approved_unpublished','approved','ready_for_library','unpublished',
        'real_editorial_pilot','${syntheticId('adventure', number)}','draft_adventure',
        'adventure',1,'${'2'.repeat(64)}',now(),'${syntheticId('review', number)}',
        '${'4'.repeat(64)}',1,now(),'${syntheticId('decision', number)}',
        'passed_with_warnings','{}',
        '[{"id":"w1","message":"Warning sintetico"}]',
        '[{"id":"g1","description":"Gap sintetico"}]',
        '[{"id":"x1","message":"Contradiccion sintetica"}]',
        '[{"id":"c1","statement":"Claim sintetico"}]',
        '[{"id":"e1","content":"Evidencia sintetica"}]',
        '[{"id":"s1","content":"Fuente sintetica"}]',
        '${MANUAL_LOCAL_ACTOR_ID}','${MANUAL_LOCAL_ACTOR_ID}',0,'EUR',now()
      );`
  }).join('\n')
  psqlInput(`set session_replication_role=replica; ${rows}
    set session_replication_role=origin;`)
}

function createSemantic(entryId: string, expectedHeadHash: string, title: string) {
  return {
    libraryEntryId: entryId,
    expectedHeadHash,
    canonicalizationContract: 'investighost-library-c14n-v1',
    contentSchemaContract: 'investighost-library-content-v1',
    title,
    content: 'Contenido derivado sintetico.\n',
    creationReason: 'Creacion sintetica trazable.',
    actor,
  }
}

function createVersion(entryId: string, head: string, label: string): CommandResult {
  return call('real_editorial_library_create_version', rpcCommand(
    'create_version', createSemantic(entryId, head, `Titulo ${label}`), `${label}-create`,
  ))
}

function save(base: CommandResult, title: string, label: string): CommandResult {
  return call('real_editorial_library_save_revision', rpcCommand('save_revision', {
    versionId: base.versionId, expectedState: 'draft',
    expectedPreviousRevisionHash: base.revisionHash,
    canonicalizationContract: 'investighost-library-c14n-v1',
    contentSchemaContract: 'investighost-library-content-v1',
    title, content: `${title}.\n`, changeSummary: 'Guardado sintetico.', actor,
  }, label))
}

function saveAsync(base: CommandResult, title: string, label: string) {
  return callAsync('real_editorial_library_save_revision', rpcCommand('save_revision', {
    versionId: base.versionId, expectedState: 'draft',
    expectedPreviousRevisionHash: base.revisionHash,
    canonicalizationContract: 'investighost-library-c14n-v1',
    contentSchemaContract: 'investighost-library-content-v1',
    title, content: `${title}.\n`, changeSummary: 'Guardado sintetico concurrente.', actor,
  }, label))
}

function finding(type: 'warning' | 'gap' | 'contradiction' | 'claim', id: string,
  patch: Record<string, unknown> = {}) {
  return {
    findingKey: `${type}:${id}`, sourceFindingType: type, sourceFindingId: id,
    origin: 'inherited', disposition: 'pending',
    claimRelation: type === 'claim' ? 'preserved' : 'not_applicable',
    supportStatus: type === 'claim' ? 'supported' : 'not_applicable',
    subjectText: `Finding ${type} sintetico`, diffAnchor: null,
    claimIds: type === 'claim' ? [id] : [], evidenceReferences: [], sourceIds: [],
    editorDeclaration: 'Reconciliacion sintetica explicita.', justification: '', ...patch,
  }
}

function reconcile(base: CommandResult, item: ReturnType<typeof finding>, label: string) {
  const expectedTraceabilityHash = base.traceabilityHash ?? traceHash(base)
  return call('real_editorial_library_reconcile_finding', rpcCommand('reconcile_findings', {
    versionId: base.versionId, revisionId: base.revisionId, expectedState: 'draft',
    expectedRevisionHash: base.revisionHash, expectedTraceabilityHash,
    finding: item, actor,
  }, label))
}

function reconcileBaseline(base: CommandResult, label: string): CommandResult {
  let result = { ...base, traceabilityHash: traceHash(base) }
  for (const item of [
    finding('warning', 'w1'), finding('gap', 'g1'),
    finding('contradiction', 'x1'), finding('claim', 'c1'),
  ]) result = reconcile(result, item, `${label}-${item.findingKey}`)
  return result
}

function submitVersion(base: CommandResult, label: string): CommandResult {
  return call('real_editorial_library_submit_for_review', rpcCommand('submit_for_review', {
    versionId: base.versionId, revisionId: base.revisionId, expectedState: 'draft',
    expectedRevisionHash: base.revisionHash,
    expectedTraceabilityHash: base.traceabilityHash ?? traceHash(base),
    reason: 'Envio sintetico a revision.',
    actor: { ...actor, roleSnapshot: 'local_owner:submit' },
  }, label))
}

function submitVersionAsync(base: CommandResult, label: string) {
  const semantic = {
    versionId: base.versionId, revisionId: base.revisionId, expectedState: 'draft',
    expectedRevisionHash: base.revisionHash,
    expectedTraceabilityHash: base.traceabilityHash ?? traceHash(base),
    reason: 'Envio sintetico concurrente.',
    actor: { ...actor, roleSnapshot: 'local_owner:submit' },
  }
  return callAsync('real_editorial_library_submit_for_review',
    rpcCommand('submit_for_review', semantic, label))
}

function decideVersion(base: CommandResult, type: 'approve' | 'request_changes' | 'reject' | 'abandon',
  label: string, patch: Record<string, unknown> = {}): CommandResult {
  return call('real_editorial_library_decide_version', decisionCommand(base, type, label, patch))
}

function decideVersionAsync(base: CommandResult,
  type: 'approve' | 'request_changes' | 'reject' | 'abandon', label: string,
  patch: Record<string, unknown> = {}) {
  return callAsync('real_editorial_library_decide_version',
    decisionCommand(base, type, label, patch))
}

function decisionCommand(base: CommandResult,
  type: 'approve' | 'request_changes' | 'reject' | 'abandon', label: string,
  patch: Record<string, unknown>) {
  return rpcCommand('decide_version', {
    versionId: base.versionId, revisionId: base.revisionId, decisionType: type,
    expectedPreviousState: type === 'abandon' ? 'draft' : 'ready_for_review',
    expectedDecisionTargetHash: base.decisionTargetHash,
    reason: `Decision sintetica ${type}.`, affectedFindingKeys: [],
    changeInstructions: [], acceptedRiskFindingKeys: [],
    separationOfDutiesException: false, separationOfDutiesReason: null,
    actor: { ...actor, roleSnapshot: `local_owner:${type}` }, ...patch,
  }, label)
}

function prepareSubmitted(number: number, label: string): CommandResult {
  const entry = syntheticId('entry', number)
  return submitVersion(reconcileBaseline(
    createVersion(entry, originHash(entry), `entry-${number}`), `entry-${number}`,
  ), label)
}

function rpcCommand(operation: string, semantic: Record<string, unknown>, label: string) {
  return {
    ...semantic,
    operationKey: sha256Hex(label),
    requestFingerprint: libraryRequestFingerprint(operation, semantic),
    actorRoleSnapshot: (semantic.actor as typeof actor).roleSnapshot,
  }
}

function call(functionName: string, command: Record<string, unknown>): CommandResult {
  return JSON.parse(psql(
    `select public.${functionName}(${literalJson(command)})::text;`,
  )) as CommandResult
}

async function callAsync(functionName: string, command: Record<string, unknown>) {
  const output = await psqlAsync(
    `select public.${functionName}(${literalJson(command)})::text;`,
  )
  return JSON.parse(output) as CommandResult
}

function traceHash(result: CommandResult): string {
  return psql(`select public.real_editorial_library_traceability_hash(
    '${result.versionId}'::uuid,'${result.revisionId}'::uuid);`)
}

function decisionTarget(result: CommandResult): string {
  const trace = result.traceabilityHash ?? traceHash(result)
  return psql(`select public.real_editorial_library_decision_target_hash(
    '${result.versionHash}','${result.revisionHash}','${trace}');`)
}

function originHash(entryId: string): string {
  return psql(`select public.real_editorial_library_origin_hash(e)
    from public.real_editorial_library_entries e where e.id='${entryId}';`)
}

function originSnapshot(entryId: string): string {
  return psql(`select public.real_editorial_library_hash(to_jsonb(e))
    from public.real_editorial_library_entries e where e.id='${entryId}';`)
}

function count(table: string, predicate: string): number {
  return Number(psql(`select count(*) from public.${table} where ${predicate};`))
}

function expectFailure(action: () => unknown, code: string): void {
  try { action(); throw new Error(`${code} no fue rechazado`) }
  catch (error) { expect(sanitizedError(error)).toContain(code) }
}

function rejectionText(results: PromiseSettledResult<unknown>[]): string {
  return results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map(result => sanitizedError(result.reason)).join('\n')
}

function syntheticId(kind: string, number: number): string {
  const prefixes: Record<string, string> = {
    transfer: '81000000', entry: '82000000', pilot: '83000000', run: '84000000',
    snapshot: '85000000', adventure: '86000000', student: '87000000',
    review: '88000000', decision: '89000000', audit: '8a000000', geo: '8b000000',
  }
  return `${prefixes[kind]}-0000-4000-8000-${String(number).padStart(12, '0')}`
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

async function psqlAsync(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(dockerExecutable, [
    'exec', container, 'psql', '-U', 'postgres', '-d', database,
    '-AtX', '-v', 'ON_ERROR_STOP=1', '-c', sql,
  ], { encoding: 'utf8' })
  return stdout.trim()
}

function docker(args: string[], input?: string): string {
  return execFileSync(dockerExecutable, args, {
    encoding: 'utf8', input, stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : undefined,
  })
}

function dropDatabase(): void {
  docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database])
}

function sanitizedError(error: unknown): string {
  const value = error as { stderr?: string; message?: string }
  return String(value.stderr ?? value.message ?? error).replace(/[a-f0-9]{64}/gi, '[hash]')
}
