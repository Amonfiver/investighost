import { execFile, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  RealEditorialLibraryVersionComparisonService,
} from '@modules/library-versioning/comparison-service'
import {
  libraryRequestFingerprint,
  sha256Hex,
} from '@modules/library-versioning/canonicalization'
import { SupabaseRealEditorialLibraryVersioningRepository } from
  '@modules/library-versioning/supabase-repository'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import { LibraryVersionComparisonResultSchema } from
  '@shared/real-editorial-library-comparison-contracts'

const enabled = process.env.RUN_LIBRARY_VERSION_COMPARISON_INTEGRATION === '1'
const integrationDescribe = enabled ? describe : describe.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const database = 'investighost_library_versioning_bib_v05_test'
const execFileAsync = promisify(execFile)
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
}

let service: RealEditorialLibraryVersionComparisonService
let revision1: CommandResult
let revision2: CommandResult
const readRpcNames: string[] = []

integrationDescribe('BIB-V05 comparación sobre PostgreSQL sintético aislado', () => {
  beforeAll(() => {
    createDatabase()
    for (const migration of migrations) applyMigration(migration)
    seedSyntheticEntry()
    revision1 = createVersion()
    revision2 = saveRevision(revision1)
    const repository = new SupabaseRealEditorialLibraryVersioningRepository(
      { rpc: postgresRpc } as unknown as SupabaseClient,
    )
    service = new RealEditorialLibraryVersionComparisonService(repository)
  }, 30_000)

  afterAll(() => dropDatabase())

  it('lee v1, revisiones y padre real con resultado determinista', async () => {
    readRpcNames.length = 0
    const originToRevision = await service.compare({
      left: { kind: 'origin_v1', libraryEntryId: syntheticId('entry') },
      right: {
        kind: 'revision', versionId: revision2.versionId, revisionId: revision2.revisionId,
      },
    })
    expect(originToRevision).toMatchObject({ status: 'ok', comparison: {
      comparisonKind: 'origin_to_revision',
      left: { label: 'v1', lines: ['Inicio', 'Ruta base', 'Cierre'] },
      right: {
        label: 'v2/r2', lines: ['Inicio', 'Ruta revisada', 'Dato adicional', 'Cierre'],
      },
      statistics: {
        addedLines: 2, removedLines: 1, unchangedLines: 2, changedSegments: 2,
      },
    } })

    const explicitParent = await service.compare({
      left: {
        kind: 'revision', versionId: revision1.versionId, revisionId: revision1.revisionId,
      },
      right: {
        kind: 'revision', versionId: revision2.versionId, revisionId: revision2.revisionId,
      },
    })
    const resolvedParent = await service.compareToParent({
      revision: {
        kind: 'revision', versionId: revision2.versionId, revisionId: revision2.revisionId,
      },
    })
    expect(explicitParent).toEqual(resolvedParent)
    expect(resolvedParent).toMatchObject({ status: 'ok', comparison: {
      left: { label: 'v2/r1' }, right: { label: 'v2/r2' },
      statistics: { addedLines: 1, removedLines: 0, unchangedLines: 3 },
    } })
    expect(LibraryVersionComparisonResultSchema.parse(resolvedParent)).toEqual(resolvedParent)
    expect(readRpcNames.every(name => [
      'real_editorial_library_versioning_summary',
      'real_editorial_library_version_detail',
      'real_editorial_library_version_revision',
    ].includes(name))).toBe(true)
  }, 120_000)

  it('repite comparaciones sin modificar ninguna fila, relación, hash, estado o timestamp', async () => {
    const before = durableSnapshot()
    const countsBefore = durableCounts()
    const first = await service.compare({
      left: { kind: 'origin_v1', libraryEntryId: syntheticId('entry') },
      right: {
        kind: 'revision', versionId: revision2.versionId, revisionId: revision2.revisionId,
      },
    })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(await service.compare({
        left: { kind: 'origin_v1', libraryEntryId: syntheticId('entry') },
        right: {
          kind: 'revision', versionId: revision2.versionId, revisionId: revision2.revisionId,
        },
      })).toEqual(first)
      expect(await service.compareToParent({
        revision: {
          kind: 'revision', versionId: revision2.versionId, revisionId: revision2.revisionId,
        },
      })).toMatchObject({ status: 'ok' })
    }
    expect(durableCounts()).toBe(countsBefore)
    expect(countsBefore).toBe('1|2|8|0')
    expect(durableSnapshot()).toBe(before)
    expect(psql(`select concat_ws('|',
      (select count(*) from public.real_editorial_library_versions
        where publication_state<>'unpublished'),
      (select count(*) from public.real_editorial_library_transfers
        where publication_count<>0 or trawel_connected or automatic_enabled),
      (select count(*) from information_schema.columns
        where table_schema='public' and column_name like '%comparison%')
    );`)).toBe('0|0|0')
  }, 120_000)
})

async function postgresRpc(
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<{ data: unknown; error: null | { message: string } }> {
  try {
    if (!/^(?:real_editorial_library_versioning_summary|real_editorial_library_version_detail|real_editorial_library_version_revision)$/.test(functionName)) {
      throw new Error('RPC de comparación no permitido en el arnés')
    }
    readRpcNames.push(functionName)
    const { stdout } = await execFileAsync(dockerExecutable, [
      'exec', container, 'psql', '-U', 'postgres', '-d', database,
      '-AtX', '-v', 'ON_ERROR_STOP=1', '-c',
      `select public.${functionName}(${rpcArguments(parameters)})::text;`,
    ], { encoding: 'utf8' })
    const value = stdout.trim()
    return { data: value === '' ? null : JSON.parse(value), error: null }
  } catch (error) {
    const processError = error as { stderr?: string; message?: string }
    return { data: null, error: { message: String(processError.stderr ?? processError.message) } }
  }
}

function rpcArguments(parameters: Record<string, unknown>): string {
  if ('p_version_id' in parameters && 'p_revision_id' in parameters) {
    return `${literalUuid(parameters.p_version_id)},${literalUuid(parameters.p_revision_id)}`
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

function seedSyntheticEntry(): void {
  psqlInput(`set session_replication_role=replica;
    insert into public.real_editorial_library_transfers (
      id,transfer_key,pilot_id,run_id,snapshot_artifact_id,snapshot_hash,
      adventure_artifact_id,adventure_hash,student_artifact_id,student_hash,
      review_artifact_id,review_hash,terminal_decision_id,approval_actor_id,
      transfer_actor_id,resulting_state,final_run_cost,currency,provider_calls_performed,
      reservations_created,ledger_cost,publication_count,trawel_connected,
      automatic_enabled,audit_event_id
    ) values (
      '${syntheticId('transfer')}','${sha256Hex('bib-v05-transfer')}',
      '${syntheticId('pilot')}','${syntheticId('run')}',
      '${syntheticId('snapshot')}','${'1'.repeat(64)}',
      '${syntheticId('adventure')}','${'2'.repeat(64)}',
      '${syntheticId('student')}','${'3'.repeat(64)}',
      '${syntheticId('review')}','${'4'.repeat(64)}',
      '${syntheticId('decision')}','${MANUAL_LOCAL_ACTOR_ID}',
      '${MANUAL_LOCAL_ACTOR_ID}','ready_for_library',0,'EUR',0,0,0,0,false,false,
      '${syntheticId('audit')}'
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
      '${syntheticId('entry')}','${sha256Hex('bib-v05-entry')}',
      '${syntheticId('transfer')}','${syntheticId('pilot')}','${syntheticId('run')}',
      '${syntheticId('geo')}','Destino sintético BIB-V05','ES','locality','adventure',
      'Documento sintético',E'Inicio\\nRuta base\\nCierre\\n',1,'es-ES',
      'approved_unpublished','approved','ready_for_library','unpublished',
      'real_editorial_pilot','${syntheticId('adventure')}','draft_adventure','adventure',1,
      '${'2'.repeat(64)}','2026-08-08T10:00:00Z','${syntheticId('review')}',
      '${'4'.repeat(64)}',1,'2026-08-08T10:00:00Z','${syntheticId('decision')}',
      'passed_with_warnings','{}','[{"id":"w1","message":"Warning sintético"}]',
      '[{"id":"g1","description":"Gap sintético"}]',
      '[{"id":"x1","message":"Contradicción sintética"}]',
      '[{"id":"c1","statement":"Claim sintético"}]',
      '[{"id":"e1","content":"Evidencia sintética"}]',
      '[{"id":"s1","content":"Fuente sintética"}]',
      '${MANUAL_LOCAL_ACTOR_ID}','${MANUAL_LOCAL_ACTOR_ID}',0,'EUR',
      '2026-08-08T10:00:00Z'
    );
    set session_replication_role=origin;`)
}

function createVersion(): CommandResult {
  return call('real_editorial_library_create_version', rpcCommand('create_version', {
    libraryEntryId: syntheticId('entry'), expectedHeadHash: originHash(),
    canonicalizationContract: 'investighost-library-c14n-v1',
    contentSchemaContract: 'investighost-library-content-v1',
    title: 'Documento sintético revisado', content: 'Inicio\nRuta revisada\nCierre\n',
    creationReason: 'Crear revisión sintética para comparación.', actor,
  }, 'bib-v05-create'))
}

function saveRevision(base: CommandResult): CommandResult {
  return call('real_editorial_library_save_revision', rpcCommand('save_revision', {
    versionId: base.versionId, expectedState: 'draft',
    expectedPreviousRevisionHash: base.revisionHash,
    canonicalizationContract: 'investighost-library-c14n-v1',
    contentSchemaContract: 'investighost-library-content-v1',
    title: 'Documento sintético revisado',
    content: 'Inicio\nRuta revisada\nDato adicional\nCierre\n',
    changeSummary: 'Añadir un dato sintético.', actor,
  }, 'bib-v05-save'))
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
  const result = readJson(`public.${functionName}(${literalJson(command)})`) as CommandResult
  if (result.status !== 'ok') throw new Error(`Fixture sintético falló en ${functionName}`)
  return result
}

function originHash(): string {
  return psql(`select public.real_editorial_library_origin_hash(e)
    from public.real_editorial_library_entries e where e.id='${syntheticId('entry')}';`)
}

function durableCounts(): string {
  return psql(`select concat_ws('|',
    (select count(*) from public.real_editorial_library_versions),
    (select count(*) from public.real_editorial_library_version_revisions),
    (select count(*) from public.real_editorial_library_version_findings),
    (select count(*) from public.real_editorial_library_version_decisions));`)
}

function durableSnapshot(): string {
  return psql(`select jsonb_build_object(
    'transfers',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]')
      from public.real_editorial_library_transfers t),
    'entries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]')
      from public.real_editorial_library_entries e),
    'versions',(select coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]')
      from public.real_editorial_library_versions v),
    'revisions',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]')
      from public.real_editorial_library_version_revisions r),
    'findings',(select coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]')
      from public.real_editorial_library_version_findings f),
    'decisions',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]')
      from public.real_editorial_library_version_decisions d)
    )::text;`)
}

function readJson(expression: string): unknown {
  return JSON.parse(psql(`select ${expression}::text;`))
}

function literalJson(value: unknown): string {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`
}

function literalUuid(value: unknown): string {
  return `'${String(value).replaceAll("'", "''")}'::uuid`
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

function syntheticId(kind: string): string {
  const prefixes: Record<string, string> = {
    transfer: 'c1000000', entry: 'c2000000', pilot: 'c3000000', run: 'c4000000',
    snapshot: 'c5000000', adventure: 'c6000000', student: 'c7000000',
    review: 'c8000000', decision: 'c9000000', audit: 'ca000000', geo: 'cb000000',
  }
  return `${prefixes[kind]}-0000-4000-8000-000000000001`
}
