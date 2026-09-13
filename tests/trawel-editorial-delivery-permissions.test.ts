import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migration = new URL(
  '../supabase/migrations/20260913090000_trawel_delivery_runtime_permissions.sql',
  import.meta.url,
)
const repository = new URL(
  '../src/modules/trawel-handoff/supabase-delivery-repository.ts',
  import.meta.url,
)

describe('Trawel delivery V2 runtime permissions', () => {
  it('grants only the direct REST operations used by the durable repository', async () => {
    const sql = await readFile(migration, 'utf8')
    const source = await readFile(repository, 'utf8')

    expect(source).toContain("from(TABLE).select('*').eq('id', id).maybeSingle()")
    expect(source).toContain("from(TABLE).select('*').eq('handoff_key', handoffKey).maybeSingle()")
    expect(source).toContain("from(TABLE).select('*').eq('state', state).order('next_attempt_at')")
    expect(source).toContain("from('real_editorial_trawel_delivery_attempts').update({")
    expect(source).toContain("from('real_editorial_trawel_delivery_attempts').select('*')")

    expect(sql).toContain('grant select on table public.real_editorial_trawel_deliveries to service_role;')
    expect(sql).toContain('grant select, update on table public.real_editorial_trawel_delivery_attempts to service_role;')
    expect(sql).not.toContain('real_editorial_trawel_delivery_sources to service_role')
    expect(sql).not.toMatch(/to\s+(?:anon|authenticated|public)\s*;/)
  })

  it('keeps mutations that create deliveries, sources, leases and attempts behind RPCs', async () => {
    const source = await readFile(repository, 'utf8')

    expect(source).toContain("rpc('real_editorial_enqueue_trawel_delivery_v2'")
    expect(source).toContain("rpc('real_editorial_acquire_trawel_delivery'")
    expect(source).toContain("rpc('real_editorial_start_trawel_delivery_attempt'")
    expect(source).toContain("rpc('real_editorial_transition_trawel_delivery'")
    expect(source).not.toContain("from(TABLE).insert(")
    expect(source).not.toContain("from(TABLE).update(")
    expect(source).not.toContain("from('real_editorial_trawel_delivery_attempts').insert(")
    expect(source).not.toContain("from('real_editorial_trawel_delivery_attempts').delete(")
  })
})
