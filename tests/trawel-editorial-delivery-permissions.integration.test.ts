import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const enabled = process.env.RUN_TRAWEL_DELIVERY_PERMISSIONS_INTEGRATION === '1'
const integrationDescribe = enabled ? describe : describe.skip
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const container = 'supabase_db_investighost'
const database = 'investighost_trawel_delivery_permissions_test'
const migrations = [
  'supabase/migrations/20260910120000_real_editorial_trawel_delivery_outbox.sql',
  'supabase/migrations/20260912090000_trawel_ingress_v2_contract.sql',
  'supabase/migrations/20260913090000_trawel_delivery_runtime_permissions.sql',
]
const deliveryId = 'a1000000-0000-4000-8000-000000000001'
const handoffKey = 'a'.repeat(64)
const fingerprint = 'b'.repeat(64)

integrationDescribe('Trawel delivery V2 permissions on isolated PostgreSQL', () => {
  beforeAll(() => {
    dropDatabase()
    docker(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', database])
    for (const migration of migrations) applyMigration(migration)
    psql(`insert into public.real_editorial_trawel_deliveries(
      id,protocol_schema,handoff_key,payload_fingerprint,source_mapping_id,
      canonical_destination_id,target_snapshot,payload,state
    ) values (
      '${deliveryId}','v2','${handoffKey}','${fingerprint}','test-albarracin-v2',
      'investighost:test:albarracin:v2','{}','{}','PENDING'
    );`)
  }, 30_000)

  afterAll(() => dropDatabase())

  it('allows the delivery snapshot read, RPC attempt start, direct attempt completion and attempt read', () => {
    expect(psqlAs('service_role', `select state from public.real_editorial_trawel_deliveries
      where id='${deliveryId}';`)).toBe('PENDING')
    expect(psqlAs('service_role', `select state from public.real_editorial_acquire_trawel_delivery(
      '${deliveryId}'::uuid,'delivery',now(),30000
    );`)).toBe('DELIVERING')
    const attemptId = psqlAs('service_role', `select id from public.real_editorial_start_trawel_delivery_attempt(
      '${deliveryId}'::uuid,'a2000000-0000-4000-8000-000000000001'::uuid,now()
    );`)
    expect(attemptId).toMatch(/^[a-f0-9-]{36}$/)
    expect(psqlAs('service_role', `update public.real_editorial_trawel_delivery_attempts
      set completed_at=now(),outcome='SUCCESS',remote_status_code='accepted',
          trawel_receipt_id='a3000000-0000-4000-8000-000000000001',error_code=null,error_summary=null
      where id='${attemptId}'::uuid and completed_at is null;`)).toBe('UPDATE 1')
    expect(psqlAs('service_role', `select attempt_number || '|' || outcome || '|' || remote_status_code
      from public.real_editorial_trawel_delivery_attempts where id='${attemptId}'::uuid;`))
      .toBe('1|SUCCESS|accepted')
  })

  it('keeps the outbox fail-closed for public API roles and grants no direct source access', () => {
    expect(psql(`select concat_ws('|',
      has_table_privilege('service_role','public.real_editorial_trawel_deliveries','SELECT'),
      has_table_privilege('service_role','public.real_editorial_trawel_delivery_attempts','SELECT'),
      has_table_privilege('service_role','public.real_editorial_trawel_delivery_attempts','UPDATE'),
      not has_table_privilege('service_role','public.real_editorial_trawel_delivery_sources','SELECT'),
      not has_table_privilege('anon','public.real_editorial_trawel_deliveries','SELECT'),
      not has_table_privilege('anon','public.real_editorial_trawel_delivery_attempts','UPDATE'),
      not has_table_privilege('authenticated','public.real_editorial_trawel_deliveries','SELECT'),
      not has_table_privilege('authenticated','public.real_editorial_trawel_delivery_attempts','UPDATE')
    );`)).toBe('t|t|t|t|t|t|t|t')
  })
})

function applyMigration(path: string): void {
  docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1'], readFileSync(path, 'utf8'))
}

function psql(sql: string): string {
  return docker(['exec', container, 'psql', '-U', 'postgres', '-d', database,
    '-AtX', '-v', 'ON_ERROR_STOP=1', '-c', sql]).trim()
}

function psqlAs(role: 'service_role', sql: string): string {
  return psql(`set role ${role}; ${sql}`).split(/\r?\n/).at(-1) ?? ''
}

function docker(args: string[], input?: string): string {
  return execFileSync(dockerExecutable, args, {
    encoding: 'utf8', input, stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : undefined,
  })
}

function dropDatabase(): void {
  docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database])
}
