import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const integrationEnabled = process.env.RUN_REAL_LEDGER_INTEGRATION === '1'
const integrationTest = integrationEnabled ? it : it.skip
const execFileAsync = promisify(execFile)
const dockerExecutable = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
const databaseContainer = 'supabase_db_investighost'
const isolatedDatabase = 'investighost_ledger_idempotency_10b_test'
const primaryTariff = '76000000-0000-4000-8000-000000000001'
const alternateTariff = '76000000-0000-4000-8000-000000000002'

interface ReservationSqlInput {
  key: string
  executionId?: string
  requestId?: string
  runId?: string
  taskId?: string
  batchId?: string
  budgetDate?: string
  stage?: string
  operation?: string
  providerId?: string
  model?: string
  attempt?: number
  retryOfCallId?: string
  estimatedCost?: string
  currency?: string
  tariffId?: string
  promptVersion?: string
  schemaVersion?: string
  inputHash?: string
}

describe('idempotencia durable de reservas reales en Supabase local', () => {
  integrationTest('rechaza conflictos secuenciales y concurrentes sin duplicar ledger o presupuesto', async () => {
    const humanBefore = mainDatabaseSnapshot()
    createIsolatedDatabase()

    try {
      setupSyntheticLedger()

      const first = psql(isolatedDatabase, reservationSql({ key: 'idempotency-main' }))
      const repeated = psql(isolatedDatabase, reservationSql({ key: 'idempotency-main' }))
      expect(repeated).toBe(first)

      for (const patch of [
        { providerId: 'provider-other' },
        { model: 'model-other' },
        { stage: 'analyzing_round_1' },
        { operation: 'extract' },
        { estimatedCost: '0.070000000' },
        { currency: 'USD', tariffId: alternateTariff },
        { requestId: 'request-other' },
        { runId: 'run-other' },
        { taskId: 'task-other' },
        { batchId: 'batch-other' },
        { attempt: 2 },
        { inputHash: 'c'.repeat(64) },
      ] satisfies Array<Partial<ReservationSqlInput>>) {
        expectIdempotencyConflict(reservationSql({ key: 'idempotency-main', ...patch }))
      }

      expect(psql(isolatedDatabase, `
        select concat_ws('|',count(*),min(provider_id),min(model),min(stage),min(operation),
          min(estimated_cost),min(reserved_cost),min(currency),min(tariff_id::text),
          min(request_id),min(run_id),min(task_id),min(batch_id),min(input_hash))
          from public.provider_call_reservations
         where idempotency_key = 'idempotency-main';
      `)).toBe(
        `1|synthetic|fixture|researching_round_1|search|0.080000000|0.080000000|EUR|`
        + `${primaryTariff}|integration-request|integration-run|integration-task|integration-batch|`
        + 'a'.repeat(64),
      )
      expect(psql(isolatedDatabase, budgetAndLedgerSql())).toBe('1|1|0.080000000')

      const identical = await Promise.all([
        psqlAsync(isolatedDatabase, reservationSql({ key: 'idempotency-concurrent-same' })),
        psqlAsync(isolatedDatabase, reservationSql({ key: 'idempotency-concurrent-same' })),
      ])
      expect(identical[0]).toBe(identical[1])

      const conflicting = await Promise.allSettled([
        psqlAsync(isolatedDatabase, reservationSql({
          key: 'idempotency-concurrent-conflict',
          providerId: 'synthetic',
        })),
        psqlAsync(isolatedDatabase, reservationSql({
          key: 'idempotency-concurrent-conflict',
          providerId: 'provider-other',
        })),
      ])
      const successful = conflicting.filter(result => result.status === 'fulfilled')
      const rejected = conflicting.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      )
      expect(successful).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(sanitizedStderr(rejected[0].reason)).toContain('IDEMPOTENCY_CONFLICT')
      expect(sanitizedStderr(rejected[0].reason)).not.toMatch(
        /integration-request|integration-run|provider-other|[a-f0-9]{64}/i,
      )

      expect(psql(isolatedDatabase, budgetAndLedgerSql())).toBe('3|3|0.240000000')
      expect(psql(isolatedDatabase, `
        select count(*) from public.provider_call_reservations
         where idempotency_key in (
           'idempotency-main',
           'idempotency-concurrent-same',
           'idempotency-concurrent-conflict'
         );
      `)).toBe('3')
    } finally {
      dropIsolatedDatabase()
    }

    expect(psql('postgres', `
      select count(*) from pg_database where datname = '${isolatedDatabase}';
    `)).toBe('0')
    expect(mainDatabaseSnapshot()).toBe(humanBefore)
  })
})

function createIsolatedDatabase(): void {
  dropIsolatedDatabase()
  docker(['exec', databaseContainer, 'createdb', '-U', 'postgres', '-T', 'template0', isolatedDatabase])
  const schema = docker([
    'exec',
    databaseContainer,
    'pg_dump',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '--schema-only',
    '--no-owner',
    '--no-privileges',
    '--schema=public',
  ])
  psql(isolatedDatabase, 'drop schema public cascade;')
  docker(
    ['exec', '-i', databaseContainer, 'psql', '-U', 'postgres', '-d', isolatedDatabase, '-v', 'ON_ERROR_STOP=1'],
    schema,
  )
}

function dropIsolatedDatabase(): void {
  docker([
    'exec',
    databaseContainer,
    'dropdb',
    '-U',
    'postgres',
    '--if-exists',
    '--force',
    isolatedDatabase,
  ])
}

function setupSyntheticLedger(): void {
  psql(isolatedDatabase, `
    insert into public.real_execution_guard (guard_name) values ('global');
    insert into public.provider_tariffs (
      id,provider_id,model,operation,version,currency,unit_scale,credit_unit_cost,
      effective_from,source_reference
    ) values
      ('${primaryTariff}','synthetic','fixture','search',1,'EUR',1,0.050000000,
       '2026-07-25T00:00:00Z','synthetic integration tariff'),
      ('${alternateTariff}','provider-other','model-other','extract',2,'USD',1,0.050000000,
       '2026-07-25T00:00:00Z','synthetic alternate tariff');
    insert into public.real_task_budgets (task_id,request_id,currency,limit_cost) values
      ('integration-task','integration-request','EUR',1.000000000),
      ('task-other','request-other','EUR',1.000000000);
    insert into public.real_batch_budgets (batch_id,currency,limit_cost) values
      ('integration-batch','EUR',2.000000000),
      ('batch-other','EUR',2.000000000);
    insert into public.real_daily_budgets (budget_date,currency,limit_cost) values
      ('2026-07-25','EUR',3.000000000),
      ('2026-07-25','USD',3.000000000);
    select public.acquire_real_execution_guard(
      'integration-execution',
      '76000000-0000-4000-8000-000000000003',
      now() + interval '10 minutes'
    );
  `)
}

function reservationSql(input: ReservationSqlInput): string {
  return `
    select public.reserve_provider_call(
      ${literal(input.key)},
      ${literal(input.executionId ?? 'integration-execution')},
      ${literal(input.requestId ?? 'integration-request')},
      ${literal(input.runId ?? 'integration-run')},
      ${literal(input.taskId ?? 'integration-task')},
      ${literal(input.batchId ?? 'integration-batch')},
      ${literal(input.budgetDate ?? '2026-07-25')}::date,
      ${literal(input.stage ?? 'researching_round_1')},
      ${literal(input.operation ?? 'search')},
      ${literal(input.providerId ?? 'synthetic')},
      ${literal(input.model ?? 'fixture')},
      ${input.attempt ?? 1},
      ${input.retryOfCallId ? `${literal(input.retryOfCallId)}::uuid` : 'null::uuid'},
      ${input.estimatedCost ?? '0.080000000'}::numeric,
      ${literal(input.currency ?? 'EUR')},
      ${literal(input.tariffId ?? primaryTariff)}::uuid,
      ${literal(input.promptVersion ?? 'mission-v1')},
      ${literal(input.schemaVersion ?? 'real-v1')},
      ${literal(input.inputHash ?? 'a'.repeat(64))}
    )::text;
  `
}

function budgetAndLedgerSql(): string {
  return `
    select concat_ws('|',
      (select count(*) from public.provider_call_reservations),
      (select count(*) from public.provider_calls),
      (select reserved_cost from public.real_task_budgets where task_id = 'integration-task')
    );
  `
}

function expectIdempotencyConflict(sql: string): void {
  try {
    psql(isolatedDatabase, sql)
    throw new Error('La colisión idempotente no fue rechazada')
  } catch (error) {
    const stderr = sanitizedStderr(error)
    expect(stderr).toContain('IDEMPOTENCY_CONFLICT')
    expect(stderr).not.toMatch(/request-other|run-other|provider-other|[a-f0-9]{64}/i)
  }
}

function mainDatabaseSnapshot(): string {
  return psql('postgres', `
    select concat_ws('|',
      (select count(*) from public.editorial_research_requests),
      (select count(*) from public.editorial_research_runs),
      (select count(*) from public.editorial_drafts),
      (select count(*) from public.research_events),
      (select count(*) from public.provider_calls),
      (select count(*) from public.provider_call_reservations),
      (select coalesce(sum(spent_cost),0) from public.real_task_budgets),
      (select coalesce(owner_execution_id,'') from public.real_execution_guard where guard_name='global')
    );
  `)
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function psql(database: string, sql: string): string {
  return docker([
    'exec',
    databaseContainer,
    'psql',
    '-U',
    'postgres',
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-At',
    '-c',
    sql,
  ]).trim()
}

async function psqlAsync(database: string, sql: string): Promise<string> {
  const { stdout } = await execFileAsync(dockerExecutable, [
    'exec',
    databaseContainer,
    'psql',
    '-U',
    'postgres',
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-At',
    '-c',
    sql,
  ], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  return stdout.trim()
}

function docker(args: string[], input?: string): string {
  return execFileSync(dockerExecutable, args, {
    encoding: 'utf8',
    input,
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

function sanitizedStderr(error: unknown): string {
  if (error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string') {
    return error.stderr
  }
  return error instanceof Error ? error.message : String(error)
}
