import { execFile, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RealEditorialLibraryVersionDraftApplicationService } from
  '@modules/library-versioning/draft-application-service'
import {
  prepareCreateLibraryVersionCommand,
  prepareSaveLibraryVersionRevisionCommand,
  RealEditorialLibraryVersioningService,
} from '@modules/library-versioning/repository'
import { sha256Hex } from '@modules/library-versioning/canonicalization'
import { SupabaseRealEditorialLibraryVersioningRepository } from
  '@modules/library-versioning/supabase-repository'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
  REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
} from '@shared/real-editorial-library-contracts'

const enabled = process.env.RUN_LIBRARY_VERSION_DRAFT_APPLICATION_INTEGRATION === '1'
const integrationDescribe = enabled ? describe : describe.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const database = 'investighost_library_versioning_bib_v04_test'
const execFileAsync = promisify(execFile)
const migrations = [
  'supabase/migrations/20260806120000_real_editorial_library_versioning.sql',
  'supabase/migrations/20260806230000_real_editorial_library_versioning_transactions.sql',
  'supabase/migrations/20260807120000_real_editorial_library_version_history_reads.sql',
  'supabase/migrations/20260807160000_real_editorial_library_draft_operation_receipts.sql',
]

let repository: SupabaseRealEditorialLibraryVersioningRepository
let application: RealEditorialLibraryVersionDraftApplicationService
let domain: RealEditorialLibraryVersioningService

integrationDescribe('BIB-V04 aplicación sobre PostgreSQL sintético aislado', () => {
  beforeAll(() => {
    createDatabase()
    for (const migration of migrations) applyMigration(migration)
    seedSyntheticEntries(10)
    repository = new SupabaseRealEditorialLibraryVersioningRepository(
      { rpc: postgresRpc } as unknown as SupabaseClient,
    )
    application = new RealEditorialLibraryVersionDraftApplicationService(
      repository, repository, repository, undefined, { info: () => undefined, warn: () => undefined },
    )
    domain = new RealEditorialLibraryVersioningService(repository)
  }, 30_000)

  afterAll(() => dropDatabase())

  it('instala el recibo restringido y crea v2 con read-after-write sin tocar v1', async () => {
    expect(psql(`select concat_ws('|',
      has_function_privilege('service_role',
        'public.real_editorial_library_draft_operation_receipt(text)','EXECUTE'),
      not has_function_privilege('anon',
        'public.real_editorial_library_draft_operation_receipt(text)','EXECUTE'),
      not has_function_privilege('authenticated',
        'public.real_editorial_library_draft_operation_receipt(text)','EXECUTE'),
      (select provolatile='s' from pg_proc where oid=
        'public.real_editorial_library_draft_operation_receipt(text)'::regprocedure)
    );`)).toBe('t|t|t|t')

    const entryId = syntheticId('entry', 1)
    const originBefore = originSnapshot(entryId)
    const result = await application.createDraft(createCommand(entryId, 'entry-1-create'))
    expect(result).toMatchObject({
      status: 'ok', operationReplayed: false,
      version: { versionNumber: 2, effectiveState: 'draft', revisionCount: 1 },
      currentRevision: { revisionNumber: 1 },
      stateSnapshot: { effectiveState: 'draft', transitions: [] },
      entrySummary: { derivedVersionCount: 1, publication: {
        publicationCount: 0, trawelConnected: false, automaticEnabled: false,
      } },
    })
    if (result.status !== 'ok') throw new Error('create BIB-V04 no confirmado')
    expect(psql(`select concat_ws('|',
      public.real_editorial_library_assert_valid_history('${result.version.versionId}'),
      (select count(*) from public.real_editorial_library_version_decisions
        where version_id='${result.version.versionId}'),
      (select publication_state from public.real_editorial_library_versions
        where id='${result.version.versionId}'))`)).toBe('|0|unpublished')
    expect(originSnapshot(entryId)).toBe(originBefore)
  }, 20_000)

  it('guarda múltiples revisiones completas con numeración, CAS y hashes válidos', async () => {
    const entryId = syntheticId('entry', 2)
    const originBefore = originSnapshot(entryId)
    const created = await application.createDraft(createCommand(entryId, 'entry-2-create'))
    if (created.status !== 'ok') throw new Error('fixture create falló')
    const save2 = await application.saveDraft(saveCommand(
      created.version.versionId, created.currentRevision.revisionHash, 'entry-2-save-2', 2,
    ))
    if (save2.status !== 'ok') throw new Error('fixture save2 falló')
    const save3 = await application.saveDraft(saveCommand(
      created.version.versionId, save2.savedRevision.revisionHash, 'entry-2-save-3', 3,
    ))
    expect(save3).toMatchObject({
      status: 'ok', savedRevision: {
        revisionNumber: 3, expectedPreviousRevisionHash: save2.savedRevision.revisionHash,
      },
      versionDetail: { version: { revisionCount: 3 }, decisions: [] },
      stateSnapshot: { effectiveState: 'draft', transitions: [] },
    })
    expect(psql(`select string_agg(revision_number::text || ':' || revision_hash,','
      order by revision_number) from public.real_editorial_library_version_revisions
      where version_id='${created.version.versionId}';`).split(',').map(value => value.slice(0, 2)))
      .toEqual(['1:', '2:', '3:'])
    expect(psql(`select public.real_editorial_library_assert_valid_history(
      '${created.version.versionId}');`)).toBe('')
    expect(count('real_editorial_library_version_decisions',
      `version_id='${created.version.versionId}'`)).toBe(0)
    expect(originSnapshot(entryId)).toBe(originBefore)
  }, 20_000)

  it('serializa dos creaciones y dos saves concurrentes con un único ganador', async () => {
    const entryId = syntheticId('entry', 3)
    const creations = await Promise.all([
      application.createDraft(createCommand(entryId, 'entry-3-create-a', 'Candidato A')),
      application.createDraft(createCommand(entryId, 'entry-3-create-b', 'Candidato B')),
    ])
    expect(creations.filter(result => result.status === 'ok')).toHaveLength(1)
    expect(creations.find(result => result.status === 'error')).toMatchObject({
      status: 'error', code: expect.stringMatching(/VERSION_ALREADY_OPEN|HASH_MISMATCH/),
    })
    const created = creations.find(result => result.status === 'ok')
    if (created?.status !== 'ok') throw new Error('no hubo ganador create')
    expect(count('real_editorial_library_versions', `library_entry_id='${entryId}'`)).toBe(1)

    const saves = await Promise.all([
      application.saveDraft(saveCommand(
        created.version.versionId, created.currentRevision.revisionHash, 'entry-3-save-a', 2,
      )),
      application.saveDraft(saveCommand(
        created.version.versionId, created.currentRevision.revisionHash, 'entry-3-save-b', 2,
      )),
    ])
    expect(saves.filter(result => result.status === 'ok')).toHaveLength(1)
    expect(saves.find(result => result.status === 'error')).toMatchObject({
      status: 'error', code: 'STALE_REVISION',
    })
    expect(count('real_editorial_library_version_revisions',
      `version_id='${created.version.versionId}'`)).toBe(2)
    expect(count('real_editorial_library_version_decisions',
      `version_id='${created.version.versionId}'`)).toBe(0)
  }, 20_000)

  it('resuelve retry idéntico, divergente y recuperación create/save tras respuesta perdida', async () => {
    const entry4 = syntheticId('entry', 4)
    const command = createCommand(entry4, 'entry-4-create')
    const first = await application.createDraft(command)
    const retry = await application.createDraft(command)
    expect(first).toMatchObject({ status: 'ok', operationReplayed: false })
    expect(retry).toMatchObject({ status: 'ok', operationReplayed: true })
    expect(await application.createDraft({ ...command, title: 'Payload divergente' }))
      .toMatchObject({ status: 'error', code: 'IDEMPOTENCY_CONFLICT' })
    expect(count('real_editorial_library_versions', `library_entry_id='${entry4}'`)).toBe(1)

    const entry5 = syntheticId('entry', 5)
    const lostCreateCommand = createCommand(entry5, 'entry-5-lost-create')
    const preparedCreate = await prepareCreateLibraryVersionCommand({
      libraryEntryId: lostCreateCommand.libraryEntryId,
      expectedHeadHash: lostCreateCommand.expectedHeadHash,
      canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
      contentSchemaContract: REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
      title: lostCreateCommand.title, content: lostCreateCommand.content,
      creationReason: lostCreateCommand.changeSummary,
      createdByActorId: lostCreateCommand.actorId,
      operationKey: lostCreateCommand.operationKey,
    })
    const lostCreate = await repository.createVersion(preparedCreate)
    if (lostCreate.status !== 'ok' || lostCreate.revisionHash === null) {
      throw new Error('create perdido no confirmado')
    }
    expect(await application.recoverOperationResult({
      operationKey: preparedCreate.operationKey, expectedOperation: 'create_draft',
      expectedRequestFingerprint: preparedCreate.requestFingerprint,
      actorId: MANUAL_LOCAL_ACTOR_ID,
    })).toMatchObject({ status: 'confirmed', recoveredOperation: 'create_draft' })

    const preparedSave = await prepareSaveLibraryVersionRevisionCommand({
      versionId: lostCreate.versionId, expectedState: 'draft',
      expectedPreviousRevisionHash: lostCreate.revisionHash,
      canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
      contentSchemaContract: REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
      title: 'Guardado perdido', content: 'Contenido perdido sintético.\n',
      changeSummary: 'Respuesta perdida sintética.', createdByActorId: MANUAL_LOCAL_ACTOR_ID,
      operationKey: sha256Hex('entry-5-lost-save'),
    })
    const lostSave = await repository.saveRevision(preparedSave)
    if (lostSave.status !== 'ok') throw new Error('save perdido no confirmado')
    expect(await application.recoverOperationResult({
      operationKey: preparedSave.operationKey, expectedOperation: 'save_draft',
      expectedRequestFingerprint: preparedSave.requestFingerprint,
      actorId: MANUAL_LOCAL_ACTOR_ID,
    })).toMatchObject({
      status: 'confirmed', recoveredOperation: 'save_draft',
      operationRevision: { revisionNumber: 2 },
    })
    expect(await application.recoverOperationResult({
      operationKey: sha256Hex('missing-operation'), expectedOperation: 'save_draft',
      expectedRequestFingerprint: sha256Hex('missing-fingerprint'),
      actorId: MANUAL_LOCAL_ACTOR_ID,
    })).toMatchObject({ status: 'not_found' })
  }, 25_000)

  it('rechaza save no draft y no añade submit ni decisiones desde la aplicación', async () => {
    const entryId = syntheticId('entry', 6)
    const created = await application.createDraft(createCommand(entryId, 'entry-6-create'))
    if (created.status !== 'ok') throw new Error('fixture create falló')
    const targetHash = psql(`select public.real_editorial_library_decision_target_hash(
      '${created.version.versionHash}','${created.currentRevision.revisionHash}',
      '${created.stateSnapshot.traceabilityHash}');`)
    const abandoned = await domain.decideVersion({
      versionId: created.version.versionId, revisionId: created.currentRevision.id,
      decisionType: 'abandon', expectedPreviousState: 'draft',
      expectedDecisionTargetHash: targetHash, reason: 'Abandono sintético de preparación.',
      actorId: MANUAL_LOCAL_ACTOR_ID, affectedFindingKeys: [], changeInstructions: [],
      acceptedRiskFindingKeys: [], separationOfDutiesException: false,
      separationOfDutiesReason: null, operationKey: sha256Hex('entry-6-abandon'),
    })
    expect(abandoned).toMatchObject({ status: 'ok', state: 'abandoned' })
    const decisionsBefore = count('real_editorial_library_version_decisions',
      `version_id='${created.version.versionId}'`)
    expect(await application.saveDraft(saveCommand(
      created.version.versionId, created.currentRevision.revisionHash, 'entry-6-save', 2,
    ))).toMatchObject({ status: 'error', code: 'INVALID_STATE_TRANSITION' })
    expect(count('real_editorial_library_version_decisions',
      `version_id='${created.version.versionId}'`)).toBe(decisionsBefore)
    expect(decisionsBefore).toBe(1)
  }, 20_000)

  it('hace rollback total ante fallo inducido y detecta historia corrupta al recuperar', async () => {
    psqlInput(`create function public.bib_v04_fail_revision_insert() returns trigger
      language plpgsql as $$ begin raise exception 'PERSISTENCE_ERROR: induced'; end $$;
      create trigger bib_v04_fail_revision_insert before insert
      on public.real_editorial_library_version_revisions for each row
      execute function public.bib_v04_fail_revision_insert();`)
    const entry7 = syntheticId('entry', 7)
    expect(await application.createDraft(createCommand(entry7, 'entry-7-rollback')))
      .toMatchObject({ status: 'error', code: 'PERSISTENCE_ERROR' })
    psqlInput(`drop trigger bib_v04_fail_revision_insert
      on public.real_editorial_library_version_revisions;
      drop function public.bib_v04_fail_revision_insert();`)
    expect(count('real_editorial_library_versions', `library_entry_id='${entry7}'`)).toBe(0)
    expect(count('real_editorial_library_version_revisions', 'true')).toBeGreaterThan(0)
    expect(await repository.getDraftOperationReceipt(sha256Hex('entry-7-rollback'))).toBeNull()

    const entry8 = syntheticId('entry', 8)
    const command = createCommand(entry8, 'entry-8-corrupt')
    const created = await application.createDraft(command)
    if (created.status !== 'ok') throw new Error('fixture corrupt falló')
    psqlInput(`set session_replication_role=replica;
      update public.real_editorial_library_version_revisions
      set content_hash='${'0'.repeat(64)}' where id='${created.currentRevision.id}';
      set session_replication_role=origin;`)
    expect(await application.recoverOperationResult({
      operationKey: created.receipt.operationKey, expectedOperation: 'create_draft',
      expectedRequestFingerprint: created.receipt.requestFingerprint,
      actorId: MANUAL_LOCAL_ACTOR_ID,
    })).toMatchObject({ status: 'error', code: 'HASH_MISMATCH' })
    expect(psql(`select concat_ws('|',
      (select count(*) from public.real_editorial_library_version_decisions),
      (select count(*) from public.real_editorial_library_versions
        where publication_state<>'unpublished'),
      (select count(*) from public.real_editorial_library_transfers
        where publication_count<>0 or trawel_connected or automatic_enabled)
    );`)).toBe('1|0|0')
  }, 20_000)
})

function createCommand(entryId: string, label: string, title = 'Borrador sintético') {
  return {
    libraryEntryId: entryId, expectedHeadHash: originHash(entryId), title,
    content: 'Contenido de borrador exclusivamente sintético.\n',
    changeSummary: 'Crear borrador sintético.', actorId: MANUAL_LOCAL_ACTOR_ID,
    operationKey: sha256Hex(label),
  }
}

function saveCommand(
  versionId: string,
  expectedPreviousRevisionHash: string,
  label: string,
  number: number,
) {
  return {
    versionId, expectedPreviousRevisionHash, title: `Borrador sintético ${number}`,
    content: `Contenido sintético revisión ${number}.\n`,
    changeSummary: `Guardar revisión sintética ${number}.`,
    actorId: MANUAL_LOCAL_ACTOR_ID, operationKey: sha256Hex(label),
  }
}

async function postgresRpc(
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<{ data: unknown; error: null | { message: string } }> {
  try {
    if (!/^real_editorial_library_[a-z_]+$/.test(functionName)) {
      throw new Error('RPC no permitido en el arnés')
    }
    const args = rpcArguments(parameters)
    const { stdout } = await execFileAsync(dockerExecutable, [
      'exec', container, 'psql', '-U', 'postgres', '-d', database,
      '-AtX', '-v', 'ON_ERROR_STOP=1', '-c',
      `select public.${functionName}(${args})::text;`,
    ], { encoding: 'utf8' })
    const value = stdout.trim()
    return { data: value === '' ? null : JSON.parse(value), error: null }
  } catch (error) {
    const processError = error as { stderr?: string; message?: string }
    return { data: null, error: { message: String(processError.stderr ?? processError.message) } }
  }
}

function rpcArguments(parameters: Record<string, unknown>): string {
  if ('p_command' in parameters) return literalJson(parameters.p_command)
  if ('p_operation_key' in parameters) return literalText(parameters.p_operation_key)
  if ('p_version_id' in parameters && 'p_revision_id' in parameters) {
    return `${literalUuid(parameters.p_version_id)},${parameters.p_revision_id === null
      ? 'null' : literalUuid(parameters.p_revision_id)}`
  }
  if ('p_version_id' in parameters) return literalUuid(parameters.p_version_id)
  if ('p_library_entry_id' in parameters) return literalUuid(parameters.p_library_entry_id)
  throw new Error('Parámetros RPC no soportados en el arnés')
}

function createDatabase(): void {
  dropDatabase()
  docker(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', database])
  const schema = docker([
    'exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres',
    '--schema-only', '--no-owner', '--no-privileges', '--schema=public',
  ])
  psql(`drop schema public cascade;
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;`)
  docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1'], schema)
}

function applyMigration(path: string): void {
  docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1'], readFileSync(path, 'utf8'))
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

function originHash(entryId: string): string {
  return psql(`select public.real_editorial_library_origin_hash(e)
    from public.real_editorial_library_entries e where e.id='${entryId}';`)
}

function originSnapshot(entryId: string): string {
  return psql(`select e::text from public.real_editorial_library_entries e
    where e.id='${entryId}';`)
}

function count(table: string, condition: string): number {
  return Number(psql(`select count(*) from public.${table} where ${condition};`))
}

function literalJson(value: unknown): string {
  return `${literalText(JSON.stringify(value))}::jsonb`
}

function literalText(value: unknown): string {
  return `'${String(value).replaceAll("'", "''")}'`
}

function literalUuid(value: unknown): string {
  return `${literalText(value)}::uuid`
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

function syntheticId(kind: string, number: number): string {
  const prefixes: Record<string, string> = {
    transfer: 'a1000000', entry: 'a2000000', pilot: 'a3000000', run: 'a4000000',
    snapshot: 'a5000000', adventure: 'a6000000', student: 'a7000000',
    review: 'a8000000', decision: 'a9000000', audit: 'aa000000', geo: 'ab000000',
  }
  return `${prefixes[kind]}-0000-4000-8000-${String(number).padStart(12, '0')}`
}
