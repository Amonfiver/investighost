import { describe, expect, it } from 'vitest'
import { parseLocalSupabaseConfig } from '@services/supabase/local-config'
import { readFileSync } from 'node:fs'
import { checkLocalSupabase } from '@services/supabase/local-client'
import type { SupabaseClient } from '@supabase/supabase-js'

const key = 'synthetic-local-service-role-key-only'
describe('local Supabase configuration', () => {
  it.each(['http://127.0.0.1:55321','http://localhost:55321'])('accepts local URL %s', url => {
    expect(parseLocalSupabaseConfig({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key }).url).toBe(url)
  })
  it.each(['https://example.supabase.co','https://trawel-prod.example'])('rejects remote URL %s', url => {
    expect(() => parseLocalSupabaseConfig({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key })).toThrow('Supabase debe ser local')
  })
  it('explains missing configuration', () => {
    expect(() => parseLocalSupabaseConfig({})).toThrow('SUPABASE_LOCAL_CONFIG_INVALID')
  })
  it('returns a controlled disconnected status', async () => {
    const failingClient = { from: () => ({ select: () => ({ limit: async () => ({ error: new Error('connection refused') }) }) }) } as unknown as SupabaseClient
    await expect(checkLocalSupabase(failingClient)).resolves.toMatchObject({ connected: false, error: expect.stringContaining('no está disponible') })
  })
  it('keeps the contribution runtime free of SQLite fallback', () => {
    const runtime = readFileSync(new URL('../src/modules/contributions/runtime.ts', import.meta.url), 'utf8')
    expect(runtime).not.toMatch(/sqlite|better-sqlite3/i)
  })
})
