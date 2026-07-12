import path from 'node:path'
import { app } from 'electron'
import { SqliteContributionLocalRepository } from './sqlite-repository'
import { Sha256ContributionIntegrityService } from './integrity'
import { SafeContributionFileStore } from './file-store'
import { LocalContributionImportQueue } from './queue'
import { BoundedContributionRetryPolicy } from './retry-policy'
import { LocalContributionBackupService } from './backup'
import { MockContributionRemoteSource } from './mock-remote'
import { ContributionImportService } from './import-service'

let runtime: ContributionImportService | null = null

export function getContributionImportRuntime(): ContributionImportService {
  if (runtime) return runtime
  const root = path.join(app.getPath('userData'), 'contribution-import')
  const databasePath = path.join(root, 'investighost.db')
  const repository = new SqliteContributionLocalRepository(databasePath)
  const integrity = new Sha256ContributionIntegrityService()
  const files = new SafeContributionFileStore(path.join(root, 'files'), integrity)
  const source = new MockContributionRemoteSource([
    { remoteId: 'mock-sugerencia-valencia', content: 'Añadir información accesible sobre los Jardines del Turia.' },
    { remoteId: 'mock-reporte-morella', sourceType: 'report', content: 'Revisar el horario publicado del castillo.' },
  ], integrity)
  const backup = new LocalContributionBackupService(databasePath, files, path.join(root, 'backups'), repository, integrity, () => repository.checkpoint())
  runtime = new ContributionImportService(source, repository, files, integrity,
    new LocalContributionImportQueue(repository), new BoundedContributionRetryPolicy(), backup)
  return runtime
}
