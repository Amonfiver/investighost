import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ContributionImportStatusSchema } from '@shared/contracts'

const migration = readFileSync(new URL('../supabase/migrations/20260714090000_contributions_supabase_local.sql', import.meta.url), 'utf8')

describe('Supabase contribution schema', () => {
  it('version-controls all contribution tables and a private bucket', () => {
    for (const table of ['import_batches','contribution_import_jobs','imported_contributions','contribution_files','import_attempts','import_conflicts','local_backup_records']) {
      expect(migration).toContain(`create table public.${table}`)
    }
    expect(migration).toContain("'investighost-contributions','investighost-contributions',false")
    expect(migration).toContain('enable row level security')
  })
  it.each(['pending','downloading','verifying','imported','deleting_remote','completed','retry_pending','failed'])('accepts import state %s', status => {
    expect(ContributionImportStatusSchema.parse(status)).toBe(status)
  })
})

