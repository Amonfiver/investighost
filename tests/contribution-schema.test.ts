import { describe, expect, it } from 'vitest'
import { getTableName } from 'drizzle-orm'
import {
  contributionFiles,
  contributionImportJobs,
  importAttempts,
  importBatches,
  importConflicts,
  importedContributions,
  localBackupRecords,
} from '@services/db/schema'
import { ContributionImportStatusSchema } from '@shared/contracts'

describe('local import schema', () => {
  it('declares all persistent tables required by phase 2B', () => {
    expect([
      importBatches, contributionImportJobs, importedContributions, contributionFiles,
      importAttempts, importConflicts, localBackupRecords,
    ].map(getTableName)).toEqual([
      'import_batches', 'contribution_import_jobs', 'imported_contributions', 'contribution_files',
      'import_attempts', 'import_conflicts', 'local_backup_records',
    ])
  })

  it.each(['pending', 'downloading', 'verifying', 'imported', 'deleting_remote', 'completed', 'retry_pending', 'failed'])('accepts import state %s', status => {
    expect(ContributionImportStatusSchema.parse(status)).toBe(status)
  })
})

