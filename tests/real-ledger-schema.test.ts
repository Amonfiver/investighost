import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../supabase/migrations/20260725050000_real_provider_ledger.sql', import.meta.url),
  'utf8',
)

describe('schema durable del ledger real', () => {
  it('crea las siete superficies económicas sin alterar tablas humanas', () => {
    for (const table of [
      'provider_tariffs',
      'real_task_budgets',
      'real_batch_budgets',
      'real_daily_budgets',
      'real_execution_guard',
      'provider_call_reservations',
      'provider_calls',
    ]) {
      expect(migration).toContain(`create table public.${table}`)
    }
    expect(migration).not.toMatch(/drop table|truncate|delete from|alter table public\.editorial_/i)
  })

  it('incluye todos los campos mínimos de trazabilidad por llamada', () => {
    for (const field of [
      'request_id', 'run_id', 'task_id', 'stage', 'operation', 'provider_id', 'model', 'state',
      'attempt', 'retry_of_call_id', 'remote_id', 'input_tokens', 'output_tokens', 'tool_calls',
      'tools', 'credits', 'estimated_cost', 'reserved_cost', 'calculated_cost', 'currency',
      'tariff_id', 'sanitized_error', 'prompt_version', 'schema_version', 'input_hash', 'output_hash',
    ]) {
      expect(migration).toContain(field)
    }
  })

  it('protege ledger y tarifas como append-only', () => {
    expect(migration).toContain('create trigger provider_calls_append_only')
    expect(migration).toContain('create trigger provider_tariffs_append_only')
    expect(migration).toContain("raise exception 'REAL_LEDGER_APPEND_ONLY'")
  })

  it('reserva atómicamente y detiene tarea, lote y día en ese orden', () => {
    const task = migration.indexOf("raise exception 'REAL_TASK_BUDGET_EXCEEDED'")
    const batch = migration.indexOf("raise exception 'REAL_BATCH_BUDGET_EXCEEDED'")
    const daily = migration.indexOf("raise exception 'REAL_DAILY_BUDGET_EXCEEDED'")
    expect(task).toBeGreaterThan(0)
    expect(batch).toBeGreaterThan(task)
    expect(daily).toBeGreaterThan(batch)
    expect(migration).toContain('create or replace function public.reserve_provider_call')
    expect(migration).toContain('pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0))')
  })

  it('bloquea el reintento de timeout ambiguo y conserva su reserva', () => {
    expect(migration).toContain("if previous_state = 'unknown'")
    expect(migration).toContain("raise exception 'AMBIGUOUS_TIMEOUT_NOT_RETRYABLE'")
    expect(migration).toContain("if p_outcome = 'unknown' then")
  })

  it('limita acceso a service_role mediante funciones security definer', () => {
    expect(migration).toContain('security definer set search_path = public')
    expect(migration).toContain('revoke all on table public.%I from public,anon,authenticated')
    expect(migration).toContain('grant execute on function public.reserve_provider_call')
  })
})
